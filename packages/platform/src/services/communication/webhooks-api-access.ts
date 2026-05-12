import {
  findModuleManifest,
  webhooksApiAccessConfigKey,
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
} from "@comvestec/config";
import { Cause, Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  CreateWebhookApiKeyInputSchema,
  type CreateWebhookSubscriptionInput,
  CreateWebhookSubscriptionInputSchema,
  fieldSecurityAuditAction,
  permissionScope,
  platformModuleId,
  platformScope,
  type ProjectionDescriptor,
  projectionProfile,
  RequestWebhookOutboundDeliveryInputSchema,
  type RequestContext,
  type WebhookApiKeyAdminView,
  WebhookApiKeyAdminViewListSchema,
  WebhookApiKeyAdminViewSchema,
  type WebhookApiKeyOneTimeSecretResult,
  type WebhookOutboundDeliveryRecord,
  WebhookApiKeyOneTimeSecretResultSchema,
  WebhookApiKeyListRequestSchema,
  WebhookApiKeyLookupSchema,
  type WebhookApiKeyRecord,
  type WebhookSubscriptionAdminView,
  WebhookSubscriptionAdminViewListSchema,
  WebhookSubscriptionAdminViewSchema,
  WebhookSubscriptionListRequestSchema,
  type WebhookSubscriptionRecord,
  webhookOutboundDeliveryStatus,
  webhookSubscriptionStatus,
  webhooksApiAccessAuditAction,
  type WorkflowJobSummary,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuthorizationDelegatedCheckError,
  type AuthorizationModuleService,
  type FieldSecurityModuleService,
  hasPrivilegedBreakGlassAccess,
  type IdentitySessionRequestContextNotFoundError,
  IdentitySessionModule,
  type IssuedWebhookApiKeySecret,
  makeAuthorizationModule,
  makeFieldSecurityModule,
  type RuntimeConfigModulePersistenceError,
  type RuntimeConfigModuleService,
  type UnknownConfigKeyError,
  type WebhooksApiAccessModuleError,
  WebhooksApiAccessModule,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  type WebhookOutboundDeliveryWorkflowJobRecord,
  WebhookOutboundDeliveryWorkflowJobRecordSchema,
  type WorkflowJobsPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  buildWebhookOutboundDeliveryWorkflowJobId,
  buildWorkflowJobSummary,
  buildWorkflowJobsPostgresQueryable,
  workflowJobRuntime,
} from "@comvestec/modules";
import {
  type AuthenticatedConvexWorkflowClient,
  type ConvexScheduledWorkflowDispatch,
  type ConvexWorkflowExecutionError,
  makeAuthenticatedConvexWorkflowClient,
  makePostgresAdapter,
  OryKetoAdapter,
  type ValkeyAdapterOperationError,
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
} from "../domains/subscriber-journey";
import { executeWorkflowJobRecord } from "../domains/workflow-jobs";

export const WebhooksApiAccessSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type WebhooksApiAccessSessionLookup = Schema.Schema.Type<
  typeof WebhooksApiAccessSessionLookupSchema
>;

export const ListWebhookSubscriptionsBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: WebhookSubscriptionListRequestSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
});

export type ListWebhookSubscriptionsBySessionRequest = Schema.Schema.Type<
  typeof ListWebhookSubscriptionsBySessionRequestSchema
>;

export const CreateWebhookSubscriptionBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: CreateWebhookSubscriptionInputSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  url: CreateWebhookSubscriptionInputSchema.fields.url,
  events: CreateWebhookSubscriptionInputSchema.fields.events,
});

export type CreateWebhookSubscriptionBySessionRequest = Schema.Schema.Type<
  typeof CreateWebhookSubscriptionBySessionRequestSchema
>;

export const ListWebhookApiKeysBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: WebhookApiKeyListRequestSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
});

export type ListWebhookApiKeysBySessionRequest = Schema.Schema.Type<
  typeof ListWebhookApiKeysBySessionRequestSchema
>;

export const CreateWebhookApiKeyBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: CreateWebhookApiKeyInputSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  label: CreateWebhookApiKeyInputSchema.fields.label,
});

export type CreateWebhookApiKeyBySessionRequest = Schema.Schema.Type<
  typeof CreateWebhookApiKeyBySessionRequestSchema
>;

export const RotateWebhookApiKeyBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: WebhookApiKeyLookupSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  apiKeyId: WebhookApiKeyLookupSchema.fields.apiKeyId,
});

export type RotateWebhookApiKeyBySessionRequest = Schema.Schema.Type<
  typeof RotateWebhookApiKeyBySessionRequestSchema
>;

export const RevokeWebhookApiKeyBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: WebhookApiKeyLookupSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  apiKeyId: WebhookApiKeyLookupSchema.fields.apiKeyId,
});

export type RevokeWebhookApiKeyBySessionRequest = Schema.Schema.Type<
  typeof RevokeWebhookApiKeyBySessionRequestSchema
>;

export const RequestWebhookOutboundDeliveryBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: RequestWebhookOutboundDeliveryInputSchema.fields.scope,
    scopeId: RequestWebhookOutboundDeliveryInputSchema.fields.scopeId,
    subscriptionId:
      RequestWebhookOutboundDeliveryInputSchema.fields.subscriptionId,
    eventType: RequestWebhookOutboundDeliveryInputSchema.fields.eventType,
    payload: RequestWebhookOutboundDeliveryInputSchema.fields.payload,
    scheduledAt: RequestWebhookOutboundDeliveryInputSchema.fields.scheduledAt,
  });

export type RequestWebhookOutboundDeliveryBySessionRequest = Schema.Schema.Type<
  typeof RequestWebhookOutboundDeliveryBySessionRequestSchema
>;

export const RunWebhookOutboundDeliveryWorkflowJobRequestSchema = Schema.Struct(
  {
    jobId: Schema.NonEmptyString,
  },
);

export type RunWebhookOutboundDeliveryWorkflowJobRequest = Schema.Schema.Type<
  typeof RunWebhookOutboundDeliveryWorkflowJobRequestSchema
>;

export type WebhooksApiAccessUnauthenticatedActorError = {
  readonly _tag: "WebhooksApiAccessUnauthenticatedActorError";
};

export type WebhooksApiAccessAccessDeniedError = {
  readonly _tag: "WebhooksApiAccessAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type WebhooksApiAccessProjectionConfigurationError = {
  readonly _tag: "WebhooksApiAccessProjectionConfigurationError";
  readonly moduleId: typeof platformModuleId.webhooksApiAccess;
  readonly profile: typeof projectionProfile.admin;
};

export type WebhooksApiAccessWorkflowUnavailableError = {
  readonly _tag: "WebhooksApiAccessWorkflowUnavailableError";
  readonly dependency:
    | "convexWorkflowClient"
    | "runtimeConfig"
    | "workflowJobs";
};

export type WebhooksApiAccessSubscriptionPausedError = {
  readonly _tag: "WebhooksApiAccessSubscriptionPausedError";
  readonly subscriptionId: string;
  readonly status: WebhookSubscriptionRecord["status"];
};

export type WebhooksApiAccessSubscriptionEventNotAllowedError = {
  readonly _tag: "WebhooksApiAccessSubscriptionEventNotAllowedError";
  readonly subscriptionId: string;
  readonly eventType: string;
};

export type WebhooksApiAccessDeliveryRequestError = {
  readonly _tag: "WebhooksApiAccessDeliveryRequestError";
  readonly url: string;
  readonly cause: unknown;
};

export type WebhooksApiAccessDeliveryRejectedError = {
  readonly _tag: "WebhooksApiAccessDeliveryRejectedError";
  readonly url: string;
  readonly status: number;
  readonly body?: string;
};

export type WebhooksApiAccessInternalContractError = {
  readonly _tag: "WebhooksApiAccessInternalContractError";
  readonly operation:
    | "authorizationCheck"
    | "auditLogAppend"
    | "webhookDeliveryMaxAttempts"
    | "fieldSecurityProjection"
    | "webhookApiKeyAdminView"
    | "webhookApiKeyAdminViewList"
    | "webhookApiKeyOneTimeSecretResult"
    | "webhookApiKeyModuleCreate"
    | "webhookApiKeyModuleList"
    | "webhookApiKeyModuleRotate"
    | "webhookApiKeyModuleRevoke"
    | "webhookApiKeyModuleRestore"
    | "webhookSubscriptionAdminView"
    | "webhookSubscriptionAdminViewList"
    | "webhookSubscriptionModuleCreate"
    | "webhookSubscriptionModuleGet"
    | "webhookSubscriptionModuleList"
    | "webhookOutboundDeliveryModuleCreate"
    | "webhookOutboundDeliveryModuleGet"
    | "webhookOutboundDeliveryModuleUpdate"
    | "webhookOutboundDeliveryWorkflowDispatchRecord"
    | "webhookOutboundDeliveryWorkflowJobRecord"
    | "webhookOutboundDeliveryWorkflowSummary";
  readonly cause: ParseResult.ParseError;
};

export type WebhooksApiAccessRuntimeError = {
  readonly _tag: "WebhooksApiAccessRuntimeError";
  readonly cause: unknown;
};

