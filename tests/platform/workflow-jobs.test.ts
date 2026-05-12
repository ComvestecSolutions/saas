import { Effect } from "effect";
import {
  actorType,
  emailDeliveryTemplateId,
  fieldSecurityAuditAction,
  identityClaimKey,
  importExportJobFormat,
  importExportJobSource,
  notificationCenterChannel,
  platformModuleId,
  platformScope,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  workflowJobsAuditAction,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  IdentitySessionModule,
  type AuditLogModuleService,
  type IdentitySessionModuleService,
  type NotificationCenterEmailDigestWorkflowJobRecord,
  type WorkflowJobRecord,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  workflowJobRuntime,
} from "@comvestec/modules";
import { makeWorkflowJobsService } from "@comvestec/platform";

const platformOperatorRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator_1",
  sessionId: "sess_platform_operator_1",
  correlationId: "corr_workflow_jobs_1",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const previousSearchOperatorRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator_previous",
  sessionId: "sess_platform_operator_previous",
  correlationId: "corr_workflow_jobs_previous",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const previousNotificationCenterTenantRequestContext: RequestContext = {
  actorType: actorType.organizationMember,
  actorId: "usr_org_member_previous",
  sessionId: "sess_org_member_previous",
  correlationId: "corr_notification_center_previous",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
  },
};

const searchTenantIndexSettings = {
  filterableAttributes: ["tenantScopeId"],
  sortableAttributes: ["updatedAt"],
  searchableAttributes: ["name"],
  rankingRules: ["words", "typo"],
  synonyms: {
    invoice: ["bill", "statement"],
  },
} as const;

const platformOperatorSessionId = "sess_platform_operator_1";

const unexpectedWorkflowJobsEffect = <A>() =>
  Effect.die(new Error("Unexpected workflow-jobs dependency call."));

const createIdentitySessionModuleDouble = (
  requestContext = platformOperatorRequestContext,
): IdentitySessionModuleService => ({
  startAuthentication: () => unexpectedWorkflowJobsEffect(),
  completeAuthentication: () => unexpectedWorkflowJobsEffect(),
  invalidateSession: () => unexpectedWorkflowJobsEffect(),
  resolveRequestContext: () => Effect.succeed(requestContext),
});

const createAuditLogModuleDouble = () => {
  const calls: Array<Parameters<AuditLogModuleService["append"]>[0]> = [];

  const service: AuditLogModuleService = {
    append: (input) => {
      calls.push(input);

      return Effect.succeed({
        eventId: `${input.moduleId}:${input.action}:${input.target}`,
        timestamp: "2026-05-03T18:10:00.000Z",
        actorId: input.requestContext.actorId ?? "anonymous",
        tenantScope: input.requestContext.tenant.scope,
        tenantScopeId: input.requestContext.tenant.scopeId,
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        correlationId: input.requestContext.correlationId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };

  return { calls, service };
};

const createWorkflowJobsRepositoryDouble = (overrides: {
  readonly persistWorkflowJob?: WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>["persistWorkflowJob"];
  readonly getWorkflowJob?: WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>["getWorkflowJob"];
  readonly restoreWorkflowJobIfUpdatedAtMatches?: WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>["restoreWorkflowJobIfUpdatedAtMatches"];
  readonly cancelWorkflowJobIfUpdatedAtMatches?: WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>["cancelWorkflowJobIfUpdatedAtMatches"];
  readonly listRepairGapWorkflowJobs?: WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>["listRepairGapWorkflowJobs"];
}) =>
  ({
    persistWorkflowJob:
      overrides.persistWorkflowJob ?? (() => unexpectedWorkflowJobsEffect()),
    getWorkflowJob:
      overrides.getWorkflowJob ?? (() => unexpectedWorkflowJobsEffect()),
    claimScheduledWorkflowJob: () => unexpectedWorkflowJobsEffect(),
    restoreWorkflowJobIfUpdatedAtMatches:
      overrides.restoreWorkflowJobIfUpdatedAtMatches ??
      (() => unexpectedWorkflowJobsEffect()),
    cancelWorkflowJobIfUpdatedAtMatches:
      overrides.cancelWorkflowJobIfUpdatedAtMatches ??
      (() => unexpectedWorkflowJobsEffect()),
    listDueWorkflowJobs: () => unexpectedWorkflowJobsEffect(),
    listRepairGapWorkflowJobs:
      overrides.listRepairGapWorkflowJobs ??
      (() => unexpectedWorkflowJobsEffect()),
  }) satisfies WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>;

const createAuthorizationCheck = (allowed = true) =>
  vi.fn(() =>
    Effect.succeed({
      allowed,
      cacheKey: `${platformModuleId.workflowJobs}:admin`,
      reason: allowed ? "allowed" : "denied",
      auditRequired: false,
    }),
  );

type WorkflowExecutionClientDouble = NonNullable<
  Parameters<typeof makeWorkflowJobsService>[0]["workflowExecutionClient"]
>;

const createWorkflowExecutionClientDouble = (
  overrides?: Partial<WorkflowExecutionClientDouble>,
): WorkflowExecutionClientDouble => ({
  cancelScheduledWorkflowJob:
    overrides?.cancelScheduledWorkflowJob ?? (() => Effect.succeed(null)),
  runBillingConvergenceJob:
    overrides?.runBillingConvergenceJob ?? (() => Effect.succeed(null)),
  runImportExportSupportCaseSummaryWorkflowJob:
    overrides?.runImportExportSupportCaseSummaryWorkflowJob ??
    (() => Effect.succeed(null)),
  runNotificationCenterEmailDigestWorkflowJob:
    overrides?.runNotificationCenterEmailDigestWorkflowJob ??
    (() => Effect.succeed(null)),
  runSearchTenantIndexEnsureWorkflowJob:
    overrides?.runSearchTenantIndexEnsureWorkflowJob ??
    (() => Effect.succeed(null)),
  runWebhookOutboundDeliveryWorkflowJob:
    overrides?.runWebhookOutboundDeliveryWorkflowJob ??
    (() => Effect.succeed(null)),
  runTenantInvitationReminderWorkflowJob:
    overrides?.runTenantInvitationReminderWorkflowJob ??
    (() => Effect.succeed(null)),
  runTenantInvitationExpiryNotificationWorkflowJob:
    overrides?.runTenantInvitationExpiryNotificationWorkflowJob ??
    (() => Effect.succeed(null)),
});

const createConvexAuthToken = (subject: string) => {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      [identityClaimKey.actorType]: actorType.platformOperator,
    }),
  ).toString("base64url");

  return `${header}.${payload}.signature`;
};

