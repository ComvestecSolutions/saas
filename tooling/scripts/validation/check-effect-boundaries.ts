import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { collectRepoFiles, repoRootDirectory } from "./shared";

export const adminAppRouteFilePattern =
  /^apps\/admin-app\/src\/routes\/.+\.(?:ts|tsx)$/;
export const adminAppServerBoundaryFilePattern =
  /^apps\/admin-app\/src\/lib\/.+server\.(?:ts|tsx)$/;

const effectBoundaryFilePath = "apps/admin-app/src/lib/effect-boundary.ts";
const trustedEffectBoundaryFactoryNames = new Set([
  "decodeJsonOrUndefined",
  "decodeSchemaOrUndefined",
  "decodeSyncBoundary",
]);
const trustedEffectBoundaryFunctionNames = new Set(["decodeEmptyInput"]);
const allowedEffectSchemaDecodeMembers = new Set(["decodeUnknownEither"]);

export type EffectBoundaryViolation = {
  readonly filePath: string;
  readonly ruleId:
    | "admin-route-no-schema-validate-sync"
    | "admin-route-validate-search-reference"
    | "admin-route-validate-search-inline-input-type"
    | "admin-route-validate-search-inline-decode"
    | "admin-route-server-input-validator-reference"
    | "admin-route-server-input-validator-inline-input-type"
    | "admin-route-server-input-validator-inline-decode";
  readonly message: string;
};

type ImportBinding = {
  readonly moduleSpecifier: string;
  readonly importedName: string;
};

type LocalBinding = {
  readonly node: ts.Expression | ts.FunctionDeclaration;
  readonly exported: boolean;
};

type SourceContext = {
  readonly absolutePath: string;
  readonly filePath: string;
  readonly sourceFile: ts.SourceFile;
  readonly imports: ReadonlyMap<string, ImportBinding>;
  readonly localBindings: ReadonlyMap<string, LocalBinding>;
  readonly exportAliases: ReadonlyMap<string, string>;
};

type ResolvedBinding = {
  readonly name: string;
  readonly context: SourceContext;
  readonly node: ts.Expression | ts.FunctionDeclaration;
};

type BoundaryKind = "route" | "route-server";

const sourceContextCache = new Map<string, SourceContext>();

const createSourceFile = (filePath: string, sourceText: string) =>
  ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const normalizeRepoFilePath = (absolutePath: string) =>
  relative(repoRootDirectory, absolutePath).replace(/\\/g, "/");

const isEffectBoundaryContext = (context: SourceContext) =>
  context.filePath === effectBoundaryFilePath;

const isRelativeModuleSpecifier = (moduleSpecifier: string) =>
  moduleSpecifier.startsWith("./") || moduleSpecifier.startsWith("../");

const hasExportModifier = (node: ts.Node) =>
  (ts.canHaveModifiers(node)
    ? ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    : false) ?? false;

