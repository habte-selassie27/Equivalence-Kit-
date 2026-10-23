/**
 * Engine test: the real `equivalencekit` package running inside Pyodide.
 *
 * This proves two things the unit tests cannot:
 *  1. The package imports in Pyodide (it is pure Python and uses only stdlib modules
 *     Pyodide ships: `unicodedata`, `re`, `json`, `urllib.parse`).
 *  2. For every acceptance-matrix case, the result the engine produces equals the
 *     precomputed result stored in the site data.
 *
 * It runs the npm `pyodide` package in Node, which is the same wasm build the browser
 * worker loads from the CDN.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const pkgDir = join(repoRoot, "equivalencekit");

let pyodide: PyodideInterface;

async function installPackage(instance: PyodideInterface): Promise<void> {
  instance.FS.mkdirTree("/pkg/equivalencekit");
  const files = ["__init__.py", "errors.py", "bounds.py", "normalize.py", "compare.py", "parsing.py", "patterns.py", "perturb.py", "digest.py"];
  for (const file of files) {
    const source = readFileSync(join(pkgDir, file), "utf8");
    instance.FS.writeFile(`/pkg/equivalencekit/${file}`, source);
  }
  await instance.runPythonAsync(`
import sys
sys.path.insert(0, "/pkg")
from equivalencekit.patterns import compare_pattern
from equivalencekit.perturb import harmless_variation, harmful_variation
`);
}

/** Run one comparison in Python and return the parsed result. */
async function compare(
  patternId: string,
  leader: unknown,
  validator: unknown,
  context: unknown,
): Promise<{ ok: boolean; reason: string; fields: Array<{ name: string; ok: boolean; reason: string }> }> {
  const raw = (await pyodide.runPythonAsync(`
import json
_result = compare_pattern(
    ${JSON.stringify(patternId)},
    json.loads(${JSON.stringify(JSON.stringify(leader))}),
    json.loads(${JSON.stringify(JSON.stringify(validator))}),
    json.loads(${JSON.stringify(JSON.stringify(context))}),
)
json.dumps(_result)
`)) as unknown as string;
  return JSON.parse(raw);
}

/** Run a Python expression that returns JSON, and parse it. */
async function pythonJson(code: string): Promise<unknown> {
  const raw = (await pyodide.runPythonAsync(code)) as unknown as string;
  return JSON.parse(raw);
}

beforeAll(async () => {
  // The npm package resolves the wasm and stdlib next to itself, so point indexURL there.
  const require = createRequire(import.meta.url);
  const pyodideDir = dirname(require.resolve("pyodide/pyodide.mjs"));
  pyodide = await loadPyodide({ indexURL: pyodideDir });
  await installPackage(pyodide);
}, 120_000);

describe("Pyodide engine", () => {
  it("imports the package", async () => {
    const version = await pyodide.runPythonAsync(
      "import equivalencekit; equivalencekit.__version__",
    );
    expect(version).toBeTruthy();
  });

  it("uses unicodedata for text normalization", async () => {
    const result = await pythonJson(`
import json
from equivalencekit.normalize import normalize_text
json.dumps(normalize_text("  \\uff23\\uff41\\uff46\\u00e9   Text  "))
`);
    // NFKC folds the fullwidth characters; the accented letter stays accented.
    expect(result).toBe("café text");
  });

  for (const patternId of ["P1", "P2", "P3", "P4", "P5", "P6"]) {
    it(`matches the stored results for every ${patternId} matrix case`, async () => {
      const matrix = JSON.parse(
        readFileSync(join(repoRoot, "frontend", "src", "data", "matrices", `${patternId}.json`), "utf8"),
      ) as {
        cases: Array<{
          id: string;
          leader: unknown;
          validator: unknown;
          context: unknown;
          expected: "ACCEPT" | "REJECT";
          reasonCode: string;
        }>;
      };

      for (const testCase of matrix.cases) {
        const result = await compare(
          patternId,
          testCase.leader,
          testCase.validator,
          testCase.context,
        );
        expect(result.ok, `${testCase.id} verdict`).toBe(testCase.expected === "ACCEPT");
        expect(result.reason, `${testCase.id} reason`).toBe(testCase.reasonCode);
      }
    });
  }

  it("produces harmless and harmful perturbations with the expected verdicts", async () => {
    const canonical = JSON.parse(
      readFileSync(join(repoRoot, "frontend", "src", "data", "canonical.json"), "utf8"),
    ) as { patterns: Record<string, { output: unknown; context: unknown }> };

    for (const patternId of ["P1", "P2", "P3", "P4", "P5", "P6"]) {
      const entry = canonical.patterns[patternId];
      if (!entry) {
        throw new Error(`canonical output missing for ${patternId}`);
      }
      for (let seed = 0; seed < 10; seed += 1) {
        const harmless = await pythonJson(`
import json
json.dumps(harmless_variation(${JSON.stringify(patternId)}, json.loads(${JSON.stringify(JSON.stringify(entry.output))}), ${seed}))
`);
        const harmful = await pythonJson(`
import json
json.dumps(harmful_variation(${JSON.stringify(patternId)}, json.loads(${JSON.stringify(JSON.stringify(entry.output))}), ${seed}))
`);

        const harmlessResult = await compare(
          patternId,
          entry.output,
          harmless,
          entry.context,
        );
        const harmfulResult = await compare(
          patternId,
          entry.output,
          harmful,
          entry.context,
        );

        expect(harmlessResult.ok, `${patternId} harmless seed ${seed}`).toBe(true);
        expect(harmfulResult.ok, `${patternId} harmful seed ${seed}`).toBe(false);
      }
    }
  });
});