export type WebhooksApiAccessServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | ConvexWorkflowExecutionError
  | IdentitySessionRequestContextNotFoundError
  | RuntimeConfigModulePersistenceError
  | UnknownConfigKeyError
  | ValkeyAdapterOperationError
  | WebhooksApiAccessInternalContractError
  | WebhooksApiAccessProjectionConfigurationError
  | WebhooksApiAccessModuleError
  | WebhooksApiAccessUnauthenticatedActorError
  | WebhooksApiAccessAccessDeniedError
  | WebhooksApiAccessWorkflowUnavailableError
  | WebhooksApiAccessSubscriptionPausedError
  | WebhooksApiAccessSubscriptionEventNotAllowedError
  | WorkflowJobsPostgresRepositoryError;

export type WebhookOutboundDeliveryWorkflowExecutionError =
  | WebhooksApiAccessServiceError
  | WebhooksApiAccessDeliveryRejectedError
  | WebhooksApiAccessDeliveryRequestError;

type WebhooksApiAccessRuntimeConfig = Pick<
  RuntimeConfigModuleService,
  "listOverridesByModule" | "resolveConfigValue"
>;

type WebhooksApiAccessWorkflowJobsRepository = Pick<
  WorkflowJobsPostgresRepositoryServiceForRecord<WebhookOutboundDeliveryWorkflowJobRecord>,
  "claimScheduledWorkflowJob" | "getWorkflowJob" | "persistWorkflowJob"
>;

type WebhooksApiAccessWorkflowSchedulerClient = Pick<
  AuthenticatedConvexWorkflowClient,
  "scheduleWebhookOutboundDeliveryWorkflowJob" | "cancelScheduledWorkflowJob"
>;

export type WebhooksApiAccessServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
  readonly runtimeConfig?: WebhooksApiAccessRuntimeConfig;
  readonly workflowJobs?: WebhooksApiAccessWorkflowJobsRepository;
  readonly convexWorkflowClient?: WebhooksApiAccessWorkflowSchedulerClient;
};

export type WebhooksApiAccessService = {
  readonly resolveRequestContext: (
    input: WebhooksApiAccessSessionLookup,
  ) => Effect.Effect<
    RequestContext,
    | ParseResult.ParseError
    | IdentitySessionRequestContextNotFoundError
    | ValkeyAdapterOperationError
  >;
  readonly listWebhookSubscriptions: (
    input: ListWebhookSubscriptionsBySessionRequest,
  ) => Effect.Effect<
    readonly WebhookSubscriptionAdminView[],
    WebhooksApiAccessServiceError
  >;
  readonly createWebhookSubscription: (
    input: CreateWebhookSubscriptionBySessionRequest,
  ) => Effect.Effect<
    WebhookSubscriptionAdminView,
    WebhooksApiAccessServiceError
  >;
  readonly requestWebhookOutboundDelivery: (
    input: RequestWebhookOutboundDeliveryBySessionRequest,
  ) => Effect.Effect<WorkflowJobSummary, WebhooksApiAccessServiceError>;
  readonly listWebhookApiKeys: (
    input: ListWebhookApiKeysBySessionRequest,
  ) => Effect.Effect<
    readonly WebhookApiKeyAdminView[],
    WebhooksApiAccessServiceError
  >;
  readonly createWebhookApiKey: (
    input: CreateWebhookApiKeyBySessionRequest,
  ) => Effect.Effect<
    WebhookApiKeyOneTimeSecretResult,
    WebhooksApiAccessServiceError
  >;
  readonly rotateWebhookApiKey: (
    input: RotateWebhookApiKeyBySessionRequest,
  ) => Effect.Effect<
    WebhookApiKeyOneTimeSecretResult,
    WebhooksApiAccessServiceError
  >;
  readonly revokeWebhookApiKey: (
    input: RevokeWebhookApiKeyBySessionRequest,
  ) => Effect.Effect<WebhookApiKeyAdminView, WebhooksApiAccessServiceError>;
  readonly runWebhookOutboundDeliveryWorkflowJob: (
    input: RunWebhookOutboundDeliveryWorkflowJobRequest,
  ) => Effect.Effect<
    WorkflowJobSummary | undefined,
    WebhookOutboundDeliveryWorkflowExecutionError
  >;
};

type AuthenticatedWebhookOperatorContext = RequestContext & {
  readonly actorId: string;
};

type WebhooksApiAccessTarget = Pick<
  CreateWebhookSubscriptionInput,
  "scope" | "scopeId"
>;

const createInternalContractError =
  (operation: WebhooksApiAccessInternalContractError["operation"]) =>
  (cause: ParseResult.ParseError): WebhooksApiAccessInternalContractError => ({
    _tag: "WebhooksApiAccessInternalContractError",
    operation,
    cause,
  });

const normalizeAuthorizationCheckError = (
  error: ParseResult.ParseError | AuthorizationDelegatedCheckError,
): AuthorizationDelegatedCheckError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("authorizationCheck")(error)
    : error;

const normalizeAuditLogError = (
  error: AuditLogModuleError,
): AuditLogModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("auditLogAppend")(error)
    : error;

const normalizeWebhooksModuleListError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookSubscriptionModuleList")(error)
    : error;

const normalizeWebhooksModuleCreateError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookSubscriptionModuleCreate")(error)
    : error;

const normalizeWebhooksSubscriptionModuleGetError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookSubscriptionModuleGet")(error)
    : error;

const normalizeWebhooksApiKeyModuleListError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookApiKeyModuleList")(error)
    : error;

const normalizeWebhooksApiKeyModuleCreateError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookApiKeyModuleCreate")(error)
    : error;

const normalizeWebhooksApiKeyModuleRotateError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookApiKeyModuleRotate")(error)
    : error;

const normalizeWebhooksApiKeyModuleRevokeError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookApiKeyModuleRevoke")(error)
    : error;

const normalizeWebhooksApiKeyModuleRestoreError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookApiKeyModuleRestore")(error)
    : error;

const normalizeWebhooksOutboundDeliveryModuleCreateError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookOutboundDeliveryModuleCreate")(error)
    : error;

const normalizeWebhooksOutboundDeliveryModuleGetError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookOutboundDeliveryModuleGet")(error)
    : error;

const normalizeWebhooksOutboundDeliveryModuleUpdateError = (
  error: WebhooksApiAccessModuleError,
): WebhooksApiAccessModuleError | WebhooksApiAccessInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("webhookOutboundDeliveryModuleUpdate")(error)
    : error;

const ensureWebhookOperatorAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedWebhookOperatorContext,
  | WebhooksApiAccessUnauthenticatedActorError
  | WebhooksApiAccessAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): WebhooksApiAccessUnauthenticatedActorError => ({
        _tag: "WebhooksApiAccessUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "WebhooksApiAccessAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies WebhooksApiAccessAccessDeniedError),
    ),
  );

const requestTargetsCurrentTenant = (
  requestContext: RequestContext,
  target: WebhooksApiAccessTarget,
) =>
  requestContext.tenant.scope === target.scope &&
  requestContext.tenant.scopeId === target.scopeId;

const buildTargetTenantContext = (
  target: WebhooksApiAccessTarget,
): RequestContext["tenant"] => ({
  scope: target.scope,
  scopeId: target.scopeId,
  ...(target.scope === platformScope.enterprise
    ? { enterpriseId: target.scopeId }
    : {}),
  ...(target.scope === platformScope.organization
    ? { organizationId: target.scopeId }
    : {}),
  ...(target.scope === platformScope.individual
    ? { individualId: target.scopeId }
    : {}),
});