const isNamedProperty = (name: ts.PropertyName, expectedName: string) =>
  (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
  name.text === expectedName;

const isFunctionLikeNode = (
  node: ts.Node,
): node is
  | ts.ArrowFunction
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.MethodDeclaration =>
  ts.isArrowFunction(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isMethodDeclaration(node);

const isInputValidatorCall = (
  node: ts.Node,
): node is ts.CallExpression & {
  readonly expression: ts.PropertyAccessExpression;
} =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === "inputValidator";

const unwrapExpression = (expression: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(expression)
    ? unwrapExpression(expression.expression)
    : expression;

const unwrapValueExpression = (expression: ts.Expression): ts.Expression => {
  const unwrappedExpression = unwrapExpression(expression);

  if (
    ts.isAsExpression(unwrappedExpression) ||
    ts.isSatisfiesExpression(unwrappedExpression) ||
    ts.isNonNullExpression(unwrappedExpression) ||
    ts.isTypeAssertionExpression(unwrappedExpression)
  ) {
    return unwrapValueExpression(unwrappedExpression.expression);
  }

  return unwrappedExpression;
};

const isEffectSchemaDecodeUnknownAccess = (
  expression: ts.Expression,
  context: SourceContext,
) => {
  const unwrappedExpression = unwrapExpression(expression);

  if (!ts.isPropertyAccessExpression(unwrappedExpression)) {
    return false;
  }

  if (!allowedEffectSchemaDecodeMembers.has(unwrappedExpression.name.text)) {
    return false;
  }

  const receiver = unwrapExpression(unwrappedExpression.expression);

  if (!ts.isIdentifier(receiver)) {
    return false;
  }

  const importBinding = context.imports.get(receiver.text);

  return (
    importBinding?.moduleSpecifier === "effect" &&
    importBinding.importedName === "Schema"
  );
};

const resolveModuleAbsolutePath = (
  fromAbsolutePath: string,
  moduleSpecifier: string,
) => {
  if (!isRelativeModuleSpecifier(moduleSpecifier)) {
    return undefined;
  }

  const basePath = resolve(dirname(fromAbsolutePath), moduleSpecifier);
  const candidatePaths = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    resolve(basePath, "index.ts"),
    resolve(basePath, "index.tsx"),
  ];

  return candidatePaths.find((candidatePath) => existsSync(candidatePath));
};

const createSourceContext = (
  filePath: string,
  absolutePath: string,
  sourceText: string,
): SourceContext => {
  const sourceFile = createSourceFile(filePath, sourceText);
  const imports = new Map<string, ImportBinding>();
  const localBindings = new Map<string, LocalBinding>();
  const exportAliases = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleSpecifier = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;

      if (moduleSpecifier === undefined) {
        continue;
      }

      const importClause = statement.importClause;

      if (importClause?.name !== undefined) {
        imports.set(importClause.name.text, {
          moduleSpecifier,
          importedName: "default",
        });
      }

      if (
        importClause?.namedBindings !== undefined &&
        ts.isNamedImports(importClause.namedBindings)
      ) {
        for (const element of importClause.namedBindings.elements) {
          imports.set(element.name.text, {
            moduleSpecifier,
            importedName: element.propertyName?.text ?? element.name.text,
          });
        }
      }

      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      localBindings.set(statement.name.text, {
        node: statement,
        exported: hasExportModifier(statement),
      });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement);

      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer !== undefined
        ) {
          localBindings.set(declaration.name.text, {
            node: declaration.initializer,
            exported,
          });
        }
      }

      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        exportAliases.set(
          element.name.text,
          element.propertyName?.text ?? element.name.text,
        );
      }
    }
  }

  return {
    absolutePath,
    filePath,
    sourceFile,
    imports,
    localBindings,
    exportAliases,
  };
};

const createInMemorySourceContext = (filePath: string, sourceText: string) =>
  createSourceContext(
    filePath,
    resolve(repoRootDirectory, filePath),
    sourceText,
  );

const getSourceContext = (absolutePath: string): SourceContext => {
  const cachedContext = sourceContextCache.get(absolutePath);

  if (cachedContext !== undefined) {
    return cachedContext;
  }

  const sourceText = readFileSync(absolutePath, "utf8");
  const context = createSourceContext(
    normalizeRepoFilePath(absolutePath),
    absolutePath,
    sourceText,
  );

  sourceContextCache.set(absolutePath, context);
  return context;
};

const resolveExportedBinding = (
  context: SourceContext,
  exportedName: string,
): ResolvedBinding | undefined => {
  const localName = context.exportAliases.get(exportedName) ?? exportedName;
  const binding = context.localBindings.get(localName);

  if (binding === undefined) {
    return undefined;
  }

  if (binding.exported || context.exportAliases.has(exportedName)) {
    return {
      name: localName,
      context,
      node: binding.node,
    };
  }

  return undefined;
};

