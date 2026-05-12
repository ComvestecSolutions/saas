import { findModuleManifest } from "@comvestec/config";
import { and, desc, eq } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  fieldSecurityAuditAction,
  type EmailDeliveryTrackingAdminView,
  EmailDeliveryTrackingAdminViewSchema,
  type EmailDeliveryTrackingRecord,
  type EmailRecipientSuppressionAdminView,
  EmailRecipientSuppressionAdminViewSchema,
  type EmailRecipientSuppressionRecord,
  EmailDeliveryMessageReferenceSchema,
  EmailRecipientSuppressionLookupSchema,
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
  buildEmailDeliveryPostgresQueryable,
  EmailDeliveryPostgresRepository,
  type EmailDeliveryPostgresRepositoryError,
  type FieldSecurityModuleService,
  hasPrivilegedBreakGlassAccess,
  IdentitySessionPostgresRepository,
  type IdentitySessionRequestContextNotFoundError,
  IdentitySessionModule,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makeAuthorizationModule,
  makeEmailDeliveryPostgresRepository,
  makeFieldSecurityModule,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeTenantManagementModule,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  TenantManagementModule,
  TenantOnboardingPostgresRepository,
  TenantProvisioningPostgresRepository,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  OryKetoAdapter,
  type PostgresAdapterConnectionError,
  ValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import { buildWriteDatabase } from "../postgres-write-database";

export const AdminEmailDeliverySessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type AdminEmailDeliverySessionLookup = Schema.Schema.Type<
  typeof AdminEmailDeliverySessionLookupSchema
>;

export const InspectEmailDeliveryTrackingBySessionRequestSchema = Schema.Struct(
  {
    sessionId: Schema.NonEmptyString,
    messageId: EmailDeliveryMessageReferenceSchema.fields.messageId,
  },
);

export type InspectEmailDeliveryTrackingBySessionRequest = Schema.Schema.Type<
  typeof InspectEmailDeliveryTrackingBySessionRequestSchema
>;

export const InspectEmailRecipientSuppressionBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    recipient: EmailRecipientSuppressionLookupSchema.fields.recipient,
  });

export type InspectEmailRecipientSuppressionBySessionRequest =
  Schema.Schema.Type<
    typeof InspectEmailRecipientSuppressionBySessionRequestSchema
  >;

export const AdminEmailDeliveryRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
});

export type AdminEmailDeliveryRuntimeOptions = Schema.Schema.Type<
  typeof AdminEmailDeliveryRuntimeOptionsSchema
>;

const AdminEmailDeliveryProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

export type AdminEmailDeliveryUnauthenticatedActorError = {
  readonly _tag: "AdminEmailDeliveryUnauthenticatedActorError";
};

export type AdminEmailDeliveryAccessDeniedError = {
  readonly _tag: "AdminEmailDeliveryAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type AdminEmailDeliveryProjectionConfigurationError = {
  readonly _tag: "AdminEmailDeliveryProjectionConfigurationError";
  readonly moduleId: typeof platformModuleId.emailDelivery;
  readonly profile: typeof projectionProfile.admin;
};

export type AdminEmailDeliveryTrackingNotFoundError = {
  readonly _tag: "AdminEmailDeliveryTrackingNotFoundError";
  readonly messageId: string;
};

export type AdminEmailRecipientSuppressionNotFoundError = {
  readonly _tag: "AdminEmailRecipientSuppressionNotFoundError";
  readonly recipient: string;
};

export type AdminEmailDeliveryDataIntegrityError = {
  readonly _tag: "AdminEmailDeliveryDataIntegrityError";
  readonly operation: "suppressionSourceTrackingLookup";
  readonly sourceMessageId: string;
};

export type AdminEmailDeliveryInternalContractError = {
  readonly _tag: "AdminEmailDeliveryInternalContractError";
  readonly operation:
    | "authorizationCheck"
    | "auditLogAppend"
    | "fieldSecurityTrackingProjection"
    | "fieldSecuritySuppressionProjection"
    | "trackingAdminView"
    | "suppressionAdminView"
    | "trackingRecordLookup"
    | "suppressionRecordLookup"
    | "suppressionSourceTrackingLookup";
  readonly cause: ParseResult.ParseError;
};

export type AdminEmailDeliveryRuntimeError = {
  readonly _tag: "AdminEmailDeliveryRuntimeError";
  readonly cause: unknown;
};

export type AdminEmailDeliveryServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | EmailDeliveryPostgresRepositoryError
  | IdentitySessionRequestContextNotFoundError
  | ValkeyAdapterOperationError
  | AdminEmailDeliveryAccessDeniedError
  | AdminEmailDeliveryDataIntegrityError
  | AdminEmailDeliveryInternalContractError
  | AdminEmailDeliveryProjectionConfigurationError
  | AdminEmailDeliveryTrackingNotFoundError
  | AdminEmailDeliveryUnauthenticatedActorError
  | AdminEmailRecipientSuppressionNotFoundError;

