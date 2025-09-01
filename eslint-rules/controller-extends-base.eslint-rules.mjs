export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Controller classes must extend BaseController or CrudController, or import BaseController for custom extensions',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    if (!filename.endsWith('.controller.ts')) {
      return {};
    }

    let hasBaseImport = false;

    return {
      ImportDeclaration(node) {
        if (node.source.value.includes('base-controller')) {
          hasBaseImport = true;
        }
      },
      ClassDeclaration(node) {
        if (!node.superClass) {
          if (!hasBaseImport) {
            context.report({
              node,
              message: 'Controller classes must extend BaseController, CrudController, or import BaseController for custom extensions',
            });
          }
          return;
        }

        const superClassName = node.superClass.name;
        if (!hasBaseImport && superClassName !== 'BaseController' && superClassName !== 'CrudController') {
          context.report({
            node: node.superClass,
            message: 'Controller classes must extend BaseController or CrudController, or import BaseController for custom extensions',
          });
        }
      },
    };
  },
};
