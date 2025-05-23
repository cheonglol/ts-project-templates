import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { 
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: { 
      globals: {
        ...globals.browser,
        ...globals.node,  // Add Node.js globals
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      }
    },
    rules: {
      // FIXME: Uncomment the following line if you want to enforce no-console
      // "no-console": "warn",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "prefer-const": "error",
      "semi": ["error", "always"],
      "no-duplicate-imports": "error"
    }
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TypeScript-specific rules
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off", // Keep it off as per existing config
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      // "@typescript-eslint/type-annotation-spacing": "error"
    }
  }
];