const resolveIdentifierBinding = (
  context: SourceContext,
  identifierName: string,
): ResolvedBinding | undefined => {
  const localBinding = context.localBindings.get(identifierName);

  if (localBinding !== undefined) {
    return {
      name: identifierName,
      context,
      node: localBinding.node,
    };
  }

  const importBinding = context.imports.get(identifierName);

  if (importBinding === undefined) {
    return undefined;
  }

  const moduleAbsolutePath = resolveModuleAbsolutePath(
    context.absolutePath,
    importBinding.moduleSpecifier,
  );

  if (moduleAbsolutePath === undefined) {
    return undefined;
  }

  return resolveExportedBinding(
    getSourceContext(moduleAbsolutePath),
    importBinding.importedName,
  );
};

const getBindingKey = (binding: ResolvedBinding) =>
  `${binding.context.filePath}:${binding.name}`;

const hasUnknownBoundaryInput = (
  node:
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration,
  context: SourceContext,
) => node.parameters[0]?.type?.getText(context.sourceFile) === "unknown";

const isKnownBoundaryValidatorFactoryOutput = (
  expression: ts.Expression,
  context: SourceContext,
) => {
  const unwrappedExpression = unwrapExpression(expression);

  if (!ts.isCallExpression(unwrappedExpression)) {
    return false;
  }

  const callee = unwrapExpression(unwrappedExpression.expression);

  if (!ts.isIdentifier(callee)) {
    return false;
  }

  const binding = resolveIdentifierBinding(context, callee.text);

  return (
    binding !== undefined &&
    binding.name === "decodeSyncBoundary" &&
    isEffectBoundaryContext(binding.context)
  );
};

const isSafeDecodeFactoryOutput = (
  expression: ts.Expression,
  context: SourceContext,
) => {
  const unwrappedExpression = unwrapExpression(expression);

  if (!ts.isCallExpression(unwrappedExpression)) {
    return false;
  }

  if (isKnownBoundaryValidatorFactoryOutput(unwrappedExpression, context)) {
    return true;
  }

  const callee = unwrapExpression(unwrappedExpression.expression);

  if (ts.isIdentifier(callee)) {
    const binding = resolveIdentifierBinding(context, callee.text);

    return (
      binding !== undefined &&
      trustedEffectBoundaryFactoryNames.has(binding.name) &&
      isEffectBoundaryContext(binding.context)
    );
  }

  return isEffectSchemaDecodeUnknownAccess(callee, context);
};

const getBoundaryInputName = (
  node:
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration,
) => {
  const parameter = node.parameters[0];
  return parameter !== undefined && ts.isIdentifier(parameter.name)
    ? parameter.name.text
    : undefined;
};

const expressionReferencesNames = (
  expression: ts.Expression,
  names: ReadonlySet<string>,
) => {
  let referencesName = false;

  const visit = (node: ts.Node) => {
    if (referencesName) {
      return;
    }

    if (ts.isIdentifier(node) && names.has(node.text)) {
      referencesName = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(unwrapValueExpression(expression));
  return referencesName;
};

const isDirectInputAliasExpression = (
  expression: ts.Expression,
  inputAliasNames: ReadonlySet<string>,
) => {
  const unwrappedExpression = unwrapValueExpression(expression);
  return ts.isIdentifier(unwrappedExpression)
    ? inputAliasNames.has(unwrappedExpression.text)
    : false;
};

const collectBindingNames = (
  bindingName: ts.BindingName,
): readonly string[] => {
  if (ts.isIdentifier(bindingName)) {
    return [bindingName.text];
  }

  const names: string[] = [];

  const visit = (name: ts.BindingName) => {
    if (ts.isIdentifier(name)) {
      names.push(name.text);
      return;
    }

    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) {
        continue;
      }

      visit(element.name);
    }
  };

  visit(bindingName);
  return names;
};

