import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "website/**",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TS recommended rules for all TS files
  ...tseslint.configs.recommended,

  // Base rule tuning
  {
    rules: {
      "preserve-caught-error": "off",
    },
  },

  // TS rule tuning
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Vite config files (CJS globals like __dirname)
  {
    files: ["**/vite.config.{js,ts}"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
      },
    },
  },

  // React hooks rules for web app
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },

  // Relax rules in test files
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
