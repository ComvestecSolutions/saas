import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  configDefaultValue,
  findModuleManifest,
  platformModuleManifests,
} from "@comvestec/config";
import {
  type ConfigOverride,
  type DeclaredModuleConfigKey,
  DeclaredModuleConfigKeySchema,
  type DeclaredRuntimeGovernedKey,
  DeclaredRuntimeGovernedKeySchema,
  ConfigOverrideSchema,
  type Entitlement,
  EntitlementSchema,
  featureFlagLifecycle,
  type FeatureFlagDeclaration,
  FeatureFlagDeclarationSchema,
  getModuleEnabledFeatureFlagKey,
  type PlatformModuleId,
  PlatformModuleIdSchema,
  platformScope,
  PlatformScopeSchema,
  RequestContextSchema,
  type PlatformScope,
  type RequestContext,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  RuntimeChangeProposalActionSchema,
  RuntimeResolutionSourceSchema,
} from "@comvestec/contracts";
import {
  RuntimeConfigPostgresRepository,
  type RuntimeConfigPostgresRepositoryError,
  type RuntimeConfigPostgresRepositoryService,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigOverrideProposalRecord,
  type RuntimeConfigOverrideProposalSubmitRecord,
  RuntimeConfigOverrideRecordSchema,
  RuntimeConfigOverrideProposalSubmitRecordSchema,
  type RuntimeConfigSyncArtifactReviewRecord,
  RuntimeConfigSyncArtifactReviewRecordSchema,
  type RuntimeConfigSyncArtifactRecord,
  RuntimeConfigSyncArtifactRecordSchema,
  runtimeConfigSyncArtifactStatus,
} from "../persistence/postgres/governance";

const RuntimeResolutionRequestBaseFields = {
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  overrides: Schema.Array(ConfigOverrideSchema),
  entitlements: Schema.Array(EntitlementSchema),
};

const RuntimeConfigResolutionRequestSchema = Schema.Struct({
  ...RuntimeResolutionRequestBaseFields,
  key: DeclaredModuleConfigKeySchema,
});

export type RuntimeConfigResolutionRequest = Schema.Schema.Type<
  typeof RuntimeConfigResolutionRequestSchema
>;

const RuntimeFlagResolutionRequestSchema = Schema.Struct({
  ...RuntimeResolutionRequestBaseFields,
  flag: FeatureFlagDeclarationSchema,
});

export type RuntimeFlagResolutionRequest = Schema.Schema.Type<
  typeof RuntimeFlagResolutionRequestSchema
>;

const StoredRuntimeResolutionRequestBaseFields = {
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  entitlements: Schema.Array(EntitlementSchema),
};

const StoredRuntimeConfigResolutionRequestSchema = Schema.Struct({
  ...StoredRuntimeResolutionRequestBaseFields,
  key: DeclaredModuleConfigKeySchema,
});

export type StoredRuntimeConfigResolutionRequest = Schema.Schema.Type<
  typeof StoredRuntimeConfigResolutionRequestSchema
>;

const StoredRuntimeFlagResolutionRequestSchema = Schema.Struct({
  ...StoredRuntimeResolutionRequestBaseFields,
  flag: FeatureFlagDeclarationSchema,
});

export type StoredRuntimeFlagResolutionRequest = Schema.Schema.Type<
  typeof StoredRuntimeFlagResolutionRequestSchema
>;

const RuntimeFeatureFlagRolloutRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  flag: FeatureFlagDeclarationSchema,
});

export type RuntimeFeatureFlagRolloutRequest = Schema.Schema.Type<
  typeof RuntimeFeatureFlagRolloutRequestSchema
>;

const RuntimeFeatureFlagRolloutEvaluationSchema = Schema.Struct({
  effectiveValue: Schema.Boolean,
  definitionExists: Schema.Boolean,
  resolvedScope: Schema.optional(PlatformScopeSchema),
  resolvedScopeId: Schema.optional(Schema.NonEmptyString),
});

export type RuntimeFeatureFlagRolloutEvaluation = Schema.Schema.Type<
  typeof RuntimeFeatureFlagRolloutEvaluationSchema
>;

export type RuntimeFeatureFlagRolloutService = {
  readonly evaluateFeatureFlag: (
    input: RuntimeFeatureFlagRolloutRequest,
  ) => Effect.Effect<
    RuntimeFeatureFlagRolloutEvaluation,
    ParseResult.ParseError
  >;
};