const authorizeWebhookOperatorAccess = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: RequestContext;
  readonly target: WebhooksApiAccessTarget;
}) =>
  Effect.gen(function* () {
    const authenticatedRequestContext = yield* ensureWebhookOperatorAccess(
      input.requestContext,
    );
    const authorizationRequestContext = requestTargetsCurrentTenant(
      authenticatedRequestContext,
      input.target,
    )
      ? authenticatedRequestContext
      : hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
        ? {
            ...authenticatedRequestContext,
            tenant: buildTargetTenantContext(input.target),
          }
        : yield* Effect.fail({
            _tag: "WebhooksApiAccessAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies WebhooksApiAccessAccessDeniedError);
    const decision = yield* input.authorization
      .check({
        requestContext: authorizationRequestContext,
        namespace: authorizationNamespace.module,
        object: platformModuleId.webhooksApiAccess,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.webhookManage,
      })
      .pipe(Effect.mapError(normalizeAuthorizationCheckError));

    return decision.allowed
      ? authorizationRequestContext
      : yield* Effect.fail({
          _tag: "WebhooksApiAccessAccessDeniedError",
          actorType: authenticatedRequestContext.actorType,
        } satisfies WebhooksApiAccessAccessDeniedError);
  });

const resolveWebhookAdminProjection = () =>
  Effect.fromNullable(
    findModuleManifest(
      platformModuleId.webhooksApiAccess,
    )?.projectionProfiles.find(
      (projection) => projection.profile === projectionProfile.admin,
    ),
  ).pipe(
    Effect.orElseFail(
      (): WebhooksApiAccessProjectionConfigurationError => ({
        _tag: "WebhooksApiAccessProjectionConfigurationError",
        moduleId: platformModuleId.webhooksApiAccess,
        profile: projectionProfile.admin,
      }),
    ),
  );

const hasProjectedFieldValue = (
  record: Record<string, unknown>,
  fieldPath: string,
) =>
  fieldPath
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      record,
    ) !== undefined;

type ProjectedWebhookSubscriptionAdminRecord = {
  readonly record: WebhookSubscriptionAdminView;
  readonly auditedFields: readonly string[];
};

type ProjectedWebhookApiKeyAdminRecord = {
  readonly record: WebhookApiKeyAdminView;
  readonly auditedFields: readonly string[];
};

const collectAuditedFields = <A>(
  records: readonly { auditedFields: readonly string[]; record: A }[],
) => [...new Set(records.flatMap((record) => record.auditedFields))];

const appendSensitiveReadAudit = (
  auditLog: Pick<AuditLogModuleService, "append">,
  input: {
    readonly requestContext: RequestContext;
    readonly target: string;
    readonly reason: string;
    readonly auditedFields: readonly string[];
  },
) =>
  input.auditedFields.length === 0
    ? Effect.succeed(undefined)
    : auditLog
        .append({
          requestContext: input.requestContext,
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: input.target,
          reason: input.reason,
        })
        .pipe(Effect.mapError(normalizeAuditLogError))
        .pipe(Effect.asVoid);

const appendWebhookApiKeyLifecycleAudit = (
  auditLog: Pick<AuditLogModuleService, "append">,
  input: {
    readonly requestContext: RequestContext;
    readonly action:
      | typeof webhooksApiAccessAuditAction.apiKeyCreated
      | typeof webhooksApiAccessAuditAction.apiKeyRotated
      | typeof webhooksApiAccessAuditAction.apiKeyRotationCompensated
      | typeof webhooksApiAccessAuditAction.apiKeyRevoked;
    readonly apiKeyId: string;
    readonly reason: string;
  },
) =>
  auditLog
    .append({
      requestContext: input.requestContext,
      moduleId: platformModuleId.webhooksApiAccess,
      action: input.action,
      target: `${platformModuleId.webhooksApiAccess}:${input.apiKeyId}`,
      reason: input.reason,
    })
    .pipe(Effect.mapError(normalizeAuditLogError))
    .pipe(Effect.asVoid);

const appendWebhookDeliveryRequestedAudit = (
  auditLog: Pick<AuditLogModuleService, "append">,
  input: {
    readonly requestContext: RequestContext;
    readonly deliveryId: string;
    readonly reason: string;
  },
) =>
  auditLog
    .append({
      requestContext: input.requestContext,
      moduleId: platformModuleId.webhooksApiAccess,
      action: webhooksApiAccessAuditAction.deliveryRequested,
      target: `${platformModuleId.webhooksApiAccess}:${input.deliveryId}`,
      reason: input.reason,
    })
    .pipe(Effect.mapError(normalizeAuditLogError))
    .pipe(Effect.asVoid);

const decodeWebhookDeliveryMaxAttempts = Schema.decodeUnknown(
  Schema.Number.pipe(
    Schema.filter((value) => Number.isInteger(value) && value > 0),
  ),
);

const resolveWebhookDeliveryMaxAttempts = (input: {
  readonly runtimeConfig: WebhooksApiAccessRuntimeConfig;
  readonly requestContext: RequestContext;
  readonly target: WebhooksApiAccessTarget;
}) =>
  Effect.gen(function* () {
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.webhooksApiAccess,
    );
    const resolution = yield* input.runtimeConfig.resolveConfigValue({
      requestContext: requestTargetsCurrentTenant(
        input.requestContext,
        input.target,
      )
        ? input.requestContext
        : {
            ...input.requestContext,
            tenant: buildTargetTenantContext(input.target),
          },
      moduleId: platformModuleId.webhooksApiAccess,
      key: webhooksApiAccessConfigKey.deliveryMaxRetries,
      overrides,
      entitlements: [],
    });

    const maxRetries = yield* decodeWebhookDeliveryMaxAttempts(
      resolution.effectiveValue,
    ).pipe(
      Effect.mapError(
        createInternalContractError("webhookDeliveryMaxAttempts"),
      ),
    );

    return maxRetries + 1;
  });

const ensureWebhookSubscriptionCanDeliver = (input: {
  readonly subscription: WebhookSubscriptionRecord;
  readonly eventType: string;
}): Effect.Effect<
  WebhookSubscriptionRecord,
  | WebhooksApiAccessSubscriptionPausedError
  | WebhooksApiAccessSubscriptionEventNotAllowedError
> => {
  if (input.subscription.status !== webhookSubscriptionStatus.active) {
    return Effect.fail({
      _tag: "WebhooksApiAccessSubscriptionPausedError",
      subscriptionId: input.subscription.subscriptionId,
      status: input.subscription.status,
    } satisfies WebhooksApiAccessSubscriptionPausedError);
  }

  return input.subscription.events.includes(input.eventType)
    ? Effect.succeed(input.subscription)
    : Effect.fail({
        _tag: "WebhooksApiAccessSubscriptionEventNotAllowedError",
        subscriptionId: input.subscription.subscriptionId,
        eventType: input.eventType,
      } satisfies WebhooksApiAccessSubscriptionEventNotAllowedError);
};

const buildWebhookOutboundDeliveryWorkflowJobRecord = (input: {
  readonly jobId: string;
  readonly scope: WebhooksApiAccessTarget["scope"];
  readonly scopeId: string;
  readonly requestContext: AuthenticatedWebhookOperatorContext;
  readonly actorId: string;
  readonly correlationId: string;
  readonly subscriptionId: string;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly payload: string;
  readonly maxAttempts: number;
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(WebhookOutboundDeliveryWorkflowJobRecordSchema)({
    jobId: input.jobId,
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.webhooksApiAccess,
    kind: workflowJobKind.webhookOutboundDelivery,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.scheduled,
    tenantScope: input.scope,
    tenantScopeId: input.scopeId,
    attempts: 0,
    scheduledAt: input.scheduledAt,
    payload: {
      sourceModuleId: platformModuleId.webhooksApiAccess,
      tenantScope: input.scope,
      tenantScopeId: input.scopeId,
      requestContext: input.requestContext,
      actorId: input.actorId,
      correlationId: input.correlationId,
      subscriptionId: input.subscriptionId,
      deliveryId: input.deliveryId,
      eventType: input.eventType,
      payload: input.payload,
      maxAttempts: input.maxAttempts,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildWebhookOutboundDeliveryWorkflowDispatchRecord = (input: {
  readonly job: WebhookOutboundDeliveryWorkflowJobRecord;
  readonly now: string;
  readonly dispatch: ConvexScheduledWorkflowDispatch;
}) =>
  Schema.decodeUnknown(WebhookOutboundDeliveryWorkflowJobRecordSchema)({
    ...input.job,
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

const scheduleWebhookOutboundDeliveryWorkflowJobRecord = (input: {
  readonly job: WebhookOutboundDeliveryWorkflowJobRecord;
  readonly scheduledAt: string;
  readonly now: string;
}) => {
  const { dispatch: _dispatch, ...payloadWithoutDispatch } = input.job.payload;

  return Schema.decodeUnknown(WebhookOutboundDeliveryWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.scheduled,
    scheduledAt: input.scheduledAt,
    completedAt: undefined,
    gapReason: undefined,
    lastError: undefined,
    payload: payloadWithoutDispatch,
    updatedAt: input.now,
  });
};

const completeWebhookOutboundDeliveryWorkflowJob = (input: {
  readonly job: WebhookOutboundDeliveryWorkflowJobRecord;
  readonly now: string;
}) =>
  Schema.decodeUnknown(WebhookOutboundDeliveryWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.completed,
    completedAt: input.now,
    gapReason: undefined,
    lastError: undefined,
    updatedAt: input.now,
  });

const blockWebhookOutboundDeliveryWorkflowJob = (input: {
  readonly job: WebhookOutboundDeliveryWorkflowJobRecord;
  readonly now: string;
  readonly lastError: string;
}) =>
  Schema.decodeUnknown(WebhookOutboundDeliveryWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.blocked,
    completedAt: input.now,
    gapReason: workflowJobGapReason.repairFailed,
    lastError: input.lastError,
    updatedAt: input.now,
  });

const shouldBlockStaleRunningWebhookOutboundDeliveryWorkflowJob = (
  job: WebhookOutboundDeliveryWorkflowJobRecord,
) =>
  job.status === workflowJobStatus.running &&
  job.attempts >= workflowJobsRetryMaxAttempts &&
  Date.parse(job.updatedAt) <=
    Date.now() - workflowJobsRunningClaimTimeoutSeconds * 1_000;

const readWebhookOutboundDeliveryFailureMessage = (error: unknown) => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const taggedError = error as {
      readonly _tag: string;
      readonly status?: number;
      readonly body?: string;
      readonly subscriptionId?: string;
      readonly eventType?: string;
      readonly deliveryId?: string;
      readonly url?: string;
    };

    switch (taggedError._tag) {
      case "WebhooksApiAccessDeliveryRejectedError":
        return taggedError.body === undefined
          ? `Webhook delivery failed with HTTP ${taggedError.status}.`
          : `Webhook delivery failed with HTTP ${taggedError.status}: ${taggedError.body}`;
      case "WebhooksApiAccessSubscriptionEventNotAllowedError":
        return `Webhook subscription ${taggedError.subscriptionId} does not accept event ${taggedError.eventType}.`;
      case "WebhooksApiAccessSubscriptionPausedError":
        return `Webhook subscription ${taggedError.subscriptionId} is ${taggedError.status}.`;
      case "WebhookSubscriptionNotFoundError":
        return `Webhook subscription ${taggedError.subscriptionId} was not found.`;
      case "WebhookOutboundDeliveryNotFoundError":
        return `Webhook delivery ${taggedError.deliveryId} was not found.`;
      case "WebhooksApiAccessDeliveryRequestError":
        return `Webhook delivery request to ${taggedError.url} failed.`;
    }
  }

  return "Webhook delivery failed.";
};

const shouldRetryWebhookOutboundDeliveryFailure = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return false;
  }

  const taggedError = error as {
    readonly _tag: string;
    readonly status?: number;
  };

  switch (taggedError._tag) {
    case "WebhooksApiAccessDeliveryRequestError":
      return true;
    case "WebhooksApiAccessDeliveryRejectedError":
      return (
        taggedError.status === 408 ||
        taggedError.status === 429 ||
        (taggedError.status ?? 0) >= 500
      );
    default:
      return false;
  }
};

