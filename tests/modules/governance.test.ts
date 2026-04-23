import { Effect } from "effect";
import {
  runtimeConfigAuditAction,
  supportOperationsAuditAction,
  platformModuleId,
  platformScope,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  type AuditEvent,
  type PlatformModuleId,
} from "@comvestec/contracts";
import {
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import {
  makeAuditLogModule,
  makeRuntimeConfigModule,
  makeSupportOperationsModule,
  type AuditLogPostgresRepositoryService,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigPostgresRepositoryService,
  type RuntimeConfigSyncArtifactRecord,
  runtimeConfigSyncArtifactStatus,
} from "@comvestec/modules";
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
    };
  };

const makeInMemoryRuntimeConfigRepository =
  (): RuntimeConfigPostgresRepositoryService => {
    const overrides = new Map<string, RuntimeConfigOverrideRecord>();
    const artifacts = new Map<string, RuntimeConfigSyncArtifactRecord>();

    const overrideKey = (override: RuntimeConfigOverrideRecord) =>
      `${override.moduleId}:${override.key}:${override.scope}:${override.scopeId}`;

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
      listSyncArtifactsByModule: (moduleId: PlatformModuleId) =>
        Effect.succeed(
          [...artifacts.values()].filter(
            (artifact) => artifact.moduleId === moduleId,
          ),
        ),
      persistSyncArtifacts: (input) =>
        Effect.sync(() => {
          for (const artifact of input) {
            artifacts.set(artifact.proposalId, artifact);
          }

          return input;
        }),
    };
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

    expect(event.moduleId).toBe(platformModuleId.supportOperations);
    expect(events).toHaveLength(1);
    await expect(Effect.runPromise(auditLog.requirements)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.runtimeConfig,
          action: runtimeConfigAuditAction.overrideChanged,
        }),
      ]),
    );
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

  it("grants break-glass access with audit context", async () => {
    const supportOperations = await Effect.runPromise(
      makeSupportOperationsModule(),
    );

    const grant = await Effect.runPromise(
      supportOperations.grantBreakGlassAccess({
        requestContext: supportRequestContext,
        approvedBy: "usr_platform_admin_1",
        reason: "Investigate regulated-sensitive access issue",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    );

    expect(grant.grantedRequestContext.breakGlass?.approvedBy).toBe(
      "usr_platform_admin_1",
    );
    expect(grant.auditEvent.action).toBe(
      supportOperationsAuditAction.breakGlassStarted,
    );
  });

  it("rejects unauthenticated break-glass grants with a typed error", async () => {
    const supportOperations = await Effect.runPromise(
      makeSupportOperationsModule(),
    );

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
    const supportOperations = await Effect.runPromise(
      makeSupportOperationsModule(),
    );

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
    const supportOperations = await Effect.runPromise(
      makeSupportOperationsModule(),
    );

    const allowed = await Effect.runPromise(
      supportOperations.validateEscalation(supportRequestContext),
    );
    const denied = await Effect.runPromise(
      supportOperations.validateEscalation(organizationRequestContext),
    );

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
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
        flag: {
          key: tenantBrandingFeatureFlag.enabled,
          description: "Enable tenant-specific branding.",
          owner: platformModuleId.tenantBranding,
          purpose: "Gate branding.",
          defaultEnabled: true,
          billable: true,
          allowedScopes: [
            platformScope.platform,
            platformScope.enterprise,
            platformScope.organization,
          ],
          retirementPlan: "None.",
        },
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
        flag: {
          key: tenantBrandingFeatureFlag.enabled,
          description: "Enable tenant-specific branding.",
          owner: platformModuleId.tenantBranding,
          purpose: "Gate branding.",
          defaultEnabled: true,
          billable: true,
          allowedScopes: [
            platformScope.platform,
            platformScope.enterprise,
            platformScope.organization,
          ],
          retirementPlan: "None.",
        },
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
  });

  it("treats module enable overrides as module entitlement for billable config", async () => {
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
    expect(resolution.entitled).toBe(true);
  });

  it("does not treat module enablement as blanket entitlement for premium subfeatures", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: {
          key: tenantBrandingFeatureFlag.customDomain,
          description: "Allow tenant custom domains.",
          owner: platformModuleId.tenantBranding,
          purpose: "Gate custom-domain configuration and activation.",
          defaultEnabled: false,
          billable: true,
          allowedScopes: [
            platformScope.platform,
            platformScope.enterprise,
            platformScope.organization,
          ],
          retirementPlan: "Retire only with a domain migration plan.",
        },
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

  it("activates billable feature flags from direct feature entitlements", async () => {
    const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

    const now = new Date().toISOString();
    const resolution = await Effect.runPromise(
      runtimeConfig.resolveFeatureFlag({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.tenantBranding,
        flag: {
          key: tenantBrandingFeatureFlag.customDomain,
          description: "Allow tenant custom domains.",
          owner: platformModuleId.tenantBranding,
          purpose: "Gate custom-domain configuration and activation.",
          defaultEnabled: false,
          billable: true,
          allowedScopes: [
            platformScope.platform,
            platformScope.enterprise,
            platformScope.organization,
          ],
          retirementPlan: "Retire only with a domain migration plan.",
        },
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
});
