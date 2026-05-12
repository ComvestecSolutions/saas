import { eq } from "drizzle-orm";
import { Cause, Context, Effect, ParseResult, Schema } from "effect";
import {
  findModuleManifest,
  importExportFeatureFlag,
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
} from "@comvestec/config";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  dataClassification,
  getManagedFileSummaryImportExportJobSource,
  importExportAuditAction,
  type ImportExportJobAdminView,
  type ImportExportJobFormat,
  type ImportExportJobReference,
  importExportJobFormat,
  importExportJobSource,
  ImportExportJobFormatSchema,
  ImportExportTenantScopeSchema,
  IsoTimestampSchema,
  managedFileUsage,
  permissionScope,
  platformModuleId,
  platformScope,
  retentionDataType,
  type RequestContext,
  SupportOperationsCaseSupportViewListSchema,
  type WorkflowJobSummary,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleError,
  type AuthorizationDelegatedCheckError,
  type AuthorizationModuleService,
  FileStorageModule,
  type FileStorageModuleError,
  hasPrivilegedBreakGlassAccess,
  type IdentitySessionRequestContextNotFoundError,
  IdentitySessionModule,
  ImportExportJobPostgresRepository,
  type ImportExportJobPostgresQueryable,
  ImportExportModule,
  type ImportExportModuleError,
  type ImportExportModuleService,
  type ImportExportManagedFileSummaryWorkflowJobRecord,
  ImportExportManagedFileSummaryWorkflowJobRecordSchema,
  type ImportExportSupportCaseSummaryWorkflowJobRecord,
  ImportExportSupportCaseSummaryWorkflowJobRecordSchema,
  makeAuthorizationModule,
  makeFileStorageModule,
  makeImportExportJobPostgresRepository,
  makeImportExportModule,
  makeSupportOperationsCasePostgresRepository,
  RuntimeConfigModule,
  RetentionLegalHoldModule,
  type RetentionLegalHoldModuleError,
  type RuntimeConfigModulePersistenceError,
  buildImportExportManagedFileSummaryWorkflowJobId,
  buildImportExportSupportCaseSummaryWorkflowJobId,
  buildWorkflowJobSummary,
  buildWorkflowJobsPostgresQueryable,
  importExportJobsTable,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  type SupportOperationsCasePostgresQueryable,
  type SupportOperationsCasePostgresRepositoryError,
  SupportOperationsCasePostgresRepository,
  supportOperationsCasesTable,
  type UnknownConfigKeyError,
  workflowJobRuntime,
  type WorkflowJobsPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
} from "@comvestec/modules";
import {
  type AuthenticatedConvexWorkflowClient,
  ConvexFileStorageAdapter,
  type ConvexScheduledWorkflowDispatch,
  type ConvexWorkflowExecutionError,
  makeAuthenticatedConvexWorkflowClient,
  makeConvexFileStorageAdapter,
  makePostgresAdapter,
  OryKetoAdapter,
  type PostgresRuntimeDatabase,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import { buildSupportOperationsCaseListQuery } from "../governance/support-operations";
import { buildWriteDatabase } from "../postgres-write-database";
import {
  makeSubscriberJourneyRuntime,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
  type SubscriberJourneyRuntimeOptions,
} from "./subscriber-journey";
import {
  createPlatformBusinessEventEmitterFromEnvironment,
  noopPlatformBusinessEventEmitter,
  platformBusinessEventName,
  type PlatformBusinessEventEmitter,
} from "./observability";
import { executeWorkflowJobRecord } from "./workflow-jobs";

const ImportExportTargetSchema = Schema.Struct({
  scope: ImportExportTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

type ImportExportTarget = Schema.Schema.Type<typeof ImportExportTargetSchema>;

export const RequestManagedFileSummaryExportBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: ImportExportTenantScopeSchema,
    scopeId: Schema.NonEmptyString,
    format: Schema.optional(ImportExportJobFormatSchema),
    scheduledAt: Schema.optional(IsoTimestampSchema),
  });

export type RequestManagedFileSummaryExportBySessionRequest =
  Schema.Schema.Type<
    typeof RequestManagedFileSummaryExportBySessionRequestSchema
  >;

export const RequestSupportCaseSummaryExportBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: ImportExportTenantScopeSchema,
    scopeId: Schema.NonEmptyString,
    scheduledAt: Schema.optional(IsoTimestampSchema),
  });

export type RequestSupportCaseSummaryExportBySessionRequest =
  Schema.Schema.Type<
    typeof RequestSupportCaseSummaryExportBySessionRequestSchema
  >;

export const GetImportExportJobBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  jobId: Schema.NonEmptyString,
});

export type GetImportExportJobBySessionRequest = Schema.Schema.Type<
  typeof GetImportExportJobBySessionRequestSchema
>;

export const RunImportExportManagedFileSummaryWorkflowJobRequestSchema =
  Schema.Struct({
    jobId: Schema.NonEmptyString,
  });

export type RunImportExportManagedFileSummaryWorkflowJobRequest =
  Schema.Schema.Type<
    typeof RunImportExportManagedFileSummaryWorkflowJobRequestSchema
  >;

export const RunImportExportSupportCaseSummaryWorkflowJobRequestSchema =
  Schema.Struct({
    jobId: Schema.NonEmptyString,
  });

export type RunImportExportSupportCaseSummaryWorkflowJobRequest =
  Schema.Schema.Type<
    typeof RunImportExportSupportCaseSummaryWorkflowJobRequestSchema
  >;

const ImportExportArtifactUploadResponseSchema = Schema.Struct({
  storageId: Schema.NonEmptyString,
});

type ImportExportWorkflowJobRecord =
  | ImportExportManagedFileSummaryWorkflowJobRecord
  | ImportExportSupportCaseSummaryWorkflowJobRecord;

const buildImportExportWorkflowJobRecordSchema = () =>
  Schema.Union(
    ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    ImportExportSupportCaseSummaryWorkflowJobRecordSchema,
  );

type ImportExportWorkflowJobsRepository =
  WorkflowJobsPostgresRepositoryServiceForRecord<ImportExportWorkflowJobRecord>;

const decodeImportExportManagedFileSummaryWorkflowJobRecord = (
  input: unknown,
) =>
  Schema.decodeUnknown(ImportExportManagedFileSummaryWorkflowJobRecordSchema)(
    input,
  );

const decodeImportExportSupportCaseSummaryWorkflowJobRecord = (
  input: unknown,
) =>
  Schema.decodeUnknown(ImportExportSupportCaseSummaryWorkflowJobRecordSchema)(
    input,
  );

type ImportExportWorkflowSchedulerClient = {
  readonly scheduleImportExportManagedFileSummaryWorkflowJob: (input: {
    readonly jobId: string;
    readonly scheduledAt: string;
  }) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleImportExportSupportCaseSummaryWorkflowJob: (input: {
    readonly jobId: string;
    readonly scheduledAt: string;
  }) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly runImportExportManagedFileSummaryWorkflowJob?: (
    input: { readonly jobId: string },
    options?: { readonly authToken: string },
  ) => Effect.Effect<
    null,
    ConvexWorkflowExecutionError | ImportExportWorkflowUnavailableError
  >;
  readonly runImportExportSupportCaseSummaryWorkflowJob?: (
    input: { readonly jobId: string },
    options?: { readonly authToken: string },
  ) => Effect.Effect<
    null,
    ConvexWorkflowExecutionError | ImportExportWorkflowUnavailableError
  >;
};

export type ImportExportFetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ImportExportDeclarationMissingError = {
  readonly _tag: "ImportExportDeclarationMissingError";
  readonly moduleId: typeof platformModuleId.importExport;
  readonly key: string;
};

export type ImportExportModuleDisabledError = {
  readonly _tag: "ImportExportModuleDisabledError";
  readonly scope: ImportExportTarget["scope"];
  readonly scopeId: string;
};

export type ImportExportUnauthenticatedActorError = {
  readonly _tag: "ImportExportUnauthenticatedActorError";
};

export type ImportExportAccessDeniedError = {
  readonly _tag: "ImportExportAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type ImportExportManagedFileSummaryExportBlockedError = {
  readonly _tag: "ImportExportManagedFileSummaryExportBlockedError";
  readonly scope: ImportExportTarget["scope"];
  readonly scopeId: string;
  readonly format: ImportExportJobFormat;
  readonly blockedTargetId: string;
  readonly reason: string;
};

export type ImportExportWorkflowUnavailableError = {
  readonly _tag: "ImportExportWorkflowUnavailableError";
  readonly dependency:
    | "convexWorkflowClient"
    | "workflowJobs"
    | "fetchImplementation";
};

export type ImportExportJobNotFoundError = {
  readonly _tag: "ImportExportJobNotFoundError";
  readonly jobId: string;
};

