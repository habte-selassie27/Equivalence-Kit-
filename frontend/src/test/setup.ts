import "@testing-library/jest-dom/vitest";

/**
 * localStorage for tests.
 *
 * Under vitest's jsdom environment, `window.localStorage` is undefined unless Node is
 * started with the experimental `--localstorage-file` flag. Real browsers always have
 * it, so provide a minimal in-memory Storage when it is missing. This keeps code paths
 * that persist preferences (the theme toggle) exercisable exactly as they run in
 * production. Individual tests still clear state between cases; the shim is shared, so
 * only the well-known keys are isolated.
 */
const storage = new Map<string, string>();
const inMemoryStorage: Storage = {
  get length(): number {
    return storage.size;
  },
  clear(): void {
    storage.clear();
  },
  getItem(key: string): string | null {
    return storage.has(key) ? (storage.get(key) as string) : null;
  },
  key(index: number): string | null {
    return Array.from(storage.keys())[index] ?? null;
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  setItem(key: string, value: string): void {
    storage.set(key, String(value));
  },
};

if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: inMemoryStorage,
    configurable: true,
  });
}
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: inMemoryStorage,
    configurable: true,
  });
}
