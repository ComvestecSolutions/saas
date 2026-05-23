import { Effect } from "effect";
import {
  actorType,
  auditLogAuditAction,
  identityClaimKey,
  authorizationAuditAction,
  fileStorageAuditAction,
  runtimeConfigAuditAction,
  supportOperationsAuditAction,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsImpersonationSessionStatus,
  type FeatureFlagDeclaration,
  platformModuleId,
  platformScope,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  type AuditEvent,
  type PlatformModuleId,
} from "@comvestec/contracts";
import {
  configDefaultValue,
  emailDeliveryFeatureFlag,
  featureFlagsFeatureFlag,
  findModuleManifest,
  runtimeConfigConfigKey,
  runtimeConfigFeatureFlag,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import {
  createSupportOperationsBreakGlassIncidentRecord,
  createSupportOperationsImpersonationSessionRecord,
  makeAuditLogModule,
  makeRuntimeConfigModule,
  makeSupportOperationsModule,
  type AuditLogPostgresRepositoryService,
  revokeSupportOperationsImpersonationSession,
  reviewSupportOperationsBreakGlassIncident,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigPostgresRepositoryService,
  type RuntimeFeatureFlagRolloutService,
  runtimeConfigProposalDecisionStatus,
  type RuntimeConfigSyncArtifactReviewRecord,
  type RuntimeConfigSyncArtifactRecord,
  runtimeConfigSyncArtifactStatus,
} from "@comvestec/modules";
import { KeycloakAdapter, makeKeycloakAdapter } from "@comvestec/platform";
import { createKeycloakTestOptions } from "../platform-adapter-doubles";
import { organizationRequestContext, supportRequestContext } from "./_fixtures";

const makeInMemoryAuditLogRepository =
  (): AuditLogPostgresRepositoryService => {
    const maxEvents = 500;
    const events: AuditEvent[] = [];

    return {
      insertAuditEvent: (event) =>
        Effect.sync(() => {
          if (events.length >= maxEvents) {
            events.shift();
          }
          events.push(event);
          return event;
        }),
      queryByModule: (moduleId: PlatformModuleId) =>
        Effect.succeed(events.filter((e) => e.moduleId === moduleId)),
      queryByTarget: (input) =>
        Effect.succeed(
          events.filter(
            (event) =>
              event.moduleId === input.moduleId &&
              event.target === input.target,
          ),
        ),
      queryByActor: (actorId) =>
        Effect.succeed(events.filter((event) => event.actorId === actorId)),
      queryByTenant: (input) =>
        Effect.succeed(
          events.filter(
            (event) =>
              event.tenantScope === input.tenantScope &&
              event.tenantScopeId === input.tenantScopeId,
          ),
        ),
    };
  };

const makeInMemoryRuntimeConfigRepository =
  (): RuntimeConfigPostgresRepositoryService => {
    const overrides = new Map<string, RuntimeConfigOverrideRecord>();
    const artifacts = new Map<string, RuntimeConfigSyncArtifactRecord>();

    const overrideKey = (override: RuntimeConfigOverrideRecord) =>
      `${override.moduleId}:${override.key}:${override.scope}:${override.scopeId}`;

    const artifactPayloadChanged = (
      current: RuntimeConfigSyncArtifactRecord,
      next: RuntimeConfigSyncArtifactRecord,
    ) =>
      current.action !== next.action ||
      current.artifactPath !== next.artifactPath ||
      JSON.stringify(current.runtimeValue ?? null) !==
        JSON.stringify(next.runtimeValue ?? null) ||
      JSON.stringify(current.codeValue ?? null) !==
        JSON.stringify(next.codeValue ?? null);

    const artifactRepresentsResolvedUpdate = (
      artifact: RuntimeConfigSyncArtifactRecord,
    ) =>
      artifact.action === runtimeChangeProposalAction.update &&
      artifact.runtimeValue !== undefined &&
      artifact.codeValue !== undefined &&
      JSON.stringify(artifact.runtimeValue) ===
        JSON.stringify(artifact.codeValue);

    const isApprovedToAppliedTransition = (
      current: RuntimeConfigSyncArtifactRecord,
      next: RuntimeConfigSyncArtifactRecord,
    ) =>
      current.status === runtimeConfigSyncArtifactStatus.approved &&
      artifactRepresentsResolvedUpdate(next);

    const applyExistingDecisionMetadata = (
      artifact: RuntimeConfigSyncArtifactRecord,
      existingArtifact: RuntimeConfigSyncArtifactRecord,
    ): RuntimeConfigSyncArtifactRecord => ({
      ...artifact,
      ...(existingArtifact.decidedBy !== undefined
        ? { decidedBy: existingArtifact.decidedBy }
        : {}),
      ...(existingArtifact.decisionReason !== undefined
        ? { decisionReason: existingArtifact.decisionReason }
        : {}),
      ...(existingArtifact.decidedAt !== undefined
        ? { decidedAt: existingArtifact.decidedAt }
        : {}),
    });

    return {
      listOverridesByModule: (moduleId: PlatformModuleId) =>
        Effect.succeed(
          [...overrides.values()].filter(
            (override) => override.moduleId === moduleId,
          ),
        ),
      upsertOverride: (input) =>
        Effect.sync(() => {
          overrides.set(overrideKey(input), input);
          return input;
        }),
      listOverrideProposalsByModule: () => Effect.succeed([]),
      submitOverrideProposal: (input) =>
        Effect.succeed({
          ...input,
          status: runtimeConfigSyncArtifactStatus.pending,
        }),
      reviewSyncArtifact: (
        input: RuntimeConfigSyncArtifactReviewRecord,
      ): ReturnType<
        RuntimeConfigPostgresRepositoryService["reviewSyncArtifact"]
      > => {
        const artifact = artifacts.get(input.proposalId);

        if (artifact === undefined) {
          return Effect.fail({
            _tag: "RuntimeConfigSyncArtifactNotFoundError",
            proposalId: input.proposalId,
          } as const);
        }

        if (artifact.status !== runtimeConfigSyncArtifactStatus.pending) {
          return Effect.fail({
            _tag: "RuntimeConfigSyncArtifactReviewConflictError",
            proposalId: input.proposalId,
            status: artifact.status,
          } as const);
        }

        const updatedArtifact: RuntimeConfigSyncArtifactRecord = {
          ...artifact,
          status: input.status,
          decidedBy: input.decidedBy,
          decisionReason: input.decisionReason,
          decidedAt: input.decidedAt,
        };

        artifacts.set(input.proposalId, updatedArtifact);
        return Effect.succeed(updatedArtifact);
      },
      listSyncArtifactsByModule: (moduleId: PlatformModuleId) =>
        Effect.succeed(
          [...artifacts.values()].filter(
            (artifact) => artifact.moduleId === moduleId,
          ),
        ),
      persistSyncArtifacts: (input) =>
        Effect.sync(() => {
          const storedArtifacts: RuntimeConfigSyncArtifactRecord[] = [];

          for (const artifact of input) {
            const existingArtifact = artifacts.get(artifact.proposalId);

            const storedArtifact =
              existingArtifact === undefined
                ? artifact
                : artifactPayloadChanged(existingArtifact, artifact)
                  ? isApprovedToAppliedTransition(existingArtifact, artifact)
                    ? applyExistingDecisionMetadata(
                        {
                          ...artifact,
                          status: runtimeConfigSyncArtifactStatus.applied,
                        },
                        existingArtifact,
                      )
                    : artifact
                  : applyExistingDecisionMetadata(
                      {
                        ...artifact,
                        status: existingArtifact.status,
                      },
                      existingArtifact,
                    );

            artifacts.set(artifact.proposalId, storedArtifact);
            storedArtifacts.push(storedArtifact);
          }

          return storedArtifacts;
        }),
    };
  };

const createFeatureFlagRollout = (
  evaluations: Readonly<
    Record<
      string,
      {
        readonly effectiveValue: boolean;
        readonly definitionExists: boolean;
        readonly resolvedScope?: (typeof platformScope)[keyof typeof platformScope];
        readonly resolvedScopeId?: string;
      }
    >
  >,
): RuntimeFeatureFlagRolloutService => ({
  evaluateFeatureFlag: (input) =>
    Effect.succeed(
      evaluations[input.flag.key] ?? {
        effectiveValue: input.flag.defaultEnabled,
        definitionExists: false,
      },
    ),
});

const getDeclaredFeatureFlag = (
  moduleId: PlatformModuleId,
  key: FeatureFlagDeclaration["key"],
) => {
  const featureFlag = findModuleManifest(moduleId)?.featureFlags.find(
    (candidate) => candidate.key === key,
  );

  if (featureFlag === undefined) {
    throw new Error(`Expected declared feature flag ${key}.`);
  }

  return featureFlag;
};

const makeSupportOperationsTestModule = async () => {
  const keycloak = await Effect.runPromise(
    makeKeycloakAdapter(createKeycloakTestOptions()),
  );

  return Effect.runPromise(
    makeSupportOperationsModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
    ),
  );
};

const makeSupportOperationsTestModuleWithKeycloakOverrides = async (
  overrides: Parameters<typeof createKeycloakTestOptions>[0],
) => {
  const keycloak = await Effect.runPromise(
    makeKeycloakAdapter(createKeycloakTestOptions(overrides)),
  );

  return Effect.runPromise(
    makeSupportOperationsModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
    ),
  );
};

const buildOffsetIsoTimestamp = (date: Date, offsetMinutes: number) => {
  const shiftedDate = new Date(date.getTime() + offsetMinutes * 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.trunc(absoluteOffsetMinutes / 60)).padStart(
    2,
    "0",
  );
  const remainingOffsetMinutes = String(absoluteOffsetMinutes % 60).padStart(
    2,
    "0",
  );

  return `${shiftedDate.toISOString().slice(0, 19)}${sign}${offsetHours}:${remainingOffsetMinutes}`;
};

describe("modules governance", () => {
  it("captures audit events and exposes requirements", async () => {
    const auditLog = await Effect.runPromise(
      makeAuditLogModule(makeInMemoryAuditLogRepository()),
    );

    const event = await Effect.runPromise(
      auditLog.append({
        requestContext: supportRequestContext,
        moduleId: platformModuleId.supportOperations,
        action: supportOperationsAuditAction.breakGlassStarted,
        target: "org_1",
        reason: "Investigate elevated support issue",
      }),
    );
    const events = await Effect.runPromise(
      auditLog.queryByModule(platformModuleId.supportOperations),
    );
    const targetEvents = await Effect.runPromise(
      auditLog.queryByTarget({
        moduleId: platformModuleId.supportOperations,
        target: "org_1",
      }),
    );
    const actorEvents = await Effect.runPromise(
      auditLog.queryByActor({
        actorId: supportRequestContext.actorId,
      }),
    );
    const tenantEvents = await Effect.runPromise(
      auditLog.queryByTenant({
        tenantScope: supportRequestContext.tenant.scope,
        tenantScopeId: supportRequestContext.tenant.scopeId,
      }),
    );

    expect(event.moduleId).toBe(platformModuleId.supportOperations);
    expect(events).toHaveLength(1);
    expect(targetEvents).toHaveLength(1);
    expect(actorEvents).toHaveLength(1);
    expect(tenantEvents).toHaveLength(1);
    expect(targetEvents[0]).toMatchObject({
      eventId: event.eventId,
      target: "org_1",
    });
    expect(actorEvents[0]).toMatchObject({
      eventId: event.eventId,
      actorId: supportRequestContext.actorId,
    });
    expect(tenantEvents[0]).toMatchObject({
      eventId: event.eventId,
      tenantScopeId: supportRequestContext.tenant.scopeId,
    });
    await expect(Effect.runPromise(auditLog.requirements)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.authorization,
          action: authorizationAuditAction.tupleChanged,
          reasonRequired: true,
          correlationRequired: true,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.auditLog,
          action: auditLogAuditAction.exported,
          reasonRequired: false,
          correlationRequired: true,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.runtimeConfig,
          action: runtimeConfigAuditAction.overrideChanged,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.runtimeConfig,
          action: runtimeConfigAuditAction.overrideProposed,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.runtimeConfig,
          action: runtimeConfigAuditAction.proposalReviewed,
        }),
      ]),
    );
  });

  it("builds distinct audit event ids for different file targets under one correlation", async () => {
    const auditLog = await Effect.runPromise(
      makeAuditLogModule(makeInMemoryAuditLogRepository()),
    );

    const firstEvent = await Effect.runPromise(
      auditLog.append({
        requestContext: supportRequestContext,
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.registered,
        target: "file-storage:organization:org_1:file_1",
      }),
    );
    const secondEvent = await Effect.runPromise(
      auditLog.append({
        requestContext: supportRequestContext,
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.registered,
        target: "file-storage:organization:org_1:file_2",
      }),
    );

    expect(firstEvent.eventId).not.toBe(secondEvent.eventId);
    expect(firstEvent.eventId).toContain(
      "file-storage:organization:org_1:file_1",
    );
    expect(secondEvent.eventId).toContain(
      "file-storage:organization:org_1:file_2",
    );
  });

  it("appends distinct audit events for the same file target under one correlation", async () => {
    const auditLog = await Effect.runPromise(
      makeAuditLogModule(makeInMemoryAuditLogRepository()),
    );

    const firstEvent = await Effect.runPromise(
      auditLog.append({
        requestContext: supportRequestContext,
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.downloadResolved,
        target: "file-storage:organization:org_1:file_1",
      }),
    );
    const secondEvent = await Effect.runPromise(
      auditLog.append({
        requestContext: supportRequestContext,
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.downloadResolved,
        target: "file-storage:organization:org_1:file_1",
      }),
    );
    const targetEvents = await Effect.runPromise(
      auditLog.queryByTarget({
        moduleId: platformModuleId.fileStorage,
        target: "file-storage:organization:org_1:file_1",
      }),
    );

    expect(firstEvent.eventId).not.toBe(secondEvent.eventId);
    expect(targetEvents).toHaveLength(2);
    expect(targetEvents.map((event) => event.eventId)).toEqual(
      expect.arrayContaining([firstEvent.eventId, secondEvent.eventId]),
    );
  });

  it("surfaces audit-log query failures instead of returning empty results", async () => {
    const auditLog = await Effect.runPromise(
      makeAuditLogModule({
        insertAuditEvent: (event) => Effect.succeed(event),
        queryByModule: () =>
          Effect.fail({
            _tag: "AuditLogPostgresRepositoryPersistenceError",
            operation: "queryByModule",
            cause: new Error("module query failed"),
          } as const),
        queryByTarget: () =>
          Effect.fail({
            _tag: "AuditLogPostgresRepositoryPersistenceError",
            operation: "queryByTarget",
            cause: new Error("target query failed"),
          } as const),
        queryByActor: () =>
          Effect.fail({
            _tag: "AuditLogPostgresRepositoryPersistenceError",
            operation: "queryByActor",
            cause: new Error("actor query failed"),
          } as const),
        queryByTenant: () =>
          Effect.fail({
            _tag: "AuditLogPostgresRepositoryPersistenceError",
            operation: "queryByTenant",
            cause: new Error("tenant query failed"),
          } as const),
      }),
    );

    const byModuleResult = await Effect.runPromise(
      Effect.either(auditLog.queryByModule(platformModuleId.supportOperations)),
    );
    const byTargetResult = await Effect.runPromise(
      Effect.either(
        auditLog.queryByTarget({
          moduleId: platformModuleId.supportOperations,
          target: "org_1",
        }),
      ),
    );
    const byActorResult = await Effect.runPromise(
      Effect.either(
        auditLog.queryByActor({
          actorId: "usr_support_operator",
        }),
      ),
    );
    const byTenantResult = await Effect.runPromise(
      Effect.either(
        auditLog.queryByTenant({
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
        }),
      ),
    );

    expect(byModuleResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "queryByModule",
      },
    });
    expect(byTargetResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "queryByTarget",
      },
    });
    expect(byActorResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "queryByActor",
      },
    });
    expect(byTenantResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "queryByTenant",
      },
    });
  });

  it("resolves runtime config and builds change proposals", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveConfigValue({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: "Acme Organization",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    const proposals = await Effect.runPromise(
      runtimeConfig.buildChangeProposals({
        moduleId: platformModuleId.tenantBranding,
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: "tenant-branding.legacyTheme",
            scope: platformScope.organization,
            scopeId: "org_1",
            value: "legacy",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
          {
            moduleId: platformModuleId.runtimeConfig,
            key: `${platformModuleId.runtimeConfig}.staleKey`,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: "ignore-me",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        renameMap: {
          "tenant-branding.legacyTheme": tenantBrandingConfigKey.themePrimary,
        },
      }),
    );

    expect(resolution.effectiveValue).toBe("Acme Organization");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      action: runtimeChangeProposalAction.rename,
      artifactPath: expect.stringContaining("runtime-config-proposals"),
    });
  });

  it("continues the runtime-config cascade when a narrower override inherits", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveConfigValue({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: configDefaultValue.inherit,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            value: "Platform Brand",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe("Platform Brand");
    expect(resolution.source).toBe(runtimeResolutionSource.runtimeOverride);
    expect(resolution.resolvedScope).toBe(platformScope.platform);
    expect(resolution.resolvedScopeId).toBe(platformScope.platform);
  });

  it("persists overrides and resolves stored runtime config values", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );

    await Effect.runPromise(
      runtimeConfig.upsertOverride({
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "Persistent Organization",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_admin_1",
        changedAt: new Date().toISOString(),
        approvalReason: "Approved through operator workflow",
      }),
    );

    const overrides = await Effect.runPromise(
      runtimeConfig.listOverridesByModule(platformModuleId.tenantBranding),
    );
    const resolution = await Effect.runPromise(
      runtimeConfig.resolveStoredConfigValue({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      approvalReason: "Approved through operator workflow",
    });
    expect(resolution.effectiveValue).toBe("Persistent Organization");
    expect(resolution.source).toBe(runtimeResolutionSource.runtimeOverride);
  });

  it("persists sync artifacts from stored overrides", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );

    await Effect.runPromise(
      runtimeConfig.upsertOverride({
        moduleId: platformModuleId.tenantBranding,
        key: "tenant-branding.legacyTheme",
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "legacy",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_admin_1",
        changedAt: new Date().toISOString(),
      }),
    );

    const artifacts = await Effect.runPromise(
      runtimeConfig.persistChangeProposals({
        moduleId: platformModuleId.tenantBranding,
        renameMap: {
          "tenant-branding.legacyTheme": tenantBrandingConfigKey.themePrimary,
        },
      }),
    );
    const storedArtifacts = await Effect.runPromise(
      runtimeConfig.listChangeProposalsByModule(
        platformModuleId.tenantBranding,
      ),
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      action: runtimeChangeProposalAction.rename,
      status: runtimeConfigSyncArtifactStatus.pending,
    });
    expect(storedArtifacts).toHaveLength(1);
    const [storedArtifact] = storedArtifacts;
    if (storedArtifact === undefined) {
      throw new Error("Expected a persisted runtime-config sync artifact.");
    }
    expect(storedArtifact.artifactPath).toContain("runtime-config-proposals");
  });

  it("keeps rename proposals pending even when a runtime string matches the renamed key literal", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );

    await Effect.runPromise(
      runtimeConfig.upsertOverride({
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: tenantBrandingConfigKey.themePrimary,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_admin_1",
        changedAt: "2026-04-25T13:20:00.000Z",
      }),
    );

    const [artifact] = await Effect.runPromise(
      runtimeConfig.persistChangeProposals({
        moduleId: platformModuleId.tenantBranding,
        renameMap: {
          [tenantBrandingConfigKey.companyName]:
            tenantBrandingConfigKey.themePrimary,
        },
      }),
    );

    expect(artifact).toMatchObject({
      action: runtimeChangeProposalAction.rename,
      runtimeValue: tenantBrandingConfigKey.themePrimary,
      codeValue: tenantBrandingConfigKey.themePrimary,
      status: runtimeConfigSyncArtifactStatus.pending,
    });
  });

  it("persists proposal review metadata and preserves it until proposal content changes", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );

    await Effect.runPromise(
      runtimeConfig.upsertOverride({
        moduleId: platformModuleId.tenantBranding,
        key: "tenant-branding.legacyTheme",
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "legacy",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_admin_1",
        changedAt: "2026-04-25T10:00:00.000Z",
      }),
    );

    const [initialArtifact] = await Effect.runPromise(
      runtimeConfig.persistChangeProposals({
        moduleId: platformModuleId.tenantBranding,
        renameMap: {
          "tenant-branding.legacyTheme": tenantBrandingConfigKey.themePrimary,
        },
      }),
    );

    if (initialArtifact === undefined) {
      throw new Error("Expected a runtime-config proposal artifact.");
    }

    const reviewedArtifact = await Effect.runPromise(
      runtimeConfig.reviewChangeProposal({
        proposalId: initialArtifact.proposalId,
        status: runtimeConfigProposalDecisionStatus.approved,
        decidedBy: "usr_support_operator",
        decisionReason: "Approved export back to code",
        decidedAt: "2026-04-25T11:00:00.000Z",
      }),
    );

    const [preservedArtifact] = await Effect.runPromise(
      runtimeConfig.persistChangeProposals({
        moduleId: platformModuleId.tenantBranding,
        renameMap: {
          "tenant-branding.legacyTheme": tenantBrandingConfigKey.themePrimary,
        },
      }),
    );

    await Effect.runPromise(
      runtimeConfig.upsertOverride({
        moduleId: platformModuleId.tenantBranding,
        key: "tenant-branding.legacyTheme",
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "legacy-updated",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_admin_1",
        changedAt: "2026-04-25T12:00:00.000Z",
      }),
    );

    const [resetArtifact] = await Effect.runPromise(
      runtimeConfig.persistChangeProposals({
        moduleId: platformModuleId.tenantBranding,
        renameMap: {
          "tenant-branding.legacyTheme": tenantBrandingConfigKey.themePrimary,
        },
      }),
    );

    expect(reviewedArtifact).toMatchObject({
      status: runtimeConfigProposalDecisionStatus.approved,
      decidedBy: "usr_support_operator",
      decisionReason: "Approved export back to code",
      decidedAt: "2026-04-25T11:00:00.000Z",
    });
    expect(preservedArtifact).toMatchObject({
      status: runtimeConfigProposalDecisionStatus.approved,
      decidedBy: "usr_support_operator",
      decisionReason: "Approved export back to code",
      decidedAt: "2026-04-25T11:00:00.000Z",
    });
    expect(resetArtifact).toMatchObject({
      status: runtimeConfigSyncArtifactStatus.pending,
      runtimeValue: "legacy-updated",
    });
    expect(resetArtifact).not.toHaveProperty("decidedBy");
    expect(resetArtifact).not.toHaveProperty("decisionReason");
    expect(resetArtifact).not.toHaveProperty("decidedAt");
  });

  it("rejects repeat sync proposal reviews once the artifact is no longer pending", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );
    const runtimeConfigManifest = findModuleManifest(
      platformModuleId.runtimeConfig,
    );

    if (runtimeConfigManifest === undefined) {
      throw new Error("Expected the runtime-config manifest to exist.");
    }

    const approvalsEnabledConfig = runtimeConfigManifest.configKeys.find(
      (configKey) => configKey.key === runtimeConfigConfigKey.approvalsEnabled,
    );

    if (approvalsEnabledConfig === undefined) {
      throw new Error(
        "Expected the runtime-config approvalsEnabled declaration to exist.",
      );
    }

    const mutableApprovalsEnabledConfig = approvalsEnabledConfig as {
      key: string;
      defaultValue: unknown;
    };
    const originalDefaultValue = mutableApprovalsEnabledConfig.defaultValue;

    try {
      mutableApprovalsEnabledConfig.defaultValue = false;

      await Effect.runPromise(
        runtimeConfig.upsertOverride({
          moduleId: platformModuleId.runtimeConfig,
          key: runtimeConfigConfigKey.approvalsEnabled,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: true,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_admin_1",
          changedAt: "2026-04-25T11:00:00.000Z",
        }),
      );

      const [initialArtifact] = await Effect.runPromise(
        runtimeConfig.persistChangeProposals({
          moduleId: platformModuleId.runtimeConfig,
          renameMap: {},
        }),
      );

      if (initialArtifact === undefined) {
        throw new Error("Expected a runtime-config proposal artifact.");
      }

      await Effect.runPromise(
        runtimeConfig.reviewChangeProposal({
          proposalId: initialArtifact.proposalId,
          status: runtimeConfigProposalDecisionStatus.approved,
          decidedBy: "usr_support_operator",
          decisionReason: "Approved export back to code",
          decidedAt: "2026-04-25T11:05:00.000Z",
        }),
      );

      const result = await Effect.runPromise(
        Effect.either(
          runtimeConfig.reviewChangeProposal({
            proposalId: initialArtifact.proposalId,
            status: runtimeConfigProposalDecisionStatus.rejected,
            decidedBy: "usr_support_operator",
            decisionReason: "Attempted second review",
            decidedAt: "2026-04-25T11:10:00.000Z",
          }),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "RuntimeConfigSyncArtifactReviewConflictError",
          proposalId: initialArtifact.proposalId,
          status: runtimeConfigProposalDecisionStatus.approved,
        },
      });
    } finally {
      mutableApprovalsEnabledConfig.defaultValue = originalDefaultValue;
    }
  });

  it("marks approved update proposals as applied when the code baseline catches up", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );
    const runtimeConfigManifest = findModuleManifest(
      platformModuleId.runtimeConfig,
    );

    if (runtimeConfigManifest === undefined) {
      throw new Error("Expected the runtime-config manifest to exist.");
    }

    const inlineDiffViewerConfig = runtimeConfigManifest.configKeys.find(
      (configKey) => configKey.key === runtimeConfigConfigKey.approvalsEnabled,
    );

    if (inlineDiffViewerConfig === undefined) {
      throw new Error(
        "Expected the runtime-config inlineDiffViewer declaration to exist.",
      );
    }

    const mutableApprovalsEnabledConfig = inlineDiffViewerConfig as {
      key: string;
      defaultValue: unknown;
    };
    const originalDefaultValue = mutableApprovalsEnabledConfig.defaultValue;

    try {
      mutableApprovalsEnabledConfig.defaultValue = false;

      await Effect.runPromise(
        runtimeConfig.upsertOverride({
          moduleId: platformModuleId.runtimeConfig,
          key: runtimeConfigConfigKey.approvalsEnabled,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: true,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_admin_1",
          changedAt: "2026-04-25T13:00:00.000Z",
        }),
      );

      const [initialArtifact] = await Effect.runPromise(
        runtimeConfig.persistChangeProposals({
          moduleId: platformModuleId.runtimeConfig,
          renameMap: {},
        }),
      );

      if (initialArtifact === undefined) {
        throw new Error("Expected an initial runtime-config proposal.");
      }

      const reviewedArtifact = await Effect.runPromise(
        runtimeConfig.reviewChangeProposal({
          proposalId: initialArtifact.proposalId,
          status: runtimeConfigProposalDecisionStatus.approved,
          decidedBy: "usr_support_operator",
          decisionReason: "Approved export back to code",
          decidedAt: "2026-04-25T13:05:00.000Z",
        }),
      );

      mutableApprovalsEnabledConfig.defaultValue = true;

      const [appliedArtifact] = await Effect.runPromise(
        runtimeConfig.persistChangeProposals({
          moduleId: platformModuleId.runtimeConfig,
          renameMap: {},
        }),
      );

      expect(initialArtifact).toMatchObject({
        action: runtimeChangeProposalAction.update,
        runtimeValue: true,
        codeValue: false,
        status: runtimeConfigSyncArtifactStatus.pending,
      });
      expect(reviewedArtifact).toMatchObject({
        status: runtimeConfigProposalDecisionStatus.approved,
        decidedBy: "usr_support_operator",
        decisionReason: "Approved export back to code",
        decidedAt: "2026-04-25T13:05:00.000Z",
      });
      expect(appliedArtifact).toMatchObject({
        action: runtimeChangeProposalAction.update,
        runtimeValue: true,
        codeValue: true,
        status: runtimeConfigSyncArtifactStatus.applied,
        decidedBy: "usr_support_operator",
        decisionReason: "Approved export back to code",
        decidedAt: "2026-04-25T13:05:00.000Z",
      });
    } finally {
      mutableApprovalsEnabledConfig.defaultValue = originalDefaultValue;
    }
  });

  it("keeps matching update proposals pending until an approved artifact catches up", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );
    const runtimeConfigManifest = findModuleManifest(
      platformModuleId.runtimeConfig,
    );

    if (runtimeConfigManifest === undefined) {
      throw new Error("Expected the runtime-config manifest to exist.");
    }

    const approvalsEnabledConfig = runtimeConfigManifest.configKeys.find(
      (configKey) => configKey.key === runtimeConfigConfigKey.approvalsEnabled,
    );

    if (approvalsEnabledConfig === undefined) {
      throw new Error(
        "Expected the runtime-config approvalsEnabled declaration to exist.",
      );
    }

    const mutableApprovalsEnabledConfig = approvalsEnabledConfig as {
      key: string;
      defaultValue: unknown;
    };
    const originalDefaultValue = mutableApprovalsEnabledConfig.defaultValue;

    try {
      mutableApprovalsEnabledConfig.defaultValue = true;

      await Effect.runPromise(
        runtimeConfig.upsertOverride({
          moduleId: platformModuleId.runtimeConfig,
          key: runtimeConfigConfigKey.approvalsEnabled,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: true,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_admin_1",
          changedAt: "2026-04-25T13:30:00.000Z",
        }),
      );

      const [artifact] = await Effect.runPromise(
        runtimeConfig.persistChangeProposals({
          moduleId: platformModuleId.runtimeConfig,
          renameMap: {},
        }),
      );

      expect(artifact).toMatchObject({
        action: runtimeChangeProposalAction.update,
        runtimeValue: true,
        codeValue: true,
        status: runtimeConfigSyncArtifactStatus.pending,
      });
    } finally {
      mutableApprovalsEnabledConfig.defaultValue = originalDefaultValue;
    }
  });

  it("grants break-glass access with audit context", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const grant = await Effect.runPromise(
      supportOperations.startImpersonation({
        requestContext: supportRequestContext,
        impersonatedActorId: organizationRequestContext.actorId,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 30,
      }),
    );

    expect(grant.idToken).toBe("id-token:usr_member_1");
    expect(grant.grantedRequestContext).toMatchObject({
      actorType: actorType.organizationMember,
      actorId: organizationRequestContext.actorId,
      sessionId: "sess_impersonation_usr_member_1",
      correlationId: supportRequestContext.correlationId,
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      reason: "Investigate tenant access issue",
      impersonation: {
        impersonatedActorId: organizationRequestContext.actorId,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate tenant access issue",
      },
    });
    expect(new Date(grant.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(grant.auditEvent).toMatchObject({
      action: supportOperationsAuditAction.impersonationStarted,
      target: `${platformScope.organization}:org_1:${organizationRequestContext.actorId}`,
    });

    const breakGlassGrant = await Effect.runPromise(
      supportOperations.grantBreakGlassAccess({
        requestContext: supportRequestContext,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate regulated-sensitive access issue",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    );

    expect(breakGlassGrant.grantedRequestContext.breakGlass?.approvedBy).toBe(
      "usr_platform_admin_1",
    );
    expect(breakGlassGrant.grantedRequestContext.reason).toBeUndefined();
    expect(breakGlassGrant.auditEvent.action).toBe(
      supportOperationsAuditAction.breakGlassStarted,
    );
  });

  it("creates and reviews durable break-glass incidents", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const grant = await Effect.runPromise(
      supportOperations.grantBreakGlassAccess({
        requestContext: supportRequestContext,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate regulated-sensitive access issue",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
    );

    const incident = await Effect.runPromise(
      createSupportOperationsBreakGlassIncidentRecord(grant),
    );

    expect(incident).toMatchObject({
      caseId: grant.auditEvent.eventId,
      supportAgent: supportRequestContext.actorId,
      status: supportOperationsBreakGlassIncidentStatus.pendingReview,
      approvedBy: "usr_platform_admin_1",
      reason: "Investigate regulated-sensitive access issue",
    });

    const reviewResult = await Effect.runPromise(
      reviewSupportOperationsBreakGlassIncident({
        requestContext: supportRequestContext,
        incident,
        reviewReason: "Post-incident review completed.",
      }),
    );

    expect(reviewResult.incident.status).toBe(
      supportOperationsBreakGlassIncidentStatus.reviewed,
    );
    expect(reviewResult.auditEvent).toMatchObject({
      action: supportOperationsAuditAction.breakGlassReviewed,
      target: `case:${incident.caseId}`,
      actorId: supportRequestContext.actorId,
      reason: "Post-incident review completed.",
    });
  });

  it("creates and updates durable support-case metadata", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const upsertResult = await Effect.runPromise(
      supportOperations.upsertSupportCase({
        requestContext: supportRequestContext,
        caseId: "case_support_case_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        summary: "Escalated tenant authentication investigation",
        status: supportOperationsCaseStatus.escalated,
        priority: supportOperationsCasePriority.high,
        changeReason: "Escalated after repeated authentication failures.",
      }),
    );

    expect(upsertResult.case).toMatchObject({
      caseId: "case_support_case_1",
      supportAgent: supportRequestContext.actorId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      summary: "Escalated tenant authentication investigation",
      status: supportOperationsCaseStatus.escalated,
      priority: supportOperationsCasePriority.high,
      startedAt: upsertResult.auditEvent.timestamp,
      lastUpdatedAt: upsertResult.auditEvent.timestamp,
    });
    expect(upsertResult.auditEvent).toMatchObject({
      action: supportOperationsAuditAction.supportCaseUpserted,
      target: "case:case_support_case_1",
      actorId: supportRequestContext.actorId,
      reason: "Escalated after repeated authentication failures.",
    });
  });

  it("creates and revokes durable impersonation sessions", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const grant = await Effect.runPromise(
      supportOperations.startImpersonation({
        requestContext: supportRequestContext,
        impersonatedActorId: organizationRequestContext.actorId,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 30,
      }),
    );

    const session = await Effect.runPromise(
      createSupportOperationsImpersonationSessionRecord(grant),
    );

    expect(session).toMatchObject({
      caseId: grant.grantedRequestContext.sessionId,
      supportAgent: supportRequestContext.actorId,
      impersonatedUser: organizationRequestContext.actorId,
      status: supportOperationsImpersonationSessionStatus.active,
      approvedBy: "usr_platform_admin_1",
      reason: "Investigate tenant access issue",
    });

    const revocationResult = await Effect.runPromise(
      revokeSupportOperationsImpersonationSession({
        requestContext: supportRequestContext,
        session,
        revocationReason: "Support investigation complete.",
      }),
    );

    expect(revocationResult.session.status).toBe(
      supportOperationsImpersonationSessionStatus.revoked,
    );
    expect(revocationResult.auditEvent).toMatchObject({
      action: supportOperationsAuditAction.impersonationRevoked,
      target: `case:${session.caseId}`,
      actorId: supportRequestContext.actorId,
      reason: "Support investigation complete.",
    });
  });

  it("rejects unauthenticated break-glass grants with a typed error", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const result = await Effect.runPromise(
      Effect.either(
        supportOperations.grantBreakGlassAccess({
          requestContext: {
            actorType: supportRequestContext.actorType,
            sessionId: supportRequestContext.sessionId,
            correlationId: supportRequestContext.correlationId,
            tenant: supportRequestContext.tenant,
          },
          approvedBy: "usr_platform_admin_1",
          reason: "Investigate regulated-sensitive access issue",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("Expected unauthenticated break-glass grant to fail.");
    }
    expect(result.left).toMatchObject({
      _tag: "UnauthenticatedBreakGlassActorError",
    });
  });

  it("rejects unsupported and expired break-glass grants with typed errors", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const unsupportedResult = await Effect.runPromise(
      Effect.either(
        supportOperations.grantBreakGlassAccess({
          requestContext: organizationRequestContext,
          approvedBy: "usr_platform_admin_1",
          reason: "Attempt unsupported escalation",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
      ),
    );

    expect(unsupportedResult._tag).toBe("Left");
    if (unsupportedResult._tag !== "Left") {
      throw new Error("Expected unsupported break-glass grant to fail.");
    }
    expect(unsupportedResult.left).toMatchObject({
      _tag: "UnsupportedSupportActorError",
      actorType: organizationRequestContext.actorType,
    });

    const expiredResult = await Effect.runPromise(
      Effect.either(
        supportOperations.grantBreakGlassAccess({
          requestContext: supportRequestContext,
          approvedBy: "usr_platform_admin_1",
          reason: "Attempt expired escalation",
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
    );

    expect(expiredResult._tag).toBe("Left");
    if (expiredResult._tag !== "Left") {
      throw new Error("Expected expired break-glass grant to fail.");
    }
    expect(expiredResult.left).toMatchObject({
      _tag: "InvalidBreakGlassExpiryError",
    });
  });

  it("validates escalation for privileged actor types", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const allowed = await Effect.runPromise(
      supportOperations.validateEscalation(supportRequestContext),
    );
    const denied = await Effect.runPromise(
      supportOperations.validateEscalation(organizationRequestContext),
    );

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  it("rejects non-positive impersonation durations with a typed error", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const result = await Effect.runPromise(
      Effect.either(
        supportOperations.startImpersonation({
          requestContext: supportRequestContext,
          impersonatedActorId: organizationRequestContext.actorId,
          approvedBy: "usr_platform_admin_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 0,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("Expected invalid impersonation duration to fail.");
    }
    expect(result.left).toMatchObject({
      _tag: "InvalidImpersonationDurationError",
      requestedDurationMinutes: 0,
    });
  });

  it("rejects break-glass requests beyond the declared max duration", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const result = await Effect.runPromise(
      Effect.either(
        supportOperations.grantBreakGlassAccess({
          requestContext: supportRequestContext,
          approvedBy: "usr_platform_admin_1",
          reason: "Investigate regulated-sensitive access issue",
          expiresAt: new Date(Date.now() + 31 * 60 * 1000).toISOString(),
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("Expected oversized break-glass duration to fail.");
    }
    expect(result.left).toMatchObject({
      _tag: "InvalidBreakGlassExpiryError",
    });
  });

  it("accepts offset-formatted break-glass expiries that remain within the declared max duration", async () => {
    const supportOperations = await makeSupportOperationsTestModule();

    const grant = await Effect.runPromise(
      supportOperations.grantBreakGlassAccess({
        requestContext: supportRequestContext,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate regulated-sensitive access issue",
        expiresAt: buildOffsetIsoTimestamp(
          new Date(Date.now() + 20 * 60 * 1000),
          120,
        ),
      }),
    );

    expect(grant.grantedRequestContext.breakGlass).toMatchObject({
      approvedBy: "usr_platform_admin_1",
      reason: "Investigate regulated-sensitive access issue",
    });
  });

  it("clamps impersonation duration to the declared max when the provider token lives longer", async () => {
    const baseOptions = createKeycloakTestOptions();
    const tokenEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token`;
    const supportOperations =
      await makeSupportOperationsTestModuleWithKeycloakOverrides({
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === tokenEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (
              requestBody.get("grant_type") ===
                "urn:ietf:params:oauth:grant-type:token-exchange" &&
              requestBody.get("requested_subject") ===
                organizationRequestContext.actorId
            ) {
              return new Response(
                JSON.stringify({
                  access_token: `access-token:${organizationRequestContext.actorId}`,
                  id_token: `id-token:${organizationRequestContext.actorId}`,
                  expires_in: 7200,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          return baseOptions.fetch!(input, init);
        },
      });
    const startedBefore = Date.now();

    const grant = await Effect.runPromise(
      supportOperations.startImpersonation({
        requestContext: supportRequestContext,
        impersonatedActorId: organizationRequestContext.actorId,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 45,
      }),
    );
    const startedAfter = Date.now();
    const expiryTimestamp = new Date(grant.expiresAt).getTime();

    expect(expiryTimestamp).toBeGreaterThanOrEqual(
      startedBefore + 29 * 60 * 1000,
    );
    expect(expiryTimestamp).toBeLessThanOrEqual(startedAfter + 30 * 60 * 1000);
  });

  it("rejects impersonation when Keycloak omits the actor-type claim", async () => {
    const baseOptions = createKeycloakTestOptions();
    const introspectionEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token/introspect`;
    const revokedSessionIds: string[] = [];
    const supportOperations =
      await makeSupportOperationsTestModuleWithKeycloakOverrides({
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${baseOptions.baseUrl}/admin/realms/${baseOptions.realm}/sessions/`,
            )
          ) {
            revokedSessionIds.push(url.split("/").pop() ?? "");
          }

          if (url === introspectionEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (
              requestBody
                .get("token")
                ?.startsWith(
                  `access-token:${organizationRequestContext.actorId}`,
                ) === true
            ) {
              const response = await baseOptions.fetch!(input, init);
              const payload = (await response.json()) as Record<
                string,
                unknown
              >;

              delete payload[identityClaimKey.actorType];

              return new Response(JSON.stringify(payload), {
                status: response.status,
                headers: {
                  "Content-Type": "application/json",
                },
              });
            }
          }

          return baseOptions.fetch!(input, init);
        },
      });

    const result = await Effect.runPromise(
      Effect.either(
        supportOperations.startImpersonation({
          requestContext: supportRequestContext,
          impersonatedActorId: organizationRequestContext.actorId,
          approvedBy: "usr_platform_admin_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 15,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("Expected missing actor-type claim to fail.");
    }
    expect(result.left).toMatchObject({
      _tag: "ImpersonationActorTypeMissingError",
      actorId: organizationRequestContext.actorId,
    });
    expect(revokedSessionIds).toEqual([
      `sess_impersonation_${organizationRequestContext.actorId}`,
    ]);
  });

  it("surfaces cleanup failures when actor-type validation fails after session issuance", async () => {
    const baseOptions = createKeycloakTestOptions();
    const introspectionEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token/introspect`;
    const supportOperations =
      await makeSupportOperationsTestModuleWithKeycloakOverrides({
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${baseOptions.baseUrl}/admin/realms/${baseOptions.realm}/sessions/`,
            )
          ) {
            return new Response("Keycloak unavailable", {
              status: 503,
              statusText: "Service Unavailable",
            });
          }

          if (url === introspectionEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (
              requestBody
                .get("token")
                ?.startsWith(
                  `access-token:${organizationRequestContext.actorId}`,
                ) === true
            ) {
              const response = await baseOptions.fetch!(input, init);
              const payload = (await response.json()) as Record<
                string,
                unknown
              >;

              delete payload[identityClaimKey.actorType];

              return new Response(JSON.stringify(payload), {
                status: response.status,
                headers: {
                  "Content-Type": "application/json",
                },
              });
            }
          }

          return baseOptions.fetch!(input, init);
        },
      });

    const result = await Effect.runPromise(
      Effect.either(
        supportOperations.startImpersonation({
          requestContext: supportRequestContext,
          impersonatedActorId: organizationRequestContext.actorId,
          approvedBy: "usr_platform_admin_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 15,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("Expected cleanup failure to surface.");
    }
    expect(result.left).toMatchObject({
      _tag: "SupportImpersonationGrantCleanupError",
      sessionId: `sess_impersonation_${organizationRequestContext.actorId}`,
      grantFailure: {
        _tag: "ImpersonationActorTypeMissingError",
        actorId: organizationRequestContext.actorId,
      },
      cleanupFailure: {
        _tag: "KeycloakAdapterRequestError",
        operation: "sessionRevocation",
        status: 503,
      },
    });
  });

  it("returns typed unknown-config-key failures", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());
    const unknownConfigKey =
      `${platformModuleId.tenantBranding}.unknownKey` as const;

    const result = await Effect.runPromise(
      Effect.either(
        runtimeConfig.resolveConfigValue({
          requestContext: organizationRequestContext,
          moduleId: platformModuleId.tenantBranding,
          key: unknownConfigKey,
          overrides: [],
          entitlements: [],
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("Expected unknown config key resolution to fail.");
    }
    expect(result.left).toMatchObject({
      _tag: "UnknownConfigKeyError",
      key: unknownConfigKey,
    });
  });

  it("returns unentitled default when config key is billable and unentitled", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveConfigValue({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        overrides: [],
        entitlements: [],
      }),
    );

    expect(resolution.source).toBe(runtimeResolutionSource.unentitledDefault);
    expect(resolution.entitled).toBe(false);
  });

  it("resolves feature flag with entitlement gate", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const unentitled = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
        ),
        overrides: [],
        entitlements: [],
      }),
    );

    expect(unentitled.effectiveValue).toBe(false);
    expect(unentitled.entitled).toBe(false);

    const entitled = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
        ),
        overrides: [],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(entitled.effectiveValue).toBe(true);
    expect(entitled.entitled).toBe(true);
    expect(entitled.source).toBe(runtimeResolutionSource.entitlement);
    expect(entitled.resolvedScope).toBe(platformScope.organization);
    expect(entitled.resolvedScopeId).toBe("org_1");
  });

  it("resolves billable feature flags from ancestor-scope entitlements", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
        ),
        overrides: [],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.enterprise,
            scopeId: "ent_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(true);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.entitlement);
    expect(resolution.resolvedScope).toBe(platformScope.enterprise);
    expect(resolution.resolvedScopeId).toBe("ent_1");
  });

  it("does not resolve organization feature flags from descendant individual entitlements", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
        ),
        overrides: [],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.individual,
            scopeId: organizationRequestContext.tenant.individualId,
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(false);
    expect(resolution.source).toBe(runtimeResolutionSource.unentitledDefault);
  });

  it("does not let enabling overrides bypass the entitlement gate for billable flags", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.customDomain,
        ),
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: true,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(false);
    expect(resolution.source).toBe(runtimeResolutionSource.unentitledDefault);
  });

  it("preserves entitlement even when a billable flag is disabled by override", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.customDomain,
        ),
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: false,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.runtimeOverride);
    expect(resolution.resolvedScope).toBe(platformScope.organization);
    expect(resolution.resolvedScopeId).toBe("org_1");
  });

  it("keeps module enable overrides distinct from billed entitlement for billable config", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveConfigValue({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: true,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe("inherit");
    expect(resolution.source).toBe(runtimeResolutionSource.codeDefault);
    expect(resolution.entitled).toBe(false);
  });

  it("keeps module enable overrides distinct from billed feature entitlements", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
        ),
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: true,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(true);
    expect(resolution.entitled).toBe(false);
    expect(resolution.source).toBe(runtimeResolutionSource.runtimeOverride);
    expect(resolution.resolvedScope).toBe(platformScope.organization);
    expect(resolution.resolvedScopeId).toBe("org_1");
  });

  it("does not treat module enablement as blanket entitlement for premium subfeatures", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.customDomain,
        ),
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: true,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(false);
  });

  it("does not resolve declared feature flags when a manifest dependency stays disabled", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.brandedEmails,
        ),
        overrides: [
          {
            moduleId: platformModuleId.emailDelivery,
            key: emailDeliveryFeatureFlag.enabled,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            value: false,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.brandedEmails,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.dependencyDisabled);
  });

  it("does not resolve stored feature flags when a persisted manifest dependency stays disabled", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(makeInMemoryRuntimeConfigRepository()),
    );

    await Effect.runPromise(
      runtimeConfig.upsertOverride({
        moduleId: platformModuleId.emailDelivery,
        key: emailDeliveryFeatureFlag.enabled,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: false,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_admin_1",
        changedAt: new Date().toISOString(),
      }),
    );

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveStoredFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.brandedEmails,
        ),
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.brandedEmails,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.dependencyDisabled);
  });

  it("prefers billable unentitled defaults before dependency-disabled states", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.brandedEmails,
        ),
        overrides: [
          {
            moduleId: platformModuleId.emailDelivery,
            key: emailDeliveryFeatureFlag.enabled,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            value: false,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(false);
    expect(resolution.source).toBe(runtimeResolutionSource.unentitledDefault);
  });

  it("treats disabled non-billable flags as entitled without rollout definitions", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.runtimeConfig,
        flag: getDeclaredFeatureFlag(
          platformModuleId.runtimeConfig,
          runtimeConfigFeatureFlag.inlineDiffViewer,
        ),
        overrides: [],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.codeDefault);
  });

  it("treats disabled non-billable overrides as entitled", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.runtimeConfig,
        flag: getDeclaredFeatureFlag(
          platformModuleId.runtimeConfig,
          runtimeConfigFeatureFlag.inlineDiffViewer,
        ),
        overrides: [
          {
            moduleId: platformModuleId.runtimeConfig,
            key: runtimeConfigFeatureFlag.inlineDiffViewer,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            value: false,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.runtimeOverride);
    expect(resolution.resolvedScope).toBe(platformScope.platform);
    expect(resolution.resolvedScopeId).toBe(platformScope.platform);
  });

  it("activates billable feature flags from direct feature entitlements", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const now = new Date().toISOString();
    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.customDomain,
        ),
        overrides: [],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: now,
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: now,
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(true);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.entitlement);
    expect(resolution.resolvedScope).toBe(platformScope.organization);
    expect(resolution.resolvedScopeId).toBe("org_1");
  });

  it("keeps non-billable child flags entitled when the module gate disables them", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.runtimeConfig,
        flag: getDeclaredFeatureFlag(
          platformModuleId.runtimeConfig,
          runtimeConfigFeatureFlag.inlineDiffViewer,
        ),
        overrides: [
          {
            moduleId: platformModuleId.runtimeConfig,
            key: runtimeConfigFeatureFlag.enabled,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            value: false,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.runtimeOverride);
    expect(resolution.resolvedScope).toBe(platformScope.platform);
    expect(resolution.resolvedScopeId).toBe(platformScope.platform);
  });

  it("uses rollout-backed feature flag evaluation when a definition exists", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(
        undefined,
        createFeatureFlagRollout({
          [tenantBrandingFeatureFlag.enabled]: {
            effectiveValue: true,
            definitionExists: true,
            resolvedScope: platformScope.platform,
            resolvedScopeId: platformScope.platform,
          },
          [tenantBrandingFeatureFlag.customDomain]: {
            effectiveValue: false,
            definitionExists: true,
            resolvedScope: platformScope.platform,
            resolvedScopeId: platformScope.platform,
          },
        }),
      ),
    );

    const now = new Date().toISOString();
    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.customDomain,
        ),
        overrides: [],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: now,
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: now,
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.rollout);
    expect(resolution.resolvedScope).toBe(platformScope.platform);
    expect(resolution.resolvedScopeId).toBe(platformScope.platform);
  });

  it("falls back to surrogate feature-flag resolution when rollout definitions are missing", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(undefined, createFeatureFlagRollout({})),
    );

    const now = new Date().toISOString();
    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.customDomain,
        ),
        overrides: [],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: now,
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: now,
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe(true);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.entitlement);
  });

  it("keeps retired feature flags disabled even when an override tries to enable them", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.featureFlags,
        flag: getDeclaredFeatureFlag(
          platformModuleId.featureFlags,
          featureFlagsFeatureFlag.legacyRolloutCatalog,
        ),
        overrides: [
          {
            moduleId: platformModuleId.featureFlags,
            key: featureFlagsFeatureFlag.legacyRolloutCatalog,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            value: true,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(true);
    expect(resolution.source).toBe(runtimeResolutionSource.retired);
  });

  it("does not activate billable module enablement from rollout without entitlement", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(
        undefined,
        createFeatureFlagRollout({
          [tenantBrandingFeatureFlag.enabled]: {
            effectiveValue: true,
            definitionExists: true,
          },
        }),
      ),
    );

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: getDeclaredFeatureFlag(
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
        ),
        overrides: [],
        entitlements: [],
      }),
    );

    expect(resolution.effectiveValue).toBe(false);
    expect(resolution.entitled).toBe(false);
    expect(resolution.source).toBe(runtimeResolutionSource.unentitledDefault);
  });

  it("preserves module override attribution when gating billable config keys", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveConfigValue({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: false,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_admin_1",
            changedAt: new Date().toISOString(),
          },
        ],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe("inherit");
    expect(resolution.entitled).toBe(false);
    expect(resolution.source).toBe(runtimeResolutionSource.runtimeOverride);
    expect(resolution.resolvedScope).toBe(platformScope.organization);
    expect(resolution.resolvedScopeId).toBe("org_1");
  });

  it("applies rollout-backed module state when gating billable config keys", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(
        undefined,
        createFeatureFlagRollout({
          [tenantBrandingFeatureFlag.enabled]: {
            effectiveValue: false,
            definitionExists: true,
          },
        }),
      ),
    );

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveConfigValue({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        overrides: [],
        entitlements: [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(resolution.effectiveValue).toBe("inherit");
    expect(resolution.entitled).toBe(false);
    expect(resolution.source).toBe(runtimeResolutionSource.rollout);
  });
});
