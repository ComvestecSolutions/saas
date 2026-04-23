import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { findModuleManifest } from "@comvestec/config";
import {
  type ConfigOverride,
  type DeclaredModuleConfigKey,
  DeclaredModuleConfigKeySchema,
  type DeclaredRuntimeGovernedKey,
  DeclaredRuntimeGovernedKeySchema,
  ConfigOverrideSchema,
  type Entitlement,
  EntitlementSchema,
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
  RuntimeConfigOverrideRecordSchema,
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

const hasDirectEntitlement = (
  moduleId: PlatformModuleId,
  key: FeatureFlagDeclaration["key"],
  requestContext: RequestContext,
  entitlements: readonly Entitlement[],
) =>
  entitlements.some(
    (entitlement) =>
      entitlement.moduleId === moduleId &&
      entitlement.active &&
      entitlement.featureKey === key &&
      entitlement.scope === requestContext.tenant.scope &&
      entitlement.scopeId === requestContext.tenant.scopeId,
  );

const findFeatureFlagDeclaration = (
  moduleId: PlatformModuleId,
  key: FeatureFlagDeclaration["key"],
) =>
  findModuleManifest(moduleId)?.featureFlags.find((flag) => flag.key === key);

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

type FeatureFlagRuntimeResolution = Pick<
  RuntimeResolutionResult,
  "effectiveValue" | "source" | "entitled" | "resolvedScope" | "resolvedScopeId"
>;

const resolveFeatureFlagState = (
  moduleId: PlatformModuleId,
  flag: FeatureFlagDeclaration,
  requestContext: RequestContext,
  overrides: readonly ConfigOverride[],
  entitlements: readonly Entitlement[],
): FeatureFlagRuntimeResolution => {
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
      entitled: effectiveValue,
      resolvedScope: matchedOverride.scope,
      resolvedScopeId: matchedOverride.scopeId,
    };
  }

  if (hasDirectEntitlement(moduleId, flag.key, requestContext, entitlements)) {
    return {
      effectiveValue: true,
      source: runtimeResolutionSource.entitlement,
      entitled: true,
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
    entitled: false,
  };
};

const resolveModuleEnabledState = (
  moduleId: PlatformModuleId,
  requestContext: RequestContext,
  overrides: readonly ConfigOverride[],
  entitlements: readonly Entitlement[],
): FeatureFlagRuntimeResolution => {
  const enabledFlag = findFeatureFlagDeclaration(
    moduleId,
    getModuleEnabledFeatureFlagKey(moduleId),
  );

  if (enabledFlag === undefined) {
    return {
      effectiveValue: true,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    };
  }

  return resolveFeatureFlagState(
    moduleId,
    enabledFlag,
    requestContext,
    overrides,
    entitlements,
  );
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
    | "upsertOverride"
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

const resolveDecodedConfigValue = (
  request: RuntimeConfigResolutionRequest,
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
    resolveModuleEnabledState(
      request.moduleId,
      request.requestContext,
      request.overrides,
      request.entitlements,
    ).effectiveValue;

  if (!entitled) {
    return decodeRuntimeResolutionResult({
      moduleId: request.moduleId,
      key: request.key,
      effectiveValue: declaration.defaultValue,
      source: runtimeResolutionSource.unentitledDefault,
      entitled: false,
    } satisfies RuntimeResolutionResult);
  }

  const matchedOverride = findMatchedOverride(
    request.moduleId,
    request.key,
    declaration.allowedScopes,
    request.requestContext,
    request.overrides,
  );

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
};

const resolveDecodedFeatureFlag = (request: RuntimeFlagResolutionRequest) => {
  const moduleEnabledKey = getModuleEnabledFeatureFlagKey(request.moduleId);
  const moduleState = resolveModuleEnabledState(
    request.moduleId,
    request.requestContext,
    request.overrides,
    request.entitlements,
  );

  if (request.flag.key !== moduleEnabledKey && !moduleState.effectiveValue) {
    return decodeRuntimeResolutionResult({
      moduleId: request.moduleId,
      key: request.flag.key,
      effectiveValue: false,
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

  const resolution =
    request.flag.key === moduleEnabledKey
      ? moduleState
      : resolveFeatureFlagState(
          request.moduleId,
          request.flag,
          request.requestContext,
          request.overrides,
          request.entitlements,
        );

  return decodeRuntimeResolutionResult({
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
};

const buildDecodedChangeProposals = (request: RuntimeChangeProposalRequest) => {
  const moduleManifest = findModuleManifest(request.moduleId);
  const declaredKeys = new Set<string>(
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
          ...(renamedKey !== undefined ? { codeValue: renamedKey } : {}),
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
  readonly upsertOverride: (
    input: RuntimeConfigOverrideRecord,
  ) => Effect.Effect<
    RuntimeConfigOverrideRecord,
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
) =>
  Effect.succeed<RuntimeConfigModuleService>({
    resolveConfigValue: (input: RuntimeConfigResolutionRequest) =>
      Schema.decodeUnknown(RuntimeConfigResolutionRequestSchema)(input).pipe(
        Effect.flatMap(resolveDecodedConfigValue),
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
              resolveDecodedConfigValue({
                ...request,
                overrides,
              }),
            ),
          ),
        ),
      ),
    resolveFeatureFlag: (input: RuntimeFlagResolutionRequest) =>
      Schema.decodeUnknown(RuntimeFlagResolutionRequestSchema)(input).pipe(
        Effect.flatMap(resolveDecodedFeatureFlag),
      ),
    resolveStoredFeatureFlag: (input: StoredRuntimeFlagResolutionRequest) =>
      Schema.decodeUnknown(StoredRuntimeFlagResolutionRequestSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          requireRuntimeConfigRepository(
            runtimeConfigRepository,
            "resolveStoredFeatureFlag",
            (repository) => repository.listOverridesByModule(request.moduleId),
          ).pipe(
            Effect.flatMap((overrides) =>
              resolveDecodedFeatureFlag({
                ...request,
                overrides,
              }),
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