const calculateWebhookOutboundDeliveryRetryAt = (input: {
  readonly attempts: number;
  readonly now: string;
}) => {
  const delayMs = Math.min(
    60 * 60 * 1_000,
    60 * 1_000 * 2 ** Math.max(0, input.attempts - 1),
  );

  return new Date(Date.parse(input.now) + delayMs).toISOString();
};

const buildBlockedWebhookOutboundDeliveryRecord = (input: {
  readonly currentRecord: WebhookOutboundDeliveryRecord;
  readonly attemptCount: number;
  readonly now: string;
  readonly lastError: string;
  readonly exhaustedAt?: string;
}) => {
  const {
    nextAttemptAt: _nextAttemptAt,
    deliveredAt: _deliveredAt,
    exhaustedAt: _existingExhaustedAt,
    ...currentRecordWithoutTerminalTimestamps
  } = input.currentRecord;

  return {
    ...currentRecordWithoutTerminalTimestamps,
    status: webhookOutboundDeliveryStatus.blocked,
    attemptCount: input.attemptCount,
    updatedAt: input.now,
    lastError: input.lastError,
    ...(input.exhaustedAt === undefined
      ? {}
      : { exhaustedAt: input.exhaustedAt }),
  } satisfies WebhookOutboundDeliveryRecord;
};

const buildDeliveredWebhookOutboundDeliveryRecord = (input: {
  readonly currentRecord: WebhookOutboundDeliveryRecord;
  readonly attemptCount: number;
  readonly now: string;
}) => {
  const {
    nextAttemptAt: _nextAttemptAt,
    deliveredAt: _existingDeliveredAt,
    exhaustedAt: _existingExhaustedAt,
    lastError: _existingLastError,
    ...currentRecordWithoutRetryMetadata
  } = input.currentRecord;

  return {
    ...currentRecordWithoutRetryMetadata,
    status: webhookOutboundDeliveryStatus.delivered,
    attemptCount: input.attemptCount,
    updatedAt: input.now,
    deliveredAt: input.now,
  } satisfies WebhookOutboundDeliveryRecord;
};

const combineWebhookOutboundDeliveryFailureMessages = (
  messages: ReadonlyArray<string | undefined>,
) =>
  messages
    .map((message) => message?.trim())
    .filter((message): message is string => message !== undefined)
    .filter((message) => message.length > 0)
    .join(" | ");

const sendWebhookOutboundDelivery = (input: {
  readonly subscription: WebhookSubscriptionRecord;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly payload: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(input.subscription.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": input.deliveryId,
          "x-comvestec-delivery-id": input.deliveryId,
          "x-comvestec-event-type": input.eventType,
        },
        body: input.payload,
      });
      const body = await response.text().catch(() => "");

      return {
        ok: response.ok,
        status: response.status,
        body,
      } as const;
    },
    catch: (cause) =>
      ({
        _tag: "WebhooksApiAccessDeliveryRequestError",
        url: input.subscription.url,
        cause,
      }) satisfies WebhooksApiAccessDeliveryRequestError,
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail({
            _tag: "WebhooksApiAccessDeliveryRejectedError",
            url: input.subscription.url,
            status: response.status,
            ...(response.body.length === 0
              ? {}
              : { body: response.body.slice(0, 2_048) }),
          } satisfies WebhooksApiAccessDeliveryRejectedError),
    ),
  );

const isAuditAppendFailure = (error: WebhooksApiAccessServiceError) =>
  error._tag === "AuditLogPostgresRepositoryPersistenceError" ||
  (error._tag === "WebhooksApiAccessInternalContractError" &&
    error.operation === "auditLogAppend");

const applyProjectedWebhookSubscriptionAdminRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: WebhookSubscriptionRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.webhooksApiAccess,
      requestContext: input.requestContext,
      projection: input.projection,
      record: {
        subscriptionId: input.record.subscriptionId,
        url: input.record.url,
        events: input.record.events,
        status: input.record.status,
        ...(input.record.lastDeliveryAt !== undefined
          ? { lastDeliveryAt: input.record.lastDeliveryAt }
          : {}),
      },
    })
    .pipe(
      Effect.mapError(createInternalContractError("fieldSecurityProjection")),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(WebhookSubscriptionAdminViewSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(
            createInternalContractError("webhookSubscriptionAdminView"),
          ),
          Effect.map((record) => ({
            record,
            auditedFields: result.auditedFields.filter(
              (field) =>
                hasProjectedFieldValue(projectedRecord, field) &&
                !result.redactedFields.includes(field),
            ),
          })),
        );
      }),
    );

const projectWebhookSubscriptionAdminRecords = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly records: readonly WebhookSubscriptionRecord[];
}) =>
  Effect.forEach(input.records, (record) =>
    applyProjectedWebhookSubscriptionAdminRecord({
      fieldSecurity: input.fieldSecurity,
      requestContext: input.requestContext,
      projection: input.projection,
      record,
    }),
  );

const applyProjectedWebhookApiKeyAdminRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: WebhookApiKeyRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.webhooksApiAccess,
      requestContext: input.requestContext,
      projection: input.projection,
      record: {
        apiKeyId: input.record.apiKeyId,
        label: input.record.label,
        prefix: input.record.prefix,
        status: input.record.status,
        createdAt: input.record.createdAt,
        ...(input.record.rotatedAt === undefined
          ? {}
          : { rotatedAt: input.record.rotatedAt }),
        ...(input.record.revokedAt === undefined
          ? {}
          : { revokedAt: input.record.revokedAt }),
      },
    })
    .pipe(
      Effect.mapError(createInternalContractError("fieldSecurityProjection")),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(WebhookApiKeyAdminViewSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(
            createInternalContractError("webhookApiKeyAdminView"),
          ),
          Effect.map((record) => ({
            record,
            auditedFields: result.auditedFields.filter(
              (field) =>
                hasProjectedFieldValue(projectedRecord, field) &&
                !result.redactedFields.includes(field),
            ),
          })),
        );
      }),
    );

const projectWebhookApiKeyAdminRecords = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly records: readonly WebhookApiKeyRecord[];
}) =>
  Effect.forEach(input.records, (record) =>
    applyProjectedWebhookApiKeyAdminRecord({
      fieldSecurity: input.fieldSecurity,
      requestContext: input.requestContext,
      projection: input.projection,
      record,
    }),
  );

const buildWebhookApiKeyOneTimeSecretResult = (input: {
  readonly apiKey: WebhookApiKeyAdminView;
  readonly secret: IssuedWebhookApiKeySecret["secret"];
}) =>
  Schema.decodeUnknown(WebhookApiKeyOneTimeSecretResultSchema)({
    apiKey: input.apiKey,
    secret: input.secret,
  }).pipe(
    Effect.mapError(
      createInternalContractError("webhookApiKeyOneTimeSecretResult"),
    ),
  );

