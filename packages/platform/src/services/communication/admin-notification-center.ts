import { findModuleManifest } from "@comvestec/config";
import { and, desc, eq } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  fieldSecurityAuditAction,
  type NotificationCenterInAppNotificationAdminView,
  NotificationCenterInAppNotificationAdminViewSchema,
  type NotificationCenterInAppNotificationRecord,
  NotificationCenterInAppNotificationReferenceSchema,
  type NotificationCenterEmailPreferenceAdminView,
  NotificationCenterEmailPreferenceAdminViewSchema,
  type NotificationCenterEmailPreferenceRecord,
  NotificationCenterEmailPreferenceReferenceSchema,
  notificationCenterAuditAction,
  type NotificationCenterEmailReceiptAdminView,
  NotificationCenterEmailReceiptAdminViewSchema,
  type NotificationCenterEmailReceiptRecord,
  NotificationCenterEmailReceiptReferenceSchema,
  permissionScope,
  platformModuleId,
  platformScope,
  type ProjectionDescriptor,
  projectionProfile,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  auditLogEventsTable,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  type AuthorizationDelegatedCheckError,
  type AuthorizationModuleService,
  buildNotificationCenterPostgresQueryable,
  type FieldSecurityModuleService,
  hasPrivilegedBreakGlassAccess,
  IdentitySessionPostgresRepository,
  type IdentitySessionRequestContextNotFoundError,
  IdentitySessionModule,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makeAuthorizationModule,
  makeFieldSecurityModule,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeNotificationCenterPostgresRepository,
  type NotificationCenterInAppModuleError,
  NotificationCenterInAppModule,
  makeNotificationCenterInAppModule,
  type NotificationCenterPostgresRepositoryError,
  NotificationCenterPostgresRepository,
  makeTenantManagementModule,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  TenantManagementModule,
  TenantOnboardingPostgresRepository,
  TenantProvisioningPostgresRepository,
} from "@comvestec/modules";
import {
  ConvexNotificationCenterInAppAdapter,
  makeConvexNotificationCenterInAppAdapter,
  KeycloakAdapter,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  OryKetoAdapter,
  ValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import { buildWriteDatabase } from "../postgres-write-database";

export const AdminNotificationCenterSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type AdminNotificationCenterSessionLookup = Schema.Schema.Type<
  typeof AdminNotificationCenterSessionLookupSchema
>;

export const InspectNotificationCenterEmailReceiptBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    notificationId:
      NotificationCenterEmailReceiptReferenceSchema.fields.notificationId,
  });

export type InspectNotificationCenterEmailReceiptBySessionRequest =
  Schema.Schema.Type<
    typeof InspectNotificationCenterEmailReceiptBySessionRequestSchema
  >;

export const InspectNotificationCenterInAppNotificationBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    notificationId:
      NotificationCenterInAppNotificationReferenceSchema.fields.notificationId,
  });

export type InspectNotificationCenterInAppNotificationBySessionRequest =
  Schema.Schema.Type<
    typeof InspectNotificationCenterInAppNotificationBySessionRequestSchema
  >;

export const InspectNotificationCenterEmailPreferenceBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    tenantScope:
      NotificationCenterEmailPreferenceReferenceSchema.fields.tenantScope,
    tenantScopeId:
      NotificationCenterEmailPreferenceReferenceSchema.fields.tenantScopeId,
    recipient:
      NotificationCenterEmailPreferenceReferenceSchema.fields.recipient,
    template: NotificationCenterEmailPreferenceReferenceSchema.fields.template,
  });

export type InspectNotificationCenterEmailPreferenceBySessionRequest =
  Schema.Schema.Type<
    typeof InspectNotificationCenterEmailPreferenceBySessionRequestSchema
  >;

export const UpsertNotificationCenterEmailPreferenceBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    tenantScope:
      NotificationCenterEmailPreferenceReferenceSchema.fields.tenantScope,
    tenantScopeId:
      NotificationCenterEmailPreferenceReferenceSchema.fields.tenantScopeId,
    recipient:
      NotificationCenterEmailPreferenceReferenceSchema.fields.recipient,
    template: NotificationCenterEmailPreferenceReferenceSchema.fields.template,
    enabled: Schema.Boolean,
  });

export type UpsertNotificationCenterEmailPreferenceBySessionRequest =
  Schema.Schema.Type<
    typeof UpsertNotificationCenterEmailPreferenceBySessionRequestSchema
  >;

