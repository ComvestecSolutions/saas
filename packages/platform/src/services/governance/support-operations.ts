import { and, desc, eq, inArray } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import { findModuleManifest } from "@comvestec/config";
import {
  platformModuleId,
  PlatformScopeSchema,
  type ProjectionDescriptor,
  projectionProfile,
  type RequestContext,
  supportOperationsCaseStatus,
  type SupportOperationsCaseSupportView,
  SupportOperationsCaseSupportViewListSchema,
  SupportOperationsCaseSupportViewSchema,
  type SupportOperationsCaseStatus,
  SupportOperationsCaseStatusSchema,
  SupportOperationsCasePrioritySchema,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsImpersonationSessionStatus,
  type SupportOperationsBreakGlassIncidentSupportView,
  SupportOperationsBreakGlassIncidentSupportViewListSchema,
  SupportOperationsBreakGlassIncidentSupportViewSchema,
  type SupportOperationsBreakGlassIncidentStatus,
  SupportOperationsBreakGlassIncidentStatusSchema,
  type SupportOperationsImpersonationSessionStatus,
  type SupportOperationsImpersonationSessionSupportView,
  SupportOperationsImpersonationSessionStatusSchema,
  SupportOperationsImpersonationSessionSupportViewListSchema,
  SupportOperationsImpersonationSessionSupportViewSchema,
  SupportOperationsTenantHealthRepairGapListSchema,
  SupportOperationsTenantHealthRepairGapSchema,
  SupportOperationsTenantHealthScopeSchema,
  type SupportOperationsTenantHealthView,
  SupportOperationsTenantHealthViewSchema,
} from "@comvestec/contracts";
import {
  type AuditLogPostgresRepositoryPersistenceError,
  type BillingReconciliationWorkflowJobRecord,
  FieldSecurityModule,
  type FieldSecurityModuleService,
  type IdentitySessionRequestContextNotFoundError,
  resolveIdentitySessionRequestContext,
  auditLogEventsTable,
  type AuditLogPostgresRepositoryError,
  type AuditLogPostgresQueryable,
  type AuditLogPostgresRepositoryService,
  type BreakGlassIncidentAlreadyReviewedError,
  makeAuditLogPostgresRepository,
  type SupportOperationsCasePostgresQueryable,
  type SupportOperationsCasePostgresRepositoryError,
  type SupportOperationsCaseListInput,
  type SupportOperationsCasePostgresRepositoryQueryError,
  type SupportOperationsCasePostgresRepositoryService,
  type SupportOperationsCaseRecord,
  type SupportOperationsCaseUpsertResult,
  createSupportOperationsBreakGlassIncidentRecord,
  createSupportOperationsImpersonationSessionRecord,
  type SupportOperationsBreakGlassIncidentPostgresQueryable,
  type SupportOperationsBreakGlassIncidentPostgresRepositoryError,
  type SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError,
  type SupportOperationsBreakGlassIncidentPostgresRepositoryService,
  type SupportOperationsBreakGlassIncidentRecord,
  type SupportOperationsBreakGlassIncidentReviewResult,
  type SupportOperationsImpersonationSessionAlreadyRevokedError,
  type SupportOperationsImpersonationSessionPostgresQueryable,
  type SupportOperationsImpersonationSessionPostgresRepositoryError,
  type SupportOperationsImpersonationSessionPostgresRepositoryQueryError,
  type SupportOperationsImpersonationSessionPostgresRepositoryService,
  type SupportOperationsImpersonationSessionRecord,
  type SupportOperationsImpersonationSessionRevocationResult,
  makeFieldSecurityModule,
  makeSupportOperationsCasePostgresRepository,
  makeSupportOperationsBreakGlassIncidentPostgresRepository,
  makeSupportOperationsImpersonationSessionPostgresRepository,
  makeWorkflowJobsPostgresRepository,
  revokeSupportOperationsImpersonationSession,
  reviewSupportOperationsBreakGlassIncident,
  supportOperationsCasesTable,
  supportOperationsBreakGlassIncidentsTable,
  supportOperationsImpersonationSessionsTable,
  type SupportOperationsModuleError,
  type SupportOperationsModuleService,
  type SupportImpersonationGrant,
  SupportOperationsModule,
  buildWorkflowJobsPostgresQueryable,
  makeSupportOperationsModule,
  type BreakGlassGrant,
  type WorkflowJobsPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryService,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  type KeycloakAdapterRequestError,
  type KeycloakAdapterService,
  makeKeycloakAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  type PostgresAdapterConnectionError,
  type PostgresRuntimeDatabase,
  ValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

export const SupportOperationsRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
});

export type SupportOperationsRuntimeOptions = Schema.Schema.Type<
  typeof SupportOperationsRuntimeOptionsSchema
>;

const SupportOperationsProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
});

export const supportOperationsImpersonationSessionRevocationFinalizableStatuses =
  [
    supportOperationsImpersonationSessionStatus.revocationPending,
  ] as const satisfies readonly SupportOperationsImpersonationSessionStatus[];

export const SupportOperationsStartImpersonationRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  impersonatedActorId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  requestedDurationMinutes: Schema.Number,
});

export type SupportOperationsStartImpersonationRequest = Schema.Schema.Type<
  typeof SupportOperationsStartImpersonationRequestSchema
>;

export const SupportOperationsUpsertCaseRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  caseId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  status: SupportOperationsCaseStatusSchema,
  priority: SupportOperationsCasePrioritySchema,
  changeReason: Schema.NonEmptyString,
});

export type SupportOperationsUpsertCaseRequest = Schema.Schema.Type<
  typeof SupportOperationsUpsertCaseRequestSchema
>;

export const SupportOperationsListCasesRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  status: Schema.optional(SupportOperationsCaseStatusSchema),
});

export type SupportOperationsListCasesRequest = Schema.Schema.Type<
  typeof SupportOperationsListCasesRequestSchema
>;

export const SupportOperationsGetTenantHealthRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  tenantScope: SupportOperationsTenantHealthScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
});

export type SupportOperationsGetTenantHealthRequest = Schema.Schema.Type<
  typeof SupportOperationsGetTenantHealthRequestSchema
>;

export const SupportOperationsGrantBreakGlassRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
});

export type SupportOperationsGrantBreakGlassRequest = Schema.Schema.Type<
  typeof SupportOperationsGrantBreakGlassRequestSchema
>;

export const SupportOperationsListImpersonationSessionsRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    status: Schema.optional(SupportOperationsImpersonationSessionStatusSchema),
  });

export type SupportOperationsListImpersonationSessionsRequest =
  Schema.Schema.Type<
    typeof SupportOperationsListImpersonationSessionsRequestSchema
  >;

export const SupportOperationsRevokeImpersonationSessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    caseId: Schema.NonEmptyString,
    revocationReason: Schema.NonEmptyString,
  });

export type SupportOperationsRevokeImpersonationSessionRequest =
  Schema.Schema.Type<
    typeof SupportOperationsRevokeImpersonationSessionRequestSchema
  >;

export const SupportOperationsListBreakGlassIncidentsRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    status: Schema.optional(SupportOperationsBreakGlassIncidentStatusSchema),
  });

export type SupportOperationsListBreakGlassIncidentsRequest =
  Schema.Schema.Type<
    typeof SupportOperationsListBreakGlassIncidentsRequestSchema
  >;

export const SupportOperationsGetBreakGlassIncidentRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    caseId: Schema.NonEmptyString,
  });

export type SupportOperationsGetBreakGlassIncidentRequest = Schema.Schema.Type<
  typeof SupportOperationsGetBreakGlassIncidentRequestSchema
>;

export const SupportOperationsReviewBreakGlassIncidentRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    caseId: Schema.NonEmptyString,
    reviewReason: Schema.NonEmptyString,
  });

export type SupportOperationsReviewBreakGlassIncidentRequest =
  Schema.Schema.Type<
    typeof SupportOperationsReviewBreakGlassIncidentRequestSchema
  >;

export type SupportOperationsApprovalActorMissingError = {
  readonly _tag: "SupportOperationsApprovalActorMissingError";
  readonly actorType: RequestContext["actorType"];
  readonly correlationId: RequestContext["correlationId"];
};

export type SupportOperationsReadUnauthenticatedActorError = {
  readonly _tag: "SupportOperationsReadUnauthenticatedActorError";
  readonly actorType: RequestContext["actorType"];
  readonly correlationId: RequestContext["correlationId"];
};

export type SupportOperationsReadAccessDeniedError = {
  readonly _tag: "SupportOperationsReadAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
  readonly correlationId: RequestContext["correlationId"];
};

export type SupportOperationsBreakGlassIncidentNotFoundError = {
  readonly _tag: "SupportOperationsBreakGlassIncidentNotFoundError";
  readonly caseId: string;
};

export type SupportOperationsImpersonationSessionNotFoundError = {
  readonly _tag: "SupportOperationsImpersonationSessionNotFoundError";
  readonly caseId: string;
};

export type SupportOperationsImpersonationSessionNoLongerActiveError = {
  readonly _tag: "SupportOperationsImpersonationSessionNoLongerActiveError";
  readonly caseId: string;
  readonly status: SupportOperationsImpersonationSessionStatus;
};

