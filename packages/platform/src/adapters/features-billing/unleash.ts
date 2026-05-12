import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { startUnleash, type Context as UnleashContext } from "unleash-client";
import type { UnleashConfig } from "unleash-client";
import {
  platformScope,
  type PlatformScope,
  PlatformScopeSchema,
} from "@comvestec/contracts";
import {
  buildUnleashClientFeaturesEndpoint,
  buildUnleashValidationHeaders,
  normalizeUnleashApiUrl,
  unleashBackendClientName,
} from "./unleash-shared";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const UnleashAdapterRuntimeOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

type UnleashAdapterRuntimeOptions = Schema.Schema.Type<
  typeof UnleashAdapterRuntimeOptionsSchema
>;

type UnleashSdkConstraint = {
  readonly contextName: string;
  readonly values?: readonly string[];
  readonly value?: string | number | Date;
};

type UnleashSdkSegment = {
  readonly constraints?: readonly UnleashSdkConstraint[];
};

type UnleashSdkStrategyDefinition = {
  readonly name: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly constraints?: readonly UnleashSdkConstraint[];
  readonly segments?: readonly number[];
  readonly variants?: readonly unknown[];
};

type UnleashSdkExpandedStrategyDefinition = Omit<
  UnleashSdkStrategyDefinition,
  "segments"
> & {
  readonly segments?: readonly (UnleashSdkSegment | undefined)[];
};

type UnleashSdkFeatureDefinition = {
  readonly name: string;
  readonly enabled: boolean;
  readonly project?: string;
  readonly type?: string;
  readonly description?: string;
  readonly stale?: boolean;
  readonly impressionData?: boolean;
  readonly strategies?: readonly UnleashSdkStrategyDefinition[];
  readonly dependencies?: readonly {
    readonly feature: string;
    readonly enabled?: boolean;
    readonly variants?: readonly string[];
  }[];
};

type UnleashSdkExpandedFeatureDefinition = Omit<
  UnleashSdkFeatureDefinition,
  "strategies"
> & {
  readonly strategies?: readonly UnleashSdkExpandedStrategyDefinition[];
};

type UnleashSdkInternalStrategy = {
  readonly checkConstraints: (
    context: UnleashContext,
    constraints: IterableIterator<UnleashSdkConstraint | undefined>,
  ) => boolean;
  readonly getResult: (
    parameters: Readonly<Record<string, unknown>>,
    context: UnleashContext,
    constraints: IterableIterator<UnleashSdkConstraint | undefined>,
    variants?: readonly unknown[],
  ) => {
    readonly enabled: boolean;
  };
};

type UnleashSdkInternalClient = {
  readonly getStrategy: (
    name: string,
  ) => UnleashSdkInternalStrategy | undefined;
  readonly yieldConstraintsFor: (
    strategy: UnleashSdkStrategyDefinition,
  ) => IterableIterator<UnleashSdkConstraint | undefined>;
};

export type UnleashSdkClient = {
  readonly getFeatureToggleDefinition: (
    flagKey: string,
  ) => UnleashSdkFeatureDefinition | undefined;
  readonly getFeatureToggleDefinitions?: (
    withFullSegments?: boolean,
  ) =>
    | readonly UnleashSdkFeatureDefinition[]
    | readonly UnleashSdkExpandedFeatureDefinition[]
    | undefined;
  readonly isEnabled: (
    flagKey: string,
    context?: UnleashContext,
    fallbackEnabled?: boolean,
  ) => boolean;
  readonly client?: UnleashSdkInternalClient;
  readonly destroy?: () => void;
};

export type UnleashAdapterOptions = UnleashAdapterRuntimeOptions & {
  readonly client?: UnleashSdkClient;
  readonly fetch?: typeof fetch;
};

const UnleashPropertyValueSchema = Schema.Union(
  Schema.NonEmptyString,
  Schema.Number,
);

const UnleashFeatureFlagEvaluationContextSchema = Schema.Struct({
  userId: Schema.optional(Schema.NonEmptyString),
  sessionId: Schema.optional(Schema.NonEmptyString),
  remoteAddress: Schema.optional(Schema.NonEmptyString),
  appName: Schema.optional(Schema.NonEmptyString),
  environment: Schema.optional(Schema.NonEmptyString),
  properties: Schema.optional(
    Schema.Record({
      key: Schema.NonEmptyString,
      value: UnleashPropertyValueSchema,
    }),
  ),
});

export type UnleashFeatureFlagEvaluationContext = Schema.Schema.Type<
  typeof UnleashFeatureFlagEvaluationContextSchema
>;

const UnleashFeatureFlagEvaluationInputSchema = Schema.Struct({
  flagKey: Schema.NonEmptyString,
  fallbackEnabled: Schema.Boolean,
  context: Schema.optional(UnleashFeatureFlagEvaluationContextSchema),
});

export type UnleashFeatureFlagEvaluationInput = Schema.Schema.Type<
  typeof UnleashFeatureFlagEvaluationInputSchema
>;

const UnleashFeatureFlagDefinitionInputSchema = Schema.Struct({
  flagKey: Schema.NonEmptyString,
});

export type UnleashFeatureFlagDefinitionInput = Schema.Schema.Type<
  typeof UnleashFeatureFlagDefinitionInputSchema
>;

const UnleashFeatureFlagDependencySchema = Schema.Struct({
  feature: Schema.NonEmptyString,
  enabled: Schema.optional(Schema.Boolean),
  variants: Schema.optional(Schema.Array(Schema.NonEmptyString)),
});

const UnleashFeatureFlagDefinitionSchema = Schema.Struct({
  flagKey: Schema.NonEmptyString,
  enabled: Schema.Boolean,
  project: Schema.optional(Schema.NonEmptyString),
  type: Schema.optional(Schema.NonEmptyString),
  description: Schema.optional(Schema.NonEmptyString),
  stale: Schema.optional(Schema.Boolean),
  impressionData: Schema.optional(Schema.Boolean),
  dependencies: Schema.Array(UnleashFeatureFlagDependencySchema),
});

export type UnleashFeatureFlagDefinition = Schema.Schema.Type<
  typeof UnleashFeatureFlagDefinitionSchema
>;

const UnleashFeatureFlagEvaluationSchema = Schema.Struct({
  flagKey: Schema.NonEmptyString,
  enabled: Schema.Boolean,
  definitionExists: Schema.Boolean,
  resolvedScope: Schema.optional(PlatformScopeSchema),
  resolvedScopeId: Schema.optional(Schema.NonEmptyString),
});

export type UnleashFeatureFlagEvaluation = Schema.Schema.Type<
  typeof UnleashFeatureFlagEvaluationSchema
>;

export type UnleashAdapterInitializationError = {
  readonly _tag: "UnleashAdapterInitializationError";
  readonly cause: unknown;
};

const buildUnleashAdapterInitializationError = (
  cause: unknown,
): UnleashAdapterInitializationError => ({
  _tag: "UnleashAdapterInitializationError",
  cause,
});

type UnleashAdapterOperation = "healthcheck";

export class UnleashAdapterRequestError extends Error {
  readonly _tag = "UnleashAdapterRequestError";

  constructor(
    readonly operation: UnleashAdapterOperation,
    readonly endpoint: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(`Unleash ${operation} failed with status ${status} for ${endpoint}.`);
    this.name = "UnleashAdapterRequestError";
  }
}

export class UnleashAdapterTransportError extends Error {
  readonly _tag = "UnleashAdapterTransportError";

  constructor(
    readonly operation: UnleashAdapterOperation,
    readonly endpoint: string,
    readonly transportCause: unknown,
  ) {
    super(`Unleash ${operation} transport failed for ${endpoint}.`);
    this.name = "UnleashAdapterTransportError";
  }
}

const UnleashHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.unleash,
);

const decodeUnleashHealthcheck = Schema.decodeUnknown(UnleashHealthcheckSchema);

export type UnleashHealthcheck = Schema.Schema.Type<
  typeof UnleashHealthcheckSchema
>;

export type UnleashHealthcheckError =
  | ParseResult.ParseError
  | UnleashAdapterRequestError
  | UnleashAdapterTransportError;

export type UnleashAdapterError = ParseResult.ParseError;

const decodeUnleashFeatureFlagEvaluationInput = Schema.decodeUnknown(
  UnleashFeatureFlagEvaluationInputSchema,
);

const decodeUnleashFeatureFlagDefinitionInput = Schema.decodeUnknown(
  UnleashFeatureFlagDefinitionInputSchema,
);

const decodeUnleashFeatureFlagDefinition = Schema.decodeUnknown(
  UnleashFeatureFlagDefinitionSchema,
);

