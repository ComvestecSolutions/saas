import { Cause, Context, Effect, ParseResult, Schema } from "effect";
import {
  findModuleManifest,
  workflowJobsRunningClaimTimeoutSeconds,
} from "@comvestec/config";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  BillingRepairWorkflowPayloadSchema,
  fieldSecurityAuditAction,
  ImportExportManagedFileSummaryWorkflowPayloadSchema,
  ImportExportSupportCaseSummaryWorkflowPayloadSchema,
  NotificationCenterEmailDigestWorkflowPayloadSchema,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
  type RequestContext,
  SearchTenantIndexEnsureWorkflowPayloadSchema,
  TenantInvitationExpiryNotificationWorkflowPayloadSchema,
  TenantInvitationReminderWorkflowPayloadSchema,
  WebhookOutboundDeliveryWorkflowPayloadSchema,
  workflowJobKind,
  workflowJobsAuditAction,
  WorkflowJobDispatchMetadataSchema,
  type WorkflowJobRepairGapCancelRequest,
  WorkflowJobRepairGapCancelRequestSchema,
  type WorkflowJobRepairGapCancelResult,
  WorkflowJobRepairGapCancelResultSchema,
  type WorkflowJobRepairGapListRequest,
  WorkflowJobRepairGapListRequestSchema,
  type WorkflowJobRepairGapListResult,
  WorkflowJobRepairGapListResultSchema,
  type WorkflowJobRepairGapReplayRequest,
  WorkflowJobRepairGapReplayRequestSchema,
  type WorkflowJobRepairGapReplayResult,
  WorkflowJobRepairGapReplayResultSchema,
  WorkflowJobRepairGapSchema,
  workflowJobStatus,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleError,
  type AuthorizationDelegatedCheckError,
  type AuthorizationModuleService,
  type IdentitySessionModuleError,
  IdentitySessionModule,
  makeAuthorizationModule,
  makeFieldSecurityModule,
  buildWorkflowJobsPostgresQueryable,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  type WorkflowJobRecord,
  WorkflowJobRecordSchema,
  type WorkflowJobsPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
} from "@comvestec/modules";
import {
  type ConvexAdapterRequestError,
  type AuthenticatedConvexWorkflowClient,
  type ConvexWorkflowExecutionError,
  type KeycloakAdapterRequestError,
  type KeycloakAdapterService,
  makeAuthenticatedConvexWorkflowClient,
  makeKeycloakAdapter,
  makePostgresAdapter,
  OryKetoAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import { buildWriteDatabase } from "../postgres-write-database";
import {
  makeSubscriberJourneyRuntime,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
  type SubscriberJourneyRuntimeOptions,
} from "./subscriber-journey";

export type WorkflowJobRecordExecutorInput<TRecord, TSummary, TError> = {
  readonly jobId: string;
  readonly loadJob: (input: {
    readonly jobId: string;
  }) => Effect.Effect<TRecord | undefined, TError>;
  readonly shouldBlockStaleRunningJob: (input: {
    readonly job: TRecord;
  }) => boolean;
  readonly blockStaleRunningJob: (input: {
    readonly job: TRecord;
  }) => Effect.Effect<TRecord, TError>;
  readonly claimScheduledJob: (input: {
    readonly jobId: string;
  }) => Effect.Effect<TRecord | undefined, TError>;
  readonly runClaimedJob: (input: {
    readonly job: TRecord;
  }) => Effect.Effect<TRecord, TError>;
  readonly recoverClaimedJobFailure: (input: {
    readonly job: TRecord;
    readonly cause: Cause.Cause<TError>;
  }) => Effect.Effect<TSummary, TError>;
  readonly summarize: (input: {
    readonly record: TRecord;
  }) => Effect.Effect<TSummary, TError>;
};

export const executeWorkflowJobRecord = <TRecord, TSummary, TError>(
  input: WorkflowJobRecordExecutorInput<TRecord, TSummary, TError>,
) =>
  Effect.gen(function* () {
    const existingJob = yield* input.loadJob({ jobId: input.jobId });

    if (existingJob === undefined) {
      return undefined;
    }

    if (input.shouldBlockStaleRunningJob({ job: existingJob })) {
      const blockedJob = yield* input.blockStaleRunningJob({
        job: existingJob,
      });

      return yield* input.summarize({ record: blockedJob });
    }

    const attemptedJob = yield* input.claimScheduledJob({ jobId: input.jobId });

    if (attemptedJob === undefined) {
      return undefined;
    }

    return yield* input.runClaimedJob({ job: attemptedJob }).pipe(
      Effect.flatMap((record) => input.summarize({ record })),
      Effect.catchAllCause((cause) =>
        input.recoverClaimedJobFailure({
          job: attemptedJob,
          cause,
        }),
      ),
    );
  });

type WorkflowJobsRepository =
  WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>;

export type WorkflowJobsProjectionConfigurationError = {
  readonly _tag: "WorkflowJobsProjectionConfigurationError";
  readonly moduleId: typeof platformModuleId.workflowJobs;
  readonly profile: typeof projectionProfile.admin;
  readonly reason: string;
};

export type WorkflowJobsAccessDeniedError = {
  readonly _tag: "WorkflowJobsAccessDeniedError";
  readonly reason: string;
  readonly auditRequired: boolean;
};

export type WorkflowJobsWorkflowExecutionUnavailableError = {
  readonly _tag: "WorkflowJobsWorkflowExecutionUnavailableError";
  readonly reason: string;
};

export type WorkflowJobsWorkflowExecutionIdentityMismatchError = {
  readonly _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError";
  readonly reason: string;
};

export type WorkflowJobsRepairGapNotFoundError = {
  readonly _tag: "WorkflowJobsRepairGapNotFoundError";
  readonly jobId: string;
};

export type WorkflowJobsRepairGapReplayUnavailableError = {
  readonly _tag: "WorkflowJobsRepairGapReplayUnavailableError";
  readonly jobId: string;
  readonly status: string;
  readonly reason: string;
};

export type WorkflowJobsRepairGapCancelUnavailableError = {
  readonly _tag: "WorkflowJobsRepairGapCancelUnavailableError";
  readonly jobId: string;
  readonly status: string;
  readonly reason: string;
};

export type WorkflowJobsServiceError =
  | WorkflowJobsProjectionConfigurationError
  | WorkflowJobsAccessDeniedError
  | WorkflowJobsWorkflowExecutionUnavailableError
  | WorkflowJobsWorkflowExecutionIdentityMismatchError
  | WorkflowJobsRepairGapNotFoundError
  | WorkflowJobsRepairGapReplayUnavailableError
  | WorkflowJobsRepairGapCancelUnavailableError
  | KeycloakAdapterRequestError
  | AuthorizationDelegatedCheckError
  | ParseResult.ParseError
  | AuditLogModuleError
  | IdentitySessionModuleError
  | WorkflowJobsPostgresRepositoryError
  | ConvexWorkflowExecutionError;

export type WorkflowJobsServiceApi = {
  readonly listRepairGaps: (
    input: WorkflowJobRepairGapListRequest,
  ) => Effect.Effect<WorkflowJobRepairGapListResult, WorkflowJobsServiceError>;
  readonly replayRepairGap: (
    input: WorkflowJobRepairGapReplayRequest,
  ) => Effect.Effect<
    WorkflowJobRepairGapReplayResult,
    WorkflowJobsServiceError
  >;
  readonly cancelRepairGap: (
    input: WorkflowJobRepairGapCancelRequest,
  ) => Effect.Effect<
    WorkflowJobRepairGapCancelResult,
    WorkflowJobsServiceError
  >;
};

export class WorkflowJobsService extends Context.Tag("WorkflowJobsService")<
  WorkflowJobsService,
  WorkflowJobsServiceApi
>() {}

export type WorkflowJobsServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs: WorkflowJobsRepository;
  readonly workflowExecutionClient?: Pick<
    AuthenticatedConvexWorkflowClient,
    | "cancelScheduledWorkflowJob"
    | "runBillingConvergenceJob"
    | "runNotificationCenterEmailDigestWorkflowJob"
    | "runSearchTenantIndexEnsureWorkflowJob"
    | "runWebhookOutboundDeliveryWorkflowJob"
    | "runTenantInvitationReminderWorkflowJob"
    | "runTenantInvitationExpiryNotificationWorkflowJob"
  > & {
    readonly runImportExportManagedFileSummaryWorkflowJob?: (
      request: { readonly jobId: string },
      options: { readonly authToken: string },
    ) => Effect.Effect<
      null,
      | ConvexWorkflowExecutionError
      | WorkflowJobsWorkflowExecutionUnavailableError
    >;
    readonly runImportExportSupportCaseSummaryWorkflowJob?: (
      request: { readonly jobId: string },
      options: { readonly authToken: string },
    ) => Effect.Effect<
      null,
      | ConvexWorkflowExecutionError
      | WorkflowJobsWorkflowExecutionUnavailableError
    >;
  };
  readonly validateWorkflowExecutionIdentity?: (input: {
    readonly requestContext: RequestContext;
    readonly convexAuthToken: string;
  }) => Effect.Effect<
    void,
    | WorkflowJobsWorkflowExecutionIdentityMismatchError
    | KeycloakAdapterRequestError
  >;
};

