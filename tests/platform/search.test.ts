import { Effect } from "effect";
import { searchFields } from "@comvestec/config";
import {
  actorType,
  permissionScope,
  platformModuleId,
  platformScope,
  type RequestContext,
  runtimeResolutionSource,
  searchDocumentFamily,
  searchAuditAction,
  searchIndexLifecycleState,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  type SearchTenantIndexDeletionReceipt,
  type SearchTenantIndexRecord,
  type SearchTenantIndexSummaryView,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuthorizationModuleService,
  FileStorageModule,
  IdentitySessionModule,
  RuntimeConfigModule,
  SearchModule,
  buildSearchTenantIndexEnsureWorkflowJobId,
  type SearchTenantIndexEnsureWorkflowJobRecord,
  SearchTenantIndexPostgresRepository,
  SupportOperationsCasePostgresRepository,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  type AuditLogModuleService,
  type FileStorageModuleService,
  type IdentitySessionModuleService,
  type RuntimeConfigModuleService,
  type SearchModuleService,
  type SearchTenantIndexPostgresRepositoryService,
  type SupportOperationsCasePostgresRepositoryService,
} from "@comvestec/modules";
import {
  type AuthenticatedConvexWorkflowClient,
  makeSearchService as makeBaseSearchService,
  platformBusinessEventName,
  type PlatformBusinessEventEmitter,
} from "@comvestec/platform";

const operatorRequestContext: RequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_1",
  sessionId: "sess_support_1",
  correlationId: "corr_search_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
    organizationId: "org_1",
  },
};

const tenantRequestContext: RequestContext = {
  actorType: actorType.organizationAdmin,
  actorId: "usr_org_admin_1",
  sessionId: "sess_org_admin_1",
  correlationId: "corr_search_tenant_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
    organizationId: "org_1",
  },
};

const unexpectedSearchEffect = <A>() =>
  Effect.die(new Error("Unexpected search service dependency call."));

const appendMissingSearchSettingsAttributes = (
  attributes: readonly string[],
  requiredAttributes: readonly string[],
) => [
  ...attributes,
  ...requiredAttributes.filter((attribute) => !attributes.includes(attribute)),
];

const normalizeExpectedSearchSettings = <
  T extends {
    readonly filterableAttributes: readonly string[];
    readonly sortableAttributes: readonly string[];
  },
>(
  settings: T,
) => ({
  ...settings,
  filterableAttributes: appendMissingSearchSettingsAttributes(
    settings.filterableAttributes,
    [searchFields.documentFamily, searchFields.status, searchFields.priority],
  ),
  sortableAttributes: appendMissingSearchSettingsAttributes(
    settings.sortableAttributes,
    [searchFields.startedAt, searchFields.lastUpdatedAt],
  ),
});

const createIdentitySessionModuleDouble = (
  requestContext = operatorRequestContext,
): IdentitySessionModuleService => ({
  startAuthentication: () => unexpectedSearchEffect(),
  completeAuthentication: () => unexpectedSearchEffect(),
  invalidateSession: () => unexpectedSearchEffect(),
  resolveRequestContext: () => Effect.succeed(requestContext),
});

const createRuntimeConfigModuleDouble = (
  enabled = true,
): RuntimeConfigModuleService => ({
  resolveConfigValue: () => unexpectedSearchEffect(),
  resolveStoredConfigValue: () => unexpectedSearchEffect(),
  resolveFeatureFlag: ({ moduleId, flag }) =>
    Effect.succeed({
      moduleId,
      key: flag.key,
      effectiveValue: enabled,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    }),
  resolveStoredFeatureFlag: () => unexpectedSearchEffect(),
  buildChangeProposals: () => unexpectedSearchEffect(),
  listOverridesByModule: () => Effect.succeed([]),
  listChangeProposalsByModule: () => unexpectedSearchEffect(),
  listOverrideProposalsByModule: () => unexpectedSearchEffect(),
  upsertOverride: () => unexpectedSearchEffect(),
  submitOverrideProposal: () => unexpectedSearchEffect(),
  reviewChangeProposal: () => unexpectedSearchEffect(),
  persistChangeProposals: () => unexpectedSearchEffect(),
});

