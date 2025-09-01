// See eslint.config.mjs for plugin registration and usage
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct usage of process.env. Use EnvVarKeys enum instead.",
      category: "Best Practices",
      recommended: true
    },
    messages: {
      noRawProcessEnv: "Direct usage of process.env. is banned. Use EnvVarKeys enum for environment variable access."
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
          // Only allow process.env[EnvVarKeys.X] style
          if (
            node.property.type === "Identifier" ||
            (node.property.type === "Literal" && typeof node.property.value === "string")
          ) {
            context.report({
              node,
              messageId: "noRawProcessEnv"
            });
          }
        }
      }
    };
  }
};
