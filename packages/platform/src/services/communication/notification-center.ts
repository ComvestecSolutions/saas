import {
  findModuleManifest,
  notificationCenterConfigKey,
  notificationCenterFeatureFlag,
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
} from "@comvestec/config";
import {
  AbsoluteRedirectUriSchema,
  emailDeliveryTemplateId,
  IsoTimestampSchema,
  notificationCenterChannel,
  type NotificationCenterDigestCandidateRecord,
  NotificationCenterDigestCandidateRecordSchema,
  type NotificationCenterDigestRunRecord,
  NotificationCenterDigestRunRecordSchema,
  notificationCenterDigestRunStatus,
  notificationCenterReceiptStatus,
  type RequestContext,
  RequestContextSchema,
  platformModuleId,
  type WorkflowJobSummary,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  buildNotificationCenterPostgresQueryable,
  buildWorkflowJobsPostgresQueryable,
  buildNotificationCenterEmailDigestWorkflowJobId,
  buildWorkflowJobSummary,
  makeNotificationCenterModule,
  makeNotificationCenterPostgresRepository,
  makeRuntimeConfigModule,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  type NotificationCenterEmailDigestWorkflowJobRecord,
  NotificationCenterEmailDigestWorkflowJobRecordSchema,
  type NotificationCenterPostgresRepositoryError,
  type RuntimeConfigModulePersistenceError,
  RuntimeConfigModule,
  NotificationCenterPostgresRepository,
  type WorkflowJobsPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  workflowJobRuntime,
} from "@comvestec/modules";
import { Cause, Effect, ParseResult, Schema } from "effect";
import type {
  EmailDeliveryService,
  EmailDeliveryServiceError,
} from "./email-delivery";
import type { NotificationCenterModuleService } from "@comvestec/modules";
import type {
  NovuAdapterError,
  NovuNotificationDispatchReceipt,
  PostalSendEmailReceipt,
} from "@comvestec/platform";
import {
  type AuthenticatedConvexWorkflowClient,
  type ConvexScheduledWorkflowDispatch,
  makeAuthenticatedConvexWorkflowClient,
  NovuAdapter,
  makeNovuAdapter,
  makePostgresAdapter,
} from "../../adapters";
import {
  renderBillingInvoiceReadyDigestEmailTemplate,
  renderBillingInvoiceReadyEmailTemplate,
} from "./email-delivery-templates";
import {
  makeEmailDeliveryRuntime,
  resolveEmailDeliveryRuntimeOptionsFromEnvironment,
} from "./email-delivery";
import { resolveSubscriberJourneyRuntimeOptionsFromEnvironment } from "../domains/subscriber-journey";
import { executeWorkflowJobRecord } from "../domains/workflow-jobs";
import { buildWriteDatabase } from "../postgres-write-database";

export const DispatchBillingInvoiceReadyNotificationRequestSchema =
  Schema.Struct({
    requestContext: RequestContextSchema,
    recipient: Schema.NonEmptyString,
    invoiceNumber: Schema.NonEmptyString,
    invoiceUrl: AbsoluteRedirectUriSchema,
    dueAt: IsoTimestampSchema,
    totalDue: Schema.NonEmptyString,
  });

export type DispatchBillingInvoiceReadyNotificationRequest = Schema.Schema.Type<
  typeof DispatchBillingInvoiceReadyNotificationRequestSchema
>;

export const RunNotificationCenterEmailDigestWorkflowJobRequestSchema =
  Schema.Struct({
    jobId: Schema.NonEmptyString,
  });

export type RunNotificationCenterEmailDigestWorkflowJobRequest =
  Schema.Schema.Type<
    typeof RunNotificationCenterEmailDigestWorkflowJobRequestSchema
  >;

export const NotificationQueueOutcomeSchema = Schema.Union(
  Schema.Struct({
    status: Schema.Literal("queued"),
    notificationId: Schema.NonEmptyString,
    receipt: Schema.Any,
  }),
  Schema.Struct({
    status: Schema.Literal("queue-failed"),
    notificationId: Schema.NonEmptyString,
    error: Schema.Any,
  }),
);

export const NotificationSuppressedOutcomeSchema = Schema.Struct({
  status: Schema.Literal("suppressed"),
  notificationId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
});

export const NotificationDigestScheduledOutcomeSchema = Schema.Struct({
  status: Schema.Literal("scheduled"),
  notificationId: Schema.NonEmptyString,
  digestRunId: Schema.NonEmptyString,
  windowEndsAt: IsoTimestampSchema,
});

export const NotificationEmailDispatchResultSchema = Schema.Union(
  Schema.Struct({
    notification: NotificationQueueOutcomeSchema,
    delivery: Schema.Any,
  }),
  Schema.Struct({
    notification: NotificationSuppressedOutcomeSchema,
  }),
  Schema.Struct({
    notification: NotificationDigestScheduledOutcomeSchema,
  }),
);

export type NotificationQueueOutcome =
  | {
      readonly status: "queued";
      readonly notificationId: string;
      readonly receipt: NovuNotificationDispatchReceipt;
    }
  | {
      readonly status: "queue-failed";
      readonly notificationId: string;
      readonly error: NovuAdapterError;
    };

export type NotificationSuppressedOutcome = {
  readonly status: "suppressed";
  readonly notificationId: string;
  readonly reason: string;
};

export type NotificationDigestScheduledOutcome = {
  readonly status: "scheduled";
  readonly notificationId: string;
  readonly digestRunId: string;
  readonly windowEndsAt: string;
};

export type NotificationEmailDispatchResult =
  | {
      readonly notification: NotificationQueueOutcome;
      readonly delivery: PostalSendEmailReceipt;
    }
  | {
      readonly notification: NotificationSuppressedOutcome;
    }
  | {
      readonly notification: NotificationDigestScheduledOutcome;
    };

type NotificationCenterWorkflowJobsRepository = Pick<
  WorkflowJobsPostgresRepositoryServiceForRecord<NotificationCenterEmailDigestWorkflowJobRecord>,
  "claimScheduledWorkflowJob" | "getWorkflowJob" | "persistWorkflowJob"
>;

type NotificationCenterWorkflowSchedulerClient = Pick<
  AuthenticatedConvexWorkflowClient,
  "scheduleNotificationCenterEmailDigestWorkflowJob"
>;

export type NotificationCenterServiceOptions = {
  readonly notificationCenter: Pick<
    NotificationCenterModuleService,
    | "createEmailReceipt"
    | "findDigestRun"
    | "findEmailPreference"
    | "listDigestCandidatesByDigestRun"
    | "queueEmailNotification"
    | "upsertDigestCandidate"
    | "upsertDigestRun"
  >;
  readonly emailDelivery: Pick<EmailDeliveryService, "sendTransactionalEmail">;
  readonly workflowJobs?: NotificationCenterWorkflowJobsRepository;
  readonly convexWorkflowClient?: NotificationCenterWorkflowSchedulerClient;
};