export const RuntimeResolutionResultSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
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
  key: DeclaredRuntimeGovernedKeySchema,
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
    key: DeclaredRuntimeGovernedKeySchema,
    value: DeclaredRuntimeGovernedKeySchema,
  }),
});

export type RuntimeChangeProposalRequest = Schema.Schema.Type<
  typeof RuntimeChangeProposalRequestSchema
>;

const RuntimeChangeProposalPersistRequestSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  renameMap: Schema.Record({
    key: DeclaredRuntimeGovernedKeySchema,
    value: DeclaredRuntimeGovernedKeySchema,
  }),
});

export type RuntimeChangeProposalPersistRequest = Schema.Schema.Type<
  typeof RuntimeChangeProposalPersistRequestSchema
>;

const resolveCascadeCandidates = (requestContext: RequestContext) => {
  const candidates: Array<{
    scope: PlatformScope;
    scopeId: string;
  }> = [];

  switch (requestContext.tenant.scope) {
    case platformScope.individual:
      candidates.push({
        scope: platformScope.individual,
        scopeId:
          requestContext.tenant.individualId ?? requestContext.tenant.scopeId,
      });

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

      break;
    case platformScope.organization:
      candidates.push({
        scope: platformScope.organization,
        scopeId:
          requestContext.tenant.organizationId ?? requestContext.tenant.scopeId,
      });

      if (requestContext.tenant.enterpriseId !== undefined) {
        candidates.push({
          scope: platformScope.enterprise,
          scopeId: requestContext.tenant.enterpriseId,
        });
      }

      break;
    case platformScope.enterprise:
      candidates.push({
        scope: platformScope.enterprise,
        scopeId:
          requestContext.tenant.enterpriseId ?? requestContext.tenant.scopeId,
      });

      break;
    case platformScope.platform:
      break;
  }

  candidates.push({
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  });

  return candidates;
};

const findMatchedEntitlement = (
  moduleId: PlatformModuleId,
  key: FeatureFlagDeclaration["key"],
  requestContext: RequestContext,
  entitlements: readonly Entitlement[],
) =>
  resolveCascadeCandidates(requestContext).find((candidate) =>
    entitlements.some(
      (entitlement) =>
        entitlement.moduleId === moduleId &&
        entitlement.active &&
        entitlement.featureKey === key &&
        entitlement.scope === candidate.scope &&
        entitlement.scopeId === candidate.scopeId,
    ),
  );

const findFeatureFlagDeclaration = (
  moduleId: PlatformModuleId,
  key: FeatureFlagDeclaration["key"],
) =>
  findModuleManifest(moduleId)?.featureFlags.find((flag) => flag.key === key);

const findFeatureFlagDeclarationByKey = (key: FeatureFlagDeclaration["key"]) =>
  platformModuleManifests
    .flatMap((manifest) =>
      manifest.featureFlags.map((flag) => ({
        moduleId: manifest.moduleId,
        flag,
      })),
    )
    .find((record) => record.flag.key === key);

const collectFeatureFlagDependencyModuleIds = (
  moduleId: PlatformModuleId,
  flag: FeatureFlagDeclaration,
  visitedFlagKeys: readonly FeatureFlagDeclaration["key"][] = [],
): readonly PlatformModuleId[] => {
  const moduleIds = new Set<PlatformModuleId>([moduleId]);
  const nextVisitedFlagKeys = [...visitedFlagKeys, flag.key];

  for (const dependencyKey of flag.dependencies) {
    if (nextVisitedFlagKeys.includes(dependencyKey)) {
      continue;
    }

    const dependencyRecord = findFeatureFlagDeclarationByKey(dependencyKey);

    if (dependencyRecord === undefined) {
      continue;
    }

    moduleIds.add(dependencyRecord.moduleId);

    for (const dependencyModuleId of collectFeatureFlagDependencyModuleIds(
      dependencyRecord.moduleId,
      dependencyRecord.flag,
      nextVisitedFlagKeys,
    )) {
      moduleIds.add(dependencyModuleId);
    }
  }

  return [...moduleIds];
};

