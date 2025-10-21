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

function extractKeysFromEnvModule(modulePath) {
  try {
    const text = fs.readFileSync(modulePath, "utf8");
    // Narrow to the APPLICATION_ENVIRONMENT_VARIABLES array block to reduce false positives.
    // Match optional TypeScript annotation between the name and the '=' so we find the
    // actual array literal (e.g. 'APPLICATION_ENVIRONMENT_VARIABLES: EnvironmentVariable[] = [ ... ]').
    const arrMatch = text.match(/APPLICATION_ENVIRONMENT_VARIABLES(?:\s*:\s*[^=]+)?\s*=\s*\[([\s\S]*?)\]/m);
    if (!arrMatch) return [];
    const block = arrMatch[1];
    const regex = /name\s*:\s*["'`]([A-Z0-9_]+)["'`]/g;
    const keys = [];
    let m;
    while ((m = regex.exec(block)) !== null) {
      keys.push(m[1]);
    }
    return keys;
  } catch {
    return [];
  }
}

function extractRequiredMapFromEnvModule(modulePath) {
  try {
    const text = fs.readFileSync(modulePath, "utf8");
    const start = text.indexOf("APPLICATION_ENVIRONMENT_VARIABLES");
    if (start === -1) return new Map();
    const arrayStart = text.indexOf("[", start);
    const arrayEnd = text.indexOf("]", arrayStart);
    const block = text.slice(arrayStart, arrayEnd + 1);
    const regex = /\{([\s\S]*?)\}/g;
    const requiredMap = new Map();
    let m;
    while ((m = regex.exec(block)) !== null) {
      const item = m[1];
      const nameMatch = item.match(/name\s*:\s*["'`]([A-Z0-9_]+)["'`]/);
      if (!nameMatch) continue;
      const name = nameMatch[1];
      const reqMatch = item.match(/required\s*:\s*(true|false)/);
      const required = reqMatch ? reqMatch[1] === "true" : false;
      requiredMap.set(name, required);
    }
    return requiredMap;
  } catch {
    return new Map();
  }
}

function parseVariableDeclaration(node) {
  if (node.type === "VariableDeclaration") return node;
  if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") {
    return node.declaration;
  }
  return null;
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

      const regexes = [
        new RegExp(`\\bEnvVarKeys\\.${key.name}\\b`),
        new RegExp(`process\\.env\\[\\s*EnvVarKeys\\.${key.name}\\s*\\]`),
        new RegExp("process\\.env\\[\\s*['\"`]" + key.name + "['\"`]\\s*\\]"),
        new RegExp(`process\\.env\\.${key.name}\\b`),
      ];
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
        missingReference: "{{key}} — referenced here but not defined in env-validation.module.ts",
        envModuleMissing: "Could not find env-validation.module.ts at {{path}} — rule requires this file to validate env keys.",
      },
    },
    defaultOptions: [],
    create(context) {
      const fileName = context.getFilename();
      const shortName = path.basename(fileName || "");

      // If we're linting the env-validation module itself, keep the original behavior
      if (shortName.endsWith("env-validation.module.ts")) {
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
            // also collect required flags from the same APPLICATION_ENVIRONMENT_VARIABLES declaration
            if (declName === "APPLICATION_ENVIRONMENT_VARIABLES") {
              const extractedMap = extractRequiredMap(varDecl);
              for (const [key, value] of extractedMap) requiredMap.set(key, value);
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
      }

      // Otherwise: lint other files to ensure they don't reference undefined env keys
      // Attempt to read known env module to collect defined keys
      const envModulePath = path.join(process.cwd(), "src", "shared", "env-validation.module.ts");

      // If the module file cannot be found, report a lint error so the user notices
      if (!fs.existsSync(envModulePath)) {
        return {
          "Program:exit"() {
            context.report({
              node: context.getSourceCode().ast,
              messageId: "envModuleMissing",
              data: { path: envModulePath },
            });
          },
        };
      }

      const definedKeys = new Set(extractKeysFromEnvModule(envModulePath));
      // also load required map and include its keys to ensure keys defined with a `required` flag
      // (inside APPLICATION_ENVIRONMENT_VARIABLES) are recognized; this also prevents the
      // helper function from being flagged as unused.
      const requiredMap = extractRequiredMapFromEnvModule(envModulePath);
      for (const k of requiredMap.keys()) definedKeys.add(k);

      return {
        MemberExpression(node) {
          try {
            // process.env['KEY'] or process.env["KEY"] or process.env.KEY
            if (node.object && node.object.type === "MemberExpression") {
              const obj = node.object;
              if (obj.object && obj.object.type === "Identifier" && obj.object.name === "process" && obj.property && obj.property.type === "Identifier" && obj.property.name === "env") {
                // property can be Identifier (process.env.KEY) or Literal (process.env['KEY']) or MemberExpression (process.env[EnvVarKeys.KEY])
                if (node.property.type === "Literal" && typeof node.property.value === "string") {
                  const key = node.property.value;
                  if (!definedKeys.has(key)) {
                    context.report({ node: node.property, messageId: "missingReference", data: { key } });
                  }
                } else if (node.property.type === "Identifier") {
                  const key = node.property.name;
                  if (!definedKeys.has(key)) {
                    context.report({ node: node.property, messageId: "missingReference", data: { key } });
                  }
                } else if (node.property.type === "MemberExpression") {
                  // process.env[EnvVarKeys.KEY] -> extract KEY
                  const inner = node.property;
                  if (inner.object && inner.object.type === "Identifier" && inner.object.name === "EnvVarKeys" && inner.property && inner.property.type === "Identifier") {
                    const key = inner.property.name;
                    if (!definedKeys.has(key)) {
                      context.report({ node: inner.property, messageId: "missingReference", data: { key } });
                    }
                  }
                }
              }
            }

            // EnvVarKeys.KEY used directly
            if (node.object && node.object.type === "Identifier" && node.object.name === "EnvVarKeys") {
              if (node.property && node.property.type === "Identifier") {
                const key = node.property.name;
                if (!definedKeys.has(key)) {
                  context.report({ node: node.property, messageId: "missingReference", data: { key } });
                }
              } else if (node.property && node.property.type === "Literal" && typeof node.property.value === "string") {
                const key = node.property.value;
                if (!definedKeys.has(key)) {
                  context.report({ node: node.property, messageId: "missingReference", data: { key } });
                }
              }
            }
          } catch {
            // swallow parsing errors; rule is best-effort
          }
        },
      };
    },
  });
}

export default createEnvValidationRule(
  "require-env-keys-usage-in-env-validation",
  "unusedEnvVarKey",
  "Ensure ENV_VAR_KEYS members are referenced somewhere in the codebase and referenced keys exist",
  (isRequired) => isRequired // Only report required keys
);

export const requireEnvKeysUsageOptional = createEnvValidationRule(
  "require-env-keys-usage-optional",
  "optionalEnvVarKey",
  "Warn when optional ENV_VAR_KEYS members are not referenced elsewhere (non-fatal)",
  (isRequired) => !isRequired // Only report optional keys
);