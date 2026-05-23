import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  actorType,
  ActorTypeSchema,
  supportOperationsAuditAction,
  AuditEventSchema,
  BreakGlassContextSchema,
  ImpersonationContextSchema,
  IsoTimestampSchema,
  PlatformScopeSchema,
  platformModuleId,
  platformScope,
  RequestContextSchema,
  type SupportOperationsCasePriority,
  SupportOperationsCasePrioritySchema,
  type SupportOperationsCaseStatus,
  SupportOperationsCaseStatusSchema,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  type SupportOperationsBreakGlassIncidentStatus,
  supportOperationsImpersonationSessionStatus,
  SupportOperationsImpersonationSessionStatusSchema,
  SupportOperationsBreakGlassIncidentStatusSchema,
  supportOperationsBreakGlassIncidentStatus,
  type RequestContext,
  TenantContextSchema,
  type TenantContext,
} from "@comvestec/contracts";
import {
  findModuleManifest,
  supportOperationsConfigKey,
} from "@comvestec/config";
import {
  KeycloakAdapter,
  type KeycloakAdapterService,
  type KeycloakImpersonationCleanupUnavailableError,
  type KeycloakImpersonationCompensationError,
  type KeycloakImpersonationSession,
  type KeycloakAdapterRequestError,
  type KeycloakImpersonationActorMismatchError,
  type KeycloakImpersonationIdTokenMissingError,
  type KeycloakSessionIdentifierMissingError,
  type KeycloakSessionInactiveError,
} from "@comvestec/platform";
import {
  actorSupportsPrivilegedSupportEscalation,
  isFutureBreakGlassExpiry,
} from "../access/break-glass";
import { buildAuditEvent } from "./audit-log";

const BreakGlassRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  approvedBy: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
});

export type BreakGlassRequest = Schema.Schema.Type<
  typeof BreakGlassRequestSchema
>;

const SupportImpersonationRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  impersonatedActorId: Schema.NonEmptyString,
  approvedBy: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  requestedDurationMinutes: Schema.Number,
});

export type SupportImpersonationRequest = Schema.Schema.Type<
  typeof SupportImpersonationRequestSchema
>;

export const SupportOperationsImpersonationSessionRecordSchema = Schema.Struct({
  caseId: Schema.NonEmptyString,
  supportAgent: Schema.NonEmptyString,
  impersonatedUser: Schema.NonEmptyString,
  startedAt: IsoTimestampSchema,
  durationMinutes: Schema.Number,
  status: SupportOperationsImpersonationSessionStatusSchema,
  approvedBy: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  expiresAt: IsoTimestampSchema,
});

export type SupportOperationsImpersonationSessionRecord = Schema.Schema.Type<
  typeof SupportOperationsImpersonationSessionRecordSchema
>;

export const SupportOperationsImpersonationSessionRecordListSchema =
  Schema.Array(SupportOperationsImpersonationSessionRecordSchema);

const RevokeSupportOperationsImpersonationSessionRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  session: SupportOperationsImpersonationSessionRecordSchema,
  revocationReason: Schema.NonEmptyString,
});

export type RevokeSupportOperationsImpersonationSessionRequest =
  Schema.Schema.Type<
    typeof RevokeSupportOperationsImpersonationSessionRequestSchema
  >;

export const SupportOperationsImpersonationSessionRevocationResultSchema =
  Schema.Struct({
    session: SupportOperationsImpersonationSessionRecordSchema,
    auditEvent: AuditEventSchema,
  });

export type SupportOperationsImpersonationSessionRevocationResult =
  Schema.Schema.Type<
    typeof SupportOperationsImpersonationSessionRevocationResultSchema
  >;

export const SupportOperationsCaseRecordSchema = Schema.Struct({
  caseId: Schema.NonEmptyString,
  supportAgent: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  status: SupportOperationsCaseStatusSchema,
  priority: SupportOperationsCasePrioritySchema,
  startedAt: IsoTimestampSchema,
  lastUpdatedAt: IsoTimestampSchema,
});