export type ImportExportArtifactUploadError = {
  readonly _tag: "ImportExportArtifactUploadError";
  readonly operation:
    | "hashArtifact"
    | "uploadArtifact"
    | "parseUploadArtifactResponse";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type ImportExportServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | ConvexWorkflowExecutionError
  | FileStorageModuleError
  | IdentitySessionRequestContextNotFoundError
  | ImportExportAccessDeniedError
  | ImportExportArtifactUploadError
  | ImportExportDeclarationMissingError
  | ImportExportJobNotFoundError
  | ImportExportManagedFileSummaryExportBlockedError
  | ImportExportModuleDisabledError
  | ImportExportModuleError
  | ImportExportUnauthenticatedActorError
  | ImportExportWorkflowUnavailableError
  | RetentionLegalHoldModuleError
  | RuntimeConfigModulePersistenceError
  | SupportOperationsCasePostgresRepositoryError
  | UnknownConfigKeyError
  | ValkeyAdapterOperationError
  | WorkflowJobsPostgresRepositoryError;

export type ImportExportServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs?: ImportExportWorkflowJobsRepository;
  readonly convexWorkflowClient?: ImportExportWorkflowSchedulerClient;
  readonly fetchImplementation?: ImportExportFetchImplementation;
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
};

export type ImportExportServiceApi = {
  readonly requestManagedFileSummaryExport: (
    input: RequestManagedFileSummaryExportBySessionRequest,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportServiceError>;
  readonly requestSupportCaseSummaryExport: (
    input: RequestSupportCaseSummaryExportBySessionRequest,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportServiceError>;
  readonly getImportExportJob: (
    input: GetImportExportJobBySessionRequest,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportServiceError>;
  readonly runImportExportManagedFileSummaryWorkflowJob: (
    input: RunImportExportManagedFileSummaryWorkflowJobRequest,
  ) => Effect.Effect<WorkflowJobSummary | undefined, ImportExportServiceError>;
  readonly runImportExportSupportCaseSummaryWorkflowJob: (
    input: RunImportExportSupportCaseSummaryWorkflowJobRequest,
  ) => Effect.Effect<WorkflowJobSummary | undefined, ImportExportServiceError>;
};

export class ImportExportService extends Context.Tag("ImportExportService")<
  ImportExportService,
  ImportExportServiceApi
>() {}

type AuthenticatedImportExportOperatorContext = RequestContext & {
  readonly actorId: string;
};

const decodeBoolean = Schema.decodeUnknown(Schema.Boolean);

const buildTargetTenantContext = (
  target: ImportExportTarget,
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

const requestTargetsCurrentTenant = (
  requestContext: RequestContext,
  target: ImportExportTarget,
) =>
  requestContext.tenant.scope === target.scope &&
  requestContext.tenant.scopeId === target.scopeId;

const ensureImportExportOperatorAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedImportExportOperatorContext,
  ImportExportUnauthenticatedActorError | ImportExportAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): ImportExportUnauthenticatedActorError => ({
        _tag: "ImportExportUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "ImportExportAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies ImportExportAccessDeniedError),
    ),
  );

const authorizeImportExportOperatorAccess = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: RequestContext;
  readonly target: ImportExportTarget;
}) =>
  Effect.gen(function* () {
    const authenticatedRequestContext = yield* ensureImportExportOperatorAccess(
      input.requestContext,
    );

    if (
      !requestTargetsCurrentTenant(authenticatedRequestContext, input.target) &&
      !hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
    ) {
      return yield* Effect.fail({
        _tag: "ImportExportAccessDeniedError",
        actorType: authenticatedRequestContext.actorType,
      } satisfies ImportExportAccessDeniedError);
    }

    const decision = yield* input.authorization.check({
      requestContext: authenticatedRequestContext,
      namespace: authorizationNamespace.module,
      object: platformModuleId.importExport,
      relation: authorizationRelation.admin,
      permissionScope: permissionScope.exportExecute,
    });

    return decision.allowed
      ? authenticatedRequestContext
      : yield* Effect.fail({
          _tag: "ImportExportAccessDeniedError",
          actorType: authenticatedRequestContext.actorType,
        } satisfies ImportExportAccessDeniedError);
  });

const requireImportExportFeatureFlag = () =>
  Effect.fromNullable(
    findModuleManifest(platformModuleId.importExport)?.featureFlags.find(
      (candidate) => candidate.key === importExportFeatureFlag.enabled,
    ),
  ).pipe(
    Effect.orElseFail(
      (): ImportExportDeclarationMissingError => ({
        _tag: "ImportExportDeclarationMissingError",
        moduleId: platformModuleId.importExport,
        key: importExportFeatureFlag.enabled,
      }),
    ),
  );

const ensureImportExportEnabled = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly target: ImportExportTarget;
}) =>
  Effect.gen(function* () {
    const flag = yield* requireImportExportFeatureFlag();
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.importExport,
    );
    const resolution = yield* input.runtimeConfig.resolveFeatureFlag({
      requestContext: requestTargetsCurrentTenant(
        input.requestContext,
        input.target,
      )
        ? input.requestContext
        : {
            ...input.requestContext,
            tenant: buildTargetTenantContext(input.target),
          },
      moduleId: platformModuleId.importExport,
      flag,
      overrides,
      entitlements: [],
    });
    const enabled = yield* decodeBoolean(resolution.effectiveValue);

    if (!enabled) {
      return yield* Effect.fail({
        _tag: "ImportExportModuleDisabledError",
        scope: input.target.scope,
        scopeId: input.target.scopeId,
      } satisfies ImportExportModuleDisabledError);
    }

    return true as const;
  });

const makeImportExportAuditAppend = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly requestContext: RequestContext;
  readonly action:
    | typeof importExportAuditAction.exportRequested
    | typeof importExportAuditAction.exportCompleted
    | typeof importExportAuditAction.exportInspected;
  readonly target: string;
  readonly reason: string;
}) =>
  input.auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.importExport,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

const hasExhaustedImportExportWorkflowRecoveryBudget = (attempts: number) =>
  attempts >= workflowJobsRetryMaxAttempts;

const readImportExportWorkflowFailureMessage = (error: unknown) => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    if ("reason" in error && typeof error.reason === "string") {
      return error.reason;
    }

    if ("_tag" in error && typeof error._tag === "string") {
      return error._tag;
    }

    if ("cause" in error && error.cause instanceof Error) {
      return error.cause.message;
    }
  }

  return "Import-export workflow job failed.";
};

const buildImportExportManagedFileSummaryExportBlockedError = (input: {
  readonly target: ImportExportTarget;
  readonly format: ImportExportJobFormat;
  readonly blockedTargetId: string;
}): ImportExportManagedFileSummaryExportBlockedError => ({
  _tag: "ImportExportManagedFileSummaryExportBlockedError",
  scope: input.target.scope,
  scopeId: input.target.scopeId,
  format: input.format,
  blockedTargetId: input.blockedTargetId,
  reason: `Managed-file summary export is blocked by an active retention legal hold on ${input.blockedTargetId}.`,
});

const ensureManagedFileSummaryExportAllowedByRetention = (input: {
  readonly retentionLegalHold: RetentionLegalHoldModule["Type"];
  readonly target: ImportExportTarget;
  readonly format: ImportExportJobFormat;
  readonly managedFiles: ReadonlyArray<{
    readonly fileId: string;
  }>;
}) =>
  Effect.forEach(
    input.managedFiles,
    (managedFile) =>
      input.retentionLegalHold
        .checkRetentionGuard({
          scope: input.target.scope,
          scopeId: input.target.scopeId,
          dataType: retentionDataType.fileObject,
          targetId: managedFile.fileId,
        })
        .pipe(
          Effect.flatMap((decision) =>
            decision.purgeBlocked
              ? Effect.fail(
                  buildImportExportManagedFileSummaryExportBlockedError({
                    target: input.target,
                    format: input.format,
                    blockedTargetId: managedFile.fileId,
                  }),
                )
              : Effect.void,
          ),
        ),
    { discard: true },
  );

