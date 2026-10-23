import { nextThemeSetting, type ThemeSetting } from "../lib/theme";
import type { MouseEvent } from "react";

/**
 * The header theme control: a tri-state cycle Auto → Light → Dark.
 *
 * The label names the current setting, so the control state never relies on an icon
 * alone; the accessible name also names the setting the next activation selects.
 */

const LABELS: Record<ThemeSetting, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle({
  setting,
  onCycle,
}: {
  setting: ThemeSetting;
  onCycle: (next: ThemeSetting) => void;
}) {
  const next = nextThemeSetting(setting);
  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onCycle(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={activate}
      title={`Theme: ${setting}. Activates ${next}.`}
      aria-label={`Color theme: ${LABELS[setting]}. Activate to switch to ${LABELS[next]}.`}
    >
      <span aria-hidden="true" className="theme-toggle-mark">
        {setting === "auto" ? "◐" : setting === "light" ? "☀" : "☾"}
      </span>
      {LABELS[setting]}
    </button>
  );
}