export type SupportOperationsCaseRecord = Schema.Schema.Type<
  typeof SupportOperationsCaseRecordSchema
>;

export const SupportOperationsCaseRecordListSchema = Schema.Array(
  SupportOperationsCaseRecordSchema,
);

const UpsertSupportOperationsCaseRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  caseId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  status: SupportOperationsCaseStatusSchema,
  priority: SupportOperationsCasePrioritySchema,
  changeReason: Schema.NonEmptyString,
  existingCase: Schema.optional(SupportOperationsCaseRecordSchema),
});

export type UpsertSupportOperationsCaseRequest = Schema.Schema.Type<
  typeof UpsertSupportOperationsCaseRequestSchema
>;

export const SupportOperationsCaseUpsertResultSchema = Schema.Struct({
  case: SupportOperationsCaseRecordSchema,
  auditEvent: AuditEventSchema,
});

export type SupportOperationsCaseUpsertResult = Schema.Schema.Type<
  typeof SupportOperationsCaseUpsertResultSchema
>;

export const SupportOperationsBreakGlassIncidentRecordSchema = Schema.Struct({
  caseId: Schema.NonEmptyString,
  supportAgent: Schema.NonEmptyString,
  startedAt: IsoTimestampSchema,
  status: SupportOperationsBreakGlassIncidentStatusSchema,
  approvedBy: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  expiresAt: IsoTimestampSchema,
});

export type SupportOperationsBreakGlassIncidentRecord = Schema.Schema.Type<
  typeof SupportOperationsBreakGlassIncidentRecordSchema
>;

export const SupportOperationsBreakGlassIncidentRecordListSchema = Schema.Array(
  SupportOperationsBreakGlassIncidentRecordSchema,
);

const ReviewSupportOperationsBreakGlassIncidentRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  incident: SupportOperationsBreakGlassIncidentRecordSchema,
  reviewReason: Schema.NonEmptyString,
});

export type ReviewSupportOperationsBreakGlassIncidentRequest =
  Schema.Schema.Type<
    typeof ReviewSupportOperationsBreakGlassIncidentRequestSchema
  >;

export const SupportOperationsBreakGlassIncidentReviewResultSchema =
  Schema.Struct({
    incident: SupportOperationsBreakGlassIncidentRecordSchema,
    auditEvent: AuditEventSchema,
  });

export type SupportOperationsBreakGlassIncidentReviewResult =
  Schema.Schema.Type<
    typeof SupportOperationsBreakGlassIncidentReviewResultSchema
  >;

export const BreakGlassGrantSchema = Schema.Struct({
  grantedRequestContext: RequestContextSchema,
  expiresAt: Schema.NonEmptyString,
  auditEvent: AuditEventSchema,
});

export type BreakGlassGrant = Schema.Schema.Type<typeof BreakGlassGrantSchema>;

const SupportImpersonationGrantedRequestContextSchema = Schema.Struct({
  actorType: ActorTypeSchema,
  actorId: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
  tenant: TenantContextSchema,
  host: Schema.optional(Schema.NonEmptyString),
  reason: Schema.optional(Schema.NonEmptyString),
  impersonation: Schema.optional(ImpersonationContextSchema),
  breakGlass: Schema.optional(BreakGlassContextSchema),
});

export const SupportImpersonationGrantSchema = Schema.Struct({
  grantedRequestContext: SupportImpersonationGrantedRequestContextSchema,
  expiresAt: Schema.NonEmptyString,
  idToken: Schema.NonEmptyString,
  auditEvent: AuditEventSchema,
});

export type SupportImpersonationGrant = Schema.Schema.Type<
  typeof SupportImpersonationGrantSchema
>;

const SupportEscalationDecisionSchema = Schema.Struct({
  allowed: Schema.Boolean,
  reason: Schema.NonEmptyString,
});

