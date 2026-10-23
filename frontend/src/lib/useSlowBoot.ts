import { useEffect, useState } from "react";

/**
 * The engine boot fetches about 13 MB of files from this site on the first visit
 * (pyodide.asm.wasm 9.7 MB, python_stdlib.zip 2.3 MB, pyodide.asm.js 1.2 MB, measured
 * 2026-10-23), so the first boot can take tens of seconds. "Loading the engine" alone
 * reads as stuck; after this delay the UI says what is actually happening. The engine
 * watchdog (BOOT_TIMEOUT_MS) decides the hard failure later — this hint never claims
 * failure.
 */
export function useSlowBoot(active: boolean, delayMs = 12_000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}