const hasProjectedFieldValue = (
  record: Record<string, unknown>,
  fieldPath: string,
) =>
  fieldPath
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        value !== null && typeof value === "object" && segment in value
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      record,
    ) !== undefined;

const buildWorkflowJobRepairGapProjectionRecord = (job: WorkflowJobRecord) =>
  ({
    jobId: job.jobId,
    sourceModuleId: job.sourceModuleId,
    kind: job.kind,
    trigger: job.trigger,
    tenantScope: job.tenantScope,
    tenantScopeId: job.tenantScopeId,
    status: job.status,
    attempts: job.attempts,
    scheduledAt: job.scheduledAt,
    ...(job.completedAt !== undefined ? { completedAt: job.completedAt } : {}),
    ...(job.gapReason !== undefined ? { gapReason: job.gapReason } : {}),
    ...(job.lastError !== undefined ? { lastError: job.lastError } : {}),
  }) satisfies Record<string, unknown>;

const redactWorkflowJobFailureDetails = (
  job: Schema.Schema.Type<typeof WorkflowJobRepairGapSchema>,
) => {
  const { lastError: _lastError, ...jobWithoutLastError } = job;

  return jobWithoutLastError;
};

const normalizeInspectionReason = (inspectionReason: string | undefined) => {
  const trimmedInspectionReason = inspectionReason?.trim();

  return trimmedInspectionReason !== undefined &&
    trimmedInspectionReason.length > 0
    ? trimmedInspectionReason
    : undefined;
};

const createWorkflowExecutionIdentityValidator =
  (keycloak: Pick<KeycloakAdapterService, "validateIdentityToken">) =>
  (input: {
    readonly requestContext: RequestContext;
    readonly convexAuthToken: string;
  }) =>
    keycloak.validateIdentityToken({ idToken: input.convexAuthToken }).pipe(
      Effect.mapError((error) =>
        error._tag === "KeycloakAdapterRequestError"
          ? error
          : ({
              _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
              reason:
                "Authenticated workflow execution requires a valid platform-operator Keycloak identity token.",
            } satisfies WorkflowJobsWorkflowExecutionIdentityMismatchError),
      ),
      Effect.flatMap((identityToken) => {
        if (input.requestContext.actorId === undefined) {
          return Effect.fail({
            _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
            reason:
              "Authenticated workflow execution requires the operator session to have a stable actor id.",
          } satisfies WorkflowJobsWorkflowExecutionIdentityMismatchError);
        }

        if (identityToken.actorType !== actorType.platformOperator) {
          return Effect.fail({
            _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
            reason:
              "Authenticated workflow execution requires a valid platform-operator Keycloak identity token.",
          } satisfies WorkflowJobsWorkflowExecutionIdentityMismatchError);
        }

        return identityToken.actorId === input.requestContext.actorId
          ? Effect.void
          : Effect.fail({
              _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
              reason:
                "The Convex bearer token subject must match the authenticated platform-operator session actor.",
            } satisfies WorkflowJobsWorkflowExecutionIdentityMismatchError);
      }),
    );