export const AdminNotificationCenterRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  convexUrl: Schema.NonEmptyString,
  convexSiteUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
});

export type AdminNotificationCenterRuntimeOptions = Schema.Schema.Type<
  typeof AdminNotificationCenterRuntimeOptionsSchema
>;

const AdminNotificationCenterProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_SITE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

export type AdminNotificationCenterUnauthenticatedActorError = {
  readonly _tag: "AdminNotificationCenterUnauthenticatedActorError";
};

export type AdminNotificationCenterAccessDeniedError = {
  readonly _tag: "AdminNotificationCenterAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type AdminNotificationCenterProjectionConfigurationError = {
  readonly _tag: "AdminNotificationCenterProjectionConfigurationError";
  readonly moduleId: typeof platformModuleId.notificationCenter;
  readonly profile: typeof projectionProfile.admin;
};

export type AdminNotificationCenterEmailReceiptNotFoundError = {
  readonly _tag: "AdminNotificationCenterEmailReceiptNotFoundError";
  readonly notificationId: string;
};

export type AdminNotificationCenterInAppNotificationNotFoundError = {
  readonly _tag: "AdminNotificationCenterInAppNotificationNotFoundError";
  readonly notificationId: string;
};

export type AdminNotificationCenterEmailPreferenceNotFoundError = {
  readonly _tag: "AdminNotificationCenterEmailPreferenceNotFoundError";
  readonly tenantScope: RequestContext["tenant"]["scope"];
  readonly tenantScopeId: string;
  readonly recipient: string;
  readonly template: string;
};

export type AdminNotificationCenterInternalContractError = {
  readonly _tag: "AdminNotificationCenterInternalContractError";
  readonly operation:
    | "authorizationCheck"
    | "auditLogAppend"
    | "emailPreferenceAdminView"
    | "fieldSecurityPreferenceProjection"
    | "fieldSecurityReceiptProjection"
    | "fieldSecurityInAppNotificationProjection"
    | "inAppNotificationAdminView"
    | "inAppNotificationRecordLookup"
    | "preferenceRecordLookup"
    | "preferenceRecordUpsert"
    | "receiptAdminView"
    | "receiptRecordLookup";
  readonly cause: ParseResult.ParseError;
};

export type AdminNotificationCenterRuntimeError = {
  readonly _tag: "AdminNotificationCenterRuntimeError";
  readonly cause: unknown;
};

export type AdminNotificationCenterServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | NotificationCenterInAppModuleError
  | NotificationCenterPostgresRepositoryError
  | AdminNotificationCenterEmailPreferenceNotFoundError
  | AdminNotificationCenterInAppNotificationNotFoundError
  | IdentitySessionRequestContextNotFoundError
  | ValkeyAdapterOperationError
  | AdminNotificationCenterAccessDeniedError
  | AdminNotificationCenterEmailReceiptNotFoundError
  | AdminNotificationCenterInternalContractError
  | AdminNotificationCenterProjectionConfigurationError
  | AdminNotificationCenterUnauthenticatedActorError;

export type AdminNotificationCenterServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
};