const findMatchedOverride = (
  moduleId: PlatformModuleId,
  key: DeclaredRuntimeGovernedKey,
  allowedScopes: readonly PlatformScope[],
  requestContext: RequestContext,
  overrides: readonly ConfigOverride[],
) =>
  resolveCascadeCandidates(requestContext)
    .flatMap((candidate) =>
      overrides.filter(
        (override) =>
          override.moduleId === moduleId &&
          override.key === key &&
          override.scope === candidate.scope &&
          override.scopeId === candidate.scopeId &&
          allowedScopes.includes(candidate.scope),
      ),
    )
    .at(0);

const findMatchedConfigOverride = (
  moduleId: PlatformModuleId,
  key: DeclaredRuntimeGovernedKey,
  allowedScopes: readonly PlatformScope[],
  requestContext: RequestContext,
  overrides: readonly ConfigOverride[],
) =>
  resolveCascadeCandidates(requestContext)
    .flatMap((candidate) =>
      overrides.filter(
        (override) =>
          override.moduleId === moduleId &&
          override.key === key &&
          override.scope === candidate.scope &&
          override.scopeId === candidate.scopeId &&
          allowedScopes.includes(candidate.scope),
      ),
    )
    .find((override) => override.value !== configDefaultValue.inherit);

type FeatureFlagRuntimeResolution = Pick<
  RuntimeResolutionResult,
  "effectiveValue" | "source" | "entitled" | "resolvedScope" | "resolvedScopeId"
>;

const resolveFeatureFlagSurrogateState = (
  moduleId: PlatformModuleId,
  flag: FeatureFlagDeclaration,
  requestContext: RequestContext,
  overrides: readonly ConfigOverride[],
  entitlements: readonly Entitlement[],
): FeatureFlagRuntimeResolution => {
  const moduleEnabledKey = getModuleEnabledFeatureFlagKey(moduleId);
  const matchedEntitlement = findMatchedEntitlement(
    moduleId,
    flag.key,
    requestContext,
    entitlements,
  );
  const entitled = matchedEntitlement !== undefined;

  if (flag.billable && flag.key !== moduleEnabledKey && !entitled) {
    return {
      effectiveValue: false,
      source: runtimeResolutionSource.unentitledDefault,
      entitled: false,
    };
  }

  const matchedOverride = findMatchedOverride(
    moduleId,
    flag.key,
    flag.allowedScopes,
    requestContext,
    overrides,
  );

  if (matchedOverride !== undefined) {
    const effectiveValue = Boolean(matchedOverride.value);

    return {
      effectiveValue,
      source: runtimeResolutionSource.runtimeOverride,
      entitled: true,
      resolvedScope: matchedOverride.scope,
      resolvedScopeId: matchedOverride.scopeId,
    };
  }

  if (entitled) {
    return {
      effectiveValue: true,
      source: runtimeResolutionSource.entitlement,
      entitled: true,
      resolvedScope: matchedEntitlement.scope,
      resolvedScopeId: matchedEntitlement.scopeId,
    };
  }

  if (flag.defaultEnabled) {
    return {
      effectiveValue: true,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    };
  }

  return {
    effectiveValue: false,
    source: flag.billable
      ? runtimeResolutionSource.unentitledDefault
      : runtimeResolutionSource.codeDefault,
    entitled: !flag.billable,
  };
};

