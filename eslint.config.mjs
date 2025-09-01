import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import noRawProcessEnv from "./eslint-rules/raw-process-env-usage.eslint-rules.mjs";
import requireEnvKeysUsage, { requireEnvKeysUsageOptional } from "./eslint-rules/require-env-keys-usage-in-env-validation.eslint-rules.mjs";
import controllerExtendsBase from "./eslint-rules/controller-extends-base.eslint-rules.mjs";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["dist/**"],
  },
  {
    plugins: {
      "no-raw-process-env": {
        rules: {
          "no-raw-process-env": noRawProcessEnv
        }
      },
      "require-env-keys-usage": {
        rules: {
          "require-env-keys-usage": requireEnvKeysUsage,
          "require-env-keys-usage-optional": requireEnvKeysUsageOptional
        }
      },
      "controller-extends-base": {
        rules: {
          "controller-extends-base": controllerExtendsBase
        }
      }
    }
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node, // Add Node.js globals
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      }
    },
    rules: {
      "no-raw-process-env/no-raw-process-env": "error",
      "require-env-keys-usage/require-env-keys-usage": "error",
      // optional missing ENV keys (required: false) reported as warnings
      "require-env-keys-usage/require-env-keys-usage-optional": "warn",
      "controller-extends-base/controller-extends-base": "error",
      // NOTE: Uncomment the following line if you want to enforce no-console
      // "no-console": "warn",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
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
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      // "@typescript-eslint/type-annotation-spacing": "error"
    }
  }
];