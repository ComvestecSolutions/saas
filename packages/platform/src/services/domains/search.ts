import { and, desc, eq } from "drizzle-orm";
import {
  findModuleManifest,
  searchFields,
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
} from "@comvestec/config";
import { Cause, Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  IsoTimestampSchema,
  permissionScope,
  platformModuleId,
  platformScope,
  type RequestContext,
  SearchQueryLimitSchema,
  searchDocumentFamily,
  SearchManagedFileDocumentSchema,
  SearchManagedFileIndexedDocumentSchema,
  type SearchManagedFileQueryResult,
  type SearchSupportCaseQueryResult,
  SearchSupportCaseDocumentSchema,
  SearchSupportCaseIndexedDocumentSchema,
  SearchSupportCaseSortSchema,
  searchIndexLifecycleState,
  SearchTenantDocumentListSchema,
  SearchTenantScopeSchema,
  SupportOperationsCasePrioritySchema,
  SupportOperationsCaseStatusSchema,
  searchAuditAction,
  searchFeatureFlag,
  type SearchTenantIndexDeletionReceipt,
  type SearchTenantIndexRecord,
  SearchTenantIndexSettingsSchema,
  type SearchTenantIndexSummaryView,
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
  makeFileStorageModule,
  makeAuthorizationModule,
  RetentionLegalHoldModule,
  RuntimeConfigModule,
  type RuntimeConfigModulePersistenceError,
  SearchModule,
  type SearchModuleError,
  makeSearchModule,
  makeSearchTenantIndexPostgresRepository,
  makeSupportOperationsCasePostgresRepository,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  SearchTenantIndexPostgresRepository,
  type SearchTenantIndexEnsureWorkflowJobRecord,
  SearchTenantIndexEnsureWorkflowJobRecordSchema,
  type SupportOperationsCasePostgresQueryable,
  type SupportOperationsCasePostgresRepositoryError,
  SupportOperationsCasePostgresRepository,
  type SearchTenantIndexPostgresQueryable,
  type SearchTenantIndexPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  buildSearchTenantIndexEnsureWorkflowJobId,
  buildWorkflowJobSummary,
  buildWorkflowJobsPostgresQueryable,
  searchTenantIndexesTable,
  supportOperationsCasesTable,
  type UnknownConfigKeyError,
  workflowJobRuntime,
} from "@comvestec/modules";
import {
  ConvexFileStorageAdapter,
  type ConvexScheduledWorkflowDispatch,
  type ConvexWorkflowExecutionError,
  makeAuthenticatedConvexWorkflowClient,
  makeConvexAdapter,
  makeConvexFileStorageAdapter,
  makeMeilisearchAdapter,
  MeilisearchAdapter,
  OryKetoAdapter,
  makePostgresAdapter,
  type PostgresRuntimeDatabase,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import { buildSupportOperationsCaseListQuery } from "../governance/support-operations";
import {
  makeSubscriberJourneyRuntime,
  resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
  type SubscriberJourneyRuntimeOptions,
} from "./subscriber-journey";
import {
  createOptionalPlatformBusinessEventEmitterFromEnvironment,
  createPlatformBusinessEventEmitterFromEnvironment,
  noopPlatformBusinessEventEmitter,
  platformBusinessEventName,
  type PlatformBusinessEventEmitter,
} from "./observability";
import { buildWriteDatabase } from "../postgres-write-database";
import { executeWorkflowJobRecord } from "./workflow-jobs";

export const SearchSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type SearchSessionLookup = Schema.Schema.Type<
  typeof SearchSessionLookupSchema
>;

const SearchTargetSchema = Schema.Struct({
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

type SearchTarget = Schema.Schema.Type<typeof SearchTargetSchema>;

export const EnsureSearchTenantIndexBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  settings: SearchTenantIndexSettingsSchema,
});

export type EnsureSearchTenantIndexBySessionRequest = Schema.Schema.Type<
  typeof EnsureSearchTenantIndexBySessionRequestSchema
>;

export const GetSearchTenantIndexRecordBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type GetSearchTenantIndexRecordBySessionRequest = Schema.Schema.Type<
  typeof GetSearchTenantIndexRecordBySessionRequestSchema
>;

export const ListSearchTenantIndexRecordsBySessionRequestSchema =
  GetSearchTenantIndexRecordBySessionRequestSchema;

export type ListSearchTenantIndexRecordsBySessionRequest = Schema.Schema.Type<
  typeof ListSearchTenantIndexRecordsBySessionRequestSchema
>;

export const DeleteSearchTenantIndexBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type DeleteSearchTenantIndexBySessionRequest = Schema.Schema.Type<
  typeof DeleteSearchTenantIndexBySessionRequestSchema
>;

export const RequestSearchTenantIndexEnsureWorkflowJobBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: SearchTenantScopeSchema,
    scopeId: Schema.NonEmptyString,
    settings: SearchTenantIndexSettingsSchema,
    scheduledAt: Schema.optional(IsoTimestampSchema),
  });

export type RequestSearchTenantIndexEnsureWorkflowJobBySessionRequest =
  Schema.Schema.Type<
    typeof RequestSearchTenantIndexEnsureWorkflowJobBySessionRequestSchema
  >;

export const RequestSearchTenantIndexReindexWorkflowJobBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: SearchTenantScopeSchema,
    scopeId: Schema.NonEmptyString,
    scheduledAt: Schema.optional(IsoTimestampSchema),
  });

export type RequestSearchTenantIndexReindexWorkflowJobBySessionRequest =
  Schema.Schema.Type<
    typeof RequestSearchTenantIndexReindexWorkflowJobBySessionRequestSchema
  >;

export const RunSearchTenantIndexEnsureWorkflowJobRequestSchema = Schema.Struct(
  {
    jobId: Schema.NonEmptyString,
  },
);

export type RunSearchTenantIndexEnsureWorkflowJobRequest = Schema.Schema.Type<
  typeof RunSearchTenantIndexEnsureWorkflowJobRequestSchema
>;

export const QuerySearchManagedFilesBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  query: Schema.String,
  limit: Schema.optional(SearchQueryLimitSchema),
});

export type QuerySearchManagedFilesBySessionRequest = Schema.Schema.Type<
  typeof QuerySearchManagedFilesBySessionRequestSchema
>;

const SearchSupportCaseFilterStatusesBySessionSchema = Schema.Array(
  SupportOperationsCaseStatusSchema,
).pipe(Schema.filter((value) => value.length > 0));

const SearchSupportCaseFilterPrioritiesBySessionSchema = Schema.Array(
  SupportOperationsCasePrioritySchema,
).pipe(Schema.filter((value) => value.length > 0));

export const QuerySearchSupportCasesBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  query: Schema.String,
  limit: Schema.optional(SearchQueryLimitSchema),
  status: Schema.optional(SearchSupportCaseFilterStatusesBySessionSchema),
  priority: Schema.optional(SearchSupportCaseFilterPrioritiesBySessionSchema),
  sort: Schema.optional(SearchSupportCaseSortSchema),
});

export type QuerySearchSupportCasesBySessionRequest = Schema.Schema.Type<
  typeof QuerySearchSupportCasesBySessionRequestSchema
>;

export const QueryCurrentTenantSearchManagedFilesBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    query: Schema.String,
    limit: Schema.optional(SearchQueryLimitSchema),
  });

export type QueryCurrentTenantSearchManagedFilesBySessionRequest =
  Schema.Schema.Type<
    typeof QueryCurrentTenantSearchManagedFilesBySessionRequestSchema
  >;

