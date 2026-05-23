import { createSign, generateKeyPairSync } from "node:crypto";
import { Effect, ParseResult, Schema } from "effect";
import type { MockedFunction } from "vitest";
import {
  platformModuleManifests,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  workflowJobsScheduledRecoveryAttemptCount,
  type PlatformModuleManifest,
} from "@comvestec/config";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  billingPaymentEventStatus,
  billingPlanInterval,
  billingPlanVisibility,
  billingSubscriptionStatus,
  billingWebhookReconciliationAction,
  billingWebhookEventType,
  fieldSecurityAuditAction,
  identityClaimKey,
  platformModuleId,
  platformScope,
  projectionProfile,
  runtimeResolutionSource,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  type WorkflowJobSummary,
  type WorkflowJobSummaryList,
  workflowJobTrigger,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogPostgresQueryable,
  billingCustomerAccountLinkageSource,
  type BillingCustomerAccountRecord,
  BillingCustomerAccountRecordSchema,
  type BillingCustomerAccountResolverApi,
  BillingCustomerAccountResolver,
  BillingReconciliationWorkflowJobRecordSchema,
  BillingMeteringModule,
  BillingStatePostgresRepository,
  BillingWebhookReplayPostgresRepository,
  BillingWebhookPostgresRepository,
  BillingWebhookService,
  billingCustomerAccountsTable,
  buildBillingReconciliationWorkflowJobId,
  buildSearchTenantIndexEnsureWorkflowJobId,
  identitySessionRunIdPrefix,
  identitySessionLifecycleEventType,
  makeWebhooksApiAccessModule,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
  identitySessionAuditTable,
  IdentitySessionModule,
  IdentitySessionPostgresRepository,
  makeBillingMeteringModule,
  makeBillingWebhookReplayPostgresRepository,
  makeBillingStatePostgresRepository,
  makeBillingWebhookPostgresRepository,
  makeBillingWebhookService,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makeAuthorizationModule,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeRuntimeConfigModule,
  makeRuntimeConfigPostgresRepository,
  makeTenantManagementModule,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  makeWorkflowJobsPostgresRepository,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  TenantManagementModule,
  tenantOnboardingRunStatus,
  TenantOnboardingPostgresRepository,
  tenantProvisioningStatus,
  TenantProvisioningPostgresRepository,
  type WorkflowJobRecord,
  WorkflowJobRecordSchema,
  type WorkflowJobsPostgresQueryable,
  type WorkflowJobsPostgresQueryableForRecord,
  WorkflowJobsPostgresRepository,
  WebhooksApiAccessModule,
  type WebhookApiKeyPostgresRepositoryService,
  WebhookApiKeyPostgresRepository,
  type WebhookOutboundDeliveryPostgresRepositoryService,
  WebhookOutboundDeliveryPostgresRepository,
  type WebhookSubscriptionPostgresRepositoryService,
  WebhookSubscriptionPostgresRepository,
  tenantProvisioningReceiptsTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  webhookReceiptsTable,
  workflowJobRuntime,
  workflowJobsTable,
  type BillingStatePostgresQueryable,
  type BillingWebhookReplayPostgresQueryable,
  type PostgresDatabase,
  type PostgresInsertBuilder,
  type RuntimeConfigPostgresQueryable,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
} from "@comvestec/modules";
import {
  type BillingReconciliationWorkflowDispatchInput,
  type AuthenticatedConvexWorkflowClient,
  ConvexAdapter,
  type ConvexAdapterRequestError,
  type ConvexScheduledWorkflowDispatch,
  type ConvexAdapterService,
  KeycloakAdapter,
  makeAdminBillingService,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makeSubscriberJourneyService,
  type OpenmeterAdapterService,
  OryKetoAdapter,
  PolarAdapter,
  platformAdapterServiceName,
  makeValkeyAdapter,
  ValkeyAdapter,
} from "@comvestec/platform";
import {
  createKeycloakTestOptions,
  createOryKetoTestOptions,
  createPolarTestOptions,
  createValkeyTestClient,
} from "../platform-adapter-doubles";

const toPlatformScope = (scope: string) => {
  switch (scope) {
    case platformScope.platform:
    case platformScope.enterprise:
    case platformScope.organization:
    case platformScope.individual:
      return scope;
    default:
      throw new Error(`Unsupported platform scope in test harness: ${scope}`);
  }
};

const subtractSecondsFromDate = (value: Date, seconds: number) =>
  new Date(value.getTime() - seconds * 1_000);

