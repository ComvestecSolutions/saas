import { Effect } from "effect";
import {
  actorType,
  fieldSecurityAuditAction,
  platformModuleId,
  platformScope,
  runtimeConfigAuditAction,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  type AuditEvent,
} from "@comvestec/contracts";
import { tenantBrandingConfigKey } from "@comvestec/config";
import {
  AuditLogPostgresRepository,
  makeRuntimeConfigModule,
  RuntimeConfigModule,
  runtimeConfigSyncArtifactStatus,
  type AuditLogPostgresRepositoryService,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigPostgresRepositoryService,
  type RuntimeConfigSyncArtifactRecord,
} from "@comvestec/modules";
import {
  makeAdminGovernanceService,
  makeValkeyAdapter,
  ValkeyAdapter,
  type ValkeyRedisClient,
} from "@comvestec/platform";

const anonymousGovernanceRequestContext = {
  actorType: actorType.anonymous,
  correlationId: "corr_admin_governance_anonymous",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const supportOperatorGovernanceRequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_operator",
  sessionId: "sess_support_operator",
  correlationId: "corr_admin_governance_support",
  reason: "Inspect projected governance state",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const platformOperatorGovernanceRequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess_platform_operator",
  correlationId: "corr_admin_governance_platform",
  reason: "Inspect projected governance state",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const createInMemoryValkeyClient = (): ValkeyRedisClient => {
  const entries = new Map<string, string>();

  return {
    isOpen: true,
    connect: async () => undefined,
    quit: async () => undefined,
    ping: async () => "PONG",
    incrByFloat: async (key, increment) => {
      const nextValue = Number(entries.get(key) ?? "0") + increment;
      entries.set(key, String(nextValue));

      return String(nextValue);
    },
    set: async (key, value) => {
      entries.set(key, value);
      return "OK";
    },
    get: async (key) => entries.get(key) ?? null,
  };
};

const createAdminGovernanceHarness = async (input?: {
  readonly overrides?: readonly RuntimeConfigOverrideRecord[];
  readonly proposals?: readonly RuntimeConfigSyncArtifactRecord[];
  readonly auditEvents?: readonly AuditEvent[];
}) => {
  const insertedAuditEvents: AuditEvent[] = [];
  const overrides = input?.overrides ?? [];
  const proposals = input?.proposals ?? [];
  const auditEvents = input?.auditEvents ?? [];

  const runtimeConfigRepository = {
    listOverridesByModule: (moduleId) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
    upsertOverride: (override) => Effect.succeed(override),
    listSyncArtifactsByModule: (moduleId) =>
      Effect.succeed(
        proposals.filter((proposal) => proposal.moduleId === moduleId),
      ),
    persistSyncArtifacts: (records) => Effect.succeed(records),
  } satisfies RuntimeConfigPostgresRepositoryService;

  const auditLogRepository = {
    insertAuditEvent: (event) => {
      insertedAuditEvents.push(event);
      return Effect.succeed(event);
    },
    queryByModule: (moduleId) =>
      Effect.succeed(
        auditEvents.filter((event) => event.moduleId === moduleId),
      ),
  } satisfies AuditLogPostgresRepositoryService;

  const runtimeConfig = await Effect.runPromise(
    makeRuntimeConfigModule(runtimeConfigRepository),
  );
  const valkey = await Effect.runPromise(
    makeValkeyAdapter({
      url: "redis://127.0.0.1:6379",
      client: createInMemoryValkeyClient(),
    }),
  );
  const service = await Effect.runPromise(
    makeAdminGovernanceService().pipe(
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(AuditLogPostgresRepository, auditLogRepository),
      Effect.provideService(ValkeyAdapter, valkey),
    ),
  );

  return {
    insertedAuditEvents,
    service,
    valkey,
  };
};

describe("platform admin governance", () => {
  it("denies runtime-config override mutations for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.upsertRuntimeConfigOverride({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin_mutation",
            correlationId: "corr_org_admin_mutation",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "Acme Organization",
          approvalReason: "Operator-approved tenant override",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceMutationAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("denies runtime-config proposal persistence for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.persistRuntimeConfigProposals({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin_persist",
            correlationId: "corr_org_admin_persist",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
          renameMap: {
            [tenantBrandingConfigKey.companyName]:
              tenantBrandingConfigKey.themePrimary,
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceMutationAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("returns a projected runtime-config override mutation envelope for support operators", async () => {
    const { insertedAuditEvents, service } =
      await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      service.upsertRuntimeConfigOverride({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_demo",
        value: "Acme Organization",
        approvalReason: "Approved override",
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        override: expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          value: "Acme Organization",
          approvalReason: "Approved override",
        }),
        auditEvent: expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideChanged,
          correlationId: supportOperatorGovernanceRequestContext.correlationId,
          reason: "Approved override",
        }),
      }),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideChanged,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:override:value,approvalReason`,
        }),
      ]),
    );
  });

  it("denies governance reads for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.listRuntimeConfigOverrides({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "corr_org_admin",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("denies governance proposal reads for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.listRuntimeConfigProposals({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "corr_org_admin_proposals",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("denies governance reads when the actor is unresolved", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.listRuntimeConfigOverrides({
          requestContext: {
            actorType: actorType.supportOperator,
            sessionId: "sess_unresolved_operator",
            correlationId: "corr_unresolved_operator",
            tenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadUnauthenticatedActorError",
      },
    });
  });

  it("denies governance audit-event reads for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.queryAuditEventsByModule({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "corr_org_admin_audit_events",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("resolves governance request context from Valkey-backed session state", async () => {
    const { service, valkey } = await createAdminGovernanceHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorGovernanceRequestContext.sessionId,
        requestContext: supportOperatorGovernanceRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      service.resolveRequestContext({
        sessionId: supportOperatorGovernanceRequestContext.sessionId,
      }),
    );

    expect(result).toEqual(supportOperatorGovernanceRequestContext);
  });

  it("returns projected runtime-config overrides for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            scope: platformScope.organization,
            scopeId: "org_demo",
            value: "Acme Organization",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_platform_operator",
            changedAt: "2026-04-22T10:00:00.000Z",
            approvalReason: "Approved override",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.listRuntimeConfigOverrides({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        value: "Acme Organization",
        approvalReason: "Approved override",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:overrides:value,approvalReason`,
        }),
      ]),
    );
  });

  it("returns projected runtime-config overrides for platform operators", async () => {
    const { service } = await createAdminGovernanceHarness({
      overrides: [
        {
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "Acme Organization",
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-22T10:00:00.000Z",
          approvalReason: "Approved override",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listRuntimeConfigOverrides({
        requestContext: platformOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        value: "Acme Organization",
      }),
    ]);
  });

  it("audits visible sensitive proposal reads for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        proposals: [
          {
            proposalId: "tenant-branding:companyName:update",
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            action: runtimeChangeProposalAction.update,
            artifactPath:
              "specs/00-governance/runtime-config-proposals/tenant-branding.companyName.json",
            runtimeValue: "Acme Organization",
            codeValue: "Default Company Name",
            status: runtimeConfigSyncArtifactStatus.pending,
            generatedAt: "2026-04-22T10:00:00.000Z",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.listRuntimeConfigProposals({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        runtimeValue: "Acme Organization",
        codeValue: "Default Company Name",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:proposals:runtimeValue,codeValue`,
        }),
      ]),
    );
  });

  it("returns projected runtime-config proposals for platform operators", async () => {
    const { service } = await createAdminGovernanceHarness({
      proposals: [
        {
          proposalId: "tenant-branding:companyName:update",
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          action: runtimeChangeProposalAction.update,
          artifactPath:
            "specs/00-governance/runtime-config-proposals/tenant-branding.companyName.json",
          runtimeValue: "Acme Organization",
          codeValue: "Default Company Name",
          status: runtimeConfigSyncArtifactStatus.pending,
          generatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listRuntimeConfigProposals({
        requestContext: platformOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        runtimeValue: "Acme Organization",
        codeValue: "Default Company Name",
      }),
    ]);
  });

  it("returns projected audit-log events for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        auditEvents: [
          {
            eventId: "runtime-config:override:1",
            timestamp: "2026-04-22T10:00:00.000Z",
            actorId: "usr_platform_operator",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
            reason: "Approved override",
            correlationId: "corr_runtime_config_override",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.queryAuditEventsByModule({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        actorId: "usr_platform_operator",
        tenantScopeId: "org_demo",
        target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
        reason: "Approved override",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.auditLog}:${platformModuleId.tenantBranding}:events:actorId,tenantScopeId,target,reason`,
        }),
      ]),
    );
  });

  it("returns projected audit-log events for platform operators", async () => {
    const { service } = await createAdminGovernanceHarness({
      auditEvents: [
        {
          eventId: "runtime-config:override:1",
          timestamp: "2026-04-22T10:00:00.000Z",
          actorId: "usr_platform_operator",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideChanged,
          target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
          reason: "Approved override",
          correlationId: "corr_runtime_config_override",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.queryAuditEventsByModule({
        requestContext: platformOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        actorId: "usr_platform_operator",
        tenantScopeId: "org_demo",
        reason: "Approved override",
      }),
    ]);
  });
});