export type SearchDeclarationMissingError = {
  readonly _tag: "SearchDeclarationMissingError";
  readonly moduleId: typeof platformModuleId.search;
  readonly key: string;
};

export type SearchModuleDisabledError = {
  readonly _tag: "SearchModuleDisabledError";
  readonly scope: SearchTarget["scope"];
  readonly scopeId: string;
};

export type SearchUnauthenticatedActorError = {
  readonly _tag: "SearchUnauthenticatedActorError";
};

export type SearchAccessDeniedError = {
  readonly _tag: "SearchAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type SearchTenantIndexNotFoundError = {
  readonly _tag: "SearchTenantIndexNotFoundError";
  readonly scope: SearchTarget["scope"];
  readonly scopeId: string;
};

export type SearchTenantIndexSettingsUnavailableError = {
  readonly _tag: "SearchTenantIndexSettingsUnavailableError";
  readonly scope: SearchTarget["scope"];
  readonly scopeId: string;
};

export type SearchWorkflowUnavailableError = {
  readonly _tag: "SearchWorkflowUnavailableError";
  readonly dependency: "convexWorkflowClient" | "workflowJobs";
};

type SearchWorkflowJobsRepository =
  WorkflowJobsPostgresRepositoryServiceForRecord<SearchTenantIndexEnsureWorkflowJobRecord>;

type SearchWorkflowSchedulerClient = {
  readonly scheduleSearchTenantIndexEnsureWorkflowJob: (input: {
    readonly jobId: string;
    readonly scheduledAt: string;
  }) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
};

export type SearchServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | ConvexWorkflowExecutionError
  | FileStorageModuleError
  | IdentitySessionRequestContextNotFoundError
  | RuntimeConfigModulePersistenceError
  | SearchDeclarationMissingError
  | SearchModuleDisabledError
  | SearchModuleError
  | SearchTenantIndexNotFoundError
  | SearchTenantIndexPostgresRepositoryError
  | SearchTenantIndexSettingsUnavailableError
  | SearchUnauthenticatedActorError
  | SearchWorkflowUnavailableError
  | SupportOperationsCasePostgresRepositoryError
  | UnknownConfigKeyError
  | ValkeyAdapterOperationError
  | WorkflowJobsPostgresRepositoryError
  | SearchAccessDeniedError;

export type SearchServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs?: SearchWorkflowJobsRepository;
  readonly convexWorkflowClient?: SearchWorkflowSchedulerClient;
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
};

export type SearchServiceApi = {
  readonly resolveRequestContext: (
    input: SearchSessionLookup,
  ) => Effect.Effect<
    RequestContext,
    | ParseResult.ParseError
    | IdentitySessionRequestContextNotFoundError
    | ValkeyAdapterOperationError
  >;
  readonly ensureTenantIndex: (
    input: EnsureSearchTenantIndexBySessionRequest,
  ) => Effect.Effect<SearchTenantIndexSummaryView, SearchServiceError>;
  readonly getTenantIndexRecord: (
    input: GetSearchTenantIndexRecordBySessionRequest,
  ) => Effect.Effect<SearchTenantIndexRecord | undefined, SearchServiceError>;
  readonly listTenantIndexRecords: (
    input: ListSearchTenantIndexRecordsBySessionRequest,
  ) => Effect.Effect<readonly SearchTenantIndexRecord[], SearchServiceError>;
  readonly deleteTenantIndex: (
    input: DeleteSearchTenantIndexBySessionRequest,
  ) => Effect.Effect<SearchTenantIndexDeletionReceipt, SearchServiceError>;
  readonly queryManagedFiles: (
    input: QuerySearchManagedFilesBySessionRequest,
  ) => Effect.Effect<SearchManagedFileQueryResult, SearchServiceError>;
  readonly querySupportCases: (
    input: QuerySearchSupportCasesBySessionRequest,
  ) => Effect.Effect<SearchSupportCaseQueryResult, SearchServiceError>;
  readonly queryCurrentTenantManagedFiles: (
    input: QueryCurrentTenantSearchManagedFilesBySessionRequest,
  ) => Effect.Effect<SearchManagedFileQueryResult, SearchServiceError>;
  readonly requestTenantIndexReindexWorkflowJob: (
    input: RequestSearchTenantIndexReindexWorkflowJobBySessionRequest,
  ) => Effect.Effect<WorkflowJobSummary, SearchServiceError>;
  readonly requestTenantIndexEnsureWorkflowJob: (
    input: RequestSearchTenantIndexEnsureWorkflowJobBySessionRequest,
  ) => Effect.Effect<WorkflowJobSummary, SearchServiceError>;
  readonly runSearchTenantIndexEnsureWorkflowJob: (
    input: RunSearchTenantIndexEnsureWorkflowJobRequest,
  ) => Effect.Effect<WorkflowJobSummary | undefined, SearchServiceError>;
};

export class SearchService extends Context.Tag("SearchService")<
  SearchService,
  SearchServiceApi
>() {}

type AuthenticatedSearchOperatorContext = RequestContext & {
  readonly actorId: string;
};

type CurrentTenantSearchAccess = {
  readonly requestContext: RequestContext & {
    readonly actorId: string;
  };
  readonly target: SearchTarget;
};

const decodeBoolean = Schema.decodeUnknown(Schema.Boolean);