const subtractSecondsFromDate = (value: Date, seconds: number) =>
  new Date(value.getTime() - seconds * 1_000);

const isStaleWorkflowJob = (input: {
  readonly updatedAt: string;
  readonly now: string;
}) =>
  new Date(input.updatedAt).getTime() <=
  subtractSecondsFromDate(
    new Date(input.now),
    workflowJobsRunningClaimTimeoutSeconds,
  ).getTime();

const canReplayRepairGapWorkflowJob = (input: {
  readonly job: WorkflowJobRecord;
  readonly now: string;
}) => {
  if (input.job.status === workflowJobStatus.running) {
    return isStaleWorkflowJob({
      updatedAt: input.job.updatedAt,
      now: input.now,
    });
  }

  return (
    input.job.gapReason !== undefined &&
    (input.job.status === workflowJobStatus.scheduled ||
      input.job.status === workflowJobStatus.blocked)
  );
};

const canCancelRepairGapWorkflowJob = (input: {
  readonly job: WorkflowJobRecord;
  readonly now: string;
}) => canReplayRepairGapWorkflowJob(input);

type WorkflowJobsReplayWorkflowExecutionClient = Pick<
  AuthenticatedConvexWorkflowClient,
  | "runBillingConvergenceJob"
  | "runNotificationCenterEmailDigestWorkflowJob"
  | "runSearchTenantIndexEnsureWorkflowJob"
  | "runTenantInvitationReminderWorkflowJob"
  | "runTenantInvitationExpiryNotificationWorkflowJob"
> & {
  readonly runImportExportManagedFileSummaryWorkflowJob?: (
    request: { readonly jobId: string },
    options: { readonly authToken: string },
  ) => Effect.Effect<
    null,
    ConvexWorkflowExecutionError | WorkflowJobsWorkflowExecutionUnavailableError
  >;
  readonly runImportExportSupportCaseSummaryWorkflowJob?: (
    request: { readonly jobId: string },
    options: { readonly authToken: string },
  ) => Effect.Effect<
    null,
    ConvexWorkflowExecutionError | WorkflowJobsWorkflowExecutionUnavailableError
  >;
  readonly runWebhookOutboundDeliveryWorkflowJob?: (
    request: { readonly jobId: string },
    options: { readonly authToken: string },
  ) => Effect.Effect<
    null,
    ConvexWorkflowExecutionError | WorkflowJobsWorkflowExecutionUnavailableError
  >;
};

const buildWorkflowJobReplayOperatorMetadata = (
  requestContext: RequestContext,
) =>
  ({
    correlationId: requestContext.correlationId,
    ...(requestContext.actorId === undefined
      ? {}
      : { actorId: requestContext.actorId }),
  }) as const;

const buildTenantPreservingReplayRequestContext = (input: {
  readonly jobRequestContext: RequestContext;
  readonly operatorRequestContext: RequestContext;
}) =>
  ({
    actorType: input.operatorRequestContext.actorType,
    ...(input.operatorRequestContext.actorId === undefined
      ? {}
      : { actorId: input.operatorRequestContext.actorId }),
    ...(input.operatorRequestContext.sessionId === undefined
      ? {}
      : { sessionId: input.operatorRequestContext.sessionId }),
    correlationId: input.operatorRequestContext.correlationId,
    tenant: input.jobRequestContext.tenant,
    ...(input.operatorRequestContext.host === undefined
      ? {}
      : { host: input.operatorRequestContext.host }),
    ...(input.operatorRequestContext.reason === undefined
      ? {}
      : { reason: input.operatorRequestContext.reason }),
    ...(input.operatorRequestContext.impersonation === undefined
      ? {}
      : { impersonation: input.operatorRequestContext.impersonation }),
    ...(input.operatorRequestContext.breakGlass === undefined
      ? {}
      : { breakGlass: input.operatorRequestContext.breakGlass }),
  }) satisfies RequestContext;

const prepareWorkflowJobReplayPayload = (input: {
  readonly job: WorkflowJobRecord;
  readonly requestContext: RequestContext;
}) => {
  const operatorMetadata = buildWorkflowJobReplayOperatorMetadata(
    input.requestContext,
  );

  switch (input.job.kind) {
    case workflowJobKind.reconciliationDeadline:
    case workflowJobKind.reconciliationSweep:
      return Schema.decodeUnknown(BillingRepairWorkflowPayloadSchema)(
        input.job.payload,
      ).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            ...operatorMetadata,
          };
        }),
      );
    case workflowJobKind.importExportManagedFileSummary:
      return Schema.decodeUnknown(
        ImportExportManagedFileSummaryWorkflowPayloadSchema,
      )(input.job.payload).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            requestContext: input.requestContext,
            ...operatorMetadata,
          };
        }),
      );
    case workflowJobKind.importExportSupportCaseSummary:
      return Schema.decodeUnknown(
        ImportExportSupportCaseSummaryWorkflowPayloadSchema,
      )(input.job.payload).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            requestContext: input.requestContext,
            ...operatorMetadata,
          };
        }),
      );
    case workflowJobKind.notificationCenterEmailDigest:
      return Schema.decodeUnknown(
        NotificationCenterEmailDigestWorkflowPayloadSchema,
      )(input.job.payload).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            requestContext: buildTenantPreservingReplayRequestContext({
              jobRequestContext: payload.requestContext,
              operatorRequestContext: input.requestContext,
            }),
            ...operatorMetadata,
          };
        }),
      );
    case workflowJobKind.searchIndexEnsure:
      return Schema.decodeUnknown(SearchTenantIndexEnsureWorkflowPayloadSchema)(
        input.job.payload,
      ).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            requestContext: input.requestContext,
            ...operatorMetadata,
          };
        }),
      );
    case workflowJobKind.invitationReminder:
      return Schema.decodeUnknown(
        TenantInvitationReminderWorkflowPayloadSchema,
      )(input.job.payload).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            ...operatorMetadata,
          };
        }),
      );
    case workflowJobKind.invitationExpiryNotification:
      return Schema.decodeUnknown(
        TenantInvitationExpiryNotificationWorkflowPayloadSchema,
      )(input.job.payload).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            ...operatorMetadata,
          };
        }),
      );
    case workflowJobKind.webhookOutboundDelivery:
      return Schema.decodeUnknown(WebhookOutboundDeliveryWorkflowPayloadSchema)(
        input.job.payload,
      ).pipe(
        Effect.map((payload) => {
          const { dispatch: _dispatch, ...payloadWithoutDispatch } = payload;

          return {
            ...payloadWithoutDispatch,
            requestContext: input.requestContext,
            ...operatorMetadata,
          };
        }),
      );
  }
};