export type SupportEscalationDecision = Schema.Schema.Type<
  typeof SupportEscalationDecisionSchema
>;

export type UnauthenticatedBreakGlassActorError = {
  readonly _tag: "UnauthenticatedBreakGlassActorError";
};

export type UnauthenticatedImpersonationActorError = {
  readonly _tag: "UnauthenticatedImpersonationActorError";
};

export type UnauthenticatedSupportCaseActorError = {
  readonly _tag: "UnauthenticatedSupportCaseActorError";
};

export type ImpersonationActorTypeMissingError = {
  readonly _tag: "ImpersonationActorTypeMissingError";
  readonly actorId: string;
};

export type ImpersonationTenantHintMissingError = {
  readonly _tag: "ImpersonationTenantHintMissingError";
  readonly actorId: string;
  readonly actorType: Exclude<RequestContext["actorType"], undefined>;
};

export type UnsupportedSupportActorError = {
  readonly _tag: "UnsupportedSupportActorError";
  readonly actorType: RequestContext["actorType"];
};

export type InvalidBreakGlassExpiryError = {
  readonly _tag: "InvalidBreakGlassExpiryError";
  readonly expiresAt: BreakGlassGrant["expiresAt"];
};

export type InvalidImpersonationDurationError = {
  readonly _tag: "InvalidImpersonationDurationError";
  readonly requestedDurationMinutes: number;
};

export type BreakGlassIncidentAlreadyReviewedError = {
  readonly _tag: "BreakGlassIncidentAlreadyReviewedError";
  readonly caseId: string;
};

export type SupportOperationsImpersonationSessionAlreadyRevokedError = {
  readonly _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError";
  readonly caseId: string;
};

type SupportImpersonationGrantFailure =
  | ParseResult.ParseError
  | ImpersonationActorTypeMissingError
  | ImpersonationTenantHintMissingError;

export type SupportImpersonationGrantCleanupError = {
  readonly _tag: "SupportImpersonationGrantCleanupError";
  readonly sessionId: string;
  readonly grantFailure: SupportImpersonationGrantFailure;
  readonly cleanupFailure: ParseResult.ParseError | KeycloakAdapterRequestError;
};

export type SupportOperationsModuleError =
  | ParseResult.ParseError
  | UnauthenticatedBreakGlassActorError
  | UnauthenticatedImpersonationActorError
  | UnauthenticatedSupportCaseActorError
  | ImpersonationActorTypeMissingError
  | ImpersonationTenantHintMissingError
  | UnsupportedSupportActorError
  | InvalidBreakGlassExpiryError
  | InvalidImpersonationDurationError
  | BreakGlassIncidentAlreadyReviewedError
  | SupportOperationsImpersonationSessionAlreadyRevokedError
  | SupportImpersonationGrantCleanupError
  | KeycloakAdapterRequestError
  | KeycloakSessionInactiveError
  | KeycloakSessionIdentifierMissingError
  | KeycloakImpersonationIdTokenMissingError
  | KeycloakImpersonationActorMismatchError
  | KeycloakImpersonationCleanupUnavailableError
  | KeycloakImpersonationCompensationError;

export type SupportOperationsModuleService = {
  readonly startImpersonation: (
    input: SupportImpersonationRequest,
  ) => Effect.Effect<SupportImpersonationGrant, SupportOperationsModuleError>;
  readonly upsertSupportCase: (
    input: UpsertSupportOperationsCaseRequest,
  ) => Effect.Effect<
    SupportOperationsCaseUpsertResult,
    SupportOperationsModuleError
  >;
  readonly grantBreakGlassAccess: (
    input: BreakGlassRequest,
  ) => Effect.Effect<BreakGlassGrant, SupportOperationsModuleError>;
  readonly validateEscalation: (
    requestContext: RequestContext,
  ) => Effect.Effect<SupportEscalationDecision, ParseResult.ParseError>;
};

