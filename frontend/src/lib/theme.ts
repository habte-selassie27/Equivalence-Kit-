/**
 * Manual theme override with persistence.
 *
 * The CSS has exactly one dark token block, applied to `[data-theme="dark"]` — there is
 * no duplicate media-query copy to drift out of step. This module decides which value
 * the attribute carries:
 *
 *   auto   follow `prefers-color-scheme` (the default; nothing is stored)
 *   light  force light
 *   dark   force dark
 *
 * Because the attribute is set before first paint by the inline bootstrap in
 * index.html, switching never flashes the wrong theme.
 */

export type ThemeSetting = "auto" | "light" | "dark";

const STORAGE_KEY = "ek-theme";
const SETTINGS: ThemeSetting[] = ["auto", "light", "dark"];

const THEME_COLORS: Record<"light" | "dark", string> = {
  light: "#eef2f0",
  dark: "#0f1512",
};

function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The stored setting, or "auto" when nothing (or something invalid) is stored. */
export function getThemeSetting(): ThemeSetting {
  const raw = safeStorage()?.getItem(STORAGE_KEY);
  return SETTINGS.includes(raw as ThemeSetting) ? (raw as ThemeSetting) : "auto";
}

/** Store a setting. "auto" removes the override so the OS preference rules again. */
export function setThemeSetting(value: ThemeSetting): void {
  const storage = safeStorage();
  if (!storage) return;
  if (value === "auto") {
    storage.removeItem(STORAGE_KEY);
  } else {
    storage.setItem(STORAGE_KEY, value);
  }
}

/** The OS-level preference. Falls back to "light" where matchMedia is missing. */
export function systemTheme(): "light" | "dark" {
  try {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {
    // fall through
  }
  return "light";
}

/** The theme actually in force: the override, or the system preference. */
export function effectiveTheme(setting: ThemeSetting): "light" | "dark" {
  return setting === "auto" ? systemTheme() : setting;
}

/**
 * Reflect the setting onto the document: the `data-theme` attribute (which selects the
 * token block) and the browser-chrome `theme-color` meta.
 */
export function applyTheme(setting: ThemeSetting): "light" | "dark" {
  const effective = effectiveTheme(setting);
  document.documentElement.dataset.theme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLORS[effective]);
  }
  return effective;
}

/** Next setting in the Auto → Light → Dark cycle. */
export function nextThemeSetting(current: ThemeSetting): ThemeSetting {
  const next = SETTINGS[(SETTINGS.indexOf(current) + 1) % SETTINGS.length];
  return next ?? "auto";
}

/**
 * Re-apply the current setting whenever the OS preference changes while in auto mode.
 * Returns a cleanup that detaches the listener. Missing matchMedia is fine: auto mode
 * then resolves to light statically.
 */
export function subscribeSystemTheme(onChange: () => void): () => void {
  try {
    if (typeof window.matchMedia !== "function") return () => undefined;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    if (typeof query.addListener === "function") {
      query.addListener(onChange);
      return () => query.removeListener(onChange);
    }
    return () => undefined;
  } catch {
    return () => undefined;
  }
}
