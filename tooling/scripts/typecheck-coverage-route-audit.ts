import path from "node:path";
import ts from "typescript";

const disallowedRouteFactoryName = "createFileRoute";
const tanstackReactRouterModule = "@tanstack/react-router";

const normalizePath = (value: string) => value.replaceAll("\\", "/");

const stripTypeScriptModuleSuffix = (value: string) =>
  value.replace(/\.(?:ts|tsx|cts|mts)$/u, "");

const toPascalCase = (value: string) =>
  value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");

const fileExtensionToScriptKind = (relativePath: string) => {
  if (relativePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }

  return ts.ScriptKind.TS;
};

const resolveModuleSpecifierKey = (
  relativePath: string,
  moduleSpecifier: string,
) =>
  stripTypeScriptModuleSuffix(
    normalizePath(path.resolve(path.dirname(relativePath), moduleSpecifier)),
  );

const getAppLocalFileRouteModuleKey = (relativePath: string) => {
  const match = /^(apps\/[^/]+\/src)\/routes\/.+\.(?:ts|tsx)$/u.exec(
    normalizePath(relativePath),
  );

  if (match === null) {
    return undefined;
  }

  const appSourceDirectory = match[1];

  if (appSourceDirectory === undefined) {
    return undefined;
  }

  return stripTypeScriptModuleSuffix(
    normalizePath(path.resolve(appSourceDirectory, "file-route")),
  );
};

const getExpectedAppLocalFileRouteHelperExportName = (relativePath: string) => {
  const match = /^apps\/([^/]+)\/src\/routes\/.+\.(?:ts|tsx)$/u.exec(
    normalizePath(relativePath),
  );

  if (match === null) {
    return undefined;
  }

  const appName = match[1];

  if (appName === undefined) {
    return undefined;
  }

  return `create${toPascalCase(appName)}FileRoute`;
};

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let currentExpression = expression;

  while (true) {
    if (ts.isParenthesizedExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isAsExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isSatisfiesExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isNonNullExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    return currentExpression;
  }
};

const isCreateFileRoutePropertyName = (node: ts.PropertyName | undefined) => {
  if (node === undefined) {
    return false;
  }

  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
    return node.text === disallowedRouteFactoryName;
  }

  return false;
};

const addBoundNames = (name: ts.BindingName, names: Set<string>) => {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) {
      continue;
    }

    addBoundNames(element.name, names);
  }
};

const addDisallowedObjectBindingNames = (
  name: ts.BindingName,
  names: Set<string>,
) => {
  if (!ts.isObjectBindingPattern(name)) {
    return;
  }

  for (const element of name.elements) {
    const bindingPropertyName = element.propertyName;
    const implicitPropertyName = ts.isIdentifier(element.name)
      ? element.name
      : undefined;

    if (
      !isCreateFileRoutePropertyName(
        bindingPropertyName ?? implicitPropertyName,
      )
    ) {
      continue;
    }

    addBoundNames(element.name, names);
  }
};

const isDisallowedNamespaceAccess = (
  expression: ts.Expression,
  namespaceNames: ReadonlySet<string>,
) => {
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    namespaceNames.has(expression.expression.text)
  ) {
    return expression.name.text === disallowedRouteFactoryName;
  }

  if (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    namespaceNames.has(expression.expression.text) &&
    ts.isStringLiteral(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text === disallowedRouteFactoryName;
  }

  return false;
};

const collectTanstackRouteFactoryAliases = (sourceFile: ts.SourceFile) => {
  const disallowedCalleeNames = new Set<string>([disallowedRouteFactoryName]);
  const namespaceNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== tanstackReactRouterModule
    ) {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;

    if (namedBindings === undefined) {
      continue;
    }

    if (ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;

        if (importedName === disallowedRouteFactoryName) {
          disallowedCalleeNames.add(element.name.text);
        }
      }

      continue;
    }

    if (ts.isNamespaceImport(namedBindings)) {
      namespaceNames.add(namedBindings.name.text);
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      if (
        ts.isIdentifier(node.initializer) &&
        disallowedCalleeNames.has(node.initializer.text)
      ) {
        addBoundNames(node.name, disallowedCalleeNames);
      }

      if (
        ts.isIdentifier(node.initializer) &&
        namespaceNames.has(node.initializer.text)
      ) {
        addBoundNames(node.name, namespaceNames);
        addDisallowedObjectBindingNames(node.name, disallowedCalleeNames);
      }

      if (isDisallowedNamespaceAccess(node.initializer, namespaceNames)) {
        addBoundNames(node.name, disallowedCalleeNames);
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      if (
        ts.isIdentifier(node.right) &&
        disallowedCalleeNames.has(node.right.text)
      ) {
        disallowedCalleeNames.add(node.left.text);
      }

      if (ts.isIdentifier(node.right) && namespaceNames.has(node.right.text)) {
        namespaceNames.add(node.left.text);
      }

      if (isDisallowedNamespaceAccess(node.right, namespaceNames)) {
        disallowedCalleeNames.add(node.left.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    disallowedCalleeNames,
    namespaceNames,
  };
};

export const usesDisallowedCreateFileRouteCall = (
  contents: string,
  relativePath: string,
) => {
  const sourceFile = ts.createSourceFile(
    relativePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    fileExtensionToScriptKind(relativePath),
  );
  const { disallowedCalleeNames, namespaceNames } =
    collectTanstackRouteFactoryAliases(sourceFile);
  let hasDirectCall = false;

  const visit = (node: ts.Node) => {
    if (hasDirectCall) {
      return;
    }

    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        disallowedCalleeNames.has(node.expression.text)
      ) {
        hasDirectCall = true;
        return;
      }

      if (isDisallowedNamespaceAccess(node.expression, namespaceNames)) {
        hasDirectCall = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return hasDirectCall;
};

export const usesAppLocalTypedFileRouteHelperCall = (
  contents: string,
  relativePath: string,
) => {
  const expectedHelperModuleKey = getAppLocalFileRouteModuleKey(relativePath);
  const expectedHelperExportName =
    getExpectedAppLocalFileRouteHelperExportName(relativePath);

  if (
    expectedHelperModuleKey === undefined ||
    expectedHelperExportName === undefined
  ) {
    return false;
  }

  const sourceFile = ts.createSourceFile(
    relativePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    fileExtensionToScriptKind(relativePath),
  );
  const allowedHelperNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    if (
      resolveModuleSpecifierKey(
        relativePath,
        statement.moduleSpecifier.text,
      ) !== expectedHelperModuleKey
    ) {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;

    if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (importedName === expectedHelperExportName) {
        allowedHelperNames.add(element.name.text);
      }
    }
  }

  const routeDeclaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .find(
      (statement) =>
        statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) === true &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === "Route",
        ),
    )
    ?.declarationList.declarations.find(
      (declaration) =>
        ts.isIdentifier(declaration.name) && declaration.name.text === "Route",
    );

  if (routeDeclaration?.initializer === undefined) {
    return false;
  }

  const directRouteDefinitionCall = unwrapExpression(
    routeDeclaration.initializer,
  );

  if (!ts.isCallExpression(directRouteDefinitionCall)) {
    return false;
  }

  const routeFactoryCall = unwrapExpression(
    directRouteDefinitionCall.expression,
  );

  if (!ts.isCallExpression(routeFactoryCall)) {
    return false;
  }

  const routeFactoryCallee = unwrapExpression(routeFactoryCall.expression);

  return (
    ts.isIdentifier(routeFactoryCallee) &&
    allowedHelperNames.has(routeFactoryCallee.text)
  );
};