export class SupportOperationsModule extends Context.Tag(
  "SupportOperationsModule",
)<SupportOperationsModule, SupportOperationsModuleService>() {}

const buildSupportImpersonationTarget = (input: {
  readonly actorId: string;
  readonly tenant: TenantContext;
}) => `${input.tenant.scope}:${input.tenant.scopeId}:${input.actorId}`;

const buildSupportOperationsCaseTarget = (caseId: string) => `case:${caseId}`;

const supportOperationsManifest = findModuleManifest(
  platformModuleId.supportOperations,
);

const resolveSupportOperationsDurationLimitMinutes = (
  key: string,
  fallback: number,
) => {
  const configEntry = supportOperationsManifest?.configKeys.find(
    (configKey) => configKey.key === key,
  );

  return typeof configEntry?.defaultValue === "number" &&
    Number.isFinite(configEntry.defaultValue) &&
    configEntry.defaultValue > 0
    ? configEntry.defaultValue
    : fallback;
};

const supportOperationsImpersonationMaxDurationMinutes =
  resolveSupportOperationsDurationLimitMinutes(
    supportOperationsConfigKey.impersonationMaxDurationMinutes,
    30,
  );

const supportOperationsBreakGlassMaxDurationMinutes =
  resolveSupportOperationsDurationLimitMinutes(
    supportOperationsConfigKey.breakGlassMaxDurationMinutes,
    30,
  );

const deriveImpersonatedTenant = (
  session: Pick<
    KeycloakImpersonationSession["session"],
    "actorId" | "actorType" | "tenantHint"
  >,
): Effect.Effect<
  TenantContext,
  | ImpersonationActorTypeMissingError
  | ImpersonationTenantHintMissingError
  | ParseResult.ParseError
> => {
  if (session.actorType === undefined) {
    return Effect.fail({
      _tag: "ImpersonationActorTypeMissingError",
      actorId: session.actorId,
    } satisfies ImpersonationActorTypeMissingError);
  }

  switch (session.actorType) {
    case actorType.platformOperator:
    case actorType.supportOperator:
    case actorType.serviceActor:
      return Schema.decodeUnknown(TenantContextSchema)({
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      });
    case actorType.enterpriseAdmin:
      return session.tenantHint === undefined
        ? Effect.fail({
            _tag: "ImpersonationTenantHintMissingError",
            actorId: session.actorId,
            actorType: session.actorType,
          } satisfies ImpersonationTenantHintMissingError)
        : Schema.decodeUnknown(TenantContextSchema)({
            scope: platformScope.enterprise,
            scopeId: session.tenantHint,
            enterpriseId: session.tenantHint,
          });
    case actorType.organizationAdmin:
    case actorType.organizationMember:
      return session.tenantHint === undefined
        ? Effect.fail({
            _tag: "ImpersonationTenantHintMissingError",
            actorId: session.actorId,
            actorType: session.actorType,
          } satisfies ImpersonationTenantHintMissingError)
        : Schema.decodeUnknown(TenantContextSchema)({
            scope: platformScope.organization,
            scopeId: session.tenantHint,
            organizationId: session.tenantHint,
          });
    case actorType.individualUser:
      return Schema.decodeUnknown(TenantContextSchema)({
        scope: platformScope.individual,
        scopeId: session.tenantHint ?? session.actorId,
        individualId: session.actorId,
      });
    case actorType.anonymous:
      return Effect.fail({
        _tag: "ImpersonationTenantHintMissingError",
        actorId: session.actorId,
        actorType: session.actorType,
      } satisfies ImpersonationTenantHintMissingError);
  }
};