export type SupportOperationsProjectionConfigurationError = {
  readonly _tag: "SupportOperationsProjectionConfigurationError";
  readonly moduleId:
    | typeof platformModuleId.supportOperations
    | typeof platformModuleId.workflowJobs;
  readonly profile: typeof projectionProfile.supportSafe;
};

export type SupportOperationsInternalContractError = {
  readonly _tag: "SupportOperationsInternalContractError";
  readonly operation:
    | "fieldSecurityProjectionSupportCase"
    | "fieldSecurityProjectionIncident"
    | "fieldSecurityProjectionImpersonationSession"
    | "fieldSecurityProjectionTenantHealthRepairGap"
    | "supportOperationsCaseSupportView"
    | "supportOperationsBreakGlassIncidentSupportView"
    | "supportOperationsImpersonationSessionSupportView"
    | "supportOperationsTenantHealthRepairGap"
    | "supportOperationsTenantHealthView";
  readonly cause: ParseResult.ParseError;
};

type SupportOperationsImpersonationPersistenceError =
  | ParseResult.ParseError
  | AuditLogPostgresRepositoryError
  | AuditLogPostgresRepositoryPersistenceError
  | SupportOperationsImpersonationSessionPostgresRepositoryError
  | SupportOperationsImpersonationSessionPostgresRepositoryQueryError;

export type SupportOperationsImpersonationCompensationError = {
  readonly _tag: "SupportOperationsImpersonationCompensationError";
  readonly sessionId: string;
  readonly persistenceFailure: SupportOperationsImpersonationPersistenceError;
  readonly revocationFailure:
    | KeycloakAdapterRequestError
    | ParseResult.ParseError;
};

export type SupportOperationsImpersonationRevocationCompensationError = {
  readonly _tag: "SupportOperationsImpersonationRevocationCompensationError";
  readonly caseId: string;
  readonly revocationFailure:
    | KeycloakAdapterRequestError
    | ParseResult.ParseError;
  readonly persistenceFailure: SupportOperationsImpersonationSessionPostgresRepositoryError;
};

export type SupportOperationsServiceError =
  | ParseResult.ParseError
  | IdentitySessionRequestContextNotFoundError
  | SupportOperationsApprovalActorMissingError
  | SupportOperationsInternalContractError
  | SupportOperationsImpersonationCompensationError
  | SupportOperationsImpersonationRevocationCompensationError
  | SupportOperationsReadUnauthenticatedActorError
  | SupportOperationsReadAccessDeniedError
  | SupportOperationsBreakGlassIncidentNotFoundError
  | SupportOperationsImpersonationSessionNotFoundError
  | SupportOperationsImpersonationSessionNoLongerActiveError
  | SupportOperationsProjectionConfigurationError
  | SupportOperationsModuleError
  | AuditLogPostgresRepositoryError
  | SupportOperationsCasePostgresRepositoryError
  | SupportOperationsBreakGlassIncidentPostgresRepositoryError
  | SupportOperationsImpersonationSessionPostgresRepositoryError
  | WorkflowJobsPostgresRepositoryError
  | ValkeyAdapterOperationError;

export type SupportOperationsService = {
  readonly startImpersonation: (
    input: SupportOperationsStartImpersonationRequest,
  ) => Effect.Effect<SupportImpersonationGrant, SupportOperationsServiceError>;
  readonly getTenantHealth: (
    input: SupportOperationsGetTenantHealthRequest,
  ) => Effect.Effect<
    SupportOperationsTenantHealthView,
    SupportOperationsServiceError
  >;
  readonly upsertCase: (
    input: SupportOperationsUpsertCaseRequest,
  ) => Effect.Effect<
    SupportOperationsCaseSupportView,
    SupportOperationsServiceError
  >;
  readonly listCases: (
    input: SupportOperationsListCasesRequest,
  ) => Effect.Effect<
    readonly SupportOperationsCaseSupportView[],
    SupportOperationsServiceError
  >;
  readonly listImpersonationSessions: (
    input: SupportOperationsListImpersonationSessionsRequest,
  ) => Effect.Effect<
    readonly SupportOperationsImpersonationSessionSupportView[],
    SupportOperationsServiceError
  >;
  readonly revokeImpersonationSession: (
    input: SupportOperationsRevokeImpersonationSessionRequest,
  ) => Effect.Effect<
    SupportOperationsImpersonationSessionSupportView,
    SupportOperationsServiceError
  >;
  readonly grantBreakGlassAccess: (
    input: SupportOperationsGrantBreakGlassRequest,
  ) => Effect.Effect<BreakGlassGrant, SupportOperationsServiceError>;
  readonly listBreakGlassIncidents: (
    input: SupportOperationsListBreakGlassIncidentsRequest,
  ) => Effect.Effect<
    readonly SupportOperationsBreakGlassIncidentSupportView[],
    SupportOperationsServiceError
  >;
  readonly getBreakGlassIncident: (
    input: SupportOperationsGetBreakGlassIncidentRequest,
  ) => Effect.Effect<
    SupportOperationsBreakGlassIncidentSupportView,
    SupportOperationsServiceError
  >;
  readonly reviewBreakGlassIncident: (
    input: SupportOperationsReviewBreakGlassIncidentRequest,
  ) => Effect.Effect<
    SupportOperationsBreakGlassIncidentSupportView,
    SupportOperationsServiceError
  >;
};

type SupportOperationsPersistenceError =
  | ParseResult.ParseError
  | AuditLogPostgresRepositoryError
  | AuditLogPostgresRepositoryPersistenceError
  | SupportOperationsCasePostgresRepositoryError
  | SupportOperationsCasePostgresRepositoryQueryError
  | SupportOperationsBreakGlassIncidentPostgresRepositoryError
  | SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError
  | SupportOperationsBreakGlassIncidentNotFoundError
  | SupportOperationsImpersonationSessionPostgresRepositoryError
  | SupportOperationsImpersonationSessionPostgresRepositoryQueryError
  | SupportOperationsImpersonationSessionAlreadyRevokedError
  | SupportOperationsImpersonationSessionNotFoundError
  | WorkflowJobsPostgresRepositoryError
  | BreakGlassIncidentAlreadyReviewedError;

type SupportOperationsPersistence = {
  readonly upsertSupportCase: (
    supportCase: SupportOperationsCaseRecord,
  ) => Effect.Effect<
    SupportOperationsCaseRecord,
    SupportOperationsCasePostgresRepositoryError
  >;
  readonly listSupportCases: (
    input?: SupportOperationsCaseListInput,
  ) => Effect.Effect<
    readonly SupportOperationsCaseRecord[],
    SupportOperationsCasePostgresRepositoryError
  >;
  readonly getSupportCase: (
    caseId: string,
  ) => Effect.Effect<
    SupportOperationsCaseRecord | undefined,
    SupportOperationsCasePostgresRepositoryError
  >;
  readonly persistUpsertedSupportCase: (
    upsertResult: SupportOperationsCaseUpsertResult,
  ) => Effect.Effect<
    SupportOperationsCaseRecord,
    SupportOperationsPersistenceError
  >;
  readonly persistStartedImpersonation: (
    grant: SupportImpersonationGrant,
  ) => Effect.Effect<
    SupportImpersonationGrant,
    SupportOperationsImpersonationPersistenceError
  >;
  readonly compareAndSetImpersonationSessionStatus: (input: {
    readonly session: SupportOperationsImpersonationSessionRecord;
    readonly expectedStatus: SupportOperationsImpersonationSessionStatus;
    readonly nextStatus: SupportOperationsImpersonationSessionStatus;
  }) => Effect.Effect<
    SupportOperationsImpersonationSessionRecord | undefined,
    SupportOperationsImpersonationSessionPostgresRepositoryError
  >;
  readonly upsertImpersonationSession: (
    session: SupportOperationsImpersonationSessionRecord,
  ) => Effect.Effect<
    SupportOperationsImpersonationSessionRecord,
    SupportOperationsImpersonationSessionPostgresRepositoryError
  >;
  readonly listImpersonationSessions: (
    status?: SupportOperationsImpersonationSessionStatus,
  ) => Effect.Effect<
    readonly SupportOperationsImpersonationSessionRecord[],
    SupportOperationsImpersonationSessionPostgresRepositoryError
  >;
  readonly getImpersonationSession: (
    caseId: string,
  ) => Effect.Effect<
    SupportOperationsImpersonationSessionRecord | undefined,
    SupportOperationsImpersonationSessionPostgresRepositoryError
  >;
  readonly persistRevokedImpersonationSession: (
    revocationResult: SupportOperationsImpersonationSessionRevocationResult,
  ) => Effect.Effect<
    SupportOperationsImpersonationSessionRecord,
    SupportOperationsPersistenceError
  >;
  readonly persistGrantedBreakGlass: (
    grant: BreakGlassGrant,
  ) => Effect.Effect<BreakGlassGrant, SupportOperationsPersistenceError>;
  readonly listBreakGlassIncidents: (
    status?: SupportOperationsBreakGlassIncidentStatus,
  ) => Effect.Effect<
    readonly SupportOperationsBreakGlassIncidentRecord[],
    SupportOperationsBreakGlassIncidentPostgresRepositoryError
  >;
  readonly getBreakGlassIncident: (
    caseId: string,
  ) => Effect.Effect<
    SupportOperationsBreakGlassIncidentRecord | undefined,
    SupportOperationsBreakGlassIncidentPostgresRepositoryError
  >;
  readonly persistReviewedBreakGlassIncident: (
    reviewResult: SupportOperationsBreakGlassIncidentReviewResult,
  ) => Effect.Effect<
    SupportOperationsBreakGlassIncidentRecord,
    SupportOperationsPersistenceError
  >;
};

