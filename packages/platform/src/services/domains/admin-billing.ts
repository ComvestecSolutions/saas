import { and, desc, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import {
  findModuleManifest,
  workflowJobsRunningClaimTimeoutSeconds,
} from "@comvestec/config";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  billingSubscriptionStatus,
  billingAndMeteringAuditAction,
  identityClaimKey,
  type BillingRepairGapReplayRequest,
  BillingRepairGapReplayRequestSchema,
  type BillingRepairGapReplayResult,
  type BillingReconciliationManualRunRequest,
  BillingReconciliationManualRunRequestSchema,
  type BillingReconciliationManualRunResult,
  BillingRepairGapSchema,
  type BillingRepairGapListRequest,
  BillingRepairGapListRequestSchema,
  type BillingRepairGapListResult,
  type BillingPlanCreateRequest,
  BillingPlanCreateRequestSchema,
  type BillingPlanCreateResult,
  fieldSecurityAuditAction,
  permissionScope,
  platformModuleId,
  projectionProfile,
  PlatformScopeSchema,
  type PlatformScope,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  platformScope,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogPostgresQueryable,
  billingCustomerAccountsTable,
  type BillingReconciliationWorkflowJobRecord,
  BillingReconciliationWorkflowJobRecordSchema,
  billingSubscriptionsTable,
  buildBillingReconciliationWorkflowJobId,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  type AuthorizationDelegatedCheckError,
  type AuthorizationModuleService,
  makeFieldSecurityModule,
  makeAuthorizationModule,
  type IdentitySessionModuleError,
  IdentitySessionModule,
  IdentitySessionPostgresRepository,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeTenantManagementModule,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  TenantManagementModule,
  tenantOnboardingRunsTable,
  tenantOnboardingRunStatus,
  TenantOnboardingPostgresRepository,
  tenantProvisioningReceiptsTable,
  tenantProvisioningStatus,
  TenantProvisioningPostgresRepository,
  makeWorkflowJobsPostgresRepository,
  type WorkflowJobsPostgresQueryable,
  WorkflowJobsPostgresRepository,
  type WorkflowJobsPostgresRepositoryError,
  workflowJobRuntime,
  workflowJobsTable,
} from "@comvestec/modules";
import {
  makeAuthenticatedConvexWorkflowClient,
  type AuthenticatedConvexWorkflowClient,
  type ConvexAdapterRequestError,
  type ConvexWorkflowExecutionError,
  KeycloakAdapter,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  OryKetoAdapter,
  PolarAdapter,
  type PolarManagedBillingPlanError,
  type PostgresAdapterConnectionError,
  ValkeyAdapter,
} from "../../adapters";
import { createOryKetoAuthorizationDelegatedCheck } from "../access";
import { buildWriteDatabase } from "../postgres-write-database";

export const AdminBillingRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  convexUrl: Schema.NonEmptyString,
  convexSiteUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
  polarAccessToken: Schema.NonEmptyString,
  polarApiUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
});

export type AdminBillingRuntimeOptions = Schema.Schema.Type<
  typeof AdminBillingRuntimeOptionsSchema
>;

const AdminBillingProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_SITE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

export type ManagedBillingPlanAccessDeniedError = {
  readonly _tag: "ManagedBillingPlanAccessDeniedError";
  readonly reason: string;
  readonly auditRequired: boolean;
};

export type AdminBillingProjectionConfigurationError = {
  readonly _tag: "AdminBillingProjectionConfigurationError";
  readonly moduleId: typeof platformModuleId.workflowJobs;
  readonly profile: typeof projectionProfile.admin;
  readonly reason: string;
};

export type AdminBillingWorkflowExecutionUnavailableError = {
  readonly _tag: "AdminBillingWorkflowExecutionUnavailableError";
  readonly reason: string;
};

export type AdminBillingWorkflowExecutionIdentityMismatchError = {
  readonly _tag: "AdminBillingWorkflowExecutionIdentityMismatchError";
  readonly reason: string;
};

export type AdminBillingWorkflowBootstrapError = {
  readonly _tag: "AdminBillingWorkflowBootstrapError";
  readonly operation:
    | "listActiveSubscriptionCandidates"
    | "listCustomerAccounts"
    | "listProvisioningReceipts"
    | "listOnboardingRuns";
  readonly cause: unknown;
};

export type AdminBillingRepairGapNotFoundError = {
  readonly _tag: "AdminBillingRepairGapNotFoundError";
  readonly jobId: string;
};