const resolveImpersonationExpiry = (input: {
  readonly startedAt: number;
  readonly expiresInSeconds: number;
  readonly requestedDurationMinutes: number;
}) => {
  const boundedDurationSeconds = Math.min(
    input.expiresInSeconds,
    Math.trunc(
      Math.min(
        input.requestedDurationMinutes,
        supportOperationsImpersonationMaxDurationMinutes,
      ) * 60,
    ),
  );

  return new Date(
    input.startedAt + Math.max(boundedDurationSeconds, 1) * 1000,
  ).toISOString();
};

const compensateFailedImpersonationGrant = (input: {
  readonly keycloak: Pick<KeycloakAdapterService, "revokeSession">;
  readonly session: KeycloakImpersonationSession["session"];
  readonly grantFailure: SupportImpersonationGrantFailure;
}) =>
  input.keycloak
    .revokeSession({
      sessionId: input.session.sessionId,
    })
    .pipe(
      Effect.catchAll((cleanupFailure) =>
        Effect.fail({
          _tag: "SupportImpersonationGrantCleanupError",
          sessionId: input.session.sessionId,
          grantFailure: input.grantFailure,
          cleanupFailure,
        } satisfies SupportImpersonationGrantCleanupError),
      ),
      Effect.zipRight(Effect.fail(input.grantFailure)),
    );

const calculateSupportOperationsDurationMinutes = (input: {
  readonly startedAt: string;
  readonly expiresAt: string;
}) =>
  Math.max(
    Math.ceil(
      (new Date(input.expiresAt).getTime() -
        new Date(input.startedAt).getTime()) /
        60_000,
    ),
    1,
  );

export const createSupportOperationsImpersonationSessionRecord = (
  grant: SupportImpersonationGrant,
) =>
  Schema.decodeUnknown(SupportOperationsImpersonationSessionRecordSchema)({
    caseId: grant.grantedRequestContext.sessionId,
    supportAgent: grant.auditEvent.actorId,
    impersonatedUser: grant.grantedRequestContext.actorId,
    startedAt: grant.auditEvent.timestamp,
    durationMinutes: calculateSupportOperationsDurationMinutes({
      startedAt: grant.auditEvent.timestamp,
      expiresAt: grant.expiresAt,
    }),
    status: supportOperationsImpersonationSessionStatus.active,
    approvedBy: grant.grantedRequestContext.impersonation?.approvedBy,
    reason:
      grant.grantedRequestContext.impersonation?.reason ??
      grant.auditEvent.reason,
    expiresAt: grant.expiresAt,
  });

export const revokeSupportOperationsImpersonationSession = (
  input: RevokeSupportOperationsImpersonationSessionRequest,
) =>
  Schema.decodeUnknown(
    RevokeSupportOperationsImpersonationSessionRequestSchema,
  )(input).pipe(
    Effect.flatMap(
      (
        request,
      ): Effect.Effect<
        SupportOperationsImpersonationSessionRevocationResult,
        SupportOperationsModuleError
      > => {
        if (request.requestContext.actorId === undefined) {
          return Effect.fail({
            _tag: "UnauthenticatedImpersonationActorError",
          } satisfies UnauthenticatedImpersonationActorError);
        }

        if (
          !actorSupportsPrivilegedSupportEscalation(
            request.requestContext.actorType,
          )
        ) {
          return Effect.fail({
            _tag: "UnsupportedSupportActorError",
            actorType: request.requestContext.actorType,
          } satisfies UnsupportedSupportActorError);
        }

        if (
          request.session.status ===
          supportOperationsImpersonationSessionStatus.revoked
        ) {
          return Effect.fail({
            _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
            caseId: request.session.caseId,
          } satisfies SupportOperationsImpersonationSessionAlreadyRevokedError);
        }

        return buildAuditEvent({
          requestContext: request.requestContext,
          moduleId: platformModuleId.supportOperations,
          action: supportOperationsAuditAction.impersonationRevoked,
          target: buildSupportOperationsCaseTarget(request.session.caseId),
          reason: request.revocationReason,
        }).pipe(
          Effect.flatMap((auditEvent) =>
            Schema.decodeUnknown(
              SupportOperationsImpersonationSessionRevocationResultSchema,
            )({
              session: {
                ...request.session,
                status: supportOperationsImpersonationSessionStatus.revoked,
              },
              auditEvent,
            }),
          ),
        );
      },
    ),
  );

