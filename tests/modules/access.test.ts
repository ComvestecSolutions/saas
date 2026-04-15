import { Effect } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  defineModuleFields,
  defineProjectionDescriptors,
  moduleCapability,
  onboardingStepStatus,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import {
  identitySessionFields,
  supportOperationsFields,
} from "@comvestec/config";
import {
  canModuleRequestCapability,
  getModuleCapabilityContracts,
  identitySessionLifecycleEventType,
  identitySessionRunIdPrefix,
  makeAuthorizationModule,
  makeFieldSecurityModule,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeTenantManagementModule,
  makeTenantOnboardingPostgresRepository,
  identitySessionAuditTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  tenantOnboardingRunStatus,
  type PostgresDatabase,
  type PostgresInsertBuilder,
  IdentitySessionPostgresRepository,
  TenantManagementModule,
  TenantOnboardingPostgresRepository,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  makeKeycloakAdapter,
  makeValkeyAdapter,
  platformAdapterServiceName,
  ValkeyAdapter,
} from "@comvestec/platform";
import { organizationRequestContext, supportRequestContext } from "./_fixtures";
import {
  createKeycloakTestOptions,
  createValkeyTestClient,
} from "../platform-adapter-doubles";

const createIdentitySessionTestDatabase = () => {
  type PersistedTable = Parameters<PostgresDatabase["insert"]>[0];
  type PersistedValues = Parameters<
    PostgresInsertBuilder<PersistedTable>["values"]
  >[0];
  const identitySessionEvents = new Map<
    string,
    typeof identitySessionAuditTable.$inferInsert
  >();
  const onboardingRuns = new Map<
    string,
    typeof tenantOnboardingRunsTable.$inferInsert
  >();
  const onboardingSteps = new Map<
    string,
    typeof tenantOnboardingStepsTable.$inferInsert
  >();

  const persistRows = (table: PersistedTable, values: PersistedValues) => {
    const rows = Array.isArray(values) ? values : [values];

    for (const row of rows) {
      if (table === identitySessionAuditTable) {
        const event = row as typeof identitySessionAuditTable.$inferInsert;
        identitySessionEvents.set(event.eventId, event);
        continue;
      }

      if (table === tenantOnboardingRunsTable) {
        const run = row as typeof tenantOnboardingRunsTable.$inferInsert;
        onboardingRuns.set(run.runId, run);
        continue;
      }

      if (table === tenantOnboardingStepsTable) {
        const step = row as typeof tenantOnboardingStepsTable.$inferInsert;
        onboardingSteps.set(`${step.runId}:${step.stepId}`, step);
      }
    }
  };

  const transaction = {
    insert: (table: PersistedTable) => ({
      values: (values: PersistedValues) => ({
        onConflictDoUpdate: () => ({
          execute: async () => {
            persistRows(table, values);
          },
        }),
      }),
    }),
  };

  const database: PostgresDatabase = {
    ...transaction,
    transaction: async (callback) => callback(transaction),
  };

  return {
    database,
    identitySessionEvents,
    onboardingRuns,
    onboardingSteps,
  };
};

const fieldSecurityTestProjections = defineProjectionDescriptors(
  defineModuleFields({
    companyName: identitySessionFields.companyName,
    replyToEmail: identitySessionFields.replyToEmail,
    secretsToken: identitySessionFields.secretsToken,
  }),
  [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        identitySessionFields.companyName,
        identitySessionFields.replyToEmail,
        identitySessionFields.secretsToken,
      ],
      auditedFields: [identitySessionFields.replyToEmail],
    },
  ],
);

const regulatedSensitiveProjection = defineProjectionDescriptors(
  defineModuleFields({
    companyName: supportOperationsFields.companyName,
    ssn: supportOperationsFields.ssn,
  }),
  [
    {
      profile: projectionProfile.detail,
      visibleFields: [
        supportOperationsFields.companyName,
        supportOperationsFields.ssn,
      ],
      auditedFields: [supportOperationsFields.ssn],
    },
  ],
);