export type NotificationCenterDisabledError = {
  readonly _tag: "NotificationCenterDisabledError";
  readonly scope: RequestContext["tenant"]["scope"];
  readonly scopeId: RequestContext["tenant"]["scopeId"];
};

export type NotificationCenterDeclarationMissingError = {
  readonly _tag: "NotificationCenterDeclarationMissingError";
  readonly moduleId: typeof platformModuleId.notificationCenter;
  readonly key: string;
};

export type NotificationCenterWorkflowUnavailableError = {
  readonly _tag: "NotificationCenterWorkflowUnavailableError";
  readonly dependency: "workflowJobs" | "convexWorkflowClient";
};

export type NotificationCenterWorkflowDispatchError = {
  readonly _tag: "NotificationCenterWorkflowDispatchError";
  readonly operation: "scheduleNotificationCenterEmailDigestWorkflowJob";
  readonly cause: unknown;
};

export type NotificationCenterServiceError =
  | ParseResult.ParseError
  | NotificationCenterPostgresRepositoryError
  | RuntimeConfigModulePersistenceError
  | EmailDeliveryServiceError
  | NotificationCenterDisabledError
  | NotificationCenterDeclarationMissingError
  | NotificationCenterWorkflowDispatchError
  | NotificationCenterWorkflowUnavailableError
  | WorkflowJobsPostgresRepositoryError;

export type NotificationCenterService = {
  readonly dispatchBillingInvoiceReadyNotification: (
    input: DispatchBillingInvoiceReadyNotificationRequest,
  ) => Effect.Effect<
    NotificationEmailDispatchResult,
    NotificationCenterServiceError
  >;
  readonly runNotificationCenterEmailDigestWorkflowJob: (
    input: RunNotificationCenterEmailDigestWorkflowJobRequest,
  ) => Effect.Effect<
    WorkflowJobSummary | undefined,
    NotificationCenterServiceError
  >;
};

const requireNotificationCenterFlag = () =>
  Effect.fromNullable(
    findModuleManifest(platformModuleId.notificationCenter)?.featureFlags.find(
      (flag) => flag.key === notificationCenterFeatureFlag.enabled,
    ),
  ).pipe(
    Effect.orElseFail(
      () =>
        ({
          _tag: "NotificationCenterDeclarationMissingError",
          moduleId: platformModuleId.notificationCenter,
          key: notificationCenterFeatureFlag.enabled,
        }) satisfies NotificationCenterDeclarationMissingError,
    ),
  );

const createNotificationId = (requestContext: RequestContext) =>
  `notification-center:${requestContext.tenant.scope}:${requestContext.tenant.scopeId}:${crypto.randomUUID()}`;

const buildQueueFailureSummary = () =>
  "Notification queue receipt did not match the expected schema.";

const buildSuppressionReason = () =>
  "Notification delivery was suppressed because the exact email preference is disabled.";

const normalizeNotificationRecipient = (recipient: string) =>
  recipient.trim().toLowerCase();

const buildDigestCandidateId = (notificationId: string) =>
  `${notificationId}:digest-candidate`;

const buildDigestWindowEndsAt = (input: {
  readonly intervalMinutes: number;
  readonly now: string;
}) => {
  const intervalMilliseconds = input.intervalMinutes * 60_000;
  const nextWindowBoundary =
    (Math.floor(Date.parse(input.now) / intervalMilliseconds) + 1) *
    intervalMilliseconds;

  return new Date(nextWindowBoundary).toISOString();
};

const buildDigestRunId = (input: {
  readonly requestContext: RequestContext;
  readonly channel: typeof notificationCenterChannel.email;
  readonly recipient: string;
  readonly template: typeof emailDeliveryTemplateId.billingInvoiceReadyDigest;
  readonly windowEndsAt: string;
}) =>
  [
    "notification-center",
    "digest-run",
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
    input.channel,
    normalizeNotificationRecipient(input.recipient),
    input.template,
    input.windowEndsAt,
  ].join(":");

const buildDigestRunSchemaInput = (run: NotificationCenterDigestRunRecord) => ({
  digestRunId: run.digestRunId,
  tenantScope: run.tenantScope,
  tenantScopeId: run.tenantScopeId,
  recipient: run.recipient,
  channel: run.channel,
  template: run.template,
  scheduledAt: run.scheduledAt,
  ...(run.startedAt !== undefined ? { startedAt: run.startedAt } : {}),
  ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
  status: run.status,
  itemCount: run.itemCount,
  ...(run.emailDeliveryMessageId !== undefined
    ? { emailDeliveryMessageId: run.emailDeliveryMessageId }
    : {}),
  ...(run.queueReceiptId !== undefined
    ? { queueReceiptId: run.queueReceiptId }
    : {}),
  ...(run.failureSummary !== undefined
    ? { failureSummary: run.failureSummary }
    : {}),
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
});

const buildDigestCandidateSchemaInput = (
  candidate: NotificationCenterDigestCandidateRecord,
) => ({
  candidateId: candidate.candidateId,
  sourceNotificationId: candidate.sourceNotificationId,
  digestRunId: candidate.digestRunId,
  tenantScope: candidate.tenantScope,
  tenantScopeId: candidate.tenantScopeId,
  channel: candidate.channel,
  recipient: candidate.recipient,
  sourceTemplate: candidate.sourceTemplate,
  digestTemplate: candidate.digestTemplate,
  windowEndsAt: candidate.windowEndsAt,
  invoiceNumber: candidate.invoiceNumber,
  invoiceUrl: candidate.invoiceUrl,
  dueAt: candidate.dueAt,
  totalDue: candidate.totalDue,
  ...(candidate.digestedAt !== undefined
    ? { digestedAt: candidate.digestedAt }
    : {}),
  ...(candidate.canceledAt !== undefined
    ? { canceledAt: candidate.canceledAt }
    : {}),
  createdAt: candidate.createdAt,
  updatedAt: candidate.updatedAt,
});