export const upsertSupportOperationsCase = (
  input: UpsertSupportOperationsCaseRequest,
) =>
  Schema.decodeUnknown(UpsertSupportOperationsCaseRequestSchema)(input).pipe(
    Effect.flatMap(
      (
        request,
      ): Effect.Effect<
        SupportOperationsCaseUpsertResult,
        SupportOperationsModuleError
      > => {
        if (request.requestContext.actorId === undefined) {
          return Effect.fail({
            _tag: "UnauthenticatedSupportCaseActorError",
          } satisfies UnauthenticatedSupportCaseActorError);
        }

        if (
          !actorSupportsPrivilegedSupportEscalation(
            request.requestContext.actorType,
          )
        ) {
          return Effect.fail({
            _tag: "UnsupportedSupportActorError",
            actorType: request.requestContext.actorType,
          } satisfies UnsupportedSupportActorError);
        }

        const supportAgent = request.requestContext.actorId;

        return buildAuditEvent({
          requestContext: request.requestContext,
          moduleId: platformModuleId.supportOperations,
          action: supportOperationsAuditAction.supportCaseUpserted,
          target: buildSupportOperationsCaseTarget(request.caseId),
          reason: request.changeReason,
        }).pipe(
          Effect.flatMap((auditEvent) =>
            Schema.decodeUnknown(SupportOperationsCaseUpsertResultSchema)({
              case: {
                caseId: request.caseId,
                supportAgent,
                tenantScope: request.tenantScope,
                tenantScopeId: request.tenantScopeId,
                summary: request.summary,
                status: request.status,
                priority: request.priority,
                startedAt:
                  request.existingCase?.startedAt ?? auditEvent.timestamp,
                lastUpdatedAt: auditEvent.timestamp,
              } satisfies {
                readonly caseId: string;
                readonly supportAgent: string;
                readonly tenantScope: RequestContext["tenant"]["scope"];
                readonly tenantScopeId: string;
                readonly summary: string;
                readonly status: SupportOperationsCaseStatus;
                readonly priority: SupportOperationsCasePriority;
                readonly startedAt: string;
                readonly lastUpdatedAt: string;
              },
              auditEvent,
            }),
          ),
        );
      },
    ),
  );

export const createSupportOperationsBreakGlassIncidentRecord = (
  grant: BreakGlassGrant,
) =>
  Schema.decodeUnknown(SupportOperationsBreakGlassIncidentRecordSchema)({
    caseId: grant.auditEvent.eventId,
    supportAgent: grant.auditEvent.actorId,
    startedAt: grant.auditEvent.timestamp,
    status: supportOperationsBreakGlassIncidentStatus.pendingReview,
    approvedBy: grant.grantedRequestContext.breakGlass?.approvedBy,
    reason:
      grant.grantedRequestContext.breakGlass?.reason ?? grant.auditEvent.reason,
    expiresAt: grant.expiresAt,
  });

