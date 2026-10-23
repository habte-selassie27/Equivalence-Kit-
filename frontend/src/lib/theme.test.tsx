import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  effectiveTheme,
  getThemeSetting,
  nextThemeSetting,
  setThemeSetting,
  subscribeSystemTheme,
} from "./theme";
import { ThemeToggle } from "../components/ThemeToggle";

/** Isolate storage, attribute, and matchMedia between tests. */
beforeEach(() => {
  window.localStorage.removeItem("ek-theme");
  delete document.documentElement.dataset.theme;
  document.head
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.remove());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getThemeSetting", () => {
  it("defaults to auto on a clean profile", () => {
    expect(getThemeSetting()).toBe("auto");
  });

  it("reads a stored override and rejects corrupt values", () => {
    window.localStorage.setItem("ek-theme", "dark");
    expect(getThemeSetting()).toBe("dark");
    window.localStorage.setItem("ek-theme", "neon");
    expect(getThemeSetting()).toBe("auto");
  });
});

describe("setThemeSetting", () => {
  it("stores light and dark, removes for auto", () => {
    setThemeSetting("dark");
    expect(window.localStorage.getItem("ek-theme")).toBe("dark");
    setThemeSetting("light");
    expect(window.localStorage.getItem("ek-theme")).toBe("light");
    setThemeSetting("auto");
    expect(window.localStorage.getItem("ek-theme")).toBeNull();
  });
});

describe("applyTheme", () => {
  it("without matchMedia, auto resolves to light and stamps the attribute", () => {
    expect(applyTheme("auto")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("respects an explicit override and updates the theme-color meta", () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta name="theme-color" content="#eef2f0" />',
    );
    expect(applyTheme("dark")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    ).toBe("#0f1512");
  });

  it("with a dark system preference, auto resolves to dark", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    expect(effectiveTheme("auto")).toBe("dark");
    expect(applyTheme("auto")).toBe("dark");
  });
});

describe("subscribeSystemTheme", () => {
  it("returns a no-op cleanup where matchMedia is missing", () => {
    const cleanup = subscribeSystemTheme(() => undefined);
    expect(() => cleanup()).not.toThrow();
  });

  it("notifies when the OS preference changes", () => {
    let matches = false;
    vi.stubGlobal("matchMedia", (query: string) => {
      void query;
      return {
        get matches() {
          return matches;
        },
        addEventListener: (_: string, handler: () => void) => {
          systemListeners.push(handler);
        },
        removeEventListener: (_: string, handler: () => void) => {
          const index = systemListeners.indexOf(handler);
          if (index > -1) systemListeners.splice(index, 1);
        },
      };
    });
    const systemListeners: Array<() => void> = [];

    let notified = 0;
    const cleanup = subscribeSystemTheme(() => {
      notified += 1;
    });
    matches = true;
    systemListeners.forEach((listener) => listener());
    expect(notified).toBe(1);
    cleanup();
    matches = false;
    systemListeners.forEach((listener) => listener());
    expect(notified).toBe(1); // detached: no further notifications
  });
});

describe("nextThemeSetting", () => {
  it("cycles auto, light, dark, auto", () => {
    expect(nextThemeSetting("auto")).toBe("light");
    expect(nextThemeSetting("light")).toBe("dark");
    expect(nextThemeSetting("dark")).toBe("auto");
  });
});

describe("ThemeToggle", () => {
  it("renders the current setting as its label", () => {
    render(<ThemeToggle setting="dark" onCycle={() => undefined} />);
    const button = screen.getByRole("button", { name: /Color theme: Dark\./i });
    expect(button).toHaveTextContent("Dark");
  });

  it("cycles to the next setting on click", () => {
    const calls: Array<string> = [];
    render(<ThemeToggle setting="auto" onCycle={(next) => calls.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: /Color theme: Auto\./i }));
    expect(calls).toEqual(["light"]);
  });

  it("announces what the next activation will do", () => {
    render(<ThemeToggle setting="light" onCycle={() => undefined} />);
    expect(
      screen.getByRole("button", { name: /switch to Dark\./i }),
    ).toBeInTheDocument();
  });
});