const createSubscriberJourneyTestDatabase = () => {
  type PersistedTable = Parameters<PostgresDatabase["insert"]>[0];
  type PersistedValues = Parameters<
    PostgresInsertBuilder<PersistedTable>["values"]
  >[0];
  type BillingEntitlementSelectRow =
    typeof billingEntitlementsTable.$inferSelect;
  type BillingSubscriptionSelectRow =
    typeof billingSubscriptionsTable.$inferSelect;
  type AuditLogEventSelectRow = typeof auditLogEventsTable.$inferSelect;
  type RuntimeConfigOverrideProposalSelectRow =
    typeof runtimeConfigOverrideProposalsTable.$inferSelect;
  type RuntimeConfigOverrideSelectRow =
    typeof runtimeConfigOverridesTable.$inferSelect;
  type RuntimeConfigSyncArtifactSelectRow =
    typeof runtimeConfigSyncArtifactsTable.$inferSelect;
  type WorkflowJobSelectRow = typeof workflowJobsTable.$inferSelect;

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
  const provisioningReceipts = new Map<
    string,
    typeof tenantProvisioningReceiptsTable.$inferInsert
  >();
  const receipts = new Map<string, typeof webhookReceiptsTable.$inferInsert>();
  const customerAccounts = new Map<
    string,
    typeof billingCustomerAccountsTable.$inferInsert
  >();
  const subscriptions = new Map<
    string,
    typeof billingSubscriptionsTable.$inferInsert
  >();
  const paymentEvents = new Map<
    string,
    typeof billingPaymentEventsTable.$inferInsert
  >();
  const entitlements = new Map<
    string,
    typeof billingEntitlementsTable.$inferInsert
  >();
  const auditLogEvents = new Map<
    string,
    typeof auditLogEventsTable.$inferInsert
  >();
  const workflowJobs = new Map<string, typeof workflowJobsTable.$inferInsert>();
  const runtimeConfigOverrides = new Map<
    string,
    typeof runtimeConfigOverridesTable.$inferInsert
  >();
  const runtimeConfigOverrideProposals = new Map<
    string,
    typeof runtimeConfigOverrideProposalsTable.$inferInsert
  >();
  const runtimeConfigSyncArtifacts = new Map<
    string,
    typeof runtimeConfigSyncArtifactsTable.$inferInsert
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
        continue;
      }

      if (table === tenantProvisioningReceiptsTable) {
        const receipt =
          row as typeof tenantProvisioningReceiptsTable.$inferInsert;
        provisioningReceipts.set(receipt.provisioningId, receipt);
        continue;
      }

      if (table === webhookReceiptsTable) {
        const receipt = row as typeof webhookReceiptsTable.$inferInsert;
        receipts.set(`${receipt.provider}:${receipt.deliveryId}`, receipt);
        continue;
      }

      if (table === billingCustomerAccountsTable) {
        const customerAccount =
          row as typeof billingCustomerAccountsTable.$inferInsert;
        customerAccounts.set(
          `${customerAccount.provider}:${customerAccount.providerCustomerId}`,
          customerAccount,
        );
        continue;
      }

      if (table === billingSubscriptionsTable) {
        const subscription =
          row as typeof billingSubscriptionsTable.$inferInsert;
        subscriptions.set(
          `${subscription.scope}:${subscription.scopeId}`,
          subscription,
        );
        continue;
      }

      if (table === billingPaymentEventsTable) {
        const paymentEvent =
          row as typeof billingPaymentEventsTable.$inferInsert;
        paymentEvents.set(paymentEvent.eventId, paymentEvent);
        continue;
      }

      if (table === billingEntitlementsTable) {
        const entitlement = row as typeof billingEntitlementsTable.$inferInsert;
        entitlements.set(
          [
            entitlement.scope,
            entitlement.scopeId,
            entitlement.moduleId,
            entitlement.featureKey,
          ].join(":"),
          entitlement,
        );

        continue;
      }

      if (table === auditLogEventsTable) {
        const event = row as typeof auditLogEventsTable.$inferInsert;
        auditLogEvents.set(event.eventId, event);
        continue;
      }

      if (table === workflowJobsTable) {
        const workflowJob = row as typeof workflowJobsTable.$inferInsert;
        workflowJobs.set(workflowJob.jobId, workflowJob);
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

  const writeDatabase: PostgresDatabase = {
    ...transaction,
    transaction: async (callback) => callback(transaction),
  };

  const toBillingEntitlementSelectRow = (
    row: typeof billingEntitlementsTable.$inferInsert,
  ): BillingEntitlementSelectRow => ({
    entitlementId: row.entitlementId,
    moduleId: row.moduleId,
    featureKey: row.featureKey,
    scope: row.scope,
    scopeId: row.scopeId,
    active: row.active ?? true,
    quotaSnapshot: row.quotaSnapshot ?? null,
    grantedAt: row.grantedAt ?? new Date(),
    expiresAt: row.expiresAt ?? null,
  });

  const toBillingSubscriptionSelectRow = (
    row: typeof billingSubscriptionsTable.$inferInsert,
  ): BillingSubscriptionSelectRow => ({
    subscriptionId: row.subscriptionId,
    provider: row.provider,
    providerSubscriptionId: row.providerSubscriptionId,
    accountId: row.accountId,
    scope: row.scope,
    scopeId: row.scopeId,
    planId: row.planId,
    priceId: row.priceId ?? null,
    status: row.status,
    checkoutSessionId: row.checkoutSessionId ?? null,
    currentPeriodStart: row.currentPeriodStart ?? null,
    currentPeriodEnd: row.currentPeriodEnd ?? null,
    cancelAt: row.cancelAt ?? null,
    canceledAt: row.canceledAt ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  });

  const toWorkflowJobSelectRow = (
    row: typeof workflowJobsTable.$inferInsert,
  ): WorkflowJobSelectRow => ({
    jobId: row.jobId,
    runtime: row.runtime,
    sourceModuleId: row.sourceModuleId,
    kind: row.kind,
    trigger: row.trigger,
    status: row.status,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    attempts: row.attempts ?? 0,
    scheduledAt: row.scheduledAt ?? new Date(),
    completedAt: row.completedAt ?? null,
    lastError: typeof row.lastError === "string" ? row.lastError : null,
    gapReason: typeof row.gapReason === "string" ? row.gapReason : null,
    payload: row.payload ?? {
      sourceModuleId: platformModuleId.billingAndMetering,
      tenantScope: platformScope.organization,
      tenantScopeId: "missing-payload",
      provider: platformAdapterServiceName.polar,
      correlationId: "missing-payload",
      trigger: workflowJobTrigger.checkoutCreated,
    },
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  });

  const toAuditLogEventSelectRow = (
    row: typeof auditLogEventsTable.$inferInsert,
  ): AuditLogEventSelectRow => ({
    eventId: row.eventId,
    moduleId: row.moduleId,
    action: row.action,
    target: row.target,
    actorId: row.actorId,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    reason: row.reason ?? null,
    correlationId: row.correlationId ?? null,
    requestContext: row.requestContext ?? {},
    recordedAt: row.recordedAt ?? new Date(),
  });

  const toRuntimeConfigOverrideSelectRow = (
    row: typeof runtimeConfigOverridesTable.$inferInsert,
  ): RuntimeConfigOverrideSelectRow => ({
    overrideId: row.overrideId,
    moduleId: row.moduleId,
    key: row.key,
    scope: row.scope,
    scopeId: row.scopeId,
    value: row.value,
    source: row.source,
    changedBy: row.changedBy,
    approvalReason: row.approvalReason ?? null,
    changedAt: row.changedAt ?? new Date(),
  });

  const toRuntimeConfigOverrideProposalSelectRow = (
    row: typeof runtimeConfigOverrideProposalsTable.$inferInsert,
  ): RuntimeConfigOverrideProposalSelectRow => ({
    proposalId: row.proposalId,
    moduleId: row.moduleId,
    key: row.key,
    scope: row.scope,
    scopeId: row.scopeId,
    value: row.value,
    source: row.source,
    changedBy: row.changedBy,
    changedAt: row.changedAt ?? new Date(),
    approvalReason: row.approvalReason,
    status: row.status ?? "pending",
    decidedBy: row.decidedBy ?? null,
    decisionReason: row.decisionReason ?? null,
    decidedAt: row.decidedAt ?? null,
  });

  const toRuntimeConfigSyncArtifactSelectRow = (
    row: typeof runtimeConfigSyncArtifactsTable.$inferInsert,
  ): RuntimeConfigSyncArtifactSelectRow => ({
    proposalId: row.proposalId,
    moduleId: row.moduleId,
    key: row.key,
    action: row.action,
    artifactPath: row.artifactPath,
    runtimeValue: row.runtimeValue ?? null,
    codeValue: row.codeValue ?? null,
    status: row.status ?? "pending",
    generatedAt: row.generatedAt ?? new Date(),
    decidedBy: row.decidedBy ?? null,
    decisionReason: row.decisionReason ?? null,
    decidedAt: row.decidedAt ?? null,
  });

  const readDatabase: BillingStatePostgresQueryable = {
    listEntitlementsByScope: async (scope, scopeId) =>
      [...entitlements.values()]
        .filter((row) => row.scope === scope && row.scopeId === scopeId)
        .map(toBillingEntitlementSelectRow),
    listPaymentEventsByScope: async (scope, scopeId) =>
      [...paymentEvents.values()]
        .filter((row) => row.scope === scope && row.scopeId === scopeId)
        .sort((left, right) => {
          const leftTime =
            left.recordedAt instanceof Date ? left.recordedAt.getTime() : 0;
          const rightTime =
            right.recordedAt instanceof Date ? right.recordedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map((row) => ({
          eventId: row.eventId,
          provider: row.provider,
          providerEventId: row.providerEventId,
          subscriptionId: row.subscriptionId ?? null,
          scope: row.scope ?? null,
          scopeId: row.scopeId ?? null,
          eventType: row.eventType,
          status: row.status,
          amountMinor: row.amountMinor ?? null,
          currency: row.currency ?? null,
          effectiveAt: row.effectiveAt ?? null,
          payload: row.payload ?? {},
          recordedAt: row.recordedAt ?? new Date(),
        })),
    getLatestSubscriptionByScope: async (scope, scopeId) =>
      (() => {
        const matchingSubscriptions = [...subscriptions.values()]
          .filter((row) => row.scope === scope && row.scopeId === scopeId)
          .sort((left, right) => {
            const leftTime =
              left.updatedAt instanceof Date ? left.updatedAt.getTime() : 0;
            const rightTime =
              right.updatedAt instanceof Date ? right.updatedAt.getTime() : 0;

            return rightTime - leftTime;
          });
        const subscription =
          matchingSubscriptions.find(
            (row) =>
              row.status === billingSubscriptionStatus.pending ||
              row.status === billingSubscriptionStatus.active ||
              row.status === billingSubscriptionStatus.pastDue,
          ) ?? matchingSubscriptions[0];

        return subscription === undefined
          ? undefined
          : toBillingSubscriptionSelectRow(subscription);
      })(),
  };
  const replayDatabase: BillingWebhookReplayPostgresQueryable = {
    getWebhookReceiptByProviderAndDeliveryId: async (provider, deliveryId) => {
      const receipt = receipts.get(`${provider}:${deliveryId}`);

      return receipt === undefined
        ? undefined
        : {
            receiptId: receipt.receiptId,
            provider: receipt.provider,
            deliveryId: receipt.deliveryId,
            eventType: receipt.eventType,
            processingState: receipt.processingState ?? "pending",
            verifiedSignature: receipt.verifiedSignature ?? false,
            scope: receipt.scope ?? null,
            scopeId: receipt.scopeId ?? null,
            payload: receipt.payload ?? {},
            receivedAt: receipt.receivedAt ?? new Date(),
            processedAt: receipt.processedAt ?? null,
          };
    },
  };
  const workflowJobsQueryable: WorkflowJobsPostgresQueryable = {
    getWorkflowJobById: async (jobId) => {
      const workflowJob = workflowJobs.get(jobId);

      return workflowJob === undefined
        ? undefined
        : toWorkflowJobSelectRow(workflowJob);
    },
    claimScheduledWorkflowJob: async (jobId, now) => {
      const workflowJob = workflowJobs.get(jobId);

      const dueScheduledJob =
        workflowJob?.status === workflowJobStatus.scheduled &&
        (workflowJob.scheduledAt ?? new Date(0)) <= now;
      const staleRunningJob =
        workflowJob?.status === workflowJobStatus.running &&
        (workflowJob.updatedAt ?? new Date(0)) <=
          subtractSecondsFromDate(now, workflowJobsRunningClaimTimeoutSeconds);

      if (workflowJob === undefined || (!dueScheduledJob && !staleRunningJob)) {
        return undefined;
      }

      const {
        completedAt: _completedAt,
        gapReason: _gapReason,
        lastError: _lastError,
        ...claimedWorkflowJobBase
      } = workflowJob;

      const claimedWorkflowJob = {
        ...claimedWorkflowJobBase,
        status: workflowJobStatus.running,
        attempts: (workflowJob.attempts ?? 0) + 1,
        updatedAt: now,
      } satisfies typeof workflowJobsTable.$inferInsert;

      workflowJobs.set(jobId, claimedWorkflowJob);

      return toWorkflowJobSelectRow(claimedWorkflowJob);
    },
    restoreWorkflowJobIfUpdatedAtMatches: async (
      jobId,
      expectedUpdatedAt,
      record,
    ) => {
      const workflowJob = workflowJobs.get(jobId);

      if (
        workflowJob === undefined ||
        workflowJob.status !== workflowJobStatus.scheduled ||
        workflowJob.updatedAt?.getTime() !== expectedUpdatedAt.getTime()
      ) {
        return undefined;
      }

      const restoredWorkflowJob = {
        jobId: record.jobId,
        runtime: record.runtime,
        sourceModuleId: record.sourceModuleId,
        kind: record.kind,
        trigger: record.trigger,
        status: record.status,
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        attempts: record.attempts,
        scheduledAt: new Date(record.scheduledAt),
        ...(record.completedAt !== undefined
          ? { completedAt: new Date(record.completedAt) }
          : {}),
        ...(record.lastError !== undefined
          ? { lastError: record.lastError }
          : {}),
        ...(record.gapReason !== undefined
          ? { gapReason: record.gapReason }
          : {}),
        payload: record.payload,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      } satisfies typeof workflowJobsTable.$inferInsert;

      workflowJobs.set(jobId, restoredWorkflowJob);

      return toWorkflowJobSelectRow(restoredWorkflowJob);
    },
    cancelWorkflowJobIfUpdatedAtMatches: async (
      jobId,
      expectedUpdatedAt,
      canceledAt,
    ) => {
      const workflowJob = workflowJobs.get(jobId);

      if (
        workflowJob === undefined ||
        workflowJob.updatedAt?.getTime() !== expectedUpdatedAt.getTime()
      ) {
        return undefined;
      }

      const canceledWorkflowJob = {
        ...workflowJob,
        status: workflowJobStatus.canceled,
        completedAt: canceledAt,
        updatedAt: canceledAt,
      } satisfies typeof workflowJobsTable.$inferInsert;

      workflowJobs.set(jobId, canceledWorkflowJob);

      return toWorkflowJobSelectRow(canceledWorkflowJob);
    },
    listDueWorkflowJobs: async (sourceModuleId, scheduledBefore) =>
      [...workflowJobs.values()]
        .filter(
          (row) =>
            row.sourceModuleId === sourceModuleId &&
            ((row.status === workflowJobStatus.scheduled &&
              (row.scheduledAt ?? new Date(0)) <= scheduledBefore) ||
              (row.status === workflowJobStatus.running &&
                (row.updatedAt ?? new Date(0)) <=
                  subtractSecondsFromDate(
                    scheduledBefore,
                    workflowJobsRunningClaimTimeoutSeconds,
                  ))),
        )
        .sort((left, right) => {
          const leftTime =
            left.scheduledAt instanceof Date ? left.scheduledAt.getTime() : 0;
          const rightTime =
            right.scheduledAt instanceof Date ? right.scheduledAt.getTime() : 0;

          return leftTime - rightTime;
        })
        .map(toWorkflowJobSelectRow),
    listRepairGapWorkflowJobs: async (input) =>
      [...workflowJobs.values()]
        .filter(
          (row) =>
            row.sourceModuleId === input.sourceModuleId &&
            (input.tenantScope === undefined ||
              row.tenantScope === input.tenantScope) &&
            (input.tenantScopeId === undefined ||
              row.tenantScopeId === input.tenantScopeId) &&
            ((row.gapReason != null &&
              (row.status === workflowJobStatus.scheduled ||
                row.status === workflowJobStatus.blocked)) ||
              (row.status === workflowJobStatus.running &&
                (row.updatedAt ?? new Date(0)) <=
                  subtractSecondsFromDate(
                    new Date(),
                    workflowJobsRunningClaimTimeoutSeconds,
                  ))),
        )
        .sort((left, right) => {
          const leftTime =
            left.updatedAt instanceof Date ? left.updatedAt.getTime() : 0;
          const rightTime =
            right.updatedAt instanceof Date ? right.updatedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toWorkflowJobSelectRow),
  };
  const auditLogQueryable: AuditLogPostgresQueryable = {
    listEventsByModule: async (moduleId) =>
      [...auditLogEvents.values()]
        .filter((row) => row.moduleId === moduleId)
        .sort((left, right) => {
          const leftTime =
            left.recordedAt instanceof Date ? left.recordedAt.getTime() : 0;
          const rightTime =
            right.recordedAt instanceof Date ? right.recordedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toAuditLogEventSelectRow),
    listEventsByTarget: async (input) =>
      [...auditLogEvents.values()]
        .filter(
          (row) =>
            row.moduleId === input.moduleId && row.target === input.target,
        )
        .sort((left, right) => {
          const leftTime =
            left.recordedAt instanceof Date ? left.recordedAt.getTime() : 0;
          const rightTime =
            right.recordedAt instanceof Date ? right.recordedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toAuditLogEventSelectRow),
    listEventsByActor: async (actorId) =>
      [...auditLogEvents.values()]
        .filter((row) => row.actorId === actorId)
        .sort((left, right) => {
          const leftTime =
            left.recordedAt instanceof Date ? left.recordedAt.getTime() : 0;
          const rightTime =
            right.recordedAt instanceof Date ? right.recordedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toAuditLogEventSelectRow),
    listEventsByTenant: async (input) =>
      [...auditLogEvents.values()]
        .filter(
          (row) =>
            row.tenantScope === input.tenantScope &&
            row.tenantScopeId === input.tenantScopeId,
        )
        .sort((left, right) => {
          const leftTime =
            left.recordedAt instanceof Date ? left.recordedAt.getTime() : 0;
          const rightTime =
            right.recordedAt instanceof Date ? right.recordedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toAuditLogEventSelectRow),
  };
  const runtimeConfigQueryable: RuntimeConfigPostgresQueryable = {
    listOverridesByModule: async (moduleId) =>
      [...runtimeConfigOverrides.values()]
        .filter((row) => row.moduleId === moduleId)
        .sort((left, right) => {
          const leftTime =
            left.changedAt instanceof Date ? left.changedAt.getTime() : 0;
          const rightTime =
            right.changedAt instanceof Date ? right.changedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toRuntimeConfigOverrideSelectRow),
    listOverrideProposalsByModule: async (moduleId) =>
      [...runtimeConfigOverrideProposals.values()]
        .filter((row) => row.moduleId === moduleId)
        .sort((left, right) => {
          const leftTime =
            left.changedAt instanceof Date ? left.changedAt.getTime() : 0;
          const rightTime =
            right.changedAt instanceof Date ? right.changedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toRuntimeConfigOverrideProposalSelectRow),
    listSyncArtifactsByModule: async (moduleId) =>
      [...runtimeConfigSyncArtifacts.values()]
        .filter((row) => row.moduleId === moduleId)
        .sort((left, right) => {
          const leftTime =
            left.generatedAt instanceof Date ? left.generatedAt.getTime() : 0;
          const rightTime =
            right.generatedAt instanceof Date ? right.generatedAt.getTime() : 0;

          return rightTime - leftTime;
        })
        .map(toRuntimeConfigSyncArtifactSelectRow),
  };

  return {
    writeDatabase,
    readDatabase,
    replayDatabase,
    auditLogQueryable,
    runtimeConfigQueryable,
    workflowJobsQueryable,
    identitySessionEvents,
    onboardingRuns,
    onboardingSteps,
    provisioningReceipts,
    receipts,
    customerAccounts,
    subscriptions,
    paymentEvents,
    entitlements,
    auditLogEvents,
    workflowJobs,
    runtimeConfigOverrides,
    runtimeConfigOverrideProposals,
    runtimeConfigSyncArtifacts,
  };
};

const createBillingCustomerAccountResolver = (
  database: ReturnType<typeof createSubscriberJourneyTestDatabase>,
) =>
  ({
    resolveCustomerAccount: (input) => {
      const provisioningReceipt = [
        ...database.provisioningReceipts.values(),
      ].find(
        (row) =>
          row.tenantScope === input.scope &&
          row.tenantScopeId === input.scopeId,
      );
      const lifecycleEvent = [...database.identitySessionEvents.values()]
        .filter(
          (row) =>
            row.tenantScope === input.scope &&
            row.tenantScopeId === input.scopeId &&
            row.eventType ===
              identitySessionLifecycleEventType.authCallbackCompleted,
        )
        .sort((left, right) => {
          const leftTime =
            left.recordedAt instanceof Date ? left.recordedAt.getTime() : 0;
          const rightTime =
            right.recordedAt instanceof Date ? right.recordedAt.getTime() : 0;

          return rightTime - leftTime;
        })[0];
      const actorId =
        provisioningReceipt?.ownerActorId ?? lifecycleEvent?.actorId;

      return actorId === undefined
        ? Effect.succeed<BillingCustomerAccountRecord | undefined>(undefined)
        : Effect.succeed<BillingCustomerAccountRecord | undefined>({
            accountId: [
              platformAdapterServiceName.polar,
              input.customerId,
            ].join(":"),
            provider: platformAdapterServiceName.polar,
            providerCustomerId: input.customerId,
            actorId,
            scope: input.scope,
            scopeId: input.scopeId,
            status: input.subscriptionStatus,
            metadata: {
              linkageSource:
                provisioningReceipt !== undefined
                  ? billingCustomerAccountLinkageSource.tenantProvisioning
                  : billingCustomerAccountLinkageSource.identitySessionAudit,
              subscriptionId: input.subscriptionId,
              action: input.action,
            },
          });
    },
  }) satisfies BillingCustomerAccountResolverApi;

const createSubscriberJourneyRepairReadModel = (
  database: ReturnType<typeof createSubscriberJourneyTestDatabase>,
) => ({
  getProvisioningReceiptByTenant: async (scope: string, scopeId: string) => {
    const provisioningReceipt = [
      ...database.provisioningReceipts.values(),
    ].find((row) => row.tenantScope === scope && row.tenantScopeId === scopeId);

    return provisioningReceipt === undefined
      ? undefined
      : {
          ownerActorId: provisioningReceipt.ownerActorId,
          status:
            provisioningReceipt.status ?? tenantProvisioningStatus.pending,
        };
  },
  getOnboardingRunByTenant: async (scope: string, scopeId: string) => {
    const onboardingRun = [...database.onboardingRuns.values()].find(
      (row) => row.tenantScope === scope && row.tenantScopeId === scopeId,
    );

    return onboardingRun === undefined
      ? undefined
      : {
          runId: onboardingRun.runId,
          status: onboardingRun.status ?? tenantOnboardingRunStatus.pending,
        };
  },
  getCustomerAccountByTenant: async (scope: string, scopeId: string) => {
    const customerAccount = [...database.customerAccounts.values()]
      .filter((row) => row.scope === scope && row.scopeId === scopeId)
      .sort((left, right) => {
        const leftTime =
          left.updatedAt instanceof Date ? left.updatedAt.getTime() : 0;
        const rightTime =
          right.updatedAt instanceof Date ? right.updatedAt.getTime() : 0;

        return rightTime - leftTime;
      })[0];

    return customerAccount === undefined
      ? undefined
      : await Effect.runPromise(
          Schema.decodeUnknown(BillingCustomerAccountRecordSchema)({
            accountId: customerAccount.accountId,
            provider: customerAccount.provider,
            providerCustomerId: customerAccount.providerCustomerId,
            actorId: customerAccount.actorId,
            scope: customerAccount.scope,
            scopeId: customerAccount.scopeId,
            ...(customerAccount.email != null
              ? { email: customerAccount.email }
              : {}),
            status: customerAccount.status,
            metadata: customerAccount.metadata ?? {},
          }),
        );
  },
  getCustomerAccountById: async (accountId: string) => {
    const customerAccount = [...database.customerAccounts.values()].find(
      (row) => row.accountId === accountId,
    );

    return customerAccount === undefined
      ? undefined
      : await Effect.runPromise(
          Schema.decodeUnknown(BillingCustomerAccountRecordSchema)({
            accountId: customerAccount.accountId,
            provider: customerAccount.provider,
            providerCustomerId: customerAccount.providerCustomerId,
            actorId: customerAccount.actorId,
            scope: customerAccount.scope,
            scopeId: customerAccount.scopeId,
            ...(customerAccount.email != null
              ? { email: customerAccount.email }
              : {}),
            status: customerAccount.status,
            metadata: customerAccount.metadata ?? {},
          }),
        );
  },
});

const createConvexAdapterDouble = (options?: {
  readonly scheduleFailure?: ConvexAdapterRequestError;
  readonly scheduleFailureOnCall?: {
    readonly callNumber: number;
    readonly error: ConvexAdapterRequestError;
  };
  readonly primaryScheduled?: boolean;
  readonly scheduledRecoveryAttemptCount?: number;
}) => {
  const scheduledWorkflowDispatches: BillingReconciliationWorkflowDispatchInput[] =
    [];
  let scheduleCallCount = 0;
  const scheduleBillingReconciliationWorkflowJob: ConvexAdapterService["scheduleBillingReconciliationWorkflowJob"] =
    (input) => {
      scheduleCallCount += 1;

      if (options?.scheduleFailure !== undefined) {
        return Effect.fail(options.scheduleFailure);
      }

      if (options?.scheduleFailureOnCall?.callNumber === scheduleCallCount) {
        return Effect.fail(options.scheduleFailureOnCall.error);
      }

      scheduledWorkflowDispatches.push(input);

      const primaryScheduled = options?.primaryScheduled ?? true;
      const scheduledRecoveryAttemptCount =
        options?.scheduledRecoveryAttemptCount ??
        workflowJobsScheduledRecoveryAttemptCount;
      const scheduledFunctionIds = [
        ...(primaryScheduled
          ? [["scheduled", input.jobId, "primary"].join(":")]
          : []),
        ...Array.from({ length: scheduledRecoveryAttemptCount }, (_, index) =>
          ["scheduled", input.jobId, "recovery", index + 1].join(":"),
        ),
      ];
      const resolvedScheduledFunctionIds =
        scheduledFunctionIds.length > 0
          ? scheduledFunctionIds
          : [["scheduled", input.jobId, "recovery", 1].join(":")];

      const dispatch: ConvexScheduledWorkflowDispatch = {
        scheduledFunctionId: resolvedScheduledFunctionIds[0] ?? "",
        scheduledFunctionIds: resolvedScheduledFunctionIds,
        primaryScheduled,
        scheduledRecoveryAttemptCount,
        expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
      };

      return Effect.succeed(dispatch);
    };
  const convex: ConvexAdapterService = {
    serviceName: platformAdapterServiceName.convex,
    deploymentUrl: "http://127.0.0.1:3210",
    siteUrl: "http://127.0.0.1:3211",
    healthcheck: Effect.succeed({
      healthy: true,
      service: platformAdapterServiceName.convex,
    }),
    scheduleBillingReconciliationWorkflowJob,
  };

  return {
    convex,
    scheduledWorkflowDispatches,
  };
};

const seedAuthCallbackEvidence = (input: {
  readonly database: ReturnType<typeof createSubscriberJourneyTestDatabase>;
  readonly actorId: string;
  readonly scopeId: string;
  readonly scope?:
    | typeof platformScope.organization
    | typeof platformScope.enterprise;
}) => {
  input.database.identitySessionEvents.set(
    ["evt-auth-callback", input.scopeId].join(":"),
    {
      eventId: ["evt-auth-callback", input.scopeId].join(":"),
      sessionId: ["sess", input.scopeId].join("_"),
      actorId: input.actorId,
      tenantScope: input.scope ?? platformScope.organization,
      tenantScopeId: input.scopeId,
      eventType: identitySessionLifecycleEventType.authCallbackCompleted,
      provider: platformAdapterServiceName.keycloak,
      metadata: {
        correlationId: ["corr-auth-callback", input.scopeId].join(":"),
      },
      recordedAt: new Date(),
    },
  );
};

const encodeBase64UrlJson = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const keycloakIdentityTokenTestKeyId =
  "subscriber-journey-keycloak-identity-token-test-key";
const keycloakIdentityTokenTestKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const keycloakIdentityTokenTestPublicJwk = {
  ...(keycloakIdentityTokenTestKeyPair.publicKey.export({
    format: "jwk",
  }) as JsonWebKey),
  kid: keycloakIdentityTokenTestKeyId,
  alg: "RS256",
  use: "sig",
};

const createKeycloakIdToken = (input: {
  readonly sub: string;
  readonly actorTypeValue?: string;
  readonly keyId?: string;
  readonly algorithm?: string;
  readonly expiresInSeconds?: number;
}) => {
  const baseOptions = createKeycloakTestOptions();
  const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const headerSegment = encodeBase64UrlJson({
    alg: input.algorithm ?? "RS256",
    typ: "JWT",
    kid: input.keyId ?? keycloakIdentityTokenTestKeyId,
  });
  const payloadSegment = encodeBase64UrlJson({
    iss: issuer,
    aud: baseOptions.clientId,
    sub: input.sub,
    preferred_username: input.sub,
    exp: nowSeconds + (input.expiresInSeconds ?? 3_600),
    iat: nowSeconds,
    sid: `sess_${input.sub}`,
    ...(input.actorTypeValue !== undefined
      ? { [identityClaimKey.actorType]: input.actorTypeValue }
      : {}),
  });
  const signedContent = `${headerSegment}.${payloadSegment}`;
  const signer = createSign("RSA-SHA256");

  signer.update(signedContent);
  signer.end();

  return `${signedContent}.${signer
    .sign(keycloakIdentityTokenTestKeyPair.privateKey)
    .toString("base64url")}`;
};

const createSubscriberJourneyKeycloakAdapter = async () => {
  const baseOptions = createKeycloakTestOptions();
  const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
  const certsEndpoint = `${issuer}/protocol/openid-connect/certs`;

  return Effect.runPromise(
    makeKeycloakAdapter({
      ...baseOptions,
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === certsEndpoint) {
          return new Response(
            JSON.stringify({ keys: [keycloakIdentityTokenTestPublicJwk] }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        return baseOptions.fetch!(input, init);
      },
    }),
  );
};

const createOpenmeterUsageMeterDouble = () => {
  const ingestedUsageEvents: Array<
    Parameters<OpenmeterAdapterService["ingestUsage"]>[0]
  > = [];

  return {
    ingestedUsageEvents,
    usageMeter: {
      ingestUsage: vi.fn((input) => {
        ingestedUsageEvents.push(input);
        return Effect.succeed(input);
      }),
    } satisfies Pick<OpenmeterAdapterService, "ingestUsage">,
  };
};

const createSubscriberJourneyHarness = async (options?: {
  readonly authorizationModuleFactory?: typeof makeAuthorizationModule;
  readonly convexDispatchError?: ConvexAdapterRequestError;
  readonly convexDispatchErrorOnCall?: {
    readonly callNumber: number;
    readonly error: ConvexAdapterRequestError;
  };
  readonly convexPrimaryScheduled?: boolean;
  readonly convexScheduledRecoveryAttemptCount?: number;
  readonly polarActiveSubscriptionLookup?: {
    readonly externalCustomerId: string;
    readonly customerId: string;
    readonly subscriptionId: string;
    readonly planId: string;
    readonly priceId: string;
    readonly status?: string;
    readonly currentPeriodEnd?: Date | string | null;
  };
  readonly workflowExecutionClient?: Partial<AuthenticatedConvexWorkflowClient>;
}) => {
  const database = createSubscriberJourneyTestDatabase();
  const convexAdapterOptions =
    options?.convexDispatchError === undefined &&
    options?.convexDispatchErrorOnCall === undefined &&
    options?.convexPrimaryScheduled === undefined &&
    options?.convexScheduledRecoveryAttemptCount === undefined
      ? undefined
      : {
          ...(options?.convexDispatchError !== undefined
            ? { scheduleFailure: options.convexDispatchError }
            : {}),
          ...(options?.convexDispatchErrorOnCall !== undefined
            ? { scheduleFailureOnCall: options.convexDispatchErrorOnCall }
            : {}),
          ...(options?.convexPrimaryScheduled !== undefined
            ? { primaryScheduled: options.convexPrimaryScheduled }
            : {}),
          ...(options?.convexScheduledRecoveryAttemptCount !== undefined
            ? {
                scheduledRecoveryAttemptCount:
                  options.convexScheduledRecoveryAttemptCount,
              }
            : {}),
        };
  const { convex, scheduledWorkflowDispatches } =
    createConvexAdapterDouble(convexAdapterOptions);
  const keycloak = await createSubscriberJourneyKeycloakAdapter();
  const valkey = await Effect.runPromise(
    makeValkeyAdapter({
      url: "redis://localhost:6379",
      client: createValkeyTestClient(),
    }),
  );
  const oryKeto = await Effect.runPromise(
    makeOryKetoAdapter(createOryKetoTestOptions()),
  );
  await Effect.runPromise(
    Effect.forEach(
      [
        {
          namespace: authorizationNamespace.billingEntitlement,
          object: platformScope.platform,
          relation: authorizationRelation.viewer,
          subject: `actor-type:${actorType.platformOperator}`,
        },
        {
          namespace: authorizationNamespace.billingEntitlement,
          object: platformScope.platform,
          relation: authorizationRelation.admin,
          subject: `actor-type:${actorType.platformOperator}`,
        },
        {
          namespace: authorizationNamespace.module,
          object: platformModuleId.workflowJobs,
          relation: authorizationRelation.admin,
          subject: `actor-type:${actorType.platformOperator}`,
        },
      ],
      (tuple) => oryKeto.writeTuple(tuple),
      { concurrency: 1 },
    ),
  );
  const basePolarOptions = createPolarTestOptions();
  const basePolarSdkClient = basePolarOptions.sdkClient!;
  const activeSubscriptionLookup = options?.polarActiveSubscriptionLookup;
  const polarOptions =
    activeSubscriptionLookup === undefined
      ? basePolarOptions
      : {
          ...basePolarOptions,
          sdkClient: {
            products: basePolarSdkClient.products,
            checkouts: basePolarSdkClient.checkouts,
            customers: {
              ...basePolarSdkClient.customers,
              getExternal: async (externalCustomerId: string) => {
                if (
                  externalCustomerId !==
                  activeSubscriptionLookup.externalCustomerId
                ) {
                  throw new Error("polar-test: no customer for external id");
                }

                return {
                  id: activeSubscriptionLookup.customerId,
                  externalId: activeSubscriptionLookup.externalCustomerId,
                  email: null,
                };
              },
            },
            subscriptions: {
              ...basePolarSdkClient.subscriptions,
              list: async (request: {
                readonly customerId?: string;
                readonly active?: boolean;
                readonly limit?: number;
              }) => {
                if (
                  request.customerId !== activeSubscriptionLookup.customerId ||
                  request.active !== true
                ) {
                  return (async function* () {})();
                }

                return (async function* () {
                  yield {
                    result: {
                      items: [
                        {
                          id: activeSubscriptionLookup.subscriptionId,
                          productId: activeSubscriptionLookup.planId,
                          customerId: activeSubscriptionLookup.customerId,
                          status:
                            activeSubscriptionLookup.status ??
                            billingSubscriptionStatus.active,
                          currentPeriodEnd:
                            activeSubscriptionLookup.currentPeriodEnd ??
                            "2026-05-20T09:00:00.000Z",
                          endsAt: null,
                          canceledAt: null,
                          prices: [
                            {
                              id: activeSubscriptionLookup.priceId,
                            },
                          ],
                        },
                      ],
                    },
                  };
                })();
              },
            },
          },
        };
  const polar = await Effect.runPromise(makePolarAdapter(polarOptions));
  const { ingestedUsageEvents: openmeterUsageEvents, usageMeter } =
    createOpenmeterUsageMeterDouble();
  const tenantManagement = await Effect.runPromise(
    makeTenantManagementModule(),
  );
  const billingMetering = await Effect.runPromise(makeBillingMeteringModule());
  const identityRepository = await Effect.runPromise(
    makeIdentitySessionPostgresRepository(database.writeDatabase),
  );
  const onboardingRepository = await Effect.runPromise(
    makeTenantOnboardingPostgresRepository(database.writeDatabase),
  );
  const provisioningRepository = await Effect.runPromise(
    makeTenantProvisioningPostgresRepository(database.writeDatabase),
  );
  const billingWebhookRepository = await Effect.runPromise(
    makeBillingWebhookPostgresRepository(database.writeDatabase),
  );
  const billingStateRepository = await Effect.runPromise(
    makeBillingStatePostgresRepository(database.readDatabase),
  );
  const billingWebhookReplayRepository = await Effect.runPromise(
    makeBillingWebhookReplayPostgresRepository(database.replayDatabase),
  );
  const webhookSubscriptionRepository: WebhookSubscriptionPostgresRepositoryService =
    {
      createWebhookSubscription: (input) => Effect.succeed(input),
      listWebhookSubscriptions: () => Effect.succeed([]),
    };
  const webhookApiKeyRepository: WebhookApiKeyPostgresRepositoryService = {
    createWebhookApiKey: (input) => Effect.succeed(input),
    listWebhookApiKeys: () => Effect.succeed([]),
    rotateWebhookApiKey: () =>
      Effect.die(new Error("Unexpected webhook api key rotation call.")),
    revokeWebhookApiKey: () =>
      Effect.die(new Error("Unexpected webhook api key revoke call.")),
    restoreWebhookApiKey: () =>
      Effect.die(new Error("Unexpected webhook api key restore call.")),
  };
  const webhookOutboundDeliveryRepository: WebhookOutboundDeliveryPostgresRepositoryService =
    {
      createWebhookOutboundDelivery: (input) => Effect.succeed(input),
      getWebhookOutboundDelivery: () => Effect.succeed(undefined),
      listWebhookOutboundDeliveries: () => Effect.succeed([]),
      updateWebhookOutboundDelivery: () =>
        Effect.die(
          new Error("Unexpected webhook outbound delivery update call."),
        ),
    };
  const auditLogRepository = await Effect.runPromise(
    makeAuditLogPostgresRepository({
      ...database.writeDatabase,
      ...database.auditLogQueryable,
    }),
  );
  const runtimeConfigRepository = await Effect.runPromise(
    makeRuntimeConfigPostgresRepository({
      ...database.writeDatabase,
      ...database.runtimeConfigQueryable,
    }),
  );
  const runtimeConfig = await Effect.runPromise(
    makeRuntimeConfigModule(runtimeConfigRepository),
  );
  const workflowJobsRepository = await Effect.runPromise(
    makeWorkflowJobsPostgresRepository(
      database.writeDatabase,
      database.workflowJobsQueryable,
    ),
  );
  const auditLog = await Effect.runPromise(
    makeAuditLogModule(auditLogRepository),
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
  const billingWebhookService = await Effect.runPromise(
    makeBillingWebhookService().pipe(
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(BillingMeteringModule, billingMetering),
      Effect.provideService(
        BillingCustomerAccountResolver,
        createBillingCustomerAccountResolver(database),
      ),
      Effect.provideService(
        BillingWebhookPostgresRepository,
        billingWebhookRepository,
      ),
    ),
  );
  const webhooksApiAccess = await Effect.runPromise(
    makeWebhooksApiAccessModule().pipe(
      Effect.provideService(BillingWebhookService, billingWebhookService),
      Effect.provideService(
        BillingWebhookReplayPostgresRepository,
        billingWebhookReplayRepository,
      ),
      Effect.provideService(
        WebhookApiKeyPostgresRepository,
        webhookApiKeyRepository,
      ),
      Effect.provideService(
        WebhookOutboundDeliveryPostgresRepository,
        webhookOutboundDeliveryRepository,
      ),
      Effect.provideService(
        WebhookSubscriptionPostgresRepository,
        webhookSubscriptionRepository,
      ),
    ),
  );
  const subscriberJourney = await Effect.runPromise(
    makeSubscriberJourneyService({
      repairReadModel: createSubscriberJourneyRepairReadModel(database),
      runtimeConfig,
      usageMeter,
    }).pipe(
      Effect.provideService(ConvexAdapter, convex),
      Effect.provideService(TenantManagementModule, tenantManagement),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
      Effect.provideService(
        TenantProvisioningPostgresRepository,
        provisioningRepository,
      ),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(WebhooksApiAccessModule, webhooksApiAccess),
      Effect.provideService(
        BillingStatePostgresRepository,
        billingStateRepository,
      ),
      Effect.provideService(
        WorkflowJobsPostgresRepository,
        workflowJobsRepository,
      ),
      Effect.provideService(
        BillingWebhookPostgresRepository,
        billingWebhookRepository,
      ),
      Effect.provideService(
        BillingCustomerAccountResolver,
        createBillingCustomerAccountResolver(database),
      ),
    ),
  );
  const manualReconciliationBootstrapper = (input: { readonly now: string }) =>
    Effect.gen(function* () {
      const customerAccountsByTenant = new Set(
        [...database.customerAccounts.values()].map((customerAccount) =>
          [customerAccount.scope, customerAccount.scopeId].join(":"),
        ),
      );
      const provisioningByTenant = new Map(
        [...database.provisioningReceipts.values()].map(
          (provisioningReceipt) => [
            [
              provisioningReceipt.tenantScope,
              provisioningReceipt.tenantScopeId,
            ].join(":"),
            provisioningReceipt.status ?? tenantProvisioningStatus.pending,
          ],
        ),
      );
      const onboardingByTenant = new Map<string, string>();

      for (const onboardingRun of [...database.onboardingRuns.values()].sort(
        (left, right) => {
          const leftTime =
            left.startedAt instanceof Date ? left.startedAt.getTime() : 0;
          const rightTime =
            right.startedAt instanceof Date ? right.startedAt.getTime() : 0;

          return rightTime - leftTime;
        },
      )) {
        const tenantKey = [
          onboardingRun.tenantScope,
          onboardingRun.tenantScopeId,
        ].join(":");

        if (!onboardingByTenant.has(tenantKey)) {
          onboardingByTenant.set(
            tenantKey,
            onboardingRun.status ?? tenantOnboardingRunStatus.pending,
          );
        }
      }

      yield* Effect.forEach(
        [...database.subscriptions.values()]
          .filter(
            (subscription) =>
              subscription.status === billingSubscriptionStatus.active ||
              subscription.status === billingSubscriptionStatus.pending ||
              subscription.status === billingSubscriptionStatus.pastDue,
          )
          .sort((left, right) => {
            const leftTime =
              left.updatedAt instanceof Date ? left.updatedAt.getTime() : 0;
            const rightTime =
              right.updatedAt instanceof Date ? right.updatedAt.getTime() : 0;

            return rightTime - leftTime;
          }),
        (subscription) => {
          const tenantKey = [subscription.scope, subscription.scopeId].join(
            ":",
          );
          const hasCustomerAccount = customerAccountsByTenant.has(tenantKey);
          const provisioningStatus = provisioningByTenant.get(tenantKey);
          const onboardingStatus = onboardingByTenant.get(tenantKey);
          const gapReason = !hasCustomerAccount
            ? workflowJobGapReason.missingCustomerAccount
            : provisioningStatus !== tenantProvisioningStatus.provisioned
              ? workflowJobGapReason.missingProvisioning
              : onboardingStatus === undefined ||
                  onboardingStatus === tenantOnboardingRunStatus.failed
                ? workflowJobGapReason.missingOnboarding
                : undefined;

          if (gapReason === undefined) {
            return Effect.void;
          }

          const jobId = buildBillingReconciliationWorkflowJobId({
            trigger: workflowJobTrigger.periodicSweep,
            tenantScope: toPlatformScope(subscription.scope),
            tenantScopeId: subscription.scopeId,
            key: subscription.subscriptionId,
          });

          return workflowJobsRepository.getWorkflowJob({ jobId }).pipe(
            Effect.flatMap((existingJob) =>
              existingJob?.status === workflowJobStatus.canceled
                ? Effect.void
                : Schema.decodeUnknown(
                    BillingReconciliationWorkflowJobRecordSchema,
                  )({
                    jobId,
                    runtime: workflowJobRuntime.convex,
                    sourceModuleId: platformModuleId.billingAndMetering,
                    kind: workflowJobKind.reconciliationSweep,
                    trigger: workflowJobTrigger.periodicSweep,
                    status: workflowJobStatus.scheduled,
                    tenantScope: subscription.scope,
                    tenantScopeId: subscription.scopeId,
                    attempts: 0,
                    scheduledAt: input.now,
                    ...(gapReason !== undefined ? { gapReason } : {}),
                    payload: {
                      sourceModuleId: platformModuleId.billingAndMetering,
                      tenantScope: subscription.scope,
                      tenantScopeId: subscription.scopeId,
                      provider: subscription.provider,
                      correlationId: [
                        "admin-billing",
                        "manual-reconciliation",
                        jobId,
                      ].join(":"),
                      ...(typeof subscription.metadata?.customerId === "string"
                        ? {
                            providerCustomerId:
                              subscription.metadata.customerId,
                          }
                        : {}),
                      subscriptionId: subscription.subscriptionId,
                      trigger: workflowJobTrigger.periodicSweep,
                    },
                    createdAt: input.now,
                    updatedAt: input.now,
                  }).pipe(
                    Effect.flatMap((record) =>
                      workflowJobsRepository.persistWorkflowJob(record),
                    ),
                    Effect.asVoid,
                  ),
            ),
          );
        },
      );
    });
  const defaultWorkflowExecutionClient: AuthenticatedConvexWorkflowClient = {
    scheduleBillingReconciliationWorkflowJob: (input) =>
      convex.scheduleBillingReconciliationWorkflowJob(input),
    scheduleSearchTenantIndexEnsureWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected search workflow scheduling call."),
      )) as AuthenticatedConvexWorkflowClient["scheduleSearchTenantIndexEnsureWorkflowJob"],
    scheduleImportExportManagedFileSummaryWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected import-export workflow scheduling call."),
      )) as AuthenticatedConvexWorkflowClient["scheduleImportExportManagedFileSummaryWorkflowJob"],
    scheduleImportExportSupportCaseSummaryWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected support-case export workflow scheduling call."),
      )) as AuthenticatedConvexWorkflowClient["scheduleImportExportSupportCaseSummaryWorkflowJob"],
    scheduleWebhookOutboundDeliveryWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected webhook delivery workflow scheduling call."),
      )) as AuthenticatedConvexWorkflowClient["scheduleWebhookOutboundDeliveryWorkflowJob"],
    scheduleTenantInvitationReminderWorkflowJob: (() =>
      Effect.die(
        new Error(
          "Unexpected tenant invitation reminder workflow scheduling call.",
        ),
      )) as AuthenticatedConvexWorkflowClient["scheduleTenantInvitationReminderWorkflowJob"],
    scheduleTenantInvitationExpiryNotificationWorkflowJob: (() =>
      Effect.die(
        new Error(
          "Unexpected tenant invitation expiry workflow scheduling call.",
        ),
      )) as AuthenticatedConvexWorkflowClient["scheduleTenantInvitationExpiryNotificationWorkflowJob"],
    cancelScheduledWorkflowJob: () => Effect.succeed(null),
    runBillingConvergenceJob: ((input) =>
      subscriberJourney
        .runBillingConvergenceJob(input)
        .pipe(
          Effect.as(null),
        )) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
    recoverBillingConvergenceJob: ((input) =>
      subscriberJourney
        .runBillingConvergenceJob(input)
        .pipe(
          Effect.as(null),
        )) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
    runDueBillingConvergenceJobs: ((input) =>
      subscriberJourney.runDueBillingConvergenceJobs(
        input?.now === undefined ? undefined : { now: input.now },
      )) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
    runSearchTenantIndexEnsureWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected search workflow execution call."),
      )) as AuthenticatedConvexWorkflowClient["runSearchTenantIndexEnsureWorkflowJob"],
    runImportExportManagedFileSummaryWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected import-export workflow execution call."),
      )) as AuthenticatedConvexWorkflowClient["runImportExportManagedFileSummaryWorkflowJob"],
    runImportExportSupportCaseSummaryWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected support-case export workflow execution call."),
      )) as AuthenticatedConvexWorkflowClient["runImportExportSupportCaseSummaryWorkflowJob"],
    runWebhookOutboundDeliveryWorkflowJob: (() =>
      Effect.die(
        new Error("Unexpected webhook delivery workflow execution call."),
      )) as AuthenticatedConvexWorkflowClient["runWebhookOutboundDeliveryWorkflowJob"],
    runTenantInvitationReminderWorkflowJob: (() =>
      Effect.die(
        new Error(
          "Unexpected tenant invitation reminder workflow execution call.",
        ),
      )) as AuthenticatedConvexWorkflowClient["runTenantInvitationReminderWorkflowJob"],
    runTenantInvitationExpiryNotificationWorkflowJob: (() =>
      Effect.die(
        new Error(
          "Unexpected tenant invitation expiry workflow execution call.",
        ),
      )) as AuthenticatedConvexWorkflowClient["runTenantInvitationExpiryNotificationWorkflowJob"],
  };
  const workflowExecutionClient: AuthenticatedConvexWorkflowClient = {
    ...defaultWorkflowExecutionClient,
    ...options?.workflowExecutionClient,
  };
  const workflowJobsCompatibilityQueryable =
    database.workflowJobsQueryable as WorkflowJobsPostgresQueryableForRecord<WorkflowJobRecord>;
  const workflowJobsCompatibilityRepository: NonNullable<
    NonNullable<
      Parameters<typeof makeAdminBillingService>[0]
    >["workflowJobsCompatibilityRepository"]
  > = await Effect.runPromise(
    makeWorkflowJobsPostgresRepositoryForRecordSchema(
      database.writeDatabase,
      workflowJobsCompatibilityQueryable,
      WorkflowJobRecordSchema,
    ),
  );
  const adminBilling = await Effect.runPromise(
    makeAdminBillingService({
      ...(options?.authorizationModuleFactory !== undefined
        ? {
            authorizationModuleFactory: options.authorizationModuleFactory,
          }
        : {}),
      workflowExecutionClient,
      manualReconciliationBootstrapper,
      workflowJobsCompatibilityRepository,
    }).pipe(
      Effect.provideService(AuditLogModule, auditLog),
      Effect.provideService(
        BillingStatePostgresRepository,
        billingStateRepository,
      ),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(
        WorkflowJobsPostgresRepository,
        workflowJobsRepository,
      ),
    ),
  );

  return {
    adminBilling,
    database,
    openmeterUsageEvents,
    oryKeto,
    scheduledWorkflowDispatches,
    subscriberJourney,
    valkey,
  };
};