const resolveApprovedBy = (
  requestContext: RequestContext,
): Effect.Effect<string, SupportOperationsApprovalActorMissingError> =>
  requestContext.actorId === undefined
    ? Effect.fail({
        _tag: "SupportOperationsApprovalActorMissingError",
        actorType: requestContext.actorType,
        correlationId: requestContext.correlationId,
      } satisfies SupportOperationsApprovalActorMissingError)
    : Effect.succeed(requestContext.actorId);

const ensureSupportOperationsReadAccess = (
  supportOperations: Pick<SupportOperationsModuleService, "validateEscalation">,
  requestContext: RequestContext,
): Effect.Effect<
  RequestContext,
  | ParseResult.ParseError
  | SupportOperationsReadUnauthenticatedActorError
  | SupportOperationsReadAccessDeniedError
> =>
  requestContext.actorId === undefined
    ? Effect.fail({
        _tag: "SupportOperationsReadUnauthenticatedActorError",
        actorType: requestContext.actorType,
        correlationId: requestContext.correlationId,
      } satisfies SupportOperationsReadUnauthenticatedActorError)
    : supportOperations.validateEscalation(requestContext).pipe(
        Effect.flatMap((decision) =>
          decision.allowed
            ? Effect.succeed(requestContext)
            : Effect.fail({
                _tag: "SupportOperationsReadAccessDeniedError",
                actorType: requestContext.actorType,
                correlationId: requestContext.correlationId,
              } satisfies SupportOperationsReadAccessDeniedError),
        ),
      );

const createInternalContractError =
  (operation: SupportOperationsInternalContractError["operation"]) =>
  (cause: ParseResult.ParseError): SupportOperationsInternalContractError => ({
    _tag: "SupportOperationsInternalContractError",
    operation,
    cause,
  });

const resolveSupportSafeProjection = (
  moduleId:
    | typeof platformModuleId.supportOperations
    | typeof platformModuleId.workflowJobs,
) =>
  Effect.fromNullable(
    findModuleManifest(moduleId)?.projectionProfiles.find(
      (projection) => projection.profile === projectionProfile.supportSafe,
    ),
  ).pipe(
    Effect.orElseFail(
      (): SupportOperationsProjectionConfigurationError => ({
        _tag: "SupportOperationsProjectionConfigurationError",
        moduleId,
        profile: projectionProfile.supportSafe,
      }),
    ),
  );

const projectSupportCaseSupportView = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly supportCase: SupportOperationsCaseRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.supportOperations,
      requestContext: input.requestContext,
      projection: input.projection,
      record: input.supportCase,
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityProjectionSupportCase"),
      ),
      Effect.flatMap((result) =>
        Schema.decodeUnknown(SupportOperationsCaseSupportViewSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(
            createInternalContractError("supportOperationsCaseSupportView"),
          ),
        ),
      ),
    );

const projectSupportCaseSupportViewList = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly supportCases: readonly SupportOperationsCaseRecord[];
}) =>
  resolveSupportSafeProjection(platformModuleId.supportOperations).pipe(
    Effect.flatMap((projection) =>
      Effect.forEach(input.supportCases, (supportCase) =>
        projectSupportCaseSupportView({
          fieldSecurity: input.fieldSecurity,
          requestContext: input.requestContext,
          projection,
          supportCase,
        }),
      ),
    ),
    Effect.flatMap((supportCaseViews) =>
      Schema.decodeUnknown(SupportOperationsCaseSupportViewListSchema)(
        supportCaseViews,
      ).pipe(
        Effect.mapError(
          createInternalContractError("supportOperationsCaseSupportView"),
        ),
      ),
    ),
  );

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

const projectTenantHealthRepairGap = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly job: BillingReconciliationWorkflowJobRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.workflowJobs,
      requestContext: input.requestContext,
      projection: input.projection,
      record: buildRepairGapProjectionRecord(input.job),
    })
    .pipe(
      Effect.mapError(
        createInternalContractError(
          "fieldSecurityProjectionTenantHealthRepairGap",
        ),
      ),
      Effect.flatMap((result) =>
        Schema.decodeUnknown(SupportOperationsTenantHealthRepairGapSchema)(
          result.projectedRecord,
        ).pipe(
          Effect.mapError(
            createInternalContractError(
              "supportOperationsTenantHealthRepairGap",
            ),
          ),
        ),
      ),
    );

const projectTenantHealthRepairGapList = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly jobs: readonly BillingReconciliationWorkflowJobRecord[];
}) =>
  resolveSupportSafeProjection(platformModuleId.workflowJobs).pipe(
    Effect.flatMap((projection) =>
      Effect.forEach(input.jobs, (job) =>
        projectTenantHealthRepairGap({
          fieldSecurity: input.fieldSecurity,
          requestContext: input.requestContext,
          projection,
          job,
        }),
      ),
    ),
    Effect.flatMap((repairGaps) =>
      Schema.decodeUnknown(SupportOperationsTenantHealthRepairGapListSchema)(
        repairGaps,
      ).pipe(
        Effect.mapError(
          createInternalContractError("supportOperationsTenantHealthRepairGap"),
        ),
      ),
    ),
  );

const projectTenantHealthView = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly tenantScope: SupportOperationsGetTenantHealthRequest["tenantScope"];
  readonly tenantScopeId: string;
  readonly supportCases: readonly SupportOperationsCaseRecord[];
  readonly repairGapJobs: readonly BillingReconciliationWorkflowJobRecord[];
}) =>
  Effect.all({
    cases: projectSupportCaseSupportViewList({
      fieldSecurity: input.fieldSecurity,
      requestContext: input.requestContext,
      supportCases: input.supportCases,
    }),
    repairGaps: projectTenantHealthRepairGapList({
      fieldSecurity: input.fieldSecurity,
      requestContext: input.requestContext,
      jobs: input.repairGapJobs,
    }),
  }).pipe(
    Effect.flatMap(({ cases, repairGaps }) =>
      Schema.decodeUnknown(SupportOperationsTenantHealthViewSchema)({
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        cases,
        repairGaps,
      }).pipe(
        Effect.mapError(
          createInternalContractError("supportOperationsTenantHealthView"),
        ),
      ),
    ),
  );

const projectBreakGlassIncidentSupportView = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly incident: SupportOperationsBreakGlassIncidentRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.supportOperations,
      requestContext: input.requestContext,
      projection: input.projection,
      record: input.incident,
    })
    .pipe(
      Effect.mapError(
        createInternalContractError("fieldSecurityProjectionIncident"),
      ),
      Effect.flatMap((result) =>
        Schema.decodeUnknown(
          SupportOperationsBreakGlassIncidentSupportViewSchema,
        )(result.projectedRecord).pipe(
          Effect.mapError(
            createInternalContractError(
              "supportOperationsBreakGlassIncidentSupportView",
            ),
          ),
        ),
      ),
    );

const projectBreakGlassIncidentSupportViewList = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly incidents: readonly SupportOperationsBreakGlassIncidentRecord[];
}) =>
  resolveSupportSafeProjection(platformModuleId.supportOperations).pipe(
    Effect.flatMap((projection) =>
      Effect.forEach(input.incidents, (incident) =>
        projectBreakGlassIncidentSupportView({
          fieldSecurity: input.fieldSecurity,
          requestContext: input.requestContext,
          projection,
          incident,
        }),
      ),
    ),
    Effect.flatMap((incidentViews) =>
      Schema.decodeUnknown(
        SupportOperationsBreakGlassIncidentSupportViewListSchema,
      )(incidentViews).pipe(
        Effect.mapError(
          createInternalContractError(
            "supportOperationsBreakGlassIncidentSupportView",
          ),
        ),
      ),
    ),
  );

const projectImpersonationSessionSupportView = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly projection: ProjectionDescriptor;
  readonly session: SupportOperationsImpersonationSessionRecord;
}) =>
  input.fieldSecurity
    .applyProjection({
      moduleId: platformModuleId.supportOperations,
      requestContext: input.requestContext,
      projection: input.projection,
      record: input.session,
    })
    .pipe(
      Effect.mapError(
        createInternalContractError(
          "fieldSecurityProjectionImpersonationSession",
        ),
      ),
      Effect.flatMap((result) =>
        Schema.decodeUnknown(
          SupportOperationsImpersonationSessionSupportViewSchema,
        )(result.projectedRecord).pipe(
          Effect.mapError(
            createInternalContractError(
              "supportOperationsImpersonationSessionSupportView",
            ),
          ),
        ),
      ),
    );