const buildWebhooksApiAccessService = (
  authorization: Pick<AuthorizationModuleService, "check">,
  options: Omit<WebhooksApiAccessServiceOptions, "authorization"> = {},
) =>
  Effect.gen(function* () {
    const adminProjection = yield* resolveWebhookAdminProjection();
    const auditLog = yield* AuditLogModule;
    const fieldSecurity = yield* makeFieldSecurityModule();
    const identitySession = yield* IdentitySessionModule;
    const webhooksApiAccess = yield* WebhooksApiAccessModule;
    const runtimeConfig = options.runtimeConfig;
    const workflowJobs = options.workflowJobs;
    const convexWorkflowClient = options.convexWorkflowClient;

    const requireRuntimeConfig = () =>
      runtimeConfig === undefined
        ? Effect.fail({
            _tag: "WebhooksApiAccessWorkflowUnavailableError",
            dependency: "runtimeConfig",
          } satisfies WebhooksApiAccessWorkflowUnavailableError)
        : Effect.succeed(runtimeConfig);

    const requireWorkflowJobs = () =>
      workflowJobs === undefined
        ? Effect.fail({
            _tag: "WebhooksApiAccessWorkflowUnavailableError",
            dependency: "workflowJobs",
          } satisfies WebhooksApiAccessWorkflowUnavailableError)
        : Effect.succeed(workflowJobs);

    const requireConvexWorkflowClient = () =>
      convexWorkflowClient === undefined
        ? Effect.fail({
            _tag: "WebhooksApiAccessWorkflowUnavailableError",
            dependency: "convexWorkflowClient",
          } satisfies WebhooksApiAccessWorkflowUnavailableError)
        : Effect.succeed(convexWorkflowClient);

    const cancelWebhookOutboundDeliveryDispatch = (
      dispatch: ConvexScheduledWorkflowDispatch | undefined,
    ) => {
      if (convexWorkflowClient === undefined || dispatch === undefined) {
        return Effect.void;
      }

      const scheduledFunctionIds = [
        dispatch.scheduledFunctionId,
        ...dispatch.scheduledFunctionIds,
      ].filter(
        (scheduledFunctionId, index, allScheduledFunctionIds) =>
          allScheduledFunctionIds.indexOf(scheduledFunctionId) === index,
      );

      return Effect.forEach(
        scheduledFunctionIds,
        (scheduledFunctionId) =>
          convexWorkflowClient
            .cancelScheduledWorkflowJob({
              scheduledFunctionId,
            })
            .pipe(Effect.catchAll(() => Effect.void)),
        {
          discard: true,
        },
      );
    };

    const compensateWebhookOutboundDeliveryFailure = <
      E extends WebhooksApiAccessServiceError,
    >(input: {
      readonly workflowJobs: WebhooksApiAccessWorkflowJobsRepository;
      readonly currentDelivery: WebhookOutboundDeliveryRecord;
      readonly currentJob?: WebhookOutboundDeliveryWorkflowJobRecord;
      readonly attemptCount: number;
      readonly lastError: string;
      readonly cause: Cause.Cause<E>;
      readonly dispatch?: ConvexScheduledWorkflowDispatch;
      readonly exhaustedAt?: string;
    }): Effect.Effect<never, E | WebhooksApiAccessServiceError> => {
      const now = new Date().toISOString();

      return cancelWebhookOutboundDeliveryDispatch(
        input.dispatch ?? input.currentJob?.payload.dispatch,
      ).pipe(
        Effect.zipRight(
          input.currentJob === undefined
            ? Effect.void
            : blockWebhookOutboundDeliveryWorkflowJob({
                job: input.currentJob,
                now,
                lastError: input.lastError,
              }).pipe(
                Effect.mapError(
                  createInternalContractError(
                    "webhookOutboundDeliveryWorkflowJobRecord",
                  ),
                ),
                Effect.flatMap((blockedJob) =>
                  input.workflowJobs.persistWorkflowJob(blockedJob),
                ),
              ),
        ),
        Effect.zipRight(
          webhooksApiAccess
            .updateWebhookOutboundDelivery({
              record: buildBlockedWebhookOutboundDeliveryRecord({
                currentRecord: input.currentDelivery,
                attemptCount: input.attemptCount,
                now,
                lastError: input.lastError,
                ...(input.exhaustedAt === undefined
                  ? {}
                  : { exhaustedAt: input.exhaustedAt }),
              }),
              expectedCurrentRecord: input.currentDelivery,
            })
            .pipe(
              Effect.mapError(
                normalizeWebhooksOutboundDeliveryModuleUpdateError,
              ),
            ),
        ),
        Effect.flatMap(() => Effect.failCause(input.cause)),
      );
    };

    const recoverWebhookOutboundDeliveryFailure = (input: {
      readonly workflowJobs: WebhooksApiAccessWorkflowJobsRepository;
      readonly currentDelivery: WebhookOutboundDeliveryRecord;
      readonly currentJob: WebhookOutboundDeliveryWorkflowJobRecord;
      readonly attemptCount: number;
      readonly lastError: string;
      readonly dispatch?: ConvexScheduledWorkflowDispatch;
      readonly exhaustedAt?: string;
    }): Effect.Effect<
      WebhookOutboundDeliveryWorkflowJobRecord,
      WebhookOutboundDeliveryWorkflowExecutionError
    > => {
      const now = new Date().toISOString();

      return cancelWebhookOutboundDeliveryDispatch(
        input.dispatch ?? input.currentJob.payload.dispatch,
      ).pipe(
        Effect.zipRight(
          blockWebhookOutboundDeliveryWorkflowJob({
            job: input.currentJob,
            now,
            lastError: input.lastError,
          }).pipe(
            Effect.mapError(
              createInternalContractError(
                "webhookOutboundDeliveryWorkflowJobRecord",
              ),
            ),
            Effect.flatMap((blockedJob) =>
              input.workflowJobs.persistWorkflowJob(blockedJob),
            ),
          ),
        ),
        Effect.flatMap((blockedJob) =>
          webhooksApiAccess
            .updateWebhookOutboundDelivery({
              record: buildBlockedWebhookOutboundDeliveryRecord({
                currentRecord: input.currentDelivery,
                attemptCount: input.attemptCount,
                now,
                lastError: input.lastError,
                ...(input.exhaustedAt === undefined
                  ? {}
                  : { exhaustedAt: input.exhaustedAt }),
              }),
              expectedCurrentRecord: input.currentDelivery,
            })
            .pipe(
              Effect.mapError(
                normalizeWebhooksOutboundDeliveryModuleUpdateError,
              ),
              Effect.as(blockedJob),
            ),
        ),
      );
    };

    return {
      resolveRequestContext: (input: WebhooksApiAccessSessionLookup) =>
        Schema.decodeUnknown(WebhooksApiAccessSessionLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            identitySession.resolveRequestContext({
              sessionId: request.sessionId,
            }),
          ),
        ),
      listWebhookSubscriptions: (
        input: ListWebhookSubscriptionsBySessionRequest,
      ): Effect.Effect<
        readonly WebhookSubscriptionAdminView[],
        WebhooksApiAccessServiceError
      > =>
        Schema.decodeUnknown(ListWebhookSubscriptionsBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeWebhookOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const records = yield* webhooksApiAccess
                .listWebhookSubscriptions({
                  scope: request.scope,
                  scopeId: request.scopeId,
                })
                .pipe(Effect.mapError(normalizeWebhooksModuleListError));
              const projectedRecords =
                yield* projectWebhookSubscriptionAdminRecords({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  records,
                });
              const auditedFields = collectAuditedFields(projectedRecords);

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.webhooksApiAccess}:${request.scope}:${request.scopeId}:subscriptions:${auditedFields.join(",")}`,
                reason:
                  "Operator read webhook subscriptions through the admin communication surface.",
                auditedFields,
              });

              return yield* Schema.decodeUnknown(
                WebhookSubscriptionAdminViewListSchema,
              )(projectedRecords.map((record) => record.record)).pipe(
                Effect.mapError(
                  createInternalContractError(
                    "webhookSubscriptionAdminViewList",
                  ),
                ),
              );
            }),
          ),
        ),
      createWebhookSubscription: (
        input: CreateWebhookSubscriptionBySessionRequest,
      ): Effect.Effect<
        WebhookSubscriptionAdminView,
        WebhooksApiAccessServiceError
      > =>
        Schema.decodeUnknown(CreateWebhookSubscriptionBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeWebhookOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const record = yield* webhooksApiAccess
                .createWebhookSubscription({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  url: request.url,
                  events: request.events,
                })
                .pipe(Effect.mapError(normalizeWebhooksModuleCreateError));
              const projectedRecord =
                yield* applyProjectedWebhookSubscriptionAdminRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  record,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.webhooksApiAccess}:${record.subscriptionId}:subscription:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator read a webhook subscription through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      requestWebhookOutboundDelivery: (
        input: RequestWebhookOutboundDeliveryBySessionRequest,
      ): Effect.Effect<WorkflowJobSummary, WebhooksApiAccessServiceError> =>
        Schema.decodeUnknown(
          RequestWebhookOutboundDeliveryBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const runtimeConfig = yield* requireRuntimeConfig();
              const workflowJobs = yield* requireWorkflowJobs();
              const convexWorkflowClient = yield* requireConvexWorkflowClient();
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeWebhookOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const subscription = yield* webhooksApiAccess
                .getWebhookSubscription({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  subscriptionId: request.subscriptionId,
                })
                .pipe(
                  Effect.mapError(normalizeWebhooksSubscriptionModuleGetError),
                );

              yield* ensureWebhookSubscriptionCanDeliver({
                subscription,
                eventType: request.eventType,
              });

              const maxAttempts = yield* resolveWebhookDeliveryMaxAttempts({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target: {
                  scope: request.scope,
                  scopeId: request.scopeId,
                },
              });
              const delivery = yield* webhooksApiAccess
                .createWebhookOutboundDelivery({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  subscriptionId: request.subscriptionId,
                  eventType: request.eventType,
                  payload: request.payload,
                  maxAttempts,
                  ...(request.scheduledAt === undefined
                    ? {}
                    : { scheduledAt: request.scheduledAt }),
                })
                .pipe(
                  Effect.mapError(
                    normalizeWebhooksOutboundDeliveryModuleCreateError,
                  ),
                );

              let requestWorkflowJob:
                | WebhookOutboundDeliveryWorkflowJobRecord
                | undefined;
              let requestDispatch: ConvexScheduledWorkflowDispatch | undefined;

              const scheduledJob = yield* Effect.gen(function* () {
                const now = new Date().toISOString();

                requestWorkflowJob =
                  yield* buildWebhookOutboundDeliveryWorkflowJobRecord({
                    jobId: buildWebhookOutboundDeliveryWorkflowJobId({
                      trigger: workflowJobTrigger.operatorRequested,
                      tenantScope: request.scope,
                      tenantScopeId: request.scopeId,
                      key: delivery.deliveryId,
                    }),
                    scope: request.scope,
                    scopeId: request.scopeId,
                    requestContext: authorizedRequestContext,
                    actorId: authorizedRequestContext.actorId,
                    correlationId: authorizedRequestContext.correlationId,
                    subscriptionId: request.subscriptionId,
                    deliveryId: delivery.deliveryId,
                    eventType: request.eventType,
                    payload: request.payload,
                    maxAttempts,
                    scheduledAt: request.scheduledAt ?? now,
                    now,
                  }).pipe(
                    Effect.mapError(
                      createInternalContractError(
                        "webhookOutboundDeliveryWorkflowJobRecord",
                      ),
                    ),
                  );
                requestWorkflowJob =
                  yield* workflowJobs.persistWorkflowJob(requestWorkflowJob);

                yield* appendWebhookDeliveryRequestedAudit(auditLog, {
                  requestContext: authorizedRequestContext,
                  deliveryId: delivery.deliveryId,
                  reason:
                    "Operator requested outbound webhook delivery through the admin communication surface.",
                });

                requestDispatch =
                  yield* convexWorkflowClient.scheduleWebhookOutboundDeliveryWorkflowJob(
                    {
                      jobId: requestWorkflowJob.jobId,
                      scheduledAt: requestWorkflowJob.scheduledAt,
                    },
                  );
                requestWorkflowJob =
                  yield* buildWebhookOutboundDeliveryWorkflowDispatchRecord({
                    job: requestWorkflowJob,
                    now: new Date().toISOString(),
                    dispatch: requestDispatch,
                  }).pipe(
                    Effect.mapError(
                      createInternalContractError(
                        "webhookOutboundDeliveryWorkflowDispatchRecord",
                      ),
                    ),
                  );

                return yield* workflowJobs.persistWorkflowJob(
                  requestWorkflowJob,
                );
              }).pipe(
                Effect.catchAllCause((cause) =>
                  compensateWebhookOutboundDeliveryFailure({
                    workflowJobs,
                    currentDelivery: delivery,
                    attemptCount: requestWorkflowJob?.attempts ?? 0,
                    lastError: Cause.pretty(cause),
                    cause,
                    ...(requestWorkflowJob === undefined
                      ? {}
                      : { currentJob: requestWorkflowJob }),
                    ...(requestDispatch === undefined
                      ? {}
                      : { dispatch: requestDispatch }),
                  }),
                ),
              );

              return yield* buildWorkflowJobSummary({
                record: scheduledJob,
              }).pipe(
                Effect.mapError(
                  createInternalContractError(
                    "webhookOutboundDeliveryWorkflowSummary",
                  ),
                ),
              );
            }),
          ),
        ),
      listWebhookApiKeys: (
        input: ListWebhookApiKeysBySessionRequest,
      ): Effect.Effect<
        readonly WebhookApiKeyAdminView[],
        WebhooksApiAccessServiceError
      > =>
        Schema.decodeUnknown(ListWebhookApiKeysBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeWebhookOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const records = yield* webhooksApiAccess
                .listWebhookApiKeys({
                  scope: request.scope,
                  scopeId: request.scopeId,
                })
                .pipe(Effect.mapError(normalizeWebhooksApiKeyModuleListError));
              const projectedRecords = yield* projectWebhookApiKeyAdminRecords({
                fieldSecurity,
                requestContext: authorizedRequestContext,
                projection: adminProjection,
                records,
              });
              const auditedFields = collectAuditedFields(projectedRecords);

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.webhooksApiAccess}:${request.scope}:${request.scopeId}:api-keys:${auditedFields.join(",")}`,
                reason:
                  "Operator read webhook API keys through the admin communication surface.",
                auditedFields,
              });

              return yield* Schema.decodeUnknown(
                WebhookApiKeyAdminViewListSchema,
              )(projectedRecords.map((record) => record.record)).pipe(
                Effect.mapError(
                  createInternalContractError("webhookApiKeyAdminViewList"),
                ),
              );
            }),
          ),
        ),
      createWebhookApiKey: (
        input: CreateWebhookApiKeyBySessionRequest,
      ): Effect.Effect<
        WebhookApiKeyOneTimeSecretResult,
        WebhooksApiAccessServiceError
      > =>
        Schema.decodeUnknown(CreateWebhookApiKeyBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeWebhookOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const result = yield* webhooksApiAccess
                .createWebhookApiKey({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  label: request.label,
                })
                .pipe(
                  Effect.mapError(normalizeWebhooksApiKeyModuleCreateError),
                );
              return yield* Effect.gen(function* () {
                const projectedRecord =
                  yield* applyProjectedWebhookApiKeyAdminRecord({
                    fieldSecurity,
                    requestContext: authorizedRequestContext,
                    projection: adminProjection,
                    record: result.record,
                  });
                const response = yield* buildWebhookApiKeyOneTimeSecretResult({
                  apiKey: projectedRecord.record,
                  secret: result.secret,
                });

                yield* appendSensitiveReadAudit(auditLog, {
                  requestContext: authorizedRequestContext,
                  target: `${platformModuleId.webhooksApiAccess}:${result.record.apiKeyId}:api-key:${projectedRecord.auditedFields.join(",")}`,
                  reason:
                    "Operator read a webhook API key through the admin communication surface.",
                  auditedFields: projectedRecord.auditedFields,
                });
                yield* appendWebhookApiKeyLifecycleAudit(auditLog, {
                  requestContext: authorizedRequestContext,
                  action: webhooksApiAccessAuditAction.apiKeyCreated,
                  apiKeyId: result.record.apiKeyId,
                  reason:
                    "Operator created a webhook API key through the admin communication surface.",
                });

                return response;
              }).pipe(
                Effect.catchAll((error) =>
                  webhooksApiAccess
                    .revokeWebhookApiKey({
                      scope: request.scope,
                      scopeId: request.scopeId,
                      apiKeyId: result.record.apiKeyId,
                      expectedCurrentRecord: result.record,
                    })
                    .pipe(
                      Effect.mapError(normalizeWebhooksApiKeyModuleRevokeError),
                      Effect.flatMap(() =>
                        isAuditAppendFailure(error)
                          ? Effect.fail(error)
                          : appendWebhookApiKeyLifecycleAudit(auditLog, {
                              requestContext: authorizedRequestContext,
                              action:
                                webhooksApiAccessAuditAction.apiKeyRevoked,
                              apiKeyId: result.record.apiKeyId,
                              reason:
                                "Compensated a webhook API key create failure before the secret handoff completed.",
                            }).pipe(Effect.flatMap(() => Effect.fail(error))),
                      ),
                      Effect.catchTag(
                        "WebhookApiKeyMutationConflictError",
                        () => Effect.fail(error),
                      ),
                      Effect.catchTag("WebhookApiKeyRevokedError", () =>
                        Effect.fail(error),
                      ),
                    ),
                ),
              );
            }),
          ),
        ),
      rotateWebhookApiKey: (
        input: RotateWebhookApiKeyBySessionRequest,
      ): Effect.Effect<
        WebhookApiKeyOneTimeSecretResult,
        WebhooksApiAccessServiceError
      > =>
        Schema.decodeUnknown(RotateWebhookApiKeyBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeWebhookOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const result = yield* webhooksApiAccess
                .rotateWebhookApiKey({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  apiKeyId: request.apiKeyId,
                })
                .pipe(
                  Effect.mapError(normalizeWebhooksApiKeyModuleRotateError),
                );
              return yield* Effect.gen(function* () {
                const projectedRecord =
                  yield* applyProjectedWebhookApiKeyAdminRecord({
                    fieldSecurity,
                    requestContext: authorizedRequestContext,
                    projection: adminProjection,
                    record: result.record,
                  });
                const response = yield* buildWebhookApiKeyOneTimeSecretResult({
                  apiKey: projectedRecord.record,
                  secret: result.secret,
                });

                yield* appendSensitiveReadAudit(auditLog, {
                  requestContext: authorizedRequestContext,
                  target: `${platformModuleId.webhooksApiAccess}:${result.record.apiKeyId}:api-key:${projectedRecord.auditedFields.join(",")}`,
                  reason:
                    "Operator read a webhook API key through the admin communication surface.",
                  auditedFields: projectedRecord.auditedFields,
                });
                yield* appendWebhookApiKeyLifecycleAudit(auditLog, {
                  requestContext: authorizedRequestContext,
                  action: webhooksApiAccessAuditAction.apiKeyRotated,
                  apiKeyId: result.record.apiKeyId,
                  reason:
                    "Operator rotated a webhook API key through the admin communication surface.",
                });

                return response;
              }).pipe(
                Effect.catchAll((error) =>
                  webhooksApiAccess
                    .restoreWebhookApiKey({
                      record: result.previousRecord,
                      expectedCurrentRecord: result.record,
                    })
                    .pipe(
                      Effect.mapError(
                        normalizeWebhooksApiKeyModuleRestoreError,
                      ),
                      Effect.flatMap(() =>
                        isAuditAppendFailure(error)
                          ? Effect.fail(error)
                          : appendWebhookApiKeyLifecycleAudit(auditLog, {
                              requestContext: authorizedRequestContext,
                              action:
                                webhooksApiAccessAuditAction.apiKeyRotationCompensated,
                              apiKeyId: result.record.apiKeyId,
                              reason:
                                "Compensated a webhook API key rotation failure before the new secret handoff completed.",
                            }).pipe(Effect.flatMap(() => Effect.fail(error))),
                      ),
                    ),
                ),
              );
            }),
          ),
        ),
      revokeWebhookApiKey: (
        input: RevokeWebhookApiKeyBySessionRequest,
      ): Effect.Effect<WebhookApiKeyAdminView, WebhooksApiAccessServiceError> =>
        Schema.decodeUnknown(RevokeWebhookApiKeyBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeWebhookOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const record = yield* webhooksApiAccess
                .revokeWebhookApiKey({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  apiKeyId: request.apiKeyId,
                })
                .pipe(
                  Effect.mapError(normalizeWebhooksApiKeyModuleRevokeError),
                );
              const projectedRecord =
                yield* applyProjectedWebhookApiKeyAdminRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  record,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.webhooksApiAccess}:${record.apiKeyId}:api-key:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator read a webhook API key through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });
              yield* appendWebhookApiKeyLifecycleAudit(auditLog, {
                requestContext: authorizedRequestContext,
                action: webhooksApiAccessAuditAction.apiKeyRevoked,
                apiKeyId: record.apiKeyId,
                reason:
                  "Operator revoked a webhook API key through the admin communication surface.",
              });

              return projectedRecord.record;
            }),
          ),
        ),
      runWebhookOutboundDeliveryWorkflowJob: (
        input: RunWebhookOutboundDeliveryWorkflowJobRequest,
      ): Effect.Effect<
        WorkflowJobSummary | undefined,
        WebhookOutboundDeliveryWorkflowExecutionError
      > =>
        Schema.decodeUnknown(
          RunWebhookOutboundDeliveryWorkflowJobRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const workflowJobs = yield* requireWorkflowJobs();
              const convexWorkflowClient = yield* requireConvexWorkflowClient();

              return yield* executeWorkflowJobRecord({
                jobId: request.jobId,
                loadJob: ({ jobId }) => workflowJobs.getWorkflowJob({ jobId }),
                shouldBlockStaleRunningJob: ({ job }) =>
                  shouldBlockStaleRunningWebhookOutboundDeliveryWorkflowJob(
                    job,
                  ),
                blockStaleRunningJob: ({ job }) => {
                  const now = new Date().toISOString();

                  return blockWebhookOutboundDeliveryWorkflowJob({
                    job,
                    now,
                    lastError:
                      "Webhook outbound delivery workflow job exceeded the recovery budget.",
                  }).pipe(
                    Effect.mapError(
                      createInternalContractError(
                        "webhookOutboundDeliveryWorkflowJobRecord",
                      ),
                    ),
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
                runClaimedJob: ({
                  job,
                }): Effect.Effect<
                  WebhookOutboundDeliveryWorkflowJobRecord,
                  WebhookOutboundDeliveryWorkflowExecutionError
                > =>
                  Effect.gen(function* () {
                    const now = new Date().toISOString();
                    const target = {
                      scope: job.payload.tenantScope,
                      scopeId: job.payload.tenantScopeId,
                    } as const;
                    const delivery = yield* webhooksApiAccess
                      .getWebhookOutboundDelivery({
                        deliveryId: job.payload.deliveryId,
                      })
                      .pipe(
                        Effect.mapError(
                          normalizeWebhooksOutboundDeliveryModuleGetError,
                        ),
                      );
                    const blockExecutionFailure = (
                      error: WebhookOutboundDeliveryWorkflowExecutionError,
                    ): Effect.Effect<
                      WebhookOutboundDeliveryWorkflowJobRecord,
                      WebhookOutboundDeliveryWorkflowExecutionError
                    > =>
                      recoverWebhookOutboundDeliveryFailure({
                        workflowJobs,
                        currentDelivery: delivery,
                        currentJob: job,
                        attemptCount: job.attempts,
                        lastError:
                          readWebhookOutboundDeliveryFailureMessage(error),
                      });

                    const subscriptionOrBlocked = yield* webhooksApiAccess
                      .getWebhookSubscription({
                        scope: job.payload.tenantScope,
                        scopeId: job.payload.tenantScopeId,
                        subscriptionId: job.payload.subscriptionId,
                      })
                      .pipe(
                        Effect.mapError(
                          normalizeWebhooksSubscriptionModuleGetError,
                        ),
                        Effect.catchAll((error) =>
                          blockExecutionFailure(error),
                        ),
                      );

                    if ("kind" in subscriptionOrBlocked) {
                      return subscriptionOrBlocked;
                    }

                    const subscription = subscriptionOrBlocked;

                    const authorizationOrBlocked =
                      yield* authorizeWebhookOperatorAccess({
                        authorization,
                        requestContext: job.payload.requestContext,
                        target,
                      }).pipe(
                        Effect.as(undefined),
                        Effect.catchAll((error) =>
                          blockExecutionFailure(error),
                        ),
                      );

                    if (authorizationOrBlocked !== undefined) {
                      return authorizationOrBlocked;
                    }

                    const deliverableSubscriptionOrBlocked =
                      yield* ensureWebhookSubscriptionCanDeliver({
                        subscription,
                        eventType: job.payload.eventType,
                      }).pipe(
                        Effect.catchAll((error) =>
                          blockExecutionFailure(error),
                        ),
                      );

                    if ("kind" in deliverableSubscriptionOrBlocked) {
                      return deliverableSubscriptionOrBlocked;
                    }

                    return yield* sendWebhookOutboundDelivery({
                      subscription: deliverableSubscriptionOrBlocked,
                      deliveryId: delivery.deliveryId,
                      eventType: job.payload.eventType,
                      payload: job.payload.payload,
                    }).pipe(
                      Effect.flatMap(() =>
                        webhooksApiAccess
                          .updateWebhookOutboundDelivery({
                            record: buildDeliveredWebhookOutboundDeliveryRecord(
                              {
                                currentRecord: delivery,
                                attemptCount: job.attempts,
                                now,
                              },
                            ),
                            expectedCurrentRecord: delivery,
                            touchSubscriptionLastDeliveryAt: now,
                          })
                          .pipe(
                            Effect.mapError(
                              normalizeWebhooksOutboundDeliveryModuleUpdateError,
                            ),
                          ),
                      ),
                      Effect.flatMap(() =>
                        completeWebhookOutboundDeliveryWorkflowJob({
                          job,
                          now,
                        }).pipe(
                          Effect.mapError(
                            createInternalContractError(
                              "webhookOutboundDeliveryWorkflowJobRecord",
                            ),
                          ),
                        ),
                      ),
                      Effect.catchAll(
                        (
                          error,
                        ): Effect.Effect<
                          WebhookOutboundDeliveryWorkflowJobRecord,
                          WebhookOutboundDeliveryWorkflowExecutionError
                        > => {
                          const failureMessage =
                            readWebhookOutboundDeliveryFailureMessage(error);
                          const canRetry =
                            job.attempts < job.payload.maxAttempts &&
                            shouldRetryWebhookOutboundDeliveryFailure(error);

                          if (!canRetry) {
                            return webhooksApiAccess
                              .updateWebhookOutboundDelivery({
                                record:
                                  buildBlockedWebhookOutboundDeliveryRecord({
                                    currentRecord: delivery,
                                    attemptCount: job.attempts,
                                    now,
                                    exhaustedAt: now,
                                    lastError: failureMessage,
                                  }),
                                expectedCurrentRecord: delivery,
                              })
                              .pipe(
                                Effect.mapError(
                                  normalizeWebhooksOutboundDeliveryModuleUpdateError,
                                ),
                                Effect.flatMap(() =>
                                  blockWebhookOutboundDeliveryWorkflowJob({
                                    job,
                                    now,
                                    lastError: failureMessage,
                                  }).pipe(
                                    Effect.mapError(
                                      createInternalContractError(
                                        "webhookOutboundDeliveryWorkflowJobRecord",
                                      ),
                                    ),
                                  ),
                                ),
                                Effect.flatMap((blockedJob) =>
                                  workflowJobs.persistWorkflowJob(blockedJob),
                                ),
                              );
                          }

                          const nextAttemptAt =
                            calculateWebhookOutboundDeliveryRetryAt({
                              attempts: job.attempts,
                              now,
                            });

                          return webhooksApiAccess
                            .updateWebhookOutboundDelivery({
                              record: {
                                ...delivery,
                                status: webhookOutboundDeliveryStatus.pending,
                                attemptCount: job.attempts,
                                updatedAt: now,
                                nextAttemptAt,
                                lastError: failureMessage,
                              },
                              expectedCurrentRecord: delivery,
                            })
                            .pipe(
                              Effect.mapError(
                                normalizeWebhooksOutboundDeliveryModuleUpdateError,
                              ),
                              Effect.flatMap((pendingDelivery) => {
                                let retryWorkflowJob:
                                  | WebhookOutboundDeliveryWorkflowJobRecord
                                  | undefined = job;
                                let retryDispatch:
                                  | ConvexScheduledWorkflowDispatch
                                  | undefined;

                                return Effect.gen(function* () {
                                  retryWorkflowJob =
                                    yield* scheduleWebhookOutboundDeliveryWorkflowJobRecord(
                                      {
                                        job,
                                        scheduledAt: nextAttemptAt,
                                        now,
                                      },
                                    ).pipe(
                                      Effect.mapError(
                                        createInternalContractError(
                                          "webhookOutboundDeliveryWorkflowJobRecord",
                                        ),
                                      ),
                                    );
                                  retryWorkflowJob =
                                    yield* workflowJobs.persistWorkflowJob(
                                      retryWorkflowJob,
                                    );
                                  retryDispatch =
                                    yield* convexWorkflowClient.scheduleWebhookOutboundDeliveryWorkflowJob(
                                      {
                                        jobId: retryWorkflowJob.jobId,
                                        scheduledAt:
                                          retryWorkflowJob.scheduledAt,
                                      },
                                    );
                                  retryWorkflowJob =
                                    yield* buildWebhookOutboundDeliveryWorkflowDispatchRecord(
                                      {
                                        job: retryWorkflowJob,
                                        now: new Date().toISOString(),
                                        dispatch: retryDispatch,
                                      },
                                    ).pipe(
                                      Effect.mapError(
                                        createInternalContractError(
                                          "webhookOutboundDeliveryWorkflowDispatchRecord",
                                        ),
                                      ),
                                    );

                                  return yield* workflowJobs.persistWorkflowJob(
                                    retryWorkflowJob,
                                  );
                                }).pipe(
                                  Effect.catchAllCause((cause) =>
                                    recoverWebhookOutboundDeliveryFailure({
                                      workflowJobs,
                                      currentDelivery: pendingDelivery,
                                      currentJob: retryWorkflowJob ?? job,
                                      attemptCount:
                                        retryWorkflowJob?.attempts ??
                                        job.attempts,
                                      lastError:
                                        combineWebhookOutboundDeliveryFailureMessages(
                                          [
                                            pendingDelivery.lastError,
                                            `Retry scheduling failed: ${Cause.pretty(cause)}`,
                                          ],
                                        ),
                                      ...(retryDispatch === undefined
                                        ? {}
                                        : { dispatch: retryDispatch }),
                                    }),
                                  ),
                                );
                              }),
                            );
                        },
                      ),
                    );
                  }),
                recoverClaimedJobFailure: ({ job, cause }) => {
                  const now = new Date().toISOString();

                  return blockWebhookOutboundDeliveryWorkflowJob({
                    job,
                    now,
                    lastError: Cause.pretty(cause),
                  }).pipe(
                    Effect.mapError(
                      createInternalContractError(
                        "webhookOutboundDeliveryWorkflowJobRecord",
                      ),
                    ),
                    Effect.flatMap((blockedJob) =>
                      workflowJobs.persistWorkflowJob(blockedJob),
                    ),
                    Effect.flatMap((blockedJob) =>
                      buildWorkflowJobSummary({ record: blockedJob }).pipe(
                        Effect.mapError(
                          createInternalContractError(
                            "webhookOutboundDeliveryWorkflowSummary",
                          ),
                        ),
                      ),
                    ),
                  );
                },
                summarize: ({ record }) =>
                  buildWorkflowJobSummary({ record }).pipe(
                    Effect.mapError(
                      createInternalContractError(
                        "webhookOutboundDeliveryWorkflowSummary",
                      ),
                    ),
                  ),
              });
            }),
          ),
        ),
    } satisfies WebhooksApiAccessService;
  });