const buildWorkflowJobSchemaInput = (
  job: NotificationCenterEmailDigestWorkflowJobRecord,
) => ({
  jobId: job.jobId,
  runtime: job.runtime,
  sourceModuleId: job.sourceModuleId,
  kind: job.kind,
  trigger: job.trigger,
  status: job.status,
  tenantScope: job.tenantScope,
  tenantScopeId: job.tenantScopeId,
  attempts: job.attempts,
  scheduledAt: job.scheduledAt,
  ...(job.completedAt !== undefined ? { completedAt: job.completedAt } : {}),
  ...(job.lastError !== undefined ? { lastError: job.lastError } : {}),
  ...(job.gapReason !== undefined ? { gapReason: job.gapReason } : {}),
  payload: {
    sourceModuleId: job.payload.sourceModuleId,
    tenantScope: job.payload.tenantScope,
    tenantScopeId: job.payload.tenantScopeId,
    requestContext: job.payload.requestContext,
    ...(job.payload.actorId !== undefined
      ? { actorId: job.payload.actorId }
      : {}),
    correlationId: job.payload.correlationId,
    digestRunId: job.payload.digestRunId,
    recipient: job.payload.recipient,
    channel: job.payload.channel,
    template: job.payload.template,
    ...(job.payload.dispatch !== undefined
      ? { dispatch: job.payload.dispatch }
      : {}),
  },
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

const buildNotificationCenterEmailDigestWorkflowDispatchRecord = (input: {
  readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
  readonly now: string;
  readonly dispatch: ConvexScheduledWorkflowDispatch;
}) =>
  Schema.decodeUnknown(NotificationCenterEmailDigestWorkflowJobRecordSchema)({
    ...buildWorkflowJobSchemaInput(input.job),
    payload: {
      ...input.job.payload,
      dispatch: {
        scheduledAt: input.job.scheduledAt,
        scheduledFunctionId: input.dispatch.scheduledFunctionId,
        scheduledFunctionIds: input.dispatch.scheduledFunctionIds,
        primaryScheduled: input.dispatch.primaryScheduled,
        scheduledRecoveryAttemptCount:
          input.dispatch.scheduledRecoveryAttemptCount,
        expectedRecoveryAttemptCount:
          input.dispatch.expectedRecoveryAttemptCount,
      },
    },
    updatedAt: input.now,
  });

const buildScheduledDigestRunRecord = (input: {
  readonly digestRunId: string;
  readonly requestContext: RequestContext;
  readonly recipient: string;
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    digestRunId: input.digestRunId,
    tenantScope: input.requestContext.tenant.scope,
    tenantScopeId: input.requestContext.tenant.scopeId,
    recipient: input.recipient,
    channel: notificationCenterChannel.email,
    template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
    scheduledAt: input.scheduledAt,
    status: notificationCenterDigestRunStatus.scheduled,
    itemCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
  });

const refreshDigestRunRecord = (input: {
  readonly run: NotificationCenterDigestRunRecord;
  readonly itemCount: number;
  readonly updatedAt: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    ...buildDigestRunSchemaInput(input.run),
    itemCount: input.itemCount,
    updatedAt: input.updatedAt,
  });

const beginDigestRunRecord = (input: {
  readonly run: NotificationCenterDigestRunRecord;
  readonly itemCount: number;
  readonly now: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    digestRunId: input.run.digestRunId,
    tenantScope: input.run.tenantScope,
    tenantScopeId: input.run.tenantScopeId,
    recipient: input.run.recipient,
    channel: input.run.channel,
    template: input.run.template,
    scheduledAt: input.run.scheduledAt,
    startedAt: input.run.startedAt ?? input.now,
    status: notificationCenterDigestRunStatus.running,
    itemCount: input.itemCount,
    createdAt: input.run.createdAt,
    updatedAt: input.now,
  });

const buildQueuedDigestRunRecord = (input: {
  readonly run: NotificationCenterDigestRunRecord;
  readonly itemCount: number;
  readonly delivery: PostalSendEmailReceipt;
  readonly notification: NovuNotificationDispatchReceipt;
  readonly completedAt: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    digestRunId: input.run.digestRunId,
    tenantScope: input.run.tenantScope,
    tenantScopeId: input.run.tenantScopeId,
    recipient: input.run.recipient,
    channel: input.run.channel,
    template: input.run.template,
    scheduledAt: input.run.scheduledAt,
    startedAt: input.run.startedAt ?? input.completedAt,
    completedAt: input.completedAt,
    status: notificationCenterDigestRunStatus.queued,
    itemCount: input.itemCount,
    emailDeliveryMessageId: input.delivery.messageId,
    queueReceiptId: input.notification.id,
    createdAt: input.run.createdAt,
    updatedAt: input.completedAt,
  });

const buildQueueFailedDigestRunRecord = (input: {
  readonly run: NotificationCenterDigestRunRecord;
  readonly itemCount: number;
  readonly delivery: PostalSendEmailReceipt;
  readonly completedAt: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    digestRunId: input.run.digestRunId,
    tenantScope: input.run.tenantScope,
    tenantScopeId: input.run.tenantScopeId,
    recipient: input.run.recipient,
    channel: input.run.channel,
    template: input.run.template,
    scheduledAt: input.run.scheduledAt,
    startedAt: input.run.startedAt ?? input.completedAt,
    completedAt: input.completedAt,
    status: notificationCenterDigestRunStatus.queueFailed,
    itemCount: input.itemCount,
    emailDeliveryMessageId: input.delivery.messageId,
    failureSummary: buildQueueFailureSummary(),
    createdAt: input.run.createdAt,
    updatedAt: input.completedAt,
  });

const buildFailedDigestRunRecord = (input: {
  readonly run: NotificationCenterDigestRunRecord;
  readonly itemCount: number;
  readonly failureSummary: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    digestRunId: input.run.digestRunId,
    tenantScope: input.run.tenantScope,
    tenantScopeId: input.run.tenantScopeId,
    recipient: input.run.recipient,
    channel: input.run.channel,
    template: input.run.template,
    scheduledAt: input.run.scheduledAt,
    startedAt: input.run.startedAt ?? input.now,
    completedAt: input.now,
    status: notificationCenterDigestRunStatus.failed,
    itemCount: input.itemCount,
    failureSummary: input.failureSummary,
    createdAt: input.run.createdAt,
    updatedAt: input.now,
  });

const buildCanceledDigestRunRecord = (input: {
  readonly run: NotificationCenterDigestRunRecord;
  readonly now: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    digestRunId: input.run.digestRunId,
    tenantScope: input.run.tenantScope,
    tenantScopeId: input.run.tenantScopeId,
    recipient: input.run.recipient,
    channel: input.run.channel,
    template: input.run.template,
    scheduledAt: input.run.scheduledAt,
    ...(input.run.startedAt !== undefined
      ? { startedAt: input.run.startedAt }
      : {}),
    completedAt: input.now,
    status: notificationCenterDigestRunStatus.canceled,
    itemCount: 0,
    createdAt: input.run.createdAt,
    updatedAt: input.now,
  });

const buildDigestCandidateRecord = (input: {
  readonly notificationId: string;
  readonly digestRunId: string;
  readonly requestContext: RequestContext;
  readonly recipient: string;
  readonly windowEndsAt: string;
  readonly invoiceNumber: string;
  readonly invoiceUrl: string;
  readonly dueAt: string;
  readonly totalDue: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestCandidateRecordSchema)({
    candidateId: buildDigestCandidateId(input.notificationId),
    sourceNotificationId: input.notificationId,
    digestRunId: input.digestRunId,
    tenantScope: input.requestContext.tenant.scope,
    tenantScopeId: input.requestContext.tenant.scopeId,
    channel: notificationCenterChannel.email,
    recipient: input.recipient,
    sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
    digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
    windowEndsAt: input.windowEndsAt,
    invoiceNumber: input.invoiceNumber,
    invoiceUrl: input.invoiceUrl,
    dueAt: input.dueAt,
    totalDue: input.totalDue,
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildDigestedDigestCandidateRecord = (input: {
  readonly candidate: NotificationCenterDigestCandidateRecord;
  readonly digestedAt: string;
}) =>
  Schema.decodeUnknown(NotificationCenterDigestCandidateRecordSchema)({
    ...buildDigestCandidateSchemaInput(input.candidate),
    digestedAt: input.digestedAt,
    updatedAt: input.digestedAt,
  });

const buildNotificationCenterEmailDigestWorkflowJobRecord = (input: {
  readonly digestRunId: string;
  readonly requestContext: RequestContext;
  readonly recipient: string;
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(NotificationCenterEmailDigestWorkflowJobRecordSchema)({
    jobId: buildNotificationCenterEmailDigestWorkflowJobId({
      trigger: workflowJobTrigger.moduleEvent,
      tenantScope: input.requestContext.tenant.scope,
      tenantScopeId: input.requestContext.tenant.scopeId,
      key: input.digestRunId,
    }),
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.notificationCenter,
    kind: workflowJobKind.notificationCenterEmailDigest,
    trigger: workflowJobTrigger.moduleEvent,
    status: workflowJobStatus.scheduled,
    tenantScope: input.requestContext.tenant.scope,
    tenantScopeId: input.requestContext.tenant.scopeId,
    attempts: 0,
    scheduledAt: input.scheduledAt,
    payload: {
      sourceModuleId: platformModuleId.notificationCenter,
      tenantScope: input.requestContext.tenant.scope,
      tenantScopeId: input.requestContext.tenant.scopeId,
      requestContext: input.requestContext,
      ...(input.requestContext.actorId !== undefined
        ? { actorId: input.requestContext.actorId }
        : {}),
      correlationId: input.requestContext.correlationId,
      digestRunId: input.digestRunId,
      recipient: input.recipient,
      channel: notificationCenterChannel.email,
      template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildCompletedNotificationCenterEmailDigestWorkflowJobRecord = (input: {
  readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
  readonly now: string;
}) =>
  Schema.decodeUnknown(NotificationCenterEmailDigestWorkflowJobRecordSchema)({
    ...buildWorkflowJobSchemaInput(input.job),
    status: workflowJobStatus.completed,
    completedAt: input.now,
    updatedAt: input.now,
  });

const buildBlockedNotificationCenterEmailDigestWorkflowJobRecord = (input: {
  readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
  readonly now: string;
  readonly lastError: string;
}) =>
  Schema.decodeUnknown(NotificationCenterEmailDigestWorkflowJobRecordSchema)({
    ...buildWorkflowJobSchemaInput(input.job),
    status: workflowJobStatus.blocked,
    completedAt: input.now,
    gapReason: workflowJobGapReason.repairFailed,
    lastError: input.lastError,
    updatedAt: input.now,
  });

const shouldBlockStaleRunningNotificationCenterEmailDigestWorkflowJob = (
  job: NotificationCenterEmailDigestWorkflowJobRecord,
) =>
  job.status === workflowJobStatus.running &&
  job.attempts >= workflowJobsRetryMaxAttempts &&
  Date.parse(job.updatedAt) <=
    Date.now() - workflowJobsRunningClaimTimeoutSeconds * 1_000;

const isPendingDigestCandidate = (
  candidate: NotificationCenterDigestCandidateRecord,
) => candidate.digestedAt === undefined && candidate.canceledAt === undefined;

const isTerminalDigestRun = (run: NotificationCenterDigestRunRecord) =>
  run.status === notificationCenterDigestRunStatus.queued ||
  run.status === notificationCenterDigestRunStatus.queueFailed ||
  run.status === notificationCenterDigestRunStatus.canceled;

const readNotificationCenterDigestFailureSummary = (_error: unknown) =>
  "Notification-center digest delivery failed before queue handoff.";

const persistQueuedNotificationResult = (input: {
  readonly notificationCenter: Pick<
    NotificationCenterModuleService,
    "createEmailReceipt"
  >;
  readonly requestContext: RequestContext;
  readonly recipient: string;
  readonly notificationId: string;
  readonly notification: NovuNotificationDispatchReceipt;
  readonly delivery: PostalSendEmailReceipt;
}) => {
  const result: NotificationEmailDispatchResult = {
    notification: {
      status: "queued",
      notificationId: input.notificationId,
      receipt: input.notification,
    },
    delivery: input.delivery,
  };

  return input.notificationCenter
    .createEmailReceipt({
      notificationId: input.notificationId,
      tenantScope: input.requestContext.tenant.scope,
      tenantScopeId: input.requestContext.tenant.scopeId,
      channel: notificationCenterChannel.email,
      recipient: input.recipient,
      template: emailDeliveryTemplateId.billingInvoiceReady,
      status: notificationCenterReceiptStatus.queued,
      emailDeliveryMessageId: input.delivery.messageId,
      queueReceiptId: input.notification.id,
      createdAt: input.notification.createdAt,
      updatedAt: input.notification.createdAt,
    })
    .pipe(
      Effect.as(result),
      Effect.catchAll(() => Effect.succeed(result)),
    );
};

const persistQueueFailedNotificationResult = (input: {
  readonly notificationCenter: Pick<
    NotificationCenterModuleService,
    "createEmailReceipt"
  >;
  readonly requestContext: RequestContext;
  readonly recipient: string;
  readonly notificationId: string;
  readonly error: NovuAdapterError;
  readonly delivery: PostalSendEmailReceipt;
}) => {
  const persistedAt = new Date().toISOString();
  const result: NotificationEmailDispatchResult = {
    notification: {
      status: "queue-failed",
      notificationId: input.notificationId,
      error: input.error,
    },
    delivery: input.delivery,
  };

  return input.notificationCenter
    .createEmailReceipt({
      notificationId: input.notificationId,
      tenantScope: input.requestContext.tenant.scope,
      tenantScopeId: input.requestContext.tenant.scopeId,
      channel: notificationCenterChannel.email,
      recipient: input.recipient,
      template: emailDeliveryTemplateId.billingInvoiceReady,
      status: notificationCenterReceiptStatus.queueFailed,
      emailDeliveryMessageId: input.delivery.messageId,
      queueFailureSummary: buildQueueFailureSummary(),
      createdAt: persistedAt,
      updatedAt: persistedAt,
    })
    .pipe(
      Effect.as(result),
      Effect.catchAll(() => Effect.succeed(result)),
    );
};

const persistSuppressedNotificationResult = (input: {
  readonly notificationCenter: Pick<
    NotificationCenterModuleService,
    "createEmailReceipt"
  >;
  readonly requestContext: RequestContext;
  readonly recipient: string;
  readonly notificationId: string;
}) => {
  const persistedAt = new Date().toISOString();
  const reason = buildSuppressionReason();
  const result: NotificationEmailDispatchResult = {
    notification: {
      status: "suppressed",
      notificationId: input.notificationId,
      reason,
    },
  };

  return input.notificationCenter
    .createEmailReceipt({
      notificationId: input.notificationId,
      tenantScope: input.requestContext.tenant.scope,
      tenantScopeId: input.requestContext.tenant.scopeId,
      channel: notificationCenterChannel.email,
      recipient: input.recipient,
      template: emailDeliveryTemplateId.billingInvoiceReady,
      status: notificationCenterReceiptStatus.suppressed,
      suppressionReason: reason,
      createdAt: persistedAt,
      updatedAt: persistedAt,
    })
    .pipe(Effect.as(result));
};

export const makeNotificationCenterService = (
  options: NotificationCenterServiceOptions,
) =>
  Effect.gen(function* () {
    const runtimeConfig = yield* RuntimeConfigModule;

    const requireWorkflowJobs = () =>
      options.workflowJobs === undefined
        ? Effect.fail({
            _tag: "NotificationCenterWorkflowUnavailableError",
            dependency: "workflowJobs",
          } satisfies NotificationCenterWorkflowUnavailableError)
        : Effect.succeed(options.workflowJobs);

    const requireWorkflowScheduler = () =>
      Effect.fromNullable(
        options.convexWorkflowClient
          ?.scheduleNotificationCenterEmailDigestWorkflowJob,
      ).pipe(
        Effect.orElseFail(
          () =>
            ({
              _tag: "NotificationCenterWorkflowUnavailableError",
              dependency: "convexWorkflowClient",
            }) satisfies NotificationCenterWorkflowUnavailableError,
        ),
      );

    const resolveDigestIntervalMinutes = (requestContext: RequestContext) =>
      runtimeConfig
        .listOverridesByModule(platformModuleId.notificationCenter)
        .pipe(
          Effect.flatMap((overrides) =>
            runtimeConfig.resolveConfigValue({
              requestContext,
              moduleId: platformModuleId.notificationCenter,
              key: notificationCenterConfigKey.digestIntervalMinutes,
              overrides,
              entitlements: [],
            }),
          ),
          Effect.map((resolution) =>
            typeof resolution.effectiveValue === "number" &&
            resolution.effectiveValue > 0
              ? resolution.effectiveValue
              : 0,
          ),
        );

    const markDigestCandidatesDigested = (input: {
      readonly candidates: readonly NotificationCenterDigestCandidateRecord[];
      readonly digestedAt: string;
    }) =>
      Effect.forEach(
        input.candidates,
        (candidate) =>
          buildDigestedDigestCandidateRecord({
            candidate,
            digestedAt: input.digestedAt,
          }).pipe(
            Effect.flatMap((record) =>
              options.notificationCenter.upsertDigestCandidate(record),
            ),
          ),
        { concurrency: 1 },
      ).pipe(Effect.asVoid);

    const persistNotificationCenterEmailDigestWorkflowDispatchFailure =
      (input: {
        readonly workflowJobs: NotificationCenterWorkflowJobsRepository;
        readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
        readonly cause: Cause.Cause<unknown>;
      }) => {
        const now = new Date().toISOString();
        const dispatchError: NotificationCenterWorkflowDispatchError = {
          _tag: "NotificationCenterWorkflowDispatchError",
          operation: "scheduleNotificationCenterEmailDigestWorkflowJob",
          cause: Cause.squash(input.cause),
        };

        return buildBlockedNotificationCenterEmailDigestWorkflowJobRecord({
          job: input.job,
          now,
          lastError: Cause.pretty(input.cause),
        }).pipe(
          Effect.flatMap((blockedJob) =>
            input.workflowJobs.persistWorkflowJob(blockedJob),
          ),
          Effect.flatMap(() => Effect.fail(dispatchError)),
        );
      };

    const scheduleNotificationCenterEmailDigestWorkflowJob = (input: {
      readonly workflowJobs: NotificationCenterWorkflowJobsRepository;
      readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
    }) =>
      requireWorkflowScheduler().pipe(
        Effect.flatMap((scheduleWorkflowJob) =>
          scheduleWorkflowJob({
            jobId: input.job.jobId,
            scheduledAt: input.job.scheduledAt,
          }),
        ),
        Effect.flatMap((dispatch) =>
          buildNotificationCenterEmailDigestWorkflowDispatchRecord({
            job: input.job,
            now: new Date().toISOString(),
            dispatch,
          }),
        ),
        Effect.catchAllCause((cause) =>
          persistNotificationCenterEmailDigestWorkflowDispatchFailure({
            workflowJobs: input.workflowJobs,
            job: input.job,
            cause,
          }),
        ),
        Effect.flatMap((scheduledJob) =>
          input.workflowJobs.persistWorkflowJob(scheduledJob),
        ),
        Effect.asVoid,
      );

    const persistScheduledDigestNotificationResult = (input: {
      readonly notificationId: string;
      readonly requestContext: RequestContext;
      readonly recipient: string;
      readonly invoiceNumber: string;
      readonly invoiceUrl: string;
      readonly dueAt: string;
      readonly totalDue: string;
      readonly windowEndsAt: string;
      readonly digestRunId: string;
      readonly now: string;
    }) =>
      Effect.gen(function* () {
        const workflowJobs = yield* requireWorkflowJobs();
        const existingRun = yield* options.notificationCenter.findDigestRun({
          digestRunId: input.digestRunId,
        });
        let digestRun =
          existingRun ??
          (yield* options.notificationCenter.upsertDigestRun(
            yield* buildScheduledDigestRunRecord({
              digestRunId: input.digestRunId,
              requestContext: input.requestContext,
              recipient: input.recipient,
              scheduledAt: input.windowEndsAt,
              now: input.now,
            }),
          ));

        yield* options.notificationCenter.upsertDigestCandidate(
          yield* buildDigestCandidateRecord({
            notificationId: input.notificationId,
            digestRunId: input.digestRunId,
            requestContext: input.requestContext,
            recipient: input.recipient,
            windowEndsAt: input.windowEndsAt,
            invoiceNumber: input.invoiceNumber,
            invoiceUrl: input.invoiceUrl,
            dueAt: input.dueAt,
            totalDue: input.totalDue,
            now: input.now,
          }),
        );

        const itemCount =
          (yield* options.notificationCenter.listDigestCandidatesByDigestRun({
            digestRunId: input.digestRunId,
          })).filter(isPendingDigestCandidate).length;

        digestRun = yield* options.notificationCenter.upsertDigestRun(
          yield* refreshDigestRunRecord({
            run: digestRun,
            itemCount,
            updatedAt: new Date().toISOString(),
          }),
        );

        if (existingRun === undefined) {
          const workflowJob = yield* workflowJobs.persistWorkflowJob(
            yield* buildNotificationCenterEmailDigestWorkflowJobRecord({
              digestRunId: input.digestRunId,
              requestContext: input.requestContext,
              recipient: input.recipient,
              scheduledAt: input.windowEndsAt,
              now: input.now,
            }),
          );

          yield* scheduleNotificationCenterEmailDigestWorkflowJob({
            workflowJobs,
            job: workflowJob,
          });
        }

        return {
          notification: {
            status: "scheduled",
            notificationId: input.notificationId,
            digestRunId: digestRun.digestRunId,
            windowEndsAt: input.windowEndsAt,
          },
        } satisfies NotificationEmailDispatchResult;
      });

    const persistQueuedDigestRunResult = (input: {
      readonly run: NotificationCenterDigestRunRecord;
      readonly candidates: readonly NotificationCenterDigestCandidateRecord[];
      readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
      readonly delivery: PostalSendEmailReceipt;
      readonly notification: NovuNotificationDispatchReceipt;
    }) =>
      Effect.gen(function* () {
        const completedAt = input.notification.createdAt;
        const nextRun = yield* buildQueuedDigestRunRecord({
          run: input.run,
          itemCount: input.candidates.length,
          delivery: input.delivery,
          notification: input.notification,
          completedAt,
        });

        yield* options.notificationCenter.upsertDigestRun(nextRun);
        yield* markDigestCandidatesDigested({
          candidates: input.candidates,
          digestedAt: completedAt,
        });
        yield* options.notificationCenter
          .createEmailReceipt({
            notificationId: input.run.digestRunId,
            tenantScope: input.run.tenantScope,
            tenantScopeId: input.run.tenantScopeId,
            channel: input.run.channel,
            recipient: input.run.recipient,
            template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
            status: notificationCenterReceiptStatus.queued,
            emailDeliveryMessageId: input.delivery.messageId,
            queueReceiptId: input.notification.id,
            createdAt: completedAt,
            updatedAt: completedAt,
          })
          .pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        return yield* buildCompletedNotificationCenterEmailDigestWorkflowJobRecord(
          {
            job: input.job,
            now: completedAt,
          },
        );
      });

    const persistQueueFailedDigestRunResult = (input: {
      readonly run: NotificationCenterDigestRunRecord;
      readonly candidates: readonly NotificationCenterDigestCandidateRecord[];
      readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
      readonly delivery: PostalSendEmailReceipt;
    }) =>
      Effect.gen(function* () {
        const completedAt = new Date().toISOString();
        const nextRun = yield* buildQueueFailedDigestRunRecord({
          run: input.run,
          itemCount: input.candidates.length,
          delivery: input.delivery,
          completedAt,
        });

        yield* options.notificationCenter.upsertDigestRun(nextRun);
        yield* markDigestCandidatesDigested({
          candidates: input.candidates,
          digestedAt: completedAt,
        });
        yield* options.notificationCenter
          .createEmailReceipt({
            notificationId: input.run.digestRunId,
            tenantScope: input.run.tenantScope,
            tenantScopeId: input.run.tenantScopeId,
            channel: input.run.channel,
            recipient: input.run.recipient,
            template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
            status: notificationCenterReceiptStatus.queueFailed,
            emailDeliveryMessageId: input.delivery.messageId,
            queueFailureSummary: buildQueueFailureSummary(),
            createdAt: completedAt,
            updatedAt: completedAt,
          })
          .pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        return yield* buildCompletedNotificationCenterEmailDigestWorkflowJobRecord(
          {
            job: input.job,
            now: completedAt,
          },
        );
      });

    const persistFailedDigestRunResult = (input: {
      readonly run: NotificationCenterDigestRunRecord;
      readonly candidates: readonly NotificationCenterDigestCandidateRecord[];
      readonly job: NotificationCenterEmailDigestWorkflowJobRecord;
      readonly now: string;
      readonly error: unknown;
    }) =>
      Effect.gen(function* () {
        const failureSummary = readNotificationCenterDigestFailureSummary(
          input.error,
        );

        yield* options.notificationCenter.upsertDigestRun(
          yield* buildFailedDigestRunRecord({
            run: input.run,
            itemCount: input.candidates.length,
            failureSummary,
            now: input.now,
          }),
        );

        return yield* buildBlockedNotificationCenterEmailDigestWorkflowJobRecord(
          {
            job: input.job,
            now: input.now,
            lastError: failureSummary,
          },
        );
      });

    return {
      dispatchBillingInvoiceReadyNotification: (
        input: DispatchBillingInvoiceReadyNotificationRequest,
      ) =>
        Schema.decodeUnknown(
          DispatchBillingInvoiceReadyNotificationRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            requireNotificationCenterFlag().pipe(
              Effect.flatMap((enabledFlag) =>
                runtimeConfig
                  .listOverridesByModule(platformModuleId.notificationCenter)
                  .pipe(
                    Effect.flatMap((overrides) =>
                      runtimeConfig.resolveFeatureFlag({
                        requestContext: request.requestContext,
                        moduleId: platformModuleId.notificationCenter,
                        flag: enabledFlag,
                        overrides,
                        entitlements: [],
                      }),
                    ),
                    Effect.flatMap((enabledResolution) =>
                      enabledResolution.effectiveValue
                        ? Effect.succeed(request)
                        : Effect.fail({
                            _tag: "NotificationCenterDisabledError",
                            scope: request.requestContext.tenant.scope,
                            scopeId: request.requestContext.tenant.scopeId,
                          } satisfies NotificationCenterDisabledError),
                    ),
                  ),
              ),
              Effect.flatMap((enabledRequest) =>
                Effect.gen(function* () {
                  const notificationId = createNotificationId(
                    enabledRequest.requestContext,
                  );
                  const emailPreference =
                    yield* options.notificationCenter.findEmailPreference({
                      tenantScope: enabledRequest.requestContext.tenant.scope,
                      tenantScopeId:
                        enabledRequest.requestContext.tenant.scopeId,
                      recipient: enabledRequest.recipient,
                      template: emailDeliveryTemplateId.billingInvoiceReady,
                    });

                  if (emailPreference?.enabled === false) {
                    return yield* persistSuppressedNotificationResult({
                      notificationCenter: options.notificationCenter,
                      requestContext: enabledRequest.requestContext,
                      recipient: enabledRequest.recipient,
                      notificationId,
                    });
                  }

                  const digestIntervalMinutes =
                    yield* resolveDigestIntervalMinutes(
                      enabledRequest.requestContext,
                    );

                  if (digestIntervalMinutes > 0) {
                    const now = new Date().toISOString();
                    const windowEndsAt = buildDigestWindowEndsAt({
                      intervalMinutes: digestIntervalMinutes,
                      now,
                    });

                    return yield* persistScheduledDigestNotificationResult({
                      notificationId,
                      requestContext: enabledRequest.requestContext,
                      recipient: enabledRequest.recipient,
                      invoiceNumber: enabledRequest.invoiceNumber,
                      invoiceUrl: enabledRequest.invoiceUrl,
                      dueAt: enabledRequest.dueAt,
                      totalDue: enabledRequest.totalDue,
                      windowEndsAt,
                      digestRunId: buildDigestRunId({
                        requestContext: enabledRequest.requestContext,
                        channel: notificationCenterChannel.email,
                        recipient: enabledRequest.recipient,
                        template:
                          emailDeliveryTemplateId.billingInvoiceReadyDigest,
                        windowEndsAt,
                      }),
                      now,
                    });
                  }

                  return yield* renderBillingInvoiceReadyEmailTemplate({
                    tenant: enabledRequest.requestContext.tenant,
                    recipientEmail: enabledRequest.recipient,
                    invoiceNumber: enabledRequest.invoiceNumber,
                    invoiceUrl: enabledRequest.invoiceUrl,
                    dueAt: enabledRequest.dueAt,
                    totalDue: enabledRequest.totalDue,
                  }).pipe(
                    Effect.flatMap((renderedTemplate) =>
                      options.emailDelivery
                        .sendTransactionalEmail({
                          requestContext: enabledRequest.requestContext,
                          recipient: enabledRequest.recipient,
                          template: renderedTemplate.template,
                          subject: renderedTemplate.subject,
                          html: renderedTemplate.html,
                          text: renderedTemplate.text,
                        })
                        .pipe(
                          Effect.flatMap((delivery) =>
                            Effect.matchEffect(
                              options.notificationCenter.queueEmailNotification(
                                {
                                  recipient: enabledRequest.recipient,
                                  template:
                                    emailDeliveryTemplateId.billingInvoiceReady,
                                  subject: renderedTemplate.subject,
                                },
                              ),
                              {
                                onFailure: (error) =>
                                  persistQueueFailedNotificationResult({
                                    notificationCenter:
                                      options.notificationCenter,
                                    requestContext:
                                      enabledRequest.requestContext,
                                    recipient: enabledRequest.recipient,
                                    notificationId,
                                    error,
                                    delivery,
                                  }),
                                onSuccess: (notification) =>
                                  persistQueuedNotificationResult({
                                    notificationCenter:
                                      options.notificationCenter,
                                    requestContext:
                                      enabledRequest.requestContext,
                                    recipient: enabledRequest.recipient,
                                    notificationId,
                                    notification,
                                    delivery,
                                  }),
                              },
                            ),
                          ),
                        ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      runNotificationCenterEmailDigestWorkflowJob: (
        input: RunNotificationCenterEmailDigestWorkflowJobRequest,
      ) =>
        Schema.decodeUnknown(
          RunNotificationCenterEmailDigestWorkflowJobRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const workflowJobs = yield* requireWorkflowJobs();

              return yield* executeWorkflowJobRecord({
                jobId: request.jobId,
                loadJob: ({ jobId }) => workflowJobs.getWorkflowJob({ jobId }),
                shouldBlockStaleRunningJob: ({ job }) =>
                  shouldBlockStaleRunningNotificationCenterEmailDigestWorkflowJob(
                    job,
                  ),
                blockStaleRunningJob: ({ job }) => {
                  const now = new Date().toISOString();

                  return buildBlockedNotificationCenterEmailDigestWorkflowJobRecord(
                    {
                      job,
                      now,
                      lastError:
                        "Notification-center email digest workflow job exceeded the recovery budget.",
                    },
                  ).pipe(
                    Effect.flatMap((blockedJob) =>
                      workflowJobs.persistWorkflowJob(blockedJob),
                    ),
                  );
                },
                claimScheduledJob: ({ jobId }) =>
                  workflowJobs.claimScheduledWorkflowJob({
                    jobId,
                    now: new Date().toISOString(),
                  }),
                runClaimedJob: ({ job }) =>
                  Effect.gen(function* () {
                    const now = new Date().toISOString();
                    const currentRun =
                      yield* options.notificationCenter.findDigestRun({
                        digestRunId: job.payload.digestRunId,
                      });

                    if (currentRun === undefined) {
                      return yield* buildBlockedNotificationCenterEmailDigestWorkflowJobRecord(
                        {
                          job,
                          now,
                          lastError:
                            "Notification-center digest run was not found.",
                        },
                      ).pipe(
                        Effect.flatMap((blockedJob) =>
                          workflowJobs.persistWorkflowJob(blockedJob),
                        ),
                      );
                    }

                    if (isTerminalDigestRun(currentRun)) {
                      return yield* buildCompletedNotificationCenterEmailDigestWorkflowJobRecord(
                        {
                          job,
                          now,
                        },
                      ).pipe(
                        Effect.flatMap((completedJob) =>
                          workflowJobs.persistWorkflowJob(completedJob),
                        ),
                      );
                    }

                    const candidates =
                      (yield* options.notificationCenter.listDigestCandidatesByDigestRun(
                        {
                          digestRunId: job.payload.digestRunId,
                        },
                      )).filter(isPendingDigestCandidate);

                    if (candidates.length === 0) {
                      yield* options.notificationCenter.upsertDigestRun(
                        yield* buildCanceledDigestRunRecord({
                          run: currentRun,
                          now,
                        }),
                      );

                      return yield* buildCompletedNotificationCenterEmailDigestWorkflowJobRecord(
                        {
                          job,
                          now,
                        },
                      ).pipe(
                        Effect.flatMap((completedJob) =>
                          workflowJobs.persistWorkflowJob(completedJob),
                        ),
                      );
                    }

                    const runningRun =
                      yield* options.notificationCenter.upsertDigestRun(
                        yield* beginDigestRunRecord({
                          run: currentRun,
                          itemCount: candidates.length,
                          now,
                        }),
                      );

                    return yield* renderBillingInvoiceReadyDigestEmailTemplate({
                      tenant: job.payload.requestContext.tenant,
                      recipientEmail: job.payload.recipient,
                      items: candidates.map((candidate) => ({
                        invoiceNumber: candidate.invoiceNumber,
                        invoiceUrl: candidate.invoiceUrl,
                        dueAt: candidate.dueAt,
                        totalDue: candidate.totalDue,
                      })),
                    }).pipe(
                      Effect.flatMap((renderedTemplate) =>
                        options.emailDelivery
                          .sendTransactionalEmail({
                            requestContext: job.payload.requestContext,
                            recipient: job.payload.recipient,
                            template: renderedTemplate.template,
                            subject: renderedTemplate.subject,
                            html: renderedTemplate.html,
                            text: renderedTemplate.text,
                          })
                          .pipe(
                            Effect.flatMap((delivery) =>
                              Effect.matchEffect(
                                options.notificationCenter.queueEmailNotification(
                                  {
                                    recipient: job.payload.recipient,
                                    template:
                                      emailDeliveryTemplateId.billingInvoiceReadyDigest,
                                    subject: renderedTemplate.subject,
                                  },
                                ),
                                {
                                  onFailure: () =>
                                    persistQueueFailedDigestRunResult({
                                      run: runningRun,
                                      candidates,
                                      job,
                                      delivery,
                                    }),
                                  onSuccess: (notification) =>
                                    persistQueuedDigestRunResult({
                                      run: runningRun,
                                      candidates,
                                      job,
                                      delivery,
                                      notification,
                                    }),
                                },
                              ),
                            ),
                          ),
                      ),
                      Effect.catchAll((error) =>
                        persistFailedDigestRunResult({
                          run: runningRun,
                          candidates,
                          job,
                          now,
                          error,
                        }),
                      ),
                      Effect.flatMap((record) =>
                        workflowJobs.persistWorkflowJob(record),
                      ),
                    );
                  }),
                recoverClaimedJobFailure: ({ job, cause }) => {
                  const now = new Date().toISOString();

                  return buildBlockedNotificationCenterEmailDigestWorkflowJobRecord(
                    {
                      job,
                      now,
                      lastError: Cause.pretty(cause),
                    },
                  ).pipe(
                    Effect.flatMap((blockedJob) =>
                      workflowJobs.persistWorkflowJob(blockedJob),
                    ),
                    Effect.flatMap((blockedJob) =>
                      buildWorkflowJobSummary({ record: blockedJob }),
                    ),
                  );
                },
                summarize: ({ record }) => buildWorkflowJobSummary({ record }),
              });
            }),
          ),
        ),
    } satisfies NotificationCenterService;
  });

const NotificationCenterProcessEnvironmentSchema = Schema.Struct({
  NOVU_API_URL: Schema.NonEmptyString,
  NOVU_API_KEY: Schema.NonEmptyString,
});

export type NotificationCenterRuntimeError = {
  readonly _tag: "NotificationCenterRuntimeError";
  readonly cause: unknown;
};

export const runNotificationCenterEmailDigestWorkflowJobFromEnvironment = (
  environment: unknown,
  input: RunNotificationCenterEmailDigestWorkflowJobRequest,
) =>
  Effect.all({
    subscriberJourney:
      resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment),
    emailDelivery:
      resolveEmailDeliveryRuntimeOptionsFromEnvironment(environment),
    notificationCenter: Schema.decodeUnknown(
      NotificationCenterProcessEnvironmentSchema,
    )(environment),
  }).pipe(
    Effect.mapError(
      (cause): NotificationCenterRuntimeError => ({
        _tag: "NotificationCenterRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap(({ subscriberJourney, emailDelivery, notificationCenter }) =>
      Effect.gen(function* () {
        const emailDeliveryRuntime = yield* makeEmailDeliveryRuntime(
          emailDelivery,
        ).pipe(
          Effect.mapError(
            (cause): NotificationCenterRuntimeError => ({
              _tag: "NotificationCenterRuntimeError",
              cause,
            }),
          ),
        );
        const postgres = yield* makePostgresAdapter({
          connectionString: subscriberJourney.postgresUrl,
        }).pipe(
          Effect.mapError(
            (cause): NotificationCenterRuntimeError => ({
              _tag: "NotificationCenterRuntimeError",
              cause,
            }),
          ),
        );
        const close = Effect.all([
          Effect.ignore(emailDeliveryRuntime.close),
          Effect.ignore(postgres.close),
        ]).pipe(Effect.asVoid);

        return yield* Effect.gen(function* () {
          const writeDatabase = buildWriteDatabase(postgres.database);
          const novu = yield* makeNovuAdapter({
            apiUrl: notificationCenter.NOVU_API_URL,
            apiKey: notificationCenter.NOVU_API_KEY,
          }).pipe(
            Effect.mapError(
              (cause): NotificationCenterRuntimeError => ({
                _tag: "NotificationCenterRuntimeError",
                cause,
              }),
            ),
          );
          const runtimeConfig = yield* makeRuntimeConfigModule();
          const notificationCenterRepository =
            yield* makeNotificationCenterPostgresRepository(
              buildNotificationCenterPostgresQueryable(writeDatabase),
            ).pipe(
              Effect.mapError(
                (cause): NotificationCenterRuntimeError => ({
                  _tag: "NotificationCenterRuntimeError",
                  cause,
                }),
              ),
            );
          const notificationCenterModule =
            yield* makeNotificationCenterModule().pipe(
              Effect.provideService(NovuAdapter, novu),
              Effect.provideService(
                NotificationCenterPostgresRepository,
                notificationCenterRepository,
              ),
              Effect.mapError(
                (cause): NotificationCenterRuntimeError => ({
                  _tag: "NotificationCenterRuntimeError",
                  cause,
                }),
              ),
            );
          const workflowJobs =
            yield* makeWorkflowJobsPostgresRepositoryForRecordSchema(
              writeDatabase,
              buildWorkflowJobsPostgresQueryable<NotificationCenterEmailDigestWorkflowJobRecord>(
                writeDatabase,
              ),
              NotificationCenterEmailDigestWorkflowJobRecordSchema,
            ).pipe(
              Effect.mapError(
                (cause): NotificationCenterRuntimeError => ({
                  _tag: "NotificationCenterRuntimeError",
                  cause,
                }),
              ),
            );
          const convexWorkflowClient =
            yield* makeAuthenticatedConvexWorkflowClient({
              deploymentUrl: subscriberJourney.convexUrl,
              siteUrl: subscriberJourney.convexSiteUrl,
              keycloakBaseUrl: subscriberJourney.keycloakBaseUrl,
              keycloakRealm: subscriberJourney.keycloakRealm,
              keycloakClientId: subscriberJourney.keycloakClientId,
              keycloakClientSecret: subscriberJourney.keycloakClientSecret,
              keycloakConvexServiceActorUsername:
                subscriberJourney.keycloakConvexServiceActorUsername,
              keycloakConvexServiceActorPassword:
                subscriberJourney.keycloakConvexServiceActorPassword,
            }).pipe(
              Effect.mapError(
                (cause): NotificationCenterRuntimeError => ({
                  _tag: "NotificationCenterRuntimeError",
                  cause,
                }),
              ),
            );
          const service = yield* makeNotificationCenterService({
            notificationCenter: notificationCenterModule,
            emailDelivery: emailDeliveryRuntime.service,
            workflowJobs,
            convexWorkflowClient,
          }).pipe(
            Effect.provideService(RuntimeConfigModule, runtimeConfig),
            Effect.mapError(
              (cause): NotificationCenterRuntimeError => ({
                _tag: "NotificationCenterRuntimeError",
                cause,
              }),
            ),
          );

          return yield* service
            .runNotificationCenterEmailDigestWorkflowJob(input)
            .pipe(
              Effect.mapError(
                (cause): NotificationCenterRuntimeError => ({
                  _tag: "NotificationCenterRuntimeError",
                  cause,
                }),
              ),
            );
        }).pipe(Effect.ensuring(close));
      }),
    ),
  );