const projectImpersonationSessionSupportViewList = (input: {
  readonly fieldSecurity: Pick<FieldSecurityModuleService, "applyProjection">;
  readonly requestContext: RequestContext;
  readonly sessions: readonly SupportOperationsImpersonationSessionRecord[];
}) =>
  resolveSupportSafeProjection(platformModuleId.supportOperations).pipe(
    Effect.flatMap((projection) =>
      Effect.forEach(input.sessions, (session) =>
        projectImpersonationSessionSupportView({
          fieldSecurity: input.fieldSecurity,
          requestContext: input.requestContext,
          projection,
          session,
        }),
      ),
    ),
    Effect.flatMap((sessionViews) =>
      Schema.decodeUnknown(
        SupportOperationsImpersonationSessionSupportViewListSchema,
      )(sessionViews).pipe(
        Effect.mapError(
          createInternalContractError(
            "supportOperationsImpersonationSessionSupportView",
          ),
        ),
      ),
    ),
  );

const toAuditLogInsertRecord = (
  event: Parameters<AuditLogPostgresRepositoryService["insertAuditEvent"]>[0],
) => ({
  eventId: event.eventId,
  moduleId: event.moduleId,
  action: event.action,
  target: event.target,
  actorId: event.actorId,
  tenantScope: event.tenantScope,
  tenantScopeId: event.tenantScopeId,
  reason: event.reason ?? null,
  correlationId: event.correlationId ?? null,
  requestContext: {},
});

const toImpersonationSessionInsertRecord = (
  session: SupportOperationsImpersonationSessionRecord,
) => ({
  caseId: session.caseId,
  supportAgent: session.supportAgent,
  impersonatedUser: session.impersonatedUser,
  startedAt: new Date(session.startedAt),
  durationMinutes: session.durationMinutes,
  status: session.status,
  approvedBy: session.approvedBy,
  reason: session.reason,
  expiresAt: new Date(session.expiresAt),
});

const toSupportCaseInsertRecord = (
  supportCase: SupportOperationsCaseRecord,
) => ({
  caseId: supportCase.caseId,
  supportAgent: supportCase.supportAgent,
  tenantScope: supportCase.tenantScope,
  tenantScopeId: supportCase.tenantScopeId,
  summary: supportCase.summary,
  status: supportCase.status,
  priority: supportCase.priority,
  startedAt: new Date(supportCase.startedAt),
  lastUpdatedAt: new Date(supportCase.lastUpdatedAt),
});

const toBreakGlassIncidentInsertRecord = (
  incident: SupportOperationsBreakGlassIncidentRecord,
) => ({
  caseId: incident.caseId,
  supportAgent: incident.supportAgent,
  startedAt: new Date(incident.startedAt),
  status: incident.status,
  approvedBy: incident.approvedBy,
  reason: incident.reason,
  expiresAt: new Date(incident.expiresAt),
});

const isImpersonationSessionExpired = (
  session: SupportOperationsImpersonationSessionRecord,
) => new Date(session.expiresAt).getTime() <= Date.now();

const maybeExpireImpersonationSession = (
  persistence: SupportOperationsPersistence,
  session: SupportOperationsImpersonationSessionRecord,
): Effect.Effect<
  SupportOperationsImpersonationSessionRecord,
  SupportOperationsImpersonationSessionPostgresRepositoryError
> =>
  session.status === supportOperationsImpersonationSessionStatus.active &&
  isImpersonationSessionExpired(session)
    ? persistence
        .compareAndSetImpersonationSessionStatus({
          session,
          expectedStatus: supportOperationsImpersonationSessionStatus.active,
          nextStatus: supportOperationsImpersonationSessionStatus.expired,
        })
        .pipe(Effect.map((resolvedSession) => resolvedSession ?? session))
    : Effect.succeed(session);

const reconcileExpiredImpersonationSessions = (
  persistence: SupportOperationsPersistence,
  sessions: readonly SupportOperationsImpersonationSessionRecord[],
): Effect.Effect<
  readonly SupportOperationsImpersonationSessionRecord[],
  SupportOperationsImpersonationSessionPostgresRepositoryError
> =>
  Effect.forEach(sessions, (session) =>
    maybeExpireImpersonationSession(persistence, session),
  );

const listSupportOperationsImpersonationSessions = (input: {
  readonly persistence: SupportOperationsPersistence;
  readonly status?: SupportOperationsImpersonationSessionStatus;
}): Effect.Effect<
  readonly SupportOperationsImpersonationSessionRecord[],
  SupportOperationsImpersonationSessionPostgresRepositoryError
> => {
  const requestedStatus =
    input.status ?? supportOperationsImpersonationSessionStatus.active;

  switch (requestedStatus) {
    case supportOperationsImpersonationSessionStatus.active:
      return input.persistence.listImpersonationSessions(requestedStatus).pipe(
        Effect.flatMap((sessions) =>
          reconcileExpiredImpersonationSessions(input.persistence, sessions),
        ),
        Effect.map((sessions) =>
          sessions.filter(
            (session) =>
              session.status ===
              supportOperationsImpersonationSessionStatus.active,
          ),
        ),
      );
    case supportOperationsImpersonationSessionStatus.expired:
      return input.persistence
        .listImpersonationSessions(
          supportOperationsImpersonationSessionStatus.active,
        )
        .pipe(
          Effect.flatMap((sessions) =>
            reconcileExpiredImpersonationSessions(input.persistence, sessions),
          ),
          Effect.zipRight(
            input.persistence.listImpersonationSessions(requestedStatus),
          ),
        );
    default:
      return input.persistence.listImpersonationSessions(requestedStatus);
  }
};

const listSupportOperationsCases = (input: {
  readonly persistence: SupportOperationsPersistence;
  readonly status?: SupportOperationsCaseStatus;
}) =>
  input.persistence.listSupportCases({
    status: input.status ?? supportOperationsCaseStatus.open,
  });

const isTaggedCause = (
  cause: unknown,
  tag:
    | "AuditLogPostgresRepositoryPersistenceError"
    | "SupportOperationsCasePostgresRepositoryQueryError"
    | "SupportOperationsImpersonationSessionPostgresRepositoryQueryError"
    | "SupportOperationsImpersonationSessionNotFoundError"
    | "SupportOperationsImpersonationSessionAlreadyRevokedError"
    | "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError"
    | "SupportOperationsBreakGlassIncidentNotFoundError"
    | "BreakGlassIncidentAlreadyReviewedError"
    | "ParseError",
): boolean =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === tag;

const mapGrantPersistenceCause = (
  cause: unknown,
): SupportOperationsPersistenceError => {
  if (
    isTaggedCause(cause, "AuditLogPostgresRepositoryPersistenceError") ||
    isTaggedCause(
      cause,
      "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
    ) ||
    isTaggedCause(cause, "ParseError")
  ) {
    return cause as SupportOperationsPersistenceError;
  }

  return {
    _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
    operation: "upsertBreakGlassIncident",
    cause,
  } satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError;
};

const mapSupportCasePersistenceCause = (
  cause: unknown,
): SupportOperationsPersistenceError => {
  if (
    isTaggedCause(cause, "AuditLogPostgresRepositoryPersistenceError") ||
    isTaggedCause(cause, "SupportOperationsCasePostgresRepositoryQueryError") ||
    isTaggedCause(cause, "ParseError")
  ) {
    return cause as SupportOperationsPersistenceError;
  }

  return {
    _tag: "SupportOperationsCasePostgresRepositoryQueryError",
    operation: "upsertSupportCase",
    cause,
  } satisfies SupportOperationsCasePostgresRepositoryQueryError;
};

const mapImpersonationPersistenceCause = (
  cause: unknown,
): SupportOperationsImpersonationPersistenceError => {
  if (
    isTaggedCause(cause, "AuditLogPostgresRepositoryPersistenceError") ||
    isTaggedCause(
      cause,
      "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
    ) ||
    isTaggedCause(cause, "ParseError")
  ) {
    return cause as SupportOperationsImpersonationPersistenceError;
  }

  return {
    _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
    operation: "upsertImpersonationSession",
    cause,
  } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
};

const mapImpersonationRevocationPersistenceCause = (
  cause: unknown,
): SupportOperationsPersistenceError => {
  if (
    isTaggedCause(cause, "AuditLogPostgresRepositoryPersistenceError") ||
    isTaggedCause(
      cause,
      "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
    ) ||
    isTaggedCause(
      cause,
      "SupportOperationsImpersonationSessionNotFoundError",
    ) ||
    isTaggedCause(
      cause,
      "SupportOperationsImpersonationSessionAlreadyRevokedError",
    ) ||
    isTaggedCause(cause, "ParseError")
  ) {
    return cause as SupportOperationsPersistenceError;
  }

  return {
    _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
    operation: "updateImpersonationSession",
    cause,
  } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
};

const mapReviewPersistenceCause = (
  cause: unknown,
): SupportOperationsPersistenceError => {
  if (
    isTaggedCause(cause, "AuditLogPostgresRepositoryPersistenceError") ||
    isTaggedCause(
      cause,
      "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
    ) ||
    isTaggedCause(cause, "SupportOperationsBreakGlassIncidentNotFoundError") ||
    isTaggedCause(cause, "BreakGlassIncidentAlreadyReviewedError") ||
    isTaggedCause(cause, "ParseError")
  ) {
    return cause as SupportOperationsPersistenceError;
  }

  return {
    _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
    operation: "upsertBreakGlassIncident",
    cause,
  } satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError;
};