const resolveFeatureFlagState = (input: {
  readonly moduleId: PlatformModuleId;
  readonly flag: FeatureFlagDeclaration;
  readonly requestContext: RequestContext;
  readonly overrides: readonly ConfigOverride[];
  readonly entitlements: readonly Entitlement[];
  readonly featureFlagRollout?: RuntimeFeatureFlagRolloutService;
  readonly visitedFlagKeys?: readonly FeatureFlagDeclaration["key"][];
}): Effect.Effect<FeatureFlagRuntimeResolution, ParseResult.ParseError> => {
  return Effect.gen(function* () {
    const moduleEnabledKey = getModuleEnabledFeatureFlagKey(input.moduleId);
    const matchedEntitlement = findMatchedEntitlement(
      input.moduleId,
      input.flag.key,
      input.requestContext,
      input.entitlements,
    );
    const entitled = matchedEntitlement !== undefined;

    if (input.flag.lifecycle === featureFlagLifecycle.retired) {
      return {
        effectiveValue: false,
        source: runtimeResolutionSource.retired,
        entitled: input.flag.billable ? entitled : true,
      } satisfies FeatureFlagRuntimeResolution;
    }

    const matchedOverride = findMatchedOverride(
      input.moduleId,
      input.flag.key,
      input.flag.allowedScopes,
      input.requestContext,
      input.overrides,
    );

    if (input.flag.billable && !entitled) {
      if (
        input.flag.key === moduleEnabledKey &&
        matchedOverride !== undefined
      ) {
        const effectiveValue = Boolean(matchedOverride.value);

        return {
          effectiveValue,
          source: runtimeResolutionSource.runtimeOverride,
          entitled: false,
          resolvedScope: matchedOverride.scope,
          resolvedScopeId: matchedOverride.scopeId,
        } satisfies FeatureFlagRuntimeResolution;
      }

      return {
        effectiveValue: false,
        source: runtimeResolutionSource.unentitledDefault,
        entitled: false,
      } satisfies FeatureFlagRuntimeResolution;
    }

    const visitedFlagKeys = [...(input.visitedFlagKeys ?? []), input.flag.key];
    const dependencyResolutions = yield* Effect.forEach(
      input.flag.dependencies,
      (dependencyKey) => {
        if (visitedFlagKeys.includes(dependencyKey)) {
          return Effect.succeed(false);
        }

        const dependencyRecord = findFeatureFlagDeclarationByKey(dependencyKey);

        if (dependencyRecord === undefined) {
          return Effect.succeed(false);
        }

        return resolveFeatureFlagState({
          moduleId: dependencyRecord.moduleId,
          flag: dependencyRecord.flag,
          requestContext: input.requestContext,
          overrides: input.overrides,
          entitlements: input.entitlements,
          ...(input.featureFlagRollout !== undefined
            ? { featureFlagRollout: input.featureFlagRollout }
            : {}),
          visitedFlagKeys,
        }).pipe(Effect.map((resolution) => resolution.effectiveValue));
      },
    );

    if (dependencyResolutions.some((resolution) => !resolution)) {
      return {
        effectiveValue: false,
        source: runtimeResolutionSource.dependencyDisabled,
        entitled: input.flag.billable ? entitled : true,
      } satisfies FeatureFlagRuntimeResolution;
    }

    if (matchedOverride !== undefined) {
      const effectiveValue = Boolean(matchedOverride.value);

      return {
        effectiveValue,
        source: runtimeResolutionSource.runtimeOverride,
        entitled: true,
        resolvedScope: matchedOverride.scope,
        resolvedScopeId: matchedOverride.scopeId,
      } satisfies FeatureFlagRuntimeResolution;
    }

    if (input.featureFlagRollout !== undefined) {
      return yield* input.featureFlagRollout
        .evaluateFeatureFlag({
          requestContext: input.requestContext,
          moduleId: input.moduleId,
          flag: input.flag,
        })
        .pipe(
          Effect.map((rolloutResolution) => {
            if (!rolloutResolution.definitionExists) {
              return resolveFeatureFlagSurrogateState(
                input.moduleId,
                input.flag,
                input.requestContext,
                input.overrides,
                input.entitlements,
              );
            }

            return {
              effectiveValue: rolloutResolution.effectiveValue,
              source: runtimeResolutionSource.rollout,
              entitled: input.flag.billable
                ? input.flag.key === moduleEnabledKey
                  ? entitled || rolloutResolution.effectiveValue
                  : true
                : true,
              ...(rolloutResolution.resolvedScope !== undefined
                ? { resolvedScope: rolloutResolution.resolvedScope }
                : {}),
              ...(rolloutResolution.resolvedScopeId !== undefined
                ? { resolvedScopeId: rolloutResolution.resolvedScopeId }
                : {}),
            } satisfies FeatureFlagRuntimeResolution;
          }),
        );
    }

    return resolveFeatureFlagSurrogateState(
      input.moduleId,
      input.flag,
      input.requestContext,
      input.overrides,
      input.entitlements,
    );
  });
};

const resolveModuleEnabledState = (
  moduleId: PlatformModuleId,
  requestContext: RequestContext,
  overrides: readonly ConfigOverride[],
  entitlements: readonly Entitlement[],
  featureFlagRollout?: RuntimeFeatureFlagRolloutService,
): Effect.Effect<FeatureFlagRuntimeResolution, ParseResult.ParseError> => {
  const enabledFlag = findFeatureFlagDeclaration(
    moduleId,
    getModuleEnabledFeatureFlagKey(moduleId),
  );

  if (enabledFlag === undefined) {
    return Effect.succeed({
      effectiveValue: true,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    });
  }

  return resolveFeatureFlagState({
    moduleId,
    flag: enabledFlag,
    requestContext,
    overrides,
    entitlements,
    ...(featureFlagRollout !== undefined ? { featureFlagRollout } : {}),
  });
};