const replayWorkflowJob = (input: {
  readonly job: WorkflowJobRecord;
  readonly convexAuthToken: string;
  readonly workflowExecutionClient: WorkflowJobsReplayWorkflowExecutionClient;
}): Effect.Effect<
  null,
  ConvexWorkflowExecutionError | WorkflowJobsWorkflowExecutionUnavailableError
> => {
  switch (input.job.kind) {
    case workflowJobKind.reconciliationDeadline:
    case workflowJobKind.reconciliationSweep:
      return input.workflowExecutionClient.runBillingConvergenceJob(
        {
          jobId: input.job.jobId,
        },
        {
          authToken: input.convexAuthToken,
        },
      );
    case workflowJobKind.importExportManagedFileSummary:
      return input.workflowExecutionClient
        .runImportExportManagedFileSummaryWorkflowJob === undefined
        ? Effect.fail({
            _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
            reason:
              "The authenticated Convex workflow client does not support import-export replay.",
          } satisfies WorkflowJobsWorkflowExecutionUnavailableError)
        : input.workflowExecutionClient.runImportExportManagedFileSummaryWorkflowJob(
            {
              jobId: input.job.jobId,
            },
            {
              authToken: input.convexAuthToken,
            },
          );
    case workflowJobKind.importExportSupportCaseSummary:
      return input.workflowExecutionClient
        .runImportExportSupportCaseSummaryWorkflowJob === undefined
        ? Effect.fail({
            _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
            reason:
              "The authenticated Convex workflow client does not support support-case summary replay.",
          } satisfies WorkflowJobsWorkflowExecutionUnavailableError)
        : input.workflowExecutionClient.runImportExportSupportCaseSummaryWorkflowJob(
            {
              jobId: input.job.jobId,
            },
            {
              authToken: input.convexAuthToken,
            },
          );
    case workflowJobKind.notificationCenterEmailDigest:
      return input.workflowExecutionClient
        .runNotificationCenterEmailDigestWorkflowJob === undefined
        ? Effect.fail({
            _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
            reason:
              "The authenticated Convex workflow client does not support notification-center digest replay.",
          } satisfies WorkflowJobsWorkflowExecutionUnavailableError)
        : input.workflowExecutionClient.runNotificationCenterEmailDigestWorkflowJob(
            {
              jobId: input.job.jobId,
            },
            {
              authToken: input.convexAuthToken,
            },
          );
    case workflowJobKind.searchIndexEnsure:
      return input.workflowExecutionClient.runSearchTenantIndexEnsureWorkflowJob(
        {
          jobId: input.job.jobId,
        },
        {
          authToken: input.convexAuthToken,
        },
      );
    case workflowJobKind.invitationReminder:
      return input.workflowExecutionClient.runTenantInvitationReminderWorkflowJob(
        {
          jobId: input.job.jobId,
        },
        {
          authToken: input.convexAuthToken,
        },
      );
    case workflowJobKind.invitationExpiryNotification:
      return input.workflowExecutionClient.runTenantInvitationExpiryNotificationWorkflowJob(
        {
          jobId: input.job.jobId,
        },
        {
          authToken: input.convexAuthToken,
        },
      );
    case workflowJobKind.webhookOutboundDelivery:
      return input.workflowExecutionClient
        .runWebhookOutboundDeliveryWorkflowJob === undefined
        ? Effect.fail({
            _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
            reason:
              "The authenticated Convex workflow client does not support webhook outbound delivery replay.",
          } satisfies WorkflowJobsWorkflowExecutionUnavailableError)
        : input.workflowExecutionClient.runWebhookOutboundDeliveryWorkflowJob(
            {
              jobId: input.job.jobId,
            },
            {
              authToken: input.convexAuthToken,
            },
          );
  }
};

const shouldRestoreReplayGapJob = (
  error:
    | ConvexWorkflowExecutionError
    | WorkflowJobsWorkflowExecutionUnavailableError,
): error is ConvexAdapterRequestError =>
  error._tag === "ConvexAdapterRequestError";

const WorkflowJobDispatchCarrierSchema = Schema.Struct({
  dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
});

const readWorkflowJobDispatch = (payload: unknown) =>
  Schema.decodeUnknown(WorkflowJobDispatchCarrierSchema)(payload).pipe(
    Effect.orElseSucceed(() => ({ dispatch: undefined })),
    Effect.map((decoded) => decoded.dispatch),
  );

const getCancelableScheduledFunctionIds = (job: WorkflowJobRecord) =>
  readWorkflowJobDispatch(job.payload).pipe(
    Effect.map((dispatch) => {
      if (dispatch?.scheduledAt !== job.scheduledAt) {
        return [] as const;
      }

      if (
        job.status === workflowJobStatus.scheduled ||
        job.status === workflowJobStatus.blocked
      ) {
        return dispatch.scheduledFunctionIds;
      }

      if (job.status === workflowJobStatus.running) {
        return dispatch.primaryScheduled
          ? dispatch.scheduledFunctionIds.slice(1)
          : dispatch.scheduledFunctionIds;
      }

      return [] as const;
    }),
  );

