import { Effect } from "effect";
import {
  auditLogEventsTable,
  getPostgresSchemaColumnNames,
  identitySessionLifecycleEventType,
  identitySessionAuditTable,
  makeAuditLogPostgresRepository,
  makeIdentitySessionPostgresRepository,
  makeTenantOnboardingPostgresRepository,
  tenantOnboardingRunStatus,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  type AuditLogPostgresDatabase,
  type PostgresDatabase,
  type PostgresInsertBuilder,
} from "@comvestec/modules";
import {
  onboardingStepStatus,
  platformModuleId,
  platformScope,
  runtimeConfigAuditAction,
  supportOperationsAuditAction,
} from "@comvestec/contracts";
import { platformAdapterServiceName } from "@comvestec/platform";

const createPersistenceTestDatabase = () => {
  type PersistedTable = Parameters<PostgresDatabase["insert"]>[0];
  type PersistedValues = Parameters<
    PostgresInsertBuilder<PersistedTable>["values"]
  >[0];
  const auditLogEvents = new Map<
    string,
    typeof auditLogEventsTable.$inferSelect
  >();
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
      if (table === auditLogEventsTable) {
        const event = row as typeof auditLogEventsTable.$inferInsert;
        auditLogEvents.set(event.eventId, {
          eventId: event.eventId,
          moduleId: event.moduleId,
          action: event.action,
          target: event.target,
          actorId: event.actorId,
          tenantScope: event.tenantScope,
          tenantScopeId: event.tenantScopeId,
          reason: event.reason ?? null,
          correlationId: event.correlationId ?? null,
          requestContext: event.requestContext ?? {},
          recordedAt: event.recordedAt ?? new Date(),
        });
        continue;
      }

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

  const database: AuditLogPostgresDatabase = {
    ...transaction,
    transaction: async (callback) => callback(transaction),
    listEventsByModule: async (moduleId) =>
      [...auditLogEvents.values()].filter(
        (event) => event.moduleId === moduleId,
      ),
  };

  return {
    auditLogEvents,
    database,
    identitySessionEvents,
    onboardingRuns,
    onboardingSteps,
  };
};