const makeLiveWebhookAuthorization = Effect.gen(function* () {
  const oryKeto = yield* OryKetoAdapter;

  return yield* makeAuthorizationModule({
    tuples: [],
    cacheTtlSeconds: 60,
    maxCacheSize: 256,
    delegatedCheck: createOryKetoAuthorizationDelegatedCheck(oryKeto),
    delegatedTupleLookup:
      createOryKetoAuthorizationDelegatedTupleLookup(oryKeto),
  });
});

export function makeWebhooksApiAccessService(options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
}): Effect.Effect<
  WebhooksApiAccessService,
  never,
  AuditLogModule | IdentitySessionModule | WebhooksApiAccessModule
>;
export function makeWebhooksApiAccessService(
  options?: WebhooksApiAccessServiceOptions,
): Effect.Effect<
  WebhooksApiAccessService,
  never,
  | AuditLogModule
  | IdentitySessionModule
  | WebhooksApiAccessModule
  | OryKetoAdapter
>;
export function makeWebhooksApiAccessService(
  options: WebhooksApiAccessServiceOptions = {},
) {
  const runtimeOptions = {
    ...(options.runtimeConfig === undefined
      ? {}
      : { runtimeConfig: options.runtimeConfig }),
    ...(options.workflowJobs === undefined
      ? {}
      : { workflowJobs: options.workflowJobs }),
    ...(options.convexWorkflowClient === undefined
      ? {}
      : { convexWorkflowClient: options.convexWorkflowClient }),
  } satisfies Omit<WebhooksApiAccessServiceOptions, "authorization">;

  return options.authorization === undefined
    ? makeLiveWebhookAuthorization.pipe(
        Effect.flatMap((authorization) =>
          buildWebhooksApiAccessService(authorization, runtimeOptions),
        ),
      )
    : buildWebhooksApiAccessService(options.authorization, runtimeOptions);
}