const findDeclaration = (
  moduleId: PlatformModuleId,
  key: DeclaredModuleConfigKey,
) =>
  findModuleManifest(moduleId)?.configKeys.find(
    (configKey) => configKey.key === key,
  );

export type UnknownConfigKeyError = {
  readonly _tag: "UnknownConfigKeyError";
  readonly key: DeclaredModuleConfigKey;
};

export type RuntimeConfigPersistenceNotConfiguredError = {
  readonly _tag: "RuntimeConfigPersistenceNotConfiguredError";
  readonly operation:
    | "resolveStoredConfigValue"
    | "resolveStoredFeatureFlag"
    | "listOverridesByModule"
    | "listOverrideProposalsByModule"
    | "upsertOverride"
    | "submitOverrideProposal"
    | "reviewChangeProposal"
    | "persistChangeProposals"
    | "listChangeProposalsByModule";
};

export type RuntimeConfigModulePersistenceError =
  | ParseResult.ParseError
  | RuntimeConfigPostgresRepositoryError
  | RuntimeConfigPersistenceNotConfiguredError;

const requireRuntimeConfigRepository = <A, E>(
  repository: RuntimeConfigPostgresRepositoryService | undefined,
  operation: RuntimeConfigPersistenceNotConfiguredError["operation"],
  useRepository: (
    runtimeConfigRepository: RuntimeConfigPostgresRepositoryService,
  ) => Effect.Effect<A, E>,
) =>
  Effect.fromNullable(repository).pipe(
    Effect.mapError(
      (): RuntimeConfigPersistenceNotConfiguredError => ({
        _tag: "RuntimeConfigPersistenceNotConfiguredError",
        operation,
      }),
    ),
    Effect.flatMap(useRepository),
  );

const resolveDecodedConfigValue =
  (featureFlagRollout?: RuntimeFeatureFlagRolloutService) =>
  (
    request: RuntimeConfigResolutionRequest,
  ): Effect.Effect<
    RuntimeResolutionResult,
    ParseResult.ParseError | UnknownConfigKeyError
  > =>
    Effect.gen(function* () {
      const declaration = findDeclaration(request.moduleId, request.key);
      if (declaration === undefined) {
        return yield* Effect.fail({
          _tag: "UnknownConfigKeyError",
          key: request.key,
        } satisfies UnknownConfigKeyError);
      }

      const moduleState = declaration.billable
        ? yield* resolveModuleEnabledState(
            request.moduleId,
            request.requestContext,
            request.overrides,
            request.entitlements,
            featureFlagRollout,
          )
        : undefined;

      if (
        declaration.billable &&
        moduleState !== undefined &&
        !moduleState.effectiveValue
      ) {
        return yield* decodeRuntimeResolutionResult({
          moduleId: request.moduleId,
          key: request.key,
          effectiveValue: declaration.defaultValue,
          source: moduleState.source,
          entitled: false,
          ...(moduleState.resolvedScope !== undefined
            ? { resolvedScope: moduleState.resolvedScope }
            : {}),
          ...(moduleState.resolvedScopeId !== undefined
            ? { resolvedScopeId: moduleState.resolvedScopeId }
            : {}),
        } satisfies RuntimeResolutionResult);
      }

      const matchedOverride = findMatchedConfigOverride(
        request.moduleId,
        request.key,
        declaration.allowedScopes,
        request.requestContext,
        request.overrides,
      );

      return yield* decodeRuntimeResolutionResult(
        (matchedOverride === undefined
          ? {
              moduleId: request.moduleId,
              key: request.key,
              effectiveValue: declaration.defaultValue,
              source: runtimeResolutionSource.codeDefault,
              entitled: declaration.billable
                ? (moduleState?.entitled ?? false)
                : true,
            }
          : {
              moduleId: request.moduleId,
              key: request.key,
              effectiveValue: matchedOverride.value,
              source: runtimeResolutionSource.runtimeOverride,
              entitled: declaration.billable
                ? (moduleState?.entitled ?? false)
                : true,
              resolvedScope: matchedOverride.scope,
              resolvedScopeId: matchedOverride.scopeId,
            }) satisfies RuntimeResolutionResult,
      );
    });