const buildImportExportManagedFileSummaryWorkflowJobRecord = (input: {
  readonly jobId: string;
  readonly target: ImportExportTarget;
  readonly format: ImportExportJobFormat;
  readonly requestContext: AuthenticatedImportExportOperatorContext;
  readonly actorId: string;
  readonly correlationId: string;
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(ImportExportManagedFileSummaryWorkflowJobRecordSchema)({
    jobId: input.jobId,
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.importExport,
    kind: workflowJobKind.importExportManagedFileSummary,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.scheduled,
    tenantScope: input.target.scope,
    tenantScopeId: input.target.scopeId,
    attempts: 0,
    scheduledAt: input.scheduledAt,
    payload: {
      sourceModuleId: platformModuleId.importExport,
      tenantScope: input.target.scope,
      tenantScopeId: input.target.scopeId,
      requestContext: input.requestContext,
      actorId: input.actorId,
      correlationId: input.correlationId,
      source: getManagedFileSummaryImportExportJobSource(input.format),
      format: input.format,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildImportExportSupportCaseSummaryWorkflowJobRecord = (input: {
  readonly jobId: string;
  readonly target: ImportExportTarget;
  readonly requestContext: AuthenticatedImportExportOperatorContext;
  readonly actorId: string;
  readonly correlationId: string;
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(ImportExportSupportCaseSummaryWorkflowJobRecordSchema)({
    jobId: input.jobId,
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.importExport,
    kind: workflowJobKind.importExportSupportCaseSummary,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.scheduled,
    tenantScope: input.target.scope,
    tenantScopeId: input.target.scopeId,
    attempts: 0,
    scheduledAt: input.scheduledAt,
    payload: {
      sourceModuleId: platformModuleId.importExport,
      tenantScope: input.target.scope,
      tenantScopeId: input.target.scopeId,
      requestContext: input.requestContext,
      actorId: input.actorId,
      correlationId: input.correlationId,
      source: importExportJobSource.supportCaseSummaryJson,
      format: importExportJobFormat.json,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildImportExportManagedFileSummaryWorkflowDispatchRecord = (input: {
  readonly job: ImportExportManagedFileSummaryWorkflowJobRecord;
  readonly now: string;
  readonly dispatch: ConvexScheduledWorkflowDispatch;
}) =>
  Schema.decodeUnknown(ImportExportManagedFileSummaryWorkflowJobRecordSchema)({
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

const buildImportExportSupportCaseSummaryWorkflowDispatchRecord = (input: {
  readonly job: ImportExportSupportCaseSummaryWorkflowJobRecord;
  readonly now: string;
  readonly dispatch: ConvexScheduledWorkflowDispatch;
}) =>
  Schema.decodeUnknown(ImportExportSupportCaseSummaryWorkflowJobRecordSchema)({
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

const completeImportExportManagedFileSummaryWorkflowJob = (input: {
  readonly job: ImportExportManagedFileSummaryWorkflowJobRecord;
  readonly now: string;
}) =>
  Schema.decodeUnknown(ImportExportManagedFileSummaryWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.completed,
    completedAt: input.now,
    gapReason: undefined,
    lastError: undefined,
    updatedAt: input.now,
  });

const blockImportExportManagedFileSummaryWorkflowJob = (input: {
  readonly job: ImportExportManagedFileSummaryWorkflowJobRecord;
  readonly now: string;
  readonly lastError?: string;
}) =>
  Schema.decodeUnknown(ImportExportManagedFileSummaryWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.blocked,
    completedAt: input.now,
    ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
    gapReason: workflowJobGapReason.repairFailed,
    updatedAt: input.now,
  });

const completeImportExportSupportCaseSummaryWorkflowJob = (input: {
  readonly job: ImportExportSupportCaseSummaryWorkflowJobRecord;
  readonly now: string;
}) =>
  Schema.decodeUnknown(ImportExportSupportCaseSummaryWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.completed,
    completedAt: input.now,
    gapReason: undefined,
    lastError: undefined,
    updatedAt: input.now,
  });

const blockImportExportSupportCaseSummaryWorkflowJob = (input: {
  readonly job: ImportExportSupportCaseSummaryWorkflowJobRecord;
  readonly now: string;
  readonly lastError?: string;
}) =>
  Schema.decodeUnknown(ImportExportSupportCaseSummaryWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.blocked,
    completedAt: input.now,
    ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
    gapReason: workflowJobGapReason.repairFailed,
    updatedAt: input.now,
  });

const reflectImportExportManagedFileSummaryWorkflowJobTerminalState = (input: {
  readonly job: ImportExportManagedFileSummaryWorkflowJobRecord;
  readonly status:
    | typeof workflowJobStatus.completed
    | typeof workflowJobStatus.blocked;
  readonly completedAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
}) =>
  Schema.decodeUnknown(ImportExportManagedFileSummaryWorkflowJobRecordSchema)({
    ...input.job,
    status: input.status,
    completedAt: input.completedAt,
    ...(input.status === workflowJobStatus.completed
      ? {
          gapReason: undefined,
          lastError: undefined,
        }
      : {
          gapReason: workflowJobGapReason.repairFailed,
          ...(input.lastError !== undefined
            ? { lastError: input.lastError }
            : {}),
        }),
    updatedAt: input.updatedAt,
  });

const reflectImportExportSupportCaseSummaryWorkflowJobTerminalState = (input: {
  readonly job: ImportExportSupportCaseSummaryWorkflowJobRecord;
  readonly status:
    | typeof workflowJobStatus.completed
    | typeof workflowJobStatus.blocked;
  readonly completedAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
}) =>
  Schema.decodeUnknown(ImportExportSupportCaseSummaryWorkflowJobRecordSchema)({
    ...input.job,
    status: input.status,
    completedAt: input.completedAt,
    ...(input.status === workflowJobStatus.completed
      ? {
          gapReason: undefined,
          lastError: undefined,
        }
      : {
          gapReason: workflowJobGapReason.repairFailed,
          ...(input.lastError !== undefined
            ? { lastError: input.lastError }
            : {}),
        }),
    updatedAt: input.updatedAt,
  });

const reconcileImportExportManagedFileSummaryWorkflowJobWithModuleState =
  (input: {
    readonly importExport: Pick<
      ImportExportModuleService,
      "getImportExportJobRecord"
    >;
    readonly workflowJobs: ImportExportWorkflowJobsRepository;
    readonly job: ImportExportManagedFileSummaryWorkflowJobRecord;
    readonly now: string;
  }) =>
    input.importExport
      .getImportExportJobRecord({ jobId: input.job.jobId })
      .pipe(
        Effect.flatMap((record) => {
          if (record?.status === workflowJobStatus.completed) {
            return reflectImportExportManagedFileSummaryWorkflowJobTerminalState(
              {
                job: input.job,
                status: workflowJobStatus.completed,
                completedAt: record.completedAt ?? input.now,
                updatedAt: input.now,
              },
            ).pipe(
              Effect.flatMap((completedJob) =>
                input.workflowJobs.persistWorkflowJob(completedJob).pipe(
                  Effect.orElseSucceed(() => completedJob),
                  Effect.flatMap((record) =>
                    decodeImportExportManagedFileSummaryWorkflowJobRecord(
                      record,
                    ),
                  ),
                ),
              ),
            );
          }

          if (
            record?.status === workflowJobStatus.blocked ||
            record?.status === workflowJobStatus.failed
          ) {
            return reflectImportExportManagedFileSummaryWorkflowJobTerminalState(
              {
                job: input.job,
                status: workflowJobStatus.blocked,
                completedAt: record.completedAt ?? input.now,
                updatedAt: input.now,
                ...(record.lastError !== undefined
                  ? { lastError: record.lastError }
                  : {}),
              },
            ).pipe(
              Effect.flatMap((blockedJob) =>
                input.workflowJobs.persistWorkflowJob(blockedJob).pipe(
                  Effect.orElseSucceed(() => blockedJob),
                  Effect.flatMap((record) =>
                    decodeImportExportManagedFileSummaryWorkflowJobRecord(
                      record,
                    ),
                  ),
                ),
              ),
            );
          }

          return Effect.succeed(undefined);
        }),
      );

const reconcileImportExportSupportCaseSummaryWorkflowJobWithModuleState =
  (input: {
    readonly importExport: Pick<
      ImportExportModuleService,
      "getImportExportJobRecord"
    >;
    readonly workflowJobs: ImportExportWorkflowJobsRepository;
    readonly job: ImportExportSupportCaseSummaryWorkflowJobRecord;
    readonly now: string;
  }) =>
    input.importExport
      .getImportExportJobRecord({ jobId: input.job.jobId })
      .pipe(
        Effect.flatMap((record) => {
          if (record?.status === workflowJobStatus.completed) {
            return reflectImportExportSupportCaseSummaryWorkflowJobTerminalState(
              {
                job: input.job,
                status: workflowJobStatus.completed,
                completedAt: record.completedAt ?? input.now,
                updatedAt: input.now,
              },
            ).pipe(
              Effect.flatMap((completedJob) =>
                input.workflowJobs.persistWorkflowJob(completedJob).pipe(
                  Effect.orElseSucceed(() => completedJob),
                  Effect.flatMap((record) =>
                    decodeImportExportSupportCaseSummaryWorkflowJobRecord(
                      record,
                    ),
                  ),
                ),
              ),
            );
          }

          if (
            record?.status === workflowJobStatus.blocked ||
            record?.status === workflowJobStatus.failed
          ) {
            return reflectImportExportSupportCaseSummaryWorkflowJobTerminalState(
              {
                job: input.job,
                status: workflowJobStatus.blocked,
                completedAt: record.completedAt ?? input.now,
                updatedAt: input.now,
                ...(record.lastError !== undefined
                  ? { lastError: record.lastError }
                  : {}),
              },
            ).pipe(
              Effect.flatMap((blockedJob) =>
                input.workflowJobs.persistWorkflowJob(blockedJob).pipe(
                  Effect.orElseSucceed(() => blockedJob),
                  Effect.flatMap((record) =>
                    decodeImportExportSupportCaseSummaryWorkflowJobRecord(
                      record,
                    ),
                  ),
                ),
              ),
            );
          }

          return Effect.succeed(undefined);
        }),
      );

const shouldBlockStaleRunningImportExportWorkflowJob = (
  job: ImportExportWorkflowJobRecord,
) =>
  job.status === workflowJobStatus.running &&
  hasExhaustedImportExportWorkflowRecoveryBudget(job.attempts) &&
  Date.parse(job.updatedAt) <=
    Date.now() - workflowJobsRunningClaimTimeoutSeconds * 1_000;

const buildManagedFileSummaryArtifactFileName = (input: {
  readonly target: ImportExportTarget;
  readonly jobId: string;
  readonly format: ImportExportJobFormat;
}) =>
  [
    "managed-file-summary-export",
    input.target.scope,
    input.target.scopeId,
    input.jobId.replaceAll(":", "-"),
    input.format,
  ].join(".");

const buildSupportCaseSummaryArtifactFileName = (input: {
  readonly target: ImportExportTarget;
  readonly jobId: string;
}) =>
  [
    "support-case-summary-export",
    input.target.scope,
    input.target.scopeId,
    input.jobId.replaceAll(":", "-"),
    importExportJobFormat.json,
  ].join(".");

const escapeCsvField = (value: string) => {
  const formulaSafeValue = /^[\t\r\n]*[=+\-@]/.test(value)
    ? `'${value}`
    : value;

  return /[",\n\r]/.test(formulaSafeValue)
    ? `"${formulaSafeValue.replaceAll('"', '""')}"`
    : formulaSafeValue;
};

const buildManagedFileSummaryCsvArtifact = (input: {
  readonly managedFiles: readonly {
    readonly fileId: string;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly deletedAt?: string;
  }[];
}) =>
  [
    ["fileId", "fileName", "contentType", "sizeBytes", "deletedAt"].join(","),
    ...input.managedFiles.map((managedFile) =>
      [
        managedFile.fileId,
        managedFile.fileName,
        managedFile.contentType,
        String(managedFile.sizeBytes),
        managedFile.deletedAt ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ].join("\n");

const buildManagedFileSummaryArtifact = (input: {
  readonly managedFiles: readonly {
    readonly fileId: string;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly deletedAt?: string;
  }[];
  readonly format: ImportExportJobFormat;
}) => {
  if (input.format === importExportJobFormat.csv) {
    return {
      body: buildManagedFileSummaryCsvArtifact({
        managedFiles: input.managedFiles,
      }),
      contentType: "text/csv",
    } as const;
  }

  return {
    body: JSON.stringify(input.managedFiles, null, 2),
    contentType: "application/json",
  } as const;
};

const buildSupportCaseSummaryArtifact = (input: {
  readonly supportCases: Schema.Schema.Type<
    typeof SupportOperationsCaseSupportViewListSchema
  >;
}) =>
  ({
    body: JSON.stringify(input.supportCases, null, 2),
    contentType: "application/json",
  }) as const;

const calculateSha256Hex = (content: Uint8Array) =>
  Effect.tryPromise({
    try: async () => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        Uint8Array.from(content).buffer,
      );

      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    },
    catch: (cause) =>
      ({
        _tag: "ImportExportArtifactUploadError",
        operation: "hashArtifact",
        cause,
      }) satisfies ImportExportArtifactUploadError,
  });

const parseUploadArtifactResponse = (responseText: string) =>
  Effect.try({
    try: () => JSON.parse(responseText) as unknown,
    catch: (cause) =>
      ({
        _tag: "ImportExportArtifactUploadError",
        operation: "parseUploadArtifactResponse",
        cause,
        body: responseText,
      }) satisfies ImportExportArtifactUploadError,
  }).pipe(
    Effect.flatMap((payload) =>
      Schema.decodeUnknown(ImportExportArtifactUploadResponseSchema)(payload),
    ),
  );

const uploadManagedFileSummaryArtifact = (input: {
  readonly fileStorage: FileStorageModule["Type"];
  readonly requestContext: AuthenticatedImportExportOperatorContext;
  readonly target: ImportExportTarget;
  readonly format: ImportExportJobFormat;
  readonly managedFiles: readonly {
    readonly fileId: string;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly deletedAt?: string;
  }[];
  readonly jobId: string;
  readonly fetchImplementation: ImportExportFetchImplementation;
}) =>
  Effect.gen(function* () {
    const artifact = buildManagedFileSummaryArtifact({
      managedFiles: input.managedFiles,
      format: input.format,
    });
    const artifactBody = artifact.body;
    const artifactBytes = new TextEncoder().encode(artifactBody);
    const expectedSha256 = yield* calculateSha256Hex(artifactBytes);
    const uploadReservation =
      yield* input.fileStorage.requestManagedFileUploadUrl({
        scope: input.target.scope,
        scopeId: input.target.scopeId,
        uploadedBy: input.requestContext.actorId,
        maxSizeBytes: artifactBytes.byteLength,
        expectedSha256,
      });
    const uploadResponse = yield* Effect.tryPromise({
      try: () =>
        input.fetchImplementation(uploadReservation.uploadUrl, {
          method: "POST",
          headers: {
            "content-type": artifact.contentType,
          },
          body: artifactBody,
        }),
      catch: (cause) =>
        ({
          _tag: "ImportExportArtifactUploadError",
          operation: "uploadArtifact",
          cause,
        }) satisfies ImportExportArtifactUploadError,
    });
    const uploadResponseText = yield* Effect.tryPromise({
      try: () => uploadResponse.text(),
      catch: (cause) =>
        ({
          _tag: "ImportExportArtifactUploadError",
          operation: "uploadArtifact",
          cause,
        }) satisfies ImportExportArtifactUploadError,
    });

    if (!uploadResponse.ok) {
      return yield* Effect.fail({
        _tag: "ImportExportArtifactUploadError",
        operation: "uploadArtifact",
        cause: uploadResponse.statusText,
        status: uploadResponse.status,
        body: uploadResponseText,
      } satisfies ImportExportArtifactUploadError);
    }

    const uploadArtifact =
      yield* parseUploadArtifactResponse(uploadResponseText);
    const managedFile = yield* input.fileStorage.registerManagedFile({
      scope: input.target.scope,
      scopeId: input.target.scopeId,
      uploadToken: uploadReservation.uploadToken,
      storageId: uploadArtifact.storageId,
      fileName: buildManagedFileSummaryArtifactFileName({
        target: input.target,
        jobId: input.jobId,
        format: input.format,
      }),
      contentType: artifact.contentType,
      sizeBytes: artifactBytes.byteLength,
      classification: dataClassification.tenantConfidential,
      usage: managedFileUsage.standard,
      uploadedBy: input.requestContext.actorId,
    });

    return {
      artifactFileId: managedFile.fileId,
      rowCount: input.managedFiles.length,
    } as const;
  });

const uploadSupportCaseSummaryArtifact = (input: {
  readonly fileStorage: FileStorageModule["Type"];
  readonly requestContext: AuthenticatedImportExportOperatorContext;
  readonly target: ImportExportTarget;
  readonly supportCases: Schema.Schema.Type<
    typeof SupportOperationsCaseSupportViewListSchema
  >;
  readonly jobId: string;
  readonly fetchImplementation: ImportExportFetchImplementation;
}) =>
  Effect.gen(function* () {
    const artifact = buildSupportCaseSummaryArtifact({
      supportCases: input.supportCases,
    });
    const artifactBody = artifact.body;
    const artifactBytes = new TextEncoder().encode(artifactBody);
    const expectedSha256 = yield* calculateSha256Hex(artifactBytes);
    const uploadReservation =
      yield* input.fileStorage.requestManagedFileUploadUrl({
        scope: input.target.scope,
        scopeId: input.target.scopeId,
        uploadedBy: input.requestContext.actorId,
        maxSizeBytes: artifactBytes.byteLength,
        expectedSha256,
      });
    const uploadResponse = yield* Effect.tryPromise({
      try: () =>
        input.fetchImplementation(uploadReservation.uploadUrl, {
          method: "POST",
          headers: {
            "content-type": artifact.contentType,
          },
          body: artifactBody,
        }),
      catch: (cause) =>
        ({
          _tag: "ImportExportArtifactUploadError",
          operation: "uploadArtifact",
          cause,
        }) satisfies ImportExportArtifactUploadError,
    });
    const uploadResponseText = yield* Effect.tryPromise({
      try: () => uploadResponse.text(),
      catch: (cause) =>
        ({
          _tag: "ImportExportArtifactUploadError",
          operation: "uploadArtifact",
          cause,
        }) satisfies ImportExportArtifactUploadError,
    });

    if (!uploadResponse.ok) {
      return yield* Effect.fail({
        _tag: "ImportExportArtifactUploadError",
        operation: "uploadArtifact",
        cause: uploadResponse.statusText,
        status: uploadResponse.status,
        body: uploadResponseText,
      } satisfies ImportExportArtifactUploadError);
    }

    const uploadArtifact =
      yield* parseUploadArtifactResponse(uploadResponseText);
    const managedFile = yield* input.fileStorage.registerManagedFile({
      scope: input.target.scope,
      scopeId: input.target.scopeId,
      uploadToken: uploadReservation.uploadToken,
      storageId: uploadArtifact.storageId,
      fileName: buildSupportCaseSummaryArtifactFileName({
        target: input.target,
        jobId: input.jobId,
      }),
      contentType: artifact.contentType,
      sizeBytes: artifactBytes.byteLength,
      classification: dataClassification.tenantConfidential,
      usage: managedFileUsage.standard,
      uploadedBy: input.requestContext.actorId,
    });

    return {
      artifactFileId: managedFile.fileId,
      rowCount: input.supportCases.length,
    } as const;
  });

const buildImportExportJobTarget = (job: ImportExportJobAdminView) => ({
  scope: job.tenantScope,
  scopeId: job.tenantScopeId,
});

const makeLiveImportExportAuthorization = Effect.gen(function* () {
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

const buildImportExportService = (
  authorization: Pick<AuthorizationModuleService, "check">,
  options: ImportExportServiceOptions,
) =>
  Effect.gen(function* () {
    const auditLog = yield* AuditLogModule;
    const fileStorage = yield* FileStorageModule;
    const identitySession = yield* IdentitySessionModule;
    const importExport = yield* ImportExportModule;
    const retentionLegalHold = yield* RetentionLegalHoldModule;
    const runtimeConfig = yield* RuntimeConfigModule;
    const supportCaseRepository =
      yield* SupportOperationsCasePostgresRepository;
    const workflowJobs = options.workflowJobs;
    const convexWorkflowClient = options.convexWorkflowClient;
    const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    const businessEventEmitter =
      options.businessEventEmitter ?? noopPlatformBusinessEventEmitter;

    const requireWorkflowJobs = () =>
      workflowJobs === undefined
        ? Effect.fail({
            _tag: "ImportExportWorkflowUnavailableError",
            dependency: "workflowJobs",
          } as const)
        : Effect.succeed(workflowJobs);

    const requireConvexWorkflowClient = () =>
      convexWorkflowClient === undefined
        ? Effect.fail({
            _tag: "ImportExportWorkflowUnavailableError",
            dependency: "convexWorkflowClient",
          } as const)
        : Effect.succeed(convexWorkflowClient);

    const requireFetchImplementation = () =>
      fetchImplementation === undefined
        ? Effect.fail({
            _tag: "ImportExportWorkflowUnavailableError",
            dependency: "fetchImplementation",
          } as const)
        : Effect.succeed(fetchImplementation);

    const persistImportExportWorkflowDispatchFailure = <
      TRecord extends ImportExportWorkflowJobRecord,
    >(input: {
      readonly workflowJobs: ImportExportWorkflowJobsRepository;
      readonly job: TRecord;
      readonly cause: Cause.Cause<ImportExportServiceError>;
      readonly buildBlockedJob: (input: {
        readonly job: TRecord;
        readonly now: string;
        readonly lastError: string;
      }) => Effect.Effect<TRecord, ParseResult.ParseError>;
    }) => {
      const now = new Date().toISOString();
      const lastError = Cause.pretty(input.cause);

      return Effect.all([
        input
          .buildBlockedJob({
            job: input.job,
            now,
            lastError,
          })
          .pipe(
            Effect.flatMap((blockedJob) =>
              input.workflowJobs.persistWorkflowJob(blockedJob),
            ),
            Effect.ignore,
          ),
        importExport
          .blockImportExportJobRecord({
            jobId: input.job.jobId,
            lastError,
            completedAt: now,
          })
          .pipe(Effect.ignore),
      ]).pipe(Effect.zipRight(Effect.failCause(input.cause)));
    };

    return {
      requestManagedFileSummaryExport: (
        input: RequestManagedFileSummaryExportBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          RequestManagedFileSummaryExportBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const persistedWorkflowJobs = yield* requireWorkflowJobs();
              const schedulerClient = yield* requireConvexWorkflowClient();
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;
              const authorizedRequestContext =
                yield* authorizeImportExportOperatorAccess({
                  authorization,
                  requestContext,
                  target,
                });

              yield* ensureImportExportEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target,
              });

              const format = request.format ?? importExportJobFormat.json;
              const managedFiles = yield* fileStorage.listManagedFiles({
                scope: request.scope,
                scopeId: request.scopeId,
              });

              yield* ensureManagedFileSummaryExportAllowedByRetention({
                retentionLegalHold,
                target,
                format,
                managedFiles,
              });

              const now = new Date().toISOString();
              const jobId = buildImportExportManagedFileSummaryWorkflowJobId({
                trigger: workflowJobTrigger.operatorRequested,
                tenantScope: request.scope,
                tenantScopeId: request.scopeId,
                format,
                key: authorizedRequestContext.correlationId,
              });
              yield* makeImportExportAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: importExportAuditAction.exportRequested,
                target: [
                  platformModuleId.importExport,
                  request.scope,
                  request.scopeId,
                  jobId,
                ].join(":"),
                reason: `Request ${format} managed-file summary export for ${request.scope}:${request.scopeId}.`,
              });

              const exportJob =
                yield* importExport.requestManagedFileSummaryExportRecord({
                  jobId,
                  tenantScope: request.scope,
                  tenantScopeId: request.scopeId,
                  format,
                  requestedBy: authorizedRequestContext.actorId,
                  requestedAt: now,
                });

              const workflowJob =
                yield* buildImportExportManagedFileSummaryWorkflowJobRecord({
                  jobId,
                  target,
                  format,
                  requestContext: authorizedRequestContext,
                  actorId: authorizedRequestContext.actorId,
                  correlationId: authorizedRequestContext.correlationId,
                  scheduledAt: request.scheduledAt ?? now,
                  now,
                });
              const persistedJob = yield* persistedWorkflowJobs
                .persistWorkflowJob(workflowJob)
                .pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: workflowJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportManagedFileSummaryWorkflowJob,
                    }),
                  ),
                );
              const dispatch = yield* schedulerClient
                .scheduleImportExportManagedFileSummaryWorkflowJob({
                  jobId: persistedJob.jobId,
                  scheduledAt: persistedJob.scheduledAt,
                })
                .pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: persistedJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportManagedFileSummaryWorkflowJob,
                    }),
                  ),
                );
              const dispatchedJob =
                yield* buildImportExportManagedFileSummaryWorkflowDispatchRecord(
                  {
                    job: persistedJob,
                    now: new Date().toISOString(),
                    dispatch,
                  },
                ).pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: persistedJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportManagedFileSummaryWorkflowJob,
                    }),
                  ),
                );
              yield* persistedWorkflowJobs
                .persistWorkflowJob(dispatchedJob)
                .pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: dispatchedJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportManagedFileSummaryWorkflowJob,
                    }),
                  ),
                );
              yield* businessEventEmitter({
                requestContext: authorizedRequestContext,
                moduleId: platformModuleId.importExport,
                eventName:
                  platformBusinessEventName.importExportManagedFileSummaryRequested,
                permissionScope: permissionScope.exportExecute,
                properties: {
                  jobId,
                  targetScope: request.scope,
                  targetScopeId: request.scopeId,
                  source: getManagedFileSummaryImportExportJobSource(format),
                  format,
                },
              });

              return exportJob;
            }),
          ),
        ),
      requestSupportCaseSummaryExport: (
        input: RequestSupportCaseSummaryExportBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          RequestSupportCaseSummaryExportBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const persistedWorkflowJobs = yield* requireWorkflowJobs();
              const schedulerClient = yield* requireConvexWorkflowClient();
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;
              const authorizedRequestContext =
                yield* authorizeImportExportOperatorAccess({
                  authorization,
                  requestContext,
                  target,
                });

              yield* ensureImportExportEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target,
              });

              const now = new Date().toISOString();
              const jobId = buildImportExportSupportCaseSummaryWorkflowJobId({
                trigger: workflowJobTrigger.operatorRequested,
                tenantScope: request.scope,
                tenantScopeId: request.scopeId,
                key: authorizedRequestContext.correlationId,
              });
              yield* makeImportExportAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: importExportAuditAction.exportRequested,
                target: [
                  platformModuleId.importExport,
                  request.scope,
                  request.scopeId,
                  jobId,
                ].join(":"),
                reason: `Request JSON support-case summary export for ${request.scope}:${request.scopeId}.`,
              });

              const exportJob =
                yield* importExport.requestSupportCaseSummaryExportRecord({
                  jobId,
                  tenantScope: request.scope,
                  tenantScopeId: request.scopeId,
                  requestedBy: authorizedRequestContext.actorId,
                  requestedAt: now,
                });

              const workflowJob =
                yield* buildImportExportSupportCaseSummaryWorkflowJobRecord({
                  jobId,
                  target,
                  requestContext: authorizedRequestContext,
                  actorId: authorizedRequestContext.actorId,
                  correlationId: authorizedRequestContext.correlationId,
                  scheduledAt: request.scheduledAt ?? now,
                  now,
                });
              const persistedJob = yield* persistedWorkflowJobs
                .persistWorkflowJob(workflowJob)
                .pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: workflowJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportSupportCaseSummaryWorkflowJob,
                    }),
                  ),
                  Effect.flatMap((record) =>
                    decodeImportExportSupportCaseSummaryWorkflowJobRecord(
                      record,
                    ),
                  ),
                );
              const dispatch = yield* schedulerClient
                .scheduleImportExportSupportCaseSummaryWorkflowJob({
                  jobId: persistedJob.jobId,
                  scheduledAt: persistedJob.scheduledAt,
                })
                .pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: persistedJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportSupportCaseSummaryWorkflowJob,
                    }),
                  ),
                );
              const dispatchedJob =
                yield* buildImportExportSupportCaseSummaryWorkflowDispatchRecord(
                  {
                    job: persistedJob,
                    now: new Date().toISOString(),
                    dispatch,
                  },
                ).pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: persistedJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportSupportCaseSummaryWorkflowJob,
                    }),
                  ),
                );
              yield* persistedWorkflowJobs
                .persistWorkflowJob(dispatchedJob)
                .pipe(
                  Effect.catchAllCause((cause) =>
                    persistImportExportWorkflowDispatchFailure({
                      workflowJobs: persistedWorkflowJobs,
                      job: dispatchedJob,
                      cause,
                      buildBlockedJob:
                        blockImportExportSupportCaseSummaryWorkflowJob,
                    }),
                  ),
                );
              yield* businessEventEmitter({
                requestContext: authorizedRequestContext,
                moduleId: platformModuleId.importExport,
                eventName:
                  platformBusinessEventName.importExportSupportCaseSummaryRequested,
                permissionScope: permissionScope.exportExecute,
                properties: {
                  jobId,
                  targetScope: request.scope,
                  targetScopeId: request.scopeId,
                  source: importExportJobSource.supportCaseSummaryJson,
                  format: importExportJobFormat.json,
                },
              });

              return exportJob;
            }),
          ),
        ),
      getImportExportJob: (input: GetImportExportJobBySessionRequest) =>
        Schema.decodeUnknown(GetImportExportJobBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const job = yield* importExport
                .getImportExportJobRecord({ jobId: request.jobId })
                .pipe(
                  Effect.flatMap((record) =>
                    record === undefined
                      ? Effect.fail({
                          _tag: "ImportExportJobNotFoundError",
                          jobId: request.jobId,
                        } satisfies ImportExportJobNotFoundError)
                      : Effect.succeed(record),
                  ),
                );
              const target = buildImportExportJobTarget(job);
              const authorizedRequestContext =
                yield* authorizeImportExportOperatorAccess({
                  authorization,
                  requestContext,
                  target,
                });

              yield* makeImportExportAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: importExportAuditAction.exportInspected,
                target: [platformModuleId.importExport, request.jobId].join(
                  ":",
                ),
                reason: `Inspect import-export job ${request.jobId}.`,
              });

              return job;
            }),
          ),
        ),
      runImportExportManagedFileSummaryWorkflowJob: (
        input: RunImportExportManagedFileSummaryWorkflowJobRequest,
      ) =>
        Schema.decodeUnknown(
          RunImportExportManagedFileSummaryWorkflowJobRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const persistedWorkflowJobs = yield* requireWorkflowJobs();
              const uploadFetch = yield* requireFetchImplementation();
              const loadManagedFileSummaryWorkflowJob = ({
                jobId,
              }: {
                readonly jobId: string;
              }): Effect.Effect<
                ImportExportManagedFileSummaryWorkflowJobRecord | undefined,
                ImportExportServiceError
              > =>
                persistedWorkflowJobs
                  .getWorkflowJob({ jobId })
                  .pipe(
                    Effect.flatMap((job) =>
                      job === undefined
                        ? Effect.succeed(undefined)
                        : decodeImportExportManagedFileSummaryWorkflowJobRecord(
                            job,
                          ),
                    ),
                  );
              const claimManagedFileSummaryWorkflowJob = ({
                jobId,
              }: {
                readonly jobId: string;
              }): Effect.Effect<
                ImportExportManagedFileSummaryWorkflowJobRecord | undefined,
                ImportExportServiceError
              > =>
                persistedWorkflowJobs
                  .claimScheduledWorkflowJob({
                    jobId,
                    now: new Date().toISOString(),
                  })
                  .pipe(
                    Effect.flatMap((job) =>
                      job === undefined
                        ? Effect.succeed(undefined)
                        : decodeImportExportManagedFileSummaryWorkflowJobRecord(
                            job,
                          ),
                    ),
                  );

              return yield* executeWorkflowJobRecord<
                ImportExportManagedFileSummaryWorkflowJobRecord,
                WorkflowJobSummary,
                ImportExportServiceError
              >({
                jobId: request.jobId,
                loadJob: loadManagedFileSummaryWorkflowJob,
                shouldBlockStaleRunningJob: ({ job }) =>
                  shouldBlockStaleRunningImportExportWorkflowJob(job),
                blockStaleRunningJob: ({ job }) => {
                  const now = new Date().toISOString();

                  return reconcileImportExportManagedFileSummaryWorkflowJobWithModuleState(
                    {
                      importExport,
                      workflowJobs: persistedWorkflowJobs,
                      job,
                      now,
                    },
                  ).pipe(
                    Effect.catchAll(() => Effect.succeed(job)),
                    Effect.flatMap((reconciledJob) =>
                      reconciledJob !== undefined
                        ? Effect.succeed(reconciledJob)
                        : Effect.all([
                            importExport
                              .blockImportExportJobRecord({
                                jobId: job.jobId,
                                lastError:
                                  "Import-export managed-file summary workflow job exceeded the recovery budget.",
                                completedAt: now,
                              })
                              .pipe(Effect.ignore),
                            blockImportExportManagedFileSummaryWorkflowJob({
                              job,
                              now,
                              lastError:
                                "Import-export managed-file summary workflow job exceeded the recovery budget.",
                            }),
                          ]).pipe(Effect.map(([, blockedJob]) => blockedJob)),
                    ),
                  );
                },
                claimScheduledJob: claimManagedFileSummaryWorkflowJob,
                runClaimedJob: ({ job }) => {
                  const now = new Date().toISOString();
                  const target = {
                    scope: job.payload.tenantScope,
                    scopeId: job.payload.tenantScopeId,
                  } as const;

                  return Effect.gen(function* () {
                    const reconciledJob =
                      yield* reconcileImportExportManagedFileSummaryWorkflowJobWithModuleState(
                        {
                          importExport,
                          workflowJobs: persistedWorkflowJobs,
                          job,
                          now,
                        },
                      ).pipe(Effect.catchAll(() => Effect.succeed(job)));

                    if (reconciledJob !== undefined) {
                      return reconciledJob;
                    }

                    const execution = yield* Effect.gen(function* () {
                      const authorizedRequestContext =
                        yield* authorizeImportExportOperatorAccess({
                          authorization,
                          requestContext: job.payload.requestContext,
                          target,
                        });

                      yield* importExport.startImportExportJobRecord({
                        jobId: job.jobId,
                        startedAt: now,
                      });

                      const managedFiles = yield* fileStorage.listManagedFiles({
                        scope: job.payload.tenantScope,
                        scopeId: job.payload.tenantScopeId,
                      });

                      yield* ensureManagedFileSummaryExportAllowedByRetention({
                        retentionLegalHold,
                        target,
                        format: job.payload.format,
                        managedFiles,
                      });

                      const { artifactFileId, rowCount } =
                        yield* uploadManagedFileSummaryArtifact({
                          fileStorage,
                          requestContext: authorizedRequestContext,
                          target,
                          format: job.payload.format,
                          managedFiles: managedFiles.map((managedFile) => ({
                            fileId: managedFile.fileId,
                            fileName: managedFile.fileName,
                            contentType: managedFile.contentType,
                            sizeBytes: managedFile.sizeBytes,
                            ...(managedFile.deletedAt !== undefined
                              ? { deletedAt: managedFile.deletedAt }
                              : {}),
                          })),
                          jobId: job.jobId,
                          fetchImplementation: uploadFetch,
                        });

                      yield* importExport.completeImportExportJobRecord({
                        jobId: job.jobId,
                        artifactFileId,
                        rowCount,
                        completedAt: now,
                      });

                      return {
                        _tag: "completed",
                        authorizedRequestContext,
                        artifactFileId,
                        rowCount,
                      } as const;
                    }).pipe(
                      Effect.catchAll((error) => {
                        const lastError =
                          readImportExportWorkflowFailureMessage(error);

                        return Effect.all([
                          importExport
                            .blockImportExportJobRecord({
                              jobId: job.jobId,
                              lastError,
                              completedAt: now,
                            })
                            .pipe(Effect.ignore),
                          blockImportExportManagedFileSummaryWorkflowJob({
                            job,
                            now,
                            lastError,
                          }),
                        ]).pipe(
                          Effect.flatMap(([, blockedJob]) =>
                            persistedWorkflowJobs
                              .persistWorkflowJob(blockedJob)
                              .pipe(
                                Effect.flatMap((persistedBlockedJob) =>
                                  decodeImportExportManagedFileSummaryWorkflowJobRecord(
                                    persistedBlockedJob,
                                  ),
                                ),
                                Effect.map(
                                  (persistedBlockedJob) =>
                                    ({
                                      _tag: "blocked",
                                      record: persistedBlockedJob,
                                    }) as const,
                                ),
                              ),
                          ),
                        );
                      }),
                    );

                    if (execution._tag === "blocked") {
                      return execution.record;
                    }

                    yield* makeImportExportAuditAppend({
                      auditLog,
                      requestContext: execution.authorizedRequestContext,
                      action: importExportAuditAction.exportCompleted,
                      target: [platformModuleId.importExport, job.jobId].join(
                        ":",
                      ),
                      reason: `Complete ${job.payload.format} managed-file summary export ${job.jobId}.`,
                    }).pipe(Effect.ignore);
                    yield* businessEventEmitter({
                      requestContext: execution.authorizedRequestContext,
                      moduleId: platformModuleId.importExport,
                      eventName:
                        platformBusinessEventName.importExportManagedFileSummaryCompleted,
                      permissionScope: permissionScope.exportExecute,
                      properties: {
                        jobId: job.jobId,
                        targetScope: job.payload.tenantScope,
                        targetScopeId: job.payload.tenantScopeId,
                        source: getManagedFileSummaryImportExportJobSource(
                          job.payload.format,
                        ),
                        format: job.payload.format,
                        rowCount: execution.rowCount,
                        artifactFileId: execution.artifactFileId,
                      },
                    });

                    const completedRecord =
                      yield* completeImportExportManagedFileSummaryWorkflowJob({
                        job,
                        now,
                      });

                    return yield* persistedWorkflowJobs
                      .persistWorkflowJob(completedRecord)
                      .pipe(
                        Effect.orElseSucceed(() => completedRecord),
                        Effect.flatMap((record) =>
                          decodeImportExportManagedFileSummaryWorkflowJobRecord(
                            record,
                          ),
                        ),
                      );
                  });
                },
                recoverClaimedJobFailure: ({ job, cause }) => {
                  const now = new Date().toISOString();
                  const lastError = Cause.pretty(cause);

                  return Effect.all([
                    importExport
                      .blockImportExportJobRecord({
                        jobId: job.jobId,
                        lastError,
                        completedAt: now,
                      })
                      .pipe(Effect.ignore),
                    blockImportExportManagedFileSummaryWorkflowJob({
                      job,
                      now,
                      lastError,
                    }).pipe(
                      Effect.flatMap((blockedJob) =>
                        persistedWorkflowJobs.persistWorkflowJob(blockedJob),
                      ),
                    ),
                  ]).pipe(
                    Effect.flatMap(([, blockedJob]) =>
                      buildWorkflowJobSummary({ record: blockedJob }),
                    ),
                  );
                },
                summarize: ({ record }) => buildWorkflowJobSummary({ record }),
              });
            }),
          ),
        ),
      runImportExportSupportCaseSummaryWorkflowJob: (
        input: RunImportExportSupportCaseSummaryWorkflowJobRequest,
      ) =>
        Schema.decodeUnknown(
          RunImportExportSupportCaseSummaryWorkflowJobRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const persistedWorkflowJobs = yield* requireWorkflowJobs();
              const uploadFetch = yield* requireFetchImplementation();
              const loadSupportCaseSummaryWorkflowJob = ({
                jobId,
              }: {
                readonly jobId: string;
              }): Effect.Effect<
                ImportExportSupportCaseSummaryWorkflowJobRecord | undefined,
                ImportExportServiceError
              > =>
                persistedWorkflowJobs
                  .getWorkflowJob({ jobId })
                  .pipe(
                    Effect.flatMap((job) =>
                      job === undefined
                        ? Effect.succeed(undefined)
                        : decodeImportExportSupportCaseSummaryWorkflowJobRecord(
                            job,
                          ),
                    ),
                  );
              const claimSupportCaseSummaryWorkflowJob = ({
                jobId,
              }: {
                readonly jobId: string;
              }): Effect.Effect<
                ImportExportSupportCaseSummaryWorkflowJobRecord | undefined,
                ImportExportServiceError
              > =>
                persistedWorkflowJobs
                  .claimScheduledWorkflowJob({
                    jobId,
                    now: new Date().toISOString(),
                  })
                  .pipe(
                    Effect.flatMap((job) =>
                      job === undefined
                        ? Effect.succeed(undefined)
                        : decodeImportExportSupportCaseSummaryWorkflowJobRecord(
                            job,
                          ),
                    ),
                  );

              return yield* executeWorkflowJobRecord<
                ImportExportSupportCaseSummaryWorkflowJobRecord,
                WorkflowJobSummary,
                ImportExportServiceError
              >({
                jobId: request.jobId,
                loadJob: loadSupportCaseSummaryWorkflowJob,
                shouldBlockStaleRunningJob: ({ job }) =>
                  shouldBlockStaleRunningImportExportWorkflowJob(job),
                blockStaleRunningJob: ({ job }) => {
                  const now = new Date().toISOString();

                  return reconcileImportExportSupportCaseSummaryWorkflowJobWithModuleState(
                    {
                      importExport,
                      workflowJobs: persistedWorkflowJobs,
                      job,
                      now,
                    },
                  ).pipe(
                    Effect.catchAll(() => Effect.succeed(job)),
                    Effect.flatMap((reconciledJob) =>
                      reconciledJob !== undefined
                        ? Effect.succeed(reconciledJob)
                        : Effect.all([
                            importExport
                              .blockImportExportJobRecord({
                                jobId: job.jobId,
                                lastError:
                                  "Import-export support-case summary workflow job exceeded the recovery budget.",
                                completedAt: now,
                              })
                              .pipe(Effect.ignore),
                            blockImportExportSupportCaseSummaryWorkflowJob({
                              job,
                              now,
                              lastError:
                                "Import-export support-case summary workflow job exceeded the recovery budget.",
                            }),
                          ]).pipe(Effect.map(([, blockedJob]) => blockedJob)),
                    ),
                  );
                },
                claimScheduledJob: claimSupportCaseSummaryWorkflowJob,
                runClaimedJob: ({ job }) => {
                  const now = new Date().toISOString();
                  const target = {
                    scope: job.payload.tenantScope,
                    scopeId: job.payload.tenantScopeId,
                  } as const;

                  return Effect.gen(function* () {
                    const reconciledJob =
                      yield* reconcileImportExportSupportCaseSummaryWorkflowJobWithModuleState(
                        {
                          importExport,
                          workflowJobs: persistedWorkflowJobs,
                          job,
                          now,
                        },
                      ).pipe(Effect.catchAll(() => Effect.succeed(job)));

                    if (reconciledJob !== undefined) {
                      return reconciledJob;
                    }

                    const execution = yield* Effect.gen(function* () {
                      const authorizedRequestContext =
                        yield* authorizeImportExportOperatorAccess({
                          authorization,
                          requestContext: job.payload.requestContext,
                          target,
                        });

                      yield* importExport.startImportExportJobRecord({
                        jobId: job.jobId,
                        startedAt: now,
                      });

                      const supportCases = yield* supportCaseRepository
                        .listSupportCases({
                          tenantScope: job.payload.tenantScope,
                          tenantScopeId: job.payload.tenantScopeId,
                        })
                        .pipe(
                          Effect.flatMap((records) =>
                            Schema.decodeUnknown(
                              SupportOperationsCaseSupportViewListSchema,
                            )(records),
                          ),
                        );

                      const { artifactFileId, rowCount } =
                        yield* uploadSupportCaseSummaryArtifact({
                          fileStorage,
                          requestContext: authorizedRequestContext,
                          target,
                          supportCases,
                          jobId: job.jobId,
                          fetchImplementation: uploadFetch,
                        });

                      yield* importExport.completeImportExportJobRecord({
                        jobId: job.jobId,
                        artifactFileId,
                        rowCount,
                        completedAt: now,
                      });

                      return {
                        _tag: "completed",
                        authorizedRequestContext,
                        artifactFileId,
                        rowCount,
                      } as const;
                    }).pipe(
                      Effect.catchAll((error) => {
                        const lastError =
                          readImportExportWorkflowFailureMessage(error);

                        return Effect.all([
                          importExport
                            .blockImportExportJobRecord({
                              jobId: job.jobId,
                              lastError,
                              completedAt: now,
                            })
                            .pipe(Effect.ignore),
                          blockImportExportSupportCaseSummaryWorkflowJob({
                            job,
                            now,
                            lastError,
                          }),
                        ]).pipe(
                          Effect.flatMap(([, blockedJob]) =>
                            persistedWorkflowJobs
                              .persistWorkflowJob(blockedJob)
                              .pipe(
                                Effect.flatMap((persistedBlockedJob) =>
                                  decodeImportExportSupportCaseSummaryWorkflowJobRecord(
                                    persistedBlockedJob,
                                  ),
                                ),
                                Effect.map(
                                  (persistedBlockedJob) =>
                                    ({
                                      _tag: "blocked",
                                      record: persistedBlockedJob,
                                    }) as const,
                                ),
                              ),
                          ),
                        );
                      }),
                    );

                    if (execution._tag === "blocked") {
                      return execution.record;
                    }

                    yield* makeImportExportAuditAppend({
                      auditLog,
                      requestContext: execution.authorizedRequestContext,
                      action: importExportAuditAction.exportCompleted,
                      target: [platformModuleId.importExport, job.jobId].join(
                        ":",
                      ),
                      reason: `Complete JSON support-case summary export ${job.jobId}.`,
                    }).pipe(Effect.ignore);
                    yield* businessEventEmitter({
                      requestContext: execution.authorizedRequestContext,
                      moduleId: platformModuleId.importExport,
                      eventName:
                        platformBusinessEventName.importExportSupportCaseSummaryCompleted,
                      permissionScope: permissionScope.exportExecute,
                      properties: {
                        jobId: job.jobId,
                        targetScope: job.payload.tenantScope,
                        targetScopeId: job.payload.tenantScopeId,
                        source: importExportJobSource.supportCaseSummaryJson,
                        format: importExportJobFormat.json,
                        rowCount: execution.rowCount,
                        artifactFileId: execution.artifactFileId,
                      },
                    });

                    const completedRecord =
                      yield* completeImportExportSupportCaseSummaryWorkflowJob({
                        job,
                        now,
                      });

                    return yield* persistedWorkflowJobs
                      .persistWorkflowJob(completedRecord)
                      .pipe(
                        Effect.orElseSucceed(() => completedRecord),
                        Effect.flatMap((record) =>
                          decodeImportExportSupportCaseSummaryWorkflowJobRecord(
                            record,
                          ),
                        ),
                      );
                  });
                },
                recoverClaimedJobFailure: ({ job, cause }) => {
                  const now = new Date().toISOString();
                  const lastError = Cause.pretty(cause);

                  return Effect.all([
                    importExport
                      .blockImportExportJobRecord({
                        jobId: job.jobId,
                        lastError,
                        completedAt: now,
                      })
                      .pipe(Effect.ignore),
                    blockImportExportSupportCaseSummaryWorkflowJob({
                      job,
                      now,
                      lastError,
                    }).pipe(
                      Effect.flatMap((blockedJob) =>
                        persistedWorkflowJobs.persistWorkflowJob(blockedJob),
                      ),
                    ),
                  ]).pipe(
                    Effect.flatMap(([, blockedJob]) =>
                      buildWorkflowJobSummary({ record: blockedJob }),
                    ),
                  );
                },
                summarize: ({ record }) => buildWorkflowJobSummary({ record }),
              });
            }),
          ),
        ),
    } satisfies ImportExportServiceApi;
  });

