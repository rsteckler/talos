export interface AccentColorDef {
  label: string;
  /** CSS color for the swatch preview (any valid CSS color) */
  swatch: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}

export const ACCENT_COLORS: Record<string, AccentColorDef> = {
  cyan: {
    label: "Cyan",
    swatch: "hsl(183 74% 44%)",
    light: {
      "--primary": "183 74% 44%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "183 74% 44%",
      "--sidebar-primary": "183 74% 44%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "183 74% 44%",
    },
    dark: {
      "--primary": "183 74% 44%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "183 74% 44%",
      "--sidebar-primary": "183 74% 44%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "183 74% 44%",
    },
  },
  violet: {
    label: "Violet",
    swatch: "hsl(263 70% 58%)",
    light: {
      "--primary": "263 70% 50%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "263 70% 50%",
      "--sidebar-primary": "263 70% 50%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "263 70% 50%",
    },
    dark: {
      "--primary": "263 70% 58%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "263 70% 58%",
      "--sidebar-primary": "263 70% 58%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "263 70% 58%",
    },
  },
  amber: {
    label: "Amber",
    swatch: "hsl(38 92% 50%)",
    light: {
      "--primary": "38 92% 50%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "38 92% 50%",
      "--sidebar-primary": "38 92% 50%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "38 92% 50%",
    },
    dark: {
      "--primary": "38 92% 50%",
      "--primary-foreground": "0 0% 8%",
      "--ring": "38 92% 50%",
      "--sidebar-primary": "38 92% 50%",
      "--sidebar-primary-foreground": "0 0% 8%",
      "--sidebar-ring": "38 92% 50%",
    },
  },
  green: {
    label: "Green",
    swatch: "hsl(142 71% 45%)",
    light: {
      "--primary": "142 71% 40%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "142 71% 40%",
      "--sidebar-primary": "142 71% 40%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "142 71% 40%",
    },
    dark: {
      "--primary": "142 71% 45%",
      "--primary-foreground": "0 0% 8%",
      "--ring": "142 71% 45%",
      "--sidebar-primary": "142 71% 45%",
      "--sidebar-primary-foreground": "0 0% 8%",
      "--sidebar-ring": "142 71% 45%",
    },
  },
  rose: {
    label: "Rose",
    swatch: "hsl(347 77% 50%)",
    light: {
      "--primary": "347 77% 50%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "347 77% 50%",
      "--sidebar-primary": "347 77% 50%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "347 77% 50%",
    },
    dark: {
      "--primary": "347 77% 50%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "347 77% 50%",
      "--sidebar-primary": "347 77% 50%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "347 77% 50%",
    },
  },
  orange: {
    label: "Orange",
    swatch: "hsl(24 95% 53%)",
    light: {
      "--primary": "24 95% 53%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "24 95% 53%",
      "--sidebar-primary": "24 95% 53%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "24 95% 53%",
    },
    dark: {
      "--primary": "24 95% 53%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "24 95% 53%",
      "--sidebar-primary": "24 95% 53%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "24 95% 53%",
    },
  },
  blue: {
    label: "Blue",
    swatch: "hsl(217 91% 60%)",
    light: {
      "--primary": "217 91% 55%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "217 91% 55%",
      "--sidebar-primary": "217 91% 55%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "217 91% 55%",
    },
    dark: {
      "--primary": "217 91% 60%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "217 91% 60%",
      "--sidebar-primary": "217 91% 60%",
      "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-ring": "217 91% 60%",
    },
  },
};

/** All accent var names that get set on the root */
export const ACCENT_VAR_NAMES = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
];