const resolveDecodedFeatureFlag =
  (featureFlagRollout?: RuntimeFeatureFlagRolloutService) =>
  (
    request: RuntimeFlagResolutionRequest,
  ): Effect.Effect<RuntimeResolutionResult, ParseResult.ParseError> =>
    Effect.gen(function* () {
      const moduleEnabledKey = getModuleEnabledFeatureFlagKey(request.moduleId);
      const moduleState = yield* resolveModuleEnabledState(
        request.moduleId,
        request.requestContext,
        request.overrides,
        request.entitlements,
        featureFlagRollout,
      );

      if (
        request.flag.key !== moduleEnabledKey &&
        !moduleState.effectiveValue
      ) {
        const matchedEntitlement = request.flag.billable
          ? findMatchedEntitlement(
              request.moduleId,
              request.flag.key,
              request.requestContext,
              request.entitlements,
            )
          : undefined;

        return yield* decodeRuntimeResolutionResult({
          moduleId: request.moduleId,
          key: request.flag.key,
          effectiveValue: false,
          source: moduleState.source,
          entitled: request.flag.billable
            ? matchedEntitlement !== undefined
            : true,
          ...(moduleState.resolvedScope !== undefined
            ? { resolvedScope: moduleState.resolvedScope }
            : {}),
          ...(moduleState.resolvedScopeId !== undefined
            ? { resolvedScopeId: moduleState.resolvedScopeId }
            : {}),
        } satisfies RuntimeResolutionResult);
      }

      const resolution =
        request.flag.key === moduleEnabledKey
          ? moduleState
          : yield* resolveFeatureFlagState({
              moduleId: request.moduleId,
              flag: request.flag,
              requestContext: request.requestContext,
              overrides: request.overrides,
              entitlements: request.entitlements,
              ...(featureFlagRollout !== undefined
                ? { featureFlagRollout }
                : {}),
            });

      return yield* decodeRuntimeResolutionResult({
        moduleId: request.moduleId,
        key: request.flag.key,
        effectiveValue: resolution.effectiveValue,
        source: resolution.source,
        entitled: resolution.entitled,
        ...(resolution.resolvedScope !== undefined
          ? { resolvedScope: resolution.resolvedScope }
          : {}),
        ...(resolution.resolvedScopeId !== undefined
          ? { resolvedScopeId: resolution.resolvedScopeId }
          : {}),
      } satisfies RuntimeResolutionResult);
    });

const buildDecodedChangeProposals = (request: RuntimeChangeProposalRequest) => {
  const moduleManifest = findModuleManifest(request.moduleId);
  const declaredConfigKeys = new Map(
    (moduleManifest?.configKeys ?? []).map((configKey) => [
      configKey.key,
      configKey,
    ]),
  );

  return decodeRuntimeChangeProposalList(
    request.overrides
      .filter((override) => override.moduleId === request.moduleId)
      .map((override) => {
        const renamedKey = request.renameMap[override.key];
        const declaredConfigKey = declaredConfigKeys.get(override.key);
        const action = renamedKey
          ? runtimeChangeProposalAction.rename
          : declaredConfigKey !== undefined
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
            : declaredConfigKey !== undefined
              ? "Approved runtime override differs from the code-declared baseline."
              : "Runtime key no longer exists in the code-declared manifest.",
          runtimeValue: override.value,
          ...(renamedKey !== undefined ? { codeValue: renamedKey } : {}),
          ...(renamedKey === undefined && declaredConfigKey !== undefined
            ? { codeValue: declaredConfigKey.defaultValue }
            : {}),
        };
      }),
  );
};

const buildSyncArtifactRecords = (
  proposals: readonly RuntimeChangeProposal[],
) => {
  const generatedAt = new Date().toISOString();

  return Effect.forEach(proposals, (proposal) =>
    Schema.decodeUnknown(RuntimeConfigSyncArtifactRecordSchema)({
      proposalId: proposal.proposalId,
      moduleId: proposal.moduleId,
      key: proposal.key,
      action: proposal.action,
      artifactPath: proposal.artifactPath,
      ...(proposal.runtimeValue !== undefined
        ? { runtimeValue: proposal.runtimeValue }
        : {}),
      ...(proposal.codeValue !== undefined
        ? { codeValue: proposal.codeValue }
        : {}),
      status: runtimeConfigSyncArtifactStatus.pending,
      generatedAt,
    }),
  );
};

