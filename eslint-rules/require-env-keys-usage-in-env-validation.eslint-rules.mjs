import fs from "fs";
import path from "path";
import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(() => "require-env-keys-usage");

function collectFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (/\.(js|ts|mjs|cjs)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

function createKeyRegexes(key) {
  return [
    new RegExp(`\\bEnvVarKeys\\.${key}\\b`),
    new RegExp(`process\\.env\\[\\s*EnvVarKeys\\.${key}\\s*\\]`),
    new RegExp(`process\\.env\\[\\s*['"\\"]${key}['"\\"]\\s*\\]`),
    new RegExp(`process\\.env\\.${key}\\b`),
  ];
}

function extractEnvVarKeys(varDecl) {
  const keys = [];
  const init = varDecl.declarations[0].init;

  if (!init || init.type !== "ArrayExpression") return keys;

  for (const element of init.elements) {
    if (!element || element.type !== "ObjectExpression") continue;

    let nameValue = null;
    for (const property of element.properties) {
      if (property.type !== "Property" || !property.key) continue;

      const keyName = property.key.type === "Identifier"
        ? property.key.name
        : (property.key.type === "Literal" ? String(property.key.value) : null);

      if (keyName === "name" && property.value.type === "Literal" && typeof property.value.value === "string") {
        nameValue = property.value.value;
      }
    }

    if (nameValue) {
      keys.push({ name: nameValue, node: element });
    }
  }

  return keys;
}

function extractRequiredMap(varDecl) {
  const requiredMap = new Map();
  const init = varDecl.declarations[0].init;

  if (!init || init.type !== "ArrayExpression") return requiredMap;

  for (const element of init.elements) {
    if (!element || element.type !== "ObjectExpression") continue;

    let nameValue = null;
    let requiredValue = null;

    for (const property of element.properties) {
      if (property.type !== "Property" || !property.key) continue;

      const keyName = property.key.type === "Identifier"
        ? property.key.name
        : (property.key.type === "Literal" ? String(property.key.value) : null);

      if (keyName === "name" && property.value.type === "Literal" && typeof property.value.value === "string") {
        nameValue = property.value.value;
      }
      if (keyName === "required" && property.value.type === "Literal" && typeof property.value.value === "boolean") {
        requiredValue = property.value.value;
      }
    }

    if (nameValue) {
      requiredMap.set(nameValue, Boolean(requiredValue));
    }
  }

  return requiredMap;
}

function parseVariableDeclaration(node) {
  if (node.type === "VariableDeclaration") return node;
  if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") {
    return node.declaration;
  }
  return null;
}

function findUsedKeys(keys, files, fileName) {
  const used = new Set();

  for (const file of files) {
    if (path.resolve(file) === path.resolve(fileName)) continue;

    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const key of keys) {
      if (used.has(key.name)) continue;

      const regexes = createKeyRegexes(key.name);
      if (regexes.some(regex => regex.test(text))) {
        used.add(key.name);
      }
    }
  }

  return used;
}

function createEnvValidationRule(ruleName, messageId, description, shouldReportKey) {
  return createRule({
    name: ruleName,
    meta: {
      type: ruleName.includes("optional") ? "suggestion" : "problem",
      docs: { description },
      schema: [],
      messages: {
        [messageId]: "{{key}} — ENV_VAR_KEYS member is defined in env-validation.module.ts but not referenced anywhere else.",
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
        const varDecl = parseVariableDeclaration(node);
        if (!varDecl) continue;

        const declName = varDecl.declarations[0]?.id?.name;

        if (declName === "APPLICATION_ENVIRONMENT_VARIABLES" || declName === "EnvVarKeys") {
          keys.push(...extractEnvVarKeys(varDecl));
        }

        if (declName === "ENV_VARS") {
          const extractedMap = extractRequiredMap(varDecl);
          for (const [key, value] of extractedMap) {
            requiredMap.set(key, value);
          }
        }
      }

      if (keys.length === 0) return {};

      const projectRoot = process.cwd();
      const files = collectFiles(projectRoot);
      const used = findUsedKeys(keys, files, fileName);

      return {
        "Program:exit"() {
          for (const key of keys) {
            const isRequired = requiredMap.has(key.name) ? requiredMap.get(key.name) : false;

            if (!used.has(key.name) && shouldReportKey(isRequired)) {
              context.report({
                node: key.node,
                messageId,
                data: { key: key.name }
              });
            }
          }
        },
      };
    },
  });
}

export default createEnvValidationRule(
  "require-env-keys-usage-in-env-validation",
  "unusedEnvVarKey",
  "Ensure ENV_VAR_KEYS members are referenced somewhere in the codebase",
  (isRequired) => isRequired // Only report required keys
);

export const requireEnvKeysUsageOptional = createEnvValidationRule(
  "require-env-keys-usage-optional",
  "optionalEnvVarKey",
  "Warn when optional ENV_VAR_KEYS members are not referenced elsewhere (non-fatal)",
  (isRequired) => !isRequired // Only report optional keys
);