const collectAssignmentTargetNames = (
  expression: ts.Expression,
): readonly string[] => {
  const unwrappedExpression = unwrapValueExpression(expression);

  if (ts.isIdentifier(unwrappedExpression)) {
    return [unwrappedExpression.text];
  }

  if (ts.isArrayLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression.elements.flatMap((element) => {
      if (ts.isOmittedExpression(element)) {
        return [];
      }

      return ts.isSpreadElement(element)
        ? collectAssignmentTargetNames(element.expression)
        : collectAssignmentTargetNames(element);
    });
  }

  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression.properties.flatMap((property) => {
      if (ts.isShorthandPropertyAssignment(property)) {
        return [property.name.text];
      }

      if (ts.isPropertyAssignment(property)) {
        return collectAssignmentTargetNames(property.initializer);
      }

      if (ts.isSpreadAssignment(property)) {
        return collectAssignmentTargetNames(property.expression);
      }

      return [];
    });
  }

  return [];
};

const isSafeBoundaryValue = (
  expression: ts.Expression | ts.FunctionDeclaration,
  context: SourceContext,
  visitedBindings: ReadonlySet<string>,
): boolean => {
  if (ts.isFunctionDeclaration(expression)) {
    if (!hasUnknownBoundaryInput(expression, context)) {
      return false;
    }

    return functionReturnsDerivedBoundaryValue(
      expression,
      context,
      visitedBindings,
    );
  }

  const unwrappedExpression = unwrapValueExpression(expression);

  if (isFunctionLikeNode(unwrappedExpression)) {
    if (!hasUnknownBoundaryInput(unwrappedExpression, context)) {
      return false;
    }

    return functionReturnsDerivedBoundaryValue(
      unwrappedExpression,
      context,
      visitedBindings,
    );
  }

  if (ts.isIdentifier(unwrappedExpression)) {
    const binding = resolveIdentifierBinding(context, unwrappedExpression.text);

    if (binding === undefined) {
      return false;
    }

    if (
      isEffectBoundaryContext(binding.context) &&
      trustedEffectBoundaryFunctionNames.has(binding.name)
    ) {
      return true;
    }

    const bindingKey = getBindingKey(binding);

    if (visitedBindings.has(bindingKey)) {
      return false;
    }

    return isSafeBoundaryValue(
      binding.node,
      binding.context,
      new Set([...visitedBindings, bindingKey]),
    );
  }

  return isKnownBoundaryValidatorFactoryOutput(unwrappedExpression, context);
};

const isSafeDecodeReferenceBinding = (
  binding: ResolvedBinding,
  visitedBindings: ReadonlySet<string>,
) => {
  if (
    isEffectBoundaryContext(binding.context) &&
    trustedEffectBoundaryFunctionNames.has(binding.name)
  ) {
    return true;
  }

  if (ts.isCallExpression(binding.node)) {
    return isSafeDecodeFactoryOutput(binding.node, binding.context);
  }

  return isSafeBoundaryValue(binding.node, binding.context, visitedBindings);
};