export function makeImportExportService(options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs?: ImportExportWorkflowJobsRepository;
  readonly convexWorkflowClient?: ImportExportWorkflowSchedulerClient;
  readonly fetchImplementation?: ImportExportFetchImplementation;
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
}): Effect.Effect<
  ImportExportServiceApi,
  ParseResult.ParseError,
  | AuditLogModule
  | FileStorageModule
  | IdentitySessionModule
  | ImportExportModule
  | RetentionLegalHoldModule
  | RuntimeConfigModule
  | SupportOperationsCasePostgresRepository
>;
export function makeImportExportService(
  options?: ImportExportServiceOptions,
): Effect.Effect<
  ImportExportServiceApi,
  ParseResult.ParseError,
  | AuditLogModule
  | FileStorageModule
  | IdentitySessionModule
  | ImportExportModule
  | RetentionLegalHoldModule
  | RuntimeConfigModule
  | SupportOperationsCasePostgresRepository
  | OryKetoAdapter
>;
export function makeImportExportService(
  options: ImportExportServiceOptions = {},
): Effect.Effect<
  ImportExportServiceApi,
  ParseResult.ParseError,
  | AuditLogModule
  | FileStorageModule
  | IdentitySessionModule
  | ImportExportModule
  | RetentionLegalHoldModule
  | RuntimeConfigModule
  | SupportOperationsCasePostgresRepository
  | OryKetoAdapter
