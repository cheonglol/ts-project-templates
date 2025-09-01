import fs from "fs";
import path from "path";
import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(() => "require-env-keys-usage");

function collectFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (/\.(js|ts|mjs|cjs)$/i.test(e.name)) {
      results.push(full);
    }
  }
  return results;
}

// Reusable regex builder used by both rule variants
const keyRegexes = (key) => [
  new RegExp(`\\bEnvVarKeys\\.${key}\\b`),
  new RegExp(`process\\.env\\[\\s*EnvVarKeys\\.${key}\\s*\\]`),
  new RegExp(`process\\.env\\[\\s*['"\\"]${key}['"\\"]\\s*\\]`),
  new RegExp(`process\\.env\\.${key}\\b`),
];

export default createRule({
  name: "require-env-keys-usage-in-env-validation",
  meta: {
    type: "problem",
    docs: {
      description: "Ensure ENV_VAR_KEYS members are referenced somewhere in the codebase",
    },
    schema: [],
    messages: {
      unusedEnvVarKey: "{{key}} — ENV_VAR_KEYS member is defined in env-validation.module.ts but not referenced anywhere else.",
    },
  },
  defaultOptions: [],
  create(context) {
    const fileName = context.getFilename();
    if (!fileName.endsWith("env-validation.module.ts")) return {};

    // collect the ENV_VAR_KEYS from this file
    const source = context.getSourceCode();
    const ast = source.ast;
    const keys = [];
    const requiredMap = new Map();

    for (const node of ast.body) {
      // handle both plain VariableDeclaration and exported VariableDeclaration
      let varDecl = null;
      if (node.type === "VariableDeclaration") varDecl = node;
      else if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") varDecl = node.declaration;

      if (!varDecl) continue;

      const declName = varDecl.declarations[0]?.id?.name;
      // collect ENV_VAR_KEYS entries
      if (declName === "ENV_VAR_KEYS") {
        const init = varDecl.declarations[0].init;
        if (init && init.type === "TSAsExpression" && init.expression.type === "ArrayExpression") {
          for (const el of init.expression.elements) {
            if (el && el.type === "Literal" && typeof el.value === "string") keys.push({ name: el.value, node: el });
          }
        } else if (init && init.type === "ArrayExpression") {
          for (const el of init.elements) {
            if (el && el.type === "Literal" && typeof el.value === "string") keys.push({ name: el.value, node: el });
          }
        }
      }

      // collect required flags from ENV_VARS array (objects with { name: string, required: boolean })
      if (declName === "ENV_VARS") {
        const init = varDecl.declarations[0].init;
        if (init && init.type === "ArrayExpression") {
          for (const el of init.elements) {
            if (!el || el.type !== "ObjectExpression") continue;
            let nameVal = null;
            let requiredVal = null;
            for (const prop of el.properties) {
              if (prop.type !== "Property" || !prop.key) continue;
              const keyName = prop.key.type === "Identifier" ? prop.key.name : (prop.key.type === "Literal" ? String(prop.key.value) : null);
              if (!keyName) continue;
              if (keyName === "name" && prop.value.type === "Literal" && typeof prop.value.value === "string") {
                nameVal = prop.value.value;
              }
              if (keyName === "required" && prop.value.type === "Literal" && typeof prop.value.value === "boolean") {
                requiredVal = prop.value.value;
              }
            }
            if (nameVal) requiredMap.set(nameVal, Boolean(requiredVal));
          }
        }
      }
    }

    if (keys.length === 0) return {};

    // scan project files for usages of each key
    const projectRoot = process.cwd();
    const files = collectFiles(projectRoot);
    const used = new Set();

    const keyRegexes = (key) => [
      new RegExp(`\\bEnvVarKeys\\.${key}\\b`),
      new RegExp(`process\\.env\\[\\s*EnvVarKeys\\.${key}\\s*\\]`),
      new RegExp(`process\\.env\\[\\s*['"\\"]${key}['"\\"]\\s*\\]`),
      new RegExp(`process\\.env\\.${key}\\b`),
    ];

    for (const f of files) {
      if (path.resolve(f) === path.resolve(fileName)) continue; // skip the source file itself
      let text = "";
      try {
        text = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      for (const k of keys) {
        if (used.has(k.name)) continue;
        const regexes = keyRegexes(k.name);
        if (regexes.some((r) => r.test(text))) used.add(k.name);
      }
    }

    return {
      "Program:exit"() {
        for (const k of keys) {
          const isRequired = requiredMap.has(k.name) ? requiredMap.get(k.name) : false;
          if (!used.has(k.name) && isRequired) {
            // only report missing keys that are required; optional keys are skipped (cannot programmatically set ESLint severity per-report)
            context.report({ node: k.node, messageId: "unusedEnvVarKey", data: { key: k.name } });
          }
        }
      },
    };
  },
});

// Named export: same scan but report optional (required: false) keys so config can set it to "warn"
export const requireEnvKeysUsageOptional = createRule({
  name: "require-env-keys-usage-optional",
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when optional ENV_VAR_KEYS members are not referenced elsewhere (non-fatal)",
    },
    schema: [],
    messages: {
      optionalEnvVarKey: "{{key}} — Optional ENV_VAR_KEYS member is defined in env-validation.module.ts but not referenced anywhere else.",
    },
  },
  defaultOptions: [],
  create(context) {
    const fileName = context.getFilename();
    if (!fileName.endsWith("env-validation.module.ts")) return {};

    const source = context.getSourceCode();
    const ast = source.ast;
    const keys = [];
    const requiredMap = new Map();

    for (const node of ast.body) {
      let varDecl = null;
      if (node.type === "VariableDeclaration") varDecl = node;
      else if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") varDecl = node.declaration;

      if (!varDecl) continue;

      const declName = varDecl.declarations[0]?.id?.name;
      if (declName === "ENV_VAR_KEYS") {
        const init = varDecl.declarations[0].init;
        if (init && init.type === "TSAsExpression" && init.expression.type === "ArrayExpression") {
          for (const el of init.expression.elements) {
            if (el && el.type === "Literal" && typeof el.value === "string") keys.push({ name: el.value, node: el });
          }
        } else if (init && init.type === "ArrayExpression") {
          for (const el of init.elements) {
            if (el && el.type === "Literal" && typeof el.value === "string") keys.push({ name: el.value, node: el });
          }
        }
      }

      if (declName === "ENV_VARS") {
        const init = varDecl.declarations[0].init;
        if (init && init.type === "ArrayExpression") {
          for (const el of init.elements) {
            if (!el || el.type !== "ObjectExpression") continue;
            let nameVal = null;
            let requiredVal = null;
            for (const prop of el.properties) {
              if (prop.type !== "Property" || !prop.key) continue;
              const keyName = prop.key.type === "Identifier" ? prop.key.name : (prop.key.type === "Literal" ? String(prop.key.value) : null);
              if (!keyName) continue;
              if (keyName === "name" && prop.value.type === "Literal" && typeof prop.value.value === "string") {
                nameVal = prop.value.value;
              }
              if (keyName === "required" && prop.value.type === "Literal" && typeof prop.value.value === "boolean") {
                requiredVal = prop.value.value;
              }
            }
            if (nameVal) requiredMap.set(nameVal, Boolean(requiredVal));
          }
        }
      }
    }

    if (keys.length === 0) return {};

    const projectRoot = process.cwd();
    const files = collectFiles(projectRoot);
    const used = new Set();

    for (const f of files) {
      if (path.resolve(f) === path.resolve(fileName)) continue;
      let text = "";
      try {
        text = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      for (const k of keys) {
        if (used.has(k.name)) continue;
        const regexes = keyRegexes(k.name);
        if (regexes.some((r) => r.test(text))) used.add(k.name);
      }
    }

    return {
      "Program:exit"() {
        for (const k of keys) {
          const isRequired = requiredMap.has(k.name) ? requiredMap.get(k.name) : false;
          if (!used.has(k.name) && !isRequired) {
            // report only optional keys here; severity is controlled by eslint config
            context.report({ node: k.node, messageId: "optionalEnvVarKey", data: { key: k.name } });
          }
        }
      },
    };
  },
});