import { findModuleManifest } from "@comvestec/config";
import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  fieldSecurityAuditAction,
  permissionScope,
  platformModuleId,
  platformScope,
  type ProjectionDescriptor,
  projectionProfile,
  type RequestContext,
  retentionLegalHoldAuditAction,
  type RetentionLegalHoldComplianceView,
  RetentionLegalHoldComplianceViewListSchema,
  RetentionLegalHoldComplianceViewSchema,
  type RetentionPolicyAdminView,
  RetentionPolicyAdminViewListSchema,
  RetentionPolicyAdminViewSchema,
  RetentionPolicyListRequestSchema,
  RetentionLegalHoldListRequestSchema,
  type UpsertRetentionPolicyInput,
  UpsertRetentionPolicyInputSchema,
  PlaceRetentionLegalHoldInputSchema,
  ReleaseRetentionLegalHoldInputSchema,
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
  makeAuthorizationModule,
  makeFieldSecurityModule,
  type RetentionLegalHoldNotFoundError,
  type RetentionLegalHoldModuleError,
  RetentionLegalHoldModule,
} from "@comvestec/modules";
import {
  OryKetoAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import {
  makeSubscriberJourneyRuntime,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
} from "../domains/subscriber-journey";

export const RetentionLegalHoldSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type RetentionLegalHoldSessionLookup = Schema.Schema.Type<
  typeof RetentionLegalHoldSessionLookupSchema
>;

export const UpsertRetentionPolicyBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: UpsertRetentionPolicyInputSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  dataType: UpsertRetentionPolicyInputSchema.fields.dataType,
  retentionDays: UpsertRetentionPolicyInputSchema.fields.retentionDays,
});

export type UpsertRetentionPolicyBySessionRequest = Schema.Schema.Type<
  typeof UpsertRetentionPolicyBySessionRequestSchema
>;

export const ListRetentionPoliciesBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: RetentionPolicyListRequestSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
});

export type ListRetentionPoliciesBySessionRequest = Schema.Schema.Type<
  typeof ListRetentionPoliciesBySessionRequestSchema
>;

export const PlaceRetentionLegalHoldBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: PlaceRetentionLegalHoldInputSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  dataType: PlaceRetentionLegalHoldInputSchema.fields.dataType,
  targetId: PlaceRetentionLegalHoldInputSchema.fields.targetId,
  reason: PlaceRetentionLegalHoldInputSchema.fields.reason,
  evidence: PlaceRetentionLegalHoldInputSchema.fields.evidence,
});

export type PlaceRetentionLegalHoldBySessionRequest = Schema.Schema.Type<
  typeof PlaceRetentionLegalHoldBySessionRequestSchema
>;

export const ReleaseRetentionLegalHoldBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  legalHoldId: ReleaseRetentionLegalHoldInputSchema.fields.legalHoldId,
});

export type ReleaseRetentionLegalHoldBySessionRequest = Schema.Schema.Type<
  typeof ReleaseRetentionLegalHoldBySessionRequestSchema
>;

export const ListRetentionLegalHoldsBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: RetentionLegalHoldListRequestSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
});

export type ListRetentionLegalHoldsBySessionRequest = Schema.Schema.Type<
  typeof ListRetentionLegalHoldsBySessionRequestSchema
>;

export type RetentionLegalHoldUnauthenticatedActorError = {
  readonly _tag: "RetentionLegalHoldUnauthenticatedActorError";
};

export type RetentionLegalHoldAccessDeniedError = {
  readonly _tag: "RetentionLegalHoldAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type RetentionLegalHoldProjectionConfigurationError = {
  readonly _tag: "RetentionLegalHoldProjectionConfigurationError";
  readonly moduleId: typeof platformModuleId.retentionLegalHold;
  readonly profile:
    | typeof projectionProfile.admin
    | typeof projectionProfile.complianceReview;
};

