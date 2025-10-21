import fs from "fs";
import path from "path";

// See eslint.config.mjs for plugin registration and usage

function isProcessEnvAccess(node) {
  return (
    node.object.type === "MemberExpression" &&
    node.object.object &&
    node.object.object.name === "process" &&
    node.object.property &&
    node.object.property.name === "env"
  );
}

function isDirectPropertyAccess(property) {
  if (property.type === "Identifier") return true;
  if (property.type === "Literal" && typeof property.value === "string") return true;
  return false;
}

function tryResolveImport(importSource, contextFile) {
  const candidates = [];
  // direct specifier
  candidates.push(importSource);
  // relative to current file
  const base = path.dirname(contextFile);
  candidates.push(path.resolve(base, importSource));
  // common extensions
  for (const ext of ["", ".ts", ".js", ".mjs", ".cjs"]) {
    candidates.push(path.resolve(base, importSource + ext));
  }
  for (const c of candidates) {
    try {
      const resolved = require.resolve(c);
      return resolved;
    } catch (e) {
      console.log(`Failed to resolve ${c}: ${e.message}`);
      // continue
    }
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {
      console.log(`Failed to check existence of ${c}: ${e.message}`);
    }
  }
  return null;
}

function extractKeysFromSourceText(text) {
  const keys = new Set();

  // Try to find EnvVarKeys = { ... } or export const EnvVarKeys = { ... }
  const objMatch = text.match(/EnvVarKeys\s*(?:=|:)\s*{([\s\S]*?)}/m);
  if (objMatch) {
    const body = objMatch[1];
    const keyRe = /(?:["']?)([A-Z0-9_]+)(?:["']?)\s*:/gi;
    let km;
    while ((km = keyRe.exec(body))) keys.add(km[1]);
  }

  // Try to find APPLICATION_ENVIRONMENT_VARIABLES = [ ... ] and extract name: "FOO"
  // Match optional TypeScript annotation between the name and the '=' so we find the
  // array literal (e.g. `APPLICATION_ENVIRONMENT_VARIABLES: EnvironmentVariable[] = [ ... ]`).
  const arrMatch = text.match(/APPLICATION_ENVIRONMENT_VARIABLES(?:\s*:\s*[^=]+)?\s*=\s*\[([\s\S]*?)\]/m);
  if (arrMatch) {
    const arrBody = arrMatch[1];
    const nameRe = /name\s*:\s*["']([A-Z0-9_]+)["']/gi;
    let nm;
    while ((nm = nameRe.exec(arrBody))) keys.add(nm[1]);
  }

  return keys;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow direct usage of process.env. Use the EnvVarKeys mapping or bracket access (process.env[EnvVarKeys.KEY]) instead. Also warn when EnvVarKeys.KEY does not exist in the same file or in the imported EnvVarKeys module.",
      category: "Best Practices",
      recommended: true
    },
    messages: {
      noRawProcessEnv:
        "Direct usage of process.env is banned. Use EnvVarKeys or bracket notation (process.env[EnvVarKeys.KEY]) for environment access.",
      missingEnvVarKey:
        "EnvVarKeys.{{key}} does not exist in the available EnvVarKeys. Define it or import it from the correct module."
    },
    schema: []
  },
  create(context) {
    // keys declared in this file
    const envVarKeys = new Set();
    let envVarKeysDeclared = false;
    // if imported, store source specifier and parsed keys (if we can resolve/parse)
    let envVarKeysImported = false;
    let importSourceSpec = null;
    let envVarKeysFromImport = null;
    const contextFile = context.getFilename && context.getFilename();

    return {
      Program(node) {
        for (const stmt of node.body) {
          // import { EnvVarKeys } from '...'; or import EnvVarKeys from '...';
          if (stmt.type === "ImportDeclaration" && stmt.source && stmt.source.value) {
            for (const spec of stmt.specifiers) {
              if (spec.local && spec.local.name === "EnvVarKeys") {
                envVarKeysImported = true;
                importSourceSpec = stmt.source.value;
              }
            }
          }

          // export const EnvVarKeys = { ... } or const EnvVarKeys = { ... }
          if (stmt.type === "ExportNamedDeclaration" && stmt.declaration && stmt.declaration.type === "VariableDeclaration") {
            for (const decl of stmt.declaration.declarations) {
              if (decl.id && decl.id.name === "EnvVarKeys") {
                envVarKeysDeclared = true;
                if (decl.init && decl.init.type === "ObjectExpression") {
                  for (const prop of decl.init.properties) {
                    if (prop && prop.type === "Property") {
                      if (prop.key.type === "Identifier") envVarKeys.add(prop.key.name);
                      else if (prop.key.type === "Literal" && typeof prop.key.value === "string")
                        envVarKeys.add(prop.key.value);
                    }
                  }
                }
              }
            }
          }

          if (stmt.type === "VariableDeclaration") {
            for (const decl of stmt.declarations) {
              if (decl.id && decl.id.name === "EnvVarKeys") {
                envVarKeysDeclared = true;
                if (decl.init && decl.init.type === "ObjectExpression") {
                  for (const prop of decl.init.properties) {
                    if (prop && prop.type === "Property") {
                      if (prop.key.type === "Identifier") envVarKeys.add(prop.key.name);
                      else if (prop.key.type === "Literal" && typeof prop.key.value === "string")
                        envVarKeys.add(prop.key.value);
                    }
                  }
                }
              }
            }
          }

          // enums for TypeScript
          if (
            (stmt.type === "TSEnumDeclaration" || stmt.type === "EnumDeclaration") &&
            stmt.id &&
            stmt.id.name === "EnvVarKeys" &&
            Array.isArray(stmt.members)
          ) {
            envVarKeysDeclared = true;
            for (const m of stmt.members) {
              if (m.id) {
                if (m.id.type === "Identifier") envVarKeys.add(m.id.name);
                else if (m.id.type === "Literal" && typeof m.id.value === "string")
                  envVarKeys.add(m.id.value);
              }
            }
          }
        }

        // If EnvVarKeys was imported, try to resolve and read keys from the source file
        if (envVarKeysImported && importSourceSpec && !envVarKeysFromImport) {
          try {
            const resolved = tryResolveImport(importSourceSpec, contextFile || process.cwd());
            if (resolved) {
              const txt = fs.readFileSync(resolved, "utf8");
              const parsedKeys = extractKeysFromSourceText(txt);
              if (parsedKeys.size > 0) envVarKeysFromImport = parsedKeys;
            }
          } catch {
            // silent fail; can't validate imported keys
            envVarKeysFromImport = null;
          }
        }

        // If EnvVarKeys was declared in this file but not populated because it was
        // created programmatically (for example via APPLICATION_ENVIRONMENT_VARIABLES.reduce(...)),
        // try to extract keys from APPLICATION_ENVIRONMENT_VARIABLES in the same file.
        if (envVarKeysDeclared && envVarKeys.size === 0) {
          try {
            for (const stmt of node.body) {
              // handle: export const APPLICATION_ENVIRONMENT_VARIABLES = [ ... ] or const APPLICATION_ENVIRONMENT_VARIABLES = [ ... ]
              if (stmt.type === "VariableDeclaration") {
                for (const decl of stmt.declarations) {
                  if (decl.id && decl.id.name === "APPLICATION_ENVIRONMENT_VARIABLES" && decl.init && decl.init.type === "ArrayExpression") {
                    for (const element of decl.init.elements) {
                      if (!element || element.type !== "ObjectExpression") continue;
                      for (const prop of element.properties) {
                        if (!prop || prop.type !== "Property" || !prop.key) continue;
                        const keyName = prop.key.type === "Identifier" ? prop.key.name : (prop.key.type === "Literal" ? String(prop.key.value) : null);
                        if (keyName === "name" && prop.value && prop.value.type === "Literal" && typeof prop.value.value === "string") {
                          envVarKeys.add(prop.value.value);
                        }
                      }
                    }
                  }
                }
              }

              if (stmt.type === "ExportNamedDeclaration" && stmt.declaration && stmt.declaration.type === "VariableDeclaration") {
                for (const decl of stmt.declaration.declarations) {
                  if (decl.id && decl.id.name === "APPLICATION_ENVIRONMENT_VARIABLES" && decl.init && decl.init.type === "ArrayExpression") {
                    for (const element of decl.init.elements) {
                      if (!element || element.type !== "ObjectExpression") continue;
                      for (const prop of element.properties) {
                        if (!prop || prop.type !== "Property" || !prop.key) continue;
                        const keyName = prop.key.type === "Identifier" ? prop.key.name : (prop.key.type === "Literal" ? String(prop.key.value) : null);
                        if (keyName === "name" && prop.value && prop.value.type === "Literal" && typeof prop.value.value === "string") {
                          envVarKeys.add(prop.value.value);
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch {
            // best-effort; ignore failures
          }
        }
      },

      MemberExpression(node) {
        if (!isProcessEnvAccess(node)) return;

        // Disallow process.env.SOMETHING and process.env["string"]
        if (isDirectPropertyAccess(node.property)) {
          context.report({
            node,
            messageId: "noRawProcessEnv"
          });
          return;
        }

        // Expect bracket notation: process.env[ ... ]
        if (node.property && node.property.type === "MemberExpression") {
          const inner = node.property;
          if (inner.object && inner.object.type === "Identifier" && inner.object.name === "EnvVarKeys") {
            let keyName = null;
            if (inner.property.type === "Identifier") keyName = inner.property.name;
            else if (inner.property.type === "Literal" && typeof inner.property.value === "string")
              keyName = inner.property.value;

            if (keyName) {
              // Check declared keys first
              if (envVarKeysDeclared && !envVarKeysImported) {
                if (!envVarKeys.has(keyName)) {
                  context.report({
                    node: inner.property,
                    messageId: "missingEnvVarKey",
                    data: { key: keyName }
                  });
                }
                return;
              }

              // If imported, and we parsed keys from the imported file, validate against them
              if (envVarKeysImported) {
                if (envVarKeysFromImport) {
                  if (!envVarKeysFromImport.has(keyName)) {
                    context.report({
                      node: inner.property,
                      messageId: "missingEnvVarKey",
                      data: { key: keyName }
                    });
                  }
                  return;
                }
                // If we couldn't parse the imported file, we can't statically validate; don't report missing
              }
            }
          }
        }
      }
    };
  }
};