export const reviewSupportOperationsBreakGlassIncident = (
  input: ReviewSupportOperationsBreakGlassIncidentRequest,
) =>
  Schema.decodeUnknown(ReviewSupportOperationsBreakGlassIncidentRequestSchema)(
    input,
  ).pipe(
    Effect.flatMap(
      (
        request,
      ): Effect.Effect<
        SupportOperationsBreakGlassIncidentReviewResult,
        SupportOperationsModuleError
      > => {
        if (request.requestContext.actorId === undefined) {
          return Effect.fail({
            _tag: "UnauthenticatedBreakGlassActorError",
          } satisfies UnauthenticatedBreakGlassActorError);
        }

        if (
          !actorSupportsPrivilegedSupportEscalation(
            request.requestContext.actorType,
          )
        ) {
          return Effect.fail({
            _tag: "UnsupportedSupportActorError",
            actorType: request.requestContext.actorType,
          } satisfies UnsupportedSupportActorError);
        }

        if (
          request.incident.status ===
          supportOperationsBreakGlassIncidentStatus.reviewed
        ) {
          return Effect.fail({
            _tag: "BreakGlassIncidentAlreadyReviewedError",
            caseId: request.incident.caseId,
          } satisfies BreakGlassIncidentAlreadyReviewedError);
        }

        return buildAuditEvent({
          requestContext: request.requestContext,
          moduleId: platformModuleId.supportOperations,
          action: supportOperationsAuditAction.breakGlassReviewed,
          target: buildSupportOperationsCaseTarget(request.incident.caseId),
          reason: request.reviewReason,
        }).pipe(
          Effect.flatMap((auditEvent) =>
            Schema.decodeUnknown(
              SupportOperationsBreakGlassIncidentReviewResultSchema,
            )({
              incident: {
                ...request.incident,
                status: supportOperationsBreakGlassIncidentStatus.reviewed,
              },
              auditEvent,
            }),
          ),
        );
      },
    ),
  );