> {
  return options.authorization === undefined
    ? makeLiveImportExportAuthorization.pipe(
        Effect.flatMap((authorization) =>
          buildImportExportService(authorization, options),
        ),
      )
    : buildImportExportService(options.authorization, options);
}

export type ImportExportRuntimeError = {
  readonly _tag: "ImportExportRuntimeError";
  readonly cause: unknown;
};

type ImportExportTransportRuntimeOptions = SubscriberJourneyRuntimeOptions & {
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
};

export type ImportExportTransportRuntime = {
  readonly service: ImportExportServiceApi;
  readonly close: Effect.Effect<void>;
};

const buildImportExportJobPostgresQueryable = (
  database: PostgresRuntimeDatabase,
): ImportExportJobPostgresQueryable => ({
  upsertImportExportJob: async (record) => {
    const [row] = await database
      .insert(importExportJobsTable)
      .values(record)
      .onConflictDoUpdate({
        target: [importExportJobsTable.jobId],
        set: {
          tenantScope: record.tenantScope,
          tenantScopeId: record.tenantScopeId,
          source: record.source,
          format: record.format,
          status: record.status,
          requestedBy: record.requestedBy,
          rowCount: record.rowCount ?? null,
          artifactFileId: record.artifactFileId ?? null,
          lastError: record.lastError ?? null,
          startedAt: record.startedAt ?? null,
          completedAt: record.completedAt ?? null,
          updatedAt: record.updatedAt,
        },
      })
      .returning();

    if (row === undefined) {
      throw new Error("Import-export job upsert returned no row.");
    }

    return row;
  },
  getImportExportJob: async (jobId) => {
    const [row] = await database
      .select()
      .from(importExportJobsTable)
      .where(eq(importExportJobsTable.jobId, jobId))
      .limit(1);

    return row;
  },
});

