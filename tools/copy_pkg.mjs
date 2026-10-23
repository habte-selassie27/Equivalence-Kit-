#!/usr/bin/env node
/**
 * Copy the real `equivalencekit` package into the playground's static assets.
 *
 * The playground must run the same primitives the contracts run, so the browser loads the
 * package source directly rather than a re-implementation. The worker writes each file into
 * Pyodide's in-memory filesystem and imports it as a normal package.
 *
 * Run: node ../tools/copy_pkg.mjs   (wired to `npm run sync:pkg`)
 */

import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const sourceDir = join(repoRoot, "equivalencekit");
const targetDir = join(repoRoot, "frontend", "public", "pkg", "equivalencekit");
const pyodideSourceDir = join(repoRoot, "frontend", "node_modules", "pyodide");
const pyodideTargetDir = join(repoRoot, "frontend", "public", "pyodide");

/**
 * The Pyodide runtime is copied from the npm dependency instead of loaded from a CDN.
 * The site must boot on networks that block third-party hosts, and the assets are served
 * from the same origin as the page (and cached afterwards).
 */
const PYODIDE_FILES = [
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

async function main() {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".py"))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new Error(`no python files found in ${sourceDir}`);
  }

  await mkdir(targetDir, { recursive: true });
  for (const name of files) {
    await cp(join(sourceDir, name), join(targetDir, name));
  }

  const versionFile = await readFile(join(sourceDir, "__init__.py"), "utf8");
  const versionMatch = versionFile.match(/__version__\s*=\s*"([^"]+)"/);
  const version = versionMatch ? versionMatch[1] : "unknown";

  await writeFile(
    join(repoRoot, "frontend", "public", "pkg", "manifest.json"),
    `${JSON.stringify({ package: "equivalencekit", version, files }, null, 2)}\n`,
  );

  await mkdir(pyodideTargetDir, { recursive: true });
  for (const name of PYODIDE_FILES) {
    await cp(join(pyodideSourceDir, name), join(pyodideTargetDir, name));
  }

  console.log(`synced ${files.length} package files (version ${version}) to public/pkg/`);
  console.log(`synced ${PYODIDE_FILES.length} Pyodide files to public/pyodide/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