export const makeSupportOperationsModule = () =>
  Effect.gen(function* () {
    const keycloak = yield* KeycloakAdapter;

    return {
      startImpersonation: (input: SupportImpersonationRequest) =>
        Schema.decodeUnknown(SupportImpersonationRequestSchema)(input).pipe(
          Effect.flatMap(
            (
              request,
            ): Effect.Effect<
              SupportImpersonationGrant,
              SupportOperationsModuleError
            > => {
              if (request.requestContext.actorId === undefined) {
                return Effect.fail({
                  _tag: "UnauthenticatedImpersonationActorError",
                } satisfies UnauthenticatedImpersonationActorError);
              }

              if (
                !actorSupportsPrivilegedSupportEscalation(
                  request.requestContext.actorType,
                )
              ) {
                return Effect.fail({
                  _tag: "UnsupportedSupportActorError",
                  actorType: request.requestContext.actorType,
                } satisfies UnsupportedSupportActorError);
              }

              if (
                !Number.isFinite(request.requestedDurationMinutes) ||
                request.requestedDurationMinutes <= 0
              ) {
                return Effect.fail({
                  _tag: "InvalidImpersonationDurationError",
                  requestedDurationMinutes: request.requestedDurationMinutes,
                } satisfies InvalidImpersonationDurationError);
              }

              const startedAt = Date.now();

              return keycloak
                .issueImpersonationSession({
                  impersonatedActorId: request.impersonatedActorId,
                })
                .pipe(
                  Effect.flatMap((impersonationSession) =>
                    deriveImpersonatedTenant(impersonationSession.session).pipe(
                      Effect.flatMap((impersonatedTenant) =>
                        buildAuditEvent({
                          requestContext: request.requestContext,
                          moduleId: platformModuleId.supportOperations,
                          action:
                            supportOperationsAuditAction.impersonationStarted,
                          target: buildSupportImpersonationTarget({
                            actorId: impersonationSession.session.actorId,
                            tenant: impersonatedTenant,
                          }),
                          reason: request.reason,
                        }).pipe(
                          Effect.flatMap((auditEvent) =>
                            Schema.decodeUnknown(
                              SupportImpersonationGrantSchema,
                            )({
                              grantedRequestContext: {
                                actorType:
                                  impersonationSession.session.actorType,
                                actorId: impersonationSession.session.actorId,
                                sessionId:
                                  impersonationSession.session.sessionId,
                                correlationId:
                                  request.requestContext.correlationId,
                                tenant: impersonatedTenant,
                                reason: request.reason,
                                impersonation: {
                                  impersonatedActorId:
                                    impersonationSession.session.actorId,
                                  approvedBy: request.approvedBy,
                                  reason: request.reason,
                                },
                                ...(request.requestContext.host !== undefined
                                  ? { host: request.requestContext.host }
                                  : {}),
                              },
                              expiresAt: resolveImpersonationExpiry({
                                startedAt,
                                expiresInSeconds:
                                  impersonationSession.expiresInSeconds,
                                requestedDurationMinutes:
                                  request.requestedDurationMinutes,
                              }),
                              idToken: impersonationSession.idToken,
                              auditEvent,
                            }),
                          ),
                        ),
                      ),
                      Effect.catchAll((grantFailure) =>
                        compensateFailedImpersonationGrant({
                          keycloak,
                          session: impersonationSession.session,
                          grantFailure,
                        }),
                      ),
                    ),
                  ),
                );
            },
          ),
        ),
      upsertSupportCase: (input: UpsertSupportOperationsCaseRequest) =>
        upsertSupportOperationsCase(input),
      grantBreakGlassAccess: (input: BreakGlassRequest) =>
        Schema.decodeUnknown(BreakGlassRequestSchema)(input).pipe(
          Effect.flatMap(
            (
              request,
            ): Effect.Effect<BreakGlassGrant, SupportOperationsModuleError> => {
              if (request.requestContext.actorId === undefined) {
                return Effect.fail({
                  _tag: "UnauthenticatedBreakGlassActorError",
                } satisfies UnauthenticatedBreakGlassActorError);
              }

              if (
                !actorSupportsPrivilegedSupportEscalation(
                  request.requestContext.actorType,
                )
              ) {
                return Effect.fail({
                  _tag: "UnsupportedSupportActorError",
                  actorType: request.requestContext.actorType,
                } satisfies UnsupportedSupportActorError);
              }

              if (!isFutureBreakGlassExpiry(request.expiresAt)) {
                return Effect.fail({
                  _tag: "InvalidBreakGlassExpiryError",
                  expiresAt: request.expiresAt,
                } satisfies InvalidBreakGlassExpiryError);
              }

              const maximumAllowedExpiryTimestamp =
                Date.now() +
                supportOperationsBreakGlassMaxDurationMinutes * 60 * 1000;

              if (
                new Date(request.expiresAt).getTime() >
                maximumAllowedExpiryTimestamp
              ) {
                return Effect.fail({
                  _tag: "InvalidBreakGlassExpiryError",
                  expiresAt: request.expiresAt,
                } satisfies InvalidBreakGlassExpiryError);
              }

              const {
                reason: _requestContextReason,
                ...requestContextWithoutReason
              } = request.requestContext;

              return buildAuditEvent({
                requestContext: request.requestContext,
                moduleId: platformModuleId.supportOperations,
                action: supportOperationsAuditAction.breakGlassStarted,
                target: request.requestContext.tenant.scopeId,
                reason: request.reason,
              }).pipe(
                Effect.flatMap((auditEvent) =>
                  Schema.decodeUnknown(BreakGlassGrantSchema)({
                    grantedRequestContext: {
                      ...requestContextWithoutReason,
                      breakGlass: {
                        approvedBy: request.approvedBy,
                        reason: request.reason,
                        expiresAt: request.expiresAt,
                      },
                    },
                    expiresAt: request.expiresAt,
                    auditEvent,
                  }),
                ),
              );
            },
          ),
        ),
      validateEscalation: (requestContext) =>
        Schema.decodeUnknown(SupportEscalationDecisionSchema)(
          actorSupportsPrivilegedSupportEscalation(requestContext.actorType)
            ? {
                allowed: true,
                reason: "Actor class supports privileged support escalation.",
              }
            : {
                allowed: false,
                reason: "Actor class does not support support escalation.",
              },
        ),
    } satisfies SupportOperationsModuleService;
  });

export const SupportOperationsModuleLive = Layer.effect(
  SupportOperationsModule,
  makeSupportOperationsModule(),
);