export type AdminNotificationCenterService = {
  readonly resolveRequestContext: (
    input: AdminNotificationCenterSessionLookup,
  ) => Effect.Effect<
    RequestContext,
    | ParseResult.ParseError
    | IdentitySessionRequestContextNotFoundError
    | ValkeyAdapterOperationError
  >;
  readonly inspectEmailReceipt: (
    input: InspectNotificationCenterEmailReceiptBySessionRequest,
  ) => Effect.Effect<
    NotificationCenterEmailReceiptAdminView,
    AdminNotificationCenterServiceError
  >;
  readonly inspectInAppNotification: (
    input: InspectNotificationCenterInAppNotificationBySessionRequest,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationAdminView,
    AdminNotificationCenterServiceError
  >;
  readonly inspectEmailPreference: (
    input: InspectNotificationCenterEmailPreferenceBySessionRequest,
  ) => Effect.Effect<
    NotificationCenterEmailPreferenceAdminView,
    AdminNotificationCenterServiceError
  >;
  readonly upsertEmailPreference: (
    input: UpsertNotificationCenterEmailPreferenceBySessionRequest,
  ) => Effect.Effect<
    NotificationCenterEmailPreferenceAdminView,
    AdminNotificationCenterServiceError
  >;
};

type AuthenticatedNotificationCenterOperatorContext = RequestContext & {
  readonly actorId: string;
};

const createInternalContractError =
  (operation: AdminNotificationCenterInternalContractError["operation"]) =>
  (
    cause: ParseResult.ParseError,
  ): AdminNotificationCenterInternalContractError => ({
    _tag: "AdminNotificationCenterInternalContractError",
    operation,
    cause,
  });

const normalizeAuthorizationCheckError = (
  error: ParseResult.ParseError | AuthorizationDelegatedCheckError,
):
  | AuthorizationDelegatedCheckError
  | AdminNotificationCenterInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("authorizationCheck")(error)
    : error;

const normalizeAuditLogError = (
  error: AuditLogModuleError,
): AuditLogModuleError | AdminNotificationCenterInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("auditLogAppend")(error)
    : error;

const normalizeRepositoryError =
  (
    operation:
      | "preferenceRecordLookup"
      | "preferenceRecordUpsert"
      | "receiptRecordLookup",
  ) =>
  (
    error: NotificationCenterPostgresRepositoryError,
  ):
    | NotificationCenterPostgresRepositoryError
    | AdminNotificationCenterInternalContractError =>
    error._tag === "ParseError"
      ? createInternalContractError(operation)(error)
      : error;

const normalizeInAppNotificationModuleError = (
  error: NotificationCenterInAppModuleError,
):
  | NotificationCenterInAppModuleError
  | AdminNotificationCenterInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("inAppNotificationRecordLookup")(error)
    : error;

const ensureNotificationCenterOperatorAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedNotificationCenterOperatorContext,
  | AdminNotificationCenterUnauthenticatedActorError
  | AdminNotificationCenterAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): AdminNotificationCenterUnauthenticatedActorError => ({
        _tag: "AdminNotificationCenterUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "AdminNotificationCenterAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies AdminNotificationCenterAccessDeniedError),
    ),
  );

const buildTargetTenantContext = (
  target: Pick<RequestContext["tenant"], "scope" | "scopeId">,
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

const isSameTenantContext = (input: {
  readonly requestContext: RequestContext;
  readonly targetTenant: Pick<RequestContext["tenant"], "scope" | "scopeId">;
}) =>
  input.requestContext.tenant.scope === input.targetTenant.scope &&
  input.requestContext.tenant.scopeId === input.targetTenant.scopeId;

const checkNotificationCenterOperatorPermission = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: AuthenticatedNotificationCenterOperatorContext;
}) =>
  Effect.gen(function* () {
    const decision = yield* input.authorization
      .check({
        requestContext: input.requestContext,
        namespace: authorizationNamespace.module,
        object: platformModuleId.notificationCenter,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.notificationManage,
      })
      .pipe(Effect.mapError(normalizeAuthorizationCheckError));

    return decision.allowed
      ? input.requestContext
      : yield* Effect.fail({
          _tag: "AdminNotificationCenterAccessDeniedError",
          actorType: input.requestContext.actorType,
        } satisfies AdminNotificationCenterAccessDeniedError);
  });

const authorizeNotificationCenterOperatorForExplicitTarget = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: AuthenticatedNotificationCenterOperatorContext;
  readonly targetTenant: Pick<RequestContext["tenant"], "scope" | "scopeId">;
}) =>
  isSameTenantContext({
    requestContext: input.requestContext,
    targetTenant: input.targetTenant,
  })
    ? checkNotificationCenterOperatorPermission({
        authorization: input.authorization,
        requestContext: input.requestContext,
      })
    : hasPrivilegedBreakGlassAccess(input.requestContext)
      ? checkNotificationCenterOperatorPermission({
          authorization: input.authorization,
          requestContext: {
            ...input.requestContext,
            tenant: buildTargetTenantContext(input.targetTenant),
          },
        })
      : Effect.fail({
          _tag: "AdminNotificationCenterAccessDeniedError",
          actorType: input.requestContext.actorType,
        } satisfies AdminNotificationCenterAccessDeniedError);