const buildTargetTenantContext = (
  target: SearchTarget,
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

const buildSearchTenantIndexName = (target: SearchTarget) =>
  [platformModuleId.search, target.scope, target.scopeId].join(":");

const buildSearchDocumentId = (input: {
  readonly documentFamily:
    | typeof searchDocumentFamily.managedFileSummary
    | typeof searchDocumentFamily.supportCaseSummary;
  readonly entityId: string;
}) => [input.documentFamily, input.entityId].join("__");

const buildSearchTenantDocuments = (input: {
  readonly fileStorage: Pick<FileStorageModule, never> & {
    readonly listManagedFiles: (request: {
      readonly scope: SearchTarget["scope"];
      readonly scopeId: string;
    }) => Effect.Effect<readonly unknown[], FileStorageModuleError>;
  };
  readonly supportCaseRepository: {
    readonly listSupportCases: (request: {
      readonly tenantScope: SearchTarget["scope"];
      readonly tenantScopeId: string;
    }) => Effect.Effect<
      readonly unknown[],
      SupportOperationsCasePostgresRepositoryError
    >;
  };
  readonly target: SearchTarget;
}) =>
  Effect.all({
    managedFiles: input.fileStorage.listManagedFiles({
      scope: input.target.scope,
      scopeId: input.target.scopeId,
    }),
    supportCases: input.supportCaseRepository.listSupportCases({
      tenantScope: input.target.scope,
      tenantScopeId: input.target.scopeId,
    }),
  }).pipe(
    Effect.flatMap(({ managedFiles, supportCases }) =>
      Effect.all({
        managedFileDocuments: Effect.forEach(managedFiles, (managedFile) =>
          Schema.decodeUnknown(SearchManagedFileDocumentSchema)(
            managedFile,
          ).pipe(
            Effect.flatMap((decodedManagedFile) =>
              Schema.decodeUnknown(SearchManagedFileIndexedDocumentSchema)({
                ...decodedManagedFile,
                documentId: buildSearchDocumentId({
                  documentFamily: searchDocumentFamily.managedFileSummary,
                  entityId: decodedManagedFile.fileId,
                }),
                documentFamily: searchDocumentFamily.managedFileSummary,
              }),
            ),
          ),
        ),
        supportCaseDocuments: Effect.forEach(supportCases, (supportCase) =>
          Schema.decodeUnknown(SearchSupportCaseDocumentSchema)(
            supportCase,
          ).pipe(
            Effect.flatMap((decodedSupportCase) =>
              Schema.decodeUnknown(SearchSupportCaseIndexedDocumentSchema)({
                ...decodedSupportCase,
                documentId: buildSearchDocumentId({
                  documentFamily: searchDocumentFamily.supportCaseSummary,
                  entityId: decodedSupportCase.caseId,
                }),
                documentFamily: searchDocumentFamily.supportCaseSummary,
              }),
            ),
          ),
        ),
      }),
    ),
    Effect.flatMap(({ managedFileDocuments, supportCaseDocuments }) =>
      Schema.decodeUnknown(SearchTenantDocumentListSchema)([
        ...managedFileDocuments,
        ...supportCaseDocuments,
      ]),
    ),
  );

const requiredSearchFilterableAttributes = [
  searchFields.documentFamily,
  searchFields.status,
  searchFields.priority,
] as const;

const requiredSearchSortableAttributes = [
  searchFields.startedAt,
  searchFields.lastUpdatedAt,
] as const;

const appendMissingSearchSettingsAttributes = (
  attributes: readonly string[],
  requiredAttributes: readonly string[],
) => [
  ...attributes,
  ...requiredAttributes.filter((attribute) => !attributes.includes(attribute)),
];

const normalizeSearchTenantIndexSettings = (
  settings:
    | EnsureSearchTenantIndexBySessionRequest["settings"]
    | NonNullable<SearchTenantIndexRecord["settings"]>,
) => ({
  ...settings,
  filterableAttributes: appendMissingSearchSettingsAttributes(
    settings.filterableAttributes,
    requiredSearchFilterableAttributes,
  ),
  sortableAttributes: appendMissingSearchSettingsAttributes(
    settings.sortableAttributes,
    requiredSearchSortableAttributes,
  ),
});

const requestTargetsCurrentTenant = (
  requestContext: RequestContext,
  target: SearchTarget,
) =>
  requestContext.tenant.scope === target.scope &&
  requestContext.tenant.scopeId === target.scopeId;

const ensureSearchOperatorAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedSearchOperatorContext,
  SearchUnauthenticatedActorError | SearchAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): SearchUnauthenticatedActorError => ({
        _tag: "SearchUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "SearchAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies SearchAccessDeniedError),
    ),
  );

const authorizeSearchOperatorAccess = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: RequestContext;
  readonly target: SearchTarget;
}) =>
  Effect.gen(function* () {
    const authenticatedRequestContext = yield* ensureSearchOperatorAccess(
      input.requestContext,
    );
    if (
      !requestTargetsCurrentTenant(authenticatedRequestContext, input.target) &&
      !hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
    ) {
      return yield* Effect.fail({
        _tag: "SearchAccessDeniedError",
        actorType: authenticatedRequestContext.actorType,
      } satisfies SearchAccessDeniedError);
    }

    const decision = yield* input.authorization.check({
      requestContext: authenticatedRequestContext,
      namespace: authorizationNamespace.module,
      object: platformModuleId.search,
      relation: authorizationRelation.admin,
      permissionScope: permissionScope.searchAdmin,
    });

    return decision.allowed
      ? authenticatedRequestContext
      : yield* Effect.fail({
          _tag: "SearchAccessDeniedError",
          actorType: authenticatedRequestContext.actorType,
        } satisfies SearchAccessDeniedError);
  });

const ensureCurrentTenantSearchAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  CurrentTenantSearchAccess,
  SearchUnauthenticatedActorError | SearchAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): SearchUnauthenticatedActorError => ({
        _tag: "SearchUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) => {
      switch (authenticatedRequestContext.tenant.scope) {
        case platformScope.enterprise:
        case platformScope.organization:
        case platformScope.individual:
          return Effect.succeed({
            requestContext: authenticatedRequestContext,
            target: {
              scope: authenticatedRequestContext.tenant.scope,
              scopeId: authenticatedRequestContext.tenant.scopeId,
            },
          } satisfies CurrentTenantSearchAccess);
        default:
          return Effect.fail({
            _tag: "SearchAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies SearchAccessDeniedError);
      }
    }),
  );

const requireSearchFeatureFlag = () =>
  Effect.fromNullable(
    findModuleManifest(platformModuleId.search)?.featureFlags.find(
      (candidate) => candidate.key === searchFeatureFlag.enabled,
    ),
  ).pipe(
    Effect.orElseFail(
      (): SearchDeclarationMissingError => ({
        _tag: "SearchDeclarationMissingError",
        moduleId: platformModuleId.search,
        key: searchFeatureFlag.enabled,
      }),
    ),
  );

const ensureSearchEnabled = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly target: SearchTarget;
}) =>
  Effect.gen(function* () {
    const flag = yield* requireSearchFeatureFlag();
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.search,
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
      moduleId: platformModuleId.search,
      flag,
      overrides,
      entitlements: [],
    });
    const enabled = yield* decodeBoolean(resolution.effectiveValue);

    if (!enabled) {
      return yield* Effect.fail({
        _tag: "SearchModuleDisabledError",
        scope: input.target.scope,
        scopeId: input.target.scopeId,
      } satisfies SearchModuleDisabledError);
    }

    return true as const;
  });

const makeSearchAuditAppend = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly requestContext: RequestContext;
  readonly action:
    | typeof searchAuditAction.indexEnsureRequested
    | typeof searchAuditAction.indexReindexRequested
    | typeof searchAuditAction.indexDeleteRequested
    | typeof searchAuditAction.indexEnsured
    | typeof searchAuditAction.indexDeleted
    | typeof searchAuditAction.queryExecuted
    | typeof searchAuditAction.queryPreviewed;
  readonly scope: SearchTarget["scope"];
  readonly scopeId: string;
  readonly reason: string;
}) =>
  input.auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.search,
    action: input.action,
    target: [platformModuleId.search, input.scope, input.scopeId].join(":"),
    reason: input.reason,
  });

const hasExhaustedSearchWorkflowRecoveryBudget = (attempts: number) =>
  attempts >= workflowJobsRetryMaxAttempts;

const readSearchWorkflowFailureMessage = (error: unknown) => {
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

  return "Search tenant index ensure workflow job failed.";
};

