import type { ThemeFile } from "@talos/shared/types";
import { ACCENT_COLORS, ACCENT_VAR_NAMES } from "./accent-colors";

/** All CSS variable keys that a full theme sets */
const THEME_VAR_NAMES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--sidebar-background",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
];

export function applyCustomTheme(theme: ThemeFile, isDark: boolean): void {
  const root = document.documentElement;
  const colors = isDark ? theme.dark : theme.light;

  for (const varName of THEME_VAR_NAMES) {
    const key = varName.replace("--", "") as keyof typeof colors;
    const value = colors[key];
    if (value) {
      root.style.setProperty(varName, value);
    }
  }
}

export function clearCustomTheme(): void {
  const root = document.documentElement;
  for (const varName of THEME_VAR_NAMES) {
    root.style.removeProperty(varName);
  }
}

export function applyAccentColor(id: string, isDark: boolean): void {
  const accent = ACCENT_COLORS[id];
  if (!accent) return;

  const root = document.documentElement;
  const vars = isDark ? accent.dark : accent.light;

  for (const [varName, value] of Object.entries(vars)) {
    root.style.setProperty(varName, value);
  }
}

export function clearAccentColor(): void {
  const root = document.documentElement;
  for (const varName of ACCENT_VAR_NAMES) {
    root.style.removeProperty(varName);
  }
}
