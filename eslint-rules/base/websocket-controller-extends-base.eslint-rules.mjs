export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Websocket controller classes must extend WebsocketController, BaseController, or import the base controllers for custom extensions',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    if (!filename.endsWith('.ws.controller.ts') && !filename.endsWith('.controller.ts')) return {};

    const allowedLocalNames = new Set();
    const namespaceLocalNames = new Set();
    let hasBaseImport = false;

    function getIdentifierName(node) {
      if (!node) return null;
      switch (node.type) {
        case 'Identifier':
          return node.name;
        case 'MemberExpression': {
          const objectPart = getIdentifierName(node.object) || (node.object && node.object.name);
          const prop = node.property && (node.property.name || (node.property.value && String(node.property.value)));
          return objectPart && prop ? `${objectPart}.${prop}` : prop || objectPart || null;
        }
        case 'TSExpressionWithTypeArguments':
          return getIdentifierName(node.expression);
        case 'CallExpression':
          return getIdentifierName(node.callee) || (node.callee && node.callee.name) || null;
        default:
          return null;
      }
    }

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === 'string' && (node.source.value.includes('base-controller') || node.source.value.includes('/class/base') || node.source.value.includes('base/'))) {
          hasBaseImport = true;
        }

        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            const importedName = spec.imported && spec.imported.name;
            const localName = spec.local && spec.local.name;
            if (importedName === 'WebsocketController' || importedName === 'BaseController') {
              if (localName) allowedLocalNames.add(localName);
              hasBaseImport = true;
            }
          } else if (spec.type === 'ImportDefaultSpecifier') {
            const localName = spec.local && spec.local.name;
            if (localName && typeof node.source.value === 'string' && (node.source.value.includes('base-controller') || node.source.value.includes('/class/base'))) {
              allowedLocalNames.add(localName);
              hasBaseImport = true;
            }
          } else if (spec.type === 'ImportNamespaceSpecifier') {
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
        if (!node.superClass) {
          if (!hasBaseImport) {
            context.report({ node, message: 'Websocket controller classes must extend WebsocketController or BaseController, or import the base controllers for custom extensions' });
          }
          return;
        }

        const rawName = getIdentifierName(node.superClass);
        const superName = rawName ? String(rawName) : null;
        if (!superName) {
          if (!hasBaseImport) context.report({ node: node.superClass || node, message: 'Websocket controller classes must extend WebsocketController or BaseController (unable to resolve superclass)' });
          return;
        }

        const lastPart = superName.includes('.') ? superName.split('.').pop() : superName;
        const allowedGlobals = new Set(['WebsocketController', 'BaseController', 'CrudController']);

        const isAllowed = allowedGlobals.has(lastPart) || allowedLocalNames.has(lastPart) || allowedLocalNames.has(superName) || Array.from(namespaceLocalNames).some(ns => superName.startsWith(ns + '.'));

        if (!isAllowed && !hasBaseImport) {
          context.report({ node: node.superClass, message: 'Websocket controller classes must extend WebsocketController or BaseController, or import the base controllers for custom extensions' });
        }
      },
    };
  },
};