describe("modules access", () => {
  it("declares module capability contracts for cross-module access", () => {
    expect(
      canModuleRequestCapability(
        platformModuleId.runtimeConfig,
        platformModuleId.tenantBranding,
        moduleCapability.effectiveValueResolution,
      ),
    ).toBe(true);
    expect(
      canModuleRequestCapability(
        platformModuleId.tenantManagement,
        platformModuleId.billingAndMetering,
        moduleCapability.effectiveValueResolution,
      ),
    ).toBe(false);
  });

  it("evaluates authorization tuples and explainability", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: authorizationRelation.viewer,
            subject: "usr_member_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: organizationRequestContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );
    const explanation = await Effect.runPromise(
      authorization.explain({
        requestContext: organizationRequestContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(decision.allowed).toBe(true);
    expect(explanation.matchedSubject).toBe("usr_member_1");
  });

  it("applies field-security projection and redaction", async () => {
    const fieldSecurity = await Effect.runPromise(makeFieldSecurityModule());

    const result = await Effect.runPromise(
      fieldSecurity.applyProjection({
        moduleId: platformModuleId.identitySession,
        requestContext: {
          actorType: actorType.anonymous,
          correlationId: "corr-public-1",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        projection: {
          ...fieldSecurityTestProjections[0],
        },
        record: {
          companyName: "Acme",
          replyToEmail: "ops@acme.test",
          secrets: { token: "hidden-token" },
        },
      }),
    );

    expect(result.projectedRecord).toMatchObject({
      companyName: "Acme",
      replyToEmail: "[REDACTED]",
      secrets: { token: "[REDACTED]" },
    });
    expect(result.auditedFields).toEqual(["replyToEmail"]);
  });

  it("redacts regulated-sensitive fields for non-privileged actors", async () => {
    const fieldSecurity = await Effect.runPromise(makeFieldSecurityModule());

    const result = await Effect.runPromise(
      fieldSecurity.applyProjection({
        moduleId: platformModuleId.supportOperations,
        requestContext: organizationRequestContext,
        projection: {
          ...regulatedSensitiveProjection[0],
        },
        record: {
          companyName: "Acme",
          ssn: "123-45-6789",
        },
      }),
    );

    expect(result.projectedRecord.ssn).toBe("[REDACTED]");
    expect(result.projectedRecord.companyName).toBe("Acme");
  });

  it("denies authorization when break-glass context is expired", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_1",
          sessionId: "sess_1",
          correlationId: "corr_expired",
          reason: "Expired break-glass test",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
          },
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Expired",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(decision.allowed).toBe(false);
  });

  it("evicts the oldest authorization cache entry when capacity is exceeded", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        maxCacheSize: 1,
      }),
    );

    const activeBreakGlassContext = {
      ...supportRequestContext,
      correlationId: "corr_cache_a",
      reason: "Cache eviction regression",
      breakGlass: {
        approvedBy: "usr_admin_1",
        reason: "Cache eviction regression",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    };

    const cachedDecision = await Effect.runPromise(
      authorization.check({
        requestContext: activeBreakGlassContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(cachedDecision.allowed).toBe(true);

    await Effect.runPromise(
      authorization.check({
        requestContext: {
          ...organizationRequestContext,
          correlationId: "corr_cache_b",
        },
        namespace: authorizationNamespace.tenant,
        object: "org_2",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    const recomputedDecision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          ...activeBreakGlassContext,
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Cache eviction regression",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(recomputedDecision.allowed).toBe(false);
  });

  it("returns module capability contracts for a given module", () => {
    const contracts = getModuleCapabilityContracts(
      platformModuleId.tenantBranding,
    );

    expect(contracts.length).toBeGreaterThanOrEqual(2);
    expect(contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromModuleId: platformModuleId.tenantBranding,
          capability: moduleCapability.publishedAssetPublication,
        }),
      ]),
    );
  });

  it("starts auth and completes callback into durable lifecycle and onboarding state", async () => {
    const database = createIdentitySessionTestDatabase();
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
    );
    const identityRepository = await Effect.runPromise(
      makeIdentitySessionPostgresRepository(database.database),
    );
    const onboardingRepository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.database),
    );
    const identitySession = await Effect.runPromise(
      makeIdentitySessionModule().pipe(
        Effect.provideService(KeycloakAdapter, keycloak),
        Effect.provideService(ValkeyAdapter, valkey),
        Effect.provideService(TenantManagementModule, tenantManagement),
        Effect.provideService(
          IdentitySessionPostgresRepository,
          identityRepository,
        ),
        Effect.provideService(
          TenantOnboardingPostgresRepository,
          onboardingRepository,
        ),
      ),
    );

    const authStart = await Effect.runPromise(
      identitySession.startAuthentication({
        requestContext: {
          actorType: actorType.anonymous,
          correlationId: "corr_auth_start",
          host: "product.example.com",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        tenantHint: "org_1",
        returnHost: "product.example.com",
      }),
    );

    const completion = await Effect.runPromise(
      identitySession.completeAuthentication({
        session: {
          authenticated: true,
          sessionId: "sess_auth_1",
          actorId: "usr_owner_1",
          realm: "comvestec",
          tenantHint: "org_1",
        },
        correlationId: "corr_auth_start",
        host: "product.example.com",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          enterpriseId: "ent_1",
          organizationId: "org_1",
          individualId: "usr_owner_1",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
      }),
    );

    expect(authStart.redirect.realm).toBe("comvestec");
    expect(authStart.redirect.tenantHint).toBe("org_1");
    expect(authStart.correlationId).toBe("corr_auth_start");
    expect(completion.requestContext.actorType).toBe(
      actorType.organizationAdmin,
    );
    expect(completion.requestContext.actorId).toBe("usr_owner_1");
    expect(completion.requestContext.sessionId).toBe("sess_auth_1");
    expect(completion.lifecycleEvent.eventType).toBe(
      identitySessionLifecycleEventType.authCallbackCompleted,
    );
    expect(
      database.identitySessionEvents.get(
        [
          platformAdapterServiceName.keycloak,
          "sess_auth_1",
          "corr_auth_start",
          identitySessionLifecycleEventType.authCallbackCompleted,
        ].join(":"),
      ),
    ).toMatchObject({
      actorId: "usr_owner_1",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      provider: platformAdapterServiceName.keycloak,
    });
    expect(
      database.onboardingRuns.get(
        [
          identitySessionRunIdPrefix.tenantOnboarding,
          platformScope.organization,
          "org_1",
        ].join(":"),
      ),
    ).toMatchObject({
      triggeredBy: "usr_owner_1",
      status: tenantOnboardingRunStatus.inProgress,
      correlationId: "corr_auth_start",
    });
    await expect(
      Effect.runPromise(
        identitySession.resolveRequestContext({ sessionId: "sess_auth_1" }),
      ),
    ).resolves.toMatchObject({
      actorId: "usr_owner_1",
      sessionId: "sess_auth_1",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
      },
    });
    expect(
      database.onboardingSteps.get(
        [
          identitySessionRunIdPrefix.tenantOnboarding,
          platformScope.organization,
          "org_1",
          "billing",
        ].join(":"),
      ),
    ).toMatchObject({
      requiredModuleId: platformModuleId.billingAndMetering,
      status: onboardingStepStatus.notStarted,
    });
  });
});