export const makeSupportOperationsPersistence = (input: {
  readonly database: PostgresRuntimeDatabase;
  readonly supportCaseRepository: SupportOperationsCasePostgresRepositoryService;
  readonly breakGlassIncidentRepository: SupportOperationsBreakGlassIncidentPostgresRepositoryService;
  readonly impersonationSessionRepository: SupportOperationsImpersonationSessionPostgresRepositoryService;
}): SupportOperationsPersistence => ({
  upsertSupportCase: (supportCase) =>
    input.supportCaseRepository.upsertSupportCase(supportCase),
  listSupportCases: (query) =>
    input.supportCaseRepository.listSupportCases(query),
  getSupportCase: (caseId) =>
    input.supportCaseRepository.getSupportCase(caseId),
  persistUpsertedSupportCase: (upsertResult) =>
    Effect.tryPromise({
      try: async () => {
        await input.database.transaction(async (tx) => {
          await tx
            .insert(supportOperationsCasesTable)
            .values(toSupportCaseInsertRecord(upsertResult.case))
            .onConflictDoUpdate({
              target: supportOperationsCasesTable.caseId,
              set: {
                supportAgent: upsertResult.case.supportAgent,
                tenantScope: upsertResult.case.tenantScope,
                tenantScopeId: upsertResult.case.tenantScopeId,
                summary: upsertResult.case.summary,
                status: upsertResult.case.status,
                priority: upsertResult.case.priority,
                lastUpdatedAt: new Date(upsertResult.case.lastUpdatedAt),
              },
            })
            .execute()
            .catch((cause) => {
              throw {
                _tag: "SupportOperationsCasePostgresRepositoryQueryError",
                operation: "upsertSupportCase",
                cause,
              } satisfies SupportOperationsCasePostgresRepositoryQueryError;
            });

          await tx
            .insert(auditLogEventsTable)
            .values(toAuditLogInsertRecord(upsertResult.auditEvent))
            .execute()
            .catch((cause) => {
              throw {
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause,
              } satisfies AuditLogPostgresRepositoryPersistenceError;
            });
        });

        return upsertResult.case;
      },
      catch: mapSupportCasePersistenceCause,
    }),
  persistStartedImpersonation: (grant) =>
    createSupportOperationsImpersonationSessionRecord(grant).pipe(
      Effect.flatMap((session) =>
        Effect.tryPromise({
          try: async () => {
            await input.database.transaction(async (tx) => {
              await tx
                .insert(supportOperationsImpersonationSessionsTable)
                .values(toImpersonationSessionInsertRecord(session))
                .onConflictDoUpdate({
                  target: supportOperationsImpersonationSessionsTable.caseId,
                  set: {
                    supportAgent: session.supportAgent,
                    impersonatedUser: session.impersonatedUser,
                    startedAt: new Date(session.startedAt),
                    durationMinutes: session.durationMinutes,
                    status: session.status,
                    approvedBy: session.approvedBy,
                    reason: session.reason,
                    expiresAt: new Date(session.expiresAt),
                  },
                })
                .execute()
                .catch((cause) => {
                  throw {
                    _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
                    operation: "upsertImpersonationSession",
                    cause,
                  } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
                });

              await tx
                .insert(auditLogEventsTable)
                .values(toAuditLogInsertRecord(grant.auditEvent))
                .execute()
                .catch((cause) => {
                  throw {
                    _tag: "AuditLogPostgresRepositoryPersistenceError",
                    operation: "insertAuditEvent",
                    cause,
                  } satisfies AuditLogPostgresRepositoryPersistenceError;
                });
            });

            return grant;
          },
          catch: mapImpersonationPersistenceCause,
        }),
      ),
    ),
  compareAndSetImpersonationSessionStatus: ({
    session,
    expectedStatus,
    nextStatus,
  }) => {
    const transitionedSession = {
      ...session,
      status: nextStatus,
    } satisfies SupportOperationsImpersonationSessionRecord;

    return Effect.tryPromise({
      try: async () => {
        const updatedSessions = await input.database
          .update(supportOperationsImpersonationSessionsTable)
          .set(toImpersonationSessionInsertRecord(transitionedSession))
          .where(
            and(
              eq(
                supportOperationsImpersonationSessionsTable.caseId,
                session.caseId,
              ),
              eq(
                supportOperationsImpersonationSessionsTable.status,
                expectedStatus,
              ),
            ),
          )
          .returning()
          .catch((cause) => {
            throw {
              _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
              operation: "updateImpersonationSession",
              cause,
            } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
          });

        return updatedSessions[0] !== undefined;
      },
      catch: (cause) => {
        if (
          isTaggedCause(
            cause,
            "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
          )
        ) {
          return cause as SupportOperationsImpersonationSessionPostgresRepositoryError;
        }

        return {
          _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
          operation: "updateImpersonationSession",
          cause,
        } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
      },
    }).pipe(
      Effect.flatMap((didUpdate) =>
        didUpdate
          ? Effect.succeed(transitionedSession)
          : input.impersonationSessionRepository.getImpersonationSession(
              session.caseId,
            ),
      ),
    );
  },
  upsertImpersonationSession: (session) =>
    input.impersonationSessionRepository.upsertImpersonationSession(session),
  listImpersonationSessions: (status) =>
    input.impersonationSessionRepository.listImpersonationSessions(status),
  getImpersonationSession: (caseId) =>
    input.impersonationSessionRepository.getImpersonationSession(caseId),
  persistRevokedImpersonationSession: (revocationResult) =>
    Effect.tryPromise({
      try: async () => {
        await input.database.transaction(async (tx) => {
          const updatedSessions = await tx
            .update(supportOperationsImpersonationSessionsTable)
            .set(toImpersonationSessionInsertRecord(revocationResult.session))
            .where(
              and(
                eq(
                  supportOperationsImpersonationSessionsTable.caseId,
                  revocationResult.session.caseId,
                ),
                inArray(
                  supportOperationsImpersonationSessionsTable.status,
                  supportOperationsImpersonationSessionRevocationFinalizableStatuses,
                ),
              ),
            )
            .returning()
            .catch((cause) => {
              throw {
                _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
                operation: "updateImpersonationSession",
                cause,
              } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
            });

          if (updatedSessions[0] === undefined) {
            const existingSessions = await tx
              .select()
              .from(supportOperationsImpersonationSessionsTable)
              .where(
                eq(
                  supportOperationsImpersonationSessionsTable.caseId,
                  revocationResult.session.caseId,
                ),
              )
              .catch((cause) => {
                throw {
                  _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
                  operation: "getImpersonationSession",
                  cause,
                } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
              });

            const existingSession = existingSessions[0];

            if (existingSession === undefined) {
              throw {
                _tag: "SupportOperationsImpersonationSessionNotFoundError",
                caseId: revocationResult.session.caseId,
              } satisfies SupportOperationsImpersonationSessionNotFoundError;
            }

            if (
              existingSession.status ===
              supportOperationsImpersonationSessionStatus.revoked
            ) {
              throw {
                _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
                caseId: revocationResult.session.caseId,
              } satisfies SupportOperationsImpersonationSessionAlreadyRevokedError;
            }

            throw {
              _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
              operation: "updateImpersonationSession",
              cause: new Error(
                `Unexpected impersonation-session status for ${revocationResult.session.caseId}.`,
              ),
            } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError;
          }

          await tx
            .insert(auditLogEventsTable)
            .values(toAuditLogInsertRecord(revocationResult.auditEvent))
            .execute()
            .catch((cause) => {
              throw {
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause,
              } satisfies AuditLogPostgresRepositoryPersistenceError;
            });
        });

        return revocationResult.session;
      },
      catch: mapImpersonationRevocationPersistenceCause,
    }),
  persistGrantedBreakGlass: (grant) =>
    createSupportOperationsBreakGlassIncidentRecord(grant).pipe(
      Effect.flatMap((incident) =>
        Effect.tryPromise({
          try: async () => {
            await input.database.transaction(async (tx) => {
              await tx
                .insert(supportOperationsBreakGlassIncidentsTable)
                .values(toBreakGlassIncidentInsertRecord(incident))
                .onConflictDoUpdate({
                  target: supportOperationsBreakGlassIncidentsTable.caseId,
                  set: {
                    supportAgent: incident.supportAgent,
                    startedAt: new Date(incident.startedAt),
                    status: incident.status,
                    approvedBy: incident.approvedBy,
                    reason: incident.reason,
                    expiresAt: new Date(incident.expiresAt),
                  },
                })
                .execute()
                .catch((cause) => {
                  throw {
                    _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
                    operation: "upsertBreakGlassIncident",
                    cause,
                  } satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError;
                });

              await tx
                .insert(auditLogEventsTable)
                .values(toAuditLogInsertRecord(grant.auditEvent))
                .execute()
                .catch((cause) => {
                  throw {
                    _tag: "AuditLogPostgresRepositoryPersistenceError",
                    operation: "insertAuditEvent",
                    cause,
                  } satisfies AuditLogPostgresRepositoryPersistenceError;
                });
            });

            return grant;
          },
          catch: mapGrantPersistenceCause,
        }),
      ),
    ),
  listBreakGlassIncidents: (status) =>
    input.breakGlassIncidentRepository.listBreakGlassIncidents(status),
  getBreakGlassIncident: (caseId) =>
    input.breakGlassIncidentRepository.getBreakGlassIncident(caseId),
  persistReviewedBreakGlassIncident: (reviewResult) =>
    Effect.tryPromise({
      try: async () => {
        await input.database.transaction(async (tx) => {
          const updatedIncidents = await tx
            .update(supportOperationsBreakGlassIncidentsTable)
            .set(toBreakGlassIncidentInsertRecord(reviewResult.incident))
            .where(
              and(
                eq(
                  supportOperationsBreakGlassIncidentsTable.caseId,
                  reviewResult.incident.caseId,
                ),
                eq(
                  supportOperationsBreakGlassIncidentsTable.status,
                  supportOperationsBreakGlassIncidentStatus.pendingReview,
                ),
              ),
            )
            .returning()
            .catch((cause) => {
              throw {
                _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
                operation: "upsertBreakGlassIncident",
                cause,
              } satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError;
            });

          if (updatedIncidents[0] === undefined) {
            const existingIncidents = await tx
              .select()
              .from(supportOperationsBreakGlassIncidentsTable)
              .where(
                eq(
                  supportOperationsBreakGlassIncidentsTable.caseId,
                  reviewResult.incident.caseId,
                ),
              )
              .catch((cause) => {
                throw {
                  _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
                  operation: "getBreakGlassIncident",
                  cause,
                } satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError;
              });

            const existingIncident = existingIncidents[0];

            if (existingIncident === undefined) {
              throw {
                _tag: "SupportOperationsBreakGlassIncidentNotFoundError",
                caseId: reviewResult.incident.caseId,
              } satisfies SupportOperationsBreakGlassIncidentNotFoundError;
            }

            if (
              existingIncident.status ===
              supportOperationsBreakGlassIncidentStatus.reviewed
            ) {
              throw {
                _tag: "BreakGlassIncidentAlreadyReviewedError",
                caseId: reviewResult.incident.caseId,
              } satisfies BreakGlassIncidentAlreadyReviewedError;
            }

            throw {
              _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
              operation: "upsertBreakGlassIncident",
              cause: new Error(
                `Unexpected break-glass incident status for ${reviewResult.incident.caseId}.`,
              ),
            } satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError;
          }

          await tx
            .insert(auditLogEventsTable)
            .values(toAuditLogInsertRecord(reviewResult.auditEvent))
            .execute()
            .catch((cause) => {
              throw {
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause,
              } satisfies AuditLogPostgresRepositoryPersistenceError;
            });
        });

        return reviewResult.incident;
      },
      catch: mapReviewPersistenceCause,
    }),
});