const denyWorkflowJobAccess = (input: {
  readonly reason: string;
  readonly auditRequired: boolean;
}) =>
  Effect.fail({
    _tag: "WorkflowJobsAccessDeniedError",
    reason: input.reason,
    auditRequired: input.auditRequired,
  } satisfies WorkflowJobsAccessDeniedError);

const validatePlatformOperatorContext = (input: {
  readonly requestContext: RequestContext;
}) =>
  input.requestContext.actorType === actorType.platformOperator &&
  input.requestContext.tenant.scope === platformScope.platform &&
  input.requestContext.tenant.scopeId === platformScope.platform
    ? Effect.void
    : denyWorkflowJobAccess({
        reason:
          "Workflow job administration requires a platform-operator session scoped to the platform tenant.",
        auditRequired: false,
      });

const makeLiveWorkflowJobsAuthorization = Effect.gen(function* () {
  const oryKeto = yield* OryKetoAdapter;

  return yield* makeAuthorizationModule({
    tuples: [],
    cacheTtlSeconds: 60,
    maxCacheSize: 128,
    delegatedCheck: createOryKetoAuthorizationDelegatedCheck(oryKeto),
    delegatedTupleLookup:
      createOryKetoAuthorizationDelegatedTupleLookup(oryKeto),
  });
});

const authorizeWorkflowJobAccess = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: RequestContext;
}) =>
  Effect.gen(function* () {
    yield* validatePlatformOperatorContext({
      requestContext: input.requestContext,
    });

    const decision = yield* input.authorization.check({
      requestContext: input.requestContext,
      namespace: authorizationNamespace.module,
      object: platformModuleId.workflowJobs,
      relation: authorizationRelation.admin,
      permissionScope: permissionScope.workflowManage,
    });

    return decision.allowed
      ? decision
      : yield* denyWorkflowJobAccess({
          reason: decision.reason,
          auditRequired: decision.auditRequired,
        });
  });