export type RetentionLegalHoldInternalContractError = {
  readonly _tag: "RetentionLegalHoldInternalContractError";
  readonly operation:
    | "authorizationCheck"
    | "auditLogAppend"
    | "fieldSecurityProjectionHold"
    | "fieldSecurityProjectionPolicy"
    | "retentionLegalHoldComplianceView"
    | "retentionLegalHoldComplianceViewList"
    | "retentionModuleGetHold"
    | "retentionModuleListHolds"
    | "retentionModuleListPolicies"
    | "retentionModulePlaceHold"
    | "retentionModuleReleaseHold"
    | "retentionModuleUpsertPolicy"
    | "retentionPolicyAdminView"
    | "retentionPolicyAdminViewList";
  readonly cause: ParseResult.ParseError;
};

export type RetentionLegalHoldServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | IdentitySessionRequestContextNotFoundError
  | RetentionLegalHoldAccessDeniedError
  | RetentionLegalHoldInternalContractError
  | RetentionLegalHoldModuleError
  | RetentionLegalHoldProjectionConfigurationError
  | RetentionLegalHoldUnauthenticatedActorError
  | ValkeyAdapterOperationError;

export type RetentionLegalHoldRuntimeError = {
  readonly _tag: "RetentionLegalHoldRuntimeError";
  readonly cause: unknown;
};

export type RetentionLegalHoldServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
};

export type RetentionLegalHoldService = {
  readonly resolveRequestContext: (
    input: RetentionLegalHoldSessionLookup,
  ) => Effect.Effect<
    RequestContext,
    | ParseResult.ParseError
    | IdentitySessionRequestContextNotFoundError
    | ValkeyAdapterOperationError
  >;
  readonly upsertRetentionPolicy: (
    input: UpsertRetentionPolicyBySessionRequest,
  ) => Effect.Effect<RetentionPolicyAdminView, RetentionLegalHoldServiceError>;
  readonly listRetentionPolicies: (
    input: ListRetentionPoliciesBySessionRequest,
  ) => Effect.Effect<
    readonly RetentionPolicyAdminView[],
    RetentionLegalHoldServiceError
  >;
  readonly placeRetentionLegalHold: (
    input: PlaceRetentionLegalHoldBySessionRequest,
  ) => Effect.Effect<
    RetentionLegalHoldComplianceView,
    RetentionLegalHoldServiceError
  >;
  readonly releaseRetentionLegalHold: (
    input: ReleaseRetentionLegalHoldBySessionRequest,
  ) => Effect.Effect<
    RetentionLegalHoldComplianceView,
    RetentionLegalHoldServiceError
  >;
  readonly listRetentionLegalHolds: (
    input: ListRetentionLegalHoldsBySessionRequest,
  ) => Effect.Effect<
    readonly RetentionLegalHoldComplianceView[],
    RetentionLegalHoldServiceError
  >;
};

type AuthenticatedRetentionOperatorContext = RequestContext & {
  readonly actorId: string;
};

type RetentionTarget = Pick<UpsertRetentionPolicyInput, "scope" | "scopeId">;

const createInternalContractError =
  (operation: RetentionLegalHoldInternalContractError["operation"]) =>
  (cause: ParseResult.ParseError): RetentionLegalHoldInternalContractError => ({
    _tag: "RetentionLegalHoldInternalContractError",
    operation,
    cause,
  });

const normalizeAuthorizationCheckError = (
  error: ParseResult.ParseError | AuthorizationDelegatedCheckError,
):
  | AuthorizationDelegatedCheckError
  | RetentionLegalHoldInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("authorizationCheck")(error)
    : error;

const normalizeAuditLogError = (
  error: AuditLogModuleError,
): AuditLogModuleError | RetentionLegalHoldInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("auditLogAppend")(error)
    : error;