const buildSearchTenantIndexEnsureWorkflowJobRecord = (input: {
  readonly jobId: string;
  readonly scope: SearchTarget["scope"];
  readonly scopeId: string;
  readonly requestContext: AuthenticatedSearchOperatorContext;
  readonly actorId: string;
  readonly correlationId: string;
  readonly settings: EnsureSearchTenantIndexBySessionRequest["settings"];
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(SearchTenantIndexEnsureWorkflowJobRecordSchema)({
    jobId: input.jobId,
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.search,
    kind: workflowJobKind.searchIndexEnsure,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.scheduled,
    tenantScope: input.scope,
    tenantScopeId: input.scopeId,
    attempts: 0,
    scheduledAt: input.scheduledAt,
    payload: {
      sourceModuleId: platformModuleId.search,
      tenantScope: input.scope,
      tenantScopeId: input.scopeId,
      requestContext: input.requestContext,
      actorId: input.actorId,
      correlationId: input.correlationId,
      settings: input.settings,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildSearchTenantIndexEnsureWorkflowDispatchRecord = (input: {
  readonly job: SearchTenantIndexEnsureWorkflowJobRecord;
  readonly now: string;
  readonly dispatch: ConvexScheduledWorkflowDispatch;
}) =>
  Schema.decodeUnknown(SearchTenantIndexEnsureWorkflowJobRecordSchema)({
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

const completeSearchTenantIndexEnsureWorkflowJob = (input: {
  readonly job: SearchTenantIndexEnsureWorkflowJobRecord;
  readonly now: string;
}) =>
  Schema.decodeUnknown(SearchTenantIndexEnsureWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.completed,
    completedAt: input.now,
    gapReason: undefined,
    lastError: undefined,
    updatedAt: input.now,
  });

const blockSearchTenantIndexEnsureWorkflowJob = (input: {
  readonly job: SearchTenantIndexEnsureWorkflowJobRecord;
  readonly now: string;
  readonly lastError?: string;
}) =>
  Schema.decodeUnknown(SearchTenantIndexEnsureWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.blocked,
    completedAt: input.now,
    ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
    gapReason: workflowJobGapReason.repairFailed,
    updatedAt: input.now,
  });

const shouldBlockStaleRunningSearchTenantIndexEnsureWorkflowJob = (
  job: SearchTenantIndexEnsureWorkflowJobRecord,
) =>
  job.status === workflowJobStatus.running &&
  hasExhaustedSearchWorkflowRecoveryBudget(job.attempts) &&
  Date.parse(job.updatedAt) <=
    Date.now() - workflowJobsRunningClaimTimeoutSeconds * 1_000;

const requireSearchTenantIndexRecordForReindex = (input: {
  readonly searchTenantIndexes: SearchTenantIndexPostgresRepository["Type"];
  readonly target: SearchTarget;
}) =>
  input.searchTenantIndexes
    .getSearchTenantIndexRecord({
      indexName: buildSearchTenantIndexName(input.target),
      scope: input.target.scope,
      scopeId: input.target.scopeId,
    })
    .pipe(
      Effect.flatMap((record) =>
        Effect.fromNullable(record).pipe(
          Effect.orElseFail(
            (): SearchTenantIndexNotFoundError => ({
              _tag: "SearchTenantIndexNotFoundError",
              scope: input.target.scope,
              scopeId: input.target.scopeId,
            }),
          ),
        ),
      ),
      Effect.flatMap((record) =>
        record.lifecycleState === searchIndexLifecycleState.deleted
          ? Effect.fail({
              _tag: "SearchTenantIndexNotFoundError",
              scope: input.target.scope,
              scopeId: input.target.scopeId,
            } satisfies SearchTenantIndexNotFoundError)
          : Effect.succeed(record),
      ),
    );

const requireSearchTenantIndexSettingsForReindex = (input: {
  readonly record: SearchTenantIndexRecord;
}) =>
  Effect.fromNullable(input.record.settings).pipe(
    Effect.map((settings) => normalizeSearchTenantIndexSettings(settings)),
    Effect.orElseFail(
      (): SearchTenantIndexSettingsUnavailableError => ({
        _tag: "SearchTenantIndexSettingsUnavailableError",
        scope: input.record.scope,
        scopeId: input.record.scopeId,
      }),
    ),
  );

const buildSearchService = (
  authorization: Pick<AuthorizationModuleService, "check">,
  options: SearchServiceOptions,
) =>
  Effect.gen(function* () {
    const auditLog = yield* AuditLogModule;
    const fileStorage = yield* FileStorageModule;
    const identitySession = yield* IdentitySessionModule;
    const runtimeConfig = yield* RuntimeConfigModule;
    const search = yield* SearchModule;
    const supportCaseRepository =
      yield* SupportOperationsCasePostgresRepository;
    const searchTenantIndexes = yield* SearchTenantIndexPostgresRepository;
    const workflowJobs = options.workflowJobs;
    const convexWorkflowClient = options.convexWorkflowClient;
    const businessEventEmitter =
      options.businessEventEmitter ?? noopPlatformBusinessEventEmitter;

    const requireWorkflowJobs = () =>
      workflowJobs === undefined
        ? Effect.fail({
            _tag: "SearchWorkflowUnavailableError",
            dependency: "workflowJobs",
          } as const)
        : Effect.succeed(workflowJobs);

    const requireConvexWorkflowClient = () =>
      convexWorkflowClient === undefined
        ? Effect.fail({
            _tag: "SearchWorkflowUnavailableError",
            dependency: "convexWorkflowClient",
          } as const)
        : Effect.succeed(convexWorkflowClient);

    const requestSearchTenantIndexEnsureWorkflowJobWithSettings = (input: {
      readonly target: SearchTarget;
      readonly requestContext: AuthenticatedSearchOperatorContext;
      readonly settings: RequestSearchTenantIndexEnsureWorkflowJobBySessionRequest["settings"];
      readonly scheduledAt?: string;
    }) =>
      Effect.gen(function* () {
        const normalizedSettings = normalizeSearchTenantIndexSettings(
          input.settings,
        );
        const workflowJobs = yield* requireWorkflowJobs();
        const convexWorkflowClient = yield* requireConvexWorkflowClient();

        const now = new Date().toISOString();
        const workflowJob =
          yield* buildSearchTenantIndexEnsureWorkflowJobRecord({
            jobId: buildSearchTenantIndexEnsureWorkflowJobId({
              trigger: workflowJobTrigger.operatorRequested,
              tenantScope: input.target.scope,
              tenantScopeId: input.target.scopeId,
              key: input.requestContext.correlationId,
            }),
            scope: input.target.scope,
            scopeId: input.target.scopeId,
            requestContext: input.requestContext,
            actorId: input.requestContext.actorId,
            correlationId: input.requestContext.correlationId,
            settings: normalizedSettings,
            scheduledAt: input.scheduledAt ?? now,
            now,
          });
        const persistedJob =
          yield* workflowJobs.persistWorkflowJob(workflowJob);
        const dispatch = yield* convexWorkflowClient
          .scheduleSearchTenantIndexEnsureWorkflowJob({
            jobId: persistedJob.jobId,
            scheduledAt: persistedJob.scheduledAt,
          })
          .pipe(
            Effect.catchAllCause((cause) =>
              persistSearchTenantIndexEnsureWorkflowDispatchFailure({
                workflowJobs,
                job: persistedJob,
                cause,
              }),
            ),
          );
        const dispatchedJob =
          yield* buildSearchTenantIndexEnsureWorkflowDispatchRecord({
            job: persistedJob,
            now: new Date().toISOString(),
            dispatch,
          }).pipe(
            Effect.catchAllCause((cause) =>
              persistSearchTenantIndexEnsureWorkflowDispatchFailure({
                workflowJobs,
                job: persistedJob,
                cause,
              }),
            ),
          );
        const scheduledJob = yield* workflowJobs
          .persistWorkflowJob(dispatchedJob)
          .pipe(
            Effect.catchAllCause((cause) =>
              persistSearchTenantIndexEnsureWorkflowDispatchFailure({
                workflowJobs,
                job: dispatchedJob,
                cause,
              }),
            ),
          );

        return yield* buildWorkflowJobSummary({ record: scheduledJob });
      });

    const persistSearchTenantIndexEnsureWorkflowDispatchFailure = (input: {
      readonly workflowJobs: SearchWorkflowJobsRepository;
      readonly job: SearchTenantIndexEnsureWorkflowJobRecord;
      readonly cause: Cause.Cause<SearchServiceError>;
    }) => {
      const now = new Date().toISOString();

      return blockSearchTenantIndexEnsureWorkflowJob({
        job: input.job,
        now,
        lastError: Cause.pretty(input.cause),
      }).pipe(
        Effect.flatMap((blockedJob) =>
          input.workflowJobs.persistWorkflowJob(blockedJob),
        ),
        Effect.flatMap(() => Effect.failCause(input.cause)),
      );
    };

    return {
      resolveRequestContext: (input: SearchSessionLookup) =>
        Schema.decodeUnknown(SearchSessionLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            identitySession.resolveRequestContext({
              sessionId: request.sessionId,
            }),
          ),
        ),
      ensureTenantIndex: (input: EnsureSearchTenantIndexBySessionRequest) =>
        Schema.decodeUnknown(EnsureSearchTenantIndexBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const normalizedSettings = normalizeSearchTenantIndexSettings(
                request.settings,
              );
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target,
                });

              yield* ensureSearchEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target,
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.indexEnsureRequested,
                scope: request.scope,
                scopeId: request.scopeId,
                reason: `Request ensure search index ${request.scope}:${request.scopeId}.`,
              });

              const documents = yield* buildSearchTenantDocuments({
                fileStorage,
                supportCaseRepository,
                target,
              });

              const summary = yield* search.ensureTenantIndex({
                scope: request.scope,
                scopeId: request.scopeId,
                settings: normalizedSettings,
                documents,
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.indexEnsured,
                scope: request.scope,
                scopeId: request.scopeId,
                reason: `Ensure search index ${request.scope}:${request.scopeId}.`,
              });

              return summary;
            }),
          ),
        ),
      getTenantIndexRecord: (
        input: GetSearchTenantIndexRecordBySessionRequest,
      ) =>
        Schema.decodeUnknown(GetSearchTenantIndexRecordBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target: {
                    scope: request.scope,
                    scopeId: request.scopeId,
                  },
                });

              return yield* searchTenantIndexes.getSearchTenantIndexRecord({
                indexName: buildSearchTenantIndexName({
                  scope: request.scope,
                  scopeId: request.scopeId,
                }),
                scope: request.scope,
                scopeId: request.scopeId,
              });
            }),
          ),
        ),
      listTenantIndexRecords: (
        input: ListSearchTenantIndexRecordsBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          ListSearchTenantIndexRecordsBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target: {
                    scope: request.scope,
                    scopeId: request.scopeId,
                  },
                });

              return yield* searchTenantIndexes.listSearchTenantIndexRecords({
                scope: request.scope,
                scopeId: request.scopeId,
              });
            }),
          ),
        ),
      deleteTenantIndex: (input: DeleteSearchTenantIndexBySessionRequest) =>
        Schema.decodeUnknown(DeleteSearchTenantIndexBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target: {
                    scope: request.scope,
                    scopeId: request.scopeId,
                  },
                });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.indexDeleteRequested,
                scope: request.scope,
                scopeId: request.scopeId,
                reason: `Request delete search index ${request.scope}:${request.scopeId}.`,
              });

              const receipt = yield* search.deleteTenantIndex({
                scope: request.scope,
                scopeId: request.scopeId,
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.indexDeleted,
                scope: request.scope,
                scopeId: request.scopeId,
                reason: `Delete search index ${request.scope}:${request.scopeId}.`,
              });

              return receipt;
            }),
          ),
        ),
      queryManagedFiles: (input: QuerySearchManagedFilesBySessionRequest) =>
        Schema.decodeUnknown(QuerySearchManagedFilesBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target: {
                    scope: request.scope,
                    scopeId: request.scopeId,
                  },
                });

              const result = yield* search.queryManagedFiles({
                indexName: buildSearchTenantIndexName({
                  scope: request.scope,
                  scopeId: request.scopeId,
                }),
                scope: request.scope,
                scopeId: request.scopeId,
                query: request.query,
                ...(request.limit !== undefined
                  ? { limit: request.limit }
                  : {}),
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.queryPreviewed,
                scope: request.scope,
                scopeId: request.scopeId,
                reason: `Preview search query for ${request.scope}:${request.scopeId}.`,
              });
              yield* businessEventEmitter({
                requestContext: authorizedRequestContext,
                moduleId: platformModuleId.search,
                eventName:
                  platformBusinessEventName.searchManagedFilesQueryPreviewed,
                permissionScope: permissionScope.searchAdmin,
                properties: {
                  targetScope: request.scope,
                  targetScopeId: request.scopeId,
                  documentFamily: searchDocumentFamily.managedFileSummary,
                  queryLength: request.query.length,
                  resultCount: result.hits.length,
                  ...(request.limit !== undefined
                    ? { limit: request.limit }
                    : {}),
                },
              });

              return result;
            }),
          ),
        ),
      querySupportCases: (input: QuerySearchSupportCasesBySessionRequest) =>
        Schema.decodeUnknown(QuerySearchSupportCasesBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target: {
                    scope: request.scope,
                    scopeId: request.scopeId,
                  },
                });

              const result = yield* search.querySupportCases({
                indexName: buildSearchTenantIndexName({
                  scope: request.scope,
                  scopeId: request.scopeId,
                }),
                scope: request.scope,
                scopeId: request.scopeId,
                query: request.query,
                ...(request.limit !== undefined
                  ? { limit: request.limit }
                  : {}),
                ...(request.status !== undefined
                  ? { status: request.status }
                  : {}),
                ...(request.priority !== undefined
                  ? { priority: request.priority }
                  : {}),
                ...(request.sort !== undefined ? { sort: request.sort } : {}),
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.queryPreviewed,
                scope: request.scope,
                scopeId: request.scopeId,
                reason: `Preview support-case search query for ${request.scope}:${request.scopeId}.`,
              });
              yield* businessEventEmitter({
                requestContext: authorizedRequestContext,
                moduleId: platformModuleId.search,
                eventName:
                  platformBusinessEventName.searchSupportCasesQueryPreviewed,
                permissionScope: permissionScope.searchAdmin,
                properties: {
                  targetScope: request.scope,
                  targetScopeId: request.scopeId,
                  documentFamily: searchDocumentFamily.supportCaseSummary,
                  queryLength: request.query.length,
                  resultCount: result.hits.length,
                  ...(request.limit !== undefined
                    ? { limit: request.limit }
                    : {}),
                  ...(request.sort !== undefined ? { sort: request.sort } : {}),
                  ...(request.status !== undefined
                    ? { statusFilterCount: request.status.length }
                    : {}),
                  ...(request.priority !== undefined
                    ? { priorityFilterCount: request.priority.length }
                    : {}),
                },
              });

              return result;
            }),
          ),
        ),
      queryCurrentTenantManagedFiles: (
        input: QueryCurrentTenantSearchManagedFilesBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          QueryCurrentTenantSearchManagedFilesBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const currentTenantAccess =
                yield* ensureCurrentTenantSearchAccess(requestContext);

              yield* ensureSearchEnabled({
                runtimeConfig,
                requestContext: currentTenantAccess.requestContext,
                target: currentTenantAccess.target,
              });

              const result = yield* search.queryManagedFiles({
                indexName: buildSearchTenantIndexName(
                  currentTenantAccess.target,
                ),
                scope: currentTenantAccess.target.scope,
                scopeId: currentTenantAccess.target.scopeId,
                query: request.query,
                ...(request.limit !== undefined
                  ? { limit: request.limit }
                  : {}),
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: currentTenantAccess.requestContext,
                action: searchAuditAction.queryExecuted,
                scope: currentTenantAccess.target.scope,
                scopeId: currentTenantAccess.target.scopeId,
                reason: `Execute current-tenant search query for ${currentTenantAccess.target.scope}:${currentTenantAccess.target.scopeId}.`,
              });
              yield* businessEventEmitter({
                requestContext: currentTenantAccess.requestContext,
                moduleId: platformModuleId.search,
                eventName:
                  platformBusinessEventName.searchCurrentTenantManagedFilesQueryExecuted,
                properties: {
                  documentFamily: searchDocumentFamily.managedFileSummary,
                  queryLength: request.query.length,
                  resultCount: result.hits.length,
                  ...(request.limit !== undefined
                    ? { limit: request.limit }
                    : {}),
                },
              });

              return result;
            }),
          ),
        ),
      requestTenantIndexReindexWorkflowJob: (
        input: RequestSearchTenantIndexReindexWorkflowJobBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          RequestSearchTenantIndexReindexWorkflowJobBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target,
                });

              yield* ensureSearchEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target,
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.indexReindexRequested,
                scope: target.scope,
                scopeId: target.scopeId,
                reason: `Request background reindex search index ${request.scope}:${request.scopeId}.`,
              });

              const currentRecord =
                yield* requireSearchTenantIndexRecordForReindex({
                  searchTenantIndexes,
                  target,
                });
              const settings =
                yield* requireSearchTenantIndexSettingsForReindex({
                  record: currentRecord,
                });

              return yield* requestSearchTenantIndexEnsureWorkflowJobWithSettings(
                {
                  target,
                  requestContext: authorizedRequestContext,
                  settings,
                  ...(request.scheduledAt === undefined
                    ? {}
                    : { scheduledAt: request.scheduledAt }),
                },
              );
            }),
          ),
        ),
      requestTenantIndexEnsureWorkflowJob: (
        input: RequestSearchTenantIndexEnsureWorkflowJobBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          RequestSearchTenantIndexEnsureWorkflowJobBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;
              const authorizedRequestContext =
                yield* authorizeSearchOperatorAccess({
                  authorization,
                  requestContext,
                  target,
                });

              yield* ensureSearchEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target,
              });

              yield* makeSearchAuditAppend({
                auditLog,
                requestContext: authorizedRequestContext,
                action: searchAuditAction.indexEnsureRequested,
                scope: target.scope,
                scopeId: target.scopeId,
                reason: `Request background ensure search index ${request.scope}:${request.scopeId}.`,
              });

              return yield* requestSearchTenantIndexEnsureWorkflowJobWithSettings(
                {
                  target,
                  requestContext: authorizedRequestContext,
                  settings: request.settings,
                  ...(request.scheduledAt === undefined
                    ? {}
                    : { scheduledAt: request.scheduledAt }),
                },
              );
            }),
          ),
        ),
      runSearchTenantIndexEnsureWorkflowJob: (
        input: RunSearchTenantIndexEnsureWorkflowJobRequest,
      ) =>
        Schema.decodeUnknown(
          RunSearchTenantIndexEnsureWorkflowJobRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const workflowJobs = yield* requireWorkflowJobs();

              return yield* executeWorkflowJobRecord({
                jobId: request.jobId,
                loadJob: ({ jobId }) => workflowJobs.getWorkflowJob({ jobId }),
                shouldBlockStaleRunningJob: ({ job }) =>
                  shouldBlockStaleRunningSearchTenantIndexEnsureWorkflowJob(
                    job,
                  ),
                blockStaleRunningJob: ({ job }) => {
                  const now = new Date().toISOString();

                  return blockSearchTenantIndexEnsureWorkflowJob({
                    job,
                    now,
                    lastError:
                      "Search tenant index ensure workflow job exceeded the recovery budget.",
                  }).pipe(
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
                runClaimedJob: ({ job }) => {
                  const now = new Date().toISOString();
                  const target = {
                    scope: job.payload.tenantScope,
                    scopeId: job.payload.tenantScopeId,
                  } as const;

                  return authorizeSearchOperatorAccess({
                    authorization,
                    requestContext: job.payload.requestContext,
                    target,
                  }).pipe(
                    Effect.flatMap((authorizedRequestContext) =>
                      ensureSearchEnabled({
                        runtimeConfig,
                        requestContext: authorizedRequestContext,
                        target,
                      }).pipe(Effect.as(authorizedRequestContext)),
                    ),
                    Effect.flatMap((authorizedRequestContext) =>
                      buildSearchTenantDocuments({
                        fileStorage,
                        supportCaseRepository,
                        target,
                      }).pipe(
                        Effect.flatMap((documents) =>
                          search.ensureTenantIndex({
                            scope: job.payload.tenantScope,
                            scopeId: job.payload.tenantScopeId,
                            settings: normalizeSearchTenantIndexSettings(
                              job.payload.settings,
                            ),
                            documents,
                          }),
                        ),
                        Effect.flatMap(() =>
                          makeSearchAuditAppend({
                            auditLog,
                            requestContext: authorizedRequestContext,
                            action: searchAuditAction.indexEnsured,
                            scope: job.payload.tenantScope,
                            scopeId: job.payload.tenantScopeId,
                            reason: `Ensure search index ${job.payload.tenantScope}:${job.payload.tenantScopeId}.`,
                          }),
                        ),
                      ),
                    ),
                    Effect.flatMap(() =>
                      completeSearchTenantIndexEnsureWorkflowJob({
                        job,
                        now,
                      }),
                    ),
                    Effect.catchAll((error) =>
                      blockSearchTenantIndexEnsureWorkflowJob({
                        job,
                        now,
                        lastError: readSearchWorkflowFailureMessage(error),
                      }),
                    ),
                    Effect.flatMap((record) =>
                      workflowJobs.persistWorkflowJob(record),
                    ),
                  );
                },
                recoverClaimedJobFailure: ({ job, cause }) => {
                  const now = new Date().toISOString();

                  return blockSearchTenantIndexEnsureWorkflowJob({
                    job,
                    now,
                    lastError: Cause.pretty(cause),
                  }).pipe(
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
    } satisfies SearchServiceApi;
  });

const makeLiveSearchAuthorization = Effect.gen(function* () {
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

export function makeSearchService(options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs?: SearchWorkflowJobsRepository;
  readonly convexWorkflowClient?: SearchWorkflowSchedulerClient;
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
}): Effect.Effect<
  SearchServiceApi,
  ParseResult.ParseError,
  | AuditLogModule
  | FileStorageModule
  | IdentitySessionModule
  | RuntimeConfigModule
  | SearchModule
  | SupportOperationsCasePostgresRepository
  | SearchTenantIndexPostgresRepository
>;
export function makeSearchService(
  options?: SearchServiceOptions,
): Effect.Effect<
  SearchServiceApi,
  ParseResult.ParseError,
  | AuditLogModule
  | FileStorageModule
  | IdentitySessionModule
  | RuntimeConfigModule
  | SearchModule
  | SupportOperationsCasePostgresRepository
  | SearchTenantIndexPostgresRepository
  | OryKetoAdapter
>;
export function makeSearchService(
  options: SearchServiceOptions = {},
): Effect.Effect<
  SearchServiceApi,
  ParseResult.ParseError,
  | AuditLogModule
  | FileStorageModule
  | IdentitySessionModule
  | RuntimeConfigModule
  | SearchModule
  | SupportOperationsCasePostgresRepository
  | SearchTenantIndexPostgresRepository
  | OryKetoAdapter
> {
  return options.authorization === undefined
    ? makeLiveSearchAuthorization.pipe(
        Effect.flatMap((authorization) =>
          buildSearchService(authorization, options),
        ),
      )
    : buildSearchService(options.authorization, options);
}

export const SearchServiceLive = Layer.effect(
  SearchService,
  makeSearchService(),
);

const SearchTransportProcessEnvironmentSchema = Schema.Struct({
  MEILISEARCH_URL: Schema.NonEmptyString,
  MEILISEARCH_API_KEY: Schema.NonEmptyString,
});

const SearchTransportConvexRuntimeSystemEnvironmentSchema = Schema.Struct({
  CONVEX_CLOUD_URL: Schema.NonEmptyString,
  CONVEX_SITE_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_ADMIN_KEY: Schema.optional(Schema.NonEmptyString),
});

const SearchTransportConvexProcessEnvironmentSchema = Schema.Struct({
  MEILISEARCH_URL_INTERNAL: Schema.NonEmptyString,
  MEILISEARCH_API_KEY: Schema.NonEmptyString,
});

const decodeSearchTransportProcessEnvironment = Schema.decodeUnknown(
  SearchTransportProcessEnvironmentSchema,
);

const decodeSearchTransportConvexRuntimeSystemEnvironment =
  Schema.decodeUnknown(SearchTransportConvexRuntimeSystemEnvironmentSchema);

const decodeSearchTransportConvexProcessEnvironment = Schema.decodeUnknown(
  SearchTransportConvexProcessEnvironmentSchema,
);

type SearchTransportProcessEnvironment = Schema.Schema.Type<
  typeof SearchTransportProcessEnvironmentSchema
>;

type SearchTransportSubscriberJourneyRuntimeOptions = Omit<
  SubscriberJourneyRuntimeOptions,
  "convexUrl" | "convexSiteUrl" | "convexAdminKey"
>;

type SearchTransportConvexRuntimeOptions = {
  readonly deploymentUrl: string;
  readonly siteUrl: string;
  readonly adminKey?: string;
};

type SearchTransportRuntimeOptions = {
  readonly subscriberJourney: SearchTransportSubscriberJourneyRuntimeOptions;
  readonly convex: SearchTransportConvexRuntimeOptions;
  readonly meilisearchUrl: string;
  readonly meilisearchApiKey: string;
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
};

export type SearchRuntimeError = {
  readonly _tag: "SearchRuntimeError";
  readonly cause: unknown;
};

export type SearchTransportRuntime = {
  readonly service: SearchServiceApi;
};

const buildSearchTenantIndexPostgresQueryable = (
  database: PostgresRuntimeDatabase,
): SearchTenantIndexPostgresQueryable => ({
  upsertSearchTenantIndex: async (record) => {
    const [row] = await database
      .insert(searchTenantIndexesTable)
      .values(record)
      .onConflictDoUpdate({
        target: [searchTenantIndexesTable.indexName],
        set: {
          scope: record.scope,
          scopeId: record.scopeId,
          lifecycleState: record.lifecycleState,
          documentCount: record.documentCount,
          settings: record.settings ?? null,
          lastSyncedAt: record.lastSyncedAt ?? null,
          lastError: record.lastError ?? null,
          deletedAt: record.deletedAt ?? null,
          updatedAt: record.updatedAt,
        },
      })
      .returning();

    if (row === undefined) {
      throw new Error("Search tenant index upsert returned no row.");
    }

    return row;
  },
  getSearchTenantIndex: async (scope, scopeId, indexName) => {
    const [row] = await database
      .select()
      .from(searchTenantIndexesTable)
      .where(
        and(
          eq(searchTenantIndexesTable.scope, scope),
          eq(searchTenantIndexesTable.scopeId, scopeId),
          eq(searchTenantIndexesTable.indexName, indexName),
        ),
      )
      .limit(1);

    return row;
  },
  listSearchTenantIndexesByScope: (scope, scopeId) =>
    database
      .select()
      .from(searchTenantIndexesTable)
      .where(
        and(
          eq(searchTenantIndexesTable.scope, scope),
          eq(searchTenantIndexesTable.scopeId, scopeId),
        ),
      )
      .orderBy(desc(searchTenantIndexesTable.updatedAt)),
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

const makeSearchTransportRuntime = (options: SearchTransportRuntimeOptions) =>
  Effect.gen(function* () {
    const convexAdapter = yield* makeConvexAdapter({
      deploymentUrl: options.convex.deploymentUrl,
      siteUrl: options.convex.siteUrl,
      ...(options.convex.adminKey !== undefined
        ? { adminKey: options.convex.adminKey }
        : {}),
      keycloakBaseUrl: options.subscriberJourney.keycloakBaseUrl,
      keycloakRealm: options.subscriberJourney.keycloakRealm,
      keycloakClientId: options.subscriberJourney.keycloakClientId,
      keycloakClientSecret: options.subscriberJourney.keycloakClientSecret,
      keycloakConvexServiceActorUsername:
        options.subscriberJourney.keycloakConvexServiceActorUsername,
      keycloakConvexServiceActorPassword:
        options.subscriberJourney.keycloakConvexServiceActorPassword,
    }).pipe(
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const runtime = yield* makeSubscriberJourneyRuntime({
      ...options.subscriberJourney,
      convexAdapter,
    }).pipe(
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const postgres = yield* makePostgresAdapter({
      connectionString: options.subscriberJourney.postgresUrl,
    }).pipe(
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const meilisearch = yield* makeMeilisearchAdapter({
      url: options.meilisearchUrl,
      apiKey: options.meilisearchApiKey,
    }).pipe(
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const searchTenantIndexes = yield* makeSearchTenantIndexPostgresRepository(
      buildSearchTenantIndexPostgresQueryable(postgres.database),
    ).pipe(
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const supportCaseRepository =
      yield* makeSupportOperationsCasePostgresRepository(
        buildSupportOperationsCasePostgresQueryable(postgres.database),
      ).pipe(
        Effect.mapError(
          (cause): SearchRuntimeError => ({
            _tag: "SearchRuntimeError",
            cause,
          }),
        ),
      );
    const searchModule = yield* makeSearchModule().pipe(
      Effect.provideService(MeilisearchAdapter, meilisearch),
      Effect.provideService(
        SearchTenantIndexPostgresRepository,
        searchTenantIndexes,
      ),
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const convexFileStorage = yield* makeConvexFileStorageAdapter({
      deploymentUrl: options.convex.deploymentUrl,
      siteUrl: options.convex.siteUrl,
      ...(options.convex.adminKey !== undefined
        ? { adminKey: options.convex.adminKey }
        : {}),
      keycloakBaseUrl: options.subscriberJourney.keycloakBaseUrl,
      keycloakRealm: options.subscriberJourney.keycloakRealm,
      keycloakClientId: options.subscriberJourney.keycloakClientId,
      keycloakClientSecret: options.subscriberJourney.keycloakClientSecret,
      keycloakConvexServiceActorUsername:
        options.subscriberJourney.keycloakConvexServiceActorUsername,
      keycloakConvexServiceActorPassword:
        options.subscriberJourney.keycloakConvexServiceActorPassword,
    }).pipe(
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
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
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const workflowJobsDatabase = buildWriteDatabase(postgres.database);
    const workflowJobs =
      yield* makeWorkflowJobsPostgresRepositoryForRecordSchema(
        workflowJobsDatabase,
        buildWorkflowJobsPostgresQueryable<SearchTenantIndexEnsureWorkflowJobRecord>(
          workflowJobsDatabase,
        ),
        SearchTenantIndexEnsureWorkflowJobRecordSchema,
      ).pipe(
        Effect.mapError(
          (cause): SearchRuntimeError => ({
            _tag: "SearchRuntimeError",
            cause,
          }),
        ),
      );
    const convexWorkflowClient = yield* makeAuthenticatedConvexWorkflowClient({
      deploymentUrl: options.convex.deploymentUrl,
      siteUrl: options.convex.siteUrl,
      ...(options.convex.adminKey !== undefined
        ? { adminKey: options.convex.adminKey }
        : {}),
      keycloakBaseUrl: options.subscriberJourney.keycloakBaseUrl,
      keycloakRealm: options.subscriberJourney.keycloakRealm,
      keycloakClientId: options.subscriberJourney.keycloakClientId,
      keycloakClientSecret: options.subscriberJourney.keycloakClientSecret,
      keycloakConvexServiceActorUsername:
        options.subscriberJourney.keycloakConvexServiceActorUsername,
      keycloakConvexServiceActorPassword:
        options.subscriberJourney.keycloakConvexServiceActorPassword,
    }).pipe(
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
          cause,
        }),
      ),
    );
    const service = yield* makeSearchService({
      workflowJobs,
      convexWorkflowClient,
      ...(options.businessEventEmitter !== undefined
        ? { businessEventEmitter: options.businessEventEmitter }
        : {}),
    }).pipe(
      Effect.provideService(AuditLogModule, runtime.auditLog),
      Effect.provideService(FileStorageModule, fileStorageModule),
      Effect.provideService(IdentitySessionModule, runtime.identitySession),
      Effect.provideService(RuntimeConfigModule, runtime.runtimeConfig),
      Effect.provideService(SearchModule, searchModule),
      Effect.provideService(
        SupportOperationsCasePostgresRepository,
        supportCaseRepository,
      ),
      Effect.provideService(
        SearchTenantIndexPostgresRepository,
        searchTenantIndexes,
      ),
      Effect.provideService(OryKetoAdapter, runtime.oryKeto),
      Effect.mapError(
        (cause): SearchRuntimeError => ({
          _tag: "SearchRuntimeError",
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

const runSearchTransportWithResolvedOptions = <A, E>(
  options: SearchTransportRuntimeOptions,
  use: (runtime: SearchTransportRuntime) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeSearchTransportRuntime(options);

    return yield* use({ service: runtime.service }).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const runSearchTransportFromEnvironment = <A, E>(
  environment: unknown,
  use: (runtime: SearchTransportRuntime) => Effect.Effect<A, E>,
) =>
  Effect.all({
    subscriberJourney:
      resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment),
    search: decodeSearchTransportProcessEnvironment(environment),
  }).pipe(
    Effect.mapError(
      (cause): SearchRuntimeError => ({
        _tag: "SearchRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap(({ subscriberJourney, search }) =>
      createPlatformBusinessEventEmitterFromEnvironment({
        environment,
        serviceName: "search-service",
      }).pipe(
        Effect.mapError(
          (cause): SearchRuntimeError => ({
            _tag: "SearchRuntimeError",
            cause,
          }),
        ),
        Effect.flatMap((businessEventEmitter) =>
          runSearchTransportWithResolvedOptions(
            {
              subscriberJourney: {
                postgresUrl: subscriberJourney.postgresUrl,
                keycloakBaseUrl: subscriberJourney.keycloakBaseUrl,
                keycloakRealm: subscriberJourney.keycloakRealm,
                keycloakClientId: subscriberJourney.keycloakClientId,
                keycloakClientSecret: subscriberJourney.keycloakClientSecret,
                keycloakConvexServiceActorUsername:
                  subscriberJourney.keycloakConvexServiceActorUsername,
                keycloakConvexServiceActorPassword:
                  subscriberJourney.keycloakConvexServiceActorPassword,
                polarAccessToken: subscriberJourney.polarAccessToken,
                polarApiUrl: subscriberJourney.polarApiUrl,
                openmeterUrl: subscriberJourney.openmeterUrl,
                openmeterApiKey: subscriberJourney.openmeterApiKey,
                valkeyUrl: subscriberJourney.valkeyUrl,
                unleashUrl: subscriberJourney.unleashUrl,
                unleashApiKey: subscriberJourney.unleashApiKey,
                ketoReadUrl: subscriberJourney.ketoReadUrl,
                ketoWriteUrl: subscriberJourney.ketoWriteUrl,
              },
              convex: {
                deploymentUrl: subscriberJourney.convexUrl,
                siteUrl: subscriberJourney.convexSiteUrl,
                adminKey: subscriberJourney.convexAdminKey,
              },
              meilisearchUrl: search.MEILISEARCH_URL,
              meilisearchApiKey: search.MEILISEARCH_API_KEY,
              businessEventEmitter,
            },
            use,
          ),
        ),
      ),
    ),
  );

export const resolveSearchTransportRuntimeOptionsFromConvexEnvironment = (
  environment: unknown,
) =>
  Effect.all({
    runtimeEnvironment:
      decodeSearchTransportConvexRuntimeSystemEnvironment(environment),
    subscriberJourney:
      resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment(environment),
    search: decodeSearchTransportConvexProcessEnvironment(environment),
  }).pipe(
    Effect.map(
      ({
        runtimeEnvironment,
        subscriberJourney,
        search,
      }): SearchTransportRuntimeOptions =>
        ({
          subscriberJourney,
          convex: {
            deploymentUrl: runtimeEnvironment.CONVEX_CLOUD_URL,
            siteUrl: runtimeEnvironment.CONVEX_SITE_URL,
            ...(runtimeEnvironment.CONVEX_SELF_HOSTED_ADMIN_KEY !== undefined
              ? {
                  adminKey: runtimeEnvironment.CONVEX_SELF_HOSTED_ADMIN_KEY,
                }
              : {}),
          },
          meilisearchUrl: search.MEILISEARCH_URL_INTERNAL,
          meilisearchApiKey: search.MEILISEARCH_API_KEY,
        }) satisfies SearchTransportRuntimeOptions,
    ),
    Effect.mapError(
      (cause): SearchRuntimeError => ({
        _tag: "SearchRuntimeError",
        cause,
      }),
    ),
  );

export const runSearchTransportFromConvexEnvironment = <A, E>(
  environment: unknown,
  use: (runtime: SearchTransportRuntime) => Effect.Effect<A, E>,
) =>
  resolveSearchTransportRuntimeOptionsFromConvexEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      createOptionalPlatformBusinessEventEmitterFromEnvironment({
        environment,
        serviceName: "search-service",
      }).pipe(
        Effect.mapError(
          (cause): SearchRuntimeError => ({
            _tag: "SearchRuntimeError",
            cause,
          }),
        ),
        Effect.flatMap((businessEventEmitter) =>
          runSearchTransportWithResolvedOptions(
            {
              ...resolvedOptions,
              businessEventEmitter,
            },
            use,
          ),
        ),
      ),
    ),
  );

export const runSearchFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: SearchServiceApi) => Effect.Effect<A, E>,
) =>
  runSearchTransportFromEnvironment(environment, ({ service }) => use(service));

export const runSearchFromConvexEnvironment = <A, E>(
  environment: unknown,
  use: (service: SearchServiceApi) => Effect.Effect<A, E>,
) =>
  runSearchTransportFromConvexEnvironment(environment, ({ service }) =>
    use(service),
  );