type WebhooksApiAccessTransportRuntime = {
  readonly service: WebhooksApiAccessService;
  readonly close: Effect.Effect<void>;
};

const makeWebhooksApiAccessTransportRuntime = (
  options: SubscriberJourneyRuntimeOptions,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeSubscriberJourneyRuntime(options).pipe(
      Effect.mapError(
        (cause): WebhooksApiAccessRuntimeError => ({
          _tag: "WebhooksApiAccessRuntimeError",
          cause,
        }),
      ),
    );
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    }).pipe(
      Effect.mapError(
        (cause): WebhooksApiAccessRuntimeError => ({
          _tag: "WebhooksApiAccessRuntimeError",
          cause,
        }),
      ),
    );
    const workflowJobsDatabase = buildWriteDatabase(postgres.database);
    const workflowJobs =
      yield* makeWorkflowJobsPostgresRepositoryForRecordSchema(
        workflowJobsDatabase,
        buildWorkflowJobsPostgresQueryable<WebhookOutboundDeliveryWorkflowJobRecord>(
          workflowJobsDatabase,
        ),
        WebhookOutboundDeliveryWorkflowJobRecordSchema,
      ).pipe(
        Effect.mapError(
          (cause): WebhooksApiAccessRuntimeError => ({
            _tag: "WebhooksApiAccessRuntimeError",
            cause,
          }),
        ),
      );
    const convexWorkflowClient = yield* makeAuthenticatedConvexWorkflowClient({
      deploymentUrl: options.convexUrl,
      siteUrl: options.convexSiteUrl,
      keycloakBaseUrl: options.keycloakBaseUrl,
      keycloakRealm: options.keycloakRealm,
      keycloakClientId: options.keycloakClientId,
      keycloakClientSecret: options.keycloakClientSecret,
      keycloakConvexServiceActorUsername:
        options.keycloakConvexServiceActorUsername,
      keycloakConvexServiceActorPassword:
        options.keycloakConvexServiceActorPassword,
    }).pipe(
      Effect.mapError(
        (cause): WebhooksApiAccessRuntimeError => ({
          _tag: "WebhooksApiAccessRuntimeError",
          cause,
        }),
      ),
    );
    const service = yield* makeWebhooksApiAccessService({
      runtimeConfig: runtime.runtimeConfig,
      workflowJobs,
      convexWorkflowClient,
    }).pipe(
      Effect.provideService(AuditLogModule, runtime.auditLog),
      Effect.provideService(IdentitySessionModule, runtime.identitySession),
      Effect.provideService(OryKetoAdapter, runtime.oryKeto),
      Effect.provideService(WebhooksApiAccessModule, runtime.webhooksApiAccess),
      Effect.mapError(
        (cause): WebhooksApiAccessRuntimeError => ({
          _tag: "WebhooksApiAccessRuntimeError",
          cause,
        }),
      ),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(runtime.close),
        Effect.ignore(postgres.close),
      ]).pipe(Effect.asVoid),
    } satisfies WebhooksApiAccessTransportRuntime;
  });

