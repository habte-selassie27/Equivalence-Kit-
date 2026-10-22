import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The dark scheme must redefine every theme-dependent token from UI.md's palette, and
 * must never invent a token the light scheme does not define (a typo there would
 * silently fall back to an undefined value). UI.md 3.3: a dark theme is optional, but
 * "if added, redefine every token and recheck contrast".
 */

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = resolve(here, "tokens.css");
const tokens = readFileSync(tokensPath, "utf8");

/** Token names from the light :root block. */
function propertiesIn(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/--([a-z][a-z0-9-]*)\s*:/g)) {
    names.add(match[1] as string);
  }
  return names;
}

const rootStart = tokens.indexOf(":root {");
const rootEnd = tokens.indexOf("\n}", rootStart);
const lightBlock =
  rootStart > -1 && rootEnd > -1 ? tokens.slice(rootStart, rootEnd) : "";

const darkStart = tokens.indexOf("/* DARK-TOKENS BEGIN */");
const darkEnd = tokens.indexOf("/* DARK-TOKENS END */");
const darkBlock =
  darkStart > -1 && darkEnd > -1 ? tokens.slice(darkStart, darkEnd) : "";

const light = propertiesIn(lightBlock);
const dark = propertiesIn(darkBlock);

describe("tokens.css dark scheme", () => {
  it("has a placeholder-free light root and exactly one dark block", () => {
    expect(lightBlock).toContain("--bench");
    expect(darkStart).toBeGreaterThan(-1);
    expect(darkEnd).toBeGreaterThan(darkStart);
  });

  it("redefines every theme-dependent token", () => {
    const themeDependent = [
      "bench",
      "sheet",
      "graphite",
      "calibre",
      "accept",
      "reject",
      "edge",
      "rule",
      "accept-tint",
      "reject-tint",
      "edge-tint",
      "calibre-tint",
      "graphite-muted",
      "rule-soft",
      "calibre-bg",
      "calibre-bg-hover",
      "hatch-color",
      "shadow-dialog",
    ];
    const missing = themeDependent.filter((name) => !dark.has(name));
    expect(missing).toEqual([]);
  });

  it("never defines a token the light scheme does not know", () => {
    const unknown = Array.from(dark).filter((name) => !light.has(name));
    expect(unknown).toEqual([]);
  });

  it("overrides color-scheme per enforced theme", () => {
    expect(darkBlock).toContain("color-scheme: dark");
    expect(tokens).toMatch(/data-theme="light"\]\s*\{\s*color-scheme: light/);
  });
});