const compensateFailedImpersonationPersistence = (input: {
  readonly keycloak: Pick<KeycloakAdapterService, "revokeSession">;
  readonly grant: SupportImpersonationGrant;
  readonly persistenceFailure: SupportOperationsImpersonationPersistenceError;
}) =>
  input.keycloak
    .revokeSession({
      sessionId: input.grant.grantedRequestContext.sessionId,
    })
    .pipe(
      Effect.catchAll((revocationFailure) =>
        Effect.fail({
          _tag: "SupportOperationsImpersonationCompensationError",
          sessionId: input.grant.grantedRequestContext.sessionId,
          persistenceFailure: input.persistenceFailure,
          revocationFailure,
        } satisfies SupportOperationsImpersonationCompensationError),
      ),
      Effect.zipRight(Effect.fail(input.persistenceFailure)),
    );

const isAlreadyRevokedKeycloakSessionFailure = (
  revocationFailure: KeycloakAdapterRequestError | ParseResult.ParseError,
): revocationFailure is KeycloakAdapterRequestError =>
  revocationFailure._tag === "KeycloakAdapterRequestError" &&
  revocationFailure.operation === "sessionRevocation" &&
  revocationFailure.status === 404;

const ensureImpersonationSessionRevokedInKeycloak = (input: {
  readonly keycloak: Pick<KeycloakAdapterService, "revokeSession">;
  readonly sessionId: string;
}) =>
  input.keycloak
    .revokeSession({
      sessionId: input.sessionId,
    })
    .pipe(
      Effect.catchAll((revocationFailure) =>
        isAlreadyRevokedKeycloakSessionFailure(revocationFailure)
          ? Effect.void
          : Effect.fail(revocationFailure),
      ),
    );

const resolvePendingImpersonationSessionForRevocation = (input: {
  readonly persistence: SupportOperationsPersistence;
  readonly session: SupportOperationsImpersonationSessionRecord;
}): Effect.Effect<
  SupportOperationsImpersonationSessionRecord,
  | SupportOperationsImpersonationSessionNotFoundError
  | SupportOperationsImpersonationSessionAlreadyRevokedError
  | SupportOperationsImpersonationSessionNoLongerActiveError
  | SupportOperationsImpersonationSessionPostgresRepositoryError
> =>
  Effect.gen(function* () {
    const pendingSession =
      yield* input.persistence.compareAndSetImpersonationSessionStatus({
        session: input.session,
        expectedStatus: supportOperationsImpersonationSessionStatus.active,
        nextStatus:
          supportOperationsImpersonationSessionStatus.revocationPending,
      });

    if (pendingSession === undefined) {
      return yield* Effect.fail({
        _tag: "SupportOperationsImpersonationSessionNotFoundError",
        caseId: input.session.caseId,
      } satisfies SupportOperationsImpersonationSessionNotFoundError);
    }

    if (
      pendingSession.status ===
      supportOperationsImpersonationSessionStatus.revoked
    ) {
      return yield* Effect.fail({
        _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
        caseId: pendingSession.caseId,
      } satisfies SupportOperationsImpersonationSessionAlreadyRevokedError);
    }

    if (
      pendingSession.status ===
      supportOperationsImpersonationSessionStatus.expired
    ) {
      return yield* Effect.fail({
        _tag: "SupportOperationsImpersonationSessionNoLongerActiveError",
        caseId: pendingSession.caseId,
        status: pendingSession.status,
      } satisfies SupportOperationsImpersonationSessionNoLongerActiveError);
    }

    if (
      pendingSession.status !==
      supportOperationsImpersonationSessionStatus.revocationPending
    ) {
      return yield* Effect.fail({
        _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
        operation: "updateImpersonationSession",
        cause: new Error(
          `Unexpected impersonation-session status for ${pendingSession.caseId}.`,
        ),
      } satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError);
    }

    return pendingSession;
  });

const resolveImpersonationSessionForRevocation = (
  persistence: SupportOperationsPersistence,
  caseId: string,
): Effect.Effect<
  SupportOperationsImpersonationSessionRecord,
  | SupportOperationsImpersonationSessionNotFoundError
  | SupportOperationsImpersonationSessionNoLongerActiveError
  | SupportOperationsImpersonationSessionPostgresRepositoryError
> =>
  Effect.gen(function* () {
    const session = yield* persistence.getImpersonationSession(caseId);

    if (session === undefined) {
      return yield* Effect.fail({
        _tag: "SupportOperationsImpersonationSessionNotFoundError",
        caseId,
      } satisfies SupportOperationsImpersonationSessionNotFoundError);
    }

    const resolvedSession = yield* maybeExpireImpersonationSession(
      persistence,
      session,
    );

    if (
      resolvedSession.status ===
      supportOperationsImpersonationSessionStatus.expired
    ) {
      return yield* Effect.fail({
        _tag: "SupportOperationsImpersonationSessionNoLongerActiveError",
        caseId,
        status: resolvedSession.status,
      } satisfies SupportOperationsImpersonationSessionNoLongerActiveError);
    }

    return resolvedSession;
  });

const resolveBreakGlassIncidentForReview = (
  persistence: SupportOperationsPersistence,
  caseId: string,
): Effect.Effect<
  SupportOperationsBreakGlassIncidentRecord,
  | SupportOperationsBreakGlassIncidentNotFoundError
  | SupportOperationsBreakGlassIncidentPostgresRepositoryError
> =>
  persistence.getBreakGlassIncident(caseId).pipe(
    Effect.flatMap((incident) =>
      incident === undefined
        ? Effect.fail({
            _tag: "SupportOperationsBreakGlassIncidentNotFoundError",
            caseId,
          } satisfies SupportOperationsBreakGlassIncidentNotFoundError)
        : Effect.succeed(incident),
    ),
  );