describe("platform subscriber journey", () => {
  it("runs the backend-ready subscriber slice from auth start to product bootstrap", async () => {
    const database = createSubscriberJourneyTestDatabase();
    const { convex } = createConvexAdapterDouble();
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
    );
    const oryKeto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
    );
    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );
    const { ingestedUsageEvents: openmeterUsageEvents, usageMeter } =
      createOpenmeterUsageMeterDouble();
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );
    const identityRepository = await Effect.runPromise(
      makeIdentitySessionPostgresRepository(database.writeDatabase),
    );
    const onboardingRepository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.writeDatabase),
    );
    const provisioningRepository = await Effect.runPromise(
      makeTenantProvisioningPostgresRepository(database.writeDatabase),
    );
    const billingWebhookRepository = await Effect.runPromise(
      makeBillingWebhookPostgresRepository(database.writeDatabase),
    );
    const billingStateRepository = await Effect.runPromise(
      makeBillingStatePostgresRepository(database.readDatabase),
    );
    const billingWebhookReplayRepository = await Effect.runPromise(
      makeBillingWebhookReplayPostgresRepository(database.replayDatabase),
    );
    const webhookSubscriptionRepository: WebhookSubscriptionPostgresRepositoryService =
      {
        createWebhookSubscription: (input) => Effect.succeed(input),
        listWebhookSubscriptions: () => Effect.succeed([]),
      };
    const webhookApiKeyRepository: WebhookApiKeyPostgresRepositoryService = {
      createWebhookApiKey: (input) => Effect.succeed(input),
      listWebhookApiKeys: () => Effect.succeed([]),
      rotateWebhookApiKey: () =>
        Effect.die(new Error("Unexpected webhook api key rotation call.")),
      revokeWebhookApiKey: () =>
        Effect.die(new Error("Unexpected webhook api key revoke call.")),
      restoreWebhookApiKey: () =>
        Effect.die(new Error("Unexpected webhook api key restore call.")),
    };
    const webhookOutboundDeliveryRepository: WebhookOutboundDeliveryPostgresRepositoryService =
      {
        createWebhookOutboundDelivery: (input) => Effect.succeed(input),
        getWebhookOutboundDelivery: () => Effect.succeed(undefined),
        listWebhookOutboundDeliveries: () => Effect.succeed([]),
        updateWebhookOutboundDelivery: () =>
          Effect.die(
            new Error("Unexpected webhook outbound delivery update call."),
          ),
      };
    const workflowJobsRepository = await Effect.runPromise(
      makeWorkflowJobsPostgresRepository(
        database.writeDatabase,
        database.workflowJobsQueryable,
      ),
    );
    const runtimeConfigRepository = await Effect.runPromise(
      makeRuntimeConfigPostgresRepository({
        ...database.writeDatabase,
        ...database.runtimeConfigQueryable,
      }),
    );
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(runtimeConfigRepository),
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
    const billingWebhookService = await Effect.runPromise(
      makeBillingWebhookService().pipe(
        Effect.provideService(PolarAdapter, polar),
        Effect.provideService(BillingMeteringModule, billingMetering),
        Effect.provideService(
          BillingCustomerAccountResolver,
          createBillingCustomerAccountResolver(database),
        ),
        Effect.provideService(
          BillingWebhookPostgresRepository,
          billingWebhookRepository,
        ),
      ),
    );
    const webhooksApiAccess = await Effect.runPromise(
      makeWebhooksApiAccessModule().pipe(
        Effect.provideService(BillingWebhookService, billingWebhookService),
        Effect.provideService(
          BillingWebhookReplayPostgresRepository,
          billingWebhookReplayRepository,
        ),
        Effect.provideService(
          WebhookApiKeyPostgresRepository,
          webhookApiKeyRepository,
        ),
        Effect.provideService(
          WebhookOutboundDeliveryPostgresRepository,
          webhookOutboundDeliveryRepository,
        ),
        Effect.provideService(
          WebhookSubscriptionPostgresRepository,
          webhookSubscriptionRepository,
        ),
      ),
    );
    const subscriberJourney = await Effect.runPromise(
      makeSubscriberJourneyService({
        repairReadModel: createSubscriberJourneyRepairReadModel(database),
        runtimeConfig,
        usageMeter,
      }).pipe(
        Effect.provideService(ConvexAdapter, convex),
        Effect.provideService(TenantManagementModule, tenantManagement),
        Effect.provideService(
          TenantOnboardingPostgresRepository,
          onboardingRepository,
        ),
        Effect.provideService(
          TenantProvisioningPostgresRepository,
          provisioningRepository,
        ),
        Effect.provideService(OryKetoAdapter, oryKeto),
        Effect.provideService(PolarAdapter, polar),
        Effect.provideService(IdentitySessionModule, identitySession),
        Effect.provideService(WebhooksApiAccessModule, webhooksApiAccess),
        Effect.provideService(
          BillingStatePostgresRepository,
          billingStateRepository,
        ),
        Effect.provideService(
          WorkflowJobsPostgresRepository,
          workflowJobsRepository,
        ),
        Effect.provideService(
          BillingWebhookPostgresRepository,
          billingWebhookRepository,
        ),
        Effect.provideService(
          BillingCustomerAccountResolver,
          createBillingCustomerAccountResolver(database),
        ),
      ),
    );

    const plans = await Effect.runPromise(subscriberJourney.listPublicPlans);
    const publicAuthStart = await Effect.runPromise(
      subscriberJourney.preparePublicAuthStart({
        host: "product.example.com",
      }),
    );
    const authStart = await Effect.runPromise(
      subscriberJourney.startAuthentication({
        requestContext: publicAuthStart.requestContext,
        tenantHint: "org_1",
        redirectUri: "https://product.example.com/auth/callback",
      }),
    );
    expect(publicAuthStart.requestContext).toEqual({
      actorType: actorType.anonymous,
      correlationId: publicAuthStart.correlationId,
      host: "product.example.com",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    });
    expect(publicAuthStart.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: expect.stringMatching(/^org_/),
      organizationId: expect.any(String),
    });
    expect(publicAuthStart.enabledModules).toEqual([
      platformModuleId.tenantManagement,
      platformModuleId.identitySession,
      platformModuleId.billingAndMetering,
    ]);
    expect(publicAuthStart.snapshot).toMatchObject({
      application: "Public web",
      branding: {
        companyName: "Platform brand fallback",
      },
    });
    expect(publicAuthStart.tenant.scopeId).toBe(
      publicAuthStart.tenant.organizationId,
    );
    const authCompletion = await Effect.runPromise(
      subscriberJourney.completeAuthentication({
        session: {
          authenticated: true,
          sessionId: "sess_journey",
          actorId: "usr_owner_1",
          realm: "comvestec",
          tenantHint: "org_1",
        },
        correlationId: publicAuthStart.correlationId,
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
    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: plans[0]?.planId ?? "plan_starter",
        priceId: plans[0]?.prices[0]?.priceId ?? "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );
    const webhook = await Effect.runPromise(
      subscriberJourney.processBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_journey",
        eventId: "evt_journey",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: new Date().toISOString(),
        verifiedSignature: true,
        subscriptionId: "sub_journey",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        planId: checkout.planId,
        priceId: checkout.priceId,
        customerId: "cus_journey",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );
    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: authCompletion.session.sessionId,
      }),
    );
    const replay = await Effect.runPromise(
      subscriberJourney.replayBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_journey",
      }),
    );

    expect(plans.length).toBeGreaterThan(0);
    expect(authStart.redirect.tenantHint).toBe("org_1");
    expect(authCompletion.requestContext.actorId).toBe("usr_owner_1");
    expect(authCompletion.provisioning.status).toBe("provisioned");
    expect(webhook.reconciliation.event.subscriptionId).toBe("sub_journey");
    expect(
      database.provisioningReceipts.get(
        ["tenant-provisioning", platformScope.organization, "org_1"].join(":"),
      ),
    ).toMatchObject({
      ownerActorId: "usr_owner_1",
      status: "provisioned",
    });
    expect(
      database.receipts.get(
        [platformAdapterServiceName.polar, "wh_journey"].join(":"),
      ),
    ).toMatchObject({
      payload: expect.objectContaining({
        occurredAt: expect.any(String),
      }),
      verifiedSignature: true,
    });
    expect(replay.reconciliation.event.deliveryId).toBe("wh_journey");
    expect(database.subscriptions.get("organization:org_1")).toMatchObject({
      planId: checkout.planId,
      status: "active",
    });
    expect(database.customerAccounts.get("polar:cus_journey")).toMatchObject({
      actorId: "usr_owner_1",
      scope: platformScope.organization,
      scopeId: "org_1",
    });
    expect(bootstrap.requestContext.sessionId).toBe("sess_journey");
    expect(bootstrap.snapshot).toMatchObject({
      application: "Product app",
    });
    expect(bootstrap.authorization.allowed).toBe(true);
    expect(bootstrap.billingStatus).toMatchObject({
      plan: checkout.planId,
      status: "active",
      usage: [
        {
          featureKey: billingAndMeteringFeatureFlag.apiRequests,
          quotaSnapshot: {
            meteringMode: billingMeteringMode.rateLimit,
            meterKey: billingAndMeteringFeatureFlag.apiRequests,
            unit: "request",
            quotaLimit: 60,
            quotaPeriod: usageQuotaPeriod.minute,
            enforcementMode: billingEnforcementMode.rateLimit,
          },
        },
      ],
    });
    expect(openmeterUsageEvents).toEqual([
      expect.objectContaining({
        subject: [platformScope.organization, "org_1"].join(":"),
        eventName: billingAndMeteringFeatureFlag.apiRequests,
        quantity: 1,
        capturedAt: expect.any(String),
      }),
    ]);
    expect(bootstrap.enabledModules).toEqual(
      expect.arrayContaining([
        platformModuleId.tenantManagement,
        platformModuleId.billingAndMetering,
      ]),
    );
  });

  it("completes admin auth without tenant provisioning, onboarding, or owner tuple writes", async () => {
    const { database, oryKeto, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();

    const authCompletion = await Effect.runPromise(
      subscriberJourney.completePlatformOperatorAuthentication({
        session: {
          authenticated: true,
          sessionId: "sess_admin_operator",
          actorId: "usr_platform_operator_1",
          realm: "comvestec",
          actorType: actorType.platformOperator,
          tenantHint: platformScope.platform,
        },
        correlationId: "corr_admin_operator",
        host: "admin.example.com",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
      }),
    );

    const ownerTuple = await Effect.runPromise(
      oryKeto.check({
        namespace: authorizationNamespace.tenant,
        object: platformScope.platform,
        relation: authorizationRelation.owner,
        subject: "usr_platform_operator_1",
      }),
    );
    const sessionEntry = await Effect.runPromise(
      valkey.readSession({ sessionId: "sess_admin_operator" }),
    );

    expect(authCompletion.requestContext).toEqual({
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator_1",
      sessionId: "sess_admin_operator",
      correlationId: "corr_admin_operator",
      host: "admin.example.com",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    });
    expect(authCompletion.lifecycleEvent.eventType).toBe(
      identitySessionLifecycleEventType.authCallbackCompleted,
    );
    expect(database.provisioningReceipts.size).toBe(0);
    expect(database.onboardingRuns.size).toBe(0);
    expect(database.onboardingSteps.size).toBe(0);
    expect(ownerTuple.allowed).toBe(false);
    expect(sessionEntry?.requestContext).toEqual(authCompletion.requestContext);
    expect([...database.identitySessionEvents.values()]).toEqual([
      expect.objectContaining({
        sessionId: "sess_admin_operator",
        actorId: "usr_platform_operator_1",
        tenantScope: platformScope.platform,
        tenantScopeId: platformScope.platform,
        eventType: identitySessionLifecycleEventType.authCallbackCompleted,
        metadata: expect.objectContaining({
          correlationId: "corr_admin_operator",
          realm: "comvestec",
          tenantHint: platformScope.platform,
        }),
      }),
    ]);
  });

  it.each([
    {
      label: "is missing",
      actorTypeValue: undefined,
      sessionId: "sess_admin_missing_claim",
    },
    {
      label: "is not platform-operator",
      actorTypeValue: actorType.organizationMember,
      sessionId: "sess_admin_wrong_claim",
    },
  ])(
    "rejects admin auth completion when the validated Keycloak actor claim $label",
    async ({ actorTypeValue, sessionId }) => {
      const { database, subscriberJourney, valkey } =
        await createSubscriberJourneyHarness();

      const failure = await Effect.runPromise(
        Effect.flip(
          subscriberJourney.completePlatformOperatorAuthentication({
            session: {
              authenticated: true,
              sessionId,
              actorId: "usr_platform_auth_invalid",
              realm: "comvestec",
              ...(actorTypeValue !== undefined
                ? { actorType: actorTypeValue }
                : {}),
              tenantHint: platformScope.platform,
            },
            correlationId: "corr_admin_invalid_actor",
            host: "admin.example.com",
            tenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
            enabledModules: [platformModuleId.identitySession],
          }),
        ),
      );
      const sessionEntry = await Effect.runPromise(
        valkey.readSession({ sessionId }),
      );

      expect(failure).toMatchObject({
        _tag: "PlatformOperatorAuthenticationActorTypeNotAllowedError",
        actorId: "usr_platform_auth_invalid",
        expectedActorTypes: [
          actorType.platformOperator,
          actorType.supportOperator,
        ],
        ...(actorTypeValue !== undefined ? { actorType: actorTypeValue } : {}),
      });
      expect(database.provisioningReceipts.size).toBe(0);
      expect(database.onboardingRuns.size).toBe(0);
      expect(database.onboardingSteps.size).toBe(0);
      expect(database.identitySessionEvents.size).toBe(0);
      expect(sessionEntry).toBeUndefined();
    },
  );

  it("prepares standalone individual auth-start tenants when requested", async () => {
    const { subscriberJourney } = await createSubscriberJourneyHarness();

    const authStart = await Effect.runPromise(
      subscriberJourney.preparePublicAuthStart({
        host: "product.example.com",
        tenantScopeHint: platformScope.individual,
      }),
    );

    expect(authStart.tenant).toEqual({
      scope: platformScope.individual,
      scopeId: expect.stringMatching(/^usr_/),
      individualId: expect.any(String),
    });
    expect(authStart.tenant.scopeId).toBe(authStart.tenant.individualId);
    expect(authStart.enabledModules).toEqual([
      platformModuleId.tenantManagement,
      platformModuleId.identitySession,
      platformModuleId.billingAndMetering,
    ]);
    expect(authStart.snapshot.application).toBe("Public web");
  });

  it("keeps individual hinted auth-start provisioning separate from branding resolution", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness();

    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
          platformScope.platform,
          platformScope.platform,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );
    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingConfigKey.companyName,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingConfigKey.companyName,
          platformScope.platform,
          platformScope.platform,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: "Comvestec Platform",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );

    const authStart = await Effect.runPromise(
      subscriberJourney.preparePublicAuthStart({
        host: "product.example.com",
        tenantHint: "usr_login_branding",
        tenantScopeHint: platformScope.individual,
      }),
    );

    expect(authStart.requestContext.tenant).toEqual({
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    });
    expect(authStart.tenant).toEqual({
      scope: platformScope.individual,
      scopeId: expect.stringMatching(/^usr_/),
      individualId: expect.any(String),
    });
    expect(authStart.tenant.scopeId).not.toBe("usr_login_branding");
    expect(authStart.snapshot.requestContext.tenant).toEqual({
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    });
    expect(authStart.snapshot.branding.companyName).toBe("Comvestec Platform");
    expect(authStart.snapshot.branding.projection.entitled).toBe(false);
    expect(authStart.snapshot.branding.projection.effectiveScope).toBe(
      platformScope.platform,
    );
  });

  it("reuses provided auth-start correlation ids when supplied", async () => {
    const { subscriberJourney } = await createSubscriberJourneyHarness();

    const authStart = await Effect.runPromise(
      subscriberJourney.preparePublicAuthStart({
        correlationId: "corr_public_auth_start",
        host: "product.example.com",
      }),
    );

    expect(authStart.correlationId).toBe("corr_public_auth_start");
    expect(authStart.requestContext.correlationId).toBe(
      "corr_public_auth_start",
    );
  });

  it("resolves stored platform branding into public auth-start preparation", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness();

    database.entitlements.set(
      [
        platformScope.platform,
        platformScope.platform,
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
      ].join(":"),
      {
        entitlementId: "ent_tenant_branding_platform_public_auth_start",
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        active: true,
        grantedAt: new Date(),
      },
    );

    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
          platformScope.platform,
          platformScope.platform,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );
    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingConfigKey.companyName,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingConfigKey.companyName,
          platformScope.platform,
          platformScope.platform,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: "Comvestec Platform",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );

    const authStart = await Effect.runPromise(
      subscriberJourney.preparePublicAuthStart({
        host: "product.example.com",
      }),
    );

    expect(authStart.snapshot.branding.companyName).toBe("Comvestec Platform");
    expect(authStart.snapshot.branding.projection.entitled).toBe(true);
    expect(authStart.snapshot.branding.projection.effectiveScope).toBe(
      platformScope.platform,
    );
  });

  it("resolves hinted tenant branding into public auth-start preparation without changing provisioning state", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_login_branding";

    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
      ].join(":"),
      {
        entitlementId: "ent_tenant_branding_login_enabled",
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );
    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
        platformScope.organization,
        tenantScopeId,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
          platformScope.organization,
          tenantScopeId,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );
    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingConfigKey.companyName,
        platformScope.organization,
        tenantScopeId,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingConfigKey.companyName,
          platformScope.organization,
          tenantScopeId,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        value: "Acme Login Brand",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );

    const authStart = await Effect.runPromise(
      subscriberJourney.preparePublicAuthStart({
        host: "product.example.com",
        tenantHint: tenantScopeId,
      }),
    );

    expect(authStart.requestContext.tenant).toEqual({
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    });
    expect(authStart.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: expect.stringMatching(/^org_/),
      organizationId: expect.any(String),
    });
    expect(authStart.tenant.scopeId).not.toBe(tenantScopeId);
    expect(authStart.snapshot.requestContext.tenant).toEqual({
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    });
    expect(authStart.snapshot.branding.companyName).toBe("Acme Login Brand");
    expect(authStart.snapshot.branding.projection.companyName).toBe(
      "Acme Login Brand",
    );
    expect(authStart.snapshot.branding.projection.effectiveScope).toBe(
      platformScope.organization,
    );
  });

  it("omits product bootstrap payload when tenant authorization is denied", async () => {
    const { database, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_denied";

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_denied",
        requestContext: {
          actorType: actorType.individualUser,
          actorId: "usr_bootstrap_denied",
          sessionId: "sess_bootstrap_denied",
          correlationId: "corr_bootstrap_denied",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            organizationId: tenantScopeId,
            individualId: "usr_bootstrap_denied",
          },
        },
      }),
    );
    database.subscriptions.set(
      [platformScope.organization, tenantScopeId].join(":"),
      {
        subscriptionId: "sub_bootstrap_denied",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_bootstrap_denied",
        accountId: "polar:cus_bootstrap_denied",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_denied",
        priceId: "price_denied",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_bootstrap_denied",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_bootstrap_denied_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_denied",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: false,
      reason:
        "Access denied because persisted tuple evidence was unavailable and delegated fallback found no match.",
    });
    expect(bootstrap.requestContext.actorId).toBe("usr_bootstrap_denied");
    expect(bootstrap).not.toHaveProperty("snapshot");
    expect(bootstrap).not.toHaveProperty("billingStatus");
    expect(bootstrap).not.toHaveProperty("enabledModules");
  });

  it("marks denied privileged bootstrap reads as audit-required", async () => {
    const { subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_privileged_denied";

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_privileged_denied",
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_bootstrap_denied",
          sessionId: "sess_bootstrap_privileged_denied",
          correlationId: "corr_bootstrap_privileged_denied",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            organizationId: tenantScopeId,
          },
        },
      }),
    );

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_privileged_denied",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: false,
      reason:
        "Access denied because persisted tuple evidence was unavailable and delegated fallback found no match.",
      auditRequired: true,
    });
    expect(bootstrap).not.toHaveProperty("snapshot");
    expect(bootstrap).not.toHaveProperty("billingStatus");
    expect(bootstrap).not.toHaveProperty("enabledModules");
  });

  it("allows privileged bootstrap reads via break-glass without persisted tuples", async () => {
    const { subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_break_glass";

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_break_glass",
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_break_glass",
          sessionId: "sess_bootstrap_break_glass",
          correlationId: "corr_bootstrap_break_glass",
          reason: "Support incident access",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            organizationId: tenantScopeId,
          },
          breakGlass: {
            approvedBy: "usr_admin_break_glass",
            reason: "Support incident access",
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          },
        },
      }),
    );

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_break_glass",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: true,
      reason: "Allowed via break-glass context.",
      auditRequired: true,
    });
    expect(bootstrap.snapshot).toMatchObject({
      application: "Product app",
    });
    expect(bootstrap.enabledModules).toEqual([]);
  });

  it("does not self-heal tenant provisioning or onboarding during privileged break-glass bootstrap reads", async () => {
    const { database, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_break_glass_hidden_gap";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_break_glass_hidden_gap",
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_break_glass_hidden_gap",
          sessionId: "sess_bootstrap_break_glass_hidden_gap",
          correlationId: "corr_bootstrap_break_glass_hidden_gap",
          reason: "Support incident access",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            organizationId: tenantScopeId,
          },
          breakGlass: {
            approvedBy: "usr_admin_break_glass",
            reason: "Support incident access",
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          },
        },
      }),
    );

    database.customerAccounts.set(
      "polar:cus_bootstrap_break_glass_hidden_gap",
      {
        accountId: "polar:cus_bootstrap_break_glass_hidden_gap",
        provider: platformAdapterServiceName.polar,
        providerCustomerId: "cus_bootstrap_break_glass_hidden_gap",
        actorId: "usr_support_break_glass_hidden_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId: "sub_bootstrap_break_glass_hidden_gap",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_bootstrap_break_glass_hidden_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_bootstrap_break_glass_hidden_gap",
        accountId: "polar:cus_bootstrap_break_glass_hidden_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_bootstrap_break_glass_hidden_gap",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_bootstrap_break_glass_hidden_gap_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    expect(database.provisioningReceipts.get(provisioningId)).toBeUndefined();
    expect(database.onboardingRuns.get(onboardingRunId)).toBeUndefined();

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_break_glass_hidden_gap",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: true,
      reason: "Allowed via break-glass context.",
      auditRequired: true,
    });
    expect(bootstrap.snapshot).toMatchObject({
      application: "Product app",
    });
    expect(database.provisioningReceipts.get(provisioningId)).toBeUndefined();
    expect(database.onboardingRuns.get(onboardingRunId)).toBeUndefined();
  });

  it("still repairs hidden tenant state for privileged operators when access comes from persisted authorization instead of break-glass", async () => {
    const { database, oryKeto, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_privileged_persisted_gap";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_privileged_persisted_gap",
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_persisted_gap",
          sessionId: "sess_bootstrap_privileged_persisted_gap",
          correlationId: "corr_bootstrap_privileged_persisted_gap",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            organizationId: tenantScopeId,
          },
        },
      }),
    );

    await Effect.runPromise(
      oryKeto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: tenantScopeId,
        relation: authorizationRelation.viewer,
        subject: "usr_support_persisted_gap",
      }),
    );

    database.customerAccounts.set(
      "polar:cus_bootstrap_privileged_persisted_gap",
      {
        accountId: "polar:cus_bootstrap_privileged_persisted_gap",
        provider: platformAdapterServiceName.polar,
        providerCustomerId: "cus_bootstrap_privileged_persisted_gap",
        actorId: "usr_support_persisted_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId: "sub_bootstrap_privileged_persisted_gap",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_bootstrap_privileged_persisted_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_bootstrap_privileged_persisted_gap",
        accountId: "polar:cus_bootstrap_privileged_persisted_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_bootstrap_privileged_persisted_gap",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_bootstrap_privileged_persisted_gap_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    expect(database.provisioningReceipts.get(provisioningId)).toBeUndefined();
    expect(database.onboardingRuns.get(onboardingRunId)).toBeUndefined();

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_privileged_persisted_gap",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: true,
      auditRequired: true,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_support_persisted_gap",
      status: tenantProvisioningStatus.provisioned,
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_support_persisted_gap",
      status: tenantOnboardingRunStatus.inProgress,
    });
  });

  it("bootstraps and repairs hidden provisioning and onboarding gaps from existing billing linkage", async () => {
    const { database, oryKeto, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_hidden_gap";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_hidden_gap",
        requestContext: {
          actorType: actorType.organizationAdmin,
          actorId: "usr_bootstrap_hidden_gap",
          sessionId: "sess_bootstrap_hidden_gap",
          correlationId: "corr_bootstrap_hidden_gap",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            organizationId: tenantScopeId,
          },
        },
      }),
    );

    await Effect.runPromise(
      oryKeto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: tenantScopeId,
        relation: authorizationRelation.viewer,
        subject: "usr_bootstrap_hidden_gap",
      }),
    );

    database.customerAccounts.set("polar:cus_bootstrap_hidden_gap", {
      accountId: "polar:cus_bootstrap_hidden_gap",
      provider: platformAdapterServiceName.polar,
      providerCustomerId: "cus_bootstrap_hidden_gap",
      actorId: "usr_bootstrap_hidden_gap",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      status: "active",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
        subscriptionId: "sub_bootstrap_hidden_gap",
        action: billingWebhookReconciliationAction.activate,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_bootstrap_hidden_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_bootstrap_hidden_gap",
        accountId: "polar:cus_bootstrap_hidden_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_bootstrap_hidden_gap",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_bootstrap_hidden_gap_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    expect(database.provisioningReceipts.get(provisioningId)).toBeUndefined();
    expect(database.onboardingRuns.get(onboardingRunId)).toBeUndefined();

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_hidden_gap",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: true,
    });
    expect(bootstrap.snapshot).toMatchObject({
      application: "Product app",
    });
    expect(bootstrap.billingStatus).toMatchObject({
      plan: "plan_starter",
      status: billingSubscriptionStatus.active,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_bootstrap_hidden_gap",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_bootstrap_hidden_gap",
      status: tenantOnboardingRunStatus.inProgress,
      currentStepId: "team-invites",
      metadata: expect.objectContaining({
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
      }),
    });
  });

  it("returns the newest live same-scope subscription before newer canceled history", async () => {
    const tenantScopeId = "org_live_subscription_preferred";
    const { database } = await createSubscriberJourneyHarness();

    database.subscriptions.set("organization-live-active", {
      subscriptionId: "sub_live_active",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "sub_live_active",
      accountId: "polar:cus_live_active",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      planId: "plan_starter",
      priceId: "price_starter_month",
      status: billingSubscriptionStatus.active,
      metadata: {
        interval: billingPlanInterval.month,
        customerId: "cus_live_active",
      },
      createdAt: new Date("2026-04-25T10:00:00.000Z"),
      updatedAt: new Date("2026-04-25T10:00:00.000Z"),
    });
    database.subscriptions.set("organization-live-past-due", {
      subscriptionId: "sub_live_past_due",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "sub_live_past_due",
      accountId: "polar:cus_live_past_due",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      planId: "plan_starter",
      priceId: "price_starter_month",
      status: billingSubscriptionStatus.pastDue,
      metadata: {
        interval: billingPlanInterval.month,
        customerId: "cus_live_past_due",
      },
      createdAt: new Date("2026-04-26T10:00:00.000Z"),
      updatedAt: new Date("2026-04-26T10:00:00.000Z"),
    });
    database.subscriptions.set("organization-canceled-newer", {
      subscriptionId: "sub_canceled_newer",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "sub_canceled_newer",
      accountId: "polar:cus_canceled_newer",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      planId: "plan_starter",
      priceId: "price_starter_month",
      status: billingSubscriptionStatus.canceled,
      metadata: {
        interval: billingPlanInterval.month,
        customerId: "cus_canceled_newer",
      },
      createdAt: new Date("2026-04-27T10:00:00.000Z"),
      updatedAt: new Date("2026-04-27T10:00:00.000Z"),
    });

    await expect(
      database.readDatabase.getLatestSubscriptionByScope(
        platformScope.organization,
        tenantScopeId,
      ),
    ).resolves.toMatchObject({
      subscriptionId: "sub_live_past_due",
      accountId: "polar:cus_live_past_due",
      status: billingSubscriptionStatus.pastDue,
    });
  });

  it("uses request tenant hierarchy when bootstrap repairs from enterprise-owned billing state", async () => {
    const { database, oryKeto, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_hidden_gap_enterprise";
    const enterpriseId = "ent_bootstrap_hidden_gap_enterprise";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.enterprise,
      enterpriseId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.enterprise,
      enterpriseId,
    ].join(":");
    const organizationProvisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const organizationOnboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_hidden_gap_enterprise",
        requestContext: {
          actorType: actorType.organizationAdmin,
          actorId: "usr_bootstrap_hidden_gap_enterprise",
          sessionId: "sess_bootstrap_hidden_gap_enterprise",
          correlationId: "corr_bootstrap_hidden_gap_enterprise",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            enterpriseId,
            organizationId: tenantScopeId,
          },
        },
      }),
    );

    await Effect.runPromise(
      oryKeto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: tenantScopeId,
        relation: authorizationRelation.viewer,
        subject: "usr_bootstrap_hidden_gap_enterprise",
      }),
    );

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_bootstrap_hidden_gap_enterprise",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
    });

    database.customerAccounts.set(
      "polar:cus_bootstrap_hidden_gap_enterprise_stale",
      {
        accountId: "polar:cus_bootstrap_hidden_gap_enterprise_stale",
        provider: platformAdapterServiceName.polar,
        providerCustomerId: "cus_bootstrap_hidden_gap_enterprise_stale",
        actorId: "usr_bootstrap_hidden_gap_enterprise_stale",
        scope: platformScope.enterprise,
        scopeId: enterpriseId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId: "sub_bootstrap_hidden_gap_enterprise_stale",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date(),
        updatedAt: new Date(Date.now() + 60_000),
      },
    );

    database.customerAccounts.set("polar:cus_bootstrap_hidden_gap_enterprise", {
      accountId: "polar:cus_bootstrap_hidden_gap_enterprise",
      provider: platformAdapterServiceName.polar,
      providerCustomerId: "cus_bootstrap_hidden_gap_enterprise",
      actorId: "usr_bootstrap_hidden_gap_enterprise",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
      status: "active",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
        subscriptionId: "sub_bootstrap_hidden_gap_enterprise",
        action: billingWebhookReconciliationAction.activate,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(`${platformScope.enterprise}:${enterpriseId}`, {
      subscriptionId: "sub_bootstrap_hidden_gap_enterprise",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "sub_bootstrap_hidden_gap_enterprise",
      accountId: "polar:cus_bootstrap_hidden_gap_enterprise",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
      planId: "plan_starter",
      priceId: "price_starter_month",
      status: billingSubscriptionStatus.active,
      metadata: {
        interval: billingPlanInterval.month,
        customerId: "cus_bootstrap_hidden_gap_enterprise",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_bootstrap_hidden_gap_enterprise_org_canceled",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId:
          "sub_bootstrap_hidden_gap_enterprise_org_canceled",
        accountId: "polar:cus_bootstrap_hidden_gap_enterprise_org_canceled",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.canceled,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_bootstrap_hidden_gap_enterprise_org_canceled",
        },
        createdAt: new Date(),
        updatedAt: new Date(Date.now() + 60_000),
      },
    );
    database.entitlements.set(
      [
        platformScope.enterprise,
        enterpriseId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_bootstrap_hidden_gap_enterprise_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.enterprise,
        scopeId: enterpriseId,
        active: true,
        grantedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
      ].join(":"),
      {
        entitlementId: "ent_bootstrap_hidden_gap_enterprise_branding",
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    expect(database.provisioningReceipts.get(provisioningId)).toBeUndefined();
    expect(database.onboardingRuns.get(onboardingRunId)).toBeUndefined();

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_hidden_gap_enterprise",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: true,
    });
    expect(bootstrap.snapshot).toMatchObject({
      application: "Product app",
    });
    expect(bootstrap.billingStatus).toMatchObject({
      plan: "plan_starter",
      status: billingSubscriptionStatus.active,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_bootstrap_hidden_gap_enterprise",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_bootstrap_hidden_gap_enterprise",
      status: tenantOnboardingRunStatus.inProgress,
      currentStepId: "team-invites",
      metadata: expect.objectContaining({
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
      }),
    });
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ stepId: "billing" })]),
    );
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ stepId: "branding" }),
      ]),
    );
    expect(
      database.provisioningReceipts.get(organizationProvisioningId),
    ).toBeUndefined();
    expect(
      database.onboardingRuns.get(organizationOnboardingRunId),
    ).toBeUndefined();
  });

  it("does not repair ancestor-owned billing state during bootstrap when the matched account belongs to a different actor", async () => {
    const { database, oryKeto, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_hidden_gap_enterprise_other_actor";
    const enterpriseId = "ent_bootstrap_hidden_gap_enterprise_other_actor";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.enterprise,
      enterpriseId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.enterprise,
      enterpriseId,
    ].join(":");
    const organizationProvisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const organizationOnboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_hidden_gap_enterprise_other_actor",
        requestContext: {
          actorType: actorType.organizationAdmin,
          actorId: "usr_bootstrap_hidden_gap_enterprise_reader",
          sessionId: "sess_bootstrap_hidden_gap_enterprise_other_actor",
          correlationId: "corr_bootstrap_hidden_gap_enterprise_other_actor",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            enterpriseId,
            organizationId: tenantScopeId,
          },
        },
      }),
    );

    await Effect.runPromise(
      oryKeto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: tenantScopeId,
        relation: authorizationRelation.viewer,
        subject: "usr_bootstrap_hidden_gap_enterprise_reader",
      }),
    );

    database.customerAccounts.set(
      "polar:cus_bootstrap_hidden_gap_enterprise_other_actor_reader",
      {
        accountId:
          "polar:cus_bootstrap_hidden_gap_enterprise_other_actor_reader",
        provider: platformAdapterServiceName.polar,
        providerCustomerId:
          "cus_bootstrap_hidden_gap_enterprise_other_actor_reader",
        actorId: "usr_bootstrap_hidden_gap_enterprise_reader",
        scope: platformScope.enterprise,
        scopeId: enterpriseId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId:
            "sub_bootstrap_hidden_gap_enterprise_other_actor_reader",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date(),
        updatedAt: new Date(Date.now() + 60_000),
      },
    );

    database.customerAccounts.set(
      "polar:cus_bootstrap_hidden_gap_enterprise_other_actor",
      {
        accountId: "polar:cus_bootstrap_hidden_gap_enterprise_other_actor",
        provider: platformAdapterServiceName.polar,
        providerCustomerId: "cus_bootstrap_hidden_gap_enterprise_other_actor",
        actorId: "usr_bootstrap_hidden_gap_enterprise_owner",
        scope: platformScope.enterprise,
        scopeId: enterpriseId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId: "sub_bootstrap_hidden_gap_enterprise_other_actor",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.subscriptions.set(`${platformScope.enterprise}:${enterpriseId}`, {
      subscriptionId: "sub_bootstrap_hidden_gap_enterprise_other_actor",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "sub_bootstrap_hidden_gap_enterprise_other_actor",
      accountId: "polar:cus_bootstrap_hidden_gap_enterprise_other_actor",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
      planId: "plan_starter",
      priceId: "price_starter_month",
      status: billingSubscriptionStatus.active,
      metadata: {
        interval: billingPlanInterval.month,
        customerId: "cus_bootstrap_hidden_gap_enterprise_other_actor",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.entitlements.set(
      [
        platformScope.enterprise,
        enterpriseId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId:
          "ent_bootstrap_hidden_gap_enterprise_other_actor_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.enterprise,
        scopeId: enterpriseId,
        active: true,
        grantedAt: new Date(),
      },
    );

    expect(database.provisioningReceipts.get(provisioningId)).toBeUndefined();
    expect(database.onboardingRuns.get(onboardingRunId)).toBeUndefined();

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_hidden_gap_enterprise_other_actor",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: true,
    });
    expect(bootstrap.snapshot).toMatchObject({
      application: "Product app",
    });
    expect(bootstrap.billingStatus).toMatchObject({
      plan: "plan_starter",
      status: billingSubscriptionStatus.active,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toBeUndefined();
    expect(database.onboardingRuns.get(onboardingRunId)).toBeUndefined();
    expect(
      database.provisioningReceipts.get(organizationProvisioningId),
    ).toBeUndefined();
    expect(
      database.onboardingRuns.get(organizationOnboardingRunId),
    ).toBeUndefined();
  });

  it("resolves stored tenant-branding overrides into product bootstrap snapshots", async () => {
    const { database, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_bootstrap_branded";

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_bootstrap_branded",
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_branded",
          sessionId: "sess_bootstrap_branded",
          correlationId: "corr_bootstrap_branded",
          reason: "Support incident access",
          tenant: {
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            organizationId: tenantScopeId,
          },
          breakGlass: {
            approvedBy: "usr_admin_break_glass",
            reason: "Support incident access",
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          },
        },
      }),
    );

    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
        platformScope.organization,
        tenantScopeId,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingFeatureFlag.enabled,
          platformScope.organization,
          tenantScopeId,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );
    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingConfigKey.companyName,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingConfigKey.companyName,
          platformScope.platform,
          platformScope.platform,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: "Acme Support Brand",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );
    database.runtimeConfigOverrides.set(
      [
        platformModuleId.tenantBranding,
        tenantBrandingConfigKey.themePrimary,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      {
        overrideId: [
          platformModuleId.tenantBranding,
          tenantBrandingConfigKey.themePrimary,
          platformScope.platform,
          platformScope.platform,
        ].join(":"),
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.themePrimary,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: "#14532D",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_governance_admin",
        changedAt: new Date(),
      },
    );

    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: "sess_bootstrap_branded",
      }),
    );

    expect(bootstrap.authorization).toMatchObject({
      allowed: true,
      reason: "Allowed via break-glass context.",
    });
    expect(bootstrap.snapshot).toMatchObject({
      application: "Product app",
      branding: {
        moduleId: platformModuleId.tenantBranding,
        companyName: "Acme Support Brand",
        projection: {
          companyName: "Acme Support Brand",
          themeTokens: {
            primary: "#14532D",
          },
          effectiveScope: platformScope.platform,
          entitled: false,
        },
      },
    });
  });

  it("schedules reconciliation deadline jobs when checkout sessions are created", async () => {
    const { database, scheduledWorkflowDispatches, subscriberJourney } =
      await createSubscriberJourneyHarness();

    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: "plan_starter",
        priceId: "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_checkout_deadline",
      }),
    );

    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.checkoutCreated,
      platformScope.organization,
      "org_checkout_deadline",
      checkout.checkoutSessionId,
    ].join(":");

    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      jobId: workflowJobId,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationDeadline,
      trigger: workflowJobTrigger.checkoutCreated,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_checkout_deadline",
      payload: expect.objectContaining({
        checkoutSessionId: checkout.checkoutSessionId,
        dispatch: {
          scheduledAt: expect.any(String),
          scheduledFunctionId: ["scheduled", workflowJobId, "primary"].join(
            ":",
          ),
          scheduledFunctionIds: [
            ["scheduled", workflowJobId, "primary"].join(":"),
            ...Array.from(
              { length: workflowJobsScheduledRecoveryAttemptCount },
              (_, index) =>
                ["scheduled", workflowJobId, "recovery", index + 1].join(":"),
            ),
          ],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount:
            workflowJobsScheduledRecoveryAttemptCount,
          expectedRecoveryAttemptCount:
            workflowJobsScheduledRecoveryAttemptCount,
        },
        trigger: workflowJobTrigger.checkoutCreated,
      }),
      scheduledAt: expect.any(Date),
    });
    expect(scheduledWorkflowDispatches).toEqual([
      expect.objectContaining({
        jobId: workflowJobId,
        scheduledAt: expect.any(String),
      }),
    ]);
  });

  it("persists operator-visible workflow gaps when Convex dispatch fails after detection", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness({
        convexDispatchError: {
          _tag: "ConvexAdapterRequestError",
          operation: "scheduleBillingReconciliationWorkflowJob",
          cause: new Error("convex unavailable"),
          status: 503,
          body: "convex unavailable",
        },
      });

    await expect(
      Effect.runPromise(
        subscriberJourney.createCheckoutSession({
          planId: "plan_starter",
          priceId: "price_starter_month",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_dispatch_failure",
        }),
      ),
    ).rejects.toThrow("ConvexAdapterRequestError");

    const workflowJob = [...database.workflowJobs.values()].find(
      (job) => job.tenantScopeId === "org_dispatch_failure",
    );

    expect(workflowJob).toMatchObject({
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.stringContaining("convex unavailable"),
      completedAt: expect.any(Date),
    });
  });

  it("retains Convex dispatch metadata when the dispatched workflow job write fails", async () => {
    const tenantScopeId = "org_dispatch_metadata_persist_failure";
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const originalInsert = database.writeDatabase.insert;
    const mutableWriteDatabase = database.writeDatabase as {
      insert: typeof database.writeDatabase.insert;
    };
    let workflowJobPersistAttempts = 0;

    mutableWriteDatabase.insert = ((table) => {
      const insertQuery = originalInsert(table) as {
        values: (values: unknown) => {
          onConflictDoUpdate: (config: unknown) => {
            execute: () => Promise<unknown>;
          };
        };
      };

      if (!Object.is(table as object, workflowJobsTable)) {
        return insertQuery;
      }

      return {
        values: (values: unknown) => {
          const valuesQuery = insertQuery.values(values);

          return {
            ...valuesQuery,
            onConflictDoUpdate: (config: unknown) => {
              const conflictQuery = valuesQuery.onConflictDoUpdate(config);

              return {
                ...conflictQuery,
                execute: async () => {
                  workflowJobPersistAttempts += 1;

                  if (workflowJobPersistAttempts === 2) {
                    throw new Error(
                      "workflow job dispatched persistence unavailable",
                    );
                  }

                  return conflictQuery.execute();
                },
              };
            },
          };
        },
      };
    }) as typeof database.writeDatabase.insert;

    await expect(
      Effect.runPromise(
        Effect.flip(
          subscriberJourney.createCheckoutSession({
            planId: "plan_starter",
            priceId: "price_starter_month",
            successUrl: "http://localhost:3002/billing/success",
            cancelUrl: "http://localhost:3002/billing/cancel",
            tenantScope: platformScope.organization,
            tenantScopeId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "WorkflowJobsPostgresRepositoryQueryError",
      operation: "persistWorkflowJob",
    });

    const workflowJob = [...database.workflowJobs.values()].find(
      (job) => job.tenantScopeId === tenantScopeId,
    );

    expect(workflowJob).toMatchObject({
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.stringContaining(
        "WorkflowJobsPostgresRepositoryQueryError",
      ),
      payload: {
        dispatch: {
          scheduledFunctionId: expect.any(String),
          scheduledFunctionIds: expect.arrayContaining([
            expect.stringContaining(":primary"),
          ]),
          primaryScheduled: true,
          scheduledRecoveryAttemptCount:
            workflowJobsScheduledRecoveryAttemptCount,
          expectedRecoveryAttemptCount:
            workflowJobsScheduledRecoveryAttemptCount,
        },
      },
    });
  });

  it("surfaces degraded targeted recovery coverage when follow-up dispatches are missing", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness({
        convexScheduledRecoveryAttemptCount: 0,
      });

    await expect(
      Effect.runPromise(
        subscriberJourney.createCheckoutSession({
          planId: "plan_starter",
          priceId: "price_starter_month",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_degraded_dispatch_coverage",
        }),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: expect.any(String),
    });

    const workflowJob = [...database.workflowJobs.values()].find(
      (job) => job.tenantScopeId === "org_degraded_dispatch_coverage",
    );

    expect(workflowJob).toMatchObject({
      status: workflowJobStatus.scheduled,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.stringContaining(
        `scheduled 0 of ${workflowJobsScheduledRecoveryAttemptCount} targeted follow-up attempts`,
      ),
    });
  });

  it("surfaces degraded targeted recovery coverage when only part of the follow-up coverage is enqueued", async () => {
    const scheduledRecoveryAttemptCount =
      workflowJobsScheduledRecoveryAttemptCount - 1;
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness({
        convexScheduledRecoveryAttemptCount: scheduledRecoveryAttemptCount,
      });

    await expect(
      Effect.runPromise(
        subscriberJourney.createCheckoutSession({
          planId: "plan_starter",
          priceId: "price_starter_month",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_partial_dispatch_coverage",
        }),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: expect.any(String),
    });

    const workflowJob = [...database.workflowJobs.values()].find(
      (job) => job.tenantScopeId === "org_partial_dispatch_coverage",
    );

    expect(workflowJob).toMatchObject({
      status: workflowJobStatus.scheduled,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.stringContaining(
        `scheduled ${scheduledRecoveryAttemptCount} of ${workflowJobsScheduledRecoveryAttemptCount} targeted follow-up attempts`,
      ),
    });
  });

  it("surfaces degraded targeted recovery coverage when the primary deadline cannot be enqueued", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness({
        convexPrimaryScheduled: false,
      });

    await expect(
      Effect.runPromise(
        subscriberJourney.createCheckoutSession({
          planId: "plan_starter",
          priceId: "price_starter_month",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_missing_primary_dispatch",
        }),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: expect.any(String),
    });

    const workflowJob = [...database.workflowJobs.values()].find(
      (job) => job.tenantScopeId === "org_missing_primary_dispatch",
    );

    expect(workflowJob).toMatchObject({
      status: workflowJobStatus.scheduled,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.stringContaining(
        "the primary reconciliation deadline could not be enqueued",
      ),
    });
  });

  it("keeps recovery dispatch failures blocked when a due-job retry cannot be re-enqueued", async () => {
    const convexDispatchError = {
      _tag: "ConvexAdapterRequestError",
      operation: "scheduleBillingReconciliationWorkflowJob",
      cause: new Error("convex unavailable during recovery retry"),
      status: 503,
      body: "convex unavailable during recovery retry",
    } satisfies ConvexAdapterRequestError;
    const { database, scheduledWorkflowDispatches, subscriberJourney } =
      await createSubscriberJourneyHarness({
        convexDispatchErrorOnCall: {
          callNumber: 2,
          error: convexDispatchError,
        },
      });
    const tenantScopeId = "org_due_dispatch_failure";

    await expect(
      Effect.runPromise(
        subscriberJourney.createCheckoutSession({
          planId: "plan_starter",
          priceId: "price_starter_month",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: platformScope.organization,
          tenantScopeId,
        }),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: expect.any(String),
    });

    const results = await Effect.runPromise(
      subscriberJourney.runDueBillingConvergenceJobs({
        now: new Date(Date.now() + 900_000).toISOString(),
      }),
    );

    const workflowJob = [...database.workflowJobs.values()].find(
      (job) => job.tenantScopeId === tenantScopeId,
    );

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: workflowJob?.jobId,
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
        }),
      ]),
    );
    expect(workflowJob).toMatchObject({
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.stringContaining(
        "convex unavailable during recovery retry",
      ),
      completedAt: expect.any(Date),
    });
    expect(scheduledWorkflowDispatches).toHaveLength(1);
  });

  it("repairs missing tenant state from a scheduled reconciliation job without another webhook", async () => {
    const { database, oryKeto, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_due_repair";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_due_repair",
      scopeId: tenantScopeId,
    });

    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: "plan_starter",
        priceId: "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId,
      }),
    );

    database.customerAccounts.set("polar:cus_due_repair", {
      accountId: "polar:cus_due_repair",
      provider: platformAdapterServiceName.polar,
      providerCustomerId: "cus_due_repair",
      actorId: "usr_owner_due_repair",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      status: "active",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
        subscriptionId: "sub_due_repair",
        action: billingWebhookReconciliationAction.activate,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_due_repair",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_due_repair",
        accountId: "polar:cus_due_repair",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: checkout.planId,
        priceId: checkout.priceId,
        status: "active",
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_due_repair",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_due_repair_tenant_management",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.checkoutCreated,
      platformScope.organization,
      tenantScopeId,
      checkout.checkoutSessionId,
    ].join(":");

    const futureNow = new Date(Date.now() + 900_000).toISOString();
    const job = await Effect.runPromise(
      subscriberJourney.runBillingConvergenceJob({
        jobId: workflowJobId,
        now: futureNow,
      }),
    );

    expect(job).toMatchObject({
      jobId: workflowJobId,
      status: workflowJobStatus.completed,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_due_repair",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_due_repair",
      status: tenantOnboardingRunStatus.inProgress,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.completed,
      completedAt: expect.any(Date),
    });
    await expect(
      Effect.runPromise(
        oryKeto.check({
          namespace: authorizationNamespace.tenant,
          object: tenantScopeId,
          relation: authorizationRelation.viewer,
          subject: "usr_owner_due_repair",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      Effect.runPromise(
        subscriberJourney.runBillingConvergenceJob({
          jobId: workflowJobId,
          now: new Date(Date.now() + 1_800_000).toISOString(),
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("uses persisted tenant hierarchy when scheduled reconciliation reads enterprise-owned billing state", async () => {
    const tenantScopeId = "org_due_repair_enterprise";
    const enterpriseId = "ent_due_repair_enterprise";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.enterprise,
      enterpriseId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.enterprise,
      enterpriseId,
    ].join(":");
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness();

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_due_repair_enterprise",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
    });

    database.customerAccounts.set("polar:cus_due_repair_enterprise_stale", {
      accountId: "polar:cus_due_repair_enterprise_stale",
      provider: platformAdapterServiceName.polar,
      providerCustomerId: "cus_due_repair_enterprise_stale",
      actorId: "usr_owner_due_repair_enterprise_stale",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
      status: "active",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
        subscriptionId: "sub_due_repair_enterprise_stale",
        action: billingWebhookReconciliationAction.activate,
      },
      createdAt: new Date(),
      updatedAt: new Date(Date.now() + 60_000),
    });

    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: "plan_starter",
        priceId: "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId,
        enterpriseId,
        organizationId: tenantScopeId,
      }),
    );

    database.customerAccounts.set("polar:cus_due_repair_enterprise", {
      accountId: "polar:cus_due_repair_enterprise",
      provider: platformAdapterServiceName.polar,
      providerCustomerId: "cus_due_repair_enterprise",
      actorId: "usr_owner_due_repair_enterprise",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
      status: "active",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
        subscriptionId: "sub_due_repair_enterprise",
        action: billingWebhookReconciliationAction.activate,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(`${platformScope.enterprise}:${enterpriseId}`, {
      subscriptionId: "sub_due_repair_enterprise",
      provider: platformAdapterServiceName.polar,
      providerSubscriptionId: "sub_due_repair_enterprise",
      accountId: "polar:cus_due_repair_enterprise",
      scope: platformScope.enterprise,
      scopeId: enterpriseId,
      planId: checkout.planId,
      priceId: checkout.priceId,
      status: "active",
      metadata: {
        interval: billingPlanInterval.month,
        customerId: "cus_due_repair_enterprise",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_due_repair_enterprise_org_canceled",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_due_repair_enterprise_org_canceled",
        accountId: "polar:cus_due_repair_enterprise_org_canceled",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: checkout.planId,
        priceId: checkout.priceId,
        status: billingSubscriptionStatus.canceled,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_due_repair_enterprise_org_canceled",
        },
        createdAt: new Date(),
        updatedAt: new Date(Date.now() + 60_000),
      },
    );
    database.entitlements.set(
      [
        platformScope.enterprise,
        enterpriseId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_due_repair_enterprise_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.enterprise,
        scopeId: enterpriseId,
        active: true,
        grantedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.tenantBranding,
        tenantBrandingFeatureFlag.enabled,
      ].join(":"),
      {
        entitlementId: "ent_due_repair_enterprise_branding",
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.checkoutCreated,
      platformScope.organization,
      tenantScopeId,
      checkout.checkoutSessionId,
    ].join(":");

    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      payload: expect.objectContaining({
        enterpriseId,
        organizationId: tenantScopeId,
      }),
    });

    const job = await Effect.runPromise(
      subscriberJourney.runBillingConvergenceJob({
        jobId: workflowJobId,
        now: new Date(Date.now() + 900_000).toISOString(),
      }),
    );

    expect(job).toMatchObject({
      jobId: workflowJobId,
      status: workflowJobStatus.completed,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_due_repair_enterprise",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_due_repair_enterprise",
      status: tenantOnboardingRunStatus.inProgress,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ stepId: "billing" })]),
    );
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ stepId: "branding" }),
      ]),
    );
  });

  it("repairs a missing customer account from an existing subscription during scheduled reconciliation", async () => {
    const tenantScopeId = "org_missing_customer_account_repair";
    const providerCustomerId = "468d3ec3-c42c-493d-9320-3bb831fc898b";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const { database, oryKeto, subscriberJourney } =
      await createSubscriberJourneyHarness({
        polarActiveSubscriptionLookup: {
          externalCustomerId: tenantScopeId,
          customerId: providerCustomerId,
          subscriptionId: "sub_missing_customer_account_repair",
          planId: "plan_starter",
          priceId: "price_starter_month",
        },
      });

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_missing_customer_account_repair",
      scopeId: tenantScopeId,
    });

    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: "plan_starter",
        priceId: "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId,
      }),
    );

    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_missing_customer_account_repair",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_missing_customer_account_repair",
        accountId: [platformAdapterServiceName.polar, providerCustomerId].join(
          ":",
        ),
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: checkout.planId,
        priceId: checkout.priceId,
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: providerCustomerId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.checkoutCreated,
      platformScope.organization,
      tenantScopeId,
      checkout.checkoutSessionId,
    ].join(":");

    await expect(
      Effect.runPromise(
        subscriberJourney.runBillingConvergenceJob({
          jobId: workflowJobId,
          now: new Date(Date.now() + 900_000).toISOString(),
        }),
      ),
    ).resolves.toMatchObject({
      jobId: workflowJobId,
      status: workflowJobStatus.completed,
    });

    expect(
      database.customerAccounts.get(
        [platformAdapterServiceName.polar, providerCustomerId].join(":"),
      ),
    ).toMatchObject({
      providerCustomerId,
      actorId: "usr_owner_missing_customer_account_repair",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_missing_customer_account_repair",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_missing_customer_account_repair",
      status: tenantOnboardingRunStatus.inProgress,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).not.toHaveLength(0);
    await expect(
      Effect.runPromise(
        oryKeto.check({
          namespace: authorizationNamespace.tenant,
          object: tenantScopeId,
          relation: authorizationRelation.viewer,
          subject: "usr_owner_missing_customer_account_repair",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("does not claim billing reconciliation jobs before their scheduled time", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_future_repair_job";

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_future_repair_job",
      scopeId: tenantScopeId,
    });

    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: "plan_starter",
        priceId: "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId,
      }),
    );

    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.checkoutCreated,
      platformScope.organization,
      tenantScopeId,
      checkout.checkoutSessionId,
    ].join(":");

    const scheduledJob = database.workflowJobs.get(workflowJobId);

    expect(scheduledJob).toBeDefined();

    const result = await Effect.runPromise(
      subscriberJourney.runBillingConvergenceJob({
        jobId: workflowJobId,
        now: new Date().toISOString(),
      }),
    );

    expect(result).toBeUndefined();
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      attempts: scheduledJob?.attempts ?? 0,
      scheduledAt: scheduledJob?.scheduledAt,
    });
  });

  it("preserves prior failure diagnostics when reclaiming due workflow jobs", async () => {
    const { database } = await createSubscriberJourneyHarness();
    const now = new Date();
    const jobId = "workflow-jobs:billing-repair:org_clear_claim_diagnostics";

    database.workflowJobs.set(jobId, {
      jobId,
      runtime: "convex",
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_clear_claim_diagnostics",
      attempts: 1,
      scheduledAt: new Date(now.getTime() - 60_000),
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "previous repair failure",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_clear_claim_diagnostics",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_clear_claim_diagnostics",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date(now.getTime() - 120_000),
      updatedAt: new Date(now.getTime() - 60_000),
    });

    const claimedJob =
      await database.workflowJobsQueryable.claimScheduledWorkflowJob(
        jobId,
        now,
      );

    expect(claimedJob).toMatchObject({
      jobId,
      status: workflowJobStatus.running,
      attempts: 2,
      gapReason: null,
      lastError: null,
    });
  });

  it("retries stale running billing reconciliation jobs on the next due sweep", async () => {
    const { database, oryKeto, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_stale_running_repair";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_stale_running_repair",
      scopeId: tenantScopeId,
    });

    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: "plan_starter",
        priceId: "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId,
      }),
    );

    database.customerAccounts.set("polar:cus_stale_running_repair", {
      accountId: "polar:cus_stale_running_repair",
      provider: platformAdapterServiceName.polar,
      providerCustomerId: "cus_stale_running_repair",
      actorId: "usr_owner_stale_running_repair",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      status: "active",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
        subscriptionId: "sub_stale_running_repair",
        action: billingWebhookReconciliationAction.activate,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_stale_running_repair",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_stale_running_repair",
        accountId: "polar:cus_stale_running_repair",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: checkout.planId,
        priceId: checkout.priceId,
        status: "active",
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_stale_running_repair",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_stale_running_repair_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.checkoutCreated,
      platformScope.organization,
      tenantScopeId,
      checkout.checkoutSessionId,
    ].join(":");
    const staleUpdatedAt = new Date(
      Date.now() - (workflowJobsRunningClaimTimeoutSeconds + 60) * 1_000,
    );
    const scheduledJob = database.workflowJobs.get(workflowJobId);

    expect(scheduledJob).toBeDefined();

    database.workflowJobs.set(workflowJobId, {
      ...scheduledJob!,
      status: workflowJobStatus.running,
      attempts: 1,
      gapReason: null,
      lastError: null,
      completedAt: null,
      updatedAt: staleUpdatedAt,
    });

    const jobResults = await Effect.runPromise(
      subscriberJourney.runDueBillingConvergenceJobs({
        now: new Date(Date.now() + 900_000).toISOString(),
      }),
    );

    expect(jobResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: workflowJobId,
          status: workflowJobStatus.completed,
        }),
      ]),
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.completed,
      completedAt: expect.any(Date),
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_stale_running_repair",
      status: tenantProvisioningStatus.provisioned,
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_stale_running_repair",
      status: tenantOnboardingRunStatus.inProgress,
    });
    await expect(
      Effect.runPromise(
        oryKeto.check({
          namespace: authorizationNamespace.tenant,
          object: tenantScopeId,
          relation: authorizationRelation.viewer,
          subject: "usr_owner_stale_running_repair",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("blocks stale running billing reconciliation jobs after exhausting automatic recovery attempts", async () => {
    const { database, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_stale_running_exhausted";
    const now = new Date().toISOString();
    const staleUpdatedAt = subtractSecondsFromDate(
      new Date(now),
      workflowJobsRunningClaimTimeoutSeconds + 60,
    );
    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.periodicSweep,
      platformScope.organization,
      tenantScopeId,
      "stale-exhausted",
    ].join(":");

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: "convex",
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: workflowJobsRetryMaxAttempts + 1,
      scheduledAt: staleUpdatedAt,
      completedAt: null,
      gapReason: null,
      lastError: null,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_stale_running_exhausted",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: subtractSecondsFromDate(staleUpdatedAt, 60),
      updatedAt: staleUpdatedAt,
    });

    const results = await Effect.runPromise(
      subscriberJourney.runDueBillingConvergenceJobs({ now }),
    );

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: workflowJobId,
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
        }),
      ]),
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.repairFailed,
      lastError:
        "Automatic billing reconciliation recovery attempts were exhausted before the job completed.",
      completedAt: expect.any(Date),
    });
  });

  it("rejects malformed now values for due billing convergence sweeps with a parse error", async () => {
    const { subscriberJourney } = await createSubscriberJourneyHarness();

    const error = await Effect.runPromise(
      Effect.flip(
        subscriberJourney.runDueBillingConvergenceJobs({
          now: "not-a-timestamp",
        }),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
  });

  it("rejects parseable non-ISO now values for due billing convergence sweeps with a parse error", async () => {
    const { subscriberJourney } = await createSubscriberJourneyHarness();

    const error = await Effect.runPromise(
      Effect.flip(
        subscriberJourney.runDueBillingConvergenceJobs({
          now: "Tue, 19 Apr 2026 12:00:00 GMT",
        }),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
  });

  it("rejects impossible ISO calendar dates for due billing convergence sweeps with a parse error", async () => {
    const { subscriberJourney } = await createSubscriberJourneyHarness();

    const error = await Effect.runPromise(
      Effect.flip(
        subscriberJourney.runDueBillingConvergenceJobs({
          now: "2026-02-31T12:00:00.000Z",
        }),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
  });

  it("surfaces repair failures as operator-visible workflow gaps instead of stranding jobs", async () => {
    const { adminBilling, database, subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();
    const tenantScopeId = "org_due_repair_gap";

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_due_repair_gap",
      scopeId: tenantScopeId,
    });

    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: "plan_starter",
        priceId: "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId,
      }),
    );

    const workflowJobId = [
      "workflow-jobs",
      "billing-repair",
      workflowJobTrigger.checkoutCreated,
      platformScope.organization,
      tenantScopeId,
      checkout.checkoutSessionId,
    ].join(":");

    database.customerAccounts.set("polar:cus_due_repair_gap", {
      accountId: "polar:cus_due_repair_gap",
      provider: platformAdapterServiceName.polar,
      providerCustomerId: "cus_due_repair_gap",
      actorId: "usr_owner_due_repair_gap",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      status: "active",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
        subscriptionId: "sub_due_repair_gap",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_due_repair_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_due_repair_gap",
        accountId: "polar:cus_due_repair_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: checkout.planId,
        priceId: checkout.priceId,
        status: "active",
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_due_repair_gap",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.entitlements.set(
      [
        platformScope.organization,
        tenantScopeId,
        platformModuleId.billingAndMetering,
        billingAndMeteringFeatureFlag.apiRequests,
      ].join(":"),
      {
        entitlementId: "ent_due_repair_gap_api_requests",
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        active: true,
        grantedAt: new Date(),
      },
    );

    const futureNow = new Date(Date.now() + 900_000).toISOString();
    const jobResults = await Effect.runPromise(
      subscriberJourney.runDueBillingConvergenceJobs({ now: futureNow }),
    );
    const initialCreatedAt =
      database.workflowJobs.get(workflowJobId)?.createdAt;

    expect(jobResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: workflowJobId,
          status: workflowJobStatus.scheduled,
          gapReason: workflowJobGapReason.repairFailed,
        }),
      ]),
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.any(String),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_admin_repair_gap_list",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_admin_repair_gap_list",
          correlationId: "corr_admin_repair_gap_list",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    const repairGaps = await Effect.runPromise(
      adminBilling.listBillingRepairGaps({
        sessionId: "sess_admin_repair_gap_list",
        inspectionReason: "Investigate scheduled tenant repair failures",
      }),
    );

    expect(repairGaps.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: workflowJobId,
          status: workflowJobStatus.scheduled,
          gapReason: workflowJobGapReason.repairFailed,
        }),
      ]),
    );
    const repairGapJob = repairGaps.jobs.find(
      (job) => job.jobId === workflowJobId,
    );

    expect(repairGapJob).toBeDefined();
    expect(repairGapJob).toMatchObject({
      tenantScope: platformScope.organization,
      tenantScopeId,
      lastError: expect.any(String),
    });
    expect(repairGapJob).not.toHaveProperty("deliveryId");
    expect(repairGapJob).not.toHaveProperty("providerCustomerId");
    expect([...database.auditLogEvents.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.workflowJobs}:repair-gaps:lastError`,
          actorId: "usr_platform_operator",
          tenantScope: platformScope.platform,
          tenantScopeId: platformScope.platform,
          reason:
            "Inspect unresolved workflow repair gaps with failure details: Investigate scheduled tenant repair failures",
          correlationId: "corr_admin_repair_gap_list",
        }),
      ]),
    );

    const secondAttemptNow = new Date(
      Date.parse(futureNow) + 16 * 60 * 1_000,
    ).toISOString();
    const thirdAttemptNow = new Date(
      Date.parse(secondAttemptNow) + 16 * 60 * 1_000,
    ).toISOString();
    const fourthAttemptNow = new Date(
      Date.parse(thirdAttemptNow) + 16 * 60 * 1_000,
    ).toISOString();

    await Effect.runPromise(
      subscriberJourney.runDueBillingConvergenceJobs({ now: secondAttemptNow }),
    );
    await Effect.runPromise(
      subscriberJourney.runDueBillingConvergenceJobs({ now: thirdAttemptNow }),
    );
    const blockedJobResults = await Effect.runPromise(
      subscriberJourney.runDueBillingConvergenceJobs({ now: fourthAttemptNow }),
    );

    expect(blockedJobResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: workflowJobId,
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
        }),
      ]),
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.any(String),
      completedAt: expect.any(Date),
    });
    expect(database.workflowJobs.get(workflowJobId)?.createdAt).toEqual(
      initialCreatedAt,
    );

    const blockedRepairGaps = await Effect.runPromise(
      adminBilling.listBillingRepairGaps({
        sessionId: "sess_admin_repair_gap_list",
        inspectionReason: "Investigate blocked tenant repair failures",
      }),
    );
    const blockedRepairGapJob = blockedRepairGaps.jobs.find(
      (job) => job.jobId === workflowJobId,
    );

    expect(blockedRepairGapJob).toMatchObject({
      jobId: workflowJobId,
      tenantScope: platformScope.organization,
      tenantScopeId,
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: expect.any(String),
    });
  });

  it("redacts repair-gap failure details until an inspection reason is supplied", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_repair_gap_reason_gate",
      key: "sub_repair_gap_reason_gate",
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_admin_repair_gap_reason_gate",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_admin_repair_gap_reason_gate",
          correlationId: "corr_admin_repair_gap_reason_gate",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationDeadline,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_repair_gap_reason_gate",
      attempts: 2,
      scheduledAt: new Date("2026-04-20T09:15:00.000Z"),
      completedAt: new Date("2026-04-20T09:20:00.000Z"),
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Provisioning receipt never reconciled.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_repair_gap_reason_gate",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_repair_gap_reason_gate",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T09:10:00.000Z"),
      updatedAt: new Date("2026-04-20T09:20:00.000Z"),
    });

    const redactedRepairGaps = await Effect.runPromise(
      adminBilling.listBillingRepairGaps({
        sessionId: "sess_admin_repair_gap_reason_gate",
      }),
    );
    const redactedRepairGap = redactedRepairGaps.jobs.find(
      (job) => job.jobId === workflowJobId,
    );

    expect(redactedRepairGap).toBeDefined();
    expect(redactedRepairGap).not.toHaveProperty("lastError");
    expect([...database.auditLogEvents.values()]).toEqual([]);

    await expect(
      Effect.runPromise(
        adminBilling.listBillingRepairGaps({
          sessionId: "sess_admin_repair_gap_reason_gate",
          inspectionReason: "Investigate hidden org repair failures",
        }),
      ),
    ).resolves.toEqual({
      jobs: [
        expect.objectContaining({
          jobId: workflowJobId,
          lastError: "Provisioning receipt never reconciled.",
        }),
      ],
    });

    expect([...database.auditLogEvents.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.workflowJobs}:repair-gaps:lastError`,
          reason:
            "Inspect unresolved workflow repair gaps with failure details: Investigate hidden org repair failures",
          correlationId: "corr_admin_repair_gap_reason_gate",
        }),
      ]),
    );
  });

  it("requires an inspection reason before returning billing invoice history", async () => {
    const tenantScopeId = "org_billing_explanation";
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness();

    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_billing_explanation",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "polar_sub_billing_explanation",
        accountId: "polar:cus_billing_explanation",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_scale",
        priceId: "price_scale_month",
        status: billingSubscriptionStatus.pastDue,
        currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
        metadata: {
          interval: billingPlanInterval.month,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-27T08:00:00.000Z"),
      },
    );
    database.paymentEvents.set("evt_billing_explanation_failed", {
      eventId: "evt_billing_explanation_failed",
      provider: platformAdapterServiceName.polar,
      providerEventId: "polar_evt_billing_explanation_failed",
      subscriptionId: "sub_billing_explanation",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
      eventType: billingWebhookEventType.paymentFailed,
      status: billingPaymentEventStatus.failed,
      amountMinor: 4900,
      currency: "USD",
      effectiveAt: new Date("2026-04-27T08:00:00.000Z"),
      payload: {},
      recordedAt: new Date("2026-04-27T08:00:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_billing_explanation",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_billing_explanation",
          correlationId: "corr_billing_explanation",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    const withoutReason = await Effect.runPromise(
      adminBilling.inspectBillingState({
        sessionId: "sess_billing_explanation",
        tenant: {
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          organizationId: tenantScopeId,
        },
      }),
    );

    expect(withoutReason).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        organizationId: tenantScopeId,
      },
      billing: {
        plan: "plan_scale",
        billingInterval: billingPlanInterval.month,
        status: billingSubscriptionStatus.pastDue,
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
      },
    });
    expect(database.auditLogEvents.size).toBe(0);

    const withWhitespaceReason = await Effect.runPromise(
      adminBilling.inspectBillingState({
        sessionId: "sess_billing_explanation",
        tenant: {
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          organizationId: tenantScopeId,
        },
        inspectionReason: "   ",
      }),
    );

    expect(withWhitespaceReason).toEqual(withoutReason);
    expect(database.auditLogEvents.size).toBe(0);

    const withReason = await Effect.runPromise(
      adminBilling.inspectBillingState({
        sessionId: "sess_billing_explanation",
        tenant: {
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          organizationId: tenantScopeId,
        },
        inspectionReason: "Investigate billing payment failures",
      }),
    );

    expect(withReason.billing.invoiceHistory).toEqual([
      expect.objectContaining({
        eventId: "evt_billing_explanation_failed",
        eventType: billingWebhookEventType.paymentFailed,
        status: billingPaymentEventStatus.failed,
      }),
    ]);
    expect([...database.auditLogEvents.values()]).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.fieldSecurity,
        action: fieldSecurityAuditAction.sensitiveRead,
        target: `${platformModuleId.billingAndMetering}:invoiceHistory`,
        reason:
          "Inspect billing invoice history: Investigate billing payment failures",
      }),
    ]);
  });

  it("denies repair gap inspection for support break-glass sessions outside the platform tenant", async () => {
    const { adminBilling, valkey } = await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_support_break_glass_gap_list",
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_operator",
          sessionId: "sess_support_break_glass_gap_list",
          correlationId: "corr_support_break_glass_gap_list",
          reason: "Investigate a tenant billing issue",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_support_break_glass",
          },
          breakGlass: {
            approvedBy: "usr_platform_operator",
            reason: "Investigate a tenant billing issue",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.listBillingRepairGaps({
            sessionId: "sess_support_break_glass_gap_list",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ManagedBillingPlanAccessDeniedError",
      auditRequired: false,
    });
  });

  it("does not append a sensitive-read audit event when repair gaps do not return lastError", async () => {
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_admin_gap_list_without_error",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_admin_gap_list_without_error",
          correlationId: "corr_admin_gap_list_without_error",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    database.workflowJobs.set(
      "workflow-jobs:billing-repair:org_gap_without_error",
      {
        jobId: "workflow-jobs:billing-repair:org_gap_without_error",
        runtime: "convex",
        sourceModuleId: platformModuleId.billingAndMetering,
        kind: workflowJobKind.reconciliationDeadline,
        trigger: workflowJobTrigger.checkoutCreated,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_gap_without_error",
        attempts: 1,
        scheduledAt: new Date(),
        gapReason: workflowJobGapReason.missingCustomerAccount,
        payload: {
          sourceModuleId: platformModuleId.billingAndMetering,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_gap_without_error",
          provider: platformAdapterServiceName.polar,
          correlationId: "corr_gap_without_error",
          trigger: workflowJobTrigger.checkoutCreated,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const repairGaps = await Effect.runPromise(
      adminBilling.listBillingRepairGaps({
        sessionId: "sess_admin_gap_list_without_error",
      }),
    );

    expect(repairGaps.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: "workflow-jobs:billing-repair:org_gap_without_error",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_gap_without_error",
          status: workflowJobStatus.scheduled,
          gapReason: workflowJobGapReason.missingCustomerAccount,
        }),
      ]),
    );
    expect(repairGaps.jobs[0]).not.toHaveProperty("lastError");
    expect([...database.auditLogEvents.values()]).toEqual([]);
  });

  it("lists scheduled retry, blocked, and stale running repair gaps", async () => {
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_admin_gap_list_filtered_statuses",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_admin_gap_list_filtered_statuses",
          correlationId: "corr_admin_gap_list_filtered_statuses",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    database.workflowJobs.set(
      "workflow-jobs:billing-repair:org_gap_scheduled",
      {
        jobId: "workflow-jobs:billing-repair:org_gap_scheduled",
        runtime: "convex",
        sourceModuleId: platformModuleId.billingAndMetering,
        kind: workflowJobKind.reconciliationDeadline,
        trigger: workflowJobTrigger.checkoutCreated,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_gap_scheduled",
        attempts: 1,
        scheduledAt: new Date(),
        gapReason: workflowJobGapReason.missingCustomerAccount,
        payload: {
          sourceModuleId: platformModuleId.billingAndMetering,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_gap_scheduled",
          provider: platformAdapterServiceName.polar,
          correlationId: "corr_gap_scheduled",
          trigger: workflowJobTrigger.checkoutCreated,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    database.workflowJobs.set("workflow-jobs:billing-repair:org_gap_failed", {
      jobId: "workflow-jobs:billing-repair:org_gap_failed",
      runtime: "convex",
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationDeadline,
      trigger: workflowJobTrigger.checkoutCreated,
      status: workflowJobStatus.failed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_gap_failed",
      attempts: 2,
      scheduledAt: new Date(),
      gapReason: workflowJobGapReason.repairFailed,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_gap_failed",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_gap_failed",
        trigger: workflowJobTrigger.checkoutCreated,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.workflowJobs.set(
      "workflow-jobs:billing-repair:org_gap_stale_running",
      {
        jobId: "workflow-jobs:billing-repair:org_gap_stale_running",
        runtime: "convex",
        sourceModuleId: platformModuleId.billingAndMetering,
        kind: workflowJobKind.reconciliationDeadline,
        trigger: workflowJobTrigger.checkoutCreated,
        status: workflowJobStatus.running,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_gap_stale_running",
        attempts: 1,
        scheduledAt: new Date(),
        gapReason: workflowJobGapReason.repairFailed,
        lastError: "stale worker failure",
        payload: {
          sourceModuleId: platformModuleId.billingAndMetering,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_gap_stale_running",
          provider: platformAdapterServiceName.polar,
          correlationId: "corr_gap_stale_running",
          trigger: workflowJobTrigger.checkoutCreated,
        },
        createdAt: new Date(),
        updatedAt: new Date(
          Date.now() - (workflowJobsRunningClaimTimeoutSeconds + 60) * 1_000,
        ),
      },
    );
    database.workflowJobs.set(
      "workflow-jobs:billing-repair:org_gap_fresh_running",
      {
        jobId: "workflow-jobs:billing-repair:org_gap_fresh_running",
        runtime: "convex",
        sourceModuleId: platformModuleId.billingAndMetering,
        kind: workflowJobKind.reconciliationDeadline,
        trigger: workflowJobTrigger.checkoutCreated,
        status: workflowJobStatus.running,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_gap_fresh_running",
        attempts: 1,
        scheduledAt: new Date(),
        gapReason: null,
        payload: {
          sourceModuleId: platformModuleId.billingAndMetering,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_gap_fresh_running",
          provider: platformAdapterServiceName.polar,
          correlationId: "corr_gap_fresh_running",
          trigger: workflowJobTrigger.checkoutCreated,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const repairGaps = await Effect.runPromise(
      adminBilling.listBillingRepairGaps({
        sessionId: "sess_admin_gap_list_filtered_statuses",
        inspectionReason: "Inspect stale running repair failures",
      }),
    );

    expect(repairGaps.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: "workflow-jobs:billing-repair:org_gap_scheduled",
          status: workflowJobStatus.scheduled,
        }),
        expect.objectContaining({
          jobId: "workflow-jobs:billing-repair:org_gap_stale_running",
          status: workflowJobStatus.running,
          gapReason: workflowJobGapReason.repairFailed,
          lastError: "stale worker failure",
        }),
      ]),
    );
    expect(repairGaps.jobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: "workflow-jobs:billing-repair:org_gap_failed",
        }),
        expect.objectContaining({
          jobId: "workflow-jobs:billing-repair:org_gap_fresh_running",
        }),
      ]),
    );
  });

  it("fails closed when the workflow-jobs admin projection is missing", async () => {
    const manifests = platformModuleManifests as PlatformModuleManifest[];
    const workflowJobsIndex = manifests.findIndex(
      (manifest) => manifest.moduleId === platformModuleId.workflowJobs,
    );

    if (workflowJobsIndex < 0) {
      throw new Error("Missing workflow-jobs manifest for projection test.");
    }

    const originalManifest = manifests[workflowJobsIndex]!;
    const updatedManifest: PlatformModuleManifest = {
      ...originalManifest,
      projectionProfiles: originalManifest.projectionProfiles.filter(
        (projection) => projection.profile !== projectionProfile.admin,
      ),
    };
    manifests[workflowJobsIndex] = updatedManifest;

    try {
      try {
        await createSubscriberJourneyHarness();
        throw new Error(
          "Expected subscriber journey harness creation to fail closed.",
        );
      } catch (error) {
        expect(String(error)).toContain(
          '"_tag":"AdminBillingProjectionConfigurationError"',
        );
        expect(String(error)).toContain(
          `"moduleId":"${platformModuleId.workflowJobs}"`,
        );
        expect(String(error)).toContain(
          `"profile":"${projectionProfile.admin}"`,
        );
      }
    } finally {
      manifests[workflowJobsIndex] = originalManifest;
    }
  });

  it("preserves auditRequired when authorization denies a platform-scoped operator", async () => {
    const { adminBilling, valkey } = await createSubscriberJourneyHarness({
      authorizationModuleFactory: () =>
        Effect.succeed({
          listTuples: Effect.succeed([]),
          check: () =>
            Effect.succeed({
              allowed: false,
              cacheKey: "audit-required-platform-deny",
              reason: "No matching authorization tuple was found.",
              auditRequired: true,
            }),
          explain: () =>
            Effect.succeed({
              cacheKey: "audit-required-platform-deny",
              subjectCandidates: [],
              usedBreakGlass: false,
              requestScope: platformScope.platform,
              requestScopeId: platformScope.platform,
            }),
        }),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_platform_operator_authorization_denied",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_platform_operator_authorization_denied",
          correlationId: "corr_platform_operator_authorization_denied",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.listBillingRepairGaps({
            sessionId: "sess_platform_operator_authorization_denied",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ManagedBillingPlanAccessDeniedError",
      auditRequired: true,
    });
  });

  it("repairs missing provisioning and onboarding from prior billing linkage during webhook processing", async () => {
    const { database, oryKeto, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      "org_repair",
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      "org_repair",
    ].join(":");

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_repair",
      scopeId: "org_repair",
    });

    const webhook = await Effect.runPromise(
      subscriberJourney.processBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_repair",
        eventId: "evt_repair",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: new Date().toISOString(),
        verifiedSignature: true,
        subscriptionId: "sub_repair",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_repair",
        planId: "plan_starter",
        priceId: "price_starter_month",
        customerId: "cus_repair",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    expect(webhook.reconciliation.event.deliveryId).toBe("wh_repair");
    expect(database.customerAccounts.get("polar:cus_repair")).toMatchObject({
      actorId: "usr_owner_repair",
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
      },
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_repair",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        source: "billing-webhook.repair",
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_repair",
      status: tenantOnboardingRunStatus.inProgress,
      currentStepId: "team-invites",
      metadata: expect.objectContaining({
        source: "billing-webhook.repair",
        linkageSource: billingCustomerAccountLinkageSource.identitySessionAudit,
      }),
    });
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ stepId: "billing" })]),
    );
    await expect(
      Effect.runPromise(
        oryKeto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_repair",
          relation: authorizationRelation.viewer,
          subject: "usr_owner_repair",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("repairs missing provisioning and onboarding during webhook replay", async () => {
    const { database, oryKeto, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      "org_replay_repair",
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      "org_replay_repair",
    ].join(":");

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_replay_repair",
      scopeId: "org_replay_repair",
    });

    await Effect.runPromise(
      subscriberJourney.processBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_replay_repair",
        eventId: "evt_replay_repair",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: new Date().toISOString(),
        verifiedSignature: true,
        subscriptionId: "sub_replay_repair",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_replay_repair",
        planId: "plan_starter",
        priceId: "price_starter_month",
        customerId: "cus_replay_repair",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    database.provisioningReceipts.delete(provisioningId);
    database.onboardingRuns.delete(onboardingRunId);

    for (const stepKey of [...database.onboardingSteps.keys()]) {
      if (stepKey.startsWith(`${onboardingRunId}:`)) {
        database.onboardingSteps.delete(stepKey);
      }
    }

    const replay = await Effect.runPromise(
      subscriberJourney.replayBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_replay_repair",
      }),
    );

    expect(replay.reconciliation.event.deliveryId).toBe("wh_replay_repair");
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_replay_repair",
      status: tenantProvisioningStatus.provisioned,
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_replay_repair",
      status: tenantOnboardingRunStatus.inProgress,
      currentStepId: "team-invites",
    });
    await expect(
      Effect.runPromise(
        oryKeto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_replay_repair",
          relation: authorizationRelation.viewer,
          subject: "usr_owner_replay_repair",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("retries degraded provisioning and onboarding state during later webhook processing", async () => {
    const { database, oryKeto, subscriberJourney } =
      await createSubscriberJourneyHarness();
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      "org_repair_retry",
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      "org_repair_retry",
    ].join(":");

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_repair_retry",
      scopeId: "org_repair_retry",
    });

    await Effect.runPromise(
      subscriberJourney.processBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_repair_retry_initial",
        eventId: "evt_repair_retry_initial",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: new Date().toISOString(),
        verifiedSignature: true,
        subscriptionId: "sub_repair_retry",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_repair_retry",
        planId: "plan_starter",
        priceId: "price_starter_month",
        customerId: "cus_repair_retry",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    database.provisioningReceipts.set(provisioningId, {
      ...database.provisioningReceipts.get(provisioningId),
      provisioningId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_repair_retry",
      ownerActorId: "usr_owner_repair_retry",
      status: tenantProvisioningStatus.failed,
      metadata: {
        source: "test-degraded-state",
      },
    });
    database.onboardingRuns.set(onboardingRunId, {
      ...database.onboardingRuns.get(onboardingRunId),
      runId: onboardingRunId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_repair_retry",
      triggeredBy: "usr_owner_repair_retry",
      status: tenantOnboardingRunStatus.failed,
      metadata: {
        source: "test-degraded-state",
      },
    });

    const webhook = await Effect.runPromise(
      subscriberJourney.processBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_repair_retry_followup",
        eventId: "evt_repair_retry_followup",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: new Date().toISOString(),
        verifiedSignature: true,
        subscriptionId: "sub_repair_retry",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_repair_retry",
        planId: "plan_starter",
        priceId: "price_starter_month",
        customerId: "cus_repair_retry",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    expect(webhook.reconciliation.event.deliveryId).toBe(
      "wh_repair_retry_followup",
    );
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_repair_retry",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        source: "billing-webhook.repair",
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_repair_retry",
      status: tenantOnboardingRunStatus.inProgress,
      metadata: expect.objectContaining({
        source: "billing-webhook.repair",
      }),
    });
    await expect(
      Effect.runPromise(
        oryKeto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_repair_retry",
          relation: authorizationRelation.viewer,
          subject: "usr_owner_repair_retry",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("allows platform operators to create managed billing plans", async () => {
    const { adminBilling, valkey } = await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_admin_plan_create",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_admin_plan_create",
          correlationId: "corr_admin_plan_create",
          reason: "Create managed recurring plan",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    const result = await Effect.runPromise(
      adminBilling.createManagedBillingPlan({
        sessionId: "sess_admin_plan_create",
        plan: {
          planKey: "scale",
          displayName: "Scale",
          description: "Operator-created recurring plan.",
          visibility: billingPlanVisibility.draft,
          price: {
            interval: billingPlanInterval.month,
            currency: "USD",
            amountMinor: 4900,
          },
          entitlements: [
            {
              moduleId: platformModuleId.tenantManagement,
              included: true,
              meteringMode: billingMeteringMode.none,
              enforcementMode: billingEnforcementMode.none,
            },
          ],
        },
      }),
    );

    expect(result).toMatchObject({
      plan: expect.objectContaining({
        planKey: "scale",
        displayName: "Scale",
      }),
      visibility: billingPlanVisibility.draft,
      provider: platformAdapterServiceName.polar,
    });
  });

  it("denies non-platform sessions from creating managed billing plans", async () => {
    const { adminBilling, valkey } = await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_org_member_plan_create",
        requestContext: {
          actorType: actorType.organizationMember,
          actorId: "usr_member_1",
          sessionId: "sess_org_member_plan_create",
          correlationId: "corr_org_member_plan_create",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
            individualId: "usr_member_1",
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.createManagedBillingPlan({
            sessionId: "sess_org_member_plan_create",
            plan: {
              planKey: "scale",
              displayName: "Scale",
              visibility: billingPlanVisibility.draft,
              price: {
                interval: billingPlanInterval.month,
                currency: "USD",
                amountMinor: 4900,
              },
              entitlements: [
                {
                  moduleId: platformModuleId.tenantManagement,
                  included: true,
                  meteringMode: billingMeteringMode.none,
                  enforcementMode: billingEnforcementMode.none,
                },
              ],
            },
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ManagedBillingPlanAccessDeniedError",
    });
  });

  it("rejects manual reconciliation when the Convex token subject does not match the platform-operator session", async () => {
    const runDueBillingConvergenceJobs = vi.fn(() =>
      Effect.succeed([] satisfies WorkflowJobSummaryList),
    );
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs,
        },
      });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_manual_reconciliation_subject_mismatch",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_manual_reconciliation_subject_mismatch",
          correlationId: "corr_manual_reconciliation_subject_mismatch",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.runManualBillingReconciliation({
            sessionId: "sess_manual_reconciliation_subject_mismatch",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_other_operator",
              actorTypeValue: actorType.platformOperator,
            }),
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
    });

    expect(runDueBillingConvergenceJobs).not.toHaveBeenCalled();
    expect(database.auditLogEvents.size).toBe(0);
  });

  it("rejects manual reconciliation when the Convex token does not carry a platform-operator actor claim", async () => {
    const runDueBillingConvergenceJobs = vi.fn(() =>
      Effect.succeed([] satisfies WorkflowJobSummaryList),
    );
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs,
        },
      });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_manual_reconciliation_actor_claim_mismatch",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_manual_reconciliation_actor_claim_mismatch",
          correlationId: "corr_manual_reconciliation_actor_claim_mismatch",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.runManualBillingReconciliation({
            sessionId: "sess_manual_reconciliation_actor_claim_mismatch",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.serviceActor,
            }),
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
    });

    expect(runDueBillingConvergenceJobs).not.toHaveBeenCalled();
    expect(database.auditLogEvents.size).toBe(0);
  });

  it("runs manual reconciliation when the Convex token is bound to the platform-operator session", async () => {
    const runDueBillingConvergenceJobs = vi.fn(() =>
      Effect.succeed([] satisfies WorkflowJobSummaryList),
    );
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs,
        },
      });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_manual_reconciliation_authorized",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_manual_reconciliation_authorized",
          correlationId: "corr_manual_reconciliation_authorized",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.runManualBillingReconciliation({
          sessionId: "sess_manual_reconciliation_authorized",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          now: "2026-04-20T09:00:00.000Z",
        }),
      ),
    ).resolves.toEqual({ jobs: [] });

    expect(runDueBillingConvergenceJobs).toHaveBeenCalledWith(
      {
        now: "2026-04-20T09:00:00.000Z",
      },
      {
        authToken: expect.any(String),
      },
    );
    expect(database.auditLogEvents.size).toBe(1);
  });

  it("replays blocked billing repair gaps with operator-bound workflow execution", async () => {
    const tenantScopeId = "org_replay_repair_gap";
    const providerCustomerId = "0a2e3ca4-e6aa-4872-a853-39dac14660ea";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_replay_repair_gap",
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        polarActiveSubscriptionLookup: {
          externalCustomerId: tenantScopeId,
          customerId: providerCustomerId,
          subscriptionId: "sub_replay_repair_gap",
          planId: "plan_starter",
          priceId: "price_starter_month",
        },
      });

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_replay_repair_gap",
      scopeId: tenantScopeId,
    });

    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_replay_repair_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_replay_repair_gap",
        accountId: [platformAdapterServiceName.polar, providerCustomerId].join(
          ":",
        ),
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: providerCustomerId,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      lastError: "Missing tenant provisioning receipt.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_replay_repair_gap",
        providerCustomerId,
        subscriptionId: "sub_replay_repair_gap",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_replay_repair_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_replay_repair_gap",
          correlationId: "corr_replay_repair_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.replayBillingRepairGap({
          sessionId: "sess_replay_repair_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          jobId: workflowJobId,
        }),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: workflowJobId,
        status: workflowJobStatus.completed,
        attempts: 2,
      }),
    });

    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.completed,
      attempts: 2,
      gapReason: undefined,
      lastError: undefined,
    });
    expect(
      database.customerAccounts.get(
        [platformAdapterServiceName.polar, providerCustomerId].join(":"),
      ),
    ).toMatchObject({
      providerCustomerId,
      actorId: "usr_owner_replay_repair_gap",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_replay_repair_gap",
      status: tenantProvisioningStatus.provisioned,
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_replay_repair_gap",
      status: tenantOnboardingRunStatus.inProgress,
    });
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).not.toHaveLength(0);
  });

  it("rejects repair-gap replay when the Keycloak identity token is invalid", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_invalid_token",
      key: "sub_replay_repair_gap_invalid_token",
    });
    const runBillingConvergenceJob = vi.fn(() => Effect.succeed(null));
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob,
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.die("Unexpected runDueBillingConvergenceJobs call."),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_invalid_token",
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      lastError: "Missing tenant provisioning receipt.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_replay_repair_gap_invalid_token",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_replay_repair_gap_invalid_token",
        subscriptionId: "sub_replay_repair_gap_invalid_token",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_replay_repair_gap_invalid_token",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_replay_repair_gap_invalid_token",
          correlationId: "corr_replay_repair_gap_invalid_token",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.replayBillingRepairGap({
            sessionId: "sess_replay_repair_gap_invalid_token",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
              keyId: "unexpected-key-id",
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
    });

    expect(runBillingConvergenceJob).not.toHaveBeenCalled();
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.missingProvisioning,
      lastError: "Missing tenant provisioning receipt.",
    });
  });

  it("clears replayed repair-gap failure details once the shared workflow-jobs owner reschedules the job", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_reason_gate",
      key: "sub_replay_repair_gap_reason_gate",
    });
    const runBillingConvergenceJob = vi.fn(() => Effect.succeed(null));
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob,
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.die("Unexpected runDueBillingConvergenceJobs call."),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_reason_gate",
      attempts: 2,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Previous replay attempt failed.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_replay_repair_gap_reason_gate",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_replay_repair_gap_reason_gate",
        subscriptionId: "sub_replay_repair_gap_reason_gate",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:31:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_replay_repair_gap_reason_gate",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_replay_repair_gap_reason_gate",
          correlationId: "corr_replay_repair_gap_reason_gate",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    const redactedReplayResult = await Effect.runPromise(
      adminBilling.replayBillingRepairGap({
        sessionId: "sess_replay_repair_gap_reason_gate",
        convexAuthToken: createKeycloakIdToken({
          sub: "usr_platform_operator",
          actorTypeValue: actorType.platformOperator,
        }),
        jobId: workflowJobId,
      }),
    );

    expect(redactedReplayResult.job).not.toHaveProperty("lastError");
    expect(runBillingConvergenceJob).toHaveBeenCalledTimes(1);
    expect(
      [...database.auditLogEvents.values()].filter(
        (event) => event.moduleId === platformModuleId.fieldSecurity,
      ),
    ).toEqual([]);

    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      gapReason: undefined,
      lastError: undefined,
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.replayBillingRepairGap({
            sessionId: "sess_replay_repair_gap_reason_gate",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            jobId: workflowJobId,
            inspectionReason: "Investigate replayed tenant repair failures",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingRepairGapReplayUnavailableError",
      jobId: workflowJobId,
      status: workflowJobStatus.scheduled,
    });
  });

  it("treats foreign workflow repair gaps as missing for billing compatibility replay", async () => {
    const tenantScopeId = "org_replay_foreign_repair_gap";
    const workflowJobId = buildSearchTenantIndexEnsureWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "search_replay_foreign_repair_gap",
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness();

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Search index ensure failed.",
      payload: {
        sourceModuleId: platformModuleId.search,
        tenantScope: platformScope.organization,
        tenantScopeId,
        correlationId: "corr_replay_foreign_repair_gap",
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:31:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_replay_foreign_repair_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_replay_foreign_repair_gap",
          correlationId: "corr_replay_foreign_repair_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.replayBillingRepairGap({
            sessionId: "sess_replay_foreign_repair_gap",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingRepairGapNotFoundError",
      jobId: workflowJobId,
    });
  });

  it("cancels unresolved repair gaps and keeps canceled periodic sweep jobs out of later manual bootstrap runs", async () => {
    const tenantScopeId = "org_cancel_repair_gap";
    const providerCustomerId = "cus_cancel_repair_gap";
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_cancel_repair_gap",
    });
    const runDueBillingConvergenceJobs = vi.fn(() =>
      Effect.succeed([] as readonly WorkflowJobSummary[]),
    );
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs,
        },
      });

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_cancel_repair_gap",
      scopeId: tenantScopeId,
    });

    database.customerAccounts.set(
      `${platformAdapterServiceName.polar}:${providerCustomerId}`,
      {
        accountId: `${platformAdapterServiceName.polar}:${providerCustomerId}`,
        provider: platformAdapterServiceName.polar,
        providerCustomerId,
        actorId: "usr_owner_cancel_repair_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId: "sub_cancel_repair_gap",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_cancel_repair_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_cancel_repair_gap",
        accountId: `${platformAdapterServiceName.polar}:${providerCustomerId}`,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: providerCustomerId,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );
    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 2,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      lastError: "Missing tenant provisioning receipt.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_repair_gap",
        providerCustomerId,
        subscriptionId: "sub_cancel_repair_gap",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_repair_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_repair_gap",
          correlationId: "corr_cancel_repair_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.cancelBillingRepairGap({
          sessionId: "sess_cancel_repair_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          jobId: workflowJobId,
        }),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: workflowJobId,
        status: workflowJobStatus.canceled,
        gapReason: workflowJobGapReason.missingProvisioning,
        attempts: 2,
      }),
    });

    await expect(
      Effect.runPromise(
        adminBilling.cancelBillingRepairGap({
          sessionId: "sess_cancel_repair_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          jobId: workflowJobId,
        }),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: workflowJobId,
        status: workflowJobStatus.canceled,
        gapReason: workflowJobGapReason.missingProvisioning,
        attempts: 2,
      }),
    });

    await expect(
      Effect.runPromise(
        adminBilling.runManualBillingReconciliation({
          sessionId: "sess_cancel_repair_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          now: "2026-04-20T09:00:00.000Z",
        }),
      ),
    ).resolves.toEqual({ jobs: [] });

    expect(runDueBillingConvergenceJobs).toHaveBeenCalledWith(
      { now: "2026-04-20T09:00:00.000Z" },
      {
        authToken: expect.any(String),
      },
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.canceled,
      attempts: 2,
      gapReason: workflowJobGapReason.missingProvisioning,
    });
    await expect(
      Effect.runPromise(
        adminBilling.listBillingRepairGaps({
          sessionId: "sess_cancel_repair_gap",
        }),
      ),
    ).resolves.toEqual({ jobs: [] });
  });

  it("redacts canceled repair-gap failure details until an inspection reason is supplied", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_cancel_repair_gap_reason_gate",
      key: "sub_cancel_repair_gap_reason_gate",
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness();

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.canceled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_cancel_repair_gap_reason_gate",
      attempts: 2,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      completedAt: new Date("2026-04-20T08:31:00.000Z"),
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Canceled repair gap kept its failure detail.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_cancel_repair_gap_reason_gate",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_repair_gap_reason_gate",
        subscriptionId: "sub_cancel_repair_gap_reason_gate",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:31:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_repair_gap_reason_gate",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_repair_gap_reason_gate",
          correlationId: "corr_cancel_repair_gap_reason_gate",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    const redactedCancelResult = await Effect.runPromise(
      adminBilling.cancelBillingRepairGap({
        sessionId: "sess_cancel_repair_gap_reason_gate",
        convexAuthToken: createKeycloakIdToken({
          sub: "usr_platform_operator",
          actorTypeValue: actorType.platformOperator,
        }),
        jobId: workflowJobId,
      }),
    );

    expect(redactedCancelResult.job).not.toHaveProperty("lastError");
    expect(
      [...database.auditLogEvents.values()].filter(
        (event) => event.moduleId === platformModuleId.fieldSecurity,
      ),
    ).toEqual([]);

    const inspectedCancelResult = await Effect.runPromise(
      adminBilling.cancelBillingRepairGap({
        sessionId: "sess_cancel_repair_gap_reason_gate",
        convexAuthToken: createKeycloakIdToken({
          sub: "usr_platform_operator",
          actorTypeValue: actorType.platformOperator,
        }),
        jobId: workflowJobId,
        inspectionReason: "Investigate canceled tenant repair failures",
      }),
    );

    expect(inspectedCancelResult.job).toMatchObject({
      jobId: workflowJobId,
      lastError: "Canceled repair gap kept its failure detail.",
    });
    expect(
      [...database.auditLogEvents.values()].filter(
        (event) => event.moduleId === platformModuleId.fieldSecurity,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: `${platformModuleId.workflowJobs}:repair-gap:${workflowJobId}:lastError`,
          reason:
            "Inspect canceled workflow repair gap with failure details: Investigate canceled tenant repair failures",
          correlationId: "corr_cancel_repair_gap_reason_gate",
        }),
      ]),
    );
  });

  it("rejects repair-gap cancellation when the Convex token subject does not match the platform-operator session", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_cancel_repair_gap_subject_mismatch",
      key: "sub_cancel_repair_gap_subject_mismatch",
    });
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob:
            cancelScheduledWorkflowJob as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.succeed([] as readonly WorkflowJobSummary[]),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_cancel_repair_gap_subject_mismatch",
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_cancel_repair_gap_subject_mismatch",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_repair_gap_subject_mismatch",
        subscriptionId: "sub_cancel_repair_gap_subject_mismatch",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: {
          scheduledAt: "2026-04-20T08:30:00.000Z",
          scheduledFunctionId: "scheduled-primary",
          scheduledFunctionIds: ["scheduled-primary"],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount: 0,
          expectedRecoveryAttemptCount: 0,
        },
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_repair_gap_subject_mismatch",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_repair_gap_subject_mismatch",
          correlationId: "corr_cancel_repair_gap_subject_mismatch",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.cancelBillingRepairGap({
            sessionId: "sess_cancel_repair_gap_subject_mismatch",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_other_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
    });

    expect(cancelScheduledWorkflowJob).not.toHaveBeenCalled();
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      payload: {
        dispatch: {
          scheduledFunctionId: "scheduled-primary",
        },
      },
    });
  });

  it("rejects repair-gap cancellation when the Keycloak identity token is invalid", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_cancel_repair_gap_invalid_token",
      key: "sub_cancel_repair_gap_invalid_token",
    });
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob:
            cancelScheduledWorkflowJob as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.succeed([] as readonly WorkflowJobSummary[]),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_cancel_repair_gap_invalid_token",
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_cancel_repair_gap_invalid_token",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_repair_gap_invalid_token",
        subscriptionId: "sub_cancel_repair_gap_invalid_token",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: {
          scheduledAt: "2026-04-20T08:30:00.000Z",
          scheduledFunctionId: "scheduled-primary",
          scheduledFunctionIds: ["scheduled-primary"],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount: 0,
          expectedRecoveryAttemptCount: 0,
        },
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_repair_gap_invalid_token",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_repair_gap_invalid_token",
          correlationId: "corr_cancel_repair_gap_invalid_token",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.cancelBillingRepairGap({
            sessionId: "sess_cancel_repair_gap_invalid_token",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
              keyId: "unexpected-key-id",
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
    });

    expect(cancelScheduledWorkflowJob).not.toHaveBeenCalled();
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      payload: {
        dispatch: {
          scheduledFunctionId: "scheduled-primary",
        },
      },
    });
  });

  it("revokes persisted Convex dispatch handles before canceling scheduled repair gaps", async () => {
    const tenantScopeId = "org_cancel_scheduled_repair_gap";
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_cancel_scheduled_repair_gap",
    });
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob:
            cancelScheduledWorkflowJob as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.succeed([] as readonly WorkflowJobSummary[]),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_scheduled_repair_gap",
        subscriptionId: "sub_cancel_scheduled_repair_gap",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: {
          scheduledAt: "2026-04-20T08:30:00.000Z",
          scheduledFunctionId: "scheduled-primary",
          scheduledFunctionIds: [
            "scheduled-primary",
            "scheduled-recovery-1",
            "scheduled-recovery-2",
          ],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount: 2,
          expectedRecoveryAttemptCount: 2,
        },
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_scheduled_repair_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_scheduled_repair_gap",
          correlationId: "corr_cancel_scheduled_repair_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.cancelBillingRepairGap({
          sessionId: "sess_cancel_scheduled_repair_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          jobId: workflowJobId,
        }),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: workflowJobId,
        status: workflowJobStatus.canceled,
        attempts: 1,
        gapReason: workflowJobGapReason.missingProvisioning,
      }),
    });

    expect(cancelScheduledWorkflowJob).toHaveBeenCalledTimes(3);
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      1,
      {
        scheduledFunctionId: "scheduled-primary",
      },
      {
        authToken: expect.any(String),
      },
    );
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      2,
      {
        scheduledFunctionId: "scheduled-recovery-1",
      },
      {
        authToken: expect.any(String),
      },
    );
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      3,
      {
        scheduledFunctionId: "scheduled-recovery-2",
      },
      {
        authToken: expect.any(String),
      },
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.canceled,
    });

    await Effect.runPromise(
      adminBilling.cancelBillingRepairGap({
        sessionId: "sess_cancel_scheduled_repair_gap",
        convexAuthToken: createKeycloakIdToken({
          sub: "usr_platform_operator",
          actorTypeValue: actorType.platformOperator,
        }),
        jobId: workflowJobId,
      }),
    );

    expect(cancelScheduledWorkflowJob).toHaveBeenCalledTimes(3);
  });

  it("revokes persisted Convex dispatch handles before canceling blocked repair gaps", async () => {
    const tenantScopeId = "org_cancel_blocked_repair_gap";
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_cancel_blocked_repair_gap",
    });
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob:
            cancelScheduledWorkflowJob as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.succeed([] as readonly WorkflowJobSummary[]),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      completedAt: new Date("2026-04-20T08:31:00.000Z"),
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "dispatch metadata write failed",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_blocked_repair_gap",
        subscriptionId: "sub_cancel_blocked_repair_gap",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: {
          scheduledAt: "2026-04-20T08:30:00.000Z",
          scheduledFunctionId: "scheduled-primary",
          scheduledFunctionIds: [
            "scheduled-primary",
            "scheduled-recovery-1",
            "scheduled-recovery-2",
          ],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount: 2,
          expectedRecoveryAttemptCount: 2,
        },
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:31:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_blocked_repair_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_blocked_repair_gap",
          correlationId: "corr_cancel_blocked_repair_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.cancelBillingRepairGap({
          sessionId: "sess_cancel_blocked_repair_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          jobId: workflowJobId,
        }),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: workflowJobId,
        status: workflowJobStatus.canceled,
      }),
    });

    expect(cancelScheduledWorkflowJob).toHaveBeenCalledTimes(3);
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      1,
      {
        scheduledFunctionId: "scheduled-primary",
      },
      {
        authToken: expect.any(String),
      },
    );
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      2,
      {
        scheduledFunctionId: "scheduled-recovery-1",
      },
      {
        authToken: expect.any(String),
      },
    );
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      3,
      {
        scheduledFunctionId: "scheduled-recovery-2",
      },
      {
        authToken: expect.any(String),
      },
    );
  });

  it("keeps the workflow row canceled when Convex handle revocation partially fails", async () => {
    const tenantScopeId = "org_cancel_partial_remote_failure";
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_cancel_partial_remote_failure",
    });
    const cancelScheduledWorkflowJobResults = [
      Effect.succeed(null),
      Effect.fail({
        _tag: "ConvexAdapterRequestError",
        operation: "cancelScheduledWorkflowJob",
        cause: new Error("convex cleanup unavailable"),
        status: 503,
        body: "convex cleanup unavailable",
      } as const),
      Effect.succeed(null),
    ] as const;
    let cancelScheduledWorkflowJobCallCount = 0;
    const cancelScheduledWorkflowJob = vi.fn(
      (
        _input: { readonly scheduledFunctionId: string },
        _options?: { readonly authToken?: string },
      ) =>
        cancelScheduledWorkflowJobResults[
          cancelScheduledWorkflowJobCallCount++
        ] ?? Effect.succeed(null),
    ) as MockedFunction<
      AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"]
    >;
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob,
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.succeed([] as readonly WorkflowJobSummary[]),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_partial_remote_failure",
        subscriptionId: "sub_cancel_partial_remote_failure",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: {
          scheduledAt: "2026-04-20T08:30:00.000Z",
          scheduledFunctionId: "scheduled-primary",
          scheduledFunctionIds: [
            "scheduled-primary",
            "scheduled-recovery-1",
            "scheduled-recovery-2",
          ],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount: 2,
          expectedRecoveryAttemptCount: 2,
        },
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_partial_remote_failure",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_partial_remote_failure",
          correlationId: "corr_cancel_partial_remote_failure",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.cancelBillingRepairGap({
          sessionId: "sess_cancel_partial_remote_failure",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          jobId: workflowJobId,
        }),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: workflowJobId,
        status: workflowJobStatus.canceled,
      }),
    });

    expect(cancelScheduledWorkflowJob).toHaveBeenCalledTimes(3);
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.canceled,
    });
  });

  it("does not revoke persisted handles when the cancellation compare-and-swap loses the row update race", async () => {
    const tenantScopeId = "org_cancel_race_lost";
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_cancel_race_lost",
    });
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob:
            cancelScheduledWorkflowJob as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.succeed([] as readonly WorkflowJobSummary[]),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_race_lost",
        subscriptionId: "sub_cancel_race_lost",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: {
          scheduledAt: "2026-04-20T08:30:00.000Z",
          scheduledFunctionId: "scheduled-primary",
          scheduledFunctionIds: ["scheduled-primary", "scheduled-recovery-1"],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount: 1,
          expectedRecoveryAttemptCount: 1,
        },
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });

    const mutableWorkflowJobsQueryable = database.workflowJobsQueryable as {
      cancelWorkflowJobIfUpdatedAtMatches: typeof database.workflowJobsQueryable.cancelWorkflowJobIfUpdatedAtMatches;
    };
    const originalCancelWorkflowJobIfUpdatedAtMatches =
      mutableWorkflowJobsQueryable.cancelWorkflowJobIfUpdatedAtMatches;

    mutableWorkflowJobsQueryable.cancelWorkflowJobIfUpdatedAtMatches = async (
      jobId,
      expectedUpdatedAt,
      canceledAt,
    ) => {
      const workflowJob = database.workflowJobs.get(jobId);

      if (workflowJob !== undefined) {
        database.workflowJobs.set(jobId, {
          ...workflowJob,
          updatedAt: new Date(canceledAt.getTime() + 1_000),
        });
      }

      return originalCancelWorkflowJobIfUpdatedAtMatches(
        jobId,
        expectedUpdatedAt,
        canceledAt,
      );
    };

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_race_lost",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_race_lost",
          correlationId: "corr_cancel_race_lost",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.cancelBillingRepairGap({
            sessionId: "sess_cancel_race_lost",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "AdminBillingRepairGapCancelUnavailableError",
      jobId: workflowJobId,
      status: workflowJobStatus.scheduled,
    });

    expect(cancelScheduledWorkflowJob).not.toHaveBeenCalled();
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
    });
  });

  it("revokes only recovery dispatch handles before canceling stale running repair gaps", async () => {
    const tenantScopeId = "org_cancel_stale_running_repair_gap";
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_cancel_stale_running_repair_gap",
    });
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));
    const staleUpdatedAt = new Date(
      Date.now() - (workflowJobsRunningClaimTimeoutSeconds + 60) * 1_000,
    );
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob:
            cancelScheduledWorkflowJob as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.succeed([] as readonly WorkflowJobSummary[]),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId,
      attempts: 1,
      scheduledAt: new Date("2026-04-20T08:30:00.000Z"),
      gapReason: workflowJobGapReason.missingProvisioning,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId,
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_cancel_stale_running_repair_gap",
        subscriptionId: "sub_cancel_stale_running_repair_gap",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: {
          scheduledAt: "2026-04-20T08:30:00.000Z",
          scheduledFunctionId: "scheduled-primary",
          scheduledFunctionIds: [
            "scheduled-primary",
            "scheduled-recovery-1",
            "scheduled-recovery-2",
          ],
          primaryScheduled: true,
          scheduledRecoveryAttemptCount: 2,
          expectedRecoveryAttemptCount: 2,
        },
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: staleUpdatedAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_cancel_stale_running_repair_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_cancel_stale_running_repair_gap",
          correlationId: "corr_cancel_stale_running_repair_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.cancelBillingRepairGap({
          sessionId: "sess_cancel_stale_running_repair_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          jobId: workflowJobId,
        }),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: workflowJobId,
        status: workflowJobStatus.canceled,
      }),
    });

    expect(cancelScheduledWorkflowJob).toHaveBeenCalledTimes(2);
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      1,
      {
        scheduledFunctionId: "scheduled-recovery-1",
      },
      {
        authToken: expect.any(String),
      },
    );
    expect(cancelScheduledWorkflowJob).toHaveBeenNthCalledWith(
      2,
      {
        scheduledFunctionId: "scheduled-recovery-2",
      },
      {
        authToken: expect.any(String),
      },
    );
  });

  it("restores the original repair-gap state when Convex rejects a replay token", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_unauthorized",
      key: "sub_replay_repair_gap_unauthorized",
    });
    const originalScheduledAt = new Date("2026-04-20T08:30:00.000Z");
    const originalUpdatedAt = new Date("2026-04-20T08:31:00.000Z");
    const runBillingConvergenceJob = vi.fn(() =>
      Effect.fail({
        _tag: "ConvexAdapterRequestError",
        operation: "runBillingConvergenceJob",
        cause: new Error("Unauthorized"),
        status: 401,
        body: "Unauthorized",
      } satisfies ConvexAdapterRequestError),
    );
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob,
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.die("Unexpected runDueBillingConvergenceJobs call."),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_unauthorized",
      attempts: 2,
      scheduledAt: originalScheduledAt,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Previous replay attempt failed.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_replay_repair_gap_unauthorized",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_replay_repair_gap_unauthorized",
        subscriptionId: "sub_replay_repair_gap_unauthorized",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: originalUpdatedAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_replay_repair_gap_unauthorized",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_replay_repair_gap_unauthorized",
          correlationId: "corr_replay_repair_gap_unauthorized",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.replayBillingRepairGap({
            sessionId: "sess_replay_repair_gap_unauthorized",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ConvexAdapterRequestError",
      status: 401,
    });

    expect(runBillingConvergenceJob).toHaveBeenCalledWith(
      { jobId: workflowJobId },
      {
        authToken: expect.any(String),
      },
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.blocked,
      attempts: 2,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Previous replay attempt failed.",
      scheduledAt: originalScheduledAt,
      updatedAt: originalUpdatedAt,
    });
    expect(database.auditLogEvents.size).toBe(0);
  });

  it("restores the original repair-gap dispatch plan when Convex replay transport fails before workflow state changes", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_transport_failure",
      key: "sub_replay_repair_gap_transport_failure",
    });
    const originalScheduledAt = new Date("2026-04-20T08:30:00.000Z");
    const originalUpdatedAt = new Date("2026-04-20T08:31:00.000Z");
    const originalDispatch = {
      scheduledAt: "2026-04-20T08:30:00.000Z",
      scheduledFunctionId: "scheduled-primary",
      scheduledFunctionIds: ["scheduled-primary", "scheduled-recovery-1"],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: 1,
      expectedRecoveryAttemptCount: 1,
    };
    const runBillingConvergenceJob = vi.fn(() =>
      Effect.fail({
        _tag: "ConvexAdapterRequestError",
        operation: "runBillingConvergenceJob",
        cause: new Error("Gateway timeout"),
        status: 502,
        body: "Gateway timeout",
      } satisfies ConvexAdapterRequestError),
    );
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob,
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.die("Unexpected runDueBillingConvergenceJobs call."),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_transport_failure",
      attempts: 2,
      scheduledAt: originalScheduledAt,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Previous replay attempt failed.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_replay_repair_gap_transport_failure",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_replay_repair_gap_transport_failure",
        subscriptionId: "sub_replay_repair_gap_transport_failure",
        trigger: workflowJobTrigger.periodicSweep,
        dispatch: originalDispatch,
      },
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      updatedAt: originalUpdatedAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_replay_repair_gap_transport_failure",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_replay_repair_gap_transport_failure",
          correlationId: "corr_replay_repair_gap_transport_failure",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.replayBillingRepairGap({
            sessionId: "sess_replay_repair_gap_transport_failure",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ConvexAdapterRequestError",
      status: 502,
    });

    expect(runBillingConvergenceJob).toHaveBeenCalledWith(
      { jobId: workflowJobId },
      {
        authToken: expect.any(String),
      },
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      attempts: 2,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Previous replay attempt failed.",
      scheduledAt: originalScheduledAt,
      updatedAt: originalUpdatedAt,
      payload: {
        dispatch: originalDispatch,
      },
    });
    expect(database.auditLogEvents.size).toBe(0);
  });

  it("does not overwrite newer workflow progress when replay rollback loses a race", async () => {
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_race",
      key: "sub_replay_repair_gap_race",
    });
    const originalScheduledAt = new Date("2026-04-20T09:00:00.000Z");
    const originalUpdatedAt = new Date("2026-04-20T09:01:00.000Z");
    const racedCompletionAt = new Date("2026-04-20T09:02:30.000Z");
    let databaseRef:
      | ReturnType<typeof createSubscriberJourneyTestDatabase>
      | undefined;
    const runBillingConvergenceJob = vi.fn(() => {
      const database = databaseRef;

      if (database === undefined) {
        return Effect.die(
          "Expected subscriber journey database for race test.",
        );
      }

      const workflowJob = database.workflowJobs.get(workflowJobId);

      if (workflowJob === undefined) {
        return Effect.die("Expected workflow job state before replay race.");
      }

      database.workflowJobs.set(workflowJobId, {
        jobId: workflowJob.jobId,
        runtime: workflowJob.runtime,
        sourceModuleId: workflowJob.sourceModuleId,
        kind: workflowJob.kind,
        trigger: workflowJob.trigger,
        status: workflowJobStatus.completed,
        tenantScope: workflowJob.tenantScope,
        tenantScopeId: workflowJob.tenantScopeId,
        attempts: (workflowJob.attempts ?? 0) + 1,
        scheduledAt: workflowJob.scheduledAt,
        completedAt: racedCompletionAt,
        payload: workflowJob.payload,
        createdAt: workflowJob.createdAt,
        updatedAt: racedCompletionAt,
      });

      return Effect.fail({
        _tag: "ConvexAdapterRequestError",
        operation: "runBillingConvergenceJob",
        cause: new Error("Unauthorized"),
        status: 401,
        body: "Unauthorized",
      } satisfies ConvexAdapterRequestError);
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob,
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.die("Unexpected runDueBillingConvergenceJobs call."),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    databaseRef = database;

    database.workflowJobs.set(workflowJobId, {
      jobId: workflowJobId,
      runtime: workflowJobRuntime.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.periodicSweep,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_replay_repair_gap_race",
      attempts: 2,
      scheduledAt: originalScheduledAt,
      gapReason: workflowJobGapReason.repairFailed,
      lastError: "Previous replay attempt failed.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_replay_repair_gap_race",
        provider: platformAdapterServiceName.polar,
        correlationId: "corr_replay_repair_gap_race",
        subscriptionId: "sub_replay_repair_gap_race",
        trigger: workflowJobTrigger.periodicSweep,
      },
      createdAt: new Date("2026-04-20T08:45:00.000Z"),
      updatedAt: originalUpdatedAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_replay_repair_gap_race",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_replay_repair_gap_race",
          correlationId: "corr_replay_repair_gap_race",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.replayBillingRepairGap({
            sessionId: "sess_replay_repair_gap_race",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            jobId: workflowJobId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ConvexAdapterRequestError",
      status: 401,
    });

    expect(runBillingConvergenceJob).toHaveBeenCalledWith(
      { jobId: workflowJobId },
      {
        authToken: expect.any(String),
      },
    );
    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.completed,
      attempts: 3,
      completedAt: racedCompletionAt,
      updatedAt: racedCompletionAt,
    });
    expect(database.workflowJobs.get(workflowJobId)).not.toHaveProperty(
      "gapReason",
    );
    expect(database.workflowJobs.get(workflowJobId)).not.toHaveProperty(
      "lastError",
    );
    expect(database.auditLogEvents.size).toBe(0);
  });

  it("surfaces missing onboarding repair gaps when manual reconciliation finds non-billing drift before execution can clear it", async () => {
    const tenantScopeId = "org_manual_reconciliation_missing_onboarding";
    const providerCustomerId = "cus_manual_reconciliation_missing_onboarding";
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_manual_reconciliation_missing_onboarding",
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        workflowExecutionClient: {
          scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
            Effect.die(
              "Unexpected scheduleBillingReconciliationWorkflowJob call.",
            ),
          ) as AuthenticatedConvexWorkflowClient["scheduleBillingReconciliationWorkflowJob"],
          cancelScheduledWorkflowJob: vi.fn(() =>
            Effect.die("Unexpected cancelScheduledWorkflowJob call."),
          ) as AuthenticatedConvexWorkflowClient["cancelScheduledWorkflowJob"],
          runBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected runBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["runBillingConvergenceJob"],
          recoverBillingConvergenceJob: vi.fn(() =>
            Effect.die("Unexpected recoverBillingConvergenceJob call."),
          ) as AuthenticatedConvexWorkflowClient["recoverBillingConvergenceJob"],
          runDueBillingConvergenceJobs: vi.fn(() =>
            Effect.fail({
              _tag: "ConvexAdapterRequestError",
              operation: "runDueBillingConvergenceJobs",
              cause: new Error("Gateway timeout"),
              status: 502,
              body: "Gateway timeout",
            } satisfies ConvexAdapterRequestError),
          ) as AuthenticatedConvexWorkflowClient["runDueBillingConvergenceJobs"],
        },
      });

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_manual_reconciliation_missing_onboarding",
      scopeId: tenantScopeId,
    });

    database.customerAccounts.set(
      `${platformAdapterServiceName.polar}:${providerCustomerId}`,
      {
        accountId: `${platformAdapterServiceName.polar}:${providerCustomerId}`,
        provider: platformAdapterServiceName.polar,
        providerCustomerId,
        actorId: "usr_owner_manual_reconciliation_missing_onboarding",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId: "sub_manual_reconciliation_missing_onboarding",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_manual_reconciliation_missing_onboarding",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_manual_reconciliation_missing_onboarding",
        accountId: `${platformAdapterServiceName.polar}:${providerCustomerId}`,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: providerCustomerId,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );
    database.provisioningReceipts.set(
      ["tenant-provisioning", platformScope.organization, tenantScopeId].join(
        ":",
      ),
      {
        provisioningId: [
          "tenant-provisioning",
          platformScope.organization,
          tenantScopeId,
        ].join(":"),
        tenantScope: platformScope.organization,
        tenantScopeId,
        ownerActorId: "usr_owner_manual_reconciliation_missing_onboarding",
        status: tenantProvisioningStatus.provisioned,
        authorizationTuples: [],
        metadata: {
          source: "test-manual-reconciliation",
        },
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_manual_reconciliation_missing_onboarding",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_manual_reconciliation_missing_onboarding",
          correlationId: "corr_manual_reconciliation_missing_onboarding",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          adminBilling.runManualBillingReconciliation({
            sessionId: "sess_manual_reconciliation_missing_onboarding",
            convexAuthToken: createKeycloakIdToken({
              sub: "usr_platform_operator",
              actorTypeValue: actorType.platformOperator,
            }),
            now: "2026-04-20T09:00:00.000Z",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ConvexAdapterRequestError",
      status: 502,
    });

    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.scheduled,
      gapReason: workflowJobGapReason.missingOnboarding,
      tenantScope: platformScope.organization,
      tenantScopeId,
    });
    await expect(
      Effect.runPromise(
        adminBilling.listBillingRepairGaps({
          sessionId: "sess_manual_reconciliation_missing_onboarding",
        }),
      ),
    ).resolves.toEqual({
      jobs: [
        expect.objectContaining({
          jobId: workflowJobId,
          status: workflowJobStatus.scheduled,
          gapReason: workflowJobGapReason.missingOnboarding,
        }),
      ],
    });
  });

  it("bootstraps and repairs hidden billing gaps during manual reconciliation", async () => {
    const tenantScopeId = "org_manual_reconciliation_hidden_gap";
    const providerCustomerId = "468d3ec3-c42c-493d-9320-3bb831fc898b";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_manual_reconciliation_hidden_gap",
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness({
        polarActiveSubscriptionLookup: {
          externalCustomerId: tenantScopeId,
          customerId: providerCustomerId,
          subscriptionId: "sub_manual_reconciliation_hidden_gap",
          planId: "plan_starter",
          priceId: "price_starter_month",
        },
      });

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_manual_reconciliation_hidden_gap",
      scopeId: tenantScopeId,
    });

    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_manual_reconciliation_hidden_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_manual_reconciliation_hidden_gap",
        accountId: [platformAdapterServiceName.polar, providerCustomerId].join(
          ":",
        ),
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: providerCustomerId,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );

    expect(database.workflowJobs.size).toBe(0);

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_manual_reconciliation_hidden_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_manual_reconciliation_hidden_gap",
          correlationId: "corr_manual_reconciliation_hidden_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.runManualBillingReconciliation({
          sessionId: "sess_manual_reconciliation_hidden_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          now: "2026-04-20T09:00:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      jobs: [
        expect.objectContaining({
          jobId: workflowJobId,
          tenantScope: platformScope.organization,
          tenantScopeId,
          status: workflowJobStatus.completed,
        }),
      ],
    });

    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.completed,
      trigger: workflowJobTrigger.periodicSweep,
    });
    expect(
      database.customerAccounts.get(
        [platformAdapterServiceName.polar, providerCustomerId].join(":"),
      ),
    ).toMatchObject({
      providerCustomerId,
      actorId: "usr_owner_manual_reconciliation_hidden_gap",
      scope: platformScope.organization,
      scopeId: tenantScopeId,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_manual_reconciliation_hidden_gap",
      status: tenantProvisioningStatus.provisioned,
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_manual_reconciliation_hidden_gap",
      status: tenantOnboardingRunStatus.inProgress,
    });
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).not.toHaveLength(0);
  });

  it("repairs failed provisioning and onboarding during manual reconciliation", async () => {
    const tenantScopeId = "org_manual_reconciliation_failed_gap";
    const provisioningId = [
      "tenant-provisioning",
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const onboardingRunId = [
      identitySessionRunIdPrefix.tenantOnboarding,
      platformScope.organization,
      tenantScopeId,
    ].join(":");
    const workflowJobId = buildBillingReconciliationWorkflowJobId({
      trigger: workflowJobTrigger.periodicSweep,
      tenantScope: platformScope.organization,
      tenantScopeId,
      key: "sub_manual_reconciliation_failed_gap",
    });
    const { adminBilling, database, valkey } =
      await createSubscriberJourneyHarness();

    seedAuthCallbackEvidence({
      database,
      actorId: "usr_owner_manual_reconciliation_failed_gap",
      scopeId: tenantScopeId,
    });

    database.customerAccounts.set(
      "polar:cus_manual_reconciliation_failed_gap",
      {
        accountId: "polar:cus_manual_reconciliation_failed_gap",
        provider: platformAdapterServiceName.polar,
        providerCustomerId: "cus_manual_reconciliation_failed_gap",
        actorId: "usr_owner_manual_reconciliation_failed_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        status: "active",
        metadata: {
          linkageSource:
            billingCustomerAccountLinkageSource.identitySessionAudit,
          subscriptionId: "sub_manual_reconciliation_failed_gap",
          action: billingWebhookReconciliationAction.activate,
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );
    database.subscriptions.set(
      `${platformScope.organization}:${tenantScopeId}`,
      {
        subscriptionId: "sub_manual_reconciliation_failed_gap",
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: "sub_manual_reconciliation_failed_gap",
        accountId: "polar:cus_manual_reconciliation_failed_gap",
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        metadata: {
          interval: billingPlanInterval.month,
          customerId: "cus_manual_reconciliation_failed_gap",
        },
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        updatedAt: new Date("2026-04-20T08:30:00.000Z"),
      },
    );
    database.provisioningReceipts.set(provisioningId, {
      provisioningId,
      tenantScope: platformScope.organization,
      tenantScopeId,
      ownerActorId: "usr_owner_manual_reconciliation_failed_gap",
      status: tenantProvisioningStatus.failed,
      authorizationTuples: [],
      metadata: {
        source: "test-failed-state",
      },
      updatedAt: new Date("2026-04-20T08:30:00.000Z"),
    });
    database.onboardingRuns.set(onboardingRunId, {
      runId: onboardingRunId,
      tenantScope: platformScope.organization,
      tenantScopeId,
      triggeredBy: "usr_owner_manual_reconciliation_failed_gap",
      correlationId: "corr_manual_reconciliation_failed_gap_initial",
      status: tenantOnboardingRunStatus.failed,
      currentStepId: "billing",
      metadata: {
        source: "test-failed-state",
      },
      startedAt: new Date("2026-04-20T08:00:00.000Z"),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_manual_reconciliation_failed_gap",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_manual_reconciliation_failed_gap",
          correlationId: "corr_manual_reconciliation_failed_gap",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        adminBilling.runManualBillingReconciliation({
          sessionId: "sess_manual_reconciliation_failed_gap",
          convexAuthToken: createKeycloakIdToken({
            sub: "usr_platform_operator",
            actorTypeValue: actorType.platformOperator,
          }),
          now: "2026-04-20T09:00:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      jobs: [
        expect.objectContaining({
          jobId: workflowJobId,
          tenantScope: platformScope.organization,
          tenantScopeId,
          status: workflowJobStatus.completed,
        }),
      ],
    });

    expect(database.workflowJobs.get(workflowJobId)).toMatchObject({
      status: workflowJobStatus.completed,
      trigger: workflowJobTrigger.periodicSweep,
    });
    expect(database.provisioningReceipts.get(provisioningId)).toMatchObject({
      ownerActorId: "usr_owner_manual_reconciliation_failed_gap",
      status: tenantProvisioningStatus.provisioned,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(database.onboardingRuns.get(onboardingRunId)).toMatchObject({
      triggeredBy: "usr_owner_manual_reconciliation_failed_gap",
      status: tenantOnboardingRunStatus.inProgress,
      metadata: expect.objectContaining({
        source: "workflow-jobs.repair",
      }),
    });
    expect(
      [...database.onboardingSteps.values()].filter(
        (step) => step.runId === onboardingRunId,
      ),
    ).not.toHaveLength(0);
  });
});