export type RuntimeConfigModuleService = {
  readonly resolveConfigValue: (
    input: RuntimeConfigResolutionRequest,
  ) => Effect.Effect<
    RuntimeResolutionResult,
    ParseResult.ParseError | UnknownConfigKeyError
  >;
  readonly resolveStoredConfigValue: (
    input: StoredRuntimeConfigResolutionRequest,
  ) => Effect.Effect<
    RuntimeResolutionResult,
    UnknownConfigKeyError | RuntimeConfigModulePersistenceError
  >;
  readonly resolveFeatureFlag: (
    input: RuntimeFlagResolutionRequest,
  ) => Effect.Effect<RuntimeResolutionResult, ParseResult.ParseError>;
  readonly resolveStoredFeatureFlag: (
    input: StoredRuntimeFlagResolutionRequest,
  ) => Effect.Effect<
    RuntimeResolutionResult,
    RuntimeConfigModulePersistenceError
  >;
  readonly buildChangeProposals: (
    input: RuntimeChangeProposalRequest,
  ) => Effect.Effect<readonly RuntimeChangeProposal[], ParseResult.ParseError>;
  readonly listOverridesByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<
    readonly RuntimeConfigOverrideRecord[],
    RuntimeConfigModulePersistenceError
  >;
  readonly listOverrideProposalsByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<
    readonly RuntimeConfigOverrideProposalRecord[],
    RuntimeConfigModulePersistenceError
  >;
  readonly upsertOverride: (
    input: RuntimeConfigOverrideRecord,
  ) => Effect.Effect<
    RuntimeConfigOverrideRecord,
    RuntimeConfigModulePersistenceError
  >;
  readonly submitOverrideProposal: (
    input: RuntimeConfigOverrideProposalSubmitRecord,
  ) => Effect.Effect<
    RuntimeConfigOverrideProposalRecord,
    RuntimeConfigModulePersistenceError
  >;
  readonly reviewChangeProposal: (
    input: RuntimeConfigSyncArtifactReviewRecord,
  ) => Effect.Effect<
    RuntimeConfigSyncArtifactRecord,
    RuntimeConfigModulePersistenceError
  >;
  readonly persistChangeProposals: (
    input: RuntimeChangeProposalPersistRequest,
  ) => Effect.Effect<
    readonly RuntimeConfigSyncArtifactRecord[],
    RuntimeConfigModulePersistenceError
  >;
  readonly listChangeProposalsByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<
    readonly RuntimeConfigSyncArtifactRecord[],
    RuntimeConfigModulePersistenceError
  >;
};

export class RuntimeConfigModule extends Context.Tag("RuntimeConfigModule")<
  RuntimeConfigModule,
  RuntimeConfigModuleService
>() {}