const expressionContainsSafeDecodeFromSource = (
  expression: ts.Expression,
  sourceNames: ReadonlySet<string>,
  context: SourceContext,
  visitedBindings: ReadonlySet<string>,
) => {
  let foundSafeDecode = false;

  const visit = (node: ts.Node) => {
    if (foundSafeDecode) {
      return;
    }

    if (ts.isCallExpression(node)) {
      if (
        callExpressionContainsSafeDecode(node, context, visitedBindings) &&
        node.arguments.some((argument) =>
          expressionReferencesNames(argument, sourceNames),
        )
      ) {
        foundSafeDecode = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(unwrapValueExpression(expression));
  return foundSafeDecode;
};

const expressionContainsRawBoundaryInputLeak = (
  expression: ts.Expression,
  inputAliasNames: ReadonlySet<string>,
  context: SourceContext,
  visitedBindings: ReadonlySet<string>,
) => {
  let leaksRawInput = false;

  const visit = (node: ts.Node, withinSafeDecodeArgument: boolean) => {
    if (leaksRawInput) {
      return;
    }

    if (ts.isIdentifier(node) && inputAliasNames.has(node.text)) {
      if (!withinSafeDecodeArgument) {
        leaksRawInput = true;
      }
      return;
    }

    if (ts.isCallExpression(node)) {
      const safeDecodeCall = callExpressionContainsSafeDecode(
        node,
        context,
        visitedBindings,
      );

      visit(node.expression, withinSafeDecodeArgument);

      for (const argument of node.arguments) {
        visit(argument, withinSafeDecodeArgument || safeDecodeCall);
      }

      return;
    }

    ts.forEachChild(node, (child) => visit(child, withinSafeDecodeArgument));
  };

  visit(unwrapValueExpression(expression), false);
  return leaksRawInput;
};

const isDerivedBoundaryExpression = (
  expression: ts.Expression,
  inputAliasNames: ReadonlySet<string>,
  derivedNames: ReadonlySet<string>,
  context: SourceContext,
  visitedBindings: ReadonlySet<string>,
) => {
  const sourceNames = new Set([...inputAliasNames, ...derivedNames]);
  const leaksRawInput = expressionContainsRawBoundaryInputLeak(
    expression,
    inputAliasNames,
    context,
    visitedBindings,
  );

  return (
    !leaksRawInput &&
    (expressionReferencesNames(expression, derivedNames) ||
      expressionContainsSafeDecodeFromSource(
        expression,
        sourceNames,
        context,
        visitedBindings,
      ))
  );
};

const callExpressionContainsSafeDecode = (
  callExpression: ts.CallExpression,
  context: SourceContext,
  visitedBindings: ReadonlySet<string>,
) => {
  const callee = unwrapExpression(callExpression.expression);

  if (ts.isIdentifier(callee)) {
    const binding = resolveIdentifierBinding(context, callee.text);

    if (binding === undefined) {
      return false;
    }

    const bindingKey = getBindingKey(binding);

    if (visitedBindings.has(bindingKey)) {
      return false;
    }

    return isSafeDecodeReferenceBinding(
      binding,
      new Set([...visitedBindings, bindingKey]),
    );
  }

  if (ts.isCallExpression(callee)) {
    return isSafeDecodeFactoryOutput(callee, context);
  }

  return isEffectSchemaDecodeUnknownAccess(callee, context);
};

function functionReturnsDerivedBoundaryValue(
  node:
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration,
  context: SourceContext,
  visitedBindings: ReadonlySet<string>,
): boolean {
  const inputName = getBoundaryInputName(node);

  if (inputName === undefined || node.body === undefined) {
    return false;
  }

  const inputAliasNames = new Set([inputName]);
  const derivedNames = new Set<string>();
  let sawReturn = false;
  let sawUnsafeReturn = false;

  const processReturnExpression = (expression: ts.Expression | undefined) => {
    sawReturn = true;

    if (
      expression === undefined ||
      !isDerivedBoundaryExpression(
        expression,
        inputAliasNames,
        derivedNames,
        context,
        visitedBindings,
      )
    ) {
      sawUnsafeReturn = true;
    }
  };

  const processStatement = (statement: ts.Statement) => {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer === undefined) {
          continue;
        }

        const bindingNames = collectBindingNames(declaration.name);
        const derivesFromDecodedBoundary = isDerivedBoundaryExpression(
          declaration.initializer,
          inputAliasNames,
          derivedNames,
          context,
          visitedBindings,
        );
        const referencesRawBoundaryInput = expressionReferencesNames(
          declaration.initializer,
          inputAliasNames,
        );

        if (
          isDirectInputAliasExpression(
            declaration.initializer,
            inputAliasNames,
          ) ||
          (!derivesFromDecodedBoundary && referencesRawBoundaryInput)
        ) {
          for (const bindingName of bindingNames) {
            inputAliasNames.add(bindingName);
          }
        }

        if (derivesFromDecodedBoundary) {
          for (const bindingName of bindingNames) {
            derivedNames.add(bindingName);
          }
        }
      }

      return;
    }

    if (ts.isReturnStatement(statement)) {
      processReturnExpression(statement.expression);
      return;
    }

    const statementExpression = ts.isExpressionStatement(statement)
      ? unwrapValueExpression(statement.expression)
      : undefined;

    if (
      statementExpression !== undefined &&
      ts.isBinaryExpression(statementExpression) &&
      statementExpression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const assignmentTargets = collectAssignmentTargetNames(
        statementExpression.left,
      );
      const derivesFromDecodedBoundary = isDerivedBoundaryExpression(
        statementExpression.right,
        inputAliasNames,
        derivedNames,
        context,
        visitedBindings,
      );
      const referencesRawBoundaryInput = expressionReferencesNames(
        statementExpression.right,
        inputAliasNames,
      );

      if (!derivesFromDecodedBoundary && referencesRawBoundaryInput) {
        for (const assignmentTarget of assignmentTargets) {
          inputAliasNames.add(assignmentTarget);
        }
      }

      if (derivesFromDecodedBoundary) {
        for (const assignmentTarget of assignmentTargets) {
          derivedNames.add(assignmentTarget);
        }
      }

      return;
    }

    if (ts.isBlock(statement)) {
      for (const childStatement of statement.statements) {
        processStatement(childStatement);
      }
      return;
    }

    if (ts.isIfStatement(statement)) {
      processStatement(statement.thenStatement);

      if (statement.elseStatement !== undefined) {
        processStatement(statement.elseStatement);
      }
    }
  };

  if (ts.isBlock(node.body)) {
    for (const statement of node.body.statements) {
      processStatement(statement);
    }
  } else {
    processReturnExpression(node.body);
  }

  return sawReturn && !sawUnsafeReturn;
}