const buildWorkflowJobsService = (
  authorization: Pick<AuthorizationModuleService, "check">,
  options: WorkflowJobsServiceOptions,
) =>
  Effect.gen(function* () {
    const auditLog = yield* AuditLogModule;
    const identitySession = yield* IdentitySessionModule;
    const fieldSecurity = yield* makeFieldSecurityModule();
    const workflowJobsAdminProjection = yield* Effect.fromNullable(
      findModuleManifest(
        platformModuleId.workflowJobs,
      )?.projectionProfiles.find(
        (projection) => projection.profile === projectionProfile.admin,
      ),
    ).pipe(
      Effect.orElseFail(
        () =>
          ({
            _tag: "WorkflowJobsProjectionConfigurationError",
            moduleId: platformModuleId.workflowJobs,
            profile: projectionProfile.admin,
            reason:
              "The workflow-jobs admin projection must be declared before repair-gap inspection can run.",
          }) satisfies WorkflowJobsProjectionConfigurationError,
      ),
    );

    const projectRepairGap = (input: {
      readonly job: WorkflowJobRecord;
      readonly requestContext: RequestContext;
    }) =>
      fieldSecurity
        .applyProjection({
          moduleId: platformModuleId.workflowJobs,
          requestContext: input.requestContext,
          projection: workflowJobsAdminProjection,
          record: buildWorkflowJobRepairGapProjectionRecord(input.job),
        })
        .pipe(
          Effect.flatMap((result) =>
            Schema.decodeUnknown(WorkflowJobRepairGapSchema)(
              result.projectedRecord,
            ).pipe(
              Effect.map((projectedJob) => ({
                job: projectedJob,
                auditedFields: result.auditedFields.filter((field) =>
                  hasProjectedFieldValue(result.projectedRecord, field),
                ),
              })),
            ),
          ),
        );

    const resolveProjectedRepairGapForResponse = (input: {
      readonly projectedJob: {
        readonly job: Schema.Schema.Type<typeof WorkflowJobRepairGapSchema>;
        readonly auditedFields: readonly string[];
      };
      readonly inspectionReason?: string;
    }) =>
      input.projectedJob.auditedFields.length > 0 &&
      input.inspectionReason === undefined
        ? redactWorkflowJobFailureDetails(input.projectedJob.job)
        : input.projectedJob.job;

    const appendRepairGapSensitiveReadAudit = (input: {
      readonly requestContext: RequestContext;
      readonly target: string;
      readonly inspectionReason?: string;
      readonly auditedFields: readonly string[];
      readonly reasonPrefix: string;
    }) =>
      input.auditedFields.length === 0 || input.inspectionReason === undefined
        ? Effect.succeed(undefined)
        : auditLog.append({
            requestContext: input.requestContext,
            moduleId: platformModuleId.fieldSecurity,
            action: fieldSecurityAuditAction.sensitiveRead,
            target: input.target,
            reason: [input.reasonPrefix, input.inspectionReason].join(": "),
          });

    return {
      listRepairGaps: (input: WorkflowJobRepairGapListRequest) =>
        Schema.decodeUnknown(WorkflowJobRepairGapListRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const inspectionReason = normalizeInspectionReason(
                request.inspectionReason,
              );

              yield* authorizeWorkflowJobAccess({
                authorization,
                requestContext,
              });

              const jobs =
                yield* options.workflowJobs.listRepairGapWorkflowJobs({
                  sourceModuleId: request.sourceModuleId,
                });

              const projectedJobsWithAudit = yield* Effect.forEach(
                jobs,
                (job) =>
                  projectRepairGap({
                    job,
                    requestContext,
                  }),
              );

              if (
                projectedJobsWithAudit.some(
                  (projectedJob) => projectedJob.auditedFields.length > 0,
                ) &&
                inspectionReason !== undefined
              ) {
                yield* auditLog.append({
                  requestContext,
                  moduleId: platformModuleId.fieldSecurity,
                  action: fieldSecurityAuditAction.sensitiveRead,
                  target: [
                    platformModuleId.workflowJobs,
                    request.sourceModuleId,
                    "repair-gaps:lastError",
                  ].join(":"),
                  reason: [
                    "Inspect unresolved workflow repair gaps with failure details",
                    inspectionReason,
                  ].join(": "),
                });
              }

              return yield* Schema.decodeUnknown(
                WorkflowJobRepairGapListResultSchema,
              )({
                jobs: projectedJobsWithAudit.map((projectedJob) =>
                  resolveProjectedRepairGapForResponse({
                    projectedJob,
                    ...(inspectionReason === undefined
                      ? {}
                      : { inspectionReason }),
                  }),
                ),
              });
            }),
          ),
        ),
      replayRepairGap: (input: WorkflowJobRepairGapReplayRequest) =>
        Schema.decodeUnknown(WorkflowJobRepairGapReplayRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const inspectionReason = normalizeInspectionReason(
                request.inspectionReason,
              );

              yield* authorizeWorkflowJobAccess({
                authorization,
                requestContext,
              });

              const validateWorkflowExecution = yield* Effect.fromNullable(
                options.validateWorkflowExecutionIdentity,
              ).pipe(
                Effect.orElseFail(
                  () =>
                    ({
                      _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
                      reason:
                        "Workflow execution token validation is not configured for workflow-job replay.",
                    }) satisfies WorkflowJobsWorkflowExecutionUnavailableError,
                ),
              );

              yield* validateWorkflowExecution({
                requestContext,
                convexAuthToken: request.convexAuthToken,
              });

              const workflowExecutionClient = yield* Effect.fromNullable(
                options.workflowExecutionClient,
              ).pipe(
                Effect.orElseFail(
                  () =>
                    ({
                      _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
                      reason:
                        "The authenticated Convex workflow client is not configured for workflow-job replay.",
                    }) satisfies WorkflowJobsWorkflowExecutionUnavailableError,
                ),
              );

              const now = new Date().toISOString();
              const existingJob = yield* options.workflowJobs
                .getWorkflowJob({
                  jobId: request.jobId,
                })
                .pipe(
                  Effect.flatMap((job) =>
                    job === undefined
                      ? Effect.fail({
                          _tag: "WorkflowJobsRepairGapNotFoundError",
                          jobId: request.jobId,
                        } satisfies WorkflowJobsRepairGapNotFoundError)
                      : Effect.succeed(job),
                  ),
                );

              yield* Effect.succeed(existingJob).pipe(
                Effect.filterOrFail(
                  (job) => canReplayRepairGapWorkflowJob({ job, now }),
                  (job) =>
                    ({
                      _tag: "WorkflowJobsRepairGapReplayUnavailableError",
                      jobId: request.jobId,
                      status: job.status,
                      reason:
                        "Only unresolved scheduled, blocked, or stale running workflow repair gaps can be replayed.",
                    }) satisfies WorkflowJobsRepairGapReplayUnavailableError,
                ),
              );

              const replayPayload = yield* prepareWorkflowJobReplayPayload({
                job: existingJob,
                requestContext,
              });
              const {
                gapReason: _gapReason,
                lastError: _lastError,
                ...replayableJob
              } = existingJob;

              yield* options.workflowJobs.persistWorkflowJob({
                ...replayableJob,
                payload: replayPayload,
                status: workflowJobStatus.scheduled,
                scheduledAt: now,
                updatedAt: now,
              });

              yield* replayWorkflowJob({
                job: existingJob,
                convexAuthToken: request.convexAuthToken,
                workflowExecutionClient,
              }).pipe(
                Effect.catchAll(
                  (
                    error,
                  ): Effect.Effect<
                    never,
                    | WorkflowJobsPostgresRepositoryError
                    | ConvexWorkflowExecutionError
                    | WorkflowJobsWorkflowExecutionUnavailableError
                  > =>
                    shouldRestoreReplayGapJob(error)
                      ? options.workflowJobs
                          .restoreWorkflowJobIfUpdatedAtMatches({
                            jobId: existingJob.jobId,
                            expectedUpdatedAt: now,
                            record: existingJob,
                          })
                          .pipe(
                            Effect.zipRight(
                              Effect.fail<
                                | ConvexWorkflowExecutionError
                                | WorkflowJobsWorkflowExecutionUnavailableError
                              >(error),
                            ),
                          )
                      : Effect.fail<
                          | ConvexWorkflowExecutionError
                          | WorkflowJobsWorkflowExecutionUnavailableError
                        >(error),
                ),
              );

              const replayedJob = yield* options.workflowJobs
                .getWorkflowJob({
                  jobId: request.jobId,
                })
                .pipe(
                  Effect.flatMap((job) =>
                    job === undefined
                      ? Effect.fail({
                          _tag: "WorkflowJobsRepairGapNotFoundError",
                          jobId: request.jobId,
                        } satisfies WorkflowJobsRepairGapNotFoundError)
                      : Effect.succeed(job),
                  ),
                );

              yield* auditLog.append({
                requestContext,
                moduleId: platformModuleId.workflowJobs,
                action: workflowJobsAuditAction.repairGapReplayed,
                target: `${platformModuleId.workflowJobs}:${request.jobId}:repair-gap-replay`,
                reason:
                  "Replay an unresolved workflow repair gap from the workflow-jobs backend.",
              });

              const projectedJob = yield* projectRepairGap({
                job: replayedJob,
                requestContext,
              });

              yield* appendRepairGapSensitiveReadAudit({
                requestContext,
                target: `${platformModuleId.workflowJobs}:repair-gap:${request.jobId}:lastError`,
                auditedFields: projectedJob.auditedFields,
                reasonPrefix:
                  "Inspect replayed workflow repair gap with failure details",
                ...(inspectionReason === undefined ? {} : { inspectionReason }),
              });

              return yield* Schema.decodeUnknown(
                WorkflowJobRepairGapReplayResultSchema,
              )({
                job: resolveProjectedRepairGapForResponse({
                  projectedJob,
                  ...(inspectionReason === undefined
                    ? {}
                    : { inspectionReason }),
                }),
              });
            }),
          ),
        ),
      cancelRepairGap: (input: WorkflowJobRepairGapCancelRequest) =>
        Schema.decodeUnknown(WorkflowJobRepairGapCancelRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const inspectionReason = normalizeInspectionReason(
                request.inspectionReason,
              );

              yield* authorizeWorkflowJobAccess({
                authorization,
                requestContext,
              });

              const validateWorkflowExecution = yield* Effect.fromNullable(
                options.validateWorkflowExecutionIdentity,
              ).pipe(
                Effect.orElseFail(
                  () =>
                    ({
                      _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
                      reason:
                        "Workflow execution token validation is not configured for workflow-job cancellation.",
                    }) satisfies WorkflowJobsWorkflowExecutionUnavailableError,
                ),
              );

              yield* validateWorkflowExecution({
                requestContext,
                convexAuthToken: request.convexAuthToken,
              });

              const workflowExecutionClient = yield* Effect.fromNullable(
                options.workflowExecutionClient,
              ).pipe(
                Effect.orElseFail(
                  () =>
                    ({
                      _tag: "WorkflowJobsWorkflowExecutionUnavailableError",
                      reason:
                        "The authenticated Convex workflow client is not configured for workflow-job cancellation.",
                    }) satisfies WorkflowJobsWorkflowExecutionUnavailableError,
                ),
              );

              const projectCanceledRepairGap = (job: WorkflowJobRecord) =>
                Effect.gen(function* () {
                  yield* auditLog.append({
                    requestContext,
                    moduleId: platformModuleId.workflowJobs,
                    action: workflowJobsAuditAction.repairGapCanceled,
                    target: `${platformModuleId.workflowJobs}:${request.jobId}:repair-gap-cancel`,
                    reason:
                      "Cancel or confirm cancellation of a workflow repair gap from the workflow-jobs backend.",
                  });

                  const projectedJob = yield* projectRepairGap({
                    job,
                    requestContext,
                  });

                  yield* appendRepairGapSensitiveReadAudit({
                    requestContext,
                    target: `${platformModuleId.workflowJobs}:repair-gap:${request.jobId}:lastError`,
                    auditedFields: projectedJob.auditedFields,
                    reasonPrefix:
                      "Inspect canceled workflow repair gap with failure details",
                    ...(inspectionReason === undefined
                      ? {}
                      : { inspectionReason }),
                  });

                  return projectedJob;
                });

              const now = new Date().toISOString();
              const existingJob = yield* options.workflowJobs
                .getWorkflowJob({
                  jobId: request.jobId,
                })
                .pipe(
                  Effect.flatMap((job) =>
                    job === undefined
                      ? Effect.fail({
                          _tag: "WorkflowJobsRepairGapNotFoundError",
                          jobId: request.jobId,
                        } satisfies WorkflowJobsRepairGapNotFoundError)
                      : Effect.succeed(job),
                  ),
                );

              const canceledJob: WorkflowJobRecord =
                existingJob.status === workflowJobStatus.canceled
                  ? existingJob
                  : yield* Effect.succeed(existingJob).pipe(
                      Effect.filterOrFail(
                        (job) => canCancelRepairGapWorkflowJob({ job, now }),
                        (job) =>
                          ({
                            _tag: "WorkflowJobsRepairGapCancelUnavailableError",
                            jobId: request.jobId,
                            status: job.status,
                            reason:
                              "Only unresolved scheduled, blocked, or stale running workflow repair gaps can be canceled.",
                          }) satisfies WorkflowJobsRepairGapCancelUnavailableError,
                      ),
                      Effect.flatMap((job) =>
                        Effect.gen(function* () {
                          const scheduledFunctionIds =
                            yield* getCancelableScheduledFunctionIds(job);

                          const canceledOrCurrentJob: WorkflowJobRecord =
                            yield* options.workflowJobs
                              .cancelWorkflowJobIfUpdatedAtMatches({
                                jobId: job.jobId,
                                expectedUpdatedAt: job.updatedAt,
                                canceledAt: now,
                              })
                              .pipe(
                                Effect.flatMap(
                                  (
                                    canceledOrMissingJob,
                                  ): Effect.Effect<
                                    WorkflowJobRecord,
                                    | WorkflowJobsPostgresRepositoryError
                                    | WorkflowJobsRepairGapNotFoundError
                                    | WorkflowJobsRepairGapCancelUnavailableError
                                  > =>
                                    canceledOrMissingJob !== undefined
                                      ? Effect.succeed(canceledOrMissingJob)
                                      : options.workflowJobs
                                          .getWorkflowJob({
                                            jobId: job.jobId,
                                          })
                                          .pipe(
                                            Effect.flatMap(
                                              (
                                                currentJob,
                                              ): Effect.Effect<
                                                WorkflowJobRecord,
                                                | WorkflowJobsRepairGapNotFoundError
                                                | WorkflowJobsRepairGapCancelUnavailableError
                                              > =>
                                                currentJob === undefined
                                                  ? Effect.fail({
                                                      _tag: "WorkflowJobsRepairGapNotFoundError",
                                                      jobId: job.jobId,
                                                    } satisfies WorkflowJobsRepairGapNotFoundError)
                                                  : currentJob.status ===
                                                      workflowJobStatus.canceled
                                                    ? Effect.succeed(currentJob)
                                                    : Effect.fail({
                                                        _tag: "WorkflowJobsRepairGapCancelUnavailableError",
                                                        jobId: job.jobId,
                                                        status:
                                                          currentJob.status,
                                                        reason:
                                                          "Workflow repair gap changed before cancellation could be applied.",
                                                      } satisfies WorkflowJobsRepairGapCancelUnavailableError),
                                            ),
                                          ),
                                ),
                              );

                          if (
                            canceledOrCurrentJob.status !==
                            workflowJobStatus.canceled
                          ) {
                            return canceledOrCurrentJob;
                          }

                          if (scheduledFunctionIds.length > 0) {
                            yield* Effect.forEach(
                              scheduledFunctionIds,
                              (scheduledFunctionId) =>
                                workflowExecutionClient
                                  .cancelScheduledWorkflowJob(
                                    {
                                      scheduledFunctionId,
                                    },
                                    {
                                      authToken: request.convexAuthToken,
                                    },
                                  )
                                  .pipe(Effect.catchAll(() => Effect.void)),
                              {
                                discard: true,
                              },
                            );
                          }

                          return canceledOrCurrentJob;
                        }),
                      ),
                    );

              const projectedJob = yield* projectCanceledRepairGap(canceledJob);

              return yield* Schema.decodeUnknown(
                WorkflowJobRepairGapCancelResultSchema,
              )({
                job: resolveProjectedRepairGapForResponse({
                  projectedJob,
                  ...(inspectionReason === undefined
                    ? {}
                    : { inspectionReason }),
                }),
              });
            }),
          ),
        ),
    } satisfies WorkflowJobsServiceApi;
  });

