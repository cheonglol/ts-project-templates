// See eslint.config.mjs for plugin registration and usage
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct usage of process.env. Use ENV_VAR_KEYS array instead.",
      category: "Best Practices",
      recommended: true
    },
    messages: {
      noRawProcessEnv: "Direct usage of process.env. is banned. Use ENV_VAR_KEYS array for environment variable access."
    },
    schema: []
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === "MemberExpression" &&
          node.object.object.name === "process" &&
          node.object.property.name === "env"
        ) {
          // Allow process.env[EnvVarKeys.SOMETHING] but disallow process.env.SOMETHING or process.env["string"]
          if (
            node.property.type === "Identifier" ||
            (node.property.type === "Literal" && typeof node.property.value === "string")
          ) {
            context.report({
              node,
              messageId: "noRawProcessEnv"
            });
          }
          // If property.type is "MemberExpression", it's bracket notation like process.env[EnvVarKeys.PORT] - allow it
        }
      }
    };
  }
};