const createAuditLogModuleDouble = () => {
  const calls: Array<Parameters<AuditLogModuleService["append"]>[0]> = [];

  const service: AuditLogModuleService = {
    append: (input) => {
      calls.push(input);

      return Effect.succeed({
        eventId: `${input.moduleId}:${input.action}:${input.target}`,
        timestamp: "2026-04-27T17:00:00.000Z",
        actorId: input.requestContext.actorId ?? "anonymous",
        tenantScope: input.requestContext.tenant.scope,
        tenantScopeId: input.requestContext.tenant.scopeId,
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        correlationId: input.requestContext.correlationId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      });
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };

  return { calls, service };
};

const createFileStorageModuleDouble = (
  managedFiles: ReadonlyArray<Record<string, unknown>> = [],
): FileStorageModuleService => ({
  requestManagedFileUploadUrl: () => unexpectedSearchEffect(),
  registerManagedFile: () => unexpectedSearchEffect(),
  getManagedFileRecord: () => unexpectedSearchEffect(),
  listManagedFiles: () => Effect.succeed(managedFiles as never),
  resolveManagedFileDownload: () => unexpectedSearchEffect(),
  deleteManagedFile: () => unexpectedSearchEffect(),
});

const createSupportOperationsCaseRepositoryDouble = (
  overrides: Partial<SupportOperationsCasePostgresRepositoryService> = {},
): SupportOperationsCasePostgresRepositoryService => ({
  upsertSupportCase:
    overrides.upsertSupportCase ?? (() => unexpectedSearchEffect()),
  getSupportCase: overrides.getSupportCase ?? (() => unexpectedSearchEffect()),
  listSupportCases: overrides.listSupportCases ?? (() => Effect.succeed([])),
});

type SearchServiceTestOptions = {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs?: WorkflowJobsPostgresRepositoryServiceForRecord<SearchTenantIndexEnsureWorkflowJobRecord>;
  readonly convexWorkflowClient?: {
    readonly scheduleSearchTenantIndexEnsureWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleSearchTenantIndexEnsureWorkflowJob"]
    >;
  };
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
  readonly managedFiles?: ReadonlyArray<Record<string, unknown>>;
  readonly supportOperationsCases?: Partial<SupportOperationsCasePostgresRepositoryService>;
};

const makeSearchService = (options: SearchServiceTestOptions) =>
  makeBaseSearchService(options).pipe(
    Effect.provideService(
      FileStorageModule,
      createFileStorageModuleDouble(options.managedFiles),
    ),
    Effect.provideService(
      SupportOperationsCasePostgresRepository,
      createSupportOperationsCaseRepositoryDouble(
        options.supportOperationsCases,
      ),
    ),
  );

const createSearchModuleDouble = (
  overrides: Partial<SearchModuleService>,
): SearchModuleService => ({
  ensureTenantIndex:
    overrides.ensureTenantIndex ?? (() => unexpectedSearchEffect()),
  queryManagedFiles:
    overrides.queryManagedFiles ?? (() => unexpectedSearchEffect()),
  querySupportCases:
    overrides.querySupportCases ?? (() => unexpectedSearchEffect()),
  getTenantIndex: overrides.getTenantIndex ?? (() => unexpectedSearchEffect()),
  deleteTenantIndex:
    overrides.deleteTenantIndex ?? (() => unexpectedSearchEffect()),
});

const createSearchRepositoryDouble = (
  overrides: Partial<SearchTenantIndexPostgresRepositoryService>,
): SearchTenantIndexPostgresRepositoryService => ({
  upsertSearchTenantIndexRecord:
    overrides.upsertSearchTenantIndexRecord ?? (() => unexpectedSearchEffect()),
  getSearchTenantIndexRecord:
    overrides.getSearchTenantIndexRecord ?? (() => unexpectedSearchEffect()),
  listSearchTenantIndexRecords:
    overrides.listSearchTenantIndexRecords ?? (() => unexpectedSearchEffect()),
});

const createWorkflowJobsRepositoryDouble = (
  overrides: Partial<
    WorkflowJobsPostgresRepositoryServiceForRecord<SearchTenantIndexEnsureWorkflowJobRecord>
  >,
): WorkflowJobsPostgresRepositoryServiceForRecord<SearchTenantIndexEnsureWorkflowJobRecord> => ({
  persistWorkflowJob:
    overrides.persistWorkflowJob ?? (() => unexpectedSearchEffect()),
  getWorkflowJob: overrides.getWorkflowJob ?? (() => unexpectedSearchEffect()),
  claimScheduledWorkflowJob:
    overrides.claimScheduledWorkflowJob ?? (() => unexpectedSearchEffect()),
  restoreWorkflowJobIfUpdatedAtMatches:
    overrides.restoreWorkflowJobIfUpdatedAtMatches ??
    (() => unexpectedSearchEffect()),
  cancelWorkflowJobIfUpdatedAtMatches:
    overrides.cancelWorkflowJobIfUpdatedAtMatches ??
    (() => unexpectedSearchEffect()),
  listDueWorkflowJobs:
    overrides.listDueWorkflowJobs ?? (() => unexpectedSearchEffect()),
  listRepairGapWorkflowJobs:
    overrides.listRepairGapWorkflowJobs ?? (() => unexpectedSearchEffect()),
});

const createConvexWorkflowClientDouble = (
  overrides: Partial<{
    scheduleSearchTenantIndexEnsureWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleSearchTenantIndexEnsureWorkflowJob"]
    >;
  }>,
): {
  scheduleSearchTenantIndexEnsureWorkflowJob: NonNullable<
    AuthenticatedConvexWorkflowClient["scheduleSearchTenantIndexEnsureWorkflowJob"]
  >;
} => ({
  scheduleSearchTenantIndexEnsureWorkflowJob:
    overrides.scheduleSearchTenantIndexEnsureWorkflowJob ??
    (() => unexpectedSearchEffect()),
});

const createAuthorizationCheck = (allowed = true) =>
  vi.fn(() =>
    Effect.succeed({
      allowed,
      cacheKey: `${platformModuleId.search}:admin`,
      reason: allowed ? "allowed" : "denied",
      auditRequired: false,
    }),
  );

describe("platform search service", () => {
  it("schedules tenant index ensure workflow jobs for authorized operators", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistedJobs: SearchTenantIndexEnsureWorkflowJobRecord[] = [];
    const scheduleSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "search-workflow-dispatch-1",
        scheduledFunctionIds: [
          "search-workflow-dispatch-1",
          "search-workflow-dispatch-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleSearchTenantIndexEnsureWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.requestTenantIndexEnsureWorkflowJob({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status", "moduleId"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title", "content"],
            rankingRules: ["words", "typo", "sort"],
          },
        }),
      ),
    ).resolves.toMatchObject({
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });

    expect(scheduleSearchTenantIndexEnsureWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: buildSearchTenantIndexEnsureWorkflowJobId({
          trigger: workflowJobTrigger.operatorRequested,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          key: operatorRequestContext.correlationId,
        }),
        scheduledAt: expect.any(String),
      }),
    );
    expect(persistedJobs).toHaveLength(2);
    expect(persistedJobs[0]?.payload.settings).toEqual(
      normalizeExpectedSearchSettings({
        filterableAttributes: ["status", "moduleId"],
        sortableAttributes: ["updatedAt"],
        searchableAttributes: ["title", "content"],
        rankingRules: ["words", "typo", "sort"],
      }),
    );
    expect(persistedJobs[1]?.payload.dispatch).toMatchObject({
      scheduledFunctionId: "search-workflow-dispatch-1",
      scheduledFunctionIds: [
        "search-workflow-dispatch-1",
        "search-workflow-dispatch-2",
      ],
    });
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexEnsureRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("schedules tenant index reindex workflow jobs from stored settings for authorized operators", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistedJobs: SearchTenantIndexEnsureWorkflowJobRecord[] = [];
    const scheduleSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "search-workflow-dispatch-1",
        scheduledFunctionIds: [
          "search-workflow-dispatch-1",
          "search-workflow-dispatch-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const storedSettings = {
      filterableAttributes: ["status", "moduleId"],
      sortableAttributes: ["updatedAt"],
      searchableAttributes: ["title", "content"],
      rankingRules: ["words", "typo", "sort"],
      synonyms: {
        invoice: ["bill", "statement"],
      },
    } as const;
    const getSearchTenantIndexRecord = vi.fn(() =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        documentCount: 12,
        lifecycleState: searchIndexLifecycleState.ready,
        settings: storedSettings,
        createdAt: "2026-05-07T12:00:00.000Z",
        updatedAt: "2026-05-07T12:00:00.000Z",
      }),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleSearchTenantIndexEnsureWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({
            getSearchTenantIndexRecord,
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.requestTenantIndexReindexWorkflowJob({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });

    expect(scheduleSearchTenantIndexEnsureWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: buildSearchTenantIndexEnsureWorkflowJobId({
          trigger: workflowJobTrigger.operatorRequested,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          key: operatorRequestContext.correlationId,
        }),
        scheduledAt: expect.any(String),
      }),
    );
    expect(getSearchTenantIndexRecord).toHaveBeenCalledWith({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      scope: platformScope.organization,
      scopeId: "org_1",
    });
    expect(persistedJobs).toHaveLength(2);
    expect(persistedJobs[0]?.payload.settings).toEqual(
      normalizeExpectedSearchSettings(storedSettings),
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexReindexRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
    expect(authorizationCheck).toHaveBeenCalledTimes(1);
  });

  it("rejects tenant index reindex requests when the durable record is missing", async () => {
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const scheduleSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.die(
        new Error("Reindex should not dispatch without a durable record."),
      ),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
        workflowJobs: createWorkflowJobsRepositoryDouble({}),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleSearchTenantIndexEnsureWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({
            getSearchTenantIndexRecord: () => Effect.succeed(undefined),
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.either(
          search.requestTenantIndexReindexWorkflowJob({
            sessionId: "sess_support_1",
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        _tag: "Left",
        left: {
          _tag: "SearchTenantIndexNotFoundError",
          scope: platformScope.organization,
          scopeId: "org_1",
        },
      }),
    );

    expect(scheduleSearchTenantIndexEnsureWorkflowJob).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexReindexRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("rejects tenant index reindex requests when the durable record is deleted", async () => {
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const scheduleSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.die(
        new Error("Reindex should not dispatch for deleted durable records."),
      ),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
        workflowJobs: createWorkflowJobsRepositoryDouble({}),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleSearchTenantIndexEnsureWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({
            getSearchTenantIndexRecord: () =>
              Effect.succeed({
                indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                scope: platformScope.organization,
                scopeId: "org_1",
                settings: {
                  filterableAttributes: ["status", "moduleId"],
                  sortableAttributes: ["updatedAt"],
                  searchableAttributes: ["title", "content"],
                  rankingRules: ["words", "typo", "sort"],
                },
                documentCount: 12,
                lifecycleState: searchIndexLifecycleState.deleted,
                createdAt: "2026-05-07T12:00:00.000Z",
                updatedAt: "2026-05-07T12:00:00.000Z",
              }),
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.either(
          search.requestTenantIndexReindexWorkflowJob({
            sessionId: "sess_support_1",
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        _tag: "Left",
        left: {
          _tag: "SearchTenantIndexNotFoundError",
          scope: platformScope.organization,
          scopeId: "org_1",
        },
      }),
    );

    expect(scheduleSearchTenantIndexEnsureWorkflowJob).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexReindexRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("rejects tenant index reindex requests when durable settings are unavailable", async () => {
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const scheduleSearchTenantIndexEnsureWorkflowJob = vi.fn(() =>
      Effect.die(
        new Error("Reindex should not dispatch without stored settings."),
      ),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
        workflowJobs: createWorkflowJobsRepositoryDouble({}),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleSearchTenantIndexEnsureWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({
            getSearchTenantIndexRecord: () =>
              Effect.succeed({
                indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                scope: platformScope.organization,
                scopeId: "org_1",
                documentCount: 12,
                lifecycleState: searchIndexLifecycleState.ready,
                createdAt: "2026-05-07T12:00:00.000Z",
                updatedAt: "2026-05-07T12:00:00.000Z",
              }),
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.either(
          search.requestTenantIndexReindexWorkflowJob({
            sessionId: "sess_support_1",
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        _tag: "Left",
        left: {
          _tag: "SearchTenantIndexSettingsUnavailableError",
          scope: platformScope.organization,
          scopeId: "org_1",
        },
      }),
    );

    expect(scheduleSearchTenantIndexEnsureWorkflowJob).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexReindexRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("runs tenant index ensure workflow jobs through the search module and completes them", async () => {
    const now = "2026-05-02T11:30:00.000Z";
    const jobId = buildSearchTenantIndexEnsureWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      key: "corr_search_1",
    });
    const scheduledRecord: SearchTenantIndexEnsureWorkflowJobRecord = {
      jobId,
      runtime: "convex",
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 0,
      scheduledAt: now,
      payload: {
        sourceModuleId: platformModuleId.search,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: "usr_search_operator_1",
        correlationId: "corr_search_1",
        settings: {
          filterableAttributes: ["status", "moduleId"],
          sortableAttributes: ["updatedAt"],
          searchableAttributes: ["title", "content"],
          rankingRules: ["words", "typo", "sort"],
        },
      },
      createdAt: now,
      updatedAt: now,
    };
    const runningRecord: SearchTenantIndexEnsureWorkflowJobRecord = {
      ...scheduledRecord,
      status: workflowJobStatus.running,
      attempts: 1,
      updatedAt: "2026-05-02T11:31:00.000Z",
    };
    const ensureTenantIndex = vi.fn(() =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        documentCount: 12,
        lifecycleState: searchIndexLifecycleState.ready,
        lastSyncedAt: "2026-05-02T11:32:00.000Z",
      } satisfies SearchTenantIndexSummaryView),
    );
    const persistedJobs: SearchTenantIndexEnsureWorkflowJobRecord[] = [];
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
        managedFiles: [
          {
            fileId: "file_1",
            fileName: "invoice.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        supportOperationsCases: {
          listSupportCases: () =>
            Effect.succeed([
              {
                caseId: "case_1",
                supportAgent: "usr_support_1",
                tenantScope: platformScope.organization,
                tenantScopeId: "org_1",
                summary: "Invoice search mismatch",
                status: supportOperationsCaseStatus.open,
                priority: supportOperationsCasePriority.high,
                startedAt: "2026-05-02T11:00:00.000Z",
                lastUpdatedAt: "2026-05-02T11:20:00.000Z",
              },
            ]),
        },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(scheduledRecord),
          claimScheduledWorkflowJob: () => Effect.succeed(runningRecord),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.runSearchTenantIndexEnsureWorkflowJob({
          jobId,
        }),
      ),
    ).resolves.toMatchObject({
      jobId,
      kind: workflowJobKind.searchIndexEnsure,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });

    expect(ensureTenantIndex).toHaveBeenCalledWith({
      scope: platformScope.organization,
      scopeId: "org_1",
      documents: [
        expect.objectContaining({
          documentFamily: searchDocumentFamily.managedFileSummary,
          fileId: "file_1",
        }),
        expect.objectContaining({
          documentFamily: searchDocumentFamily.supportCaseSummary,
          caseId: "case_1",
        }),
      ],
      settings: normalizeExpectedSearchSettings({
        filterableAttributes: ["status", "moduleId"],
        sortableAttributes: ["updatedAt"],
        searchableAttributes: ["title", "content"],
        rankingRules: ["words", "typo", "sort"],
      }),
    });
    expect(persistedJobs.at(-1)).toMatchObject({
      jobId,
      status: workflowJobStatus.completed,
    });
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexEnsured,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("blocks queued tenant index ensure jobs when search is later disabled", async () => {
    const now = "2026-05-02T11:30:00.000Z";
    const jobId = buildSearchTenantIndexEnsureWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      key: "corr_search_disabled_1",
    });
    const scheduledRecord: SearchTenantIndexEnsureWorkflowJobRecord = {
      jobId,
      runtime: "convex",
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 0,
      scheduledAt: now,
      payload: {
        sourceModuleId: platformModuleId.search,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: "usr_search_operator_1",
        correlationId: "corr_search_disabled_1",
        settings: {
          filterableAttributes: ["status", "moduleId"],
          sortableAttributes: ["updatedAt"],
          searchableAttributes: ["title", "content"],
          rankingRules: ["words", "typo", "sort"],
        },
      },
      createdAt: now,
      updatedAt: now,
    };
    const runningRecord: SearchTenantIndexEnsureWorkflowJobRecord = {
      ...scheduledRecord,
      status: workflowJobStatus.running,
      attempts: 1,
      updatedAt: "2026-05-02T11:31:00.000Z",
    };
    const ensureTenantIndex = vi.fn(() => unexpectedSearchEffect());
    const persistedJobs: SearchTenantIndexEnsureWorkflowJobRecord[] = [];
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(scheduledRecord),
          claimScheduledWorkflowJob: () => Effect.succeed(runningRecord),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.runSearchTenantIndexEnsureWorkflowJob({
          jobId,
        }),
      ),
    ).resolves.toMatchObject({
      jobId,
      status: workflowJobStatus.blocked,
    });

    expect(ensureTenantIndex).not.toHaveBeenCalled();
    expect(persistedJobs.at(-1)).toMatchObject({
      jobId,
      status: workflowJobStatus.blocked,
      lastError: "SearchModuleDisabledError",
    });
  });

  it("blocks queued tenant index ensure jobs when stored break-glass access has expired", async () => {
    const now = "2026-05-02T11:30:00.000Z";
    const jobId = buildSearchTenantIndexEnsureWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_2",
      key: "corr_search_break_glass_1",
    });
    const scheduledRecord: SearchTenantIndexEnsureWorkflowJobRecord = {
      jobId,
      runtime: "convex",
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_2",
      attempts: 0,
      scheduledAt: now,
      payload: {
        sourceModuleId: platformModuleId.search,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_2",
        requestContext: {
          ...operatorRequestContext,
          breakGlass: {
            approvedBy: "usr_platform_1",
            reason: "Investigate tenant search health.",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        actorId: "usr_search_operator_1",
        correlationId: "corr_search_break_glass_1",
        settings: {
          filterableAttributes: ["status", "moduleId"],
          sortableAttributes: ["updatedAt"],
          searchableAttributes: ["title", "content"],
          rankingRules: ["words", "typo", "sort"],
        },
      },
      createdAt: now,
      updatedAt: now,
    };
    const runningRecord: SearchTenantIndexEnsureWorkflowJobRecord = {
      ...scheduledRecord,
      status: workflowJobStatus.running,
      attempts: 1,
      updatedAt: "2026-05-02T11:31:00.000Z",
    };
    const ensureTenantIndex = vi.fn(() => unexpectedSearchEffect());
    const persistedJobs: SearchTenantIndexEnsureWorkflowJobRecord[] = [];
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(scheduledRecord),
          claimScheduledWorkflowJob: () => Effect.succeed(runningRecord),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.runSearchTenantIndexEnsureWorkflowJob({
          jobId,
        }),
      ),
    ).resolves.toMatchObject({
      jobId,
      status: workflowJobStatus.blocked,
    });

    expect(ensureTenantIndex).not.toHaveBeenCalled();
    expect(persistedJobs.at(-1)).toMatchObject({
      jobId,
      status: workflowJobStatus.blocked,
      lastError: "SearchAccessDeniedError",
    });
  });

  it("ensures tenant indexes for authorized operators and appends audit evidence", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const ensureTenantIndex = vi.fn(() =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        documentCount: 12,
        lifecycleState: searchIndexLifecycleState.ready,
        lastSyncedAt: "2026-04-27T17:00:00.000Z",
      } satisfies SearchTenantIndexSummaryView),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
        managedFiles: [
          {
            fileId: "file_1",
            fileName: "invoice.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        supportOperationsCases: {
          listSupportCases: () =>
            Effect.succeed([
              {
                caseId: "case_1",
                supportAgent: "usr_support_1",
                tenantScope: platformScope.organization,
                tenantScopeId: "org_1",
                summary: "Invoice search mismatch",
                status: supportOperationsCaseStatus.open,
                priority: supportOperationsCasePriority.high,
                startedAt: "2026-04-27T16:00:00.000Z",
                lastUpdatedAt: "2026-04-27T16:30:00.000Z",
              },
            ]),
        },
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.ensureTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status", "moduleId"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title", "content"],
            rankingRules: ["words", "typo", "sort"],
          },
        }),
      ),
    ).resolves.toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      lifecycleState: searchIndexLifecycleState.ready,
    });

    expect(authorizationCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        object: platformModuleId.search,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      }),
    );
    expect(ensureTenantIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: platformScope.organization,
        scopeId: "org_1",
        documents: [
          expect.objectContaining({
            documentFamily: searchDocumentFamily.managedFileSummary,
            fileId: "file_1",
          }),
          expect.objectContaining({
            documentFamily: searchDocumentFamily.supportCaseSummary,
            caseId: "case_1",
          }),
        ],
      }),
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexEnsureRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexEnsured,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("queries managed-file previews for authorized operators and appends audit evidence", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const emitBusinessEvent = vi.fn(() => Effect.void);
    const queryManagedFiles = vi.fn((input) =>
      Effect.succeed({
        query: input.query,
        hits: [
          {
            fileId: "file_1",
            fileName: "invoice.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        estimatedTotalHits: 1,
      }),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
        businessEventEmitter: emitBusinessEvent,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            queryManagedFiles,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.queryManagedFiles({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          query: "invoice",
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          fileId: "file_1",
          fileName: "invoice.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
        },
      ],
      estimatedTotalHits: 1,
    });

    expect(queryManagedFiles).toHaveBeenCalledWith({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      scope: platformScope.organization,
      scopeId: "org_1",
      query: "invoice",
    });
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.queryPreviewed,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
    expect(emitBusinessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: platformBusinessEventName.searchManagedFilesQueryPreviewed,
        moduleId: platformModuleId.search,
        permissionScope: permissionScope.searchAdmin,
        properties: expect.objectContaining({
          documentFamily: searchDocumentFamily.managedFileSummary,
          queryLength: "invoice".length,
          resultCount: 1,
        }),
      }),
    );
  });

  it("queries support-case previews for authorized operators and appends audit evidence", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const emitBusinessEvent = vi.fn(() => Effect.void);
    const querySupportCases = vi.fn((input) =>
      Effect.succeed({
        query: input.query,
        hits: [
          {
            caseId: "case_1",
            supportAgent: "usr_support_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            summary: "Invoice search mismatch",
            status: supportOperationsCaseStatus.open,
            priority: supportOperationsCasePriority.high,
            startedAt: "2026-04-27T16:00:00.000Z",
            lastUpdatedAt: "2026-04-27T16:30:00.000Z",
          },
        ],
        estimatedTotalHits: 1,
      }),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
        businessEventEmitter: emitBusinessEvent,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            querySupportCases,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.querySupportCases({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          query: "invoice",
          status: [supportOperationsCaseStatus.open],
          priority: [supportOperationsCasePriority.high],
          sort: {
            field: "lastUpdatedAt",
            direction: "desc",
          },
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          caseId: "case_1",
          supportAgent: "usr_support_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          summary: "Invoice search mismatch",
          status: supportOperationsCaseStatus.open,
          priority: supportOperationsCasePriority.high,
          startedAt: "2026-04-27T16:00:00.000Z",
          lastUpdatedAt: "2026-04-27T16:30:00.000Z",
        },
      ],
      estimatedTotalHits: 1,
    });

    expect(querySupportCases).toHaveBeenCalledWith({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      scope: platformScope.organization,
      scopeId: "org_1",
      query: "invoice",
      status: [supportOperationsCaseStatus.open],
      priority: [supportOperationsCasePriority.high],
      sort: {
        field: "lastUpdatedAt",
        direction: "desc",
      },
    });
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.queryPreviewed,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
    expect(emitBusinessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: platformBusinessEventName.searchSupportCasesQueryPreviewed,
        moduleId: platformModuleId.search,
        permissionScope: permissionScope.searchAdmin,
        properties: expect.objectContaining({
          documentFamily: searchDocumentFamily.supportCaseSummary,
          queryLength: "invoice".length,
          resultCount: 1,
          statusFilterCount: 1,
          priorityFilterCount: 1,
        }),
      }),
    );
  });

  it("queries support-case previews for authorized operators even when tenant search is disabled", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const querySupportCases = vi.fn((input) =>
      Effect.succeed({
        query: input.query,
        hits: [
          {
            caseId: "case_1",
            supportAgent: "usr_support_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            summary: "Invoice search mismatch",
            status: supportOperationsCaseStatus.open,
            priority: supportOperationsCasePriority.high,
            startedAt: "2026-04-27T16:00:00.000Z",
            lastUpdatedAt: "2026-04-27T16:30:00.000Z",
          },
        ],
        estimatedTotalHits: 1,
      }),
    );
    const search = await Effect.runPromise(
      makeSearchService({ authorization: { check: authorizationCheck } }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            querySupportCases,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.querySupportCases({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          query: "invoice",
          status: [supportOperationsCaseStatus.open],
          priority: [supportOperationsCasePriority.high],
          sort: {
            field: "lastUpdatedAt",
            direction: "desc",
          },
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          caseId: "case_1",
          supportAgent: "usr_support_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          summary: "Invoice search mismatch",
          status: supportOperationsCaseStatus.open,
          priority: supportOperationsCasePriority.high,
          startedAt: "2026-04-27T16:00:00.000Z",
          lastUpdatedAt: "2026-04-27T16:30:00.000Z",
        },
      ],
      estimatedTotalHits: 1,
    });

    expect(querySupportCases).toHaveBeenCalledWith({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      scope: platformScope.organization,
      scopeId: "org_1",
      query: "invoice",
      status: [supportOperationsCaseStatus.open],
      priority: [supportOperationsCasePriority.high],
      sort: {
        field: "lastUpdatedAt",
        direction: "desc",
      },
    });
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.queryPreviewed,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("queries current-tenant managed-file results without operator authorization and appends tenant audit evidence", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const emitBusinessEvent = vi.fn(() => Effect.void);
    const queryManagedFiles = vi.fn((input) =>
      Effect.succeed({
        query: input.query,
        hits: [
          {
            fileId: "file_1",
            fileName: "invoice.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        estimatedTotalHits: 1,
      }),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
        businessEventEmitter: emitBusinessEvent,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(tenantRequestContext),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            queryManagedFiles,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.queryCurrentTenantManagedFiles({
          sessionId: "sess_org_admin_1",
          query: "invoice",
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          fileId: "file_1",
          fileName: "invoice.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
        },
      ],
      estimatedTotalHits: 1,
    });

    expect(queryManagedFiles).toHaveBeenCalledWith({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      scope: platformScope.organization,
      scopeId: "org_1",
      query: "invoice",
    });
    expect(authorizationCheck).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.queryExecuted,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
    expect(emitBusinessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName:
          platformBusinessEventName.searchCurrentTenantManagedFilesQueryExecuted,
        moduleId: platformModuleId.search,
        properties: expect.objectContaining({
          documentFamily: searchDocumentFamily.managedFileSummary,
          queryLength: "invoice".length,
          resultCount: 1,
        }),
      }),
    );
  });

  it("rejects current-tenant managed-file queries when search is disabled for the tenant scope", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const queryManagedFiles = vi.fn(() =>
      Effect.die(
        new Error("Tenant query should not run when search is disabled."),
      ),
    );
    const search = await Effect.runPromise(
      makeSearchService({ authorization: { check: authorizationCheck } }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(tenantRequestContext),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            queryManagedFiles,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.either(
          search.queryCurrentTenantManagedFiles({
            sessionId: "sess_org_admin_1",
            query: "invoice",
          }),
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        _tag: "Left",
        left: {
          _tag: "SearchModuleDisabledError",
          scope: platformScope.organization,
          scopeId: "org_1",
        },
      }),
    );

    expect(queryManagedFiles).not.toHaveBeenCalled();
    expect(authorizationCheck).not.toHaveBeenCalled();
  });

  it("does not ensure tenant indexes when the request audit append fails", async () => {
    const ensureTenantIndex = vi.fn(() =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        documentCount: 12,
        lifecycleState: searchIndexLifecycleState.ready,
        lastSyncedAt: "2026-04-27T17:00:00.000Z",
      } satisfies SearchTenantIndexSummaryView),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(AuditLogModule, {
          ...createAuditLogModuleDouble().service,
          append: () =>
            Effect.fail({
              _tag: "AuditLogPostgresRepositoryPersistenceError",
              operation: "insertAuditEvent",
              cause: new Error("Audit log unavailable."),
            } as const),
        }),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.ensureTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
    expect(ensureTenantIndex).not.toHaveBeenCalled();
  });

  it("returns an audit persistence error after ensure succeeds when the success audit append fails", async () => {
    const ensureTenantIndex = vi.fn(() =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        documentCount: 12,
        lifecycleState: searchIndexLifecycleState.ready,
        lastSyncedAt: "2026-04-27T17:00:00.000Z",
      } satisfies SearchTenantIndexSummaryView),
    );
    let appendCallCount = 0;
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(AuditLogModule, {
          ...createAuditLogModuleDouble().service,
          append: (input) => {
            appendCallCount += 1;

            return appendCallCount === 2
              ? Effect.fail({
                  _tag: "AuditLogPostgresRepositoryPersistenceError",
                  operation: "insertAuditEvent",
                  cause: new Error("Audit log unavailable."),
                } as const)
              : Effect.succeed({
                  eventId: `${input.moduleId}:${input.action}:${input.target}`,
                  timestamp: "2026-04-27T17:00:00.000Z",
                  actorId: input.requestContext.actorId ?? "anonymous",
                  tenantScope: input.requestContext.tenant.scope,
                  tenantScopeId: input.requestContext.tenant.scopeId,
                  moduleId: input.moduleId,
                  action: input.action,
                  target: input.target,
                  correlationId: input.requestContext.correlationId,
                  ...(input.reason !== undefined
                    ? { reason: input.reason }
                    : {}),
                });
          },
        }),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.ensureTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
    expect(ensureTenantIndex).toHaveBeenCalledTimes(1);
  });

  it("rejects search index ensure when search is disabled for the target scope", async () => {
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex: () => unexpectedSearchEffect(),
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.ensureTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SearchModuleDisabledError",
        scope: platformScope.organization,
        scopeId: "org_1",
      },
    });
  });

  it("rejects platform-scoped search lifecycle targets at the service boundary", async () => {
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.ensureTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        } as never),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ParseError",
      },
    });
  });

  it("lists durable tenant index records even when search is disabled for the target scope", async () => {
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({
            listSearchTenantIndexRecords: () =>
              Effect.succeed([
                {
                  indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                  scope: platformScope.organization,
                  scopeId: "org_1",
                  documentCount: 0,
                  lifecycleState: searchIndexLifecycleState.deleted,
                  deletedAt: "2026-04-27T17:30:00.000Z",
                  createdAt: "2026-04-27T17:00:00.000Z",
                  updatedAt: "2026-04-27T17:30:00.000Z",
                } satisfies SearchTenantIndexRecord,
              ]),
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.listTenantIndexRecords({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        lifecycleState: searchIndexLifecycleState.deleted,
        deletedAt: "2026-04-27T17:30:00.000Z",
      }),
    ]);
  });

  it("gets a durable tenant index record even when search is disabled for the target scope", async () => {
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({
            getSearchTenantIndexRecord: () =>
              Effect.succeed({
                indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                scope: platformScope.organization,
                scopeId: "org_1",
                documentCount: 2,
                lifecycleState: searchIndexLifecycleState.ready,
                createdAt: "2026-04-27T17:00:00.000Z",
                updatedAt: "2026-04-27T17:15:00.000Z",
              } satisfies SearchTenantIndexRecord),
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.getTenantIndexRecord({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );
  });

  it("rejects search lifecycle requests when the resolved session has no actor id", async () => {
    const { actorId: _actorId, ...requestContextWithoutActorId } =
      operatorRequestContext;
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(requestContextWithoutActorId),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.listTenantIndexRecords({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SearchUnauthenticatedActorError",
      },
    });
  });

  it("rejects search lifecycle requests for non-operator actors", async () => {
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble({
            ...operatorRequestContext,
            actorType: actorType.individualUser,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.listTenantIndexRecords({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SearchAccessDeniedError",
        actorType: actorType.individualUser,
      },
    });
  });

  it("deletes tenant indexes even when search is disabled for the target scope and appends audit evidence", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const search = await Effect.runPromise(
      makeSearchService({ authorization: { check: authorizationCheck } }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            deleteTenantIndex: () =>
              Effect.succeed({
                indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                scope: platformScope.organization,
                scopeId: "org_1",
                deleted: true,
                deletedAt: "2026-04-27T18:00:00.000Z",
              } satisfies SearchTenantIndexDeletionReceipt),
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.deleteTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      deleted: true,
    });

    expect(authorizationCheck).toHaveBeenCalledTimes(1);
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexDeleteRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
      expect.objectContaining({
        moduleId: platformModuleId.search,
        action: searchAuditAction.indexDeleted,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    ]);
  });

  it("does not delete tenant indexes when the request audit append fails", async () => {
    const deleteTenantIndex = vi.fn(() =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        deleted: true,
        deletedAt: "2026-04-27T18:00:00.000Z",
      } satisfies SearchTenantIndexDeletionReceipt),
    );
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(AuditLogModule, {
          ...createAuditLogModuleDouble().service,
          append: () =>
            Effect.fail({
              _tag: "AuditLogPostgresRepositoryPersistenceError",
              operation: "insertAuditEvent",
              cause: new Error("Audit log unavailable."),
            } as const),
        }),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            deleteTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.deleteTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
    expect(deleteTenantIndex).not.toHaveBeenCalled();
  });

  it("returns an audit persistence error after delete succeeds when the success audit append fails", async () => {
    const deleteTenantIndex = vi.fn(() =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scope: platformScope.organization,
        scopeId: "org_1",
        deleted: true,
        deletedAt: "2026-04-27T18:00:00.000Z",
      } satisfies SearchTenantIndexDeletionReceipt),
    );
    let appendCallCount = 0;
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(AuditLogModule, {
          ...createAuditLogModuleDouble().service,
          append: (input) => {
            appendCallCount += 1;

            return appendCallCount === 2
              ? Effect.fail({
                  _tag: "AuditLogPostgresRepositoryPersistenceError",
                  operation: "insertAuditEvent",
                  cause: new Error("Audit log unavailable."),
                } as const)
              : Effect.succeed({
                  eventId: `${input.moduleId}:${input.action}:${input.target}`,
                  timestamp: "2026-04-27T18:00:00.000Z",
                  actorId: input.requestContext.actorId ?? "anonymous",
                  tenantScope: input.requestContext.tenant.scope,
                  tenantScopeId: input.requestContext.tenant.scopeId,
                  moduleId: input.moduleId,
                  action: input.action,
                  target: input.target,
                  correlationId: input.requestContext.correlationId,
                  ...(input.reason !== undefined
                    ? { reason: input.reason }
                    : {}),
                });
          },
        }),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            deleteTenantIndex,
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.deleteTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
    expect(deleteTenantIndex).toHaveBeenCalledTimes(1);
  });

  it("denies cross-tenant search lifecycle access without break-glass access", async () => {
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble({
            ...operatorRequestContext,
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_2",
              organizationId: "org_2",
            },
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.listTenantIndexRecords({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SearchAccessDeniedError",
        actorType: actorType.supportOperator,
      },
    });
  });

  it("allows cross-tenant search inspection with valid break-glass access", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble({
            ...operatorRequestContext,
            reason: "Search operator support escalation",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_2",
              organizationId: "org_2",
            },
            breakGlass: {
              reason: "Search operator support escalation",
              approvedBy: "usr_platform_1",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({
            listSearchTenantIndexRecords: () =>
              Effect.succeed([
                {
                  indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                  scope: platformScope.organization,
                  scopeId: "org_1",
                  documentCount: 4,
                  lifecycleState: searchIndexLifecycleState.ready,
                  createdAt: "2026-04-27T17:00:00.000Z",
                  updatedAt: "2026-04-27T17:30:00.000Z",
                } satisfies SearchTenantIndexRecord,
              ]),
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.listTenantIndexRecords({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    ]);

    expect(authorizationCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scopeId: "org_2",
          }),
        }),
      }),
    );
  });

  it("keeps ensure audit and authorization on the real session tenant during cross-tenant break-glass mutations", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble({
            ...operatorRequestContext,
            reason: "Search operator support escalation",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_2",
              organizationId: "org_2",
            },
            breakGlass: {
              reason: "Search operator support escalation",
              approvedBy: "usr_platform_1",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            ensureTenantIndex: () =>
              Effect.succeed({
                indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                scope: platformScope.organization,
                scopeId: "org_1",
                documentCount: 3,
                lifecycleState: searchIndexLifecycleState.ready,
                lastSyncedAt: "2026-04-27T18:30:00.000Z",
              } satisfies SearchTenantIndexSummaryView),
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.ensureTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    ).resolves.toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      lifecycleState: searchIndexLifecycleState.ready,
    });

    expect(authorizationCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scopeId: "org_2",
          }),
        }),
      }),
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        action: searchAuditAction.indexEnsureRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scopeId: "org_2",
          }),
        }),
      }),
      expect.objectContaining({
        action: searchAuditAction.indexEnsured,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scopeId: "org_2",
          }),
        }),
      }),
    ]);
  });

  it("keeps delete audit and authorization on the real session tenant during cross-tenant break-glass mutations", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: authorizationCheck },
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble({
            ...operatorRequestContext,
            reason: "Search operator support escalation",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_2",
              organizationId: "org_2",
            },
            breakGlass: {
              reason: "Search operator support escalation",
              approvedBy: "usr_platform_1",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(false),
        ),
        Effect.provideService(
          SearchModule,
          createSearchModuleDouble({
            deleteTenantIndex: () =>
              Effect.succeed({
                indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
                scope: platformScope.organization,
                scopeId: "org_1",
                deleted: true,
                deletedAt: "2026-04-27T19:00:00.000Z",
              } satisfies SearchTenantIndexDeletionReceipt),
          }),
        ),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        search.deleteTenantIndex({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      deleted: true,
    });

    expect(authorizationCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scopeId: "org_2",
          }),
        }),
      }),
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        action: searchAuditAction.indexDeleteRequested,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scopeId: "org_2",
          }),
        }),
      }),
      expect.objectContaining({
        action: searchAuditAction.indexDeleted,
        target: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scopeId: "org_2",
          }),
        }),
      }),
    ]);
  });

  it("denies cross-tenant search lifecycle access when break-glass is expired", async () => {
    const search = await Effect.runPromise(
      makeSearchService({
        authorization: { check: createAuthorizationCheck() },
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble({
            ...operatorRequestContext,
            reason: "Expired search operator escalation",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_2",
              organizationId: "org_2",
            },
            breakGlass: {
              reason: "Expired search operator escalation",
              approvedBy: "usr_platform_1",
              expiresAt: new Date(Date.now() - 60_000).toISOString(),
            },
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(SearchModule, createSearchModuleDouble({})),
        Effect.provideService(
          SearchTenantIndexPostgresRepository,
          createSearchRepositoryDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.listTenantIndexRecords({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SearchAccessDeniedError",
        actorType: actorType.supportOperator,
      },
    });
  });
});