const resolveNotificationCenterAdminProjection = () =>
  Effect.fromNullable(
    findModuleManifest(
      platformModuleId.notificationCenter,
    )?.projectionProfiles.find(
      (projection) => projection.profile === projectionProfile.admin,
    ),
  ).pipe(
    Effect.orElseFail(
      (): AdminNotificationCenterProjectionConfigurationError => ({
        _tag: "AdminNotificationCenterProjectionConfigurationError",
        moduleId: platformModuleId.notificationCenter,
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
        value !== null && typeof value === "object" && segment in value
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      record,
    ) !== undefined;

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

const applyProjectedEmailReceiptRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: NotificationCenterEmailReceiptRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.notificationCenter,
      requestContext: input.requestContext,
      projection: input.projection,
      record: {
        id: input.record.notificationId,
        channel: input.record.channel,
        status: input.record.status,
        recipient: input.record.recipient,
        template: input.record.template,
        ...(input.record.emailDeliveryMessageId !== undefined
          ? { emailDeliveryMessageId: input.record.emailDeliveryMessageId }
          : {}),
        ...(input.record.queueFailureSummary !== undefined
          ? { queueFailureSummary: input.record.queueFailureSummary }
          : {}),
        ...(input.record.suppressionReason !== undefined
          ? { suppressionReason: input.record.suppressionReason }
          : {}),
        createdAt: input.record.createdAt,
      },
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityReceiptProjection"),
      ),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(
          NotificationCenterEmailReceiptAdminViewSchema,
        )(result.projectedRecord).pipe(
          Effect.mapError(createInternalContractError("receiptAdminView")),
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

const applyProjectedEmailPreferenceRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: NotificationCenterEmailPreferenceRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.notificationCenter,
      requestContext: input.requestContext,
      projection: input.projection,
      record: {
        channel: input.record.channel,
        recipient: input.record.recipient,
        template: input.record.template,
        enabled: input.record.enabled,
        updatedBy: input.record.updatedBy,
        updatedAt: input.record.updatedAt,
      },
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityPreferenceProjection"),
      ),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(
          NotificationCenterEmailPreferenceAdminViewSchema,
        )(result.projectedRecord).pipe(
          Effect.mapError(
            createInternalContractError("emailPreferenceAdminView"),
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

const applyProjectedInAppNotificationRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: NotificationCenterInAppNotificationRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.notificationCenter,
      requestContext: input.requestContext,
      projection: input.projection,
      record: {
        id: input.record.notificationId,
        channel: input.record.channel,
        family: input.record.family,
        actorId: input.record.actorId,
        sourceModuleId: input.record.sourceModuleId,
        sourceEventId: input.record.sourceEventId,
        status: input.record.status,
        ...(input.record.title !== undefined
          ? { title: input.record.title }
          : {}),
        ...(input.record.bodySummary !== undefined
          ? { bodySummary: input.record.bodySummary }
          : {}),
        ...(input.record.actionLabel !== undefined
          ? { actionLabel: input.record.actionLabel }
          : {}),
        ...(input.record.actionUrl !== undefined
          ? { actionUrl: input.record.actionUrl }
          : {}),
        ...(input.record.correlationId !== undefined
          ? { correlationId: input.record.correlationId }
          : {}),
        ...(input.record.correlatedEmailReceiptId !== undefined
          ? {
              correlatedEmailReceiptId: input.record.correlatedEmailReceiptId,
            }
          : {}),
        ...(input.record.correlatedDigestRunId !== undefined
          ? { correlatedDigestRunId: input.record.correlatedDigestRunId }
          : {}),
        ...(input.record.readAt !== undefined
          ? { readAt: input.record.readAt }
          : {}),
        ...(input.record.dismissedAt !== undefined
          ? { dismissedAt: input.record.dismissedAt }
          : {}),
        createdAt: input.record.createdAt,
        updatedAt: input.record.updatedAt,
      },
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityInAppNotificationProjection"),
      ),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(
          NotificationCenterInAppNotificationAdminViewSchema,
        )(result.projectedRecord).pipe(
          Effect.mapError(
            createInternalContractError("inAppNotificationAdminView"),
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

const buildAdminNotificationCenterService = (
  authorization: Pick<AuthorizationModuleService, "check">,
) =>
  Effect.gen(function* () {
    const adminProjection = yield* resolveNotificationCenterAdminProjection();
    const auditLog = yield* AuditLogModule;
    const notificationCenterInApp = yield* NotificationCenterInAppModule;
    const notificationCenterRepository =
      yield* NotificationCenterPostgresRepository;
    const fieldSecurity = yield* makeFieldSecurityModule();
    const identitySession = yield* IdentitySessionModule;

    return {
      resolveRequestContext: (input: AdminNotificationCenterSessionLookup) =>
        Schema.decodeUnknown(AdminNotificationCenterSessionLookupSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            identitySession.resolveRequestContext({
              sessionId: request.sessionId,
            }),
          ),
        ),
      inspectEmailReceipt: (
        input: InspectNotificationCenterEmailReceiptBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          InspectNotificationCenterEmailReceiptBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authenticatedRequestContext =
                yield* ensureNotificationCenterOperatorAccess(requestContext);
              const currentTenantAuthorizedRequestContext =
                yield* checkNotificationCenterOperatorPermission({
                  authorization,
                  requestContext: authenticatedRequestContext,
                });
              const emailReceipt = yield* notificationCenterRepository
                .findEmailReceipt({ notificationId: request.notificationId })
                .pipe(
                  Effect.mapError(
                    normalizeRepositoryError("receiptRecordLookup"),
                  ),
                );

              if (emailReceipt === undefined) {
                return yield* Effect.fail({
                  _tag: "AdminNotificationCenterEmailReceiptNotFoundError",
                  notificationId: request.notificationId,
                } satisfies AdminNotificationCenterEmailReceiptNotFoundError);
              }

              const authorizedRequestContext = isSameTenantContext({
                requestContext: authenticatedRequestContext,
                targetTenant: {
                  scope: emailReceipt.tenantScope,
                  scopeId: emailReceipt.tenantScopeId,
                },
              })
                ? currentTenantAuthorizedRequestContext
                : hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
                  ? yield* checkNotificationCenterOperatorPermission({
                      authorization,
                      requestContext: {
                        ...authenticatedRequestContext,
                        tenant: buildTargetTenantContext({
                          scope: emailReceipt.tenantScope,
                          scopeId: emailReceipt.tenantScopeId,
                        }),
                      },
                    })
                  : yield* Effect.fail({
                      _tag: "AdminNotificationCenterEmailReceiptNotFoundError",
                      notificationId: request.notificationId,
                    } satisfies AdminNotificationCenterEmailReceiptNotFoundError);

              const projectedRecord = yield* applyProjectedEmailReceiptRecord({
                fieldSecurity,
                requestContext: authorizedRequestContext,
                projection: adminProjection,
                record: emailReceipt,
              });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.notificationCenter}:${emailReceipt.notificationId}:receipt:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator inspected a notification-center email receipt through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      inspectInAppNotification: (
        input: InspectNotificationCenterInAppNotificationBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          InspectNotificationCenterInAppNotificationBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authenticatedRequestContext =
                yield* ensureNotificationCenterOperatorAccess(requestContext);
              const currentTenantAuthorizedRequestContext =
                yield* checkNotificationCenterOperatorPermission({
                  authorization,
                  requestContext: authenticatedRequestContext,
                });
              const inAppNotification = yield* notificationCenterInApp
                .getInAppNotification({
                  notificationId: request.notificationId,
                })
                .pipe(Effect.mapError(normalizeInAppNotificationModuleError));

              if (inAppNotification === undefined) {
                return yield* Effect.fail({
                  _tag: "AdminNotificationCenterInAppNotificationNotFoundError",
                  notificationId: request.notificationId,
                } satisfies AdminNotificationCenterInAppNotificationNotFoundError);
              }

              const authorizedRequestContext = isSameTenantContext({
                requestContext: authenticatedRequestContext,
                targetTenant: {
                  scope: inAppNotification.tenantScope,
                  scopeId: inAppNotification.tenantScopeId,
                },
              })
                ? currentTenantAuthorizedRequestContext
                : hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
                  ? yield* checkNotificationCenterOperatorPermission({
                      authorization,
                      requestContext: {
                        ...authenticatedRequestContext,
                        tenant: buildTargetTenantContext({
                          scope: inAppNotification.tenantScope,
                          scopeId: inAppNotification.tenantScopeId,
                        }),
                      },
                    })
                  : yield* Effect.fail({
                      _tag: "AdminNotificationCenterInAppNotificationNotFoundError",
                      notificationId: request.notificationId,
                    } satisfies AdminNotificationCenterInAppNotificationNotFoundError);

              const projectedRecord =
                yield* applyProjectedInAppNotificationRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  record: inAppNotification,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.notificationCenter}:${inAppNotification.notificationId}:in-app:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator inspected a notification-center in-app notification through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      inspectEmailPreference: (
        input: InspectNotificationCenterEmailPreferenceBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          InspectNotificationCenterEmailPreferenceBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authenticatedRequestContext =
                yield* ensureNotificationCenterOperatorAccess(requestContext);
              const authorizedRequestContext =
                yield* authorizeNotificationCenterOperatorForExplicitTarget({
                  authorization,
                  requestContext: authenticatedRequestContext,
                  targetTenant: {
                    scope: request.tenantScope,
                    scopeId: request.tenantScopeId,
                  },
                });
              const emailPreference = yield* notificationCenterRepository
                .findEmailPreference({
                  tenantScope: request.tenantScope,
                  tenantScopeId: request.tenantScopeId,
                  recipient: request.recipient,
                  template: request.template,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRepositoryError("preferenceRecordLookup"),
                  ),
                );

              if (emailPreference === undefined) {
                return yield* Effect.fail({
                  _tag: "AdminNotificationCenterEmailPreferenceNotFoundError",
                  tenantScope: request.tenantScope,
                  tenantScopeId: request.tenantScopeId,
                  recipient: request.recipient,
                  template: request.template,
                } satisfies AdminNotificationCenterEmailPreferenceNotFoundError);
              }

              const projectedRecord =
                yield* applyProjectedEmailPreferenceRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  record: emailPreference,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.notificationCenter}:${request.tenantScope}:${request.tenantScopeId}:${request.template}:preference:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator inspected a notification-center email preference through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      upsertEmailPreference: (
        input: UpsertNotificationCenterEmailPreferenceBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          UpsertNotificationCenterEmailPreferenceBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authenticatedRequestContext =
                yield* ensureNotificationCenterOperatorAccess(requestContext);
              const authorizedRequestContext =
                yield* authorizeNotificationCenterOperatorForExplicitTarget({
                  authorization,
                  requestContext: authenticatedRequestContext,
                  targetTenant: {
                    scope: request.tenantScope,
                    scopeId: request.tenantScopeId,
                  },
                });
              const persistedAt = new Date().toISOString();
              const persistedRecord = yield* notificationCenterRepository
                .upsertEmailPreference({
                  tenantScope: request.tenantScope,
                  tenantScopeId: request.tenantScopeId,
                  channel: "email",
                  recipient: request.recipient,
                  template: request.template,
                  enabled: request.enabled,
                  updatedBy: authenticatedRequestContext.actorId,
                  createdAt: persistedAt,
                  updatedAt: persistedAt,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRepositoryError("preferenceRecordUpsert"),
                  ),
                );

              yield* auditLog
                .append({
                  requestContext: authorizedRequestContext,
                  moduleId: platformModuleId.notificationCenter,
                  action: notificationCenterAuditAction.preferenceUpserted,
                  target: `${platformModuleId.notificationCenter}:${request.tenantScope}:${request.tenantScopeId}:${request.template}:email-preference`,
                  reason: request.enabled
                    ? "Operator enabled a notification-center email preference override."
                    : "Operator disabled a notification-center email preference override.",
                })
                .pipe(Effect.mapError(normalizeAuditLogError));

              const projectedRecord =
                yield* applyProjectedEmailPreferenceRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  record: persistedRecord,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.notificationCenter}:${request.tenantScope}:${request.tenantScopeId}:${request.template}:preference:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator received a notification-center email preference response through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
    } satisfies AdminNotificationCenterService;
  });

const makeLiveNotificationCenterAuthorization = Effect.gen(function* () {
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

export function makeAdminNotificationCenterService(options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
}): Effect.Effect<
  AdminNotificationCenterService,
  ParseResult.ParseError | AdminNotificationCenterProjectionConfigurationError,
  | AuditLogModule
  | NotificationCenterInAppModule
  | NotificationCenterPostgresRepository
  | IdentitySessionModule
>;
export function makeAdminNotificationCenterService(
  options?: AdminNotificationCenterServiceOptions,
): Effect.Effect<
  AdminNotificationCenterService,
  ParseResult.ParseError | AdminNotificationCenterProjectionConfigurationError,
  | AuditLogModule
  | NotificationCenterInAppModule
  | NotificationCenterPostgresRepository
  | IdentitySessionModule
  | OryKetoAdapter
>;
export function makeAdminNotificationCenterService(
  options: AdminNotificationCenterServiceOptions = {},
): Effect.Effect<
  AdminNotificationCenterService,
  ParseResult.ParseError | AdminNotificationCenterProjectionConfigurationError,
  | AuditLogModule
  | NotificationCenterInAppModule
  | NotificationCenterPostgresRepository
  | IdentitySessionModule
  | OryKetoAdapter
> {
  return options.authorization === undefined
    ? makeLiveNotificationCenterAuthorization.pipe(
        Effect.flatMap((authorization) =>
          buildAdminNotificationCenterService(authorization),
        ),
      )
    : buildAdminNotificationCenterService(options.authorization);
}

const makeAdminNotificationCenterRuntime = (
  options: AdminNotificationCenterRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const keycloak = yield* makeKeycloakAdapter({
      baseUrl: options.keycloakBaseUrl,
      realm: options.keycloakRealm,
      clientId: options.keycloakClientId,
      clientSecret: options.keycloakClientSecret,
    });
    const oryKeto = yield* makeOryKetoAdapter({
      readUrl: options.ketoReadUrl,
      writeUrl: options.ketoWriteUrl,
    });
    const valkey = yield* makeValkeyAdapter({
      url: options.valkeyUrl,
    });
    const convexNotificationCenterInApp =
      yield* makeConvexNotificationCenterInAppAdapter({
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
      });
    const tenantManagement = yield* makeTenantManagementModule();
    const identityRepository =
      yield* makeIdentitySessionPostgresRepository(writeDatabase);
    const onboardingRepository =
      yield* makeTenantOnboardingPostgresRepository(writeDatabase);
    const tenantProvisioningRepository =
      yield* makeTenantProvisioningPostgresRepository(writeDatabase);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: async (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: async (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: async (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: async (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const identitySession = yield* makeIdentitySessionModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(ValkeyAdapter, valkey),
      Effect.provideService(
        TenantProvisioningPostgresRepository,
        tenantProvisioningRepository,
      ),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
      Effect.provideService(
        IdentitySessionPostgresRepository,
        identityRepository,
      ),
      Effect.provideService(TenantManagementModule, tenantManagement),
    );
    const notificationCenterRepository =
      yield* makeNotificationCenterPostgresRepository(
        buildNotificationCenterPostgresQueryable(writeDatabase),
      );
    const notificationCenterInApp =
      yield* makeNotificationCenterInAppModule().pipe(
        Effect.provideService(
          ConvexNotificationCenterInAppAdapter,
          convexNotificationCenterInApp,
        ),
      );
    const service = yield* makeAdminNotificationCenterService().pipe(
      Effect.provideService(AuditLogModule, auditLog),
      Effect.provideService(
        NotificationCenterInAppModule,
        notificationCenterInApp,
      ),
      Effect.provideService(
        NotificationCenterPostgresRepository,
        notificationCenterRepository,
      ),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(OryKetoAdapter, oryKeto),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
      ]),
    };
  });

export const resolveAdminNotificationCenterRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(AdminNotificationCenterProcessEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map(
      (resolvedEnvironment): AdminNotificationCenterRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
        valkeyUrl: resolvedEnvironment.VALKEY_URL,
        convexUrl: resolvedEnvironment.CONVEX_SELF_HOSTED_URL,
        convexSiteUrl: resolvedEnvironment.CONVEX_SELF_HOSTED_SITE_URL,
        keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
        keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
        keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
        keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
        keycloakConvexServiceActorUsername:
          resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME,
        keycloakConvexServiceActorPassword:
          resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD,
        ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
        ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
      }),
    ),
  );

const runAdminNotificationCenterWithResolvedOptions = <A, E>(
  options: AdminNotificationCenterRuntimeOptions,
  use: (service: AdminNotificationCenterService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeAdminNotificationCenterRuntime(options).pipe(
      Effect.mapError(
        (cause): AdminNotificationCenterRuntimeError => ({
          _tag: "AdminNotificationCenterRuntimeError",
          cause,
        }),
      ),
    );

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const runAdminNotificationCenterFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminNotificationCenterService) => Effect.Effect<A, E>,
) =>
  resolveAdminNotificationCenterRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.mapError(
      (cause): AdminNotificationCenterRuntimeError => ({
        _tag: "AdminNotificationCenterRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap((resolvedOptions) =>
      runAdminNotificationCenterWithResolvedOptions(resolvedOptions, use),
    ),
  );