const runWebhooksApiAccessWithResolvedOptions = <A, E>(
  environment: unknown,
  use: (service: WebhooksApiAccessService) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.mapError(
      (cause): WebhooksApiAccessRuntimeError => ({
        _tag: "WebhooksApiAccessRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap((resolvedOptions) =>
      makeWebhooksApiAccessTransportRuntime(resolvedOptions).pipe(
        Effect.flatMap((runtime) =>
          use(runtime.service).pipe(
            Effect.ensuring(Effect.ignore(runtime.close)),
          ),
        ),
      ),
    ),
  );

export const runWebhooksApiAccessFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: WebhooksApiAccessService) => Effect.Effect<A, E>,
) => runWebhooksApiAccessWithResolvedOptions(environment, use);

export const createCachedWebhooksApiAccessServiceRunner = (
  environment: unknown,
) => {
  let runtimePromise: Promise<WebhooksApiAccessTransportRuntime> | undefined;

  const getRuntime = () => {
    runtimePromise ??= Effect.runPromise(
      resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
        Effect.mapError(
          (cause): WebhooksApiAccessRuntimeError => ({
            _tag: "WebhooksApiAccessRuntimeError",
            cause,
          }),
        ),
        Effect.flatMap((resolvedOptions) =>
          makeWebhooksApiAccessTransportRuntime(resolvedOptions),
        ),
      ),
    );

    return runtimePromise;
  };

  return <A, E>(
    use: (service: WebhooksApiAccessService) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | WebhooksApiAccessRuntimeError> =>
    Effect.tryPromise({
      try: getRuntime,
      catch: (cause): WebhooksApiAccessRuntimeError => ({
        _tag: "WebhooksApiAccessRuntimeError",
        cause,
      }),
    }).pipe(Effect.flatMap((runtime) => use(runtime.service)));
};

export const runWebhookOutboundDeliveryWorkflowJobFromEnvironment = (
  environment: unknown,
  input: RunWebhookOutboundDeliveryWorkflowJobRequest,
) =>
  runWebhooksApiAccessFromEnvironment(environment, (service) =>
    service.runWebhookOutboundDeliveryWorkflowJob(input),
  );