export const makeRuntimeConfigModule = (
  runtimeConfigRepository?: RuntimeConfigPostgresRepositoryService,
  featureFlagRollout?: RuntimeFeatureFlagRolloutService,
) =>
  Effect.succeed<RuntimeConfigModuleService>({
    resolveConfigValue: (input: RuntimeConfigResolutionRequest) =>
      Schema.decodeUnknown(RuntimeConfigResolutionRequestSchema)(input).pipe(
        Effect.flatMap(resolveDecodedConfigValue(featureFlagRollout)),
      ),
    resolveStoredConfigValue: (input: StoredRuntimeConfigResolutionRequest) =>
      Schema.decodeUnknown(StoredRuntimeConfigResolutionRequestSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "resolveStoredConfigValue",
            (repository) => repository.listOverridesByModule(request.moduleId),
          ).pipe(
            Effect.flatMap((overrides) =>
              resolveDecodedConfigValue(featureFlagRollout)({
                ...request,
                overrides,
              }),
            ),
          ),
        ),
      ),
    resolveFeatureFlag: (input: RuntimeFlagResolutionRequest) =>
      Schema.decodeUnknown(RuntimeFlagResolutionRequestSchema)(input).pipe(
        Effect.flatMap(resolveDecodedFeatureFlag(featureFlagRollout)),
      ),
    resolveStoredFeatureFlag: (input: StoredRuntimeFlagResolutionRequest) =>
      Schema.decodeUnknown(StoredRuntimeFlagResolutionRequestSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          Effect.succeed(
            collectFeatureFlagDependencyModuleIds(
              request.moduleId,
              request.flag,
            ),
          ).pipe(
            Effect.flatMap((moduleIds) =>
              requireRuntimeConfigRepository(
                runtimeConfigRepository,
                "resolveStoredFeatureFlag",
                (repository) =>
                  Effect.forEach(
                    moduleIds,
                    (moduleId) => repository.listOverridesByModule(moduleId),
                    { concurrency: 1 },
                  ).pipe(Effect.map((overrideLists) => overrideLists.flat())),
              ).pipe(
                Effect.flatMap((overrides) =>
                  resolveDecodedFeatureFlag(featureFlagRollout)({
                    ...request,
                    overrides,
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    buildChangeProposals: (input: RuntimeChangeProposalRequest) =>
      Schema.decodeUnknown(RuntimeChangeProposalRequestSchema)(input).pipe(
        Effect.flatMap(buildDecodedChangeProposals),
      ),
    listOverridesByModule: (moduleId: PlatformModuleId) =>
      Schema.decodeUnknown(PlatformModuleIdSchema)(moduleId).pipe(
        Effect.flatMap((decodedModuleId) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "listOverridesByModule",
            (repository) => repository.listOverridesByModule(decodedModuleId),
          ),
        ),
      ),
    listOverrideProposalsByModule: (moduleId: PlatformModuleId) =>
      Schema.decodeUnknown(PlatformModuleIdSchema)(moduleId).pipe(
        Effect.flatMap((decodedModuleId) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "listOverrideProposalsByModule",
            (repository) =>
              repository.listOverrideProposalsByModule(decodedModuleId),
          ),
        ),
      ),
    upsertOverride: (input: RuntimeConfigOverrideRecord) =>
      Schema.decodeUnknown(RuntimeConfigOverrideRecordSchema)(input).pipe(
        Effect.flatMap((override) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "upsertOverride",
            (repository) => repository.upsertOverride(override),
          ),
        ),
      ),
    submitOverrideProposal: (
      input: RuntimeConfigOverrideProposalSubmitRecord,
    ) =>
      Schema.decodeUnknown(RuntimeConfigOverrideProposalSubmitRecordSchema)(
        input,
      ).pipe(
        Effect.flatMap((proposal) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "submitOverrideProposal",
            (repository) => repository.submitOverrideProposal(proposal),
          ),
        ),
      ),
    reviewChangeProposal: (input: RuntimeConfigSyncArtifactReviewRecord) =>
      Schema.decodeUnknown(RuntimeConfigSyncArtifactReviewRecordSchema)(
        input,
      ).pipe(
        Effect.flatMap((review) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "reviewChangeProposal",
            (repository) => repository.reviewSyncArtifact(review),
          ),
        ),
      ),
    persistChangeProposals: (input: RuntimeChangeProposalPersistRequest) =>
      Schema.decodeUnknown(RuntimeChangeProposalPersistRequestSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "persistChangeProposals",
            (repository) => repository.listOverridesByModule(request.moduleId),
          ).pipe(
            Effect.flatMap((overrides) =>
              buildDecodedChangeProposals({
                moduleId: request.moduleId,
                overrides,
                renameMap: request.renameMap,
              }),
            ),
            Effect.flatMap(buildSyncArtifactRecords),
            Effect.flatMap((artifacts) =>
              requireRuntimeConfigRepository(
                runtimeConfigRepository,
                "persistChangeProposals",
                (repository) => repository.persistSyncArtifacts(artifacts),
              ),
            ),
          ),
        ),
      ),
    listChangeProposalsByModule: (moduleId: PlatformModuleId) =>
      Schema.decodeUnknown(PlatformModuleIdSchema)(moduleId).pipe(
        Effect.flatMap((decodedModuleId) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "listChangeProposalsByModule",
            (repository) =>
              repository.listSyncArtifactsByModule(decodedModuleId),
          ),
        ),
      ),
  });

export const RuntimeConfigModuleLive = Layer.effect(
  RuntimeConfigModule,
  RuntimeConfigPostgresRepository.pipe(Effect.flatMap(makeRuntimeConfigModule)),
);