export type AdminBillingRepairGapReplayUnavailableError = {
  readonly _tag: "AdminBillingRepairGapReplayUnavailableError";
  readonly jobId: string;
  readonly status: string;
  readonly reason: string;
};

export type AdminBillingServiceError =
  | AdminBillingProjectionConfigurationError
  | AdminBillingWorkflowExecutionUnavailableError
  | AdminBillingWorkflowExecutionIdentityMismatchError
  | AdminBillingWorkflowBootstrapError
  | AdminBillingRepairGapNotFoundError
  | AdminBillingRepairGapReplayUnavailableError
  | AuthorizationDelegatedCheckError
  | ParseResult.ParseError
  | AuditLogModuleError
  | IdentitySessionModuleError
  | WorkflowJobsPostgresRepositoryError
  | PolarManagedBillingPlanError
  | ConvexWorkflowExecutionError
  | ManagedBillingPlanAccessDeniedError;

export type AdminBillingRuntimeError =
  | AdminBillingServiceError
  | PostgresAdapterConnectionError;

export type AdminBillingService = {
  readonly createManagedBillingPlan: (
    input: BillingPlanCreateRequest,
  ) => Effect.Effect<BillingPlanCreateResult, AdminBillingServiceError>;
  readonly listBillingRepairGaps: (
    input: BillingRepairGapListRequest,
  ) => Effect.Effect<BillingRepairGapListResult, AdminBillingServiceError>;
  readonly replayBillingRepairGap: (
    input: BillingRepairGapReplayRequest,
  ) => Effect.Effect<BillingRepairGapReplayResult, AdminBillingServiceError>;
  readonly runManualBillingReconciliation: (
    input: BillingReconciliationManualRunRequest,
  ) => Effect.Effect<
    BillingReconciliationManualRunResult,
    AdminBillingServiceError
  >;
};

const decodeAdminBillingProcessEnvironment = Schema.decodeUnknown(
  AdminBillingProcessEnvironmentSchema,
);

const decodeAdminBillingRuntimeOptions = Schema.decodeUnknown(
  AdminBillingRuntimeOptionsSchema,
);

const ConvexWorkflowBearerTokenClaimsSchema = Schema.Struct({
  sub: Schema.NonEmptyString,
  [identityClaimKey.actorType]: Schema.Literal(actorType.platformOperator),
});

type ConvexWorkflowBearerTokenClaims = Schema.Schema.Type<
  typeof ConvexWorkflowBearerTokenClaimsSchema
>;

const decodeConvexWorkflowBearerTokenClaims = Schema.decodeUnknown(
  ConvexWorkflowBearerTokenClaimsSchema,
);

const decodePlatformScope = Schema.decodeUnknown(PlatformScopeSchema);

const decodeBearerTokenPayload = (token: string) => {
  const encodedPayload = token.split(".")[1];

  return encodedPayload === undefined || encodedPayload.length === 0
    ? Effect.fail("The Convex bearer token payload segment is missing.")
    : Effect.try({
        try: () =>
          JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
        catch: (cause) => cause,
      }).pipe(
        Effect.flatMap((payload) =>
          decodeConvexWorkflowBearerTokenClaims(payload),
        ),
      );
};

const validateWorkflowExecutionIdentity = (input: {
  readonly requestContext: RequestContext;
  readonly convexAuthToken: string;
}) =>
  decodeBearerTokenPayload(input.convexAuthToken).pipe(
    Effect.mapError(
      () =>
        ({
          _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
          reason:
            "Authenticated billing workflow execution requires a platform-operator Keycloak identity token.",
        }) satisfies AdminBillingWorkflowExecutionIdentityMismatchError,
    ),
    Effect.flatMap((tokenClaims) => {
      if (input.requestContext.actorId === undefined) {
        return Effect.fail({
          _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
          reason:
            "Authenticated billing workflow execution requires the operator session to have a stable actor id.",
        } satisfies AdminBillingWorkflowExecutionIdentityMismatchError);
      }

      return input.requestContext.actorId === tokenClaims.sub
        ? Effect.succeed(tokenClaims)
        : Effect.fail({
            _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
            reason:
              "The Convex bearer token subject must match the authenticated platform-operator session actor.",
          } satisfies AdminBillingWorkflowExecutionIdentityMismatchError);
    }),
  );