const pushReferenceViolation = (
  violations: EffectBoundaryViolation[],
  filePath: string,
  kind: BoundaryKind,
  expression: ts.Expression | undefined,
  context: SourceContext,
) => {
  const ruleId =
    kind === "route"
      ? "admin-route-validate-search-reference"
      : "admin-route-server-input-validator-reference";
  const boundaryName =
    kind === "route" ? "validateSearch" : "inputValidator(...)";
  const expressionText =
    expression === undefined
      ? undefined
      : expression.getText(context.sourceFile);

  violations.push({
    filePath,
    ruleId,
    message:
      expressionText === undefined
        ? `Admin app ${boundaryName} boundaries must decode at the framework edge.`
        : `Admin app ${boundaryName} boundaries must decode at the framework edge, but found ${expressionText}.`,
  });
};

const pushInlineInputTypeViolation = (
  violations: EffectBoundaryViolation[],
  filePath: string,
  kind: BoundaryKind,
) => {
  violations.push({
    filePath,
    ruleId:
      kind === "route"
        ? "admin-route-validate-search-inline-input-type"
        : "admin-route-server-input-validator-inline-input-type",
    message:
      kind === "route"
        ? "Admin app route validateSearch inline functions must accept unknown so the boundary decode happens at the route edge."
        : "Admin app route-server inputValidator(...) inline functions must accept unknown so the boundary decode happens at the framework edge.",
  });
};

const pushInlineDecodeViolation = (
  violations: EffectBoundaryViolation[],
  filePath: string,
  kind: BoundaryKind,
) => {
  violations.push({
    filePath,
    ruleId:
      kind === "route"
        ? "admin-route-validate-search-inline-decode"
        : "admin-route-server-input-validator-inline-decode",
    message:
      kind === "route"
        ? "Admin app route validateSearch inline functions must call a decode helper before normalizing the search state."
        : "Admin app route-server inputValidator(...) inline functions must call a decode helper before normalizing the payload.",
  });
};