const normalizeRetentionModuleError =
  (
    operation:
      | "retentionModuleGetHold"
      | "retentionModuleListHolds"
      | "retentionModuleListPolicies"
      | "retentionModulePlaceHold"
      | "retentionModuleReleaseHold"
      | "retentionModuleUpsertPolicy",
  ) =>
  (
    error: RetentionLegalHoldModuleError,
  ): RetentionLegalHoldModuleError | RetentionLegalHoldInternalContractError =>
    error._tag === "ParseError"
      ? createInternalContractError(operation)(error)
      : error;

const ensureRetentionOperatorAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedRetentionOperatorContext,
  | RetentionLegalHoldUnauthenticatedActorError
  | RetentionLegalHoldAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): RetentionLegalHoldUnauthenticatedActorError => ({
        _tag: "RetentionLegalHoldUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "RetentionLegalHoldAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies RetentionLegalHoldAccessDeniedError),
    ),
  );

const requestTargetsCurrentTenant = (
  requestContext: RequestContext,
  target: RetentionTarget,
) =>
  requestContext.tenant.scope === target.scope &&
  requestContext.tenant.scopeId === target.scopeId;

const buildTargetTenantContext = (
  target: RetentionTarget,
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

const authorizeRetentionOperatorAccess = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: RequestContext;
  readonly target: RetentionTarget;
}) =>
  Effect.gen(function* () {
    const authenticatedRequestContext = yield* ensureRetentionOperatorAccess(
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
            _tag: "RetentionLegalHoldAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies RetentionLegalHoldAccessDeniedError);
    const decision = yield* input.authorization
      .check({
        requestContext: authorizationRequestContext,
        namespace: authorizationNamespace.module,
        object: platformModuleId.retentionLegalHold,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.retentionManage,
      })
      .pipe(Effect.mapError(normalizeAuthorizationCheckError));

    return decision.allowed
      ? authorizationRequestContext
      : yield* Effect.fail({
          _tag: "RetentionLegalHoldAccessDeniedError",
          actorType: authenticatedRequestContext.actorType,
        } satisfies RetentionLegalHoldAccessDeniedError);
  });

const resolveRetentionProjection = (
  profile:
    | typeof projectionProfile.admin
    | typeof projectionProfile.complianceReview,
) =>
  Effect.fromNullable(
    findModuleManifest(
      platformModuleId.retentionLegalHold,
    )?.projectionProfiles.find((projection) => projection.profile === profile),
  ).pipe(
    Effect.orElseFail(
      (): RetentionLegalHoldProjectionConfigurationError => ({
        _tag: "RetentionLegalHoldProjectionConfigurationError",
        moduleId: platformModuleId.retentionLegalHold,
        profile,
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
        .pipe(Effect.mapError(normalizeAuditLogError), Effect.asVoid);

const appendRetentionMutationAudit = (
  auditLog: Pick<AuditLogModuleService, "append">,
  input: {
    readonly requestContext: RequestContext;
    readonly action:
      | typeof retentionLegalHoldAuditAction.policyUpserted
      | typeof retentionLegalHoldAuditAction.holdPlaced
      | typeof retentionLegalHoldAuditAction.holdReleased;
    readonly target: string;
    readonly reason: string;
  },
) =>
  auditLog
    .append({
      requestContext: input.requestContext,
      moduleId: platformModuleId.retentionLegalHold,
      action: input.action,
      target: input.target,
      reason: input.reason,
    })
    .pipe(Effect.mapError(normalizeAuditLogError), Effect.asVoid);

const applyProjectedPolicyAdminRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: RetentionPolicyAdminView;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.retentionLegalHold,
      requestContext: input.requestContext,
      projection: input.projection,
      record: input.record,
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityProjectionPolicy"),
      ),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(RetentionPolicyAdminViewSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(
            createInternalContractError("retentionPolicyAdminView"),
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

const applyProjectedLegalHoldComplianceRecord = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly record: RetentionLegalHoldComplianceView;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.retentionLegalHold,
      requestContext: input.requestContext,
      projection: input.projection,
      record: input.record,
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityProjectionHold"),
      ),
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return Schema.decodeUnknown(RetentionLegalHoldComplianceViewSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(
            createInternalContractError("retentionLegalHoldComplianceView"),
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

const buildRetentionLegalHoldService = (
  authorization: Pick<AuthorizationModuleService, "check">,
) =>
  Effect.gen(function* () {
    const adminProjection = yield* resolveRetentionProjection(
      projectionProfile.admin,
    );
    const complianceProjection = yield* resolveRetentionProjection(
      projectionProfile.complianceReview,
    );
    const auditLog = yield* AuditLogModule;
    const fieldSecurity = yield* makeFieldSecurityModule();
    const identitySession = yield* IdentitySessionModule;
    const retentionLegalHold = yield* RetentionLegalHoldModule;

    return {
      resolveRequestContext: (input: RetentionLegalHoldSessionLookup) =>
        Schema.decodeUnknown(RetentionLegalHoldSessionLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            identitySession.resolveRequestContext({
              sessionId: request.sessionId,
            }),
          ),
        ),
      upsertRetentionPolicy: (input: UpsertRetentionPolicyBySessionRequest) =>
        Schema.decodeUnknown(UpsertRetentionPolicyBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeRetentionOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const record = yield* retentionLegalHold
                .upsertRetentionPolicy({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  dataType: request.dataType,
                  retentionDays: request.retentionDays,
                  changedBy: authorizedRequestContext.actorId,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRetentionModuleError(
                      "retentionModuleUpsertPolicy",
                    ),
                  ),
                );

              yield* appendRetentionMutationAudit(auditLog, {
                requestContext: authorizedRequestContext,
                action: retentionLegalHoldAuditAction.policyUpserted,
                target: `${platformModuleId.retentionLegalHold}:${record.policyId}:policy`,
                reason:
                  "Operator upserted a retention policy through the admin governance surface.",
              });

              const projectedRecord = yield* applyProjectedPolicyAdminRecord({
                fieldSecurity,
                requestContext: authorizedRequestContext,
                projection: adminProjection,
                record,
              });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.retentionLegalHold}:${record.policyId}:policy:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator read a retention policy through the admin governance surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      listRetentionPolicies: (input: ListRetentionPoliciesBySessionRequest) =>
        Schema.decodeUnknown(ListRetentionPoliciesBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeRetentionOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const records = yield* retentionLegalHold
                .listRetentionPolicies({
                  scope: request.scope,
                  scopeId: request.scopeId,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRetentionModuleError(
                      "retentionModuleListPolicies",
                    ),
                  ),
                );
              const projectedRecords = yield* Effect.forEach(
                records,
                (record) =>
                  applyProjectedPolicyAdminRecord({
                    fieldSecurity,
                    requestContext: authorizedRequestContext,
                    projection: adminProjection,
                    record,
                  }),
              );
              const auditedFields = collectAuditedFields(projectedRecords);

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.retentionLegalHold}:${request.scope}:${request.scopeId}:policies:${auditedFields.join(",")}`,
                reason:
                  "Operator read retention policies through the admin governance surface.",
                auditedFields,
              });

              return yield* Schema.decodeUnknown(
                RetentionPolicyAdminViewListSchema,
              )(projectedRecords.map((record) => record.record)).pipe(
                Effect.mapError(
                  createInternalContractError("retentionPolicyAdminViewList"),
                ),
              );
            }),
          ),
        ),
      placeRetentionLegalHold: (
        input: PlaceRetentionLegalHoldBySessionRequest,
      ) =>
        Schema.decodeUnknown(PlaceRetentionLegalHoldBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeRetentionOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const record = yield* retentionLegalHold
                .placeRetentionLegalHold({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  dataType: request.dataType,
                  targetId: request.targetId,
                  reason: request.reason,
                  evidence: request.evidence,
                  placedBy: authorizedRequestContext.actorId,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRetentionModuleError("retentionModulePlaceHold"),
                  ),
                );

              yield* appendRetentionMutationAudit(auditLog, {
                requestContext: authorizedRequestContext,
                action: retentionLegalHoldAuditAction.holdPlaced,
                target: `${platformModuleId.retentionLegalHold}:${record.legalHoldId}:hold`,
                reason:
                  "Operator placed a legal hold through the admin governance surface.",
              });

              const projectedRecord =
                yield* applyProjectedLegalHoldComplianceRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: complianceProjection,
                  record,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.retentionLegalHold}:${record.legalHoldId}:hold:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator read a legal hold through the admin governance surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      releaseRetentionLegalHold: (
        input: ReleaseRetentionLegalHoldBySessionRequest,
      ) =>
        Schema.decodeUnknown(ReleaseRetentionLegalHoldBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authenticatedRequestContext =
                yield* ensureRetentionOperatorAccess(requestContext);
              const sameTenantAuthorizedRequestContext =
                hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
                  ? undefined
                  : yield* authorizeRetentionOperatorAccess({
                      authorization,
                      requestContext: authenticatedRequestContext,
                      target: {
                        scope: authenticatedRequestContext.tenant.scope,
                        scopeId: authenticatedRequestContext.tenant.scopeId,
                      },
                    });
              const legalHoldRecord = yield* retentionLegalHold
                .getRetentionLegalHoldRecord(request.legalHoldId)
                .pipe(
                  Effect.mapError(
                    normalizeRetentionModuleError("retentionModuleGetHold"),
                  ),
                );

              if (
                !requestTargetsCurrentTenant(authenticatedRequestContext, {
                  scope: legalHoldRecord.scope,
                  scopeId: legalHoldRecord.scopeId,
                }) &&
                !hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
              ) {
                return yield* Effect.fail({
                  _tag: "RetentionLegalHoldNotFoundError",
                  legalHoldId: request.legalHoldId,
                } satisfies RetentionLegalHoldNotFoundError);
              }

              const authorizeReleaseTarget = () =>
                authorizeRetentionOperatorAccess({
                  authorization,
                  requestContext: authenticatedRequestContext,
                  target: {
                    scope: legalHoldRecord.scope,
                    scopeId: legalHoldRecord.scopeId,
                  },
                }).pipe(
                  Effect.catchTag("RetentionLegalHoldAccessDeniedError", () =>
                    Effect.fail({
                      _tag: "RetentionLegalHoldNotFoundError",
                      legalHoldId: request.legalHoldId,
                    } satisfies RetentionLegalHoldNotFoundError),
                  ),
                );

              const authorizedRequestContext = requestTargetsCurrentTenant(
                authenticatedRequestContext,
                {
                  scope: legalHoldRecord.scope,
                  scopeId: legalHoldRecord.scopeId,
                },
              )
                ? (sameTenantAuthorizedRequestContext ??
                  (yield* authorizeReleaseTarget()))
                : yield* authorizeReleaseTarget();
              const record = yield* retentionLegalHold
                .releaseRetentionLegalHold({
                  legalHoldId: request.legalHoldId,
                  releasedBy: authorizedRequestContext.actorId,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRetentionModuleError("retentionModuleReleaseHold"),
                  ),
                );

              yield* appendRetentionMutationAudit(auditLog, {
                requestContext: authorizedRequestContext,
                action: retentionLegalHoldAuditAction.holdReleased,
                target: `${platformModuleId.retentionLegalHold}:${record.legalHoldId}:hold`,
                reason:
                  "Operator released a legal hold through the admin governance surface.",
              });

              const projectedRecord =
                yield* applyProjectedLegalHoldComplianceRecord({
                  fieldSecurity,
                  requestContext: authorizedRequestContext,
                  projection: complianceProjection,
                  record,
                });

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.retentionLegalHold}:${record.legalHoldId}:hold:${projectedRecord.auditedFields.join(",")}`,
                reason:
                  "Operator read a released legal hold through the admin governance surface.",
                auditedFields: projectedRecord.auditedFields,
              });

              return projectedRecord.record;
            }),
          ),
        ),
      listRetentionLegalHolds: (
        input: ListRetentionLegalHoldsBySessionRequest,
      ) =>
        Schema.decodeUnknown(ListRetentionLegalHoldsBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({ sessionId: request.sessionId })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeRetentionOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const records = yield* retentionLegalHold
                .listRetentionLegalHolds({
                  scope: request.scope,
                  scopeId: request.scopeId,
                })
                .pipe(
                  Effect.mapError(
                    normalizeRetentionModuleError("retentionModuleListHolds"),
                  ),
                );
              const projectedRecords = yield* Effect.forEach(
                records,
                (record) =>
                  applyProjectedLegalHoldComplianceRecord({
                    fieldSecurity,
                    requestContext: authorizedRequestContext,
                    projection: complianceProjection,
                    record,
                  }),
              );
              const auditedFields = collectAuditedFields(projectedRecords);

              yield* appendSensitiveReadAudit(auditLog, {
                requestContext: authorizedRequestContext,
                target: `${platformModuleId.retentionLegalHold}:${request.scope}:${request.scopeId}:holds:${auditedFields.join(",")}`,
                reason:
                  "Operator read legal holds through the admin governance surface.",
                auditedFields,
              });

              return yield* Schema.decodeUnknown(
                RetentionLegalHoldComplianceViewListSchema,
              )(projectedRecords.map((record) => record.record)).pipe(
                Effect.mapError(
                  createInternalContractError(
                    "retentionLegalHoldComplianceViewList",
                  ),
                ),
              );
            }),
          ),
        ),
    } satisfies RetentionLegalHoldService;
  });

