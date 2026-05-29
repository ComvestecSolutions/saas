import { Effect, Schema } from "effect";
import {
  auditLogEventsTable,
  getPostgresSchemaColumnNames,
  identitySessionLifecycleEventType,
  identitySessionAuditTable,
  createWorkflowJobRecordSchema,
  makeTenantBrandingDomainVerificationPostgresRepository,
  makeAuditLogPostgresRepository,
  makeBillingStatePostgresRepository,
  makeIdentitySessionPostgresRepository,
  makeSearchTenantIndexPostgresRepository,
  makeSupportOperationsCasePostgresRepository,
  makeSupportOperationsBreakGlassIncidentPostgresRepository,
  makeSupportOperationsImpersonationSessionPostgresRepository,
  makeRuntimeConfigPostgresRepository,
  makeTenantOnboardingPostgresRepository,
  makeWorkflowJobsPostgresRepositoryForPayload,
  runtimeConfigSyncArtifactStatus,
  runtimeConfigSyncArtifactsTable,
  searchTenantIndexesTable,
  tenantOnboardingRunStatus,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  workflowJobsTable,
  type AuditLogPostgresDatabase,
  type BillingStatePostgresQueryable,
  type PostgresDatabase,
  type PostgresInsertBuilder,
  type RuntimeConfigPostgresDatabase,
  type WorkflowJobsPostgresQueryableForRecord,
} from "@comvestec/modules";
import {
  billingPaymentEventStatus,
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookEventType,
  customDomainLifecycleState,
  onboardingStepStatus,
  platformModuleId,
  platformScope,
  runtimeChangeProposalAction,
  runtimeConfigAuditAction,
  searchIndexLifecycleState,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsImpersonationSessionStatus,
  supportOperationsAuditAction,
} from "@comvestec/contracts";
import {
  runtimeConfigConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import { platformAdapterServiceName } from "@comvestec/platform";
import { buildWriteDatabase } from "../../packages/platform/src/services/postgres-write-database";

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
  const runtimeConfigArtifacts = new Map<
    string,
    typeof runtimeConfigSyncArtifactsTable.$inferSelect
  >();

  const artifactPayloadChanged = (
    current: typeof runtimeConfigSyncArtifactsTable.$inferSelect,
    next: typeof runtimeConfigSyncArtifactsTable.$inferInsert,
  ) =>
    current.action !== next.action ||
    current.artifactPath !== next.artifactPath ||
    JSON.stringify(current.runtimeValue ?? null) !==
      JSON.stringify(next.runtimeValue ?? null) ||
    JSON.stringify(current.codeValue ?? null) !==
      JSON.stringify(next.codeValue ?? null);

  const toPersistedRuntimeConfigArtifact = (
    artifact: typeof runtimeConfigSyncArtifactsTable.$inferInsert,
  ): typeof runtimeConfigSyncArtifactsTable.$inferSelect => ({
    proposalId: artifact.proposalId,
    moduleId: artifact.moduleId,
    key: artifact.key,
    action: artifact.action,
    artifactPath: artifact.artifactPath,
    runtimeValue: artifact.runtimeValue ?? null,
    codeValue: artifact.codeValue ?? null,
    status: artifact.status ?? runtimeConfigSyncArtifactStatus.pending,
    generatedAt: artifact.generatedAt ?? new Date(),
    decidedBy: null,
    decisionReason: null,
    decidedAt: null,
  });

  const persistRuntimeConfigArtifact = (
    artifact: typeof runtimeConfigSyncArtifactsTable.$inferInsert,
  ) => {
    const existingArtifact = runtimeConfigArtifacts.get(artifact.proposalId);
    const persistedArtifact = toPersistedRuntimeConfigArtifact(artifact);

    if (existingArtifact === undefined) {
      runtimeConfigArtifacts.set(artifact.proposalId, persistedArtifact);
      return;
    }

    if (!artifactPayloadChanged(existingArtifact, artifact)) {
      runtimeConfigArtifacts.set(artifact.proposalId, {
        ...persistedArtifact,
        status: existingArtifact.status,
        decidedBy: existingArtifact.decidedBy,
        decisionReason: existingArtifact.decisionReason,
        decidedAt: existingArtifact.decidedAt,
      });
      return;
    }

    const preserveDecisionMetadata =
      existingArtifact.status === runtimeConfigSyncArtifactStatus.approved &&
      artifact.action === runtimeChangeProposalAction.update &&
      JSON.stringify(artifact.runtimeValue ?? null) ===
        JSON.stringify(artifact.codeValue ?? null);

    runtimeConfigArtifacts.set(artifact.proposalId, {
      ...persistedArtifact,
      status: preserveDecisionMetadata
        ? runtimeConfigSyncArtifactStatus.applied
        : persistedArtifact.status,
      decidedBy: preserveDecisionMetadata ? existingArtifact.decidedBy : null,
      decisionReason: preserveDecisionMetadata
        ? existingArtifact.decisionReason
        : null,
      decidedAt: preserveDecisionMetadata ? existingArtifact.decidedAt : null,
    });
  };

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
        continue;
      }

      if (table === runtimeConfigSyncArtifactsTable) {
        persistRuntimeConfigArtifact(
          row as typeof runtimeConfigSyncArtifactsTable.$inferInsert,
        );
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
      from: (table: PersistedTable) => {
        const resolveRows = () => {
          const rows =
            table === runtimeConfigSyncArtifactsTable
              ? [...runtimeConfigArtifacts.values()]
              : table === tenantOnboardingRunsTable
                ? [...onboardingRuns.values()].sort((left, right) => {
                    const leftStartedAt = left.startedAt?.getTime() ?? 0;
                    const rightStartedAt = right.startedAt?.getTime() ?? 0;

                    return rightStartedAt - leftStartedAt;
                  })
                : table === tenantOnboardingStepsTable
                  ? [...onboardingSteps.values()].sort((left, right) => {
                      const runComparison = left.runId.localeCompare(
                        right.runId,
                      );

                      return runComparison !== 0
                        ? runComparison
                        : left.stepId.localeCompare(right.stepId);
                    })
                  : [];

          return rows;
        };

        return {
          where: () => Promise.resolve(resolveRows()),
        };
      },
    }),
  };

  const database: AuditLogPostgresDatabase & RuntimeConfigPostgresDatabase = {
    ...transaction,
    transaction: async (callback) => callback(transaction),
    listEventsByModule: async (moduleId) =>
      [...auditLogEvents.values()].filter(
        (event) => event.moduleId === moduleId,
      ),
    listEventsByTarget: async (input) =>
      [...auditLogEvents.values()].filter(
        (event) =>
          event.moduleId === input.moduleId && event.target === input.target,
      ),
    listEventsByActor: async (actorId) =>
      [...auditLogEvents.values()].filter((event) => event.actorId === actorId),
    listEventsByTenant: async (input) =>
      [...auditLogEvents.values()].filter(
        (event) =>
          event.tenantScope === input.tenantScope &&
          event.tenantScopeId === input.tenantScopeId,
      ),
    listOverridesByModule: async () => [],
    listOverrideProposalsByModule: async () => [],
    listSyncArtifactsByModule: async (moduleId) =>
      [...runtimeConfigArtifacts.values()].filter(
        (artifact) => artifact.moduleId === moduleId,
      ),
  };

  return {
    auditLogEvents,
    database,
    identitySessionEvents,
    onboardingRuns,
    onboardingSteps,
    runtimeConfigArtifacts,
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
    expect(columns.runtimeConfigOverrideProposalsTable).toEqual(
      expect.arrayContaining(["proposalId", "scope", "value", "status"]),
    );
    expect(columns.identitySessionAuditTable).toEqual(
      expect.arrayContaining(["sessionId", "eventType", "metadata"]),
    );
    expect(columns.tenantBrandingDomainVerificationTable).toEqual(
      expect.arrayContaining(["requestedHost", "lifecycleState", "dnsProof"]),
    );
    expect(columns.searchTenantIndexesTable).toEqual(
      expect.arrayContaining([
        "scopeId",
        "lifecycleState",
        "documentCount",
        "deletedAt",
      ]),
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
    expect(columns.webhookSubscriptionsTable).toEqual(
      expect.arrayContaining(["scopeId", "url", "events", "status"]),
    );
    expect(columns.webhookOutboundDeliveriesTable).toEqual(
      expect.arrayContaining([
        "deliveryId",
        "subscriptionId",
        "status",
        "attemptCount",
        "nextAttemptAt",
        "exhaustedAt",
      ]),
    );
    expect(columns.webhookApiKeysTable).toEqual(
      expect.arrayContaining([
        "apiKeyId",
        "scopeId",
        "prefix",
        "status",
        "rotatedAt",
        "revokedAt",
      ]),
    );
    expect(columns.retentionPoliciesTable).toEqual(
      expect.arrayContaining([
        "policyId",
        "scopeId",
        "dataType",
        "retentionDays",
      ]),
    );
    expect(columns.retentionLegalHoldsTable).toEqual(
      expect.arrayContaining([
        "legalHoldId",
        "targetId",
        "status",
        "releasedAt",
      ]),
    );
    expect(columns.supportOperationsCasesTable).toEqual(
      expect.arrayContaining([
        "caseId",
        "tenantScopeId",
        "status",
        "lastUpdatedAt",
      ]),
    );
    expect(columns.supportOperationsBreakGlassIncidentsTable).toEqual(
      expect.arrayContaining(["caseId", "supportAgent", "status", "expiresAt"]),
    );
    expect(columns.supportOperationsImpersonationSessionsTable).toEqual(
      expect.arrayContaining([
        "caseId",
        "impersonatedUser",
        "status",
        "expiresAt",
      ]),
    );
    expect(columns.tenantOnboardingRunsTable).toEqual(
      expect.arrayContaining(["tenantScopeId", "status", "correlationId"]),
    );
    expect(columns.tenantOnboardingStepsTable).toEqual(
      expect.arrayContaining(["stepId", "status", "retryCount"]),
    );
    expect(columns.tenantProvisioningReceiptsTable).toEqual(
      expect.arrayContaining([
        "ownerActorId",
        "authorizationTuples",
        "requestContext",
      ]),
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

  it("persists tenant search lifecycle records through the search repository", async () => {
    type PersistedSearchTenantIndex =
      typeof searchTenantIndexesTable.$inferSelect;
    const searchTenantIndexes = new Map<string, PersistedSearchTenantIndex>();
    const toStoredDate = (value: Date | string | null | undefined) =>
      value == null ? null : value instanceof Date ? value : new Date(value);

    const repository = await Effect.runPromise(
      makeSearchTenantIndexPostgresRepository({
        upsertSearchTenantIndex: async (record) => {
          const existing = searchTenantIndexes.get(
            record.indexName as PersistedSearchTenantIndex["indexName"],
          );
          const persisted: PersistedSearchTenantIndex = {
            indexName:
              record.indexName as PersistedSearchTenantIndex["indexName"],
            scope: record.scope as PersistedSearchTenantIndex["scope"],
            scopeId: record.scopeId as PersistedSearchTenantIndex["scopeId"],
            lifecycleState:
              record.lifecycleState as PersistedSearchTenantIndex["lifecycleState"],
            documentCount:
              record.documentCount as PersistedSearchTenantIndex["documentCount"],
            settings: (record.settings ??
              null) as PersistedSearchTenantIndex["settings"],
            lastSyncedAt: toStoredDate(record.lastSyncedAt),
            lastError: (record.lastError ??
              null) as PersistedSearchTenantIndex["lastError"],
            deletedAt: toStoredDate(record.deletedAt),
            createdAt:
              existing?.createdAt ??
              toStoredDate(record.createdAt) ??
              new Date("2026-04-27T15:00:00.000Z"),
            updatedAt:
              toStoredDate(record.updatedAt) ??
              new Date("2026-04-27T15:00:00.000Z"),
          };

          searchTenantIndexes.set(persisted.indexName, persisted);
          return persisted;
        },
        getSearchTenantIndex: async (scope, scopeId, indexName) => {
          const persisted = searchTenantIndexes.get(indexName);

          return persisted !== undefined &&
            persisted.scope === scope &&
            persisted.scopeId === scopeId
            ? persisted
            : undefined;
        },
        listSearchTenantIndexesByScope: async (scope, scopeId) =>
          [...searchTenantIndexes.values()].filter(
            (persisted) =>
              persisted.scope === scope && persisted.scopeId === scopeId,
          ),
      }),
    );

    const created = await Effect.runPromise(
      repository.upsertSearchTenantIndexRecord({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        documentCount: 17,
        lifecycleState: searchIndexLifecycleState.ready,
        settings: {
          filterableAttributes: ["status", "moduleId"],
          sortableAttributes: ["updatedAt"],
          searchableAttributes: ["title", "content"],
          rankingRules: ["words", "typo", "sort"],
          synonyms: {
            invoice: ["bill", "statement"],
          },
        },
        lastSyncedAt: "2026-04-27T15:00:00.000Z",
        createdAt: "2026-04-27T15:00:00.000Z",
        updatedAt: "2026-04-27T15:00:00.000Z",
      }),
    );

    const deleted = await Effect.runPromise(
      repository.upsertSearchTenantIndexRecord({
        ...created,
        documentCount: 0,
        lifecycleState: searchIndexLifecycleState.deleted,
        deletedAt: "2026-04-27T16:00:00.000Z",
        updatedAt: "2026-04-27T16:00:00.000Z",
      }),
    );

    const fetched = await Effect.runPromise(
      repository.getSearchTenantIndexRecord({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );
    const listed = await Effect.runPromise(
      repository.listSearchTenantIndexRecords({
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(created).toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      lifecycleState: searchIndexLifecycleState.ready,
      documentCount: 17,
      settings: {
        filterableAttributes: ["status", "moduleId"],
        synonyms: {
          invoice: ["bill", "statement"],
        },
      },
    });
    expect(deleted).toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      lifecycleState: searchIndexLifecycleState.deleted,
      documentCount: 0,
      deletedAt: "2026-04-27T16:00:00.000Z",
      createdAt: "2026-04-27T15:00:00.000Z",
    });
    expect(fetched).toEqual(deleted);
    expect(listed).toEqual([deleted]);
  });

  it("persists tenant-branding custom-domain verification requests through the repository", async () => {
    type PersistedTenantBrandingDomainVerification =
      typeof import("../../packages/modules/src/persistence/postgres/domains/tenant-branding").tenantBrandingDomainVerificationTable.$inferSelect;
    const domainVerifications = new Map<
      string,
      PersistedTenantBrandingDomainVerification
    >();
    const toStoredDate = (value: Date | string | null | undefined) =>
      value == null ? null : value instanceof Date ? value : new Date(value);

    const repository = await Effect.runPromise(
      makeTenantBrandingDomainVerificationPostgresRepository({
        createCustomDomainVerification: async (record) => {
          const duplicate = [...domainVerifications.values()].find(
            (verification) =>
              verification.requestedHost === record.requestedHost,
          );

          if (duplicate !== undefined) {
            throw Object.assign(new Error("duplicate custom domain"), {
              code: "23505",
            });
          }

          const persisted: PersistedTenantBrandingDomainVerification = {
            verificationId: record.verificationId,
            scope: record.scope,
            scopeId: record.scopeId,
            requestedHost: record.requestedHost,
            lifecycleState: record.lifecycleState,
            dnsProof: (record.dnsProof ??
              null) as PersistedTenantBrandingDomainVerification["dnsProof"],
            approvedBy: record.approvedBy ?? null,
            approvalNotes: record.approvalNotes ?? null,
            changedAt:
              toStoredDate(record.changedAt) ??
              new Date("2026-05-04T10:00:00.000Z"),
          };

          domainVerifications.set(persisted.verificationId, persisted);
          return persisted;
        },
        findCustomDomainVerification: async (input) =>
          [...domainVerifications.values()].find(
            (verification) =>
              verification.scope === input.scope &&
              verification.scopeId === input.scopeId &&
              verification.requestedHost === input.requestedHost,
          ),
        updateCustomDomainVerification: async (record) => {
          const existing = domainVerifications.get(record.verificationId);

          if (existing === undefined) {
            return undefined;
          }

          const persisted: PersistedTenantBrandingDomainVerification = {
            ...existing,
            scope: record.scope,
            scopeId: record.scopeId,
            requestedHost: record.requestedHost,
            lifecycleState: record.lifecycleState,
            dnsProof: (record.dnsProof ??
              null) as PersistedTenantBrandingDomainVerification["dnsProof"],
            approvedBy: record.approvedBy ?? null,
            approvalNotes: record.approvalNotes ?? null,
            changedAt:
              toStoredDate(record.changedAt) ??
              new Date("2026-05-04T10:00:00.000Z"),
          };

          domainVerifications.set(persisted.verificationId, persisted);

          return persisted;
        },
        findCurrentCustomDomainVerification: async (input) =>
          [...domainVerifications.values()]
            .filter(
              (verification) =>
                verification.scope === input.scope &&
                verification.scopeId === input.scopeId &&
                verification.lifecycleState !==
                  customDomainLifecycleState.retired,
            )
            .sort(
              (left, right) =>
                (right.changedAt?.getTime() ?? 0) -
                (left.changedAt?.getTime() ?? 0),
            )[0],
      }),
    );

    const created = await Effect.runPromise(
      repository.createCustomDomainVerification({
        verificationId:
          "tenant-branding:custom-domain:organization:org_1:verification_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "Brand.Acme.Example",
        lifecycleState: customDomainLifecycleState.unverified,
        changedAt: "2026-05-04T10:00:00.000Z",
      }),
    );

    const found = await Effect.runPromise(
      repository.findCustomDomainVerification({
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "BRAND.ACME.EXAMPLE",
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          repository.createCustomDomainVerification({
            verificationId:
              "tenant-branding:custom-domain:organization:org_1:verification_2",
            scope: platformScope.organization,
            scopeId: "org_1",
            requestedHost: "brand.acme.example",
            lifecycleState: customDomainLifecycleState.unverified,
            changedAt: "2026-05-04T10:01:00.000Z",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
      scope: platformScope.organization,
      scopeId: "org_1",
      requestedHost: "brand.acme.example",
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          repository.createCustomDomainVerification({
            verificationId:
              "tenant-branding:custom-domain:enterprise:ent_1:verification_3",
            scope: platformScope.enterprise,
            scopeId: "ent_1",
            requestedHost: "brand.acme.example",
            lifecycleState: customDomainLifecycleState.unverified,
            changedAt: "2026-05-04T10:02:00.000Z",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
      scope: platformScope.enterprise,
      scopeId: "ent_1",
      requestedHost: "brand.acme.example",
    });

    expect(created).toMatchObject({
      verificationId:
        "tenant-branding:custom-domain:organization:org_1:verification_1",
      scope: platformScope.organization,
      scopeId: "org_1",
      requestedHost: "brand.acme.example",
      lifecycleState: customDomainLifecycleState.unverified,
      changedAt: "2026-05-04T10:00:00.000Z",
    });
    expect(found).toMatchObject({
      verificationId:
        "tenant-branding:custom-domain:organization:org_1:verification_1",
      requestedHost: "brand.acme.example",
    });

    domainVerifications.set(
      "tenant-branding:custom-domain:organization:org_1:verification_retired",
      {
        verificationId:
          "tenant-branding:custom-domain:organization:org_1:verification_retired",
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "retired.acme.example",
        lifecycleState: customDomainLifecycleState.retired,
        dnsProof: null,
        approvedBy: null,
        approvalNotes: null,
        changedAt: new Date("2026-05-04T10:05:00.000Z"),
      },
    );
    domainVerifications.set(
      "tenant-branding:custom-domain:organization:org_1:verification_current",
      {
        verificationId:
          "tenant-branding:custom-domain:organization:org_1:verification_current",
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "current.acme.example",
        lifecycleState: customDomainLifecycleState.verifying,
        dnsProof: null,
        approvedBy: null,
        approvalNotes: null,
        changedAt: new Date("2026-05-04T10:04:00.000Z"),
      },
    );

    const current = await Effect.runPromise(
      repository.findCurrentCustomDomainVerification({
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(current).toMatchObject({
      verificationId:
        "tenant-branding:custom-domain:organization:org_1:verification_current",
      requestedHost: "current.acme.example",
      lifecycleState: customDomainLifecycleState.verifying,
    });
  });

  it("persists workflow jobs through the payload-generic repository seam", async () => {
    const SearchWorkflowPayloadSchema = Schema.Struct({
      searchIndexId: Schema.NonEmptyString,
      requestedBy: Schema.NonEmptyString,
    });
    const SearchWorkflowJobRecordSchema = createWorkflowJobRecordSchema(
      SearchWorkflowPayloadSchema,
    );
    type PersistedWorkflowJob = typeof workflowJobsTable.$inferSelect;
    type PersistedWorkflowJobInsert = typeof workflowJobsTable.$inferInsert;
    type SearchWorkflowJobRecord = Schema.Schema.Type<
      typeof SearchWorkflowJobRecordSchema
    >;
    const workflowJobs = new Map<string, PersistedWorkflowJob>();
    const toStoredDate = (value: Date | string | null | undefined) =>
      value == null ? null : value instanceof Date ? value : new Date(value);
    const persistWorkflowJobRows = (
      values:
        | PersistedWorkflowJobInsert
        | readonly PersistedWorkflowJobInsert[],
    ) => {
      const rows = Array.isArray(values) ? values : [values];

      for (const row of rows) {
        const existing = workflowJobs.get(row.jobId);
        const persisted: PersistedWorkflowJob = {
          jobId: row.jobId,
          runtime: row.runtime,
          sourceModuleId: row.sourceModuleId,
          kind: row.kind,
          trigger: row.trigger,
          status: row.status,
          tenantScope: row.tenantScope,
          tenantScopeId: row.tenantScopeId,
          attempts: row.attempts ?? 0,
          scheduledAt: toStoredDate(row.scheduledAt) ?? new Date(),
          completedAt: toStoredDate(row.completedAt),
          lastError: row.lastError ?? null,
          gapReason: row.gapReason ?? null,
          payload: row.payload,
          createdAt:
            toStoredDate(row.createdAt) ??
            existing?.createdAt ??
            new Date("2026-05-02T09:00:00.000Z"),
          updatedAt:
            toStoredDate(row.updatedAt) ?? new Date("2026-05-02T09:00:00.000Z"),
        };

        workflowJobs.set(persisted.jobId, persisted);
      }
    };
    const buildInsert = () => ({
      values: (
        values: Parameters<
          PostgresInsertBuilder<typeof workflowJobsTable>["values"]
        >[0],
      ) => ({
        execute: async () => {
          persistWorkflowJobRows(
            values as PersistedWorkflowJobInsert[] | PersistedWorkflowJobInsert,
          );
        },
        onConflictDoUpdate: () => ({
          execute: async () => {
            persistWorkflowJobRows(
              values as
                | PersistedWorkflowJobInsert[]
                | PersistedWorkflowJobInsert,
            );
          },
        }),
      }),
    });
    const buildUpdate = () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    });
    const database: PostgresDatabase = {
      insert: (() => buildInsert()) as PostgresDatabase["insert"],
      update: (() => buildUpdate()) as PostgresDatabase["update"],
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      transaction: async (callback) =>
        callback({
          insert: (() => buildInsert()) as PostgresDatabase["insert"],
          update: (() => buildUpdate()) as PostgresDatabase["update"],
        }),
    };
    const queryable: WorkflowJobsPostgresQueryableForRecord<SearchWorkflowJobRecord> =
      {
        getWorkflowJobById: async (jobId) => workflowJobs.get(jobId),
        claimScheduledWorkflowJob: async (jobId, now) => {
          const existing = workflowJobs.get(jobId);

          if (existing === undefined) {
            return undefined;
          }

          const claimed: PersistedWorkflowJob = {
            ...existing,
            status: workflowJobStatus.running,
            attempts: existing.attempts + 1,
            updatedAt: now,
          };

          workflowJobs.set(jobId, claimed);

          return claimed;
        },
        restoreWorkflowJobIfUpdatedAtMatches: async (
          jobId,
          expectedUpdatedAt,
          record,
        ) => {
          const existing = workflowJobs.get(jobId);

          if (
            existing === undefined ||
            existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()
          ) {
            return undefined;
          }

          const restored: PersistedWorkflowJob = {
            ...existing,
            ...record,
            scheduledAt: new Date(record.scheduledAt),
            completedAt: toStoredDate(record.completedAt),
            lastError: record.lastError ?? null,
            gapReason: record.gapReason ?? null,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          };

          workflowJobs.set(jobId, restored);

          return restored;
        },
        cancelWorkflowJobIfUpdatedAtMatches: async (
          jobId,
          expectedUpdatedAt,
          canceledAt,
        ) => {
          const existing = workflowJobs.get(jobId);

          if (
            existing === undefined ||
            existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()
          ) {
            return undefined;
          }

          const canceled: PersistedWorkflowJob = {
            ...existing,
            status: workflowJobStatus.canceled,
            completedAt: canceledAt,
            updatedAt: canceledAt,
          };

          workflowJobs.set(jobId, canceled);

          return canceled;
        },
        listDueWorkflowJobs: async (sourceModuleId, scheduledBefore) =>
          [...workflowJobs.values()].filter(
            (job) =>
              job.sourceModuleId === sourceModuleId &&
              job.scheduledAt.getTime() <= scheduledBefore.getTime(),
          ),
        listRepairGapWorkflowJobs: async (input) =>
          [...workflowJobs.values()].filter(
            (job) =>
              job.sourceModuleId === input.sourceModuleId &&
              (input.tenantScope === undefined ||
                job.tenantScope === input.tenantScope) &&
              (input.tenantScopeId === undefined ||
                job.tenantScopeId === input.tenantScopeId) &&
              job.gapReason !== null,
          ),
      };

    const repository = await Effect.runPromise(
      makeWorkflowJobsPostgresRepositoryForPayload(
        database,
        queryable,
        SearchWorkflowPayloadSchema,
      ),
    );

    const created = await Effect.runPromise(
      repository.persistWorkflowJob({
        jobId: "workflow-job-search-1",
        runtime: platformAdapterServiceName.convex,
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.reconciliationSweep,
        trigger: workflowJobTrigger.periodicSweep,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 0,
        scheduledAt: "2026-05-02T09:00:00.000Z",
        payload: {
          searchIndexId: "tenant-search-index-1",
          requestedBy: "usr_search_operator_1",
        },
        createdAt: "2026-05-02T09:00:00.000Z",
        updatedAt: "2026-05-02T09:00:00.000Z",
      }),
    );

    expect(workflowJobs.get(created.jobId)).toMatchObject({
      sourceModuleId: platformModuleId.search,
      payload: {
        searchIndexId: "tenant-search-index-1",
        requestedBy: "usr_search_operator_1",
      },
    });

    await expect(
      Effect.runPromise(
        repository.getWorkflowJob({ jobId: "workflow-job-search-1" }),
      ),
    ).resolves.toEqual(created);

    await Effect.runPromise(
      repository.persistWorkflowJob({
        ...created,
        status: workflowJobStatus.failed,
        attempts: 2,
        completedAt: "2026-05-02T09:05:00.000Z",
        lastError: "Search indexing failed.",
        gapReason: workflowJobGapReason.repairFailed,
        updatedAt: "2026-05-02T09:05:00.000Z",
      }),
    );

    await Effect.runPromise(
      repository.persistWorkflowJob({
        ...created,
        status: workflowJobStatus.scheduled,
        attempts: 2,
        scheduledAt: "2026-05-02T09:10:00.000Z",
        completedAt: undefined,
        lastError: undefined,
        gapReason: undefined,
        updatedAt: "2026-05-02T09:10:00.000Z",
      }),
    );

    expect(workflowJobs.get(created.jobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      attempts: 2,
      scheduledAt: new Date("2026-05-02T09:10:00.000Z"),
      completedAt: null,
      lastError: null,
      gapReason: null,
    });
  });

  it("lists repair-gap workflow jobs through tenant-filtered repository queries", async () => {
    const SearchWorkflowPayloadSchema = Schema.Struct({
      searchIndexId: Schema.NonEmptyString,
      requestedBy: Schema.NonEmptyString,
    });
    const SearchWorkflowJobRecordSchema = createWorkflowJobRecordSchema(
      SearchWorkflowPayloadSchema,
    );
    type SearchWorkflowJobRecord = Schema.Schema.Type<
      typeof SearchWorkflowJobRecordSchema
    >;
    const jobs = new Map<string, typeof workflowJobsTable.$inferSelect>([
      [
        "workflow-job-search-gap-1",
        {
          jobId: "workflow-job-search-gap-1",
          runtime: platformAdapterServiceName.convex,
          sourceModuleId: platformModuleId.search,
          kind: workflowJobKind.reconciliationSweep,
          trigger: workflowJobTrigger.periodicSweep,
          status: workflowJobStatus.blocked,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          attempts: 2,
          scheduledAt: new Date("2026-05-03T10:00:00.000Z"),
          completedAt: null,
          lastError: null,
          gapReason: workflowJobGapReason.missingProvisioning,
          payload: {
            searchIndexId: "tenant-search-index-1",
            requestedBy: "usr_search_operator_1",
          },
          createdAt: new Date("2026-05-03T09:55:00.000Z"),
          updatedAt: new Date("2026-05-03T10:05:00.000Z"),
        },
      ],
      [
        "workflow-job-search-gap-2",
        {
          jobId: "workflow-job-search-gap-2",
          runtime: platformAdapterServiceName.convex,
          sourceModuleId: platformModuleId.search,
          kind: workflowJobKind.reconciliationSweep,
          trigger: workflowJobTrigger.periodicSweep,
          status: workflowJobStatus.blocked,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_2",
          attempts: 1,
          scheduledAt: new Date("2026-05-03T10:15:00.000Z"),
          completedAt: null,
          lastError: null,
          gapReason: workflowJobGapReason.missingProvisioning,
          payload: {
            searchIndexId: "tenant-search-index-2",
            requestedBy: "usr_search_operator_1",
          },
          createdAt: new Date("2026-05-03T10:10:00.000Z"),
          updatedAt: new Date("2026-05-03T10:20:00.000Z"),
        },
      ],
    ]);
    const buildInsert = () => ({
      values: () => ({
        execute: async () => {},
        onConflictDoUpdate: () => ({
          execute: async () => {},
        }),
      }),
    });
    const buildUpdate = () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    });
    const database: PostgresDatabase = {
      insert: (() => buildInsert()) as PostgresDatabase["insert"],
      update: (() => buildUpdate()) as PostgresDatabase["update"],
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      transaction: async (callback) =>
        callback({
          insert: (() => buildInsert()) as PostgresDatabase["insert"],
          update: (() => buildUpdate()) as PostgresDatabase["update"],
        }),
    };
    const queryable: WorkflowJobsPostgresQueryableForRecord<SearchWorkflowJobRecord> =
      {
        getWorkflowJobById: async () => undefined,
        claimScheduledWorkflowJob: async () => undefined,
        restoreWorkflowJobIfUpdatedAtMatches: async () => undefined,
        cancelWorkflowJobIfUpdatedAtMatches: async () => undefined,
        listDueWorkflowJobs: async () => [],
        listRepairGapWorkflowJobs: async (input) =>
          [...jobs.values()].filter(
            (job) =>
              job.sourceModuleId === input.sourceModuleId &&
              (input.tenantScope === undefined ||
                job.tenantScope === input.tenantScope) &&
              (input.tenantScopeId === undefined ||
                job.tenantScopeId === input.tenantScopeId) &&
              job.gapReason !== null,
          ),
      };

    const repository = await Effect.runPromise(
      makeWorkflowJobsPostgresRepositoryForPayload(
        database,
        queryable,
        SearchWorkflowPayloadSchema,
      ),
    );

    const repairGaps = await Effect.runPromise(
      repository.listRepairGapWorkflowJobs({
        sourceModuleId: platformModuleId.search,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );

    expect(repairGaps).toEqual([
      expect.objectContaining({
        jobId: "workflow-job-search-gap-1",
        tenantScopeId: "org_1",
        gapReason: workflowJobGapReason.missingProvisioning,
      }),
    ]);
  });

  it("fails search record reads when persisted timestamps are malformed", async () => {
    const repository = await Effect.runPromise(
      makeSearchTenantIndexPostgresRepository({
        upsertSearchTenantIndex: async () => {
          throw new Error("Unexpected upsert call.");
        },
        getSearchTenantIndex: async () =>
          ({
            indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
            scope: platformScope.organization,
            scopeId: "org_1",
            lifecycleState: searchIndexLifecycleState.ready,
            documentCount: 0,
            settings: null,
            lastSyncedAt: null,
            lastError: null,
            deletedAt: null,
            createdAt: undefined,
            updatedAt: new Date("2026-04-27T16:00:00.000Z"),
          }) as never,
        listSearchTenantIndexesByScope: async () => [],
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.getSearchTenantIndexRecord({
          indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result._tag).toBe("Left");

    if (result._tag !== "Left") {
      throw new Error("Expected malformed search record read to fail.");
    }

    expect(result.left._tag).toBe("ParseError");
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
    const targetEvents = await Effect.runPromise(
      repository.queryByTarget({
        moduleId: platformModuleId.supportOperations,
        target: "org_1",
      }),
    );
    const actorEvents = await Effect.runPromise(
      repository.queryByActor("usr_support_1"),
    );
    const tenantEvents = await Effect.runPromise(
      repository.queryByTenant({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );

    expect(database.auditLogEvents.size).toBe(2);
    expect(events).toHaveLength(1);
    expect(targetEvents).toHaveLength(1);
    expect(actorEvents).toHaveLength(1);
    expect(tenantEvents).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventId: "support-1",
      moduleId: platformModuleId.supportOperations,
      action: supportOperationsAuditAction.breakGlassStarted,
      target: "org_1",
      reason: "Investigate support escalation",
      correlationId: "corr_support_1",
    });
    expect(targetEvents[0]).toMatchObject({
      eventId: "support-1",
      target: "org_1",
    });
  });

  it("upserts and lists durable support-operation break-glass incidents", async () => {
    const incidents = new Map<
      string,
      {
        caseId: string;
        supportAgent: string;
        startedAt: Date;
        status: string;
        approvedBy: string;
        reason: string;
        expiresAt: Date;
      }
    >();
    const repository = await Effect.runPromise(
      makeSupportOperationsBreakGlassIncidentPostgresRepository({
        upsertBreakGlassIncident: async (record) => {
          const row = {
            caseId: record.caseId,
            supportAgent: record.supportAgent,
            startedAt: record.startedAt,
            status:
              record.status ??
              supportOperationsBreakGlassIncidentStatus.pendingReview,
            approvedBy: record.approvedBy,
            reason: record.reason,
            expiresAt: record.expiresAt,
          };

          incidents.set(row.caseId, row);

          return row;
        },
        getBreakGlassIncident: async (caseId) => incidents.get(caseId),
        listBreakGlassIncidents: async (status) =>
          [...incidents.values()].filter(
            (incident) => status === undefined || incident.status === status,
          ),
      }),
    );

    const createdIncident = await Effect.runPromise(
      repository.upsertBreakGlassIncident({
        caseId: "case_support_break_glass_1",
        supportAgent: "usr_support_operator_1",
        startedAt: "2026-04-29T10:00:00.000Z",
        status: supportOperationsBreakGlassIncidentStatus.pendingReview,
        approvedBy: "usr_support_operator_1",
        reason: "Resolve emergency tenant outage",
        expiresAt: "2026-04-29T10:15:00.000Z",
      }),
    );
    const pendingIncidents = await Effect.runPromise(
      repository.listBreakGlassIncidents(
        supportOperationsBreakGlassIncidentStatus.pendingReview,
      ),
    );
    const reviewedIncident = await Effect.runPromise(
      repository.upsertBreakGlassIncident({
        ...createdIncident,
        status: supportOperationsBreakGlassIncidentStatus.reviewed,
      }),
    );
    const fetchedReviewedIncident = await Effect.runPromise(
      repository.getBreakGlassIncident(createdIncident.caseId),
    );
    const reviewedIncidents = await Effect.runPromise(
      repository.listBreakGlassIncidents(
        supportOperationsBreakGlassIncidentStatus.reviewed,
      ),
    );

    expect(createdIncident.status).toBe(
      supportOperationsBreakGlassIncidentStatus.pendingReview,
    );
    expect(pendingIncidents).toEqual([
      expect.objectContaining({
        caseId: "case_support_break_glass_1",
        status: supportOperationsBreakGlassIncidentStatus.pendingReview,
      }),
    ]);
    expect(reviewedIncident.status).toBe(
      supportOperationsBreakGlassIncidentStatus.reviewed,
    );
    expect(fetchedReviewedIncident).toEqual(
      expect.objectContaining({
        caseId: "case_support_break_glass_1",
        status: supportOperationsBreakGlassIncidentStatus.reviewed,
      }),
    );
    expect(reviewedIncidents).toEqual([
      expect.objectContaining({
        caseId: "case_support_break_glass_1",
        status: supportOperationsBreakGlassIncidentStatus.reviewed,
      }),
    ]);
  });

  it("upserts and lists durable support-operation cases", async () => {
    const supportCases = new Map<
      string,
      {
        caseId: string;
        supportAgent: string;
        tenantScope: string;
        tenantScopeId: string;
        summary: string;
        status: string;
        priority: string;
        startedAt: Date;
        lastUpdatedAt: Date;
      }
    >();
    const repository = await Effect.runPromise(
      makeSupportOperationsCasePostgresRepository({
        upsertSupportCase: async (record) => {
          const row = {
            caseId: record.caseId,
            supportAgent: record.supportAgent,
            tenantScope: record.tenantScope,
            tenantScopeId: record.tenantScopeId,
            summary: record.summary,
            status: record.status ?? supportOperationsCaseStatus.open,
            priority: record.priority ?? supportOperationsCasePriority.normal,
            startedAt: record.startedAt,
            lastUpdatedAt: record.lastUpdatedAt,
          };

          supportCases.set(row.caseId, row);

          return row;
        },
        getSupportCase: async (caseId) => supportCases.get(caseId),
        listSupportCases: async (input) =>
          [...supportCases.values()].filter(
            (supportCase) =>
              input === undefined ||
              (typeof input === "string"
                ? supportCase.status === input
                : (input.status === undefined ||
                    supportCase.status === input.status) &&
                  (input.tenantScope === undefined ||
                    supportCase.tenantScope === input.tenantScope) &&
                  (input.tenantScopeId === undefined ||
                    supportCase.tenantScopeId === input.tenantScopeId)),
          ),
      }),
    );

    const createdCase = await Effect.runPromise(
      repository.upsertSupportCase({
        caseId: "case_support_case_1",
        supportAgent: "usr_support_operator_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        summary: "Open tenant authentication investigation",
        status: supportOperationsCaseStatus.open,
        priority: supportOperationsCasePriority.high,
        startedAt: "2026-05-03T10:00:00.000Z",
        lastUpdatedAt: "2026-05-03T10:05:00.000Z",
      }),
    );
    const openCases = await Effect.runPromise(
      repository.listSupportCases(supportOperationsCaseStatus.open),
    );
    const otherTenantCase = await Effect.runPromise(
      repository.upsertSupportCase({
        caseId: "case_support_case_2",
        supportAgent: "usr_support_operator_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_2",
        summary: "Open billing investigation for org_2",
        status: supportOperationsCaseStatus.open,
        priority: supportOperationsCasePriority.normal,
        startedAt: "2026-05-03T11:00:00.000Z",
        lastUpdatedAt: "2026-05-03T11:05:00.000Z",
      }),
    );
    const tenantScopedCases = await Effect.runPromise(
      repository.listSupportCases({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );
    const resolvedCase = await Effect.runPromise(
      repository.upsertSupportCase({
        ...createdCase,
        status: supportOperationsCaseStatus.resolved,
        priority: supportOperationsCasePriority.normal,
        summary: "Resolved tenant authentication investigation",
        lastUpdatedAt: "2026-05-03T10:15:00.000Z",
      }),
    );
    const fetchedResolvedCase = await Effect.runPromise(
      repository.getSupportCase(createdCase.caseId),
    );
    const resolvedCases = await Effect.runPromise(
      repository.listSupportCases(supportOperationsCaseStatus.resolved),
    );

    expect(createdCase.status).toBe(supportOperationsCaseStatus.open);
    expect(openCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: "case_support_case_1",
          status: supportOperationsCaseStatus.open,
        }),
      ]),
    );
    expect(otherTenantCase.tenantScopeId).toBe("org_2");
    expect(tenantScopedCases).toEqual([
      expect.objectContaining({
        caseId: "case_support_case_1",
        tenantScopeId: "org_1",
      }),
    ]);
    expect(resolvedCase.status).toBe(supportOperationsCaseStatus.resolved);
    expect(fetchedResolvedCase).toEqual(
      expect.objectContaining({
        caseId: "case_support_case_1",
        status: supportOperationsCaseStatus.resolved,
        priority: supportOperationsCasePriority.normal,
      }),
    );
    expect(resolvedCases).toEqual([
      expect.objectContaining({
        caseId: "case_support_case_1",
        status: supportOperationsCaseStatus.resolved,
      }),
    ]);
  });

  it("upserts and lists durable support-operation impersonation sessions", async () => {
    const sessions = new Map<
      string,
      {
        caseId: string;
        supportAgent: string;
        impersonatedUser: string;
        startedAt: Date;
        durationMinutes: number;
        status: string;
        approvedBy: string;
        reason: string;
        expiresAt: Date;
      }
    >();
    const repository = await Effect.runPromise(
      makeSupportOperationsImpersonationSessionPostgresRepository({
        upsertImpersonationSession: async (record) => {
          const row = {
            caseId: record.caseId,
            supportAgent: record.supportAgent,
            impersonatedUser: record.impersonatedUser,
            startedAt: record.startedAt,
            durationMinutes: record.durationMinutes,
            status:
              record.status ??
              supportOperationsImpersonationSessionStatus.active,
            approvedBy: record.approvedBy,
            reason: record.reason,
            expiresAt: record.expiresAt,
          };

          sessions.set(row.caseId, row);

          return row;
        },
        getImpersonationSession: async (caseId) => sessions.get(caseId),
        listImpersonationSessions: async (status) =>
          [...sessions.values()].filter(
            (session) => status === undefined || session.status === status,
          ),
      }),
    );

    const createdSession = await Effect.runPromise(
      repository.upsertImpersonationSession({
        caseId: "case_support_impersonation_1",
        supportAgent: "usr_support_operator_1",
        impersonatedUser: "usr_member_1",
        startedAt: "2026-05-03T10:00:00.000Z",
        durationMinutes: 15,
        status: supportOperationsImpersonationSessionStatus.active,
        approvedBy: "usr_support_operator_1",
        reason: "Investigate tenant access issue",
        expiresAt: "2026-05-03T10:15:00.000Z",
      }),
    );
    const activeSessions = await Effect.runPromise(
      repository.listImpersonationSessions(
        supportOperationsImpersonationSessionStatus.active,
      ),
    );
    const revokedSession = await Effect.runPromise(
      repository.upsertImpersonationSession({
        ...createdSession,
        status: supportOperationsImpersonationSessionStatus.revoked,
      }),
    );
    const fetchedRevokedSession = await Effect.runPromise(
      repository.getImpersonationSession(createdSession.caseId),
    );
    const revokedSessions = await Effect.runPromise(
      repository.listImpersonationSessions(
        supportOperationsImpersonationSessionStatus.revoked,
      ),
    );

    expect(createdSession.status).toBe(
      supportOperationsImpersonationSessionStatus.active,
    );
    expect(activeSessions).toEqual([
      expect.objectContaining({
        caseId: "case_support_impersonation_1",
        status: supportOperationsImpersonationSessionStatus.active,
      }),
    ]);
    expect(revokedSession.status).toBe(
      supportOperationsImpersonationSessionStatus.revoked,
    );
    expect(fetchedRevokedSession).toEqual(
      expect.objectContaining({
        caseId: "case_support_impersonation_1",
        status: supportOperationsImpersonationSessionStatus.revoked,
      }),
    );
    expect(revokedSessions).toEqual([
      expect.objectContaining({
        caseId: "case_support_impersonation_1",
        status: supportOperationsImpersonationSessionStatus.revoked,
      }),
    ]);
  });

  it("bridges append-only audit inserts through the platform write database wrapper", async () => {
    const database = createPersistenceTestDatabase();
    const writeDatabase = buildWriteDatabase(
      database.database as unknown as Parameters<typeof buildWriteDatabase>[0],
    );
    const repository = await Effect.runPromise(
      makeAuditLogPostgresRepository({
        ...writeDatabase,
        listEventsByModule: database.database.listEventsByModule,
        listEventsByTarget: database.database.listEventsByTarget,
        listEventsByActor: database.database.listEventsByActor,
        listEventsByTenant: database.database.listEventsByTenant,
      }),
    );

    await Effect.runPromise(
      repository.insertAuditEvent({
        eventId: "support-wrapper-1",
        timestamp: new Date().toISOString(),
        actorId: "usr_support_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.supportOperations,
        action: supportOperationsAuditAction.breakGlassStarted,
        target: "org_1",
        reason: "First audit insert through wrapper",
        correlationId: "corr_wrapper_1",
      }),
    );
    await Effect.runPromise(
      repository.insertAuditEvent({
        eventId: "support-wrapper-2",
        timestamp: new Date().toISOString(),
        actorId: "usr_support_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.supportOperations,
        action: supportOperationsAuditAction.breakGlassStarted,
        target: "org_1",
        reason: "Second audit insert through wrapper",
        correlationId: "corr_wrapper_1",
      }),
    );

    const targetEvents = await Effect.runPromise(
      repository.queryByTarget({
        moduleId: platformModuleId.supportOperations,
        target: "org_1",
      }),
    );

    expect(database.auditLogEvents.size).toBe(2);
    expect(targetEvents).toHaveLength(2);
    expect(targetEvents.map((event) => event.eventId)).toEqual(
      expect.arrayContaining(["support-wrapper-1", "support-wrapper-2"]),
    );
  });

  it("normalizes legacy stored audit action aliases on read", async () => {
    const database = createPersistenceTestDatabase();
    const repository = await Effect.runPromise(
      makeAuditLogPostgresRepository(database.database),
    );

    database.auditLogEvents.set("legacy-runtime-audit-row", {
      eventId: "legacy-runtime-audit-row",
      moduleId: platformModuleId.runtimeConfig,
      action: "override-changed",
      target: "tenantBranding.companyName",
      actorId: "usr_admin_legacy",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      reason: "Legacy runtime config alias",
      correlationId: "corr_legacy_runtime_audit_row",
      requestContext: {},
      recordedAt: new Date("2026-04-26T10:00:00.000Z"),
    });

    const tenantEvents = await Effect.runPromise(
      repository.queryByTenant({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );

    expect(tenantEvents).toEqual([
      expect.objectContaining({
        eventId: "legacy-runtime-audit-row",
        moduleId: platformModuleId.runtimeConfig,
        action: runtimeConfigAuditAction.overrideChanged,
      }),
    ]);
  });

  it("treats malformed stored audit rows as persistence errors", async () => {
    const database = createPersistenceTestDatabase();
    const repository = await Effect.runPromise(
      makeAuditLogPostgresRepository(database.database),
    );

    database.auditLogEvents.set("malformed-audit-row", {
      eventId: "malformed-audit-row",
      moduleId: platformModuleId.supportOperations,
      action: supportOperationsAuditAction.breakGlassStarted,
      target: "org_1",
      actorId: "",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      reason: "Investigate malformed row",
      correlationId: "corr_malformed_audit_row",
      requestContext: {},
      recordedAt: new Date("2026-04-26T10:00:00.000Z"),
    });

    const byModuleResult = await Effect.runPromise(
      Effect.either(
        repository.queryByModule(platformModuleId.supportOperations),
      ),
    );
    const byTargetResult = await Effect.runPromise(
      Effect.either(
        repository.queryByTarget({
          moduleId: platformModuleId.supportOperations,
          target: "org_1",
        }),
      ),
    );
    const byActorResult = await Effect.runPromise(
      Effect.either(repository.queryByActor("")),
    );
    const byTenantResult = await Effect.runPromise(
      Effect.either(
        repository.queryByTenant({
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

  it("treats malformed stored support-operation rows as persistence errors", async () => {
    const supportCaseRepository = await Effect.runPromise(
      makeSupportOperationsCasePostgresRepository({
        upsertSupportCase: async () => {
          throw new Error("unused");
        },
        getSupportCase: async () =>
          ({
            caseId: "case_support_case_malformed",
            supportAgent: "usr_support_operator_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            summary: "Malformed stored support case",
            status: supportOperationsCaseStatus.open,
            priority: supportOperationsCasePriority.normal,
            startedAt: null,
            lastUpdatedAt: new Date("2026-05-03T10:15:00.000Z"),
          }) as never,
        listSupportCases: async () =>
          [
            {
              caseId: "case_support_case_malformed",
              supportAgent: "usr_support_operator_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
              summary: "Malformed stored support case",
              status: supportOperationsCaseStatus.open,
              priority: supportOperationsCasePriority.normal,
              startedAt: null,
              lastUpdatedAt: new Date("2026-05-03T10:15:00.000Z"),
            },
          ] as never,
      }),
    );
    const impersonationRepository = await Effect.runPromise(
      makeSupportOperationsImpersonationSessionPostgresRepository({
        upsertImpersonationSession: async () => {
          throw new Error("unused");
        },
        getImpersonationSession: async () =>
          ({
            caseId: "sess_impersonation_malformed",
            supportAgent: "usr_support_operator_1",
            impersonatedUser: "usr_member_1",
            startedAt: null,
            durationMinutes: 15,
            status: supportOperationsImpersonationSessionStatus.active,
            approvedBy: "usr_support_operator_1",
            reason: "Malformed stored impersonation session",
            expiresAt: new Date("2026-05-03T10:15:00.000Z"),
          }) as never,
        listImpersonationSessions: async () =>
          [
            {
              caseId: "sess_impersonation_malformed",
              supportAgent: "usr_support_operator_1",
              impersonatedUser: "usr_member_1",
              startedAt: null,
              durationMinutes: 15,
              status: supportOperationsImpersonationSessionStatus.active,
              approvedBy: "usr_support_operator_1",
              reason: "Malformed stored impersonation session",
              expiresAt: new Date("2026-05-03T10:15:00.000Z"),
            },
          ] as never,
      }),
    );
    const breakGlassRepository = await Effect.runPromise(
      makeSupportOperationsBreakGlassIncidentPostgresRepository({
        upsertBreakGlassIncident: async () => {
          throw new Error("unused");
        },
        getBreakGlassIncident: async () =>
          ({
            caseId: "case_break_glass_malformed",
            supportAgent: "usr_support_operator_1",
            startedAt: null,
            status: supportOperationsBreakGlassIncidentStatus.pendingReview,
            approvedBy: "usr_support_operator_1",
            reason: "Malformed stored break-glass incident",
            expiresAt: new Date("2026-05-03T10:15:00.000Z"),
          }) as never,
        listBreakGlassIncidents: async () =>
          [
            {
              caseId: "case_break_glass_malformed",
              supportAgent: "usr_support_operator_1",
              startedAt: null,
              status: supportOperationsBreakGlassIncidentStatus.pendingReview,
              approvedBy: "usr_support_operator_1",
              reason: "Malformed stored break-glass incident",
              expiresAt: new Date("2026-05-03T10:15:00.000Z"),
            },
          ] as never,
      }),
    );

    const supportCaseResult = await Effect.runPromise(
      Effect.either(
        supportCaseRepository.getSupportCase("case_support_case_malformed"),
      ),
    );
    const supportCaseListResult = await Effect.runPromise(
      Effect.either(
        supportCaseRepository.listSupportCases(
          supportOperationsCaseStatus.open,
        ),
      ),
    );
    const impersonationResult = await Effect.runPromise(
      Effect.either(
        impersonationRepository.getImpersonationSession(
          "sess_impersonation_malformed",
        ),
      ),
    );
    const impersonationListResult = await Effect.runPromise(
      Effect.either(
        impersonationRepository.listImpersonationSessions(
          supportOperationsImpersonationSessionStatus.active,
        ),
      ),
    );
    const breakGlassResult = await Effect.runPromise(
      Effect.either(
        breakGlassRepository.getBreakGlassIncident(
          "case_break_glass_malformed",
        ),
      ),
    );
    const breakGlassListResult = await Effect.runPromise(
      Effect.either(
        breakGlassRepository.listBreakGlassIncidents(
          supportOperationsBreakGlassIncidentStatus.pendingReview,
        ),
      ),
    );

    expect(supportCaseResult).toMatchObject({
      _tag: "Left",
      left: { _tag: "ParseError" },
    });
    expect(supportCaseListResult).toMatchObject({
      _tag: "Left",
      left: { _tag: "ParseError" },
    });
    expect(impersonationResult).toMatchObject({
      _tag: "Left",
      left: { _tag: "ParseError" },
    });
    expect(impersonationListResult).toMatchObject({
      _tag: "Left",
      left: { _tag: "ParseError" },
    });
    expect(breakGlassResult).toMatchObject({
      _tag: "Left",
      left: { _tag: "ParseError" },
    });
    expect(breakGlassListResult).toMatchObject({
      _tag: "Left",
      left: { _tag: "ParseError" },
    });
  });

  it("preserves approval metadata when approved sync artifacts become applied", async () => {
    const database = createPersistenceTestDatabase();
    const repository = await Effect.runPromise(
      makeRuntimeConfigPostgresRepository(database.database),
    );

    database.runtimeConfigArtifacts.set("proposal_runtime_config_1", {
      proposalId: "proposal_runtime_config_1",
      moduleId: platformModuleId.runtimeConfig,
      key: runtimeConfigConfigKey.approvalsEnabled,
      action: runtimeChangeProposalAction.update,
      artifactPath:
        "specs/00-governance/runtime-config-proposals/runtime-config.runtime-config-approvals-enabled.json",
      runtimeValue: true,
      codeValue: false,
      status: runtimeConfigSyncArtifactStatus.approved,
      generatedAt: new Date("2026-04-25T13:00:00.000Z"),
      decidedBy: "usr_support_operator",
      decisionReason: "Approved export back to code",
      decidedAt: new Date("2026-04-25T13:05:00.000Z"),
    });

    const [persistedArtifact] = await Effect.runPromise(
      repository.persistSyncArtifacts([
        {
          proposalId: "proposal_runtime_config_1",
          moduleId: platformModuleId.runtimeConfig,
          key: runtimeConfigConfigKey.approvalsEnabled,
          action: runtimeChangeProposalAction.update,
          artifactPath:
            "specs/00-governance/runtime-config-proposals/runtime-config.runtime-config-approvals-enabled.json",
          runtimeValue: true,
          codeValue: true,
          status: runtimeConfigSyncArtifactStatus.pending,
          generatedAt: "2026-04-25T13:10:00.000Z",
        },
      ]),
    );

    const [storedArtifact] = await Effect.runPromise(
      repository.listSyncArtifactsByModule(platformModuleId.runtimeConfig),
    );

    expect(persistedArtifact).toMatchObject({
      proposalId: "proposal_runtime_config_1",
      status: runtimeConfigSyncArtifactStatus.applied,
      codeValue: true,
      decidedBy: "usr_support_operator",
      decisionReason: "Approved export back to code",
      decidedAt: "2026-04-25T13:05:00.000Z",
    });
    expect(storedArtifact).toMatchObject({
      proposalId: "proposal_runtime_config_1",
      status: runtimeConfigSyncArtifactStatus.applied,
      codeValue: true,
      decidedBy: "usr_support_operator",
      decisionReason: "Approved export back to code",
      decidedAt: "2026-04-25T13:05:00.000Z",
    });
  });

  it("rejects sync-artifact reviews when the stored proposal is no longer pending", async () => {
    let currentArtifact:
      | typeof runtimeConfigSyncArtifactsTable.$inferSelect
      | undefined = {
      proposalId: "proposal_runtime_config_conflict",
      moduleId: platformModuleId.runtimeConfig,
      key: runtimeConfigConfigKey.approvalsEnabled,
      action: runtimeChangeProposalAction.update,
      artifactPath:
        "specs/00-governance/runtime-config-proposals/runtime-config.runtime-config-approvals-enabled.json",
      runtimeValue: true,
      codeValue: false,
      status: runtimeConfigSyncArtifactStatus.approved,
      generatedAt: new Date("2026-04-25T13:00:00.000Z"),
      decidedBy: "usr_support_operator",
      decisionReason: "Approved export back to code",
      decidedAt: new Date("2026-04-25T13:05:00.000Z"),
    };

    const database = {
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              if (
                table !== runtimeConfigSyncArtifactsTable ||
                currentArtifact === undefined ||
                currentArtifact.status !==
                  runtimeConfigSyncArtifactStatus.pending
              ) {
                return [];
              }

              currentArtifact = {
                ...currentArtifact,
                status:
                  (values.status as
                    | typeof currentArtifact.status
                    | undefined) ?? currentArtifact.status,
                decidedBy:
                  (values.decidedBy as string | null | undefined) ??
                  currentArtifact.decidedBy,
                decisionReason:
                  (values.decisionReason as string | null | undefined) ??
                  currentArtifact.decisionReason,
                decidedAt:
                  (values.decidedAt as Date | null | undefined) ??
                  currentArtifact.decidedAt,
              };

              return [currentArtifact];
            },
          }),
        }),
      }),
      select: () => ({
        from: (table: unknown) => ({
          where: async () =>
            table === runtimeConfigSyncArtifactsTable &&
            currentArtifact !== undefined
              ? [currentArtifact]
              : [],
        }),
      }),
      listOverridesByModule: async () => [],
      listOverrideProposalsByModule: async () => [],
      listSyncArtifactsByModule: async () =>
        currentArtifact === undefined ? [] : [currentArtifact],
    } as unknown as RuntimeConfigPostgresDatabase;

    const repository = await Effect.runPromise(
      makeRuntimeConfigPostgresRepository(database),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.reviewSyncArtifact({
          proposalId: "proposal_runtime_config_conflict",
          status: runtimeConfigSyncArtifactStatus.rejected,
          decidedBy: "usr_support_operator",
          decisionReason: "Attempted second review",
          decidedAt: "2026-04-25T13:10:00.000Z",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RuntimeConfigSyncArtifactReviewConflictError",
        proposalId: "proposal_runtime_config_conflict",
        status: runtimeConfigSyncArtifactStatus.approved,
      },
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

  it("loads the current tenant onboarding review state without leaking metadata or other-tenant rows", async () => {
    const database = createPersistenceTestDatabase();
    const repository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.database),
    );

    await Effect.runPromise(
      repository.persistOnboardingRun({
        runId: "onboarding:org_1:first",
        triggeredBy: "usr_owner_first",
        correlationId: "corr_onboarding_first",
        status: tenantOnboardingRunStatus.completed,
        currentStepId: "security-baseline",
        completedAt: "2026-05-01T08:20:00.000Z",
        startedAt: "2026-05-01T08:00:00.000Z",
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
              stepId: "security-baseline",
              label: "Enable MFA and verify privileged access workflows.",
              status: onboardingStepStatus.completed,
              requiredModuleId: platformModuleId.identitySession,
            },
          ],
        },
        metadata: {
          source: "auth.callback",
          hiddenToken: "do-not-project",
        },
      }),
    );

    await Effect.runPromise(
      repository.persistOnboardingRun({
        runId: "onboarding:org_1:second",
        triggeredBy: "usr_owner_second",
        correlationId: "corr_onboarding_second",
        status: tenantOnboardingRunStatus.inProgress,
        currentStepId: "team-invites",
        startedAt: "2026-05-01T09:00:00.000Z",
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
          ],
        },
        metadata: {
          source: "billing.webhook",
          hiddenToken: "still-not-projected",
        },
      }),
    );

    await Effect.runPromise(
      repository.persistOnboardingRun({
        runId: "onboarding:org_2:latest",
        triggeredBy: "usr_owner_org_2",
        correlationId: "corr_onboarding_org_2",
        status: tenantOnboardingRunStatus.failed,
        currentStepId: "tenant-profile",
        startedAt: "2026-05-01T10:00:00.000Z",
        plan: {
          tenantScope: platformScope.organization,
          tenantScopeId: "org_2",
          steps: [
            {
              stepId: "tenant-profile",
              label: "Create tenant profile and confirm primary owner.",
              status: onboardingStepStatus.inProgress,
            },
          ],
        },
        metadata: {
          source: "auth.callback",
          hiddenToken: "never-project-org-2",
        },
      }),
    );

    const result = await Effect.runPromise(
      repository.getOnboardingRunByTenant({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );

    expect(result).toEqual({
      runId: "onboarding:org_1:second",
      triggeredBy: "usr_owner_second",
      correlationId: "corr_onboarding_second",
      status: tenantOnboardingRunStatus.inProgress,
      currentStepId: "team-invites",
      startedAt: "2026-05-01T09:00:00.000Z",
      steps: [
        {
          stepId: "tenant-profile",
          label: "Create tenant profile and confirm primary owner.",
          status: onboardingStepStatus.completed,
          retryCount: 0,
        },
        {
          stepId: "team-invites",
          label: "Invite core team members and assign roles.",
          status: onboardingStepStatus.inProgress,
          requiredModuleId: platformModuleId.tenantManagement,
          retryCount: 0,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("hiddenToken");
    expect(JSON.stringify(result)).not.toContain("org_2");
  });

  it("loads ancestor entitlements and the nearest ancestor subscription", async () => {
    type BillingEntitlementRow = Awaited<
      ReturnType<BillingStatePostgresQueryable["listEntitlementsByScope"]>
    >[number];
    type BillingSubscriptionRow = NonNullable<
      Awaited<
        ReturnType<
          BillingStatePostgresQueryable["getLatestSubscriptionByScope"]
        >
      >
    >;

    const lookupCalls: string[] = [];
    const enterpriseEntitlement: BillingEntitlementRow = {
      entitlementId: "ent_tenant_branding_enterprise",
      moduleId: platformModuleId.tenantBranding,
      featureKey: tenantBrandingFeatureFlag.enabled,
      scope: platformScope.enterprise,
      scopeId: "ent_1",
      active: true,
      quotaSnapshot: null,
      grantedAt: new Date("2026-04-25T10:00:00.000Z"),
      expiresAt: null,
    };
    const enterpriseSubscription: BillingSubscriptionRow = {
      subscriptionId: "sub_enterprise_branding",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "polar_sub_enterprise_branding",
      accountId: "polar:cus_enterprise_branding",
      scope: platformScope.enterprise,
      scopeId: "ent_1",
      planId: "plan_enterprise_branding",
      priceId: "price_enterprise_branding",
      status: billingSubscriptionStatus.active,
      checkoutSessionId: null,
      currentPeriodStart: new Date("2026-04-25T10:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-25T10:00:00.000Z"),
      cancelAt: null,
      canceledAt: null,
      metadata: { interval: billingPlanInterval.month },
      createdAt: new Date("2026-04-25T10:00:00.000Z"),
      updatedAt: new Date("2026-04-25T10:00:00.000Z"),
    };
    const queryable: BillingStatePostgresQueryable = {
      listEntitlementsByScope: async (scope, scopeId) => {
        lookupCalls.push(`entitlements:${scope}:${scopeId}`);

        return scope === platformScope.enterprise && scopeId === "ent_1"
          ? [enterpriseEntitlement]
          : [];
      },
      listPaymentEventsByScope: async () => [],
      getLatestSubscriptionByScope: async (scope, scopeId) => {
        lookupCalls.push(`subscription:${scope}:${scopeId}`);

        return scope === platformScope.enterprise && scopeId === "ent_1"
          ? enterpriseSubscription
          : undefined;
      },
    };
    const repository = await Effect.runPromise(
      makeBillingStatePostgresRepository(queryable),
    );

    const result = await Effect.runPromise(
      repository.getTenantAccessState({
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
        enterpriseId: "ent_1",
      }),
    );

    expect(lookupCalls).toEqual(
      expect.arrayContaining([
        "entitlements:organization:org_1",
        "entitlements:enterprise:ent_1",
        "subscription:organization:org_1",
        "subscription:enterprise:ent_1",
      ]),
    );
    expect(result.entitlements).toEqual([
      expect.objectContaining({
        entitlementId: "ent_tenant_branding_enterprise",
        scope: platformScope.enterprise,
        scopeId: "ent_1",
      }),
    ]);
    expect(result.subscription).toMatchObject({
      subscriptionId: "sub_enterprise_branding",
      provider: platformAdapterServiceName.polar,
      planId: "plan_enterprise_branding",
      status: billingSubscriptionStatus.active,
    });
  });

  it("prefers an active ancestor subscription over an inactive current-scope subscription", async () => {
    type BillingSubscriptionRow = NonNullable<
      Awaited<
        ReturnType<
          BillingStatePostgresQueryable["getLatestSubscriptionByScope"]
        >
      >
    >;

    const organizationCanceledSubscription: BillingSubscriptionRow = {
      subscriptionId: "sub_org_canceled",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "polar_sub_org_canceled",
      accountId: "polar:cus_org_canceled",
      scope: platformScope.organization,
      scopeId: "org_1",
      planId: "plan_org_canceled",
      priceId: "price_org_canceled",
      status: billingSubscriptionStatus.canceled,
      checkoutSessionId: null,
      currentPeriodStart: new Date("2026-04-26T10:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-26T10:00:00.000Z"),
      cancelAt: null,
      canceledAt: new Date("2026-04-27T10:00:00.000Z"),
      metadata: { interval: billingPlanInterval.month },
      createdAt: new Date("2026-04-26T10:00:00.000Z"),
      updatedAt: new Date("2026-04-27T10:00:00.000Z"),
    };
    const enterpriseActiveSubscription: BillingSubscriptionRow = {
      subscriptionId: "sub_enterprise_active",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "polar_sub_enterprise_active",
      accountId: "polar:cus_enterprise_active",
      scope: platformScope.enterprise,
      scopeId: "ent_1",
      planId: "plan_enterprise_active",
      priceId: "price_enterprise_active",
      status: billingSubscriptionStatus.active,
      checkoutSessionId: null,
      currentPeriodStart: new Date("2026-04-25T10:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-25T10:00:00.000Z"),
      cancelAt: null,
      canceledAt: null,
      metadata: { interval: billingPlanInterval.month },
      createdAt: new Date("2026-04-25T10:00:00.000Z"),
      updatedAt: new Date("2026-04-25T10:00:00.000Z"),
    };
    const queryable: BillingStatePostgresQueryable = {
      listEntitlementsByScope: async () => [],
      listPaymentEventsByScope: async () => [],
      getLatestSubscriptionByScope: async (scope, scopeId) => {
        if (scope === platformScope.organization && scopeId === "org_1") {
          return organizationCanceledSubscription;
        }

        if (scope === platformScope.enterprise && scopeId === "ent_1") {
          return enterpriseActiveSubscription;
        }

        return undefined;
      },
    };
    const repository = await Effect.runPromise(
      makeBillingStatePostgresRepository(queryable),
    );

    const result = await Effect.runPromise(
      repository.getTenantAccessState({
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
        enterpriseId: "ent_1",
      }),
    );

    expect(result.subscription).toMatchObject({
      subscriptionId: "sub_enterprise_active",
      accountId: "polar:cus_enterprise_active",
      status: billingSubscriptionStatus.active,
    });
  });

  it("does not read descendant individual billing state for organization lookups", async () => {
    type BillingEntitlementRow = Awaited<
      ReturnType<BillingStatePostgresQueryable["listEntitlementsByScope"]>
    >[number];
    type BillingSubscriptionRow = NonNullable<
      Awaited<
        ReturnType<
          BillingStatePostgresQueryable["getLatestSubscriptionByScope"]
        >
      >
    >;

    const lookupCalls: string[] = [];
    const individualEntitlement: BillingEntitlementRow = {
      entitlementId: "ent_individual_branding",
      moduleId: platformModuleId.tenantBranding,
      featureKey: tenantBrandingFeatureFlag.enabled,
      scope: platformScope.individual,
      scopeId: "usr_member_1",
      active: true,
      quotaSnapshot: null,
      grantedAt: new Date("2026-04-25T10:00:00.000Z"),
      expiresAt: null,
    };
    const individualSubscription: BillingSubscriptionRow = {
      subscriptionId: "sub_individual_branding",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "polar_sub_individual_branding",
      accountId: "polar:cus_individual_branding",
      scope: platformScope.individual,
      scopeId: "usr_member_1",
      planId: "plan_individual_branding",
      priceId: "price_individual_branding",
      status: billingSubscriptionStatus.active,
      checkoutSessionId: null,
      currentPeriodStart: new Date("2026-04-25T10:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-25T10:00:00.000Z"),
      cancelAt: null,
      canceledAt: null,
      metadata: { interval: billingPlanInterval.month },
      createdAt: new Date("2026-04-25T10:00:00.000Z"),
      updatedAt: new Date("2026-04-25T10:00:00.000Z"),
    };
    const queryable: BillingStatePostgresQueryable = {
      listEntitlementsByScope: async (scope, scopeId) => {
        lookupCalls.push(`entitlements:${scope}:${scopeId}`);

        return scope === platformScope.individual && scopeId === "usr_member_1"
          ? [individualEntitlement]
          : [];
      },
      listPaymentEventsByScope: async () => [],
      getLatestSubscriptionByScope: async (scope, scopeId) => {
        lookupCalls.push(`subscription:${scope}:${scopeId}`);

        return scope === platformScope.individual && scopeId === "usr_member_1"
          ? individualSubscription
          : undefined;
      },
    };
    const repository = await Effect.runPromise(
      makeBillingStatePostgresRepository(queryable),
    );

    const result = await Effect.runPromise(
      repository.getTenantAccessState({
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
        individualId: "usr_member_1",
      }),
    );

    expect(lookupCalls).not.toContain("entitlements:individual:usr_member_1");
    expect(lookupCalls).not.toContain("subscription:individual:usr_member_1");
    expect(result.entitlements).toEqual([]);
    expect(result.subscription).toBeUndefined();
    expect(result.invoiceHistory).toEqual([]);
  });

  it("projects invoice history from the effective subscription lineage", async () => {
    type BillingPaymentEventRow = Awaited<
      ReturnType<BillingStatePostgresQueryable["listPaymentEventsByScope"]>
    >[number];
    type BillingSubscriptionRow = NonNullable<
      Awaited<
        ReturnType<
          BillingStatePostgresQueryable["getLatestSubscriptionByScope"]
        >
      >
    >;

    const enterpriseSubscription: BillingSubscriptionRow = {
      subscriptionId: "sub_enterprise_history",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "polar_sub_enterprise_history",
      accountId: "polar:cus_enterprise_history",
      scope: platformScope.enterprise,
      scopeId: "ent_1",
      planId: "plan_enterprise_history",
      priceId: "price_enterprise_history",
      status: billingSubscriptionStatus.active,
      checkoutSessionId: null,
      currentPeriodStart: new Date("2026-04-25T10:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-25T10:00:00.000Z"),
      cancelAt: null,
      canceledAt: null,
      metadata: { interval: billingPlanInterval.month },
      createdAt: new Date("2026-04-25T10:00:00.000Z"),
      updatedAt: new Date("2026-04-25T10:00:00.000Z"),
    };
    const enterpriseRenewalEvent: BillingPaymentEventRow = {
      eventId: "evt_enterprise_renewal",
      provider: platformAdapterServiceName.polar,
      providerEventId: "polar_evt_enterprise_renewal",
      subscriptionId: enterpriseSubscription.subscriptionId,
      scope: platformScope.enterprise,
      scopeId: "ent_1",
      eventType: billingWebhookEventType.subscriptionRenewed,
      status: billingPaymentEventStatus.succeeded,
      amountMinor: 4900,
      currency: "USD",
      effectiveAt: new Date("2026-04-26T08:00:00.000Z"),
      payload: {},
      recordedAt: new Date("2026-04-26T08:00:00.000Z"),
    };
    const enterprisePastDueEvent: BillingPaymentEventRow = {
      eventId: "evt_enterprise_past_due",
      provider: platformAdapterServiceName.polar,
      providerEventId: "polar_evt_enterprise_past_due",
      subscriptionId: enterpriseSubscription.subscriptionId,
      scope: platformScope.enterprise,
      scopeId: "ent_1",
      eventType: billingWebhookEventType.paymentFailed,
      status: billingPaymentEventStatus.failed,
      amountMinor: 4900,
      currency: "USD",
      effectiveAt: new Date("2026-04-27T08:00:00.000Z"),
      payload: {},
      recordedAt: new Date("2026-04-27T08:00:00.000Z"),
    };
    const organizationEvent: BillingPaymentEventRow = {
      eventId: "evt_org_unrelated",
      provider: platformAdapterServiceName.polar,
      providerEventId: "polar_evt_org_unrelated",
      subscriptionId: "sub_org_unrelated",
      scope: platformScope.organization,
      scopeId: "org_1",
      eventType: billingWebhookEventType.subscriptionCanceled,
      status: billingPaymentEventStatus.canceled,
      amountMinor: 4900,
      currency: "USD",
      effectiveAt: new Date("2026-04-28T08:00:00.000Z"),
      payload: {},
      recordedAt: new Date("2026-04-28T08:00:00.000Z"),
    };

    const queryable: BillingStatePostgresQueryable = {
      listEntitlementsByScope: async () => [],
      listPaymentEventsByScope: async (scope, scopeId) => {
        if (scope === platformScope.enterprise && scopeId === "ent_1") {
          return [enterpriseRenewalEvent, enterprisePastDueEvent];
        }

        if (scope === platformScope.organization && scopeId === "org_1") {
          return [organizationEvent];
        }

        return [];
      },
      getLatestSubscriptionByScope: async (scope, scopeId) => {
        if (scope === platformScope.enterprise && scopeId === "ent_1") {
          return enterpriseSubscription;
        }

        return undefined;
      },
    };
    const repository = await Effect.runPromise(
      makeBillingStatePostgresRepository(queryable),
    );

    const result = await Effect.runPromise(
      repository.getTenantAccessState({
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
        enterpriseId: "ent_1",
      }),
    );

    expect(result.invoiceHistory).toEqual([
      expect.objectContaining({
        eventId: "evt_enterprise_past_due",
        eventType: billingWebhookEventType.paymentFailed,
        status: billingPaymentEventStatus.failed,
      }),
      expect.objectContaining({
        eventId: "evt_enterprise_renewal",
        eventType: billingWebhookEventType.subscriptionRenewed,
        status: billingPaymentEventStatus.succeeded,
      }),
    ]);
  });
});