const validateBoundaryExpression = (
  filePath: string,
  context: SourceContext,
  kind: BoundaryKind,
  expression: ts.Expression | ts.MethodDeclaration | undefined,
  violations: EffectBoundaryViolation[],
) => {
  if (expression === undefined) {
    pushReferenceViolation(violations, filePath, kind, expression, context);
    return;
  }

  if (ts.isMethodDeclaration(expression)) {
    if (!hasUnknownBoundaryInput(expression, context)) {
      pushInlineInputTypeViolation(violations, filePath, kind);
    }

    if (!functionReturnsDerivedBoundaryValue(expression, context, new Set())) {
      pushInlineDecodeViolation(violations, filePath, kind);
    }

    return;
  }

  const unwrappedExpression = unwrapExpression(expression);

  if (isFunctionLikeNode(unwrappedExpression)) {
    if (!hasUnknownBoundaryInput(unwrappedExpression, context)) {
      pushInlineInputTypeViolation(violations, filePath, kind);
    }

    if (
      !functionReturnsDerivedBoundaryValue(
        unwrappedExpression,
        context,
        new Set(),
      )
    ) {
      pushInlineDecodeViolation(violations, filePath, kind);
    }

    return;
  }

  if (!isSafeBoundaryValue(unwrappedExpression, context, new Set())) {
    pushReferenceViolation(
      violations,
      filePath,
      kind,
      unwrappedExpression,
      context,
    );
  }
};

export const validateAdminRouteFileContents = (
  filePath: string,
  sourceText: string,
): readonly EffectBoundaryViolation[] => {
  const context = createInMemorySourceContext(filePath, sourceText);
  const violations: EffectBoundaryViolation[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Schema" &&
      node.expression.name.text === "validateSync"
    ) {
      violations.push({
        filePath,
        ruleId: "admin-route-no-schema-validate-sync",
        message:
          "Admin app route validateSearch boundaries must use Effect-backed decode helpers rather than Schema.validateSync(...).",
      });
    }

    if (
      ts.isPropertyAssignment(node) &&
      isNamedProperty(node.name, "validateSearch")
    ) {
      validateBoundaryExpression(
        filePath,
        context,
        "route",
        node.initializer,
        violations,
      );
    }

    if (
      ts.isMethodDeclaration(node) &&
      isNamedProperty(node.name, "validateSearch")
    ) {
      validateBoundaryExpression(filePath, context, "route", node, violations);
    }

    ts.forEachChild(node, visit);
  };

  visit(context.sourceFile);
  return violations;
};

export const validateAdminRouteServerFileContents = (
  filePath: string,
  sourceText: string,
): readonly EffectBoundaryViolation[] => {
  const context = createInMemorySourceContext(filePath, sourceText);
  const violations: EffectBoundaryViolation[] = [];

  const visit = (node: ts.Node) => {
    if (isInputValidatorCall(node)) {
      validateBoundaryExpression(
        filePath,
        context,
        "route-server",
        node.arguments[0],
        violations,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(context.sourceFile);
  return violations;
};

export const collectEffectBoundaryViolationFiles = () =>
  collectRepoFiles().filter(
    (filePath) =>
      adminAppRouteFilePattern.test(filePath) ||
      adminAppServerBoundaryFilePattern.test(filePath),
  );

export const collectEffectBoundaryViolations = (
  filePaths: readonly string[] = collectEffectBoundaryViolationFiles(),
): readonly EffectBoundaryViolation[] =>
  filePaths.flatMap((filePath) => {
    const sourceText = readFileSync(
      resolve(repoRootDirectory, filePath),
      "utf8",
    );

    if (adminAppRouteFilePattern.test(filePath)) {
      return validateAdminRouteFileContents(filePath, sourceText);
    }

    if (adminAppServerBoundaryFilePattern.test(filePath)) {
      return validateAdminRouteServerFileContents(filePath, sourceText);
    }

    return [];
  });

const formatViolations = (violations: readonly EffectBoundaryViolation[]) =>
  violations
    .map(
      (violation) =>
        `- ${violation.filePath} [${violation.ruleId}]: ${violation.message}`,
    )
    .join("\n");

if (import.meta.main) {
  const filePaths = collectEffectBoundaryViolationFiles();
  const violations = collectEffectBoundaryViolations(filePaths);

  if (violations.length > 0) {
    console.error(
      [
        "Admin-app Effect boundary guardrail failed.",
        "",
        formatViolations(violations),
      ].join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Admin-app Effect boundary guardrail passed for ${filePaths.length} file(s).`,
    );
  }
}