const makeLiveRetentionAuthorization = Effect.gen(function* () {
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

export const makeRetentionLegalHoldServiceWithAuthorization = (
  authorization: Pick<AuthorizationModuleService, "check">,
) => buildRetentionLegalHoldService(authorization);

export const makeRetentionLegalHoldService = (
  options: RetentionLegalHoldServiceOptions = {},
) => {
  return options.authorization === undefined
    ? makeLiveRetentionAuthorization.pipe(
        Effect.flatMap((authorization) =>
          makeRetentionLegalHoldServiceWithAuthorization(authorization),
        ),
      )
    : makeRetentionLegalHoldServiceWithAuthorization(options.authorization);
};

const runRetentionLegalHoldWithResolvedOptions = <A, E>(
  environment: unknown,
  use: (service: RetentionLegalHoldService) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.mapError(
      (cause): RetentionLegalHoldRuntimeError => ({
        _tag: "RetentionLegalHoldRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap((resolvedOptions) =>
      makeSubscriberJourneyRuntime(resolvedOptions).pipe(
        Effect.mapError(
          (cause): RetentionLegalHoldRuntimeError => ({
            _tag: "RetentionLegalHoldRuntimeError",
            cause,
          }),
        ),
        Effect.flatMap((runtime) =>
          makeRetentionLegalHoldService().pipe(
            Effect.provideService(AuditLogModule, runtime.auditLog),
            Effect.provideService(
              IdentitySessionModule,
              runtime.identitySession,
            ),
            Effect.provideService(OryKetoAdapter, runtime.oryKeto),
            Effect.provideService(
              RetentionLegalHoldModule,
              runtime.retentionLegalHold,
            ),
            Effect.flatMap((service) =>
              use(service).pipe(Effect.ensuring(Effect.ignore(runtime.close))),
            ),
          ),
        ),
      ),
    ),
  );

export const runRetentionLegalHoldFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: RetentionLegalHoldService) => Effect.Effect<A, E>,
) => runRetentionLegalHoldWithResolvedOptions(environment, use);