const searchRepairGapJob: WorkflowJobRecord = {
  jobId: "job_search_gap_1",
  runtime: workflowJobRuntime.convex,
  sourceModuleId: platformModuleId.search,
  kind: workflowJobKind.searchIndexEnsure,
  trigger: workflowJobTrigger.operatorRequested,
  status: workflowJobStatus.blocked,
  tenantScope: platformScope.organization,
  tenantScopeId: "org_1",
  attempts: 2,
  scheduledAt: "2026-05-03T18:00:00.000Z",
  gapReason: workflowJobGapReason.repairFailed,
  lastError: "Search index ensure failed.",
  payload: {
    sourceModuleId: platformModuleId.search,
    tenantScope: platformScope.organization,
    tenantScopeId: "org_1",
    requestContext: previousSearchOperatorRequestContext,
    actorId: previousSearchOperatorRequestContext.actorId,
    correlationId: previousSearchOperatorRequestContext.correlationId,
    settings: searchTenantIndexSettings,
    dispatch: {
      scheduledAt: "2026-05-03T18:00:00.000Z",
      scheduledFunctionId: "sched_search_gap_1",
      scheduledFunctionIds: ["sched_search_gap_1", "sched_search_gap_2"],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: 0,
      expectedRecoveryAttemptCount: 1,
    },
  },
  createdAt: "2026-05-03T18:00:00.000Z",
  updatedAt: "2026-05-03T18:05:00.000Z",
};

const webhookRepairGapJob: WorkflowJobRecord = {
  jobId: "job_webhook_gap_1",
  runtime: workflowJobRuntime.convex,
  sourceModuleId: platformModuleId.webhooksApiAccess,
  kind: workflowJobKind.webhookOutboundDelivery,
  trigger: workflowJobTrigger.operatorRequested,
  status: workflowJobStatus.blocked,
  tenantScope: platformScope.organization,
  tenantScopeId: "org_1",
  attempts: 2,
  scheduledAt: "2026-05-03T18:20:00.000Z",
  gapReason: workflowJobGapReason.repairFailed,
  lastError: "Webhook delivery failed.",
  payload: {
    sourceModuleId: platformModuleId.webhooksApiAccess,
    tenantScope: platformScope.organization,
    tenantScopeId: "org_1",
    requestContext: previousSearchOperatorRequestContext,
    actorId: previousSearchOperatorRequestContext.actorId,
    correlationId: previousSearchOperatorRequestContext.correlationId,
    subscriptionId: "webhook-subscription:organization:org_1:1",
    deliveryId: "webhook-outbound-delivery:organization:org_1:1",
    eventType: "billing.subscription.activated",
    payload: '{"subscriptionId":"sub_123"}',
    maxAttempts: 4,
    dispatch: {
      scheduledAt: "2026-05-03T18:20:00.000Z",
      scheduledFunctionId: "sched_webhook_gap_1",
      scheduledFunctionIds: ["sched_webhook_gap_1"],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: 0,
      expectedRecoveryAttemptCount: 1,
    },
  },
  createdAt: "2026-05-03T18:20:00.000Z",
  updatedAt: "2026-05-03T18:21:00.000Z",
};

const importExportSupportCaseRepairGapJob: WorkflowJobRecord = {
  jobId: "job_import_export_support_case_gap_1",
  runtime: workflowJobRuntime.convex,
  sourceModuleId: platformModuleId.importExport,
  kind: workflowJobKind.importExportSupportCaseSummary,
  trigger: workflowJobTrigger.operatorRequested,
  status: workflowJobStatus.blocked,
  tenantScope: platformScope.organization,
  tenantScopeId: "org_1",
  attempts: 1,
  scheduledAt: "2026-05-03T18:40:00.000Z",
  gapReason: workflowJobGapReason.repairFailed,
  lastError: "Import-export support-case summary failed.",
  payload: {
    sourceModuleId: platformModuleId.importExport,
    tenantScope: platformScope.organization,
    tenantScopeId: "org_1",
    requestContext: previousSearchOperatorRequestContext,
    actorId: previousSearchOperatorRequestContext.actorId,
    correlationId: previousSearchOperatorRequestContext.correlationId,
    source: importExportJobSource.supportCaseSummaryJson,
    format: importExportJobFormat.json,
    dispatch: {
      scheduledAt: "2026-05-03T18:40:00.000Z",
      scheduledFunctionId: "sched_import_export_support_case_gap_1",
      scheduledFunctionIds: ["sched_import_export_support_case_gap_1"],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: 0,
      expectedRecoveryAttemptCount: 1,
    },
  },
  createdAt: "2026-05-03T18:40:00.000Z",
  updatedAt: "2026-05-03T18:41:00.000Z",
};

const notificationCenterDigestRepairGapJob: NotificationCenterEmailDigestWorkflowJobRecord =
  {
    jobId: "job_notification_center_digest_gap_1",
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.notificationCenter,
    kind: workflowJobKind.notificationCenterEmailDigest,
    trigger: workflowJobTrigger.moduleEvent,
    status: workflowJobStatus.blocked,
    tenantScope: platformScope.organization,
    tenantScopeId: "org_1",
    attempts: 1,
    scheduledAt: "2026-05-03T18:30:00.000Z",
    gapReason: workflowJobGapReason.repairFailed,
    lastError: "Notification-center digest scheduling failed.",
    payload: {
      sourceModuleId: platformModuleId.notificationCenter,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      requestContext: previousNotificationCenterTenantRequestContext,
      actorId: previousNotificationCenterTenantRequestContext.actorId,
      correlationId:
        previousNotificationCenterTenantRequestContext.correlationId,
      digestRunId:
        "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-03T18:45:00.000Z",
      recipient: "customer@example.com",
      channel: notificationCenterChannel.email,
      template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
      dispatch: {
        scheduledAt: "2026-05-03T18:30:00.000Z",
        scheduledFunctionId: "sched_notification_center_digest_gap_1",
        scheduledFunctionIds: ["sched_notification_center_digest_gap_1"],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 0,
        expectedRecoveryAttemptCount: 1,
      },
    },
    createdAt: "2026-05-03T18:30:00.000Z",
    updatedAt: "2026-05-03T18:31:00.000Z",
  };

const billingRepairGapPayload = {
  sourceModuleId: platformModuleId.billingAndMetering,
  tenantScope: platformScope.organization,
  tenantScopeId: "org_1",
  organizationId: "org_1",
  actorId: previousSearchOperatorRequestContext.actorId,
  provider: "polar",
  correlationId: previousSearchOperatorRequestContext.correlationId,
  trigger: workflowJobTrigger.operatorRequested,
  dispatch: {
    scheduledAt: "2026-05-03T17:00:00.000Z",
    scheduledFunctionId: "sched_billing_gap_1",
    scheduledFunctionIds: ["sched_billing_gap_1"],
    primaryScheduled: true,
    scheduledRecoveryAttemptCount: 0,
    expectedRecoveryAttemptCount: 1,
  },
} as const;

const billingRepairGapJob: WorkflowJobRecord = {
  jobId: "job_billing_gap_1",
  runtime: workflowJobRuntime.convex,
  sourceModuleId: platformModuleId.billingAndMetering,
  kind: workflowJobKind.reconciliationSweep,
  trigger: workflowJobTrigger.operatorRequested,
  status: workflowJobStatus.blocked,
  tenantScope: platformScope.organization,
  tenantScopeId: "org_1",
  attempts: 1,
  scheduledAt: "2026-05-03T17:00:00.000Z",
  gapReason: workflowJobGapReason.missingSubscriptionState,
  lastError: "Billing reconciliation failed.",
  payload: billingRepairGapPayload,
  createdAt: "2026-05-03T17:00:00.000Z",
  updatedAt: "2026-05-03T17:05:00.000Z",
};

