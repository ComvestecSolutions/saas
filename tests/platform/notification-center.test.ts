import * as config from "@comvestec/config";
import { Effect, Schema } from "effect";
import {
  notificationCenterConfigKey,
  notificationCenterFeatureFlag,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import {
  notificationCenterChannel,
  type NotificationCenterDigestCandidateRecord,
  type NotificationCenterDigestRunRecord,
  notificationCenterDigestRunStatus,
  type NotificationCenterEmailPreferenceRecord,
  notificationCenterReceiptStatus,
  emailDeliveryTemplateId,
  type NotificationCenterEmailReceiptRecord,
  platformModuleId,
  platformScope,
  runtimeResolutionSource,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  type BillingEntitlementRecord,
  BillingStatePostgresRepository,
  EmailDeliveryPostgresRepository,
  makeEmailDeliveryModule,
  type NotificationCenterEmailDigestWorkflowJobRecord,
  makeRuntimeConfigModule,
  type NotificationCenterModuleService,
  type RuntimeConfigOverrideRecord,
  RuntimeConfigModule,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  workflowJobRuntime,
} from "@comvestec/modules";
import {
  billingInvoiceReadyDigestEmailTemplateTrackingId,
  billingInvoiceReadyEmailTemplateTrackingId,
  platformAdapterServiceName,
  PostalAdapter,
} from "@comvestec/platform";
import { organizationRequestContext } from "../modules/_fixtures";
import { makeEmailDeliveryService } from "../../packages/platform/src/services/communication/email-delivery";
import {
  makeNotificationCenterService,
  type NotificationCenterDeclarationMissingError,
  type NotificationCenterDisabledError,
} from "../../packages/platform/src/services/communication/notification-center";

const billingInvoiceReadyRequest = {
  requestContext: organizationRequestContext,
  recipient: "customer@example.com",
  invoiceNumber: "inv_2026_04",
  invoiceUrl: "https://product.example.com/billing/invoices/inv_2026_04",
  dueAt: "2026-04-30T00:00:00.000Z",
  totalDue: "$120.00",
} as const;

const billingInvoiceReadySubject = `Your invoice ${billingInvoiceReadyRequest.invoiceNumber} is ready`;

const createBillingStateRepository = (
  entitlements: readonly BillingEntitlementRecord[],
): BillingStatePostgresRepository["Type"] => ({
  getTenantAccessState: ({ scope, scopeId }) =>
    Effect.succeed({
      entitlements: entitlements.filter(
        (entitlement) =>
          entitlement.scope === scope && entitlement.scopeId === scopeId,
      ),
      invoiceHistory: [],
    }),
});

const createRuntimeConfigService = async (
  overrides: readonly RuntimeConfigOverrideRecord[],
): Promise<RuntimeConfigModule["Type"]> => {
  const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

  return {
    ...runtimeConfig,
    listOverridesByModule: (moduleId) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
  };
};

const createEmailDeliveryRepository = () => {
  const trackedDeliveries = new Map<string, Record<string, unknown>>();
  const suppressions = new Map<string, Record<string, unknown>>();

  return {
    service: {
      createTrackedDelivery: (record) => {
        trackedDeliveries.set(record.messageId, record);

        return Effect.succeed(record);
      },
      updateTrackedDelivery: ({ currentRecord, nextRecord }) => {
        const existing = trackedDeliveries.get(nextRecord.messageId) as
          | { readonly updatedAt?: string }
          | undefined;

        if (existing === undefined) {
          return Effect.succeed(undefined);
        }

        if (existing.updatedAt !== currentRecord.updatedAt) {
          return Effect.succeed(existing as never);
        }

        trackedDeliveries.set(nextRecord.messageId, nextRecord);

        return Effect.succeed(nextRecord);
      },
      findTrackedDelivery: ({ messageId }) =>
        Effect.succeed(trackedDeliveries.get(messageId) as never),
      findRecipientSuppression: ({ recipient }) =>
        Effect.succeed(suppressions.get(recipient.toLowerCase()) as never),
      upsertRecipientSuppression: ({ currentRecord, nextRecord }) => {
        const normalizedRecipient = nextRecord.recipient.toLowerCase();
        const existing = suppressions.get(normalizedRecipient) as
          | { readonly updatedAt?: string }
          | undefined;

        if (
          existing !== undefined &&
          existing.updatedAt !== currentRecord?.updatedAt
        ) {
          return Effect.succeed(existing as never);
        }

        suppressions.set(normalizedRecipient, nextRecord);

        return Effect.succeed(nextRecord);
      },
    } satisfies EmailDeliveryPostgresRepository["Type"],
  };
};

const buildEmailPreferenceKey = (input: {
  readonly tenantScope: string;
  readonly tenantScopeId: string;
  readonly recipient: string;
  readonly template: string;
}) =>
  [
    input.tenantScope,
    input.tenantScopeId,
    input.recipient.toLowerCase(),
    input.template,
  ].join(":");

const createNotificationCenterModuleServiceDouble = (input?: {
  readonly emailPreferences?: readonly NotificationCenterEmailPreferenceRecord[];
  readonly digestRuns?: readonly NotificationCenterDigestRunRecord[];
  readonly digestCandidates?: readonly NotificationCenterDigestCandidateRecord[];
}) => {
  const emailReceipts = new Map<string, NotificationCenterEmailReceiptRecord>();
  const emailPreferences = new Map<
    string,
    NotificationCenterEmailPreferenceRecord
  >(
    (input?.emailPreferences ?? []).map((record) => [
      buildEmailPreferenceKey({
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        recipient: record.recipient,
        template: record.template,
      }),
      record,
    ]),
  );
  const digestRuns = new Map<string, NotificationCenterDigestRunRecord>(
    (input?.digestRuns ?? []).map((record) => [record.digestRunId, record]),
  );
  const digestCandidates = new Map<
    string,
    NotificationCenterDigestCandidateRecord
  >(
    (input?.digestCandidates ?? []).map((record) => [
      record.candidateId,
      record,
    ]),
  );
  const queueEmailNotification = vi.fn<
    NotificationCenterModuleService["queueEmailNotification"]
  >((input) =>
    Effect.succeed({
      id: "novu_notification_1",
      channel: "email" as const,
      status: "queued" as const,
      recipient: "customer@example.com",
      template: input.template,
      createdAt: "2026-04-27T13:00:01.000Z",
      provider: platformAdapterServiceName.novu,
    }),
  );
  const createEmailReceipt = vi.fn<
    NotificationCenterModuleService["createEmailReceipt"]
  >((record) => {
    emailReceipts.set(record.notificationId, record);

    return Effect.succeed(record);
  });
  const findEmailReceipt = vi.fn<
    NotificationCenterModuleService["findEmailReceipt"]
  >(({ notificationId }) => Effect.succeed(emailReceipts.get(notificationId)));
  const findEmailPreference = vi.fn<
    NotificationCenterModuleService["findEmailPreference"]
  >((reference) =>
    Effect.succeed(
      emailPreferences.get(
        buildEmailPreferenceKey({
          tenantScope: reference.tenantScope,
          tenantScopeId: reference.tenantScopeId,
          recipient: reference.recipient,
          template: reference.template,
        }),
      ),
    ),
  );
  const findDigestRun = vi.fn<NotificationCenterModuleService["findDigestRun"]>(
    ({ digestRunId }) => Effect.succeed(digestRuns.get(digestRunId)),
  );
  const listDigestCandidatesByDigestRun = vi.fn<
    NotificationCenterModuleService["listDigestCandidatesByDigestRun"]
  >(({ digestRunId }) =>
    Effect.succeed(
      Array.from(digestCandidates.values()).filter(
        (candidate) => candidate.digestRunId === digestRunId,
      ),
    ),
  );
  const upsertDigestCandidate = vi.fn<
    NotificationCenterModuleService["upsertDigestCandidate"]
  >((record) => {
    digestCandidates.set(record.candidateId, record);

    return Effect.succeed(record);
  });
  const upsertDigestRun = vi.fn<
    NotificationCenterModuleService["upsertDigestRun"]
  >((record) => {
    digestRuns.set(record.digestRunId, record);

    return Effect.succeed(record);
  });

  return {
    emailReceipts,
    emailPreferences,
    digestRuns,
    digestCandidates,
    queueEmailNotification,
    createEmailReceipt,
    findDigestRun,
    findEmailReceipt,
    findEmailPreference,
    listDigestCandidatesByDigestRun,
    upsertDigestCandidate,
    upsertDigestRun,
    service: {
      queueEmailNotification,
      createEmailReceipt,
      findDigestRun,
      findEmailReceipt,
      findEmailPreference,
      listDigestCandidatesByDigestRun,
      upsertDigestCandidate,
      upsertDigestRun,
      upsertEmailPreference: vi.fn((record) => {
        emailPreferences.set(
          buildEmailPreferenceKey({
            tenantScope: record.tenantScope,
            tenantScopeId: record.tenantScopeId,
            recipient: record.recipient,
            template: record.template,
          }),
          record,
        );

        return Effect.succeed(record);
      }),
    } satisfies NotificationCenterModuleService,
  };
};

type NotificationCenterWorkflowJobsRepository = Pick<
  WorkflowJobsPostgresRepositoryServiceForRecord<NotificationCenterEmailDigestWorkflowJobRecord>,
  "claimScheduledWorkflowJob" | "getWorkflowJob" | "persistWorkflowJob"
>;

const createNotificationCenterWorkflowJobsDouble = (input?: {
  readonly jobs?: readonly NotificationCenterEmailDigestWorkflowJobRecord[];
}) => {
  const jobs = new Map<string, NotificationCenterEmailDigestWorkflowJobRecord>(
    (input?.jobs ?? []).map((job) => [job.jobId, job]),
  );
  const persistWorkflowJob = vi.fn<
    NotificationCenterWorkflowJobsRepository["persistWorkflowJob"]
  >((record) => {
    jobs.set(record.jobId, record);

    return Effect.succeed(record);
  });
  const getWorkflowJob = vi.fn<
    NotificationCenterWorkflowJobsRepository["getWorkflowJob"]
  >(({ jobId }) => Effect.succeed(jobs.get(jobId)));
  const claimScheduledWorkflowJob = vi.fn<
    NotificationCenterWorkflowJobsRepository["claimScheduledWorkflowJob"]
  >(({ jobId, now }) => {
    const currentJob = jobs.get(jobId);

    if (
      currentJob === undefined ||
      currentJob.status !== workflowJobStatus.scheduled
    ) {
      return Effect.succeed(undefined);
    }

    const claimedJob: NotificationCenterEmailDigestWorkflowJobRecord = {
      ...currentJob,
      status: workflowJobStatus.running,
      attempts: currentJob.attempts + 1,
      updatedAt: now,
    };

    jobs.set(jobId, claimedJob);

    return Effect.succeed(claimedJob);
  });

  return {
    jobs,
    persistWorkflowJob,
    getWorkflowJob,
    claimScheduledWorkflowJob,
    service: {
      persistWorkflowJob,
      getWorkflowJob,
      claimScheduledWorkflowJob,
    } satisfies NotificationCenterWorkflowJobsRepository,
  };
};

type NotificationCenterWorkflowSchedulerClient = NonNullable<
  Parameters<typeof makeNotificationCenterService>[0]["convexWorkflowClient"]
>;

const createNotificationCenterWorkflowSchedulerDouble = (
  overrides?: NotificationCenterWorkflowSchedulerClient,
): NotificationCenterWorkflowSchedulerClient => ({
  scheduleNotificationCenterEmailDigestWorkflowJob:
    overrides?.scheduleNotificationCenterEmailDigestWorkflowJob ??
    vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "sched_notification_center_digest_1",
        scheduledFunctionIds: [
          "sched_notification_center_digest_1",
          "sched_notification_center_digest_recovery_1",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    ),
});

describe("platform notification center", () => {
  it("dispatches tenant-branded email notifications through shared email delivery and Novu", async () => {
    const changedAt = "2026-04-29T13:00:00.000Z";
    const runtimeConfig = await createRuntimeConfigService([
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "Acme",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.replyToEmail,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "reply@acme.example",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.brandedEmails,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
    ]);
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-04-29T13:05:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const emailDeliveryRepository = createEmailDeliveryRepository();
    const emailDeliveryModule = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail,
        }),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          emailDeliveryRepository.service,
        ),
      ),
    );
    const emailDelivery = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([
            {
              entitlementId: "ent_tenant_branding_enabled",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.enabled,
              scope: platformScope.organization,
              scopeId: "org_1",
              active: true,
              grantedAt: "2026-04-29T12:50:00.000Z",
            },
            {
              entitlementId: "ent_tenant_branding_branded_emails",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.brandedEmails,
              scope: platformScope.organization,
              scopeId: "org_1",
              active: true,
              grantedAt: "2026-04-29T12:50:00.000Z",
            },
          ]),
        ),
      ),
    );
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble();
    notificationCenterDouble.queueEmailNotification.mockImplementation(() =>
      Effect.succeed({
        id: "novu_notification_branded",
        channel: "email" as const,
        status: "queued" as const,
        recipient: "customer@example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
        createdAt: "2026-04-29T13:05:01.000Z",
        provider: platformAdapterServiceName.novu,
      }),
    );
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );

    const result = await Effect.runPromise(
      service.dispatchBillingInvoiceReadyNotification(
        billingInvoiceReadyRequest,
      ),
    );

    expect(result).toMatchObject({
      notification: {
        status: "queued",
        receipt: expect.objectContaining({
          id: "novu_notification_branded",
          channel: "email",
        }),
        notificationId: expect.stringMatching(
          /^notification-center:organization:org_1:/,
        ),
      },
      delivery: expect.objectContaining({
        messageId: expect.stringMatching(/^email-delivery:organization:org_1:/),
        provider: platformAdapterServiceName.postal,
      }),
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: expect.stringMatching(/^email-delivery:organization:org_1:/),
        fromName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
        subject: billingInvoiceReadySubject,
        html: expect.stringContaining(billingInvoiceReadyRequest.invoiceUrl),
        text: expect.stringContaining(billingInvoiceReadyRequest.totalDue),
      }),
    );
    expect(
      notificationCenterDouble.queueEmailNotification,
    ).toHaveBeenCalledWith({
      recipient: billingInvoiceReadyRequest.recipient,
      template: emailDeliveryTemplateId.billingInvoiceReady,
      subject: billingInvoiceReadySubject,
    });
    expect(notificationCenterDouble.createEmailReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: expect.stringMatching(
          /^notification-center:organization:org_1:/,
        ),
        channel: notificationCenterChannel.email,
        status: notificationCenterReceiptStatus.queued,
        recipient: billingInvoiceReadyRequest.recipient,
        template: emailDeliveryTemplateId.billingInvoiceReady,
        emailDeliveryMessageId: expect.stringMatching(
          /^email-delivery:organization:org_1:/,
        ),
        queueReceiptId: "novu_notification_branded",
      }),
    );
  });

  it("dispatches billing invoice ready notifications through email delivery and Novu", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const emailDelivery = {
      sendTransactionalEmail: vi.fn(() =>
        Effect.succeed({
          messageId: "postal_msg_notification",
          recipient: "customer@example.com",
          status: "queued" as const,
          sentAt: "2026-04-27T13:00:00.000Z",
          provider: platformAdapterServiceName.postal,
        }),
      ),
    };
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble();
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );

    const result = await Effect.runPromise(
      service.dispatchBillingInvoiceReadyNotification(
        billingInvoiceReadyRequest,
      ),
    );

    expect(result).toMatchObject({
      notification: {
        status: "queued",
        receipt: expect.objectContaining({
          id: "novu_notification_1",
          channel: "email",
        }),
        notificationId: expect.stringMatching(
          /^notification-center:organization:org_1:/,
        ),
      },
      delivery: expect.objectContaining({
        messageId: "postal_msg_notification",
        provider: platformAdapterServiceName.postal,
      }),
    });
    expect(emailDelivery.sendTransactionalEmail).toHaveBeenCalledWith({
      requestContext: billingInvoiceReadyRequest.requestContext,
      recipient: billingInvoiceReadyRequest.recipient,
      template: billingInvoiceReadyEmailTemplateTrackingId,
      subject: billingInvoiceReadySubject,
      html: expect.stringContaining(billingInvoiceReadyRequest.invoiceUrl),
      text: expect.stringContaining(billingInvoiceReadyRequest.totalDue),
    });
    expect(
      notificationCenterDouble.queueEmailNotification,
    ).toHaveBeenCalledWith({
      recipient: billingInvoiceReadyRequest.recipient,
      template: emailDeliveryTemplateId.billingInvoiceReady,
      subject: billingInvoiceReadySubject,
    });
    expect(notificationCenterDouble.createEmailReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: notificationCenterChannel.email,
        status: notificationCenterReceiptStatus.queued,
        recipient: billingInvoiceReadyRequest.recipient,
        template: emailDeliveryTemplateId.billingInvoiceReady,
        emailDeliveryMessageId: "postal_msg_notification",
        queueReceiptId: "novu_notification_1",
      }),
    );
  });

  it("schedules billing invoice ready notifications into digest workflow windows when digest batching is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:07:00.000Z"));

    try {
      const runtimeConfig = await createRuntimeConfigService([
        {
          moduleId: platformModuleId.notificationCenter,
          key: notificationCenterConfigKey.digestIntervalMinutes,
          scope: platformScope.organization,
          scopeId: "org_1",
          value: 15,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_support_operator",
          changedAt: "2026-05-08T10:00:00.000Z",
        },
      ]);
      const emailDelivery = {
        sendTransactionalEmail: vi.fn(() =>
          Effect.die("Unexpected immediate email delivery call."),
        ),
      };
      const notificationCenterDouble =
        createNotificationCenterModuleServiceDouble();
      const workflowJobsDouble = createNotificationCenterWorkflowJobsDouble();
      const workflowSchedulerDouble =
        createNotificationCenterWorkflowSchedulerDouble();
      const service = await Effect.runPromise(
        makeNotificationCenterService({
          emailDelivery,
          notificationCenter: notificationCenterDouble.service,
          workflowJobs: workflowJobsDouble.service,
          convexWorkflowClient: workflowSchedulerDouble,
        }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
      );

      const result = await Effect.runPromise(
        service.dispatchBillingInvoiceReadyNotification(
          billingInvoiceReadyRequest,
        ),
      );

      expect(result).toEqual({
        notification: {
          status: "scheduled",
          notificationId: expect.stringMatching(
            /^notification-center:organization:org_1:/,
          ),
          digestRunId: expect.stringMatching(
            /^notification-center:digest-run:organization:org_1:email:customer@example.com:billing\.invoice-ready-digest:/,
          ),
          windowEndsAt: "2026-05-08T10:15:00.000Z",
        },
      });
      if (result.notification.status !== "scheduled") {
        throw new Error("Expected a scheduled digest notification result.");
      }

      const scheduledNotification = result.notification;

      expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.queueEmailNotification,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.createEmailReceipt,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.digestRuns.get(
          scheduledNotification.digestRunId,
        ),
      ).toMatchObject({
        digestRunId:
          "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: billingInvoiceReadyRequest.recipient,
        channel: notificationCenterChannel.email,
        template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        scheduledAt: "2026-05-08T10:15:00.000Z",
        status: notificationCenterDigestRunStatus.scheduled,
        itemCount: 1,
      });
      expect(
        Array.from(notificationCenterDouble.digestCandidates.values()),
      ).toEqual([
        expect.objectContaining({
          sourceNotificationId: scheduledNotification.notificationId,
          digestRunId: scheduledNotification.digestRunId,
          channel: notificationCenterChannel.email,
          recipient: billingInvoiceReadyRequest.recipient,
          sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
          digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
          windowEndsAt: "2026-05-08T10:15:00.000Z",
          invoiceNumber: billingInvoiceReadyRequest.invoiceNumber,
        }),
      ]);
      expect(
        workflowSchedulerDouble.scheduleNotificationCenterEmailDigestWorkflowJob,
      ).toHaveBeenCalledWith({
        jobId: expect.stringMatching(
          /^workflow-jobs:notification-center-email-digest:module-event:organization:org_1:/,
        ),
        scheduledAt: "2026-05-08T10:15:00.000Z",
      });
      expect(Array.from(workflowJobsDouble.jobs.values())).toEqual([
        expect.objectContaining({
          kind: workflowJobKind.notificationCenterEmailDigest,
          trigger: workflowJobTrigger.moduleEvent,
          status: workflowJobStatus.scheduled,
          scheduledAt: "2026-05-08T10:15:00.000Z",
          payload: expect.objectContaining({
            digestRunId: scheduledNotification.digestRunId,
            recipient: billingInvoiceReadyRequest.recipient,
            channel: notificationCenterChannel.email,
            template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
            dispatch: expect.objectContaining({
              scheduledAt: "2026-05-08T10:15:00.000Z",
              scheduledFunctionId: "sched_notification_center_digest_1",
            }),
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed when digest workflow scheduling cannot be dispatched", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:07:00.000Z"));

    try {
      const runtimeConfig = await createRuntimeConfigService([
        {
          moduleId: platformModuleId.notificationCenter,
          key: notificationCenterConfigKey.digestIntervalMinutes,
          scope: platformScope.organization,
          scopeId: "org_1",
          value: 15,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_support_operator",
          changedAt: "2026-05-08T10:00:00.000Z",
        },
      ]);
      const emailDelivery = {
        sendTransactionalEmail: vi.fn(() =>
          Effect.die("Unexpected immediate email delivery call."),
        ),
      };
      const schedulerFailure = {
        _tag: "ConvexAdapterRequestError",
        operation: "scheduleNotificationCenterEmailDigestWorkflowJob",
        cause: new Error("scheduler unavailable"),
      } as const;
      const notificationCenterDouble =
        createNotificationCenterModuleServiceDouble();
      const workflowJobsDouble = createNotificationCenterWorkflowJobsDouble();
      const workflowSchedulerDouble =
        createNotificationCenterWorkflowSchedulerDouble({
          scheduleNotificationCenterEmailDigestWorkflowJob: vi.fn(
            (_input, _options) => Effect.fail(schedulerFailure),
          ),
        });
      const service = await Effect.runPromise(
        makeNotificationCenterService({
          emailDelivery,
          notificationCenter: notificationCenterDouble.service,
          workflowJobs: workflowJobsDouble.service,
          convexWorkflowClient: workflowSchedulerDouble,
        }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
      );

      const result = await Effect.runPromise(
        Effect.either(
          service.dispatchBillingInvoiceReadyNotification(
            billingInvoiceReadyRequest,
          ),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "NotificationCenterWorkflowDispatchError",
          operation: "scheduleNotificationCenterEmailDigestWorkflowJob",
        },
      });
      expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.queueEmailNotification,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.createEmailReceipt,
      ).not.toHaveBeenCalled();
      expect(notificationCenterDouble.digestRuns.size).toBe(1);
      expect(notificationCenterDouble.digestCandidates.size).toBe(1);
      expect(Array.from(workflowJobsDouble.jobs.values())).toEqual([
        expect.objectContaining({
          kind: workflowJobKind.notificationCenterEmailDigest,
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
          lastError: expect.stringContaining("ConvexAdapterRequestError"),
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces post-dispatch workflow persistence failures without manufacturing a blocked repair gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:07:00.000Z"));

    try {
      const runtimeConfig = await createRuntimeConfigService([
        {
          moduleId: platformModuleId.notificationCenter,
          key: notificationCenterConfigKey.digestIntervalMinutes,
          scope: platformScope.organization,
          scopeId: "org_1",
          value: 15,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_support_operator",
          changedAt: "2026-05-08T10:00:00.000Z",
        },
      ]);
      const emailDelivery = {
        sendTransactionalEmail: vi.fn(() =>
          Effect.die("Unexpected immediate email delivery call."),
        ),
      };
      const persistFailure = {
        _tag: "WorkflowJobsPostgresRepositoryQueryError",
        operation: "persistWorkflowJob",
        cause: new Error("workflow jobs write unavailable"),
      } as const;
      const notificationCenterDouble =
        createNotificationCenterModuleServiceDouble();
      const workflowJobsDouble = createNotificationCenterWorkflowJobsDouble();
      workflowJobsDouble.persistWorkflowJob.mockImplementation((record) => {
        if ("dispatch" in record.payload) {
          return Effect.fail(persistFailure);
        }

        workflowJobsDouble.jobs.set(record.jobId, record);

        return Effect.succeed(record);
      });
      const workflowSchedulerDouble =
        createNotificationCenterWorkflowSchedulerDouble();
      const service = await Effect.runPromise(
        makeNotificationCenterService({
          emailDelivery,
          notificationCenter: notificationCenterDouble.service,
          workflowJobs: workflowJobsDouble.service,
          convexWorkflowClient: workflowSchedulerDouble,
        }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
      );

      const result = await Effect.runPromise(
        Effect.either(
          service.dispatchBillingInvoiceReadyNotification(
            billingInvoiceReadyRequest,
          ),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "WorkflowJobsPostgresRepositoryQueryError",
          operation: "persistWorkflowJob",
        },
      });
      expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.queueEmailNotification,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.createEmailReceipt,
      ).not.toHaveBeenCalled();
      expect(
        workflowSchedulerDouble.scheduleNotificationCenterEmailDigestWorkflowJob,
      ).toHaveBeenCalledTimes(1);
      expect(workflowJobsDouble.persistWorkflowJob).toHaveBeenCalledTimes(2);
      expect(workflowJobsDouble.jobs.size).toBe(1);

      const [storedJob] = Array.from(workflowJobsDouble.jobs.values());

      if (storedJob === undefined) {
        throw new Error(
          "Expected the original scheduled workflow job to remain persisted.",
        );
      }

      expect(storedJob).toMatchObject({
        kind: workflowJobKind.notificationCenterEmailDigest,
        status: workflowJobStatus.scheduled,
      });
      expect(storedJob).not.toHaveProperty("gapReason");
      expect(storedJob).not.toHaveProperty("lastError");
      expect(storedJob.payload).not.toHaveProperty("dispatch");
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs notification-center digest workflow jobs through shared email delivery and Novu", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:15:01.000Z"));

    try {
      const runtimeConfig = await createRuntimeConfigService([]);
      const emailDelivery = {
        sendTransactionalEmail: vi.fn(() =>
          Effect.succeed({
            messageId: "postal_msg_digest_1",
            recipient: billingInvoiceReadyRequest.recipient,
            status: "queued" as const,
            sentAt: "2026-05-08T10:15:01.000Z",
            provider: platformAdapterServiceName.postal,
          }),
        ),
      };
      const digestRun: NotificationCenterDigestRunRecord = {
        digestRunId:
          "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: billingInvoiceReadyRequest.recipient,
        channel: notificationCenterChannel.email,
        template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        scheduledAt: "2026-05-08T10:15:00.000Z",
        status: notificationCenterDigestRunStatus.scheduled,
        itemCount: 0,
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:07:00.000Z",
      };
      const digestCandidates: readonly NotificationCenterDigestCandidateRecord[] =
        [
          {
            candidateId: `${digestRun.digestRunId}:candidate_1`,
            sourceNotificationId:
              "notification-center:organization:org_1:invoice_1",
            digestRunId: digestRun.digestRunId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            channel: notificationCenterChannel.email,
            recipient: billingInvoiceReadyRequest.recipient,
            sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
            digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
            windowEndsAt: digestRun.scheduledAt,
            invoiceNumber: "inv_2026_04",
            invoiceUrl:
              "https://product.example.com/billing/invoices/inv_2026_04",
            dueAt: "2026-04-30T00:00:00.000Z",
            totalDue: "$120.00",
            createdAt: "2026-05-08T10:07:00.000Z",
            updatedAt: "2026-05-08T10:07:00.000Z",
          },
          {
            candidateId: `${digestRun.digestRunId}:candidate_2`,
            sourceNotificationId:
              "notification-center:organization:org_1:invoice_2",
            digestRunId: digestRun.digestRunId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            channel: notificationCenterChannel.email,
            recipient: billingInvoiceReadyRequest.recipient,
            sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
            digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
            windowEndsAt: digestRun.scheduledAt,
            invoiceNumber: "inv_2026_05",
            invoiceUrl:
              "https://product.example.com/billing/invoices/inv_2026_05",
            dueAt: "2026-05-31T00:00:00.000Z",
            totalDue: "$80.00",
            createdAt: "2026-05-08T10:07:30.000Z",
            updatedAt: "2026-05-08T10:07:30.000Z",
          },
        ];
      const notificationCenterDouble =
        createNotificationCenterModuleServiceDouble({
          digestRuns: [digestRun],
          digestCandidates,
        });
      notificationCenterDouble.queueEmailNotification.mockImplementation(() =>
        Effect.succeed({
          id: "novu_digest_notification_1",
          channel: "email" as const,
          status: "queued" as const,
          recipient: billingInvoiceReadyRequest.recipient,
          template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
          createdAt: "2026-05-08T10:15:02.000Z",
          provider: platformAdapterServiceName.novu,
        }),
      );
      const workflowJob: NotificationCenterEmailDigestWorkflowJobRecord = {
        jobId:
          "workflow-jobs:notification-center-email-digest:module-event:organization:org_1:notification-center-digest-run-1",
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.notificationCenter,
        kind: workflowJobKind.notificationCenterEmailDigest,
        trigger: workflowJobTrigger.moduleEvent,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 0,
        scheduledAt: digestRun.scheduledAt,
        payload: {
          sourceModuleId: platformModuleId.notificationCenter,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: organizationRequestContext,
          ...(organizationRequestContext.actorId === undefined
            ? {}
            : { actorId: organizationRequestContext.actorId }),
          correlationId: organizationRequestContext.correlationId,
          digestRunId: digestRun.digestRunId,
          recipient: billingInvoiceReadyRequest.recipient,
          channel: notificationCenterChannel.email,
          template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        },
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:07:00.000Z",
      };
      const workflowJobsDouble = createNotificationCenterWorkflowJobsDouble({
        jobs: [workflowJob],
      });
      const service = await Effect.runPromise(
        makeNotificationCenterService({
          emailDelivery,
          notificationCenter: notificationCenterDouble.service,
          workflowJobs: workflowJobsDouble.service,
        }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
      );

      const result = await Effect.runPromise(
        service.runNotificationCenterEmailDigestWorkflowJob({
          jobId: workflowJob.jobId,
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          jobId: workflowJob.jobId,
          sourceModuleId: platformModuleId.notificationCenter,
          kind: workflowJobKind.notificationCenterEmailDigest,
          trigger: workflowJobTrigger.moduleEvent,
          status: workflowJobStatus.completed,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          attempts: 1,
        }),
      );
      expect(emailDelivery.sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          requestContext: organizationRequestContext,
          recipient: billingInvoiceReadyRequest.recipient,
          template: billingInvoiceReadyDigestEmailTemplateTrackingId,
          subject: expect.stringContaining("invoice"),
          html: expect.stringContaining("inv_2026_04"),
          text: expect.stringContaining("$80.00"),
        }),
      );
      expect(
        notificationCenterDouble.queueEmailNotification,
      ).toHaveBeenCalledWith({
        recipient: billingInvoiceReadyRequest.recipient,
        template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        subject: expect.stringContaining("invoice"),
      });
      expect(
        notificationCenterDouble.digestRuns.get(digestRun.digestRunId),
      ).toMatchObject({
        digestRunId: digestRun.digestRunId,
        status: notificationCenterDigestRunStatus.queued,
        itemCount: 2,
        emailDeliveryMessageId: "postal_msg_digest_1",
        queueReceiptId: "novu_digest_notification_1",
        completedAt: "2026-05-08T10:15:02.000Z",
      });
      expect(
        Array.from(notificationCenterDouble.digestCandidates.values()),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            candidateId: `${digestRun.digestRunId}:candidate_1`,
            digestedAt: "2026-05-08T10:15:02.000Z",
          }),
          expect.objectContaining({
            candidateId: `${digestRun.digestRunId}:candidate_2`,
            digestedAt: "2026-05-08T10:15:02.000Z",
          }),
        ]),
      );
      expect(notificationCenterDouble.createEmailReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: digestRun.digestRunId,
          channel: notificationCenterChannel.email,
          recipient: billingInvoiceReadyRequest.recipient,
          template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
          status: notificationCenterReceiptStatus.queued,
          emailDeliveryMessageId: "postal_msg_digest_1",
          queueReceiptId: "novu_digest_notification_1",
        }),
      );
      expect(workflowJobsDouble.jobs.get(workflowJob.jobId)).toMatchObject({
        jobId: workflowJob.jobId,
        status: workflowJobStatus.completed,
        attempts: 1,
        completedAt: "2026-05-08T10:15:02.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("blocks digest workflow jobs and leaves candidates pending when digest email delivery fails before provider handoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:15:01.000Z"));

    try {
      const runtimeConfig = await createRuntimeConfigService([]);
      const emailDelivery = {
        sendTransactionalEmail: vi.fn(() =>
          Effect.fail({
            _tag: "EmailDeliveryModuleDisabledError",
            scope: platformScope.organization,
            scopeId: "org_1",
          } as const),
        ),
      };
      const digestRun: NotificationCenterDigestRunRecord = {
        digestRunId:
          "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: billingInvoiceReadyRequest.recipient,
        channel: notificationCenterChannel.email,
        template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        scheduledAt: "2026-05-08T10:15:00.000Z",
        status: notificationCenterDigestRunStatus.scheduled,
        itemCount: 0,
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:07:00.000Z",
      };
      const digestCandidates: readonly NotificationCenterDigestCandidateRecord[] =
        [
          {
            candidateId: `${digestRun.digestRunId}:candidate_1`,
            sourceNotificationId:
              "notification-center:organization:org_1:invoice_1",
            digestRunId: digestRun.digestRunId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            channel: notificationCenterChannel.email,
            recipient: billingInvoiceReadyRequest.recipient,
            sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
            digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
            windowEndsAt: digestRun.scheduledAt,
            invoiceNumber: "inv_2026_04",
            invoiceUrl:
              "https://product.example.com/billing/invoices/inv_2026_04",
            dueAt: "2026-04-30T00:00:00.000Z",
            totalDue: "$120.00",
            createdAt: "2026-05-08T10:07:00.000Z",
            updatedAt: "2026-05-08T10:07:00.000Z",
          },
          {
            candidateId: `${digestRun.digestRunId}:candidate_2`,
            sourceNotificationId:
              "notification-center:organization:org_1:invoice_2",
            digestRunId: digestRun.digestRunId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            channel: notificationCenterChannel.email,
            recipient: billingInvoiceReadyRequest.recipient,
            sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
            digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
            windowEndsAt: digestRun.scheduledAt,
            invoiceNumber: "inv_2026_05",
            invoiceUrl:
              "https://product.example.com/billing/invoices/inv_2026_05",
            dueAt: "2026-05-31T00:00:00.000Z",
            totalDue: "$80.00",
            createdAt: "2026-05-08T10:07:30.000Z",
            updatedAt: "2026-05-08T10:07:30.000Z",
          },
        ];
      const notificationCenterDouble =
        createNotificationCenterModuleServiceDouble({
          digestRuns: [digestRun],
          digestCandidates,
        });
      const workflowJob: NotificationCenterEmailDigestWorkflowJobRecord = {
        jobId:
          "workflow-jobs:notification-center-email-digest:module-event:organization:org_1:notification-center-digest-run-1",
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.notificationCenter,
        kind: workflowJobKind.notificationCenterEmailDigest,
        trigger: workflowJobTrigger.moduleEvent,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 0,
        scheduledAt: digestRun.scheduledAt,
        payload: {
          sourceModuleId: platformModuleId.notificationCenter,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: organizationRequestContext,
          ...(organizationRequestContext.actorId === undefined
            ? {}
            : { actorId: organizationRequestContext.actorId }),
          correlationId: organizationRequestContext.correlationId,
          digestRunId: digestRun.digestRunId,
          recipient: billingInvoiceReadyRequest.recipient,
          channel: notificationCenterChannel.email,
          template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        },
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:07:00.000Z",
      };
      const workflowJobsDouble = createNotificationCenterWorkflowJobsDouble({
        jobs: [workflowJob],
      });
      const service = await Effect.runPromise(
        makeNotificationCenterService({
          emailDelivery,
          notificationCenter: notificationCenterDouble.service,
          workflowJobs: workflowJobsDouble.service,
        }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
      );

      const result = await Effect.runPromise(
        service.runNotificationCenterEmailDigestWorkflowJob({
          jobId: workflowJob.jobId,
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          jobId: workflowJob.jobId,
          sourceModuleId: platformModuleId.notificationCenter,
          kind: workflowJobKind.notificationCenterEmailDigest,
          trigger: workflowJobTrigger.moduleEvent,
          status: workflowJobStatus.blocked,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          attempts: 1,
          gapReason: workflowJobGapReason.repairFailed,
        }),
      );
      expect(emailDelivery.sendTransactionalEmail).toHaveBeenCalledTimes(1);
      expect(
        notificationCenterDouble.queueEmailNotification,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.createEmailReceipt,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.digestRuns.get(digestRun.digestRunId),
      ).toMatchObject({
        digestRunId: digestRun.digestRunId,
        status: notificationCenterDigestRunStatus.failed,
        itemCount: 2,
        failureSummary:
          "Notification-center digest delivery failed before queue handoff.",
        startedAt: "2026-05-08T10:15:01.000Z",
        completedAt: "2026-05-08T10:15:01.000Z",
      });
      expect(
        Array.from(notificationCenterDouble.digestCandidates.values()),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            candidateId: `${digestRun.digestRunId}:candidate_1`,
          }),
          expect.objectContaining({
            candidateId: `${digestRun.digestRunId}:candidate_2`,
          }),
        ]),
      );
      expect(
        notificationCenterDouble.digestCandidates.get(
          `${digestRun.digestRunId}:candidate_1`,
        ),
      ).not.toHaveProperty("digestedAt");
      expect(
        notificationCenterDouble.digestCandidates.get(
          `${digestRun.digestRunId}:candidate_1`,
        ),
      ).not.toHaveProperty("canceledAt");
      expect(
        notificationCenterDouble.digestCandidates.get(
          `${digestRun.digestRunId}:candidate_2`,
        ),
      ).not.toHaveProperty("digestedAt");
      expect(
        notificationCenterDouble.digestCandidates.get(
          `${digestRun.digestRunId}:candidate_2`,
        ),
      ).not.toHaveProperty("canceledAt");
      expect(workflowJobsDouble.jobs.get(workflowJob.jobId)).toMatchObject({
        jobId: workflowJob.jobId,
        status: workflowJobStatus.blocked,
        attempts: 1,
        gapReason: workflowJobGapReason.repairFailed,
        lastError:
          "Notification-center digest delivery failed before queue handoff.",
        completedAt: "2026-05-08T10:15:01.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("pretty-prints claimed digest workflow recovery failures when candidate loading fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:15:01.000Z"));

    try {
      const runtimeConfig = await createRuntimeConfigService([]);
      const emailDelivery = {
        sendTransactionalEmail: vi.fn(() =>
          Effect.die("Unexpected digest email delivery call."),
        ),
      };
      const digestRun: NotificationCenterDigestRunRecord = {
        digestRunId:
          "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: billingInvoiceReadyRequest.recipient,
        channel: notificationCenterChannel.email,
        template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        scheduledAt: "2026-05-08T10:15:00.000Z",
        status: notificationCenterDigestRunStatus.scheduled,
        itemCount: 0,
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:07:00.000Z",
      };
      const notificationCenterDouble =
        createNotificationCenterModuleServiceDouble({
          digestRuns: [digestRun],
        });
      notificationCenterDouble.listDigestCandidatesByDigestRun.mockImplementation(
        () =>
          Effect.fail({
            _tag: "NotificationCenterPostgresRepositoryQueryError",
            operation: "listDigestCandidatesByDigestRun",
            cause: "digest candidate query unavailable",
          }),
      );
      const workflowJob: NotificationCenterEmailDigestWorkflowJobRecord = {
        jobId:
          "workflow-jobs:notification-center-email-digest:module-event:organization:org_1:notification-center-digest-run-claim-failure",
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.notificationCenter,
        kind: workflowJobKind.notificationCenterEmailDigest,
        trigger: workflowJobTrigger.moduleEvent,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 0,
        scheduledAt: digestRun.scheduledAt,
        payload: {
          sourceModuleId: platformModuleId.notificationCenter,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: organizationRequestContext,
          ...(organizationRequestContext.actorId === undefined
            ? {}
            : { actorId: organizationRequestContext.actorId }),
          correlationId: organizationRequestContext.correlationId,
          digestRunId: digestRun.digestRunId,
          recipient: billingInvoiceReadyRequest.recipient,
          channel: notificationCenterChannel.email,
          template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        },
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:07:00.000Z",
      };
      const workflowJobsDouble = createNotificationCenterWorkflowJobsDouble({
        jobs: [workflowJob],
      });
      const service = await Effect.runPromise(
        makeNotificationCenterService({
          emailDelivery,
          notificationCenter: notificationCenterDouble.service,
          workflowJobs: workflowJobsDouble.service,
        }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
      );

      const result = await Effect.runPromise(
        service.runNotificationCenterEmailDigestWorkflowJob({
          jobId: workflowJob.jobId,
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          jobId: workflowJob.jobId,
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
        }),
      );
      expect(
        notificationCenterDouble.listDigestCandidatesByDigestRun,
      ).toHaveBeenCalledWith({
        digestRunId: digestRun.digestRunId,
      });
      expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.queueEmailNotification,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.createEmailReceipt,
      ).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.digestRuns.get(digestRun.digestRunId),
      ).toMatchObject({
        digestRunId: digestRun.digestRunId,
        status: notificationCenterDigestRunStatus.scheduled,
        itemCount: 0,
      });
      expect(workflowJobsDouble.jobs.get(workflowJob.jobId)).toMatchObject({
        jobId: workflowJob.jobId,
        status: workflowJobStatus.blocked,
        attempts: 1,
        gapReason: workflowJobGapReason.repairFailed,
        completedAt: "2026-05-08T10:15:01.000Z",
        lastError: expect.stringContaining(
          "digest candidate query unavailable",
        ),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a partial-success result when billing invoice delivery succeeds but notification queueing fails", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const emailDelivery = {
      sendTransactionalEmail: vi.fn(() =>
        Effect.succeed({
          messageId: "postal_msg_notification",
          recipient: "customer@example.com",
          status: "queued" as const,
          sentAt: "2026-04-27T13:00:00.000Z",
          provider: platformAdapterServiceName.postal,
        }),
      ),
    };
    const queueFailure = Schema.decodeUnknown(
      Schema.Struct({
        status: Schema.Literal("queued"),
      }),
    )({
      status: "failed",
    }) as ReturnType<NotificationCenterModuleService["queueEmailNotification"]>;
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble();
    notificationCenterDouble.queueEmailNotification.mockImplementation(
      () => queueFailure,
    );
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );

    const result = await Effect.runPromise(
      service.dispatchBillingInvoiceReadyNotification(
        billingInvoiceReadyRequest,
      ),
    );

    expect(result).toMatchObject({
      notification: {
        status: "queue-failed",
        notificationId: expect.stringMatching(
          /^notification-center:organization:org_1:/,
        ),
        error: expect.objectContaining({
          _tag: "ParseError",
        }),
      },
      delivery: expect.objectContaining({
        messageId: "postal_msg_notification",
        provider: platformAdapterServiceName.postal,
      }),
    });
    expect(emailDelivery.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(
      notificationCenterDouble.queueEmailNotification,
    ).toHaveBeenCalledTimes(1);
    expect(notificationCenterDouble.createEmailReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: notificationCenterChannel.email,
        status: notificationCenterReceiptStatus.queueFailed,
        recipient: billingInvoiceReadyRequest.recipient,
        template: emailDeliveryTemplateId.billingInvoiceReady,
        emailDeliveryMessageId: "postal_msg_notification",
        queueFailureSummary:
          "Notification queue receipt did not match the expected schema.",
      }),
    );
  });

  it("returns the queued dispatch result when receipt persistence fails after delivery and queue side effects", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const emailDelivery = {
      sendTransactionalEmail: vi.fn(() =>
        Effect.succeed({
          messageId: "postal_msg_notification",
          recipient: "customer@example.com",
          status: "queued" as const,
          sentAt: "2026-04-27T13:00:00.000Z",
          provider: platformAdapterServiceName.postal,
        }),
      ),
    };
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble();
    notificationCenterDouble.createEmailReceipt.mockImplementation(() =>
      Effect.fail({
        _tag: "NotificationCenterPostgresRepositoryQueryError",
        operation: "createEmailReceipt",
        cause: new Error("database unavailable"),
      }),
    );
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );

    const result = await Effect.runPromise(
      service.dispatchBillingInvoiceReadyNotification(
        billingInvoiceReadyRequest,
      ),
    );

    expect(result).toMatchObject({
      notification: {
        status: "queued",
        receipt: expect.objectContaining({
          id: "novu_notification_1",
        }),
      },
      delivery: expect.objectContaining({
        messageId: "postal_msg_notification",
      }),
    });
    expect(
      notificationCenterDouble.queueEmailNotification,
    ).toHaveBeenCalledTimes(1);
    expect(notificationCenterDouble.createEmailReceipt).toHaveBeenCalledTimes(
      1,
    );
  });

  it("suppresses billing invoice notifications when the exact email preference is disabled", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const emailDelivery = {
      sendTransactionalEmail: vi.fn(() =>
        Effect.succeed({
          messageId: "postal_msg_notification",
          recipient: "customer@example.com",
          status: "queued" as const,
          sentAt: "2026-04-27T13:00:00.000Z",
          provider: platformAdapterServiceName.postal,
        }),
      ),
    };
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble({
        emailPreferences: [
          {
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            channel: notificationCenterChannel.email,
            recipient: billingInvoiceReadyRequest.recipient,
            template: emailDeliveryTemplateId.billingInvoiceReady,
            enabled: false,
            updatedBy: "usr_support_1",
            createdAt: "2026-05-07T01:00:00.000Z",
            updatedAt: "2026-05-07T01:00:00.000Z",
          },
        ],
      });
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );

    const result = await Effect.runPromise(
      service.dispatchBillingInvoiceReadyNotification(
        billingInvoiceReadyRequest,
      ),
    );

    expect(result).toEqual({
      notification: {
        status: "suppressed",
        notificationId: expect.stringMatching(
          /^notification-center:organization:org_1:/,
        ),
        reason:
          "Notification delivery was suppressed because the exact email preference is disabled.",
      },
    });
    expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(
      notificationCenterDouble.queueEmailNotification,
    ).not.toHaveBeenCalled();
    expect(notificationCenterDouble.createEmailReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: notificationCenterChannel.email,
        status: notificationCenterReceiptStatus.suppressed,
        recipient: billingInvoiceReadyRequest.recipient,
        template: emailDeliveryTemplateId.billingInvoiceReady,
        suppressionReason:
          "Notification delivery was suppressed because the exact email preference is disabled.",
      }),
    );
  });

  it("fails suppressed dispatch when the suppressed receipt cannot be persisted", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const emailDelivery = {
      sendTransactionalEmail: vi.fn(() =>
        Effect.succeed({
          messageId: "postal_msg_notification",
          recipient: "customer@example.com",
          status: "queued" as const,
          sentAt: "2026-04-27T13:00:00.000Z",
          provider: platformAdapterServiceName.postal,
        }),
      ),
    };
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble({
        emailPreferences: [
          {
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            channel: notificationCenterChannel.email,
            recipient: billingInvoiceReadyRequest.recipient,
            template: emailDeliveryTemplateId.billingInvoiceReady,
            enabled: false,
            updatedBy: "usr_support_1",
            createdAt: "2026-05-07T01:00:00.000Z",
            updatedAt: "2026-05-07T01:00:00.000Z",
          },
        ],
      });
    notificationCenterDouble.createEmailReceipt.mockImplementation(() =>
      Effect.fail({
        _tag: "NotificationCenterPostgresRepositoryQueryError",
        operation: "createEmailReceipt",
        cause: new Error("database unavailable"),
      }),
    );
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.dispatchBillingInvoiceReadyNotification(
          billingInvoiceReadyRequest,
        ),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "NotificationCenterPostgresRepositoryQueryError",
        operation: "createEmailReceipt",
      },
    });
    expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(
      notificationCenterDouble.queueEmailNotification,
    ).not.toHaveBeenCalled();
  });

  it("rejects billing invoice dispatch when the notification-center module is disabled", async () => {
    const runtimeConfig = await createRuntimeConfigService([
      {
        moduleId: platformModuleId.notificationCenter,
        key: notificationCenterFeatureFlag.enabled,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: false,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt: "2026-04-27T13:30:00.000Z",
      },
    ]);
    const emailDelivery = {
      sendTransactionalEmail: vi.fn(),
    };
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble();
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.dispatchBillingInvoiceReadyNotification(
          billingInvoiceReadyRequest,
        ),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "NotificationCenterDisabledError",
        scope: platformScope.organization,
        scopeId: "org_1",
      } satisfies NotificationCenterDisabledError,
    });
    expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(
      notificationCenterDouble.queueEmailNotification,
    ).not.toHaveBeenCalled();
    expect(notificationCenterDouble.createEmailReceipt).not.toHaveBeenCalled();
  });

  it("surfaces missing feature-flag declarations as a typed service error for billing invoice dispatch", async () => {
    const originalFindModuleManifest = config.findModuleManifest;
    const runtimeConfig = await createRuntimeConfigService([]);
    const emailDelivery = {
      sendTransactionalEmail: vi.fn(),
    };
    const notificationCenterDouble =
      createNotificationCenterModuleServiceDouble();
    const service = await Effect.runPromise(
      makeNotificationCenterService({
        emailDelivery,
        notificationCenter: notificationCenterDouble.service,
      }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
    );
    const manifestSpy = vi
      .spyOn(config, "findModuleManifest")
      .mockImplementation((moduleId) => {
        const manifest = originalFindModuleManifest(moduleId);

        if (
          moduleId !== platformModuleId.notificationCenter ||
          manifest === undefined
        ) {
          return manifest;
        }

        return {
          ...manifest,
          featureFlags: manifest.featureFlags.filter(
            (flag) => flag.key !== notificationCenterFeatureFlag.enabled,
          ),
        };
      });

    try {
      const result = await Effect.runPromise(
        Effect.either(
          service.dispatchBillingInvoiceReadyNotification(
            billingInvoiceReadyRequest,
          ),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "NotificationCenterDeclarationMissingError",
          moduleId: platformModuleId.notificationCenter,
          key: notificationCenterFeatureFlag.enabled,
        } satisfies NotificationCenterDeclarationMissingError,
      });
      expect(emailDelivery.sendTransactionalEmail).not.toHaveBeenCalled();
      expect(
        notificationCenterDouble.queueEmailNotification,
      ).not.toHaveBeenCalled();
    } finally {
      manifestSpy.mockRestore();
    }
  });
});