export function makeWorkflowJobsService(options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs: WorkflowJobsRepository;
  readonly workflowExecutionClient?: Pick<
    AuthenticatedConvexWorkflowClient,
    | "cancelScheduledWorkflowJob"
    | "runBillingConvergenceJob"
    | "runNotificationCenterEmailDigestWorkflowJob"
    | "runSearchTenantIndexEnsureWorkflowJob"
    | "runWebhookOutboundDeliveryWorkflowJob"
    | "runTenantInvitationReminderWorkflowJob"
    | "runTenantInvitationExpiryNotificationWorkflowJob"
  > & {
    readonly runImportExportManagedFileSummaryWorkflowJob?: (
      request: { readonly jobId: string },
      options: { readonly authToken: string },
    ) => Effect.Effect<
      null,
      | ConvexWorkflowExecutionError
      | WorkflowJobsWorkflowExecutionUnavailableError
    >;
    readonly runImportExportSupportCaseSummaryWorkflowJob?: (
      request: { readonly jobId: string },
      options: { readonly authToken: string },
    ) => Effect.Effect<
      null,
      | ConvexWorkflowExecutionError
      | WorkflowJobsWorkflowExecutionUnavailableError
    >;
  };
  readonly validateWorkflowExecutionIdentity?: (input: {
    readonly requestContext: RequestContext;
    readonly convexAuthToken: string;
  }) => Effect.Effect<
    void,
    | WorkflowJobsWorkflowExecutionIdentityMismatchError
    | KeycloakAdapterRequestError
  >;
}): Effect.Effect<
  WorkflowJobsServiceApi,
  ParseResult.ParseError | WorkflowJobsProjectionConfigurationError,
  AuditLogModule | IdentitySessionModule