describe("platform workflow-jobs service", () => {
  it("lists module repair gaps and redacts failure details without an inspection reason", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const repositoryCalls: Array<
      Parameters<
        WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>["listRepairGapWorkflowJobs"]
      >[0]
    > = [];

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          listRepairGapWorkflowJobs: (input) => {
            repositoryCalls.push(input);

            return Effect.succeed([searchRepairGapJob]);
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.listRepairGaps({
            sessionId: platformOperatorSessionId,
            sourceModuleId: platformModuleId.search,
          }),
        ),
      ),
    );

    expect(result).toEqual({
      jobs: [
        {
          jobId: searchRepairGapJob.jobId,
          sourceModuleId: platformModuleId.search,
          kind: workflowJobKind.searchIndexEnsure,
          trigger: workflowJobTrigger.operatorRequested,
          status: workflowJobStatus.blocked,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          attempts: 2,
          scheduledAt: "2026-05-03T18:00:00.000Z",
          gapReason: workflowJobGapReason.repairFailed,
        },
      ],
    });
    expect(repositoryCalls).toEqual([
      { sourceModuleId: platformModuleId.search },
    ]);
    expect(authorizationCheck).toHaveBeenCalledTimes(1);
    expect(auditCalls).toEqual([]);
  });

  it("audits sensitive workflow failure reads when an inspection reason is supplied", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          listRepairGapWorkflowJobs: () => Effect.succeed([searchRepairGapJob]),
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.listRepairGaps({
            sessionId: platformOperatorSessionId,
            sourceModuleId: platformModuleId.search,
            inspectionReason: "investigate replay failure",
          }),
        ),
      ),
    );

    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        lastError: "Search index ensure failed.",
      }),
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.fieldSecurity,
        action: fieldSecurityAuditAction.sensitiveRead,
        target: `${platformModuleId.workflowJobs}:${platformModuleId.search}:repair-gaps:lastError`,
        reason:
          "Inspect unresolved workflow repair gaps with failure details: investigate replay failure",
      }),
    ]);
  });

  it("cancels workflow repair gaps through the shared workflow-jobs owner surface", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));
    const validateWorkflowExecutionIdentity = vi.fn(() => Effect.void);
    const canceledJob: WorkflowJobRecord = {
      ...searchRepairGapJob,
      status: workflowJobStatus.canceled,
      completedAt: "2026-05-03T18:10:00.000Z",
      updatedAt: "2026-05-03T18:10:00.000Z",
    };

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(searchRepairGapJob),
          cancelWorkflowJobIfUpdatedAtMatches: () =>
            Effect.succeed(canceledJob),
        }),
        workflowExecutionClient: {
          ...createWorkflowExecutionClientDouble({
            cancelScheduledWorkflowJob,
          }),
        },
        validateWorkflowExecutionIdentity,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.cancelRepairGap({
            sessionId: platformOperatorSessionId,
            jobId: searchRepairGapJob.jobId,
            convexAuthToken: createConvexAuthToken(
              platformOperatorRequestContext.actorId ?? "",
            ),
          }),
        ),
      ),
    );

    expect(result).toEqual({
      job: {
        jobId: canceledJob.jobId,
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.canceled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 2,
        scheduledAt: "2026-05-03T18:00:00.000Z",
        completedAt: "2026-05-03T18:10:00.000Z",
        gapReason: workflowJobGapReason.repairFailed,
      },
    });
    expect(validateWorkflowExecutionIdentity).toHaveBeenCalledWith({
      requestContext: platformOperatorRequestContext,
      convexAuthToken: createConvexAuthToken(
        platformOperatorRequestContext.actorId ?? "",
      ),
    });
    expect(cancelScheduledWorkflowJob).toHaveBeenCalledTimes(2);
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapCanceled,
        target: `${platformModuleId.workflowJobs}:${searchRepairGapJob.jobId}:repair-gap-cancel`,
      }),
    ]);
  });

  it("rejects workflow repair-gap cancellation before durable mutation when the workflow token provenance is invalid", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { service: auditLog } = createAuditLogModuleDouble();
    const getWorkflowJob = vi.fn(() => Effect.succeed(searchRepairGapJob));
    const cancelWorkflowJobIfUpdatedAtMatches = vi.fn(() =>
      Effect.succeed(searchRepairGapJob),
    );
    const cancelScheduledWorkflowJob = vi.fn(() => Effect.succeed(null));

    await expect(
      Effect.runPromise(
        makeWorkflowJobsService({
          authorization: { check: authorizationCheck },
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob,
            cancelWorkflowJobIfUpdatedAtMatches,
          }),
          workflowExecutionClient: {
            ...createWorkflowExecutionClientDouble({
              cancelScheduledWorkflowJob,
            }),
          },
          validateWorkflowExecutionIdentity: () =>
            Effect.fail({
              _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
              reason:
                "Authenticated workflow execution requires a valid platform-operator Keycloak identity token.",
            } as const),
        }).pipe(
          Effect.provideService(AuditLogModule, auditLog),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionModuleDouble(),
          ),
          Effect.flatMap((service) =>
            service.cancelRepairGap({
              sessionId: platformOperatorSessionId,
              jobId: searchRepairGapJob.jobId,
              convexAuthToken: createConvexAuthToken(
                platformOperatorRequestContext.actorId ?? "",
              ),
            }),
          ),
        ),
      ),
    ).rejects.toThrow("WorkflowJobsWorkflowExecutionIdentityMismatchError");

    expect(getWorkflowJob).not.toHaveBeenCalled();
    expect(cancelWorkflowJobIfUpdatedAtMatches).not.toHaveBeenCalled();
    expect(cancelScheduledWorkflowJob).not.toHaveBeenCalled();
  });

  it("replays workflow repair gaps through the shared workflow-jobs owner surface", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistWorkflowJob = vi.fn((input: WorkflowJobRecord) =>
      Effect.succeed(input),
    );
    const runSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.succeed(null),
    );
    const validateWorkflowExecutionIdentity = vi.fn(() => Effect.void);
    const replayedJob: WorkflowJobRecord = {
      ...searchRepairGapJob,
      scheduledAt: "2026-05-03T18:12:00.000Z",
      updatedAt: "2026-05-03T18:12:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.search,
      },
    };
    const getWorkflowJob = vi
      .fn()
      .mockImplementationOnce(() => Effect.succeed(searchRepairGapJob))
      .mockImplementationOnce(() => Effect.succeed(replayedJob));

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob,
          persistWorkflowJob,
        }),
        workflowExecutionClient: {
          ...createWorkflowExecutionClientDouble({
            runSearchTenantIndexEnsureWorkflowJob,
          }),
        },
        validateWorkflowExecutionIdentity,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.replayRepairGap({
            sessionId: platformOperatorSessionId,
            jobId: searchRepairGapJob.jobId,
            convexAuthToken: createConvexAuthToken(
              platformOperatorRequestContext.actorId ?? "",
            ),
          }),
        ),
      ),
    );

    expect(result).toEqual({
      job: {
        jobId: replayedJob.jobId,
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.blocked,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 2,
        scheduledAt: "2026-05-03T18:12:00.000Z",
        gapReason: workflowJobGapReason.repairFailed,
      },
    });
    expect(validateWorkflowExecutionIdentity).toHaveBeenCalledWith({
      requestContext: platformOperatorRequestContext,
      convexAuthToken: createConvexAuthToken(
        platformOperatorRequestContext.actorId ?? "",
      ),
    });
    expect(persistWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: searchRepairGapJob.jobId,
        payload: {
          sourceModuleId: platformModuleId.search,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: platformOperatorRequestContext,
          actorId: platformOperatorRequestContext.actorId,
          correlationId: platformOperatorRequestContext.correlationId,
          settings: searchTenantIndexSettings,
        },
        status: workflowJobStatus.scheduled,
      }),
    );
    expect(persistWorkflowJob.mock.calls[0]?.[0]?.gapReason).toBeUndefined();
    expect(persistWorkflowJob.mock.calls[0]?.[0]?.lastError).toBeUndefined();
    expect(runSearchTenantIndexEnsureWorkflowJob).toHaveBeenCalledWith(
      {
        jobId: searchRepairGapJob.jobId,
      },
      {
        authToken: createConvexAuthToken(
          platformOperatorRequestContext.actorId ?? "",
        ),
      },
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapReplayed,
        target: `${platformModuleId.workflowJobs}:${searchRepairGapJob.jobId}:repair-gap-replay`,
      }),
    ]);
  });

  it("replays webhook outbound delivery repair gaps through the shared workflow-jobs owner surface", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistWorkflowJob = vi.fn((input: WorkflowJobRecord) =>
      Effect.succeed(input),
    );
    const runWebhookOutboundDeliveryWorkflowJob = vi.fn(() =>
      Effect.succeed(null),
    );
    const replayedJob: WorkflowJobRecord = {
      ...webhookRepairGapJob,
      scheduledAt: "2026-05-03T18:25:00.000Z",
      updatedAt: "2026-05-03T18:25:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.webhooksApiAccess,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: platformOperatorRequestContext,
        actorId: platformOperatorRequestContext.actorId,
        correlationId: platformOperatorRequestContext.correlationId,
        subscriptionId: "webhook-subscription:organization:org_1:1",
        deliveryId: "webhook-outbound-delivery:organization:org_1:1",
        eventType: "billing.subscription.activated",
        payload: '{"subscriptionId":"sub_123"}',
        maxAttempts: 4,
      },
    };
    const getWorkflowJob = vi
      .fn()
      .mockImplementationOnce(() => Effect.succeed(webhookRepairGapJob))
      .mockImplementationOnce(() => Effect.succeed(replayedJob));

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob,
          persistWorkflowJob,
        }),
        workflowExecutionClient: {
          ...createWorkflowExecutionClientDouble({
            runWebhookOutboundDeliveryWorkflowJob,
          }),
        },
        validateWorkflowExecutionIdentity: () => Effect.void,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.replayRepairGap({
            sessionId: platformOperatorSessionId,
            jobId: webhookRepairGapJob.jobId,
            convexAuthToken: createConvexAuthToken(
              platformOperatorRequestContext.actorId ?? "",
            ),
          }),
        ),
      ),
    );

    expect(result).toEqual({
      job: {
        jobId: replayedJob.jobId,
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.blocked,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 2,
        scheduledAt: "2026-05-03T18:25:00.000Z",
        gapReason: workflowJobGapReason.repairFailed,
      },
    });
    expect(persistWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: webhookRepairGapJob.jobId,
        payload: {
          sourceModuleId: platformModuleId.webhooksApiAccess,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: platformOperatorRequestContext,
          actorId: platformOperatorRequestContext.actorId,
          correlationId: platformOperatorRequestContext.correlationId,
          subscriptionId: "webhook-subscription:organization:org_1:1",
          deliveryId: "webhook-outbound-delivery:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
          maxAttempts: 4,
        },
        status: workflowJobStatus.scheduled,
      }),
    );
    expect(runWebhookOutboundDeliveryWorkflowJob).toHaveBeenCalledWith(
      {
        jobId: webhookRepairGapJob.jobId,
      },
      {
        authToken: createConvexAuthToken(
          platformOperatorRequestContext.actorId ?? "",
        ),
      },
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapReplayed,
        target: `${platformModuleId.workflowJobs}:${webhookRepairGapJob.jobId}:repair-gap-replay`,
      }),
    ]);
  });

  it("replays support-case summary repair gaps through the shared workflow-jobs owner surface", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistWorkflowJob = vi.fn((input: WorkflowJobRecord) =>
      Effect.succeed(input),
    );
    const runImportExportSupportCaseSummaryWorkflowJob = vi.fn(() =>
      Effect.succeed(null),
    );
    const replayedJob: WorkflowJobRecord = {
      ...importExportSupportCaseRepairGapJob,
      scheduledAt: "2026-05-03T18:45:00.000Z",
      updatedAt: "2026-05-03T18:45:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: platformOperatorRequestContext,
        actorId: platformOperatorRequestContext.actorId,
        correlationId: platformOperatorRequestContext.correlationId,
        source: importExportJobSource.supportCaseSummaryJson,
        format: importExportJobFormat.json,
      },
    };
    const getWorkflowJob = vi
      .fn()
      .mockImplementationOnce(() =>
        Effect.succeed(importExportSupportCaseRepairGapJob),
      )
      .mockImplementationOnce(() => Effect.succeed(replayedJob));

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob,
          persistWorkflowJob,
        }),
        workflowExecutionClient: {
          ...createWorkflowExecutionClientDouble({
            runImportExportSupportCaseSummaryWorkflowJob,
          }),
        },
        validateWorkflowExecutionIdentity: () => Effect.void,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.replayRepairGap({
            sessionId: platformOperatorSessionId,
            jobId: importExportSupportCaseRepairGapJob.jobId,
            convexAuthToken: createConvexAuthToken(
              platformOperatorRequestContext.actorId ?? "",
            ),
          }),
        ),
      ),
    );

    expect(result).toEqual({
      job: {
        jobId: replayedJob.jobId,
        sourceModuleId: platformModuleId.importExport,
        kind: workflowJobKind.importExportSupportCaseSummary,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.blocked,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 1,
        scheduledAt: "2026-05-03T18:45:00.000Z",
        gapReason: workflowJobGapReason.repairFailed,
      },
    });
    expect(persistWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: importExportSupportCaseRepairGapJob.jobId,
        status: workflowJobStatus.scheduled,
        payload: {
          sourceModuleId: platformModuleId.importExport,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: platformOperatorRequestContext,
          actorId: platformOperatorRequestContext.actorId,
          correlationId: platformOperatorRequestContext.correlationId,
          source: importExportJobSource.supportCaseSummaryJson,
          format: importExportJobFormat.json,
        },
      }),
    );
    expect(runImportExportSupportCaseSummaryWorkflowJob).toHaveBeenCalledWith(
      {
        jobId: importExportSupportCaseRepairGapJob.jobId,
      },
      {
        authToken: createConvexAuthToken(
          platformOperatorRequestContext.actorId ?? "",
        ),
      },
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapReplayed,
        target: `${platformModuleId.workflowJobs}:${importExportSupportCaseRepairGapJob.jobId}:repair-gap-replay`,
      }),
    ]);
  });

  it("replays notification-center digest repair gaps while preserving the target tenant context", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistWorkflowJob = vi.fn((input: WorkflowJobRecord) =>
      Effect.succeed(input),
    );
    const runNotificationCenterEmailDigestWorkflowJob = vi.fn(() =>
      Effect.succeed(null),
    );
    const replayedJob: WorkflowJobRecord = {
      ...notificationCenterDigestRepairGapJob,
      scheduledAt: "2026-05-03T18:35:00.000Z",
      updatedAt: "2026-05-03T18:35:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.notificationCenter,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: {
          actorType: platformOperatorRequestContext.actorType,
          actorId: platformOperatorRequestContext.actorId,
          sessionId: platformOperatorRequestContext.sessionId,
          correlationId: platformOperatorRequestContext.correlationId,
          tenant: previousNotificationCenterTenantRequestContext.tenant,
        },
        actorId: platformOperatorRequestContext.actorId,
        correlationId: platformOperatorRequestContext.correlationId,
        digestRunId:
          "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-03T18:45:00.000Z",
        recipient: "customer@example.com",
        channel: notificationCenterChannel.email,
        template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
      },
    };
    const getWorkflowJob = vi
      .fn()
      .mockImplementationOnce(() =>
        Effect.succeed(notificationCenterDigestRepairGapJob),
      )
      .mockImplementationOnce(() => Effect.succeed(replayedJob));

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob,
          persistWorkflowJob,
        }),
        workflowExecutionClient: {
          ...createWorkflowExecutionClientDouble({
            runNotificationCenterEmailDigestWorkflowJob,
          }),
        },
        validateWorkflowExecutionIdentity: () => Effect.void,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.replayRepairGap({
            sessionId: platformOperatorSessionId,
            jobId: notificationCenterDigestRepairGapJob.jobId,
            convexAuthToken: createConvexAuthToken(
              platformOperatorRequestContext.actorId ?? "",
            ),
          }),
        ),
      ),
    );

    expect(result).toEqual({
      job: {
        jobId: replayedJob.jobId,
        sourceModuleId: platformModuleId.notificationCenter,
        kind: workflowJobKind.notificationCenterEmailDigest,
        trigger: workflowJobTrigger.moduleEvent,
        status: workflowJobStatus.blocked,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 1,
        scheduledAt: "2026-05-03T18:35:00.000Z",
        gapReason: workflowJobGapReason.repairFailed,
      },
    });
    expect(persistWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: notificationCenterDigestRepairGapJob.jobId,
        status: workflowJobStatus.scheduled,
        payload: expect.objectContaining({
          requestContext: {
            actorType: platformOperatorRequestContext.actorType,
            actorId: platformOperatorRequestContext.actorId,
            sessionId: platformOperatorRequestContext.sessionId,
            correlationId: platformOperatorRequestContext.correlationId,
            tenant: previousNotificationCenterTenantRequestContext.tenant,
          },
          actorId: platformOperatorRequestContext.actorId,
          correlationId: platformOperatorRequestContext.correlationId,
          digestRunId: notificationCenterDigestRepairGapJob.payload.digestRunId,
          recipient: "customer@example.com",
          channel: notificationCenterChannel.email,
          template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        }),
      }),
    );
    expect(runNotificationCenterEmailDigestWorkflowJob).toHaveBeenCalledWith(
      {
        jobId: notificationCenterDigestRepairGapJob.jobId,
      },
      {
        authToken: createConvexAuthToken(
          platformOperatorRequestContext.actorId ?? "",
        ),
      },
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapReplayed,
        target: `${platformModuleId.workflowJobs}:${notificationCenterDigestRepairGapJob.jobId}:repair-gap-replay`,
      }),
    ]);
  });

  it("rebinds billing replay payload metadata to the current operator context", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistWorkflowJob = vi.fn((input: WorkflowJobRecord) =>
      Effect.succeed(input),
    );
    const runBillingConvergenceJob = vi.fn(() => Effect.succeed(null));
    const replayedJob: WorkflowJobRecord = {
      ...billingRepairGapJob,
      scheduledAt: "2026-05-03T17:12:00.000Z",
      updatedAt: "2026-05-03T17:12:00.000Z",
      payload: {
        ...billingRepairGapPayload,
        actorId: platformOperatorRequestContext.actorId,
        correlationId: platformOperatorRequestContext.correlationId,
      },
    };
    const getWorkflowJob = vi
      .fn()
      .mockImplementationOnce(() => Effect.succeed(billingRepairGapJob))
      .mockImplementationOnce(() => Effect.succeed(replayedJob));

    const result = await Effect.runPromise(
      makeWorkflowJobsService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob,
          persistWorkflowJob,
        }),
        workflowExecutionClient: {
          ...createWorkflowExecutionClientDouble({
            runBillingConvergenceJob,
          }),
        },
        validateWorkflowExecutionIdentity: () => Effect.void,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.flatMap((service) =>
          service.replayRepairGap({
            sessionId: platformOperatorSessionId,
            jobId: billingRepairGapJob.jobId,
            convexAuthToken: createConvexAuthToken(
              platformOperatorRequestContext.actorId ?? "",
            ),
          }),
        ),
      ),
    );

    expect(result).toEqual({
      job: {
        jobId: replayedJob.jobId,
        sourceModuleId: platformModuleId.billingAndMetering,
        kind: workflowJobKind.reconciliationSweep,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.blocked,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 1,
        scheduledAt: "2026-05-03T17:12:00.000Z",
        gapReason: workflowJobGapReason.missingSubscriptionState,
      },
    });
    expect(persistWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: billingRepairGapJob.jobId,
        payload: {
          sourceModuleId: platformModuleId.billingAndMetering,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          organizationId: "org_1",
          actorId: platformOperatorRequestContext.actorId,
          provider: "polar",
          correlationId: platformOperatorRequestContext.correlationId,
          trigger: workflowJobTrigger.operatorRequested,
        },
        status: workflowJobStatus.scheduled,
      }),
    );
    expect(persistWorkflowJob.mock.calls[0]?.[0]?.gapReason).toBeUndefined();
    expect(persistWorkflowJob.mock.calls[0]?.[0]?.lastError).toBeUndefined();
    expect(runBillingConvergenceJob).toHaveBeenCalledWith(
      {
        jobId: billingRepairGapJob.jobId,
      },
      {
        authToken: createConvexAuthToken(
          platformOperatorRequestContext.actorId ?? "",
        ),
      },
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapReplayed,
        target: `${platformModuleId.workflowJobs}:${billingRepairGapJob.jobId}:repair-gap-replay`,
      }),
    ]);
  });

  it("restores workflow repair gaps when replay dispatch fails at the Convex boundary", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistWorkflowJob = vi.fn((input: WorkflowJobRecord) =>
      Effect.succeed(input),
    );
    const restoreWorkflowJobIfUpdatedAtMatches = vi.fn(() =>
      Effect.succeed(searchRepairGapJob),
    );
    const runSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.fail({
        _tag: "ConvexAdapterRequestError",
        operation: "runSearchTenantIndexEnsureWorkflowJob",
        cause: new Error("Convex unavailable"),
      } as const),
    );

    await expect(
      Effect.runPromise(
        makeWorkflowJobsService({
          authorization: { check: authorizationCheck },
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob: () => Effect.succeed(searchRepairGapJob),
            persistWorkflowJob,
            restoreWorkflowJobIfUpdatedAtMatches,
          }),
          workflowExecutionClient: {
            ...createWorkflowExecutionClientDouble({
              runSearchTenantIndexEnsureWorkflowJob,
            }),
          },
          validateWorkflowExecutionIdentity: () => Effect.void,
        }).pipe(
          Effect.provideService(AuditLogModule, auditLog),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionModuleDouble(),
          ),
          Effect.flatMap((service) =>
            service.replayRepairGap({
              sessionId: platformOperatorSessionId,
              jobId: searchRepairGapJob.jobId,
              convexAuthToken: createConvexAuthToken(
                platformOperatorRequestContext.actorId ?? "",
              ),
            }),
          ),
        ),
      ),
    ).rejects.toThrow("ConvexAdapterRequestError");

    expect(persistWorkflowJob).toHaveBeenCalledTimes(1);
    expect(restoreWorkflowJobIfUpdatedAtMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: searchRepairGapJob.jobId,
        record: searchRepairGapJob,
      }),
    );
    expect(runSearchTenantIndexEnsureWorkflowJob).toHaveBeenCalledTimes(1);
    expect(auditCalls).toEqual([]);
  });

  it("rejects workflow repair-gap replay before durable mutation when the workflow token provenance is invalid", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { service: auditLog } = createAuditLogModuleDouble();
    const getWorkflowJob = vi.fn(() => Effect.succeed(searchRepairGapJob));
    const persistWorkflowJob = vi.fn((input: WorkflowJobRecord) =>
      Effect.succeed(input),
    );
    const runSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.succeed(null),
    );

    await expect(
      Effect.runPromise(
        makeWorkflowJobsService({
          authorization: { check: authorizationCheck },
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob,
            persistWorkflowJob,
          }),
          workflowExecutionClient: {
            ...createWorkflowExecutionClientDouble({
              runSearchTenantIndexEnsureWorkflowJob,
            }),
          },
          validateWorkflowExecutionIdentity: () =>
            Effect.fail({
              _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
              reason:
                "Authenticated workflow execution requires a valid platform-operator Keycloak identity token.",
            } as const),
        }).pipe(
          Effect.provideService(AuditLogModule, auditLog),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionModuleDouble(),
          ),
          Effect.flatMap((service) =>
            service.replayRepairGap({
              sessionId: platformOperatorSessionId,
              jobId: searchRepairGapJob.jobId,
              convexAuthToken: createConvexAuthToken(
                platformOperatorRequestContext.actorId ?? "",
              ),
            }),
          ),
        ),
      ),
    ).rejects.toThrow("WorkflowJobsWorkflowExecutionIdentityMismatchError");

    expect(getWorkflowJob).not.toHaveBeenCalled();
    expect(persistWorkflowJob).not.toHaveBeenCalled();
    expect(runSearchTenantIndexEnsureWorkflowJob).not.toHaveBeenCalled();
  });
});
