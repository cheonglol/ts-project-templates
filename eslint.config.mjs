import pluginJs from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import controllerExtendsBase from "./eslint-rules/base/controller-extends-base.eslint-rules.mjs";
import serviceExtendsBase from "./eslint-rules/base/service-extends-base.eslint-rules.mjs";
import repositoryExtendsBase from "./eslint-rules/base/repository-extends-base.eslint-rules.mjs";
import webhookControllerExtendsBase from "./eslint-rules/base/webhook-controller-extends-base.eslint-rules.mjs";
import websocketControllerExtendsBase from "./eslint-rules/base/websocket-controller-extends-base.eslint-rules.mjs";
import noRawProcessEnv from "./eslint-rules/raw-process-env-usage.eslint-rules.mjs";
import requireEnvKeysUsage, { requireEnvKeysUsageOptional } from "./eslint-rules/require-env-keys-usage-in-env-validation.eslint-rules.mjs";

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
      ,
      "service-extends-base": {
        rules: {
          "service-extends-base": serviceExtendsBase
        }
      },
      "repository-extends-base": {
        rules: {
          "repository-extends-base": repositoryExtendsBase
        }
      }
      ,
      "webhook-controller-extends-base": {
        rules: {
          "webhook-controller-extends-base": webhookControllerExtendsBase
        }
      }
      ,
      "websocket-controller-extends-base": {
        rules: {
          "websocket-controller-extends-base": websocketControllerExtendsBase
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
      "service-extends-base/service-extends-base": "warn",
      "repository-extends-base/repository-extends-base": "error",
      "webhook-controller-extends-base/webhook-controller-extends-base": "error",
      "websocket-controller-extends-base/websocket-controller-extends-base": "error",
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