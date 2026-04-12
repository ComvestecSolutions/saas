import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { findModuleManifest } from "@comvestec/config";
import {
  ConfigOverrideSchema,
  EntitlementSchema,
  FeatureFlagDeclarationSchema,
  getModuleEnabledFeatureFlagKey,
  PlatformModuleIdSchema,
  platformScope,
  PlatformScopeSchema,
  RequestContextSchema,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  RuntimeChangeProposalActionSchema,
  RuntimeResolutionSourceSchema,
} from "@comvestec/contracts";

const RuntimeConfigResolutionRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  key: Schema.NonEmptyString,
  overrides: Schema.Array(ConfigOverrideSchema),
  entitlements: Schema.Array(EntitlementSchema),
});

const RuntimeFlagResolutionRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  flag: FeatureFlagDeclarationSchema,
  overrides: Schema.Array(ConfigOverrideSchema),
  entitlements: Schema.Array(EntitlementSchema),
});

export const RuntimeResolutionResultSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: Schema.NonEmptyString,
  effectiveValue: Schema.Any,
  source: RuntimeResolutionSourceSchema,
  entitled: Schema.Boolean,
  resolvedScope: Schema.optional(PlatformScopeSchema),
  resolvedScopeId: Schema.optional(Schema.NonEmptyString),
});

export type RuntimeResolutionResult = Schema.Schema.Type<
  typeof RuntimeResolutionResultSchema
>;

const decodeRuntimeResolutionResult = Schema.decodeUnknown(
  RuntimeResolutionResultSchema,
);

export const RuntimeChangeProposalSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: Schema.NonEmptyString,
  action: RuntimeChangeProposalActionSchema,
  artifactPath: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  runtimeValue: Schema.optional(Schema.Any),
  codeValue: Schema.optional(Schema.Any),
});

export type RuntimeChangeProposal = Schema.Schema.Type<
  typeof RuntimeChangeProposalSchema
>;

const RuntimeChangeProposalListSchema = Schema.Array(
  RuntimeChangeProposalSchema,
);

const decodeRuntimeChangeProposalList = Schema.decodeUnknown(
  RuntimeChangeProposalListSchema,
);

const RuntimeChangeProposalRequestSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  overrides: Schema.Array(ConfigOverrideSchema),
  renameMap: Schema.Record({
    key: Schema.NonEmptyString,
    value: Schema.NonEmptyString,
  }),
});

const resolveCascadeCandidates = (
  requestContext: Schema.Schema.Type<typeof RequestContextSchema>,
) => {
  const candidates: Array<{
    scope: Schema.Schema.Type<typeof PlatformScopeSchema>;
    scopeId: string;
  }> = [];

  if (requestContext.tenant.individualId !== undefined) {
    candidates.push({
      scope: platformScope.individual,
      scopeId: requestContext.tenant.individualId,
    });
  }

  if (requestContext.tenant.organizationId !== undefined) {
    candidates.push({
      scope: platformScope.organization,
      scopeId: requestContext.tenant.organizationId,
    });
  }

  if (requestContext.tenant.enterpriseId !== undefined) {
    candidates.push({
      scope: platformScope.enterprise,
      scopeId: requestContext.tenant.enterpriseId,
    });
  }

  candidates.push({
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  });

  return candidates;
};

const hasEntitlement = (
  moduleId: Schema.Schema.Type<typeof PlatformModuleIdSchema>,
  key: string,
  requestContext: Schema.Schema.Type<typeof RequestContextSchema>,
  entitlements: readonly Schema.Schema.Type<typeof EntitlementSchema>[],
) =>
  entitlements.some(
    (entitlement) =>
      entitlement.moduleId === moduleId &&
      entitlement.active &&
      (entitlement.featureKey === key ||
        entitlement.featureKey === getModuleEnabledFeatureFlagKey(moduleId)) &&
      entitlement.scope === requestContext.tenant.scope &&
      entitlement.scopeId === requestContext.tenant.scopeId,
  );

const findDeclaration = (
  moduleId: Schema.Schema.Type<typeof PlatformModuleIdSchema>,
  key: string,
) =>
  findModuleManifest(moduleId)?.configKeys.find(
    (configKey) => configKey.key === key,
  );

export type UnknownConfigKeyError = {
  readonly _tag: "UnknownConfigKeyError";
  readonly key: string;
};

export type RuntimeConfigModuleService = {
  readonly resolveConfigValue: (
    input: unknown,
  ) => Effect.Effect<
    RuntimeResolutionResult,
    ParseResult.ParseError | UnknownConfigKeyError
  >;
  readonly resolveFeatureFlag: (
    input: unknown,
  ) => Effect.Effect<RuntimeResolutionResult, ParseResult.ParseError>;
  readonly buildChangeProposals: (
    input: unknown,
  ) => Effect.Effect<readonly RuntimeChangeProposal[], ParseResult.ParseError>;
};

export class RuntimeConfigModule extends Context.Tag("RuntimeConfigModule")<
  RuntimeConfigModule,
  RuntimeConfigModuleService
>() {}

export const makeRuntimeConfigModule = () =>
  Effect.succeed<RuntimeConfigModuleService>({
    resolveConfigValue: (input: unknown) =>
      Schema.decodeUnknown(RuntimeConfigResolutionRequestSchema)(input).pipe(
        Effect.flatMap(
          (
            request,
          ): Effect.Effect<
            RuntimeResolutionResult,
            ParseResult.ParseError | UnknownConfigKeyError
          > => {
            const declaration = findDeclaration(request.moduleId, request.key);
            if (declaration === undefined) {
              return Effect.fail({
                _tag: "UnknownConfigKeyError",
                key: request.key,
              } satisfies UnknownConfigKeyError);
            }

            const entitled =
              !declaration.billable ||
              hasEntitlement(
                request.moduleId,
                request.key,
                request.requestContext,
                request.entitlements,
              );

            if (!entitled) {
              return decodeRuntimeResolutionResult({
                moduleId: request.moduleId,
                key: request.key,
                effectiveValue: declaration.defaultValue,
                source: runtimeResolutionSource.unentitledDefault,
                entitled: false,
              } satisfies RuntimeResolutionResult);
            }

            const cascadeCandidates = resolveCascadeCandidates(
              request.requestContext,
            );
            const matchedOverride = cascadeCandidates
              .flatMap((candidate) =>
                request.overrides.filter(
                  (override) =>
                    override.moduleId === request.moduleId &&
                    override.key === request.key &&
                    override.scope === candidate.scope &&
                    override.scopeId === candidate.scopeId &&
                    declaration.allowedScopes.includes(candidate.scope),
                ),
              )
              .at(0);

            return decodeRuntimeResolutionResult(
              (matchedOverride === undefined
                ? {
                    moduleId: request.moduleId,
                    key: request.key,
                    effectiveValue: declaration.defaultValue,
                    source: runtimeResolutionSource.codeDefault,
                    entitled: true,
                  }
                : {
                    moduleId: request.moduleId,
                    key: request.key,
                    effectiveValue: matchedOverride.value,
                    source: runtimeResolutionSource.runtimeOverride,
                    entitled: true,
                    resolvedScope: matchedOverride.scope,
                    resolvedScopeId: matchedOverride.scopeId,
                  }) satisfies RuntimeResolutionResult,
            );
          },
        ),
      ),
    resolveFeatureFlag: (input: unknown) =>
      Schema.decodeUnknown(RuntimeFlagResolutionRequestSchema)(input).pipe(
        Effect.flatMap((request) => {
          const entitled =
            !request.flag.billable ||
            hasEntitlement(
              request.moduleId,
              request.flag.key,
              request.requestContext,
              request.entitlements,
            );

          if (!entitled) {
            return decodeRuntimeResolutionResult({
              moduleId: request.moduleId,
              key: request.flag.key,
              effectiveValue: false,
              source: runtimeResolutionSource.unentitledDefault,
              entitled: false,
            } satisfies RuntimeResolutionResult);
          }

          const cascadeCandidates = resolveCascadeCandidates(
            request.requestContext,
          );
          const matchedOverride = cascadeCandidates
            .flatMap((candidate) =>
              request.overrides.filter(
                (override) =>
                  override.moduleId === request.moduleId &&
                  override.key === request.flag.key &&
                  override.scope === candidate.scope &&
                  override.scopeId === candidate.scopeId &&
                  request.flag.allowedScopes.includes(candidate.scope),
              ),
            )
            .at(0);

          return decodeRuntimeResolutionResult(
            (matchedOverride === undefined
              ? {
                  moduleId: request.moduleId,
                  key: request.flag.key,
                  effectiveValue: request.flag.defaultEnabled,
                  source: runtimeResolutionSource.codeDefault,
                  entitled: true,
                }
              : {
                  moduleId: request.moduleId,
                  key: request.flag.key,
                  effectiveValue: Boolean(matchedOverride.value),
                  source: runtimeResolutionSource.runtimeOverride,
                  entitled: true,
                  resolvedScope: matchedOverride.scope,
                  resolvedScopeId: matchedOverride.scopeId,
                }) satisfies RuntimeResolutionResult,
          );
        }),
      ),
    buildChangeProposals: (input: unknown) =>
      Schema.decodeUnknown(RuntimeChangeProposalRequestSchema)(input).pipe(
        Effect.flatMap((request) => {
          const moduleManifest = findModuleManifest(request.moduleId);
          const declaredKeys = new Set(
            moduleManifest?.configKeys.map((configKey) => configKey.key) ?? [],
          );

          return decodeRuntimeChangeProposalList(
            request.overrides
              .filter((override) => override.moduleId === request.moduleId)
              .map((override) => {
                const renamedKey = request.renameMap[override.key];
                const action = renamedKey
                  ? runtimeChangeProposalAction.rename
                  : declaredKeys.has(override.key)
                    ? runtimeChangeProposalAction.update
                    : runtimeChangeProposalAction.retire;

                return {
                  proposalId: `${request.moduleId}:${override.key}:${action}`,
                  moduleId: request.moduleId,
                  key: override.key,
                  action,
                  artifactPath: `specs/00-governance/runtime-config-proposals/${request.moduleId}.${override.key.replace(/\./g, "-")}.json`,
                  reason: renamedKey
                    ? `Runtime key should migrate to ${renamedKey}.`
                    : declaredKeys.has(override.key)
                      ? "Approved runtime override differs from the code-declared baseline."
                      : "Runtime key no longer exists in the code-declared manifest.",
                  runtimeValue: override.value,
                  ...(renamedKey !== undefined
                    ? { codeValue: renamedKey }
                    : {}),
                };
              }),
          );
        }),
      ),
  });

export const RuntimeConfigModuleLive = Layer.effect(
  RuntimeConfigModule,
  makeRuntimeConfigModule(),
);
