/**
 * The Pyodide worker: runs the real `equivalencekit` package in the browser.
 *
 * Rules this file follows (UI.md section 13):
 *  - Pyodide runs in a Web Worker; the main thread never blocks.
 *  - The package is loaded from `public/pkg/`, which is built from the repo.
 *  - No network calls besides loading Pyodide and the package. No LLM calls.
 *  - Requests are size-capped and the run is time-limited by the main thread.
 */

import type {
  Request,
  Response,
  WorkerInit,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

const PYODIDE_VERSION = "0.26.2";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`;
// The package base is sent by the main thread, because a worker resolves relative URLs
// against its own asset path rather than the page.
let pkgBaseValue = "/pkg/";

type PyodideModule = {
  loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
  version: string;
};

interface Pyodide {
  version: string;
  FS: {
    writeFile(path: string, data: string): void;
    mkdirTree(path: string): void;
  };
  runPythonAsync(code: string): Promise<unknown>;
  loadFile(path: string): Promise<unknown>;
}

let pyodide: Pyodide | null = null;
let packageVersion = "unknown";

/**
 * Load Pyodide, then write the package source into the in-memory filesystem and import
 * it as a normal package. Importing the real package (rather than a copy) is the point:
 * the site must show what the contracts actually do.
 *
 * The package lives at a clean in-FS path: sys.path entries are Unix paths inside the
 * Pyodide filesystem, so the pkg URL the main thread sends is only used for fetching
 * the source files, never as an import path.
 */
const PKG_MOUNT = "/lib";

async function loadEngine(): Promise<void> {
  if (pyodide) return;

  const module = (await import(/* @vite-ignore */ PYODIDE_URL)) as PyodideModule;
  const instance = await module.loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
  });
  pyodide = instance;

  const manifestResponse = await fetch(`${pkgBaseValue}manifest.json`);
  if (!manifestResponse.ok) {
    throw new Error(`package manifest missing (${manifestResponse.status})`);
  }
  const manifest = (await manifestResponse.json()) as {
    package: string;
    version: string;
    files: string[];
  };

  const root = `${PKG_MOUNT}/${manifest.package}`;
  instance.FS.mkdirTree(root);
  for (const file of manifest.files) {
    const response = await fetch(`${pkgBaseValue}${manifest.package}/${file}`);
    if (!response.ok) {
      throw new Error(`package file missing: ${file}`);
    }
    instance.FS.writeFile(`${root}/${file}`, await response.text());
  }

  await instance.runPythonAsync(`
import sys
sys.path.insert(0, ${JSON.stringify(PKG_MOUNT)})
from equivalencekit.patterns import compare_pattern
from equivalencekit.perturb import harmless_variation, harmful_variation
from equivalencekit.normalize import normalize_text, normalize_enum, normalize_bool
from equivalencekit import __version__ as __ek_version__
`);
  packageVersion = manifest.version;
}

/**
 * Run one request. Errors are translated into the closed error classes from the package
 * registry; anything unexpected becomes ENGINE.
 */
async function run(request: Request): Promise<Response> {
  try {
    await loadEngine();
  } catch (error) {
    return {
      ok: false,
      errorClass: "ENGINE",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const runtime = pyodide as Pyodide;

  try {
    const raw = (await runtime.runPythonAsync(
      buildPython(request),
    )) as unknown;
    // The Python side returns JSON strings (the same `json.dumps` the contracts use);
    // parse here so callers receive structured results, never a bare string.
    const parsed =
      typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    return { ok: true, result: parsed, packageVersion };
  } catch (error) {
    return { ok: false, ...classifyError(error) };
  }
}

/**
 * Translate a Python exception into the package's error classes.
 *
 * The package raises `KitError` with a code like "LLM_ERROR: UNKNOWN_ENUM". Anything
 * else is an engine fault. Tracebacks never leave the worker: only the final exception
 * line survives, stripped of frames and boilerplate.
 */
function classifyError(error: unknown): {
  errorClass: "EXPECTED" | "EXTERNAL" | "TRANSIENT" | "LLM_ERROR" | "ENGINE";
  reason: string;
} {
  const text = error instanceof Error ? error.message : String(error);
  const match = /(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR):\s*([A-Z_]+)/.exec(text);
  if (match) {
    return {
      errorClass: match[1] as "EXPECTED" | "EXTERNAL" | "TRANSIENT" | "LLM_ERROR",
      reason: match[2] as string,
    };
  }
  return { errorClass: "ENGINE", reason: lastMeaningfulLine(text) };
}

/**
 * The last informative line of a traceback ("NameError: name 'x' is not defined"),
 * with frames and the "Traceback (most recent call last):" header removed.
 */
function lastMeaningfulLine(text: string): string {
  const lines = text
    .split("\n")
    .filter((part) => part.trim().length > 0)
    .filter((part) => !part.trim().startsWith("Traceback"))
    .filter((part) => !part.trim().startsWith('File "'))
    .filter((part) => !part.includes("runPythonAsync"))
    .map((part) => part.trim());
  return (lines.at(-1) ?? "unknown error").slice(0, 200);
}

/**
 * Build the Python source for a request. Values are passed as JSON so the Python side
 * parses them with its own JSON parser — the same parser the contracts use.
 */
function buildPython(request: Request): string {
  const json = (value: unknown) => JSON.stringify(value ?? null);
  // A Python string literal for a value: stringify twice so the outer layer carries
  // quotes and escaping. Used wherever a value is handed to json.loads in Python.
  const pystr = (value: unknown) => JSON.stringify(JSON.stringify(value ?? null));

  switch (request.kind) {
    case "compare":
      return `
import json as _json
_leader = _json.loads(${pystr(request.leader)})
_validator = _json.loads(${pystr(request.validator)})
_context = _json.loads(${pystr(request.context)})
_result = compare_pattern(${json(request.patternId)}, _leader, _validator, _context)
_json.dumps(_result)
`;
    case "perturb":
      return `
import json as _json
_leader = _json.loads(${pystr(request.leader)})
_fn = harmless_variation if ${json(request.mode)} == "harmless" else harmful_variation
_variant = _fn(${json(request.patternId)}, _leader, ${Number(request.seed) | 0})
_json.dumps(_variant)
`;
    case "normalize":
      return `
import json as _json
_value = _json.loads(${pystr(request.value)})
_fn = globals().get(${json(request.fn)})
if _fn is None:
    raise ValueError("unknown normalizer")
_json.dumps(_fn(_value))
`;
    case "listCases":
      return `
import json as _json
_json.dumps([])
`;
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest | WorkerInit>) => {
  const data = event.data;

  if ((data as WorkerInit).kind === "init") {
    const pkgBase = (data as WorkerInit).pkgBase;
    pkgBaseValue = pkgBase.endsWith("/") ? pkgBase : `${pkgBase}/`;
    return;
  }

  const { id, request } = data as WorkerRequest;
  const response = await run(request);
  const reply: WorkerResponse = { id, response };
  (self as unknown as Worker).postMessage(reply);
};
