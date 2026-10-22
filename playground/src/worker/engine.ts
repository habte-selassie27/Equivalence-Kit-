/**
 * Main-thread client for the Pyodide worker.
 *
 * Responsibilities:
 *  - spawn the worker and keep it alive for the session;
 *  - cap request size before sending;
 *  - enforce a run time limit by terminating and restarting the worker;
 *  - expose a status the shell can show ("Loading the engine", ready, failed).
 */

import type { Request, Response, WorkerInit, WorkerRequest, WorkerResponse } from "./protocol";

export const MAX_REQUEST_BYTES = 64 * 1024;
export const RUN_TIMEOUT_MS = 15_000;

export type EngineStatus = "idle" | "loading" | "ready" | "failed";

export class EngineError extends Error {
  readonly errorClass: "EXPECTED" | "EXTERNAL" | "TRANSIENT" | "LLM_ERROR" | "ENGINE";
  readonly reason: string;

  constructor(
    errorClass: "EXPECTED" | "EXTERNAL" | "TRANSIENT" | "LLM_ERROR" | "ENGINE",
    reason: string,
  ) {
    super(`${errorClass}: ${reason}`);
    this.errorClass = errorClass;
    this.reason = reason;
  }
}

export class EngineClient {
  private worker: Worker | null = null;
  private status: EngineStatus = "idle";
  private version = "unknown";
  private listeners = new Set<(status: EngineStatus, version: string) => void>();
  private pending = new Map<
    number,
    { resolve: (value: Response) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private counter = 0;

  onStatus(listener: (status: EngineStatus, version: string) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.version);
    return () => this.listeners.delete(listener);
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  getVersion(): string {
    return this.version;
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener(this.status, this.version);
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.setStatus("loading");
    const worker = new Worker(new URL("./pyodideWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleReply(event.data);
    };
    worker.onerror = () => {
      this.setStatus("failed");
    };
    this.worker = worker;

    // Tell the worker where the package assets live. A worker cannot derive this itself:
    // relative URLs there resolve against the worker's asset path, not the page.
    const pkgBase = new URL("pkg", document.baseURI).href;
    worker.postMessage({ kind: "init", pkgBase } satisfies WorkerInit);

    return worker;
  }

  private handleReply(message: WorkerResponse): void {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    if (message.response.ok) {
      this.version = message.response.packageVersion;
      this.setStatus("ready");
    } else if (this.status === "loading") {
      // A failed response while still booting means the engine is unusable this
      // session: the shell must show the precomputed state, not "loading" forever.
      this.setStatus("failed");
    }
    entry.resolve(message.response);
  }

  /**
   * Start the engine so the status line reflects reality before the first run.
   *
   * A trivial request is enough: the worker boots, imports the package, and the status
   * moves to "ready". Failures are swallowed — the playground falls back to the stored
   * results, and the status line says so.
   */
  async warmUp(): Promise<void> {
    try {
      await this.send({ kind: "listCases", patternId: "P1" });
    } catch {
      // The status line already reports the failure.
    }
  }

  /** Give the engine another chance after a failure or a timeout. */
  async retry(): Promise<void> {
    this.restart();
    await this.warmUp();
  }

  /** Send a request, enforcing the size cap and the run time limit. */
  async send(request: Request): Promise<unknown> {
    const payload = JSON.stringify(request);
    if (payload.length > MAX_REQUEST_BYTES) {
      throw new EngineError("EXPECTED", "OVER_LIMIT");
    }

    const worker = this.ensureWorker();
    const id = ++this.counter;

    const response = await new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.restart();
        reject(new EngineError("ENGINE", "TIMEOUT"));
      }, RUN_TIMEOUT_MS);

      this.pending.set(id, { resolve, timer });
      worker.postMessage({ id, request } satisfies WorkerRequest);
    });

    if (!response.ok) {
      throw new EngineError(response.errorClass, response.reason);
    }
    return response.result;
  }

  /** Terminate the worker so the next request starts a fresh one. */
  restart(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
    this.setStatus("idle");
  }

  dispose(): void {
    this.restart();
    this.listeners.clear();
  }
}

export const engine = new EngineClient();