export type AdminEmailDeliveryServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
};

export type AdminEmailDeliveryService = {
  readonly resolveRequestContext: (
    input: AdminEmailDeliverySessionLookup,
  ) => Effect.Effect<
    RequestContext,
    | ParseResult.ParseError
    | IdentitySessionRequestContextNotFoundError
    | ValkeyAdapterOperationError
  >;
  readonly inspectTrackedDelivery: (
    input: InspectEmailDeliveryTrackingBySessionRequest,
  ) => Effect.Effect<
    EmailDeliveryTrackingAdminView,
    AdminEmailDeliveryServiceError
  >;
  readonly inspectRecipientSuppression: (
    input: InspectEmailRecipientSuppressionBySessionRequest,
  ) => Effect.Effect<
    EmailRecipientSuppressionAdminView,
    AdminEmailDeliveryServiceError
  >;
};

type AuthenticatedEmailDeliveryOperatorContext = RequestContext & {
  readonly actorId: string;
};

const createInternalContractError =
  (operation: AdminEmailDeliveryInternalContractError["operation"]) =>
  (cause: ParseResult.ParseError): AdminEmailDeliveryInternalContractError => ({
    _tag: "AdminEmailDeliveryInternalContractError",
    operation,
    cause,
  });

const normalizeAuthorizationCheckError = (
  error: ParseResult.ParseError | AuthorizationDelegatedCheckError,
):
  | AuthorizationDelegatedCheckError
  | AdminEmailDeliveryInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("authorizationCheck")(error)
    : error;

const normalizeAuditLogError = (
  error: AuditLogModuleError,
): AuditLogModuleError | AdminEmailDeliveryInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("auditLogAppend")(error)
    : error;

const normalizeRepositoryError =
  (
    operation:
      | "trackingRecordLookup"
      | "suppressionRecordLookup"
      | "suppressionSourceTrackingLookup",
  ) =>
  (
    error: EmailDeliveryPostgresRepositoryError,
  ):
    | EmailDeliveryPostgresRepositoryError
    | AdminEmailDeliveryInternalContractError =>
    error._tag === "ParseError"
      ? createInternalContractError(operation)(error)
      : error;

const ensureEmailDeliveryOperatorAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedEmailDeliveryOperatorContext,
  | AdminEmailDeliveryUnauthenticatedActorError
  | AdminEmailDeliveryAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): AdminEmailDeliveryUnauthenticatedActorError => ({
        _tag: "AdminEmailDeliveryUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "AdminEmailDeliveryAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies AdminEmailDeliveryAccessDeniedError),
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

const checkEmailDeliveryOperatorPermission = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: AuthenticatedEmailDeliveryOperatorContext;
}) =>
  Effect.gen(function* () {
    const decision = yield* input.authorization
      .check({
        requestContext: input.requestContext,
        namespace: authorizationNamespace.module,
        object: platformModuleId.emailDelivery,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.emailManage,
      })
      .pipe(Effect.mapError(normalizeAuthorizationCheckError));

    return decision.allowed
      ? input.requestContext
      : yield* Effect.fail({
          _tag: "AdminEmailDeliveryAccessDeniedError",
          actorType: input.requestContext.actorType,
        } satisfies AdminEmailDeliveryAccessDeniedError);
  });