const subtractSecondsFromDate = (value: Date, seconds: number) =>
  new Date(value.getTime() - seconds * 1_000);

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
  readonly job: BillingReconciliationWorkflowJobRecord;
  readonly now: string;
}) => {
  if (input.job.sourceModuleId !== platformModuleId.billingAndMetering) {
    return false;
  }

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

const shouldRestoreReplayGapJob = (
  error: ConvexWorkflowExecutionError,
): error is ConvexAdapterRequestError =>
  error._tag === "ConvexAdapterRequestError" &&
  (error.status === 401 || error.status === 403);

const buildRepairGapProjectionRecord = (
  job: BillingReconciliationWorkflowJobRecord,
) =>
  ({
    jobId: job.jobId,
    tenantScope: job.tenantScope,
    tenantScopeId: job.tenantScopeId,
    status: job.status,
    attempts: job.attempts,
    scheduledAt: job.scheduledAt,
    ...(job.completedAt !== undefined ? { completedAt: job.completedAt } : {}),
    ...(job.gapReason !== undefined ? { gapReason: job.gapReason } : {}),
    ...(job.lastError !== undefined ? { lastError: job.lastError } : {}),
  }) satisfies Record<string, unknown>;

const denyAdminBillingAccess = (input: {
  readonly reason: string;
  readonly auditRequired: boolean;
}) =>
  Effect.fail({
    _tag: "ManagedBillingPlanAccessDeniedError",
    reason: input.reason,
    auditRequired: input.auditRequired,
  } satisfies ManagedBillingPlanAccessDeniedError);

const validatePlatformOperatorContext = (input: {
  readonly requestContext: RequestContext;
}) =>
  input.requestContext.actorType === actorType.platformOperator &&
  input.requestContext.tenant.scope === platformScope.platform &&
  input.requestContext.tenant.scopeId === platformScope.platform
    ? Effect.void
    : denyAdminBillingAccess({
        reason:
          "Admin billing operations require a platform-operator session scoped to the platform tenant.",
        auditRequired: false,
      });

const resolveAdminBillingAuthorizationRelation = (input: {
  readonly permission:
    | typeof permissionScope.billingWrite
    | typeof permissionScope.billingRead;
}) =>
  input.permission === permissionScope.billingRead
    ? authorizationRelation.viewer
    : authorizationRelation.admin;

type AdminBillingAuthorizationModuleFactory = typeof makeAuthorizationModule;

type AdminBillingManualReconciliationBootstrapInput = {
  readonly now: string;
};

type AdminBillingManualReconciliationBootstrapper = (
  input: AdminBillingManualReconciliationBootstrapInput,
) => Effect.Effect<
  void,
  | AdminBillingWorkflowBootstrapError
  | ParseResult.ParseError
  | WorkflowJobsPostgresRepositoryError
>;

type AdminBillingServiceOptions = {
  readonly authorizationModuleFactory?: AdminBillingAuthorizationModuleFactory;
  readonly workflowExecutionClient?: AuthenticatedConvexWorkflowClient;
  readonly manualReconciliationBootstrapper?: AdminBillingManualReconciliationBootstrapper;
};

const buildAdminBillingManualReconciliationCorrelationId = (jobId: string) =>
  ["admin-billing", "manual-reconciliation", jobId].join(":");

const toPlatformScope = (
  scope: string,
): Effect.Effect<PlatformScope, ParseResult.ParseError> =>
  decodePlatformScope(scope);

const authorizeAdminBillingAccess = (input: {
  readonly authorization: AuthorizationModuleService;
  readonly requestContext: RequestContext;
  readonly permission:
    | typeof permissionScope.billingWrite
    | typeof permissionScope.billingRead;
}) =>
  Effect.gen(function* () {
    yield* validatePlatformOperatorContext({
      requestContext: input.requestContext,
    });

    const decision = yield* input.authorization.check({
      requestContext: input.requestContext,
      namespace: authorizationNamespace.billingEntitlement,
      object: platformScope.platform,
      relation: resolveAdminBillingAuthorizationRelation({
        permission: input.permission,
      }),
      permissionScope: input.permission,
    });

    return decision.allowed
      ? decision
      : yield* denyAdminBillingAccess({
          reason: decision.reason,
          auditRequired: decision.auditRequired,
        });
  });

const authorizeWorkflowJobAccess = (input: {
  readonly authorization: AuthorizationModuleService;
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
      : yield* denyAdminBillingAccess({
          reason: decision.reason,
          auditRequired: decision.auditRequired,
        });
  });

export const makeAdminBillingService = (
  options: AdminBillingServiceOptions = {},
) =>
  Effect.gen(function* () {
    const authorizationModuleFactory =
      options.authorizationModuleFactory ?? makeAuthorizationModule;
    const workflowExecutionClient = options.workflowExecutionClient;
    const manualReconciliationBootstrapper =
      options.manualReconciliationBootstrapper;
    const auditLog = yield* AuditLogModule;
    const identitySession = yield* IdentitySessionModule;
    const fieldSecurity = yield* makeFieldSecurityModule();
    const oryKeto = yield* OryKetoAdapter;
    const polar = yield* PolarAdapter;
    const workflowJobs = yield* WorkflowJobsPostgresRepository;
    const authorization = yield* authorizationModuleFactory({
      tuples: [],
      cacheTtlSeconds: 60,
      maxCacheSize: 128,
      delegatedCheck: createOryKetoAuthorizationDelegatedCheck(oryKeto),
    });
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
            _tag: "AdminBillingProjectionConfigurationError",
            moduleId: platformModuleId.workflowJobs,
            profile: projectionProfile.admin,
            reason:
              "The workflow-jobs admin projection must be declared before repair-gap inspection can run.",
          }) satisfies AdminBillingProjectionConfigurationError,
      ),
    );

    const projectRepairGap = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly requestContext: RequestContext;
    }) =>
      fieldSecurity
        .applyProjection({
          moduleId: platformModuleId.workflowJobs,
          requestContext: input.requestContext,
          projection: workflowJobsAdminProjection,
          record: buildRepairGapProjectionRecord(input.job),
        })
        .pipe(
          Effect.flatMap((result) =>
            Schema.decodeUnknown(BillingRepairGapSchema)(
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

    return {
      createManagedBillingPlan: (input: BillingPlanCreateRequest) =>
        Schema.decodeUnknown(BillingPlanCreateRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });

              yield* authorizeAdminBillingAccess({
                authorization,
                requestContext,
                permission: permissionScope.billingWrite,
              });

              return yield* polar.createManagedBillingPlan(request.plan);
            }),
          ),
        ),
      listBillingRepairGaps: (input: BillingRepairGapListRequest) =>
        Schema.decodeUnknown(BillingRepairGapListRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });

              yield* authorizeWorkflowJobAccess({
                authorization,
                requestContext,
              });

              const jobs = yield* workflowJobs.listRepairGapWorkflowJobs({
                sourceModuleId: platformModuleId.billingAndMetering,
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
                )
              ) {
                yield* auditLog.append({
                  requestContext,
                  moduleId: platformModuleId.fieldSecurity,
                  action: fieldSecurityAuditAction.sensitiveRead,
                  target: `${platformModuleId.workflowJobs}:repair-gaps:lastError`,
                  reason:
                    "Inspect unresolved workflow repair gaps with failure details.",
                });
              }

              return {
                jobs: projectedJobsWithAudit.map(
                  (projectedJob) => projectedJob.job,
                ),
              } satisfies BillingRepairGapListResult;
            }),
          ),
        ),
      replayBillingRepairGap: (
        input: BillingRepairGapReplayRequest,
      ): Effect.Effect<
        BillingRepairGapReplayResult,
        AdminBillingServiceError
      > =>
        Schema.decodeUnknown(BillingRepairGapReplayRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });

              yield* authorizeWorkflowJobAccess({
                authorization,
                requestContext,
              });

              yield* validateWorkflowExecutionIdentity({
                requestContext,
                convexAuthToken: request.convexAuthToken,
              });

              const workflowClient = yield* Effect.fromNullable(
                workflowExecutionClient,
              ).pipe(
                Effect.orElseFail(
                  () =>
                    ({
                      _tag: "AdminBillingWorkflowExecutionUnavailableError",
                      reason:
                        "The authenticated Convex workflow client is not configured for admin billing workflow execution.",
                    }) satisfies AdminBillingWorkflowExecutionUnavailableError,
                ),
              );

              const now = new Date().toISOString();
              const existingJob = yield* workflowJobs
                .getWorkflowJob({
                  jobId: request.jobId,
                })
                .pipe(
                  Effect.flatMap((job) =>
                    job === undefined ||
                    job.sourceModuleId !== platformModuleId.billingAndMetering
                      ? Effect.fail({
                          _tag: "AdminBillingRepairGapNotFoundError",
                          jobId: request.jobId,
                        } satisfies AdminBillingRepairGapNotFoundError)
                      : Effect.succeed(job),
                  ),
                );

              if (!canReplayRepairGapWorkflowJob({ job: existingJob, now })) {
                return yield* Effect.fail({
                  _tag: "AdminBillingRepairGapReplayUnavailableError",
                  jobId: request.jobId,
                  status: existingJob.status,
                  reason:
                    "Only unresolved scheduled, blocked, or stale running billing repair gaps can be replayed.",
                } satisfies AdminBillingRepairGapReplayUnavailableError);
              }

              yield* auditLog.append({
                requestContext,
                moduleId: platformModuleId.billingAndMetering,
                action: billingAndMeteringAuditAction.reconciliationTriggered,
                target: `${platformModuleId.workflowJobs}:${request.jobId}:repair-gap-replay`,
                reason:
                  "Replay an unresolved billing repair gap from the admin backend.",
              });

              yield* workflowJobs.persistWorkflowJob({
                ...existingJob,
                status: workflowJobStatus.scheduled,
                scheduledAt: now,
                updatedAt: now,
              });

              const runReplayExecution: Effect.Effect<
                null,
                | WorkflowJobsPostgresRepositoryError
                | ConvexWorkflowExecutionError
              > = workflowClient
                .runBillingConvergenceJob(
                  {
                    jobId: request.jobId,
                  },
                  {
                    authToken: request.convexAuthToken,
                  },
                )
                .pipe(
                  Effect.catchAll(
                    (
                      error,
                    ): Effect.Effect<
                      never,
                      | WorkflowJobsPostgresRepositoryError
                      | ConvexWorkflowExecutionError
                    > =>
                      shouldRestoreReplayGapJob(error)
                        ? workflowJobs
                            .restoreWorkflowJobIfUpdatedAtMatches({
                              jobId: existingJob.jobId,
                              expectedUpdatedAt: now,
                              record: existingJob,
                            })
                            .pipe(
                              Effect.zipRight(
                                Effect.fail<ConvexWorkflowExecutionError>(
                                  error,
                                ),
                              ),
                            )
                        : Effect.fail<ConvexWorkflowExecutionError>(error),
                  ),
                );

              yield* runReplayExecution;

              const replayedJob = yield* workflowJobs
                .getWorkflowJob({
                  jobId: request.jobId,
                })
                .pipe(
                  Effect.flatMap((job) =>
                    job === undefined
                      ? Effect.fail({
                          _tag: "AdminBillingRepairGapNotFoundError",
                          jobId: request.jobId,
                        } satisfies AdminBillingRepairGapNotFoundError)
                      : Effect.succeed(job),
                  ),
                );

              const projectedJob = yield* projectRepairGap({
                job: replayedJob,
                requestContext,
              });

              if (projectedJob.auditedFields.length > 0) {
                yield* auditLog.append({
                  requestContext,
                  moduleId: platformModuleId.fieldSecurity,
                  action: fieldSecurityAuditAction.sensitiveRead,
                  target: `${platformModuleId.workflowJobs}:repair-gap:${request.jobId}:lastError`,
                  reason:
                    "Inspect replayed workflow repair gap with failure details.",
                });
              }

              return {
                job: projectedJob.job,
              } satisfies BillingRepairGapReplayResult;
            }),
          ),
        ),
      runManualBillingReconciliation: (
        input: BillingReconciliationManualRunRequest,
      ) =>
        Schema.decodeUnknown(BillingReconciliationManualRunRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });

              yield* authorizeWorkflowJobAccess({
                authorization,
                requestContext,
              });

              yield* validateWorkflowExecutionIdentity({
                requestContext,
                convexAuthToken: request.convexAuthToken,
              });

              const workflowClient = yield* Effect.fromNullable(
                workflowExecutionClient,
              ).pipe(
                Effect.orElseFail(
                  () =>
                    ({
                      _tag: "AdminBillingWorkflowExecutionUnavailableError",
                      reason:
                        "The authenticated Convex workflow client is not configured for admin billing workflow execution.",
                    }) satisfies AdminBillingWorkflowExecutionUnavailableError,
                ),
              );

              const now = request.now ?? new Date().toISOString();

              if (manualReconciliationBootstrapper !== undefined) {
                yield* manualReconciliationBootstrapper({ now });
              }

              const jobs = yield* workflowClient.runDueBillingConvergenceJobs(
                { now },
                {
                  authToken: request.convexAuthToken,
                },
              );

              yield* auditLog.append({
                requestContext,
                moduleId: platformModuleId.billingAndMetering,
                action: billingAndMeteringAuditAction.reconciliationTriggered,
                target: `${platformModuleId.workflowJobs}:manual-reconciliation`,
                reason:
                  "Trigger an authenticated Convex billing reconciliation sweep from the admin backend.",
              });

              return {
                jobs,
              } satisfies BillingReconciliationManualRunResult;
            }),
          ),
        ),
    } satisfies AdminBillingService;
  });