const decodeUnleashFeatureFlagEvaluation = Schema.decodeUnknown(
  UnleashFeatureFlagEvaluationSchema,
);

const createUnleashHealthcheck = (input: {
  readonly url: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<UnleashHealthcheck, UnleashHealthcheckError> => {
  const endpoint = buildUnleashClientFeaturesEndpoint(input.url);

  return Effect.tryPromise({
    try: () =>
      input.fetchImplementation(endpoint, {
        method: "GET",
        headers: buildUnleashValidationHeaders(input.apiKey),
      }),
    catch: (cause) =>
      new UnleashAdapterTransportError("healthcheck", endpoint, cause),
  }).pipe(
    Effect.flatMap(
      (response): Effect.Effect<UnleashHealthcheck, UnleashHealthcheckError> =>
        response.ok
          ? decodeUnleashHealthcheck({
              healthy: true,
              service: platformAdapterServiceName.unleash,
            })
          : Effect.tryPromise({
              try: async () => await response.text(),
              catch: (cause) =>
                new UnleashAdapterTransportError(
                  "healthcheck",
                  endpoint,
                  cause,
                ),
            }).pipe(
              Effect.flatMap((body) =>
                Effect.fail(
                  new UnleashAdapterRequestError(
                    "healthcheck",
                    endpoint,
                    response.status,
                    body,
                  ),
                ),
              ),
            ),
    ),
  );
};

const getEvaluationContextProperty = (
  context: UnleashContext | undefined,
  propertyName: string,
) => {
  if (context === undefined) {
    return undefined;
  }

  if (
    propertyName === "userId" ||
    propertyName === "sessionId" ||
    propertyName === "remoteAddress" ||
    propertyName === "appName" ||
    propertyName === "environment"
  ) {
    return context[propertyName];
  }

  return context.properties?.[propertyName];
};

const resolveEvaluatedScopeId = (
  scope: PlatformScope,
  context: UnleashContext | undefined,
) => {
  switch (scope) {
    case platformScope.individual:
      return (
        getEvaluationContextProperty(context, "individualId") ??
        (getEvaluationContextProperty(context, "tenantScope") ===
        platformScope.individual
          ? getEvaluationContextProperty(context, "tenantScopeId")
          : undefined)
      );
    case platformScope.organization:
      return (
        getEvaluationContextProperty(context, "organizationId") ??
        (getEvaluationContextProperty(context, "tenantScope") ===
        platformScope.organization
          ? getEvaluationContextProperty(context, "tenantScopeId")
          : undefined)
      );
    case platformScope.enterprise:
      return (
        getEvaluationContextProperty(context, "enterpriseId") ??
        (getEvaluationContextProperty(context, "tenantScope") ===
        platformScope.enterprise
          ? getEvaluationContextProperty(context, "tenantScopeId")
          : undefined)
      );
    case platformScope.platform:
      return platformScope.platform;
  }
};

const inferEvaluatedScope = (
  constraints: readonly UnleashSdkConstraint[],
  context: UnleashContext | undefined,
): PlatformScope | undefined => {
  if (
    constraints.some((constraint) => constraint.contextName === "individualId")
  ) {
    return platformScope.individual;
  }

  if (
    constraints.some(
      (constraint) => constraint.contextName === "organizationId",
    )
  ) {
    return platformScope.organization;
  }

  if (
    constraints.some((constraint) => constraint.contextName === "enterpriseId")
  ) {
    return platformScope.enterprise;
  }

  if (
    constraints.some((constraint) => constraint.contextName === "tenantScope")
  ) {
    const tenantScope = getEvaluationContextProperty(context, "tenantScope");

    if (
      tenantScope === platformScope.individual ||
      tenantScope === platformScope.organization ||
      tenantScope === platformScope.enterprise ||
      tenantScope === platformScope.platform
    ) {
      return tenantScope;
    }
  }

  if (
    constraints.some((constraint) => constraint.contextName === "tenantScopeId")
  ) {
    return undefined;
  }

  return constraints.length === 0 ? platformScope.platform : undefined;
};

const collectExpandedStrategyConstraints = (
  strategy: UnleashSdkExpandedStrategyDefinition | undefined,
) => [
  ...(strategy?.constraints ?? []),
  ...(strategy?.segments?.flatMap((segment) => segment?.constraints ?? []) ??
    []),
];

const collectStrategyConstraints = (
  constraints: readonly (UnleashSdkConstraint | undefined)[],
) =>
  constraints.filter(
    (constraint): constraint is UnleashSdkConstraint =>
      constraint !== undefined,
  );

const inferFeatureFlagEvaluationScope = (input: {
  readonly client: UnleashSdkClient;
  readonly definition: UnleashSdkFeatureDefinition;
  readonly flagKey: string;
  readonly context: UnleashContext | undefined;
  readonly enabled: boolean;
}):
  | {
      readonly resolvedScope: PlatformScope;
      readonly resolvedScopeId: string;
    }
  | undefined => {
  if (input.definition.strategies === undefined) {
    return {
      resolvedScope: platformScope.platform,
      resolvedScopeId: platformScope.platform,
    };
  }

  if (input.definition.strategies.length === 0) {
    return {
      resolvedScope: platformScope.platform,
      resolvedScopeId: platformScope.platform,
    };
  }

  const internalClient = input.client.client;

  if (internalClient === undefined) {
    return undefined;
  }

  const expandedDefinition = input.client
    .getFeatureToggleDefinitions?.(true)
    ?.filter(
      (definition): definition is UnleashSdkExpandedFeatureDefinition =>
        definition.strategies === undefined ||
        definition.strategies.every(
          (strategy) =>
            strategy.segments === undefined ||
            strategy.segments.every(
              (segment) => segment === undefined || typeof segment === "object",
            ),
        ),
    )
    ?.find((definition) => definition.name === input.flagKey);

  let matchedStrategyIndex: number | undefined;
  let matchedStrategyConstraints: readonly UnleashSdkConstraint[] | undefined;
  let firstConstraintMatchIndex: number | undefined;
  let firstConstraintMatchConstraints:
    | readonly UnleashSdkConstraint[]
    | undefined;

  for (const [
    index,
    strategySelector,
  ] of input.definition.strategies.entries()) {
    const strategy = internalClient.getStrategy(strategySelector.name);

    if (strategy === undefined) {
      continue;
    }

    const constraints = Array.from(
      internalClient.yieldConstraintsFor(strategySelector),
    );
    const strategyConstraints = collectStrategyConstraints(constraints);

    if (!strategy.checkConstraints(input.context ?? {}, constraints.values())) {
      continue;
    }

    firstConstraintMatchIndex ??= index;
    firstConstraintMatchConstraints ??= strategyConstraints;

    if (!input.enabled) {
      continue;
    }

    if (
      strategy.getResult(
        strategySelector.parameters,
        input.context ?? {},
        constraints.values(),
        strategySelector.variants,
      ).enabled
    ) {
      matchedStrategyIndex = index;
      matchedStrategyConstraints = strategyConstraints;
      break;
    }
  }

  const strategyIndex =
    matchedStrategyIndex ??
    (!input.enabled ? firstConstraintMatchIndex : undefined);

  if (strategyIndex === undefined) {
    return undefined;
  }

  const strategyConstraints =
    matchedStrategyConstraints ??
    (!input.enabled ? firstConstraintMatchConstraints : undefined) ??
    [];

  const inferredScope = inferEvaluatedScope(
    [
      ...strategyConstraints,
      ...collectExpandedStrategyConstraints(
        expandedDefinition?.strategies?.[strategyIndex],
      ),
    ],
    input.context,
  );

  if (inferredScope === undefined) {
    return undefined;
  }

  const resolvedScopeId = resolveEvaluatedScopeId(inferredScope, input.context);

  if (typeof resolvedScopeId !== "string" || resolvedScopeId.length === 0) {
    return undefined;
  }

  return {
    resolvedScope: inferredScope,
    resolvedScopeId,
  };
};

const buildUnleashClientConfig = (
  options: UnleashAdapterRuntimeOptions,
): UnleashConfig => ({
  url: normalizeUnleashApiUrl(options.url),
  appName: unleashBackendClientName,
  instanceId: unleashBackendClientName,
  customHeaders: buildUnleashValidationHeaders(options.apiKey),
  disableMetrics: true,
});

const toDefinitionView = (input: {
  readonly flagKey: string;
  readonly definition: UnleashSdkFeatureDefinition;
}) =>
  decodeUnleashFeatureFlagDefinition({
    flagKey: input.flagKey,
    enabled: input.definition.enabled,
    ...(input.definition.project !== undefined
      ? { project: input.definition.project }
      : {}),
    ...(input.definition.type !== undefined
      ? { type: input.definition.type }
      : {}),
    ...(input.definition.description !== undefined
      ? { description: input.definition.description }
      : {}),
    ...(input.definition.stale !== undefined
      ? { stale: input.definition.stale }
      : {}),
    ...(input.definition.impressionData !== undefined
      ? { impressionData: input.definition.impressionData }
      : {}),
    dependencies:
      input.definition.dependencies?.map((dependency) => ({
        feature: dependency.feature,
        ...(dependency.enabled !== undefined
          ? { enabled: dependency.enabled }
          : {}),
        ...(dependency.variants !== undefined
          ? { variants: dependency.variants }
          : {}),
      })) ?? [],
  });

export type UnleashAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.unleash;
  readonly url: string;
  readonly healthcheck: Effect.Effect<
    UnleashHealthcheck,
    UnleashHealthcheckError
  >;
  readonly evaluateFeatureFlag: (
    input: UnleashFeatureFlagEvaluationInput,
  ) => Effect.Effect<UnleashFeatureFlagEvaluation, UnleashAdapterError>;
  readonly getFeatureFlagDefinition: (
    input: UnleashFeatureFlagDefinitionInput,
  ) => Effect.Effect<
    UnleashFeatureFlagDefinition | undefined,
    UnleashAdapterError
  >;
  readonly close: Effect.Effect<void, never>;
};

export class UnleashAdapter extends Context.Tag("UnleashAdapter")<
  UnleashAdapter,
  UnleashAdapterService
>() {}

export const makeUnleashAdapter = (input: UnleashAdapterOptions) =>
  Schema.decodeUnknown(UnleashAdapterRuntimeOptionsSchema)(input).pipe(
    Effect.flatMap((options) =>
      Effect.tryPromise({
        try: async () =>
          input.client ??
          (await startUnleash(buildUnleashClientConfig(options))),
        catch: buildUnleashAdapterInitializationError,
      }).pipe(
        Effect.map(
          (client): UnleashAdapterService => ({
            serviceName: platformAdapterServiceName.unleash,
            url: options.url,
            healthcheck: createUnleashHealthcheck({
              url: options.url,
              apiKey: options.apiKey,
              fetchImplementation: input.fetch ?? fetch,
            }),
            evaluateFeatureFlag: (
              evaluationInput: UnleashFeatureFlagEvaluationInput,
            ) =>
              decodeUnleashFeatureFlagEvaluationInput(evaluationInput).pipe(
                Effect.flatMap((decodedInput) => {
                  const introspectableClient =
                    client as unknown as UnleashSdkClient;
                  const definition = client.getFeatureToggleDefinition(
                    decodedInput.flagKey,
                  );
                  const enabled = client.isEnabled(
                    decodedInput.flagKey,
                    decodedInput.context as UnleashContext | undefined,
                    decodedInput.fallbackEnabled,
                  );
                  const evaluatedScope =
                    definition === undefined
                      ? undefined
                      : inferFeatureFlagEvaluationScope({
                          client: introspectableClient,
                          definition,
                          flagKey: decodedInput.flagKey,
                          context: decodedInput.context as
                            | UnleashContext
                            | undefined,
                          enabled,
                        });

                  return decodeUnleashFeatureFlagEvaluation({
                    flagKey: decodedInput.flagKey,
                    enabled,
                    definitionExists: definition !== undefined,
                    ...(evaluatedScope !== undefined
                      ? {
                          resolvedScope: evaluatedScope.resolvedScope,
                          resolvedScopeId: evaluatedScope.resolvedScopeId,
                        }
                      : {}),
                  });
                }),
              ),
            getFeatureFlagDefinition: (
              definitionInput: UnleashFeatureFlagDefinitionInput,
            ) =>
              decodeUnleashFeatureFlagDefinitionInput(definitionInput).pipe(
                Effect.flatMap((decodedInput) => {
                  const definition = client.getFeatureToggleDefinition(
                    decodedInput.flagKey,
                  );

                  if (definition === undefined) {
                    return Effect.succeed(undefined);
                  }

                  return toDefinitionView({
                    flagKey: decodedInput.flagKey,
                    definition,
                  });
                }),
              ),
            close: Effect.sync(() => {
              client.destroy?.();
            }),
          }),
        ),
      ),
    ),
  );

export const makeUnleashAdapterLayer = (options: UnleashAdapterOptions) =>
  Layer.effect(UnleashAdapter, makeUnleashAdapter(options));