>;
export function makeWorkflowJobsService(
  options: WorkflowJobsServiceOptions,
): Effect.Effect<
  WorkflowJobsServiceApi,
  ParseResult.ParseError | WorkflowJobsProjectionConfigurationError,
  AuditLogModule | IdentitySessionModule | OryKetoAdapter
>;
export function makeWorkflowJobsService(
  options: WorkflowJobsServiceOptions,
): Effect.Effect<
  WorkflowJobsServiceApi,
  ParseResult.ParseError | WorkflowJobsProjectionConfigurationError,
  AuditLogModule | IdentitySessionModule | OryKetoAdapter
> {
  return options.authorization === undefined
    ? makeLiveWorkflowJobsAuthorization.pipe(
        Effect.flatMap((authorization) =>
          buildWorkflowJobsService(authorization, options),
        ),
      )
    : buildWorkflowJobsService(options.authorization, options);
}

export type WorkflowJobsTransportRuntime = {
  readonly service: WorkflowJobsServiceApi;
  readonly close: Effect.Effect<void>;
};

const makeWorkflowJobsTransportRuntime = (
  options: SubscriberJourneyRuntimeOptions,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeSubscriberJourneyRuntime(options);
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const workflowJobsDatabase = buildWriteDatabase(postgres.database);
    const workflowJobs =
      yield* makeWorkflowJobsPostgresRepositoryForRecordSchema(
        workflowJobsDatabase,
        buildWorkflowJobsPostgresQueryable<WorkflowJobRecord>(
          workflowJobsDatabase,
        ),
        WorkflowJobRecordSchema,
      );
    const workflowExecutionClient =
      yield* makeAuthenticatedConvexWorkflowClient({
        deploymentUrl: options.convexUrl,
        siteUrl: options.convexSiteUrl,
        adminKey: options.convexAdminKey,
        keycloakBaseUrl: options.keycloakBaseUrl,
        keycloakRealm: options.keycloakRealm,
        keycloakClientId: options.keycloakClientId,
        keycloakClientSecret: options.keycloakClientSecret,
        keycloakConvexServiceActorUsername:
          options.keycloakConvexServiceActorUsername,
        keycloakConvexServiceActorPassword:
          options.keycloakConvexServiceActorPassword,
      });
    const keycloak = yield* makeKeycloakAdapter({
      baseUrl: options.keycloakBaseUrl,
      realm: options.keycloakRealm,
      clientId: options.keycloakClientId,
      clientSecret: options.keycloakClientSecret,
    });
    const service = yield* makeWorkflowJobsService({
      workflowJobs,
      workflowExecutionClient,
      validateWorkflowExecutionIdentity:
        createWorkflowExecutionIdentityValidator(keycloak),
    }).pipe(
      Effect.provideService(AuditLogModule, runtime.auditLog),
      Effect.provideService(IdentitySessionModule, runtime.identitySession),
      Effect.provideService(OryKetoAdapter, runtime.oryKeto),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(runtime.close),
        Effect.ignore(postgres.close),
      ]).pipe(Effect.asVoid),
    } satisfies WorkflowJobsTransportRuntime;
  });

const runWorkflowJobsTransportWithResolvedOptions = <A, E>(
  options: SubscriberJourneyRuntimeOptions,
  use: (runtime: WorkflowJobsTransportRuntime) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeWorkflowJobsTransportRuntime(options);

    return yield* use(runtime).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const runWorkflowJobsFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: WorkflowJobsServiceApi) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runWorkflowJobsTransportWithResolvedOptions(
        resolvedOptions,
        ({ service }) => use(service),
      ),
    ),
  );

export type WorkflowJobsRuntimeError =
  | WorkflowJobsServiceError
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;