const resolveEmailDeliveryAdminProjection = () =>
  Effect.fromNullable(
    findModuleManifest(platformModuleId.emailDelivery)?.projectionProfiles.find(
      (projection) => projection.profile === projectionProfile.admin,
    ),
  ).pipe(
    Effect.orElseFail(
      (): AdminEmailDeliveryProjectionConfigurationError => ({
        _tag: "AdminEmailDeliveryProjectionConfigurationError",
        moduleId: platformModuleId.emailDelivery,
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

const applyProjectedTrackedDeliveryRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: EmailDeliveryTrackingRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.emailDelivery,
      requestContext: input.requestContext,
      projection: input.projection,
      record: {
        messageId: input.record.messageId,
        recipient: input.record.recipient,
        ...(input.record.template !== undefined
          ? { template: input.record.template }
          : {}),
        status: input.record.status,
        sentAt: input.record.sentAt,
        ...(input.record.lastEventAt !== undefined
          ? { lastEventAt: input.record.lastEventAt }
          : {}),
        ...(input.record.bounceType !== undefined
          ? { bounceType: input.record.bounceType }
          : {}),
      },
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityTrackingProjection"),
      ),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(EmailDeliveryTrackingAdminViewSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(createInternalContractError("trackingAdminView")),
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

const applyProjectedRecipientSuppressionRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: EmailRecipientSuppressionRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.emailDelivery,
      requestContext: input.requestContext,
      projection: input.projection,
      record: {
        suppressionId: input.record.suppressionId,
        recipient: input.record.recipient,
        suppressionReason: input.record.reason,
        sourceMessageId: input.record.sourceMessageId,
        ...(input.record.bounceType !== undefined
          ? { bounceType: input.record.bounceType }
          : {}),
        suppressedAt: input.record.suppressedAt,
      },
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecuritySuppressionProjection"),
      ),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(EmailRecipientSuppressionAdminViewSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(createInternalContractError("suppressionAdminView")),
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

const buildAdminEmailDeliveryService = (
  authorization: Pick<AuthorizationModuleService, "check">,
) =>
  Effect.gen(function* () {
    const adminProjection = yield* resolveEmailDeliveryAdminProjection();
    const auditLog = yield* AuditLogModule;
    const emailDeliveryRepository = yield* EmailDeliveryPostgresRepository;
    const fieldSecurity = yield* makeFieldSecurityModule();
    const identitySession = yield* IdentitySessionModule;

    return {
      resolveRequestContext: (input: AdminEmailDeliverySessionLookup) =>
        Schema.decodeUnknown(AdminEmailDeliverySessionLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            identitySession.resolveRequestContext({
              sessionId: request.sessionId,
            }),
          ),
        ),
      inspectTrackedDelivery: (
        input: InspectEmailDeliveryTrackingBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          InspectEmailDeliveryTrackingBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authenticatedRequestContext =
                yield* ensureEmailDeliveryOperatorAccess(requestContext);
              const currentTenantAuthorizedRequestContext =
                yield* checkEmailDeliveryOperatorPermission({
                  authorization,
                  requestContext: authenticatedRequestContext,
                });
              const trackedDelivery = yield* emailDeliveryRepository
                .findTrackedDelivery({ messageId: request.messageId })
                .pipe(
                  Effect.mapError(
                    normalizeRepositoryError("trackingRecordLookup"),
                  ),
                );

              if (trackedDelivery === undefined) {
                return yield* Effect.fail({
                  _tag: "AdminEmailDeliveryTrackingNotFoundError",
                  messageId: request.messageId,
                } satisfies AdminEmailDeliveryTrackingNotFoundError);
              }

              const authorizedRequestContext = isSameTenantContext({
                requestContext: authenticatedRequestContext,
                targetTenant: {
                  scope: trackedDelivery.tenantScope,
                  scopeId: trackedDelivery.tenantScopeId,
                },
              })
                ? currentTenantAuthorizedRequestContext
                : hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
                  ? yield* checkEmailDeliveryOperatorPermission({
                      authorization,
                      requestContext: {
                        ...authenticatedRequestContext,
                        tenant: buildTargetTenantContext({
                          scope: trackedDelivery.tenantScope,
                          scopeId: trackedDelivery.tenantScopeId,
                        }),
                      },
                    })
                  : yield* Effect.fail({
                      _tag: "AdminEmailDeliveryTrackingNotFoundError",
                      messageId: request.messageId,
                    } satisfies AdminEmailDeliveryTrackingNotFoundError);
              const projectedRecord =
                yield* applyProjectedTrackedDeliveryRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  record: trackedDelivery,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.emailDelivery}:${trackedDelivery.messageId}:tracking:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator inspected an email delivery tracking record through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      inspectRecipientSuppression: (
        input: InspectEmailRecipientSuppressionBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          InspectEmailRecipientSuppressionBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authenticatedRequestContext =
                yield* ensureEmailDeliveryOperatorAccess(requestContext);
              const currentTenantAuthorizedRequestContext =
                yield* checkEmailDeliveryOperatorPermission({
                  authorization,
                  requestContext: authenticatedRequestContext,
                });
              const suppression = yield* emailDeliveryRepository
                .findRecipientSuppression({ recipient: request.recipient })
                .pipe(
                  Effect.mapError(
                    normalizeRepositoryError("suppressionRecordLookup"),
                  ),
                );

              if (suppression === undefined) {
                return yield* Effect.fail({
                  _tag: "AdminEmailRecipientSuppressionNotFoundError",
                  recipient: request.recipient,
                } satisfies AdminEmailRecipientSuppressionNotFoundError);
              }

              const sourceTrackedDelivery = yield* emailDeliveryRepository
                .findTrackedDelivery({
                  messageId: suppression.sourceMessageId,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRepositoryError("suppressionSourceTrackingLookup"),
                  ),
                );

              if (sourceTrackedDelivery === undefined) {
                return hasPrivilegedBreakGlassAccess(
                  authenticatedRequestContext,
                )
                  ? yield* Effect.fail({
                      _tag: "AdminEmailDeliveryDataIntegrityError",
                      operation: "suppressionSourceTrackingLookup",
                      sourceMessageId: suppression.sourceMessageId,
                    } satisfies AdminEmailDeliveryDataIntegrityError)
                  : yield* Effect.fail({
                      _tag: "AdminEmailRecipientSuppressionNotFoundError",
                      recipient: request.recipient,
                    } satisfies AdminEmailRecipientSuppressionNotFoundError);
              }

              const authorizedRequestContext = isSameTenantContext({
                requestContext: authenticatedRequestContext,
                targetTenant: {
                  scope: sourceTrackedDelivery.tenantScope,
                  scopeId: sourceTrackedDelivery.tenantScopeId,
                },
              })
                ? currentTenantAuthorizedRequestContext
                : hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
                  ? yield* checkEmailDeliveryOperatorPermission({
                      authorization,
                      requestContext: {
                        ...authenticatedRequestContext,
                        tenant: buildTargetTenantContext({
                          scope: sourceTrackedDelivery.tenantScope,
                          scopeId: sourceTrackedDelivery.tenantScopeId,
                        }),
                      },
                    })
                  : yield* Effect.fail({
                      _tag: "AdminEmailRecipientSuppressionNotFoundError",
                      recipient: request.recipient,
                    } satisfies AdminEmailRecipientSuppressionNotFoundError);
              const projectedRecord =
                yield* applyProjectedRecipientSuppressionRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: adminProjection,
                  record: suppression,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.emailDelivery}:${suppression.suppressionId}:suppression:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator inspected an email recipient suppression record through the admin communication surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
    } satisfies AdminEmailDeliveryService;
  });

const makeLiveEmailDeliveryAuthorization = Effect.gen(function* () {
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

export function makeAdminEmailDeliveryService(options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
}): Effect.Effect<
  AdminEmailDeliveryService,
  ParseResult.ParseError | AdminEmailDeliveryProjectionConfigurationError,
  AuditLogModule | EmailDeliveryPostgresRepository | IdentitySessionModule
>;
export function makeAdminEmailDeliveryService(
  options?: AdminEmailDeliveryServiceOptions,
): Effect.Effect<
  AdminEmailDeliveryService,
  ParseResult.ParseError | AdminEmailDeliveryProjectionConfigurationError,
  | AuditLogModule
  | EmailDeliveryPostgresRepository
  | IdentitySessionModule
  | OryKetoAdapter
>;
export function makeAdminEmailDeliveryService(
  options: AdminEmailDeliveryServiceOptions = {},
): Effect.Effect<
  AdminEmailDeliveryService,
  ParseResult.ParseError | AdminEmailDeliveryProjectionConfigurationError,
  | AuditLogModule
  | EmailDeliveryPostgresRepository
  | IdentitySessionModule
  | OryKetoAdapter
> {
  return options.authorization === undefined
    ? makeLiveEmailDeliveryAuthorization.pipe(
        Effect.flatMap((authorization) =>
          buildAdminEmailDeliveryService(authorization),
        ),
      )
    : buildAdminEmailDeliveryService(options.authorization);
}

const makeAdminEmailDeliveryRuntime = (
  options: AdminEmailDeliveryRuntimeOptions,
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
    const emailDeliveryRepository = yield* makeEmailDeliveryPostgresRepository(
      buildEmailDeliveryPostgresQueryable(writeDatabase),
    );
    const service = yield* makeAdminEmailDeliveryService().pipe(
      Effect.provideService(AuditLogModule, auditLog),
      Effect.provideService(
        EmailDeliveryPostgresRepository,
        emailDeliveryRepository,
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

export const resolveAdminEmailDeliveryRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(AdminEmailDeliveryProcessEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map(
      (resolvedEnvironment): AdminEmailDeliveryRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
        valkeyUrl: resolvedEnvironment.VALKEY_URL,
        keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
        keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
        keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
        keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
        ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
        ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
      }),
    ),
  );

const runAdminEmailDeliveryWithResolvedOptions = <A, E>(
  options: AdminEmailDeliveryRuntimeOptions,
  use: (service: AdminEmailDeliveryService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeAdminEmailDeliveryRuntime(options).pipe(
      Effect.mapError(
        (cause): AdminEmailDeliveryRuntimeError => ({
          _tag: "AdminEmailDeliveryRuntimeError",
          cause,
        }),
      ),
    );

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const runAdminEmailDeliveryFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminEmailDeliveryService) => Effect.Effect<A, E>,
) =>
  resolveAdminEmailDeliveryRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.mapError(
      (cause): AdminEmailDeliveryRuntimeError => ({
        _tag: "AdminEmailDeliveryRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap((resolvedOptions) =>
      runAdminEmailDeliveryWithResolvedOptions(resolvedOptions, use),
    ),
  );