const buildSupportOperationsCasePostgresQueryable = (
  database: PostgresRuntimeDatabase,
): SupportOperationsCasePostgresQueryable => ({
  upsertSupportCase: (record) =>
    database
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
    database
      .select()
      .from(supportOperationsCasesTable)
      .where(eq(supportOperationsCasesTable.caseId, caseId))
      .then((rows) => rows[0]),
  listSupportCases: (
    input?: Parameters<
      SupportOperationsCasePostgresQueryable["listSupportCases"]
    >[0],
  ) => buildSupportOperationsCaseListQuery(database, input),
});

const makeImportExportTransportRuntime = (
  options: ImportExportTransportRuntimeOptions,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeSubscriberJourneyRuntime(options).pipe(
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
          cause,
        }),
      ),
    );
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    }).pipe(
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
          cause,
        }),
      ),
    );
    const importExportJobs = yield* makeImportExportJobPostgresRepository(
      buildImportExportJobPostgresQueryable(postgres.database),
    ).pipe(
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
          cause,
        }),
      ),
    );
    const importExportModule = yield* makeImportExportModule().pipe(
      Effect.provideService(
        ImportExportJobPostgresRepository,
        importExportJobs,
      ),
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
          cause,
        }),
      ),
    );
    const convexFileStorage = yield* makeConvexFileStorageAdapter({
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
    }).pipe(
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
          cause,
        }),
      ),
    );
    const fileStorageModule = yield* makeFileStorageModule().pipe(
      Effect.provideService(ConvexFileStorageAdapter, convexFileStorage),
      Effect.provideService(
        RetentionLegalHoldModule,
        runtime.retentionLegalHold,
      ),
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
          cause,
        }),
      ),
    );
    const supportCaseRepository =
      yield* makeSupportOperationsCasePostgresRepository(
        buildSupportOperationsCasePostgresQueryable(postgres.database),
      ).pipe(
        Effect.mapError(
          (cause): ImportExportRuntimeError => ({
            _tag: "ImportExportRuntimeError",
            cause,
          }),
        ),
      );
    const workflowJobsDatabase = buildWriteDatabase(postgres.database);
    const workflowJobs =
      yield* makeWorkflowJobsPostgresRepositoryForRecordSchema(
        workflowJobsDatabase,
        buildWorkflowJobsPostgresQueryable<ImportExportWorkflowJobRecord>(
          workflowJobsDatabase,
        ),
        buildImportExportWorkflowJobRecordSchema(),
      ).pipe(
        Effect.mapError(
          (cause): ImportExportRuntimeError => ({
            _tag: "ImportExportRuntimeError",
            cause,
          }),
        ),
      );
    const convexWorkflowClient = yield* makeAuthenticatedConvexWorkflowClient({
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
    }).pipe(
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
          cause,
        }),
      ),
    );
    const service = yield* makeImportExportService({
      workflowJobs,
      convexWorkflowClient,
      ...(options.businessEventEmitter !== undefined
        ? { businessEventEmitter: options.businessEventEmitter }
        : {}),
    }).pipe(
      Effect.provideService(AuditLogModule, runtime.auditLog),
      Effect.provideService(FileStorageModule, fileStorageModule),
      Effect.provideService(IdentitySessionModule, runtime.identitySession),
      Effect.provideService(ImportExportModule, importExportModule),
      Effect.provideService(
        RetentionLegalHoldModule,
        runtime.retentionLegalHold,
      ),
      Effect.provideService(RuntimeConfigModule, runtime.runtimeConfig),
      Effect.provideService(
        SupportOperationsCasePostgresRepository,
        supportCaseRepository,
      ),
      Effect.provideService(OryKetoAdapter, runtime.oryKeto),
      Effect.mapError(
        (cause): ImportExportRuntimeError => ({
          _tag: "ImportExportRuntimeError",
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
    } as const;
  });

const runImportExportTransportWithResolvedOptions = <A, E>(
  options: ImportExportTransportRuntimeOptions,
  use: (runtime: ImportExportTransportRuntime) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeImportExportTransportRuntime(options);

    return yield* use({ service: runtime.service, close: runtime.close }).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const runImportExportTransportFromEnvironment = <A, E>(
  environment: unknown,
  use: (runtime: ImportExportTransportRuntime) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.mapError(
      (cause): ImportExportRuntimeError => ({
        _tag: "ImportExportRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap((options) =>
      createPlatformBusinessEventEmitterFromEnvironment({
        environment,
        serviceName: "import-export-service",
      }).pipe(
        Effect.mapError(
          (cause): ImportExportRuntimeError => ({
            _tag: "ImportExportRuntimeError",
            cause,
          }),
        ),
        Effect.flatMap((businessEventEmitter) =>
          runImportExportTransportWithResolvedOptions(
            {
              ...options,
              businessEventEmitter,
            },
            use,
          ),
        ),
      ),
    ),
  );

export const runImportExportFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: ImportExportServiceApi) => Effect.Effect<A, E>,
) =>
  runImportExportTransportFromEnvironment(environment, ({ service }) =>
    use(service),
  );
