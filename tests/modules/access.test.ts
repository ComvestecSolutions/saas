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
  makeTenantProvisioningPostgresRepository,
  identitySessionAuditTable,
  tenantProvisioningReceiptsTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  tenantOnboardingRunStatus,
  type PostgresDatabase,
  type PostgresInsertBuilder,
  IdentitySessionPostgresRepository,
  TenantManagementModule,
  TenantOnboardingPostgresRepository,
  TenantProvisioningPostgresRepository,
  tenantProvisioningStatus,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makeValkeyAdapter,
  OryKetoAdapter,
  platformAdapterServiceName,
  ValkeyAdapter,
} from "@comvestec/platform";
import { organizationRequestContext, supportRequestContext } from "./_fixtures";
import {
  createKeycloakTestOptions,
  createOryKetoTestOptions,
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
  const provisioningReceipts = new Map<
    string,
    typeof tenantProvisioningReceiptsTable.$inferInsert
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

      if (table === tenantProvisioningReceiptsTable) {
        const receipt =
          row as typeof tenantProvisioningReceiptsTable.$inferInsert;
        provisioningReceipts.set(receipt.provisioningId, receipt);
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
        execute: async () => {
          persistRows(table, values);
        },
        onConflictDoUpdate: () => ({
          execute: async () => {
            persistRows(table, values);
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => [],
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
    provisioningReceipts,
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
    caseId: supportOperationsFields.caseId,
    impersonatedUser: supportOperationsFields.impersonatedUser,
  }),
  [
    {
      profile: projectionProfile.detail,
      visibleFields: [
        supportOperationsFields.caseId,
        supportOperationsFields.impersonatedUser,
      ],
      auditedFields: [supportOperationsFields.impersonatedUser],
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

  it("maps member-manage checks onto tenant admin relations", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: authorizationRelation.admin,
            subject: "usr_admin_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          ...organizationRequestContext,
          actorId: "usr_admin_1",
        },
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.memberManage,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it("prefers delegated authorization checks over seeded tuples", async () => {
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
        delegatedCheck: ({ subject }) =>
          Effect.succeed(
            subject === `actor-type:${actorType.organizationMember}`,
          ),
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
    expect(decision.reason).toBe(
      "Allowed via delegated authorization fallback without persisted tuple evidence.",
    );
    expect(decision).not.toHaveProperty("matchedTuple");
    expect(explanation.matchedSubject).toBe(
      `actor-type:${actorType.organizationMember}`,
    );
  });

  it("prefers delegated persisted tuples for explainability when available", async () => {
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
        delegatedCheck: () => Effect.succeed(false),
        delegatedTupleLookup: () =>
          Effect.succeed([
            {
              namespace: authorizationNamespace.tenant,
              object: "org_1",
              relation: authorizationRelation.viewer,
              subject: `actor-type:${actorType.organizationMember}`,
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
            },
          ]),
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
    expect(decision.reason).toBe("Matched persisted authorization relation.");
    expect(decision.matchedTuple).toMatchObject({
      subject: `actor-type:${actorType.organizationMember}`,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(explanation.matchedSubject).toBe(
      `actor-type:${actorType.organizationMember}`,
    );
  });

  it("falls back to delegated authorization checks when persisted tuple lookup fails", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        delegatedCheck: ({ subject }) =>
          Effect.succeed(
            subject === `actor-type:${actorType.organizationMember}`,
          ),
        delegatedTupleLookup: () =>
          Effect.fail({
            _tag: "AuthorizationDelegatedCheckError",
            reason: "Keto tuple read unavailable",
            cause: new Error("keto tuple read unavailable"),
          } as const),
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
    expect(decision.reason).toBe(
      "Allowed via delegated authorization fallback without persisted tuple evidence.",
    );
    expect(decision).not.toHaveProperty("matchedTuple");
    expect(explanation.matchedSubject).toBe(
      `actor-type:${actorType.organizationMember}`,
    );
  });

  it("treats empty delegated tuple lookups as degraded explainability when delegated checks allow access", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        delegatedCheck: ({ subject }) =>
          Effect.succeed(
            subject === `actor-type:${actorType.organizationMember}`,
          ),
        delegatedTupleLookup: () => Effect.succeed([]),
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
    expect(decision.reason).toBe(
      "Allowed via delegated authorization fallback without persisted tuple evidence.",
    );
    expect(decision).not.toHaveProperty("matchedTuple");
    expect(explanation.matchedSubject).toBe(
      `actor-type:${actorType.organizationMember}`,
    );
  });

  it("reports degraded deny reasons when tuple lookup fails and delegated fallback also denies", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        delegatedCheck: () => Effect.succeed(false),
        delegatedTupleLookup: () =>
          Effect.fail({
            _tag: "AuthorizationDelegatedCheckError",
            reason: "Keto tuple read unavailable",
            cause: new Error("keto tuple read unavailable"),
          } as const),
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

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(
      "Access denied because persisted tuple evidence was unavailable and delegated fallback found no match.",
    );
    expect(decision).not.toHaveProperty("matchedTuple");
    expect(explanation).not.toHaveProperty("matchedSubject");
  });

  it("reports degraded deny reasons when empty tuple lookups leave delegated fallback without a match", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        delegatedCheck: () => Effect.succeed(false),
        delegatedTupleLookup: () => Effect.succeed([]),
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

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(
      "Access denied because persisted tuple evidence was unavailable and delegated fallback found no match.",
    );
    expect(decision).not.toHaveProperty("matchedTuple");
    expect(explanation).not.toHaveProperty("matchedSubject");
  });

  it("allows active break-glass access without delegated authorization availability", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        delegatedCheck: () =>
          Effect.fail({
            _tag: "AuthorizationDelegatedCheckError",
            reason: "Keto unavailable",
            cause: new Error("keto unavailable"),
          } as const),
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          ...supportRequestContext,
          correlationId: "corr_break_glass_delegated_failure",
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Emergency support access",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(decision).toMatchObject({
      allowed: true,
      reason: "Allowed via break-glass context.",
      auditRequired: true,
    });
  });

  it("does not report a matched subject when break-glass short-circuits the explanation", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: authorizationRelation.viewer,
            subject: "usr_support_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          },
        ],
        cacheTtlSeconds: 60,
        delegatedCheck: () =>
          Effect.fail({
            _tag: "AuthorizationDelegatedCheckError",
            reason: "Keto unavailable",
            cause: new Error("keto unavailable"),
          } as const),
      }),
    );

    const explanation = await Effect.runPromise(
      authorization.explain({
        requestContext: {
          ...supportRequestContext,
          correlationId: "corr_break_glass_explain",
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Emergency support access",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(explanation).not.toHaveProperty("matchedSubject");
    expect(explanation.usedBreakGlass).toBe(true);
  });

  it("does not reuse cached break-glass access after the break-glass expiry passes", async () => {
    vi.useFakeTimers();

    try {
      const issuedAt = new Date("2026-04-22T12:00:00.000Z");
      const expiresAt = new Date(issuedAt.getTime() + 30_000).toISOString();
      vi.setSystemTime(issuedAt.getTime());

      const authorization = await Effect.runPromise(
        makeAuthorizationModule({
          tuples: [],
          cacheTtlSeconds: 300,
        }),
      );

      const activeRequestContext = {
        ...supportRequestContext,
        correlationId: "corr_break_glass_cache_expiry",
        breakGlass: {
          approvedBy: "usr_admin_1",
          reason: "Emergency support access",
          expiresAt,
        },
      };

      const allowedDecision = await Effect.runPromise(
        authorization.check({
          requestContext: activeRequestContext,
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          permissionScope: permissionScope.tenantRead,
        }),
      );

      expect(allowedDecision).toMatchObject({
        allowed: true,
        reason: "Allowed via break-glass context.",
      });

      vi.setSystemTime(issuedAt.getTime() + 31_000);

      const deniedDecision = await Effect.runPromise(
        authorization.check({
          requestContext: activeRequestContext,
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          permissionScope: permissionScope.tenantRead,
        }),
      );

      expect(deniedDecision).toMatchObject({
        allowed: false,
        reason: "No matching authorization tuple was found.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("denies unmapped permission scopes without delegated authorization availability", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        delegatedCheck: () =>
          Effect.fail({
            _tag: "AuthorizationDelegatedCheckError",
            reason: "Keto unavailable",
            cause: new Error("keto unavailable"),
          } as const),
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: organizationRequestContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.billingRead,
      }),
    );

    expect(decision).toMatchObject({
      allowed: false,
      reason:
        "Permission scope does not map to the requested namespace relation.",
      auditRequired: false,
    });
  });

  it("does not report a matched subject when permission scope mapping denies the request", async () => {
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

    const explanation = await Effect.runPromise(
      authorization.explain({
        requestContext: organizationRequestContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.billingRead,
      }),
    );

    expect(explanation).not.toHaveProperty("matchedSubject");
    expect(explanation.usedBreakGlass).toBe(false);
  });

  it("maps billing read permission to billing entitlement viewer access", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.billingEntitlement,
            object: platformScope.platform,
            relation: authorizationRelation.viewer,
            subject: `actor-type:${actorType.platformOperator}`,
            tenantScope: platformScope.platform,
            tenantScopeId: platformScope.platform,
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_billing_read",
          correlationId: "corr_billing_read",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        namespace: authorizationNamespace.billingEntitlement,
        object: platformScope.platform,
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.billingRead,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it("maps workflow manage permission to module admin access", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.module,
            object: platformModuleId.workflowJobs,
            relation: authorizationRelation.admin,
            subject: `actor-type:${actorType.platformOperator}`,
            tenantScope: platformScope.platform,
            tenantScopeId: platformScope.platform,
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_workflow_manage",
          correlationId: "corr_workflow_manage",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        namespace: authorizationNamespace.module,
        object: platformModuleId.workflowJobs,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.workflowManage,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it("maps retention manage permission to module admin access", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.module,
            object: platformModuleId.retentionLegalHold,
            relation: authorizationRelation.admin,
            subject: `actor-type:${actorType.supportOperator}`,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_operator",
          sessionId: "sess_retention_manage",
          correlationId: "corr_retention_manage",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
          },
        },
        namespace: authorizationNamespace.module,
        object: platformModuleId.retentionLegalHold,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.retentionManage,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it("maps search admin permission to module admin access", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.module,
            object: platformModuleId.search,
            relation: authorizationRelation.admin,
            subject: `actor-type:${actorType.supportOperator}`,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_search_operator",
          sessionId: "sess_search_admin",
          correlationId: "corr_search_admin",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
          },
        },
        namespace: authorizationNamespace.module,
        object: platformModuleId.search,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.searchAdmin,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it("maps webhook manage permission to module admin access", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.module,
            object: platformModuleId.webhooksApiAccess,
            relation: authorizationRelation.admin,
            subject: `actor-type:${actorType.supportOperator}`,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_webhook_operator",
          sessionId: "sess_webhook_manage",
          correlationId: "corr_webhook_manage",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
          },
        },
        namespace: authorizationNamespace.module,
        object: platformModuleId.webhooksApiAccess,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.webhookManage,
      }),
    );

    expect(decision.allowed).toBe(true);
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
          caseId: "case_support_1",
          impersonatedUser: "usr_member_1",
        },
      }),
    );

    expect(result.projectedRecord.impersonatedUser).toBe("[REDACTED]");
    expect(result.projectedRecord.caseId).toBe("case_support_1");
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
    const oryKeto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
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
    const provisioningRepository = await Effect.runPromise(
      makeTenantProvisioningPostgresRepository(database.database),
    );
    const identitySession = await Effect.runPromise(
      makeIdentitySessionModule().pipe(
        Effect.provideService(KeycloakAdapter, keycloak),
        Effect.provideService(OryKetoAdapter, oryKeto),
        Effect.provideService(ValkeyAdapter, valkey),
        Effect.provideService(TenantManagementModule, tenantManagement),
        Effect.provideService(
          IdentitySessionPostgresRepository,
          identityRepository,
        ),
        Effect.provideService(
          TenantProvisioningPostgresRepository,
          provisioningRepository,
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
        displayNameHint: "Acme",
        themeHint: "#111827",
        redirectUri: "https://product.example.com/auth/callback",
      }),
    );

    const authStartUrl = new URL(authStart.redirect.url);

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
    expect(authStart.redirect.displayNameHint).toBe("Acme");
    expect(authStart.redirect.themeHint).toBe("#111827");
    expect(authStart.correlationId).toBe("corr_auth_start");
    expect(authStartUrl.searchParams.get("tenant_hint")).toBe("org_1");
    expect(authStartUrl.searchParams.get("display_name_hint")).toBe("Acme");
    expect(authStartUrl.searchParams.get("theme_hint")).toBe("#111827");
    expect(completion.requestContext.actorType).toBe(
      actorType.organizationAdmin,
    );
    expect(completion.requestContext.actorId).toBe("usr_owner_1");
    expect(completion.requestContext.sessionId).toBe("sess_auth_1");
    expect(completion.provisioning.status).toBe(
      tenantProvisioningStatus.provisioned,
    );
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
    expect(
      database.provisioningReceipts.get(
        ["tenant-provisioning", platformScope.organization, "org_1"].join(":"),
      ),
    ).toMatchObject({
      ownerActorId: "usr_owner_1",
      status: tenantProvisioningStatus.provisioned,
      correlationId: "corr_auth_start",
    });
    await expect(
      Effect.runPromise(
        oryKeto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: "usr_owner_1",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
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

  it("persists logout lifecycle events and invalidates backend sessions", async () => {
    const database = createIdentitySessionTestDatabase();
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const oryKeto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
    );
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
    );
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );
    const identityRepository = await Effect.runPromise(
      makeIdentitySessionPostgresRepository(database.database),
    );
    const provisioningRepository = await Effect.runPromise(
      makeTenantProvisioningPostgresRepository(database.database),
    );
    const onboardingRepository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.database),
    );
    const identitySession = await Effect.runPromise(
      makeIdentitySessionModule().pipe(
        Effect.provideService(KeycloakAdapter, keycloak),
        Effect.provideService(OryKetoAdapter, oryKeto),
        Effect.provideService(ValkeyAdapter, valkey),
        Effect.provideService(TenantManagementModule, tenantManagement),
        Effect.provideService(
          IdentitySessionPostgresRepository,
          identityRepository,
        ),
        Effect.provideService(
          TenantProvisioningPostgresRepository,
          provisioningRepository,
        ),
        Effect.provideService(
          TenantOnboardingPostgresRepository,
          onboardingRepository,
        ),
      ),
    );

    await Effect.runPromise(
      identitySession.completeAuthentication({
        session: {
          authenticated: true,
          sessionId: "sess_logout_1",
          actorId: "usr_logout_1",
          realm: "comvestec",
          tenantHint: "org_1",
        },
        correlationId: "corr_auth_logout_start",
        host: "product.example.com",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          enterpriseId: "ent_1",
          organizationId: "org_1",
          individualId: "usr_logout_1",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
      }),
    );

    await expect(
      Effect.runPromise(
        identitySession.invalidateSession({
          sessionId: "sess_logout_1",
          correlationId: "corr_logout_1",
          reason: "logout",
        }),
      ),
    ).resolves.toMatchObject({
      sessionId: "sess_logout_1",
      correlationId: "corr_logout_1",
      reason: "logout",
      invalidated: true,
      requestContext: {
        actorId: "usr_logout_1",
      },
      lifecycleEvent: {
        eventType: identitySessionLifecycleEventType.logoutCompleted,
      },
    });

    expect(
      database.identitySessionEvents.get(
        [
          platformAdapterServiceName.keycloak,
          "sess_logout_1",
          "corr_logout_1",
          identitySessionLifecycleEventType.logoutCompleted,
        ].join(":"),
      ),
    ).toMatchObject({
      actorId: "usr_logout_1",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      eventType: identitySessionLifecycleEventType.logoutCompleted,
      provider: platformAdapterServiceName.keycloak,
      metadata: {
        correlationId: "corr_logout_1",
        reason: "logout",
      },
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          identitySession.resolveRequestContext({ sessionId: "sess_logout_1" }),
        ),
      ),
    ).resolves.toEqual({
      _tag: "IdentitySessionRequestContextNotFoundError",
      sessionId: "sess_logout_1",
    });
  });

  it("treats missing stale sessions as already invalidated", async () => {
    const database = createIdentitySessionTestDatabase();
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const oryKeto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
    );
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
    );
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );
    const identityRepository = await Effect.runPromise(
      makeIdentitySessionPostgresRepository(database.database),
    );
    const provisioningRepository = await Effect.runPromise(
      makeTenantProvisioningPostgresRepository(database.database),
    );
    const onboardingRepository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.database),
    );
    const identitySession = await Effect.runPromise(
      makeIdentitySessionModule().pipe(
        Effect.provideService(KeycloakAdapter, keycloak),
        Effect.provideService(OryKetoAdapter, oryKeto),
        Effect.provideService(ValkeyAdapter, valkey),
        Effect.provideService(TenantManagementModule, tenantManagement),
        Effect.provideService(
          IdentitySessionPostgresRepository,
          identityRepository,
        ),
        Effect.provideService(
          TenantProvisioningPostgresRepository,
          provisioningRepository,
        ),
        Effect.provideService(
          TenantOnboardingPostgresRepository,
          onboardingRepository,
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        identitySession.invalidateSession({
          sessionId: "sess_stale_missing",
          correlationId: "corr_stale_missing",
          reason: "stale-session",
        }),
      ),
    ).resolves.toEqual({
      sessionId: "sess_stale_missing",
      correlationId: "corr_stale_missing",
      reason: "stale-session",
      invalidated: false,
    });

    expect(database.identitySessionEvents.size).toBe(0);
  });

  it("does not persist logout lifecycle evidence when backend session deletion fails", async () => {
    const database = createIdentitySessionTestDatabase();
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const oryKeto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
    );
    const failingDeleteClient = {
      ...createValkeyTestClient(),
      del: async () => {
        throw new Error("Simulated delete failure");
      },
    };
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: failingDeleteClient,
      }),
    );
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );
    const identityRepository = await Effect.runPromise(
      makeIdentitySessionPostgresRepository(database.database),
    );
    const provisioningRepository = await Effect.runPromise(
      makeTenantProvisioningPostgresRepository(database.database),
    );
    const onboardingRepository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.database),
    );
    const identitySession = await Effect.runPromise(
      makeIdentitySessionModule().pipe(
        Effect.provideService(KeycloakAdapter, keycloak),
        Effect.provideService(OryKetoAdapter, oryKeto),
        Effect.provideService(ValkeyAdapter, valkey),
        Effect.provideService(TenantManagementModule, tenantManagement),
        Effect.provideService(
          IdentitySessionPostgresRepository,
          identityRepository,
        ),
        Effect.provideService(
          TenantProvisioningPostgresRepository,
          provisioningRepository,
        ),
        Effect.provideService(
          TenantOnboardingPostgresRepository,
          onboardingRepository,
        ),
      ),
    );

    await Effect.runPromise(
      identitySession.completeAuthentication({
        session: {
          authenticated: true,
          sessionId: "sess_logout_delete_failure",
          actorId: "usr_logout_delete_failure",
          realm: "comvestec",
          tenantHint: "org_1",
        },
        correlationId: "corr_auth_logout_delete_failure",
        host: "product.example.com",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          enterpriseId: "ent_1",
          organizationId: "org_1",
          individualId: "usr_logout_delete_failure",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          identitySession.invalidateSession({
            sessionId: "sess_logout_delete_failure",
            correlationId: "corr_logout_delete_failure",
            reason: "logout",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ValkeyAdapterOperationError",
      operation: "deleteSession",
    });

    expect(
      database.identitySessionEvents.has(
        [
          platformAdapterServiceName.keycloak,
          "sess_logout_delete_failure",
          "corr_logout_delete_failure",
          identitySessionLifecycleEventType.logoutCompleted,
        ].join(":"),
      ),
    ).toBe(false);
  });
});