const makeAdminBillingRuntime = (options: AdminBillingRuntimeOptions) =>
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
    const polar = yield* makePolarAdapter({
      apiKey: options.polarAccessToken,
      apiUrl: options.polarApiUrl,
    });
    const workflowExecutionClient =
      yield* makeAuthenticatedConvexWorkflowClient({
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
    const workflowJobsQueryable: WorkflowJobsPostgresQueryable = {
      getWorkflowJobById: async (jobId) => {
        const rows = await postgres.database
          .select()
          .from(workflowJobsTable)
          .where(eq(workflowJobsTable.jobId, jobId))
          .limit(1);

        return rows[0];
      },
      claimScheduledWorkflowJob: async (jobId, now) => {
        const staleRunningBefore = subtractSecondsFromDate(
          now,
          workflowJobsRunningClaimTimeoutSeconds,
        );
        const rows = await postgres.database
          .update(workflowJobsTable)
          .set({
            status: workflowJobStatus.running,
            attempts: sql`${workflowJobsTable.attempts} + 1`,
            completedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(workflowJobsTable.jobId, jobId),
              or(
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.scheduled),
                  lte(workflowJobsTable.scheduledAt, now),
                ),
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.running),
                  lte(workflowJobsTable.updatedAt, staleRunningBefore),
                ),
              ),
            ),
          )
          .returning();

        return rows[0];
      },
      restoreWorkflowJobIfUpdatedAtMatches: async (
        jobId,
        expectedUpdatedAt,
        record,
      ) => {
        const rows = await postgres.database
          .update(workflowJobsTable)
          .set({
            runtime: record.runtime,
            sourceModuleId: record.sourceModuleId,
            kind: record.kind,
            trigger: record.trigger,
            status: record.status,
            tenantScope: record.tenantScope,
            tenantScopeId: record.tenantScopeId,
            attempts: record.attempts,
            scheduledAt: new Date(record.scheduledAt),
            completedAt:
              record.completedAt === undefined
                ? null
                : new Date(record.completedAt),
            lastError: record.lastError ?? null,
            gapReason: record.gapReason ?? null,
            payload: record.payload,
            updatedAt: new Date(record.updatedAt),
          })
          .where(
            and(
              eq(workflowJobsTable.jobId, jobId),
              eq(workflowJobsTable.status, workflowJobStatus.scheduled),
              eq(workflowJobsTable.updatedAt, expectedUpdatedAt),
            ),
          )
          .returning();

        return rows[0];
      },
      listDueWorkflowJobs: async (sourceModuleId, scheduledBefore) =>
        postgres.database
          .select()
          .from(workflowJobsTable)
          .where(
            and(
              eq(workflowJobsTable.sourceModuleId, sourceModuleId),
              or(
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.scheduled),
                  lte(workflowJobsTable.scheduledAt, scheduledBefore),
                ),
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.running),
                  lte(
                    workflowJobsTable.updatedAt,
                    subtractSecondsFromDate(
                      scheduledBefore,
                      workflowJobsRunningClaimTimeoutSeconds,
                    ),
                  ),
                ),
              ),
            ),
          )
          .orderBy(desc(workflowJobsTable.scheduledAt)),
      listRepairGapWorkflowJobs: async (sourceModuleId) =>
        postgres.database
          .select()
          .from(workflowJobsTable)
          .where(
            and(
              eq(workflowJobsTable.sourceModuleId, sourceModuleId),
              or(
                and(
                  isNotNull(workflowJobsTable.gapReason),
                  or(
                    eq(workflowJobsTable.status, workflowJobStatus.scheduled),
                    eq(workflowJobsTable.status, workflowJobStatus.blocked),
                  ),
                ),
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.running),
                  lte(
                    workflowJobsTable.updatedAt,
                    subtractSecondsFromDate(
                      new Date(),
                      workflowJobsRunningClaimTimeoutSeconds,
                    ),
                  ),
                ),
              ),
            ),
          )
          .orderBy(desc(workflowJobsTable.updatedAt)),
    };
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: async (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const workflowJobsRepository = yield* makeWorkflowJobsPostgresRepository(
      writeDatabase,
      workflowJobsQueryable,
    );
    const manualReconciliationBootstrapper: AdminBillingManualReconciliationBootstrapper =
      (input) =>
        Effect.gen(function* () {
          const activeSubscriptionRows = yield* Effect.tryPromise({
            try: () =>
              postgres.database
                .select({
                  subscriptionId: billingSubscriptionsTable.subscriptionId,
                  scope: billingSubscriptionsTable.scope,
                  scopeId: billingSubscriptionsTable.scopeId,
                  provider: billingSubscriptionsTable.provider,
                  metadata: billingSubscriptionsTable.metadata,
                  updatedAt: billingSubscriptionsTable.updatedAt,
                })
                .from(billingSubscriptionsTable)
                .where(
                  or(
                    eq(
                      billingSubscriptionsTable.status,
                      billingSubscriptionStatus.active,
                    ),
                    eq(
                      billingSubscriptionsTable.status,
                      billingSubscriptionStatus.pending,
                    ),
                    eq(
                      billingSubscriptionsTable.status,
                      billingSubscriptionStatus.pastDue,
                    ),
                  ),
                )
                .orderBy(desc(billingSubscriptionsTable.updatedAt)),
            catch: (cause) =>
              ({
                _tag: "AdminBillingWorkflowBootstrapError",
                operation: "listActiveSubscriptionCandidates",
                cause,
              }) satisfies AdminBillingWorkflowBootstrapError,
          });

          if (activeSubscriptionRows.length === 0) {
            return;
          }

          const customerAccountRows = yield* Effect.tryPromise({
            try: () =>
              postgres.database
                .select({
                  scope: billingCustomerAccountsTable.scope,
                  scopeId: billingCustomerAccountsTable.scopeId,
                })
                .from(billingCustomerAccountsTable),
            catch: (cause) =>
              ({
                _tag: "AdminBillingWorkflowBootstrapError",
                operation: "listCustomerAccounts",
                cause,
              }) satisfies AdminBillingWorkflowBootstrapError,
          });
          const provisioningRows = yield* Effect.tryPromise({
            try: () =>
              postgres.database
                .select({
                  tenantScope: tenantProvisioningReceiptsTable.tenantScope,
                  tenantScopeId: tenantProvisioningReceiptsTable.tenantScopeId,
                  status: tenantProvisioningReceiptsTable.status,
                })
                .from(tenantProvisioningReceiptsTable),
            catch: (cause) =>
              ({
                _tag: "AdminBillingWorkflowBootstrapError",
                operation: "listProvisioningReceipts",
                cause,
              }) satisfies AdminBillingWorkflowBootstrapError,
          });
          const onboardingRows = yield* Effect.tryPromise({
            try: () =>
              postgres.database
                .select({
                  tenantScope: tenantOnboardingRunsTable.tenantScope,
                  tenantScopeId: tenantOnboardingRunsTable.tenantScopeId,
                  status: tenantOnboardingRunsTable.status,
                  startedAt: tenantOnboardingRunsTable.startedAt,
                })
                .from(tenantOnboardingRunsTable)
                .orderBy(desc(tenantOnboardingRunsTable.startedAt)),
            catch: (cause) =>
              ({
                _tag: "AdminBillingWorkflowBootstrapError",
                operation: "listOnboardingRuns",
                cause,
              }) satisfies AdminBillingWorkflowBootstrapError,
          });

          const latestSubscriptionsByTenant = new Map<
            string,
            (typeof activeSubscriptionRows)[number]
          >();

          for (const subscriptionRow of activeSubscriptionRows) {
            const tenantKey = [
              subscriptionRow.scope,
              subscriptionRow.scopeId,
            ].join(":");

            if (!latestSubscriptionsByTenant.has(tenantKey)) {
              latestSubscriptionsByTenant.set(tenantKey, subscriptionRow);
            }
          }

          const customerAccountsByTenant = new Set(
            customerAccountRows.map((customerAccountRow) =>
              [customerAccountRow.scope, customerAccountRow.scopeId].join(":"),
            ),
          );
          const provisioningByTenant = new Map(
            provisioningRows.map((provisioningRow) => [
              [provisioningRow.tenantScope, provisioningRow.tenantScopeId].join(
                ":",
              ),
              provisioningRow.status,
            ]),
          );
          const onboardingByTenant = new Map<string, string>();

          for (const onboardingRow of onboardingRows) {
            const tenantKey = [
              onboardingRow.tenantScope,
              onboardingRow.tenantScopeId,
            ].join(":");

            if (!onboardingByTenant.has(tenantKey)) {
              onboardingByTenant.set(tenantKey, onboardingRow.status);
            }
          }

          yield* Effect.forEach(
            Array.from(latestSubscriptionsByTenant.values()),
            (subscriptionRow) => {
              const tenantKey = [
                subscriptionRow.scope,
                subscriptionRow.scopeId,
              ].join(":");
              const hasCustomerAccount =
                customerAccountsByTenant.has(tenantKey);
              const provisioningStatus = provisioningByTenant.get(tenantKey);
              const onboardingStatus = onboardingByTenant.get(tenantKey);

              if (
                hasCustomerAccount &&
                provisioningStatus === tenantProvisioningStatus.provisioned &&
                onboardingStatus !== undefined &&
                onboardingStatus !== tenantOnboardingRunStatus.failed
              ) {
                return Effect.void;
              }

              return toPlatformScope(subscriptionRow.scope).pipe(
                Effect.flatMap((tenantScope) => {
                  const jobId = buildBillingReconciliationWorkflowJobId({
                    trigger: workflowJobTrigger.periodicSweep,
                    tenantScope,
                    tenantScopeId: subscriptionRow.scopeId,
                    key: subscriptionRow.subscriptionId,
                  });

                  return Schema.decodeUnknown(
                    BillingReconciliationWorkflowJobRecordSchema,
                  )({
                    jobId,
                    runtime: workflowJobRuntime.convex,
                    sourceModuleId: platformModuleId.billingAndMetering,
                    kind: workflowJobKind.reconciliationSweep,
                    trigger: workflowJobTrigger.periodicSweep,
                    status: workflowJobStatus.scheduled,
                    tenantScope,
                    tenantScopeId: subscriptionRow.scopeId,
                    attempts: 0,
                    scheduledAt: input.now,
                    payload: {
                      sourceModuleId: platformModuleId.billingAndMetering,
                      tenantScope,
                      tenantScopeId: subscriptionRow.scopeId,
                      provider: subscriptionRow.provider,
                      correlationId:
                        buildAdminBillingManualReconciliationCorrelationId(
                          jobId,
                        ),
                      ...(typeof subscriptionRow.metadata?.customerId ===
                      "string"
                        ? {
                            providerCustomerId:
                              subscriptionRow.metadata.customerId,
                          }
                        : {}),
                      subscriptionId: subscriptionRow.subscriptionId,
                      trigger: workflowJobTrigger.periodicSweep,
                    },
                    createdAt: input.now,
                    updatedAt: input.now,
                  }).pipe(
                    Effect.flatMap((record) =>
                      workflowJobsRepository.persistWorkflowJob(record),
                    ),
                    Effect.asVoid,
                  );
                }),
              );
            },
          );
        });
    const identitySession = yield* makeIdentitySessionModule().pipe(
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
        tenantProvisioningRepository,
      ),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
    );
    const service = yield* makeAdminBillingService({
      workflowExecutionClient,
      manualReconciliationBootstrapper,
    }).pipe(
      Effect.provideService(AuditLogModule, auditLog),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(
        WorkflowJobsPostgresRepository,
        workflowJobsRepository,
      ),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
      ]).pipe(Effect.asVoid),
    };
  });

const runAdminBillingWithResolvedOptions = <A, E>(
  options: AdminBillingRuntimeOptions,
  use: (service: AdminBillingService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeAdminBillingRuntime(options);

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const resolveAdminBillingRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeAdminBillingProcessEnvironment(environment).pipe(
    Effect.map(
      (resolvedEnvironment): AdminBillingRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
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
        polarAccessToken: resolvedEnvironment.POLAR_ACCESS_TOKEN,
        polarApiUrl: resolvedEnvironment.POLAR_API_URL,
        valkeyUrl: resolvedEnvironment.VALKEY_URL,
        ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
        ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
      }),
    ),
  );

export const runAdminBillingFromOptions = <A, E>(
  options: AdminBillingRuntimeOptions,
  use: (service: AdminBillingService) => Effect.Effect<A, E>,
) =>
  decodeAdminBillingRuntimeOptions(options).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminBillingWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runAdminBillingFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminBillingService) => Effect.Effect<A, E>,
) =>
  resolveAdminBillingRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminBillingWithResolvedOptions(resolvedOptions, use),
    ),
  );
