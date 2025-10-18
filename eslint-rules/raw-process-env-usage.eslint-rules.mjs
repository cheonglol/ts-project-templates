// See eslint.config.mjs for plugin registration and usage

function isProcessEnvAccess(node) {
  return (
    node.object.type === "MemberExpression" &&
    node.object.object.name === "process" &&
    node.object.property.name === "env"
  );
}

function isDirectPropertyAccess(property) {
  if (property.type === "Identifier") return true;
  if (property.type === "Literal" && typeof property.value === "string") return true;
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct usage of process.env. Use the EnvVarKeys mapping or bracket access (process.env[EnvVarKeys.KEY]) instead.",
      category: "Best Practices",
      recommended: true
    },
    messages: {
      noRawProcessEnv: "Direct usage of process.env is banned. Use EnvVarKeys or bracket notation (process.env[EnvVarKeys.KEY]) for environment access."
    },
    schema: []
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (!isProcessEnvAccess(node)) return;

        // Allow process.env[EnvVarKeys.SOMETHING] but disallow process.env.SOMETHING or process.env["string"]
        if (isDirectPropertyAccess(node.property)) {
          context.report({
            node,
            messageId: "noRawProcessEnv"
          });
        }
        // If property.type is "MemberExpression", it's bracket notation like process.env[EnvVarKeys.PORT] - allow it
      }
    };
  }
};