describe("modules persistence", () => {
  it("declares PostgreSQL-owned schema tables for core system records", () => {
    const columns = getPostgresSchemaColumnNames();

    expect(columns.auditLogEventsTable).toEqual(
      expect.arrayContaining(["eventId", "moduleId", "requestContext"]),
    );
    expect(columns.runtimeConfigOverridesTable).toEqual(
      expect.arrayContaining(["overrideId", "key", "scope", "value"]),
    );
    expect(columns.runtimeConfigSyncArtifactsTable).toEqual(
      expect.arrayContaining(["proposalId", "artifactPath", "status"]),
    );
    expect(columns.identitySessionAuditTable).toEqual(
      expect.arrayContaining(["sessionId", "eventType", "metadata"]),
    );
    expect(columns.tenantBrandingDomainVerificationTable).toEqual(
      expect.arrayContaining(["requestedHost", "lifecycleState", "dnsProof"]),
    );
    expect(columns.billingEntitlementsTable).toEqual(
      expect.arrayContaining(["featureKey", "active", "quotaSnapshot"]),
    );
    expect(columns.billingPlansTable).toEqual(
      expect.arrayContaining(["planKey", "displayName", "active"]),
    );
    expect(columns.billingPlanPricesTable).toEqual(
      expect.arrayContaining([
        "billingInterval",
        "amountMinor",
        "providerPriceId",
      ]),
    );
    expect(columns.billingPlanEntitlementsTable).toEqual(
      expect.arrayContaining(["metered", "quotaLimit", "enforcementMode"]),
    );
    expect(columns.billingCustomerAccountsTable).toEqual(
      expect.arrayContaining(["providerCustomerId", "status", "metadata"]),
    );
    expect(columns.billingSubscriptionsTable).toEqual(
      expect.arrayContaining(["providerSubscriptionId", "planId", "status"]),
    );
    expect(columns.billingPaymentEventsTable).toEqual(
      expect.arrayContaining(["providerEventId", "eventType", "payload"]),
    );
    expect(columns.webhookReceiptsTable).toEqual(
      expect.arrayContaining([
        "deliveryId",
        "processingState",
        "verifiedSignature",
      ]),
    );
    expect(columns.tenantOnboardingRunsTable).toEqual(
      expect.arrayContaining(["tenantScopeId", "status", "correlationId"]),
    );
    expect(columns.tenantOnboardingStepsTable).toEqual(
      expect.arrayContaining(["stepId", "status", "retryCount"]),
    );
  });

  it("persists idempotent identity session lifecycle events", async () => {
    const database = createPersistenceTestDatabase();
    const repository = await Effect.runPromise(
      makeIdentitySessionPostgresRepository(database.database),
    );

    await Effect.runPromise(
      repository.persistLifecycleEvent({
        eventId: "evt_auth_callback",
        sessionId: "sess_1",
        actorId: "usr_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        eventType: identitySessionLifecycleEventType.authCallbackCompleted,
        provider: platformAdapterServiceName.keycloak,
        metadata: {
          correlationId: "corr_1",
          result: "activated",
        },
      }),
    );

    await Effect.runPromise(
      repository.persistLifecycleEvent({
        eventId: "evt_auth_callback",
        sessionId: "sess_1",
        actorId: "usr_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        eventType: identitySessionLifecycleEventType.authCallbackCompleted,
        provider: platformAdapterServiceName.keycloak,
        metadata: {
          correlationId: "corr_1",
          result: "resumed",
        },
      }),
    );

    expect(database.identitySessionEvents.size).toBe(1);
    expect(
      database.identitySessionEvents.get("evt_auth_callback"),
    ).toMatchObject({
      sessionId: "sess_1",
      actorId: "usr_1",
      tenantScope: platformScope.organization,
      eventType: identitySessionLifecycleEventType.authCallbackCompleted,
      metadata: {
        correlationId: "corr_1",
        result: "resumed",
      },
    });
  });

  it("persists and queries audit events by module", async () => {
    const database = createPersistenceTestDatabase();
    const repository = await Effect.runPromise(
      makeAuditLogPostgresRepository(database.database),
    );

    await Effect.runPromise(
      repository.insertAuditEvent({
        eventId: "support-1",
        timestamp: new Date().toISOString(),
        actorId: "usr_support_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.supportOperations,
        action: supportOperationsAuditAction.breakGlassStarted,
        target: "org_1",
        reason: "Investigate support escalation",
        correlationId: "corr_support_1",
      }),
    );

    await Effect.runPromise(
      repository.insertAuditEvent({
        eventId: "runtime-1",
        timestamp: new Date().toISOString(),
        actorId: "usr_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.runtimeConfig,
        action: runtimeConfigAuditAction.overrideChanged,
        target: "tenantBranding.companyName",
        correlationId: "corr_runtime_1",
      }),
    );

    const events = await Effect.runPromise(
      repository.queryByModule(platformModuleId.supportOperations),
    );

    expect(database.auditLogEvents.size).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: "support-1",
      moduleId: platformModuleId.supportOperations,
      action: supportOperationsAuditAction.breakGlassStarted,
      target: "org_1",
      reason: "Investigate support escalation",
      correlationId: "corr_support_1",
    });
  });

  it("persists onboarding runs and step state through transactional upserts", async () => {
    const database = createPersistenceTestDatabase();
    const repository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.database),
    );

    await Effect.runPromise(
      repository.persistOnboardingRun({
        runId: "onboarding:org_1",
        triggeredBy: "usr_1",
        correlationId: "corr_1",
        status: tenantOnboardingRunStatus.inProgress,
        currentStepId: "team-invites",
        plan: {
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          steps: [
            {
              stepId: "tenant-profile",
              label: "Create tenant profile and confirm primary owner.",
              status: onboardingStepStatus.completed,
            },
            {
              stepId: "team-invites",
              label: "Invite core team members and assign roles.",
              status: onboardingStepStatus.inProgress,
              requiredModuleId: platformModuleId.tenantManagement,
            },
            {
              stepId: "security-baseline",
              label: "Enable MFA and verify privileged access workflows.",
              status: onboardingStepStatus.notStarted,
              requiredModuleId: platformModuleId.identitySession,
            },
          ],
        },
        metadata: {
          source: "auth.callback",
        },
      }),
    );

    await Effect.runPromise(
      repository.persistOnboardingRun({
        runId: "onboarding:org_1",
        triggeredBy: "usr_1",
        correlationId: "corr_1",
        status: tenantOnboardingRunStatus.completed,
        currentStepId: "security-baseline",
        completedAt: new Date().toISOString(),
        plan: {
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          steps: [
            {
              stepId: "tenant-profile",
              label: "Create tenant profile and confirm primary owner.",
              status: onboardingStepStatus.completed,
            },
            {
              stepId: "team-invites",
              label: "Invite core team members and assign roles.",
              status: onboardingStepStatus.completed,
              requiredModuleId: platformModuleId.tenantManagement,
            },
            {
              stepId: "security-baseline",
              label: "Enable MFA and verify privileged access workflows.",
              status: onboardingStepStatus.completed,
              requiredModuleId: platformModuleId.identitySession,
            },
          ],
        },
        metadata: {
          source: "billing.webhook",
        },
      }),
    );

    expect(database.onboardingRuns.get("onboarding:org_1")).toMatchObject({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      triggeredBy: "usr_1",
      status: tenantOnboardingRunStatus.completed,
      currentStepId: "security-baseline",
      correlationId: "corr_1",
      metadata: {
        source: "billing.webhook",
      },
    });
    expect(database.onboardingSteps.size).toBe(3);
    expect(
      database.onboardingSteps.get("onboarding:org_1:team-invites"),
    ).toMatchObject({
      status: onboardingStepStatus.completed,
      requiredModuleId: platformModuleId.tenantManagement,
    });
    expect(
      database.onboardingSteps.get("onboarding:org_1:security-baseline"),
    ).toMatchObject({
      status: onboardingStepStatus.completed,
      requiredModuleId: platformModuleId.identitySession,
    });
  });
});