export const makeSupportOperationsService = (dependencies: {
  readonly auditLogRepository: AuditLogPostgresRepositoryService;
  readonly persistence: SupportOperationsPersistence;
  readonly workflowJobs: Pick<
    WorkflowJobsPostgresRepositoryService,
    "listRepairGapWorkflowJobs"
  >;
}) =>
  Effect.gen(function* () {
    const fieldSecurity = yield* FieldSecurityModule;
    const keycloak = yield* KeycloakAdapter;
    const valkey = yield* ValkeyAdapter;
    const supportOperations = yield* SupportOperationsModule;

    return {
      startImpersonation: (input: SupportOperationsStartImpersonationRequest) =>
        Schema.decodeUnknown(SupportOperationsStartImpersonationRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                resolveApprovedBy(requestContext).pipe(
                  Effect.flatMap((approvedBy) =>
                    supportOperations.startImpersonation({
                      requestContext,
                      impersonatedActorId: request.impersonatedActorId,
                      approvedBy,
                      reason: request.reason,
                      requestedDurationMinutes:
                        request.requestedDurationMinutes,
                    }),
                  ),
                ),
              ),
              Effect.flatMap((grant) =>
                dependencies.persistence
                  .persistStartedImpersonation(grant)
                  .pipe(
                    Effect.catchAll((persistenceFailure) =>
                      compensateFailedImpersonationPersistence({
                        keycloak,
                        grant,
                        persistenceFailure,
                      }),
                    ),
                  ),
              ),
            ),
          ),
        ),
      getTenantHealth: (input: SupportOperationsGetTenantHealthRequest) =>
        Schema.decodeUnknown(SupportOperationsGetTenantHealthRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    Effect.all({
                      supportCases: dependencies.persistence.listSupportCases({
                        tenantScope: request.tenantScope,
                        tenantScopeId: request.tenantScopeId,
                      }),
                      repairGapJobs:
                        dependencies.workflowJobs.listRepairGapWorkflowJobs({
                          sourceModuleId: platformModuleId.billingAndMetering,
                          tenantScope: request.tenantScope,
                          tenantScopeId: request.tenantScopeId,
                        }),
                    }),
                  ),
                  Effect.flatMap(({ supportCases, repairGapJobs }) =>
                    projectTenantHealthView({
                      fieldSecurity,
                      requestContext,
                      tenantScope: request.tenantScope,
                      tenantScopeId: request.tenantScopeId,
                      supportCases: supportCases.filter(
                        (supportCase) =>
                          supportCase.tenantScope === request.tenantScope &&
                          supportCase.tenantScopeId === request.tenantScopeId,
                      ),
                      repairGapJobs: repairGapJobs.filter(
                        (job) =>
                          job.tenantScope === request.tenantScope &&
                          job.tenantScopeId === request.tenantScopeId,
                      ),
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      upsertCase: (input: SupportOperationsUpsertCaseRequest) =>
        Schema.decodeUnknown(SupportOperationsUpsertCaseRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    dependencies.persistence.getSupportCase(request.caseId),
                  ),
                  Effect.flatMap((existingCase) =>
                    supportOperations.upsertSupportCase({
                      requestContext,
                      caseId: request.caseId,
                      tenantScope: request.tenantScope,
                      tenantScopeId: request.tenantScopeId,
                      summary: request.summary,
                      status: request.status,
                      priority: request.priority,
                      changeReason: request.changeReason,
                      ...(existingCase === undefined ? {} : { existingCase }),
                    }),
                  ),
                  Effect.flatMap((upsertResult) =>
                    dependencies.persistence.persistUpsertedSupportCase(
                      upsertResult,
                    ),
                  ),
                  Effect.flatMap((supportCase) =>
                    resolveSupportSafeProjection(
                      platformModuleId.supportOperations,
                    ).pipe(
                      Effect.flatMap((projection) =>
                        projectSupportCaseSupportView({
                          fieldSecurity,
                          requestContext,
                          projection,
                          supportCase,
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      listCases: (input: SupportOperationsListCasesRequest) =>
        Schema.decodeUnknown(SupportOperationsListCasesRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    listSupportOperationsCases({
                      persistence: dependencies.persistence,
                      ...(request.status === undefined
                        ? {}
                        : { status: request.status }),
                    }),
                  ),
                  Effect.flatMap((supportCases) =>
                    projectSupportCaseSupportViewList({
                      fieldSecurity,
                      requestContext,
                      supportCases,
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      listImpersonationSessions: (
        input: SupportOperationsListImpersonationSessionsRequest,
      ) =>
        Schema.decodeUnknown(
          SupportOperationsListImpersonationSessionsRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    listSupportOperationsImpersonationSessions({
                      persistence: dependencies.persistence,
                      ...(request.status === undefined
                        ? {}
                        : { status: request.status }),
                    }),
                  ),
                  Effect.flatMap((sessions) =>
                    projectImpersonationSessionSupportViewList({
                      fieldSecurity,
                      requestContext,
                      sessions,
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      revokeImpersonationSession: (
        input: SupportOperationsRevokeImpersonationSessionRequest,
      ) =>
        Schema.decodeUnknown(
          SupportOperationsRevokeImpersonationSessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    resolveImpersonationSessionForRevocation(
                      dependencies.persistence,
                      request.caseId,
                    ),
                  ),
                  Effect.flatMap((session) => {
                    if (
                      session.status ===
                      supportOperationsImpersonationSessionStatus.revoked
                    ) {
                      return Effect.fail({
                        _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
                        caseId: session.caseId,
                      } satisfies SupportOperationsImpersonationSessionAlreadyRevokedError);
                    }

                    if (
                      session.status ===
                      supportOperationsImpersonationSessionStatus.revocationPending
                    ) {
                      return ensureImpersonationSessionRevokedInKeycloak({
                        keycloak,
                        sessionId: session.caseId,
                      }).pipe(
                        Effect.flatMap(() =>
                          revokeSupportOperationsImpersonationSession({
                            requestContext,
                            session,
                            revocationReason: request.revocationReason,
                          }),
                        ),
                        Effect.flatMap((revocationResult) =>
                          dependencies.persistence.persistRevokedImpersonationSession(
                            revocationResult,
                          ),
                        ),
                      );
                    }

                    return resolvePendingImpersonationSessionForRevocation({
                      persistence: dependencies.persistence,
                      session,
                    }).pipe(
                      Effect.flatMap((pendingSession) =>
                        ensureImpersonationSessionRevokedInKeycloak({
                          keycloak,
                          sessionId: pendingSession.caseId,
                        }).pipe(Effect.as(pendingSession)),
                      ),
                      Effect.flatMap((pendingSession) =>
                        revokeSupportOperationsImpersonationSession({
                          requestContext,
                          session: pendingSession,
                          revocationReason: request.revocationReason,
                        }),
                      ),
                      Effect.flatMap((revocationResult) =>
                        dependencies.persistence.persistRevokedImpersonationSession(
                          revocationResult,
                        ),
                      ),
                    );
                  }),
                  Effect.flatMap((session) =>
                    resolveSupportSafeProjection(
                      platformModuleId.supportOperations,
                    ).pipe(
                      Effect.flatMap((projection) =>
                        projectImpersonationSessionSupportView({
                          fieldSecurity,
                          requestContext,
                          projection,
                          session,
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      grantBreakGlassAccess: (input: SupportOperationsGrantBreakGlassRequest) =>
        Schema.decodeUnknown(SupportOperationsGrantBreakGlassRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                resolveApprovedBy(requestContext).pipe(
                  Effect.flatMap((approvedBy) =>
                    supportOperations.grantBreakGlassAccess({
                      requestContext,
                      approvedBy,
                      reason: request.reason,
                      expiresAt: request.expiresAt,
                    }),
                  ),
                ),
              ),
              Effect.flatMap((grant) =>
                dependencies.persistence.persistGrantedBreakGlass(grant),
              ),
            ),
          ),
        ),
      listBreakGlassIncidents: (
        input: SupportOperationsListBreakGlassIncidentsRequest,
      ) =>
        Schema.decodeUnknown(
          SupportOperationsListBreakGlassIncidentsRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    dependencies.persistence.listBreakGlassIncidents(
                      request.status,
                    ),
                  ),
                  Effect.flatMap((incidents) =>
                    projectBreakGlassIncidentSupportViewList({
                      fieldSecurity,
                      requestContext,
                      incidents,
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      getBreakGlassIncident: (
        input: SupportOperationsGetBreakGlassIncidentRequest,
      ) =>
        Schema.decodeUnknown(
          SupportOperationsGetBreakGlassIncidentRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    dependencies.persistence.getBreakGlassIncident(
                      request.caseId,
                    ),
                  ),
                  Effect.flatMap((incident) =>
                    Effect.fromNullable(incident).pipe(
                      Effect.orElseFail(
                        (): SupportOperationsBreakGlassIncidentNotFoundError => ({
                          _tag: "SupportOperationsBreakGlassIncidentNotFoundError",
                          caseId: request.caseId,
                        }),
                      ),
                    ),
                  ),
                  Effect.flatMap((incident) =>
                    resolveSupportSafeProjection(
                      platformModuleId.supportOperations,
                    ).pipe(
                      Effect.flatMap((projection) =>
                        projectBreakGlassIncidentSupportView({
                          fieldSecurity,
                          requestContext,
                          projection,
                          incident,
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      reviewBreakGlassIncident: (
        input: SupportOperationsReviewBreakGlassIncidentRequest,
      ) =>
        Schema.decodeUnknown(
          SupportOperationsReviewBreakGlassIncidentRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            resolveIdentitySessionRequestContext(valkey, {
              sessionId: request.sessionId,
            }).pipe(
              Effect.flatMap((requestContext) =>
                ensureSupportOperationsReadAccess(
                  supportOperations,
                  requestContext,
                ).pipe(
                  Effect.flatMap(() =>
                    resolveBreakGlassIncidentForReview(
                      dependencies.persistence,
                      request.caseId,
                    ),
                  ),
                  Effect.flatMap((incident) =>
                    reviewSupportOperationsBreakGlassIncident({
                      requestContext,
                      incident,
                      reviewReason: request.reviewReason,
                    }),
                  ),
                  Effect.flatMap((reviewResult) =>
                    dependencies.persistence.persistReviewedBreakGlassIncident(
                      reviewResult,
                    ),
                  ),
                  Effect.flatMap((incident) =>
                    resolveSupportSafeProjection(
                      platformModuleId.supportOperations,
                    ).pipe(
                      Effect.flatMap((projection) =>
                        projectBreakGlassIncidentSupportView({
                          fieldSecurity,
                          requestContext,
                          projection,
                          incident,
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
    } satisfies SupportOperationsService;
  });

export const buildSupportOperationsCaseListQuery = (
  database: PostgresRuntimeDatabase,
  input?: SupportOperationsCaseListInput,
) => {
  const predicate = buildSupportOperationsCaseListPredicate(input);
  const query = database.select().from(supportOperationsCasesTable);

  return (predicate === undefined ? query : query.where(predicate)).orderBy(
    desc(supportOperationsCasesTable.lastUpdatedAt),
  );
};

export const buildSupportOperationsCaseListPredicate = (
  input?: SupportOperationsCaseListInput,
) => {
  const filters = [
    ...(typeof input === "string"
      ? [eq(supportOperationsCasesTable.status, input)]
      : []),
    ...(typeof input === "object" &&
    input !== null &&
    input.status !== undefined
      ? [eq(supportOperationsCasesTable.status, input.status)]
      : []),
    ...(typeof input === "object" &&
    input !== null &&
    input.tenantScope !== undefined
      ? [eq(supportOperationsCasesTable.tenantScope, input.tenantScope)]
      : []),
    ...(typeof input === "object" &&
    input !== null &&
    input.tenantScopeId !== undefined
      ? [eq(supportOperationsCasesTable.tenantScopeId, input.tenantScopeId)]
      : []),
  ];

  return filters.length === 0 ? undefined : and(...filters);
};

const makeSupportOperationsRuntime = (
  options: SupportOperationsRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const valkey = yield* makeValkeyAdapter({
      url: options.valkeyUrl,
    });
    const keycloak = yield* makeKeycloakAdapter({
      baseUrl: options.keycloakBaseUrl,
      realm: options.keycloakRealm,
      clientId: options.keycloakClientId,
      clientSecret: options.keycloakClientSecret,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
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
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
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
    const supportCaseQueryable: SupportOperationsCasePostgresQueryable = {
      upsertSupportCase: (record) =>
        postgres.database
          .insert(supportOperationsCasesTable)
          .values(record)
          .onConflictDoUpdate({
            target: supportOperationsCasesTable.caseId,
            set: {
              supportAgent: record.supportAgent,
              tenantScope: record.tenantScope,
              tenantScopeId: record.tenantScopeId,
              summary: record.summary,
              status: record.status,
              priority: record.priority,
              lastUpdatedAt: record.lastUpdatedAt,
            },
          })
          .returning()
          .then((rows) => rows[0]!),
      getSupportCase: (caseId) =>
        postgres.database
          .select()
          .from(supportOperationsCasesTable)
          .where(eq(supportOperationsCasesTable.caseId, caseId))
          .then((rows) => rows[0]),
      listSupportCases: (input?: SupportOperationsCaseListInput) =>
        buildSupportOperationsCaseListQuery(postgres.database, input),
    };
    const impersonationSessionQueryable: SupportOperationsImpersonationSessionPostgresQueryable =
      {
        upsertImpersonationSession: (record) =>
          postgres.database
            .insert(supportOperationsImpersonationSessionsTable)
            .values(record)
            .onConflictDoUpdate({
              target: supportOperationsImpersonationSessionsTable.caseId,
              set: {
                supportAgent: record.supportAgent,
                impersonatedUser: record.impersonatedUser,
                startedAt: record.startedAt,
                durationMinutes: record.durationMinutes,
                status: record.status,
                approvedBy: record.approvedBy,
                reason: record.reason,
                expiresAt: record.expiresAt,
              },
            })
            .returning()
            .then((rows) => rows[0]!),
        getImpersonationSession: (caseId) =>
          postgres.database
            .select()
            .from(supportOperationsImpersonationSessionsTable)
            .where(
              eq(supportOperationsImpersonationSessionsTable.caseId, caseId),
            )
            .then((rows) => rows[0]),
        listImpersonationSessions: (
          status?: SupportOperationsImpersonationSessionStatus,
        ) =>
          status === undefined
            ? postgres.database
                .select()
                .from(supportOperationsImpersonationSessionsTable)
                .orderBy(
                  desc(supportOperationsImpersonationSessionsTable.startedAt),
                )
            : postgres.database
                .select()
                .from(supportOperationsImpersonationSessionsTable)
                .where(
                  eq(
                    supportOperationsImpersonationSessionsTable.status,
                    status,
                  ),
                )
                .orderBy(
                  desc(supportOperationsImpersonationSessionsTable.startedAt),
                ),
      };
    const breakGlassIncidentQueryable: SupportOperationsBreakGlassIncidentPostgresQueryable =
      {
        upsertBreakGlassIncident: (record) =>
          postgres.database
            .insert(supportOperationsBreakGlassIncidentsTable)
            .values(record)
            .onConflictDoUpdate({
              target: supportOperationsBreakGlassIncidentsTable.caseId,
              set: {
                supportAgent: record.supportAgent,
                startedAt: record.startedAt,
                status: record.status,
                approvedBy: record.approvedBy,
                reason: record.reason,
                expiresAt: record.expiresAt,
              },
            })
            .returning()
            .then((rows) => rows[0]!),
        getBreakGlassIncident: (caseId) =>
          postgres.database
            .select()
            .from(supportOperationsBreakGlassIncidentsTable)
            .where(eq(supportOperationsBreakGlassIncidentsTable.caseId, caseId))
            .then((rows) => rows[0]),
        listBreakGlassIncidents: (
          status?: SupportOperationsBreakGlassIncidentStatus,
        ) =>
          status === undefined
            ? postgres.database
                .select()
                .from(supportOperationsBreakGlassIncidentsTable)
                .orderBy(
                  desc(supportOperationsBreakGlassIncidentsTable.startedAt),
                )
            : postgres.database
                .select()
                .from(supportOperationsBreakGlassIncidentsTable)
                .where(
                  eq(supportOperationsBreakGlassIncidentsTable.status, status),
                )
                .orderBy(
                  desc(supportOperationsBreakGlassIncidentsTable.startedAt),
                ),
      };
    const supportCaseRepository =
      yield* makeSupportOperationsCasePostgresRepository(supportCaseQueryable);
    const impersonationSessionRepository =
      yield* makeSupportOperationsImpersonationSessionPostgresRepository(
        impersonationSessionQueryable,
      );
    const breakGlassIncidentRepository =
      yield* makeSupportOperationsBreakGlassIncidentPostgresRepository(
        breakGlassIncidentQueryable,
      );
    const workflowJobsRepository = yield* makeWorkflowJobsPostgresRepository(
      writeDatabase,
      buildWorkflowJobsPostgresQueryable<BillingReconciliationWorkflowJobRecord>(
        writeDatabase,
      ),
    );
    const persistence = makeSupportOperationsPersistence({
      database: postgres.database,
      supportCaseRepository,
      breakGlassIncidentRepository,
      impersonationSessionRepository,
    });
    const fieldSecurity = yield* makeFieldSecurityModule();
    const supportOperationsModule = yield* makeSupportOperationsModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
    );
    const service = yield* makeSupportOperationsService({
      auditLogRepository,
      persistence,
      workflowJobs: workflowJobsRepository,
    }).pipe(
      Effect.provideService(FieldSecurityModule, fieldSecurity),
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(ValkeyAdapter, valkey),
      Effect.provideService(SupportOperationsModule, supportOperationsModule),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
      ]),
    };
  });

const runSupportOperationsWithResolvedOptions = <A, E>(
  options: SupportOperationsRuntimeOptions,
  use: (service: SupportOperationsService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeSupportOperationsRuntime(options);

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const resolveSupportOperationsRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(SupportOperationsProcessEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map(
      (resolvedEnvironment): SupportOperationsRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
        valkeyUrl: resolvedEnvironment.VALKEY_URL,
        keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
        keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
        keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
        keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
      }),
    ),
  );

export const runSupportOperationsFromOptions = <A, E>(
  options: SupportOperationsRuntimeOptions,
  use: (service: SupportOperationsService) => Effect.Effect<A, E>,
) =>
  Schema.decodeUnknown(SupportOperationsRuntimeOptionsSchema)(options).pipe(
    Effect.flatMap((resolvedOptions) =>
      runSupportOperationsWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runSupportOperationsFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: SupportOperationsService) => Effect.Effect<A, E>,
) =>
  resolveSupportOperationsRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runSupportOperationsWithResolvedOptions(resolvedOptions, use),
    ),
  );

export type SupportOperationsRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | ValkeyAdapterOperationError;
