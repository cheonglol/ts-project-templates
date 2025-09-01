import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(() => "require-env-keys-usage");

export default createRule({
  name: "require-env-keys-usage-in-env-validation",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure every EnvVarKeys member is referenced in ENV_VARS unless explicitly marked @notValidated",
    },
    schema: [],
    messages: {
      unusedKey: "EnvVarKey '{{key}}' is declared but never used in ENV_VARS.",
    },
  },
  defaultOptions: [],
  create(context) {
    const fileName = context.getFilename();
    if (!fileName.endsWith("env-validation.module.ts")) return {};

    return {
      TSEnumDeclaration(node) {
        if (node.id.name !== "EnvVarKeys") return;
        // Collect all enum members and their nodes
        const enumMembers = new Set();
        const enumMemberNodes = {};
        node.members.forEach((member) => {
          if (member.id.type === "Identifier") {
            enumMembers.add(member.id.name);
            enumMemberNodes[member.id.name] = member; // Use the whole member node for precise location
          }
        });

        // Find ENV_VARS usage in the file
        const source = context.getSourceCode();
        const ast = source.ast;
        const usedKeys = new Set();
        ast.body.forEach((bodyNode) => {
          if (
            bodyNode.type === "VariableDeclaration" &&
            bodyNode.declarations[0].id.name === "ENV_VARS"
          ) {
            const init = bodyNode.declarations[0].init;
            if (init && init.type === "ArrayExpression") {
              init.elements.forEach((el) => {
                if (el.type === "ObjectExpression") {
                  el.properties.forEach((p) => {
                    if (
                      p.type === "Property" &&
                      p.key.type === "Identifier" &&
                      p.key.name === "name" &&
                      p.value.type === "MemberExpression" &&
                      p.value.object.name === "EnvVarKeys"
                    ) {
                      const key = p.value.property.name;
                      usedKeys.add(key);
                    }
                  });
                }
              });
            }
          }
        });

        // Report missing keys at the enum member node
        enumMembers.forEach((key) => {
          if (!usedKeys.has(key)) {
            context.report({
              node: enumMemberNodes[key],
              message: `EnvVarKey '${key}' is not used in ENV_VARS array.`,
            });
          }
        });
      },
    };
  },
});