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
    // Only enforce on controller files
    if (!filename.endsWith('.controller.ts')) {
      return {};
    }

    // Track local names that map to BaseController/CrudController imports
    const allowedLocalNames = new Set();
    // Track namespace imports (e.g. import * as base from '...')
    const namespaceLocalNames = new Set();
    let hasBaseImport = false;

    // Helper to extract an identifier name from various AST node shapes
    function getIdentifierName(node) {
      if (!node) return null;
      switch (node.type) {
        case 'Identifier':
          return node.name;
        case 'MemberExpression': {
          // e.g. base.BaseController -> return "base.BaseController"
          const objectPart = getIdentifierName(node.object) || (node.object && node.object.name);
          const prop = node.property && (node.property.name || (node.property.value && String(node.property.value)));
          return objectPart && prop ? `${objectPart}.${prop}` : prop || objectPart || null;
        }
        case 'TSExpressionWithTypeArguments':
          // TypeScript generic `extends BaseController<T>` wraps expression
          return getIdentifierName(node.expression);
        case 'CallExpression':
          // e.g. SomeFactory(BaseController)
          return getIdentifierName(node.callee) || (node.callee && node.callee.name) || null;
        default:
          return null;
      }
    }

    return {
      ImportDeclaration(node) {
        // If import source mentions base controller folder/file, mark that we have a base import
        if (typeof node.source.value === 'string' && (node.source.value.includes('base-controller') || node.source.value.includes('/class/base') || node.source.value.includes('base/'))) {
          hasBaseImport = true;
        }

        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            const importedName = spec.imported && spec.imported.name;
            const localName = spec.local && spec.local.name;
            if (importedName === 'BaseController' || importedName === 'CrudController') {
              if (localName) allowedLocalNames.add(localName);
              hasBaseImport = true;
            }
          } else if (spec.type === 'ImportDefaultSpecifier') {
            // default import from a base-controller path -> treat as having imported base
            const localName = spec.local && spec.local.name;
            if (localName && typeof node.source.value === 'string' && (node.source.value.includes('base-controller') || node.source.value.includes('/class/base'))) {
              allowedLocalNames.add(localName);
              hasBaseImport = true;
            }
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            // import * as base from '...'
            const localName = spec.local && spec.local.name;
            if (localName) {
              namespaceLocalNames.add(localName);
              if (typeof node.source.value === 'string' && (node.source.value.includes('base-controller') || node.source.value.includes('/class/base'))) {
                hasBaseImport = true;
              }
            }
          }
        }
      },

      ClassDeclaration(node) {
        // If the class doesn't extend anything, require that the file imported the base controller
        if (!node.superClass) {
          if (!hasBaseImport) {
            context.report({
              node,
              message: 'Controller classes must extend BaseController or CrudController, or import BaseController for custom extensions',
            });
          }
          return;
        }

        const rawName = getIdentifierName(node.superClass);
        const superName = rawName ? String(rawName) : null;

        if (!superName) {
          // Unable to resolve - be conservative and report if no base import
          if (!hasBaseImport) {
            context.report({ node: node.superClass || node, message: 'Controller classes must extend BaseController or CrudController (unable to resolve superclass)', });
          }
          return;
        }

        // Accept cases: direct names or last identifier in a dotted name
        const lastPart = superName.includes('.') ? superName.split('.').pop() : superName;

        const allowedGlobals = new Set(['BaseController', 'CrudController']);

        const isAllowed = allowedGlobals.has(lastPart) || allowedLocalNames.has(lastPart) || allowedLocalNames.has(superName) || Array.from(namespaceLocalNames).some(ns => superName.startsWith(ns + '.'));

        if (!isAllowed && !hasBaseImport) {
          context.report({
            node: node.superClass,
            message: 'Controller classes must extend BaseController or CrudController, or import BaseController for custom extensions',
          });
        }
      },
    };
  },
};
