import { Effect } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
  type RequestContext,
  runtimeResolutionSource,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  searchIndexLifecycleState,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleService,
  FileStorageModule,
  type FileStorageModuleService,
  IdentitySessionModule,
  type IdentitySessionModuleService,
  RuntimeConfigModule,
  type RuntimeConfigModuleService,
  SearchModule,
  type SearchModuleService,
  SearchTenantIndexPostgresRepository,
  type SearchTenantIndexPostgresRepositoryService,
  SupportOperationsCasePostgresRepository,
  type SupportOperationsCasePostgresRepositoryService,
} from "@comvestec/modules";
import {
  makeSearchService as makeBaseSearchService,
  subscriberJourneySessionHeaderName,
} from "@comvestec/platform";
import {
  createSearchHttpHandler,
  searchApiPath,
  searchTenantApiPath,
} from "../../packages/platform/src/services/domains/search-http";
import type { SearchServiceApi } from "../../packages/platform/src/services/domains/search";

const unexpectedSearchHttpEffect = <A>() =>
  Effect.die(new Error("Unexpected search HTTP service call."));

const operatorRequestContext: RequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_1",
  sessionId: "sess_support_1",
  correlationId: "corr_search_http_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
    organizationId: "org_1",
  },
};

const createIdentitySessionModuleDouble = (): IdentitySessionModuleService => ({
  startAuthentication: () => unexpectedSearchHttpEffect(),
  completeAuthentication: () => unexpectedSearchHttpEffect(),
  completePlatformOperatorAuthentication: () => unexpectedSearchHttpEffect(),
  invalidateSession: () => unexpectedSearchHttpEffect(),
  resolveRequestContext: () => Effect.succeed(operatorRequestContext),
});

const createRuntimeConfigModuleDouble = (
  enabled = true,
): RuntimeConfigModuleService => ({
  resolveConfigValue: () => unexpectedSearchHttpEffect(),
  resolveStoredConfigValue: () => unexpectedSearchHttpEffect(),
  resolveFeatureFlag: ({ moduleId, flag }) =>
    Effect.succeed({
      moduleId,
      key: flag.key,
      effectiveValue: enabled,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    }),
  resolveStoredFeatureFlag: () => unexpectedSearchHttpEffect(),
  buildChangeProposals: () => unexpectedSearchHttpEffect(),
  listOverridesByModule: () => Effect.succeed([]),
  listChangeProposalsByModule: () => unexpectedSearchHttpEffect(),
  listOverrideProposalsByModule: () => unexpectedSearchHttpEffect(),
  upsertOverride: () => unexpectedSearchHttpEffect(),
  submitOverrideProposal: () => unexpectedSearchHttpEffect(),
  reviewChangeProposal: () => unexpectedSearchHttpEffect(),
  persistChangeProposals: () => unexpectedSearchHttpEffect(),
});

const createAuditLogModuleDouble = (): AuditLogModuleService => ({
  append: (input) =>
    Effect.succeed({
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
    }),
  queryByModule: () => Effect.succeed([]),
  queryByTarget: () => Effect.succeed([]),
  queryByActor: () => Effect.succeed([]),
  queryByTenant: () => Effect.succeed([]),
  requirements: Effect.succeed([]),
});

const createFileStorageModuleDouble = (): FileStorageModuleService => ({
  requestManagedFileUploadUrl: () => unexpectedSearchHttpEffect(),
  registerManagedFile: () => unexpectedSearchHttpEffect(),
  getManagedFileRecord: () => unexpectedSearchHttpEffect(),
  listManagedFiles: () => Effect.succeed([]),
  resolveManagedFileDownload: () => unexpectedSearchHttpEffect(),
  deleteManagedFile: () => unexpectedSearchHttpEffect(),
});

const createSupportOperationsCaseRepositoryDouble =
  (): SupportOperationsCasePostgresRepositoryService => ({
    upsertSupportCase: () => unexpectedSearchHttpEffect(),
    getSupportCase: () => unexpectedSearchHttpEffect(),
    listSupportCases: () => Effect.succeed([]),
  });

const createSearchModuleDouble = (
  overrides: Partial<SearchModuleService>,
): SearchModuleService => ({
  ensureTenantIndex:
    overrides.ensureTenantIndex ?? (() => unexpectedSearchHttpEffect()),
  queryManagedFiles:
    overrides.queryManagedFiles ?? (() => unexpectedSearchHttpEffect()),
  querySupportCases:
    overrides.querySupportCases ?? (() => unexpectedSearchHttpEffect()),
  getTenantIndex:
    overrides.getTenantIndex ?? (() => unexpectedSearchHttpEffect()),
  deleteTenantIndex:
    overrides.deleteTenantIndex ?? (() => unexpectedSearchHttpEffect()),
});

const createSearchRepositoryDouble =
  (): SearchTenantIndexPostgresRepositoryService => ({
    upsertSearchTenantIndexRecord: () => unexpectedSearchHttpEffect(),
    getSearchTenantIndexRecord: () => unexpectedSearchHttpEffect(),
    listSearchTenantIndexRecords: () => unexpectedSearchHttpEffect(),
  });

const createLiveHandler = async (input: {
  readonly enabled?: boolean;
  readonly querySupportCases?: SearchModuleService["querySupportCases"];
}) => {
  const service = await Effect.runPromise(
    makeBaseSearchService({
      authorization: {
        check: vi.fn(() =>
          Effect.succeed({
            allowed: true,
            cacheKey: `${platformModuleId.search}:admin`,
            reason: "allowed",
            auditRequired: false,
          }),
        ),
      },
    }).pipe(
      Effect.provideService(AuditLogModule, createAuditLogModuleDouble()),
      Effect.provideService(FileStorageModule, createFileStorageModuleDouble()),
      Effect.provideService(
        IdentitySessionModule,
        createIdentitySessionModuleDouble(),
      ),
      Effect.provideService(
        RuntimeConfigModule,
        createRuntimeConfigModuleDouble(input.enabled),
      ),
      Effect.provideService(
        SearchModule,
        createSearchModuleDouble({
          ...(input.querySupportCases !== undefined
            ? { querySupportCases: input.querySupportCases }
            : {}),
        }),
      ),
      Effect.provideService(
        SearchTenantIndexPostgresRepository,
        createSearchRepositoryDouble(),
      ),
      Effect.provideService(
        SupportOperationsCasePostgresRepository,
        createSupportOperationsCaseRepositoryDouble(),
      ),
    ),
  );

  return createSearchHttpHandler((use) => use(service));
};

const createSearchServiceDouble = (
  overrides: Partial<SearchServiceApi>,
): SearchServiceApi => ({
  resolveRequestContext:
    overrides.resolveRequestContext ?? (() => unexpectedSearchHttpEffect()),
  ensureTenantIndex:
    overrides.ensureTenantIndex ?? (() => unexpectedSearchHttpEffect()),
  getTenantIndexRecord:
    overrides.getTenantIndexRecord ?? (() => unexpectedSearchHttpEffect()),
  listTenantIndexRecords:
    overrides.listTenantIndexRecords ?? (() => unexpectedSearchHttpEffect()),
  deleteTenantIndex:
    overrides.deleteTenantIndex ?? (() => unexpectedSearchHttpEffect()),
  queryManagedFiles:
    overrides.queryManagedFiles ?? (() => unexpectedSearchHttpEffect()),
  querySupportCases:
    overrides.querySupportCases ?? (() => unexpectedSearchHttpEffect()),
  queryCurrentTenantManagedFiles:
    overrides.queryCurrentTenantManagedFiles ??
    (() => unexpectedSearchHttpEffect()),
  requestTenantIndexEnsureWorkflowJob:
    overrides.requestTenantIndexEnsureWorkflowJob ??
    (() => unexpectedSearchHttpEffect()),
  requestTenantIndexReindexWorkflowJob:
    overrides.requestTenantIndexReindexWorkflowJob ??
    (() => unexpectedSearchHttpEffect()),
  runSearchTenantIndexEnsureWorkflowJob:
    overrides.runSearchTenantIndexEnsureWorkflowJob ??
    (() => unexpectedSearchHttpEffect()),
});

const createTestHandler = (service: Partial<SearchServiceApi>) =>
  createSearchHttpHandler((use) => use(createSearchServiceDouble(service)));

describe("platform search http", () => {
  it("returns 400 when the search ensure payload is invalid", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.ensureTenantIndex}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "",
            settings: {
              filterableAttributes: ["status"],
              sortableAttributes: ["updatedAt"],
              searchableAttributes: ["title"],
              rankingRules: ["words"],
            },
          }),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("returns 400 when the search target scope is platform", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.listTenantIndexRecords}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          }),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("ensures tenant search indexes through the backend HTTP surface", async () => {
    const ensureTenantIndex = vi.fn((input) =>
      Effect.succeed({
        indexName: `${platformModuleId.search}:${input.scope}:org_1`,
        scope: input.scope,
        scopeId: input.scopeId,
        documentCount: 12,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );
    const handler = createTestHandler({ ensureTenantIndex });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.ensureTenantIndex}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            settings: {
              filterableAttributes: ["status", "moduleId"],
              sortableAttributes: ["updatedAt"],
              searchableAttributes: ["title", "content"],
              rankingRules: ["words", "typo", "sort"],
            },
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );
    expect(ensureTenantIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );
  });

  it("queries managed-file previews through the backend HTTP surface", async () => {
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
    const handler = createTestHandler({ queryManagedFiles });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.queryManagedFiles}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            query: "invoice",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    expect(queryManagedFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        query: "invoice",
      }),
    );
  });

  it("queries support-case previews through the backend HTTP surface", async () => {
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
    const handler = createTestHandler({ querySupportCases });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.querySupportCases}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
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
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    expect(querySupportCases).toHaveBeenCalledWith(
      expect.objectContaining({
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
    );
  });

  it("queries support-case previews through the backend HTTP surface even when tenant search is disabled", async () => {
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
    const handler = await createLiveHandler({
      enabled: false,
      querySupportCases,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.querySupportCases}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
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
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    expect(querySupportCases).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
  });

  it("queries current-tenant managed-file results through the backend HTTP surface", async () => {
    const queryCurrentTenantManagedFiles = vi.fn((input) =>
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
    const handler = createTestHandler({ queryCurrentTenantManagedFiles });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchTenantApiPath.queryManagedFiles}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_org_admin_1",
            },
            body: JSON.stringify({
              query: "invoice",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    expect(queryCurrentTenantManagedFiles).toHaveBeenCalledWith({
      sessionId: "sess_org_admin_1",
      query: "invoice",
    });
  });

  it("returns 401 when the current-tenant search route is missing the trusted session header", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchTenantApiPath.queryManagedFiles}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: "invoice",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated session is required.",
    });
  });

  it("returns 403 when the current-tenant search route is denied for the session", async () => {
    const handler = createTestHandler({
      queryCurrentTenantManagedFiles: () =>
        Effect.fail({
          _tag: "SearchAccessDeniedError",
          actorType: actorType.organizationMember,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchTenantApiPath.queryManagedFiles}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_org_member_1",
            },
            body: JSON.stringify({
              query: "invoice",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Tenant search queries are not allowed for this session.",
    });
  });

  it("returns 404 when the current-tenant search route resolves a missing session context", async () => {
    const handler = createTestHandler({
      queryCurrentTenantManagedFiles: () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError",
          sessionId: "sess_missing_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchTenantApiPath.queryManagedFiles}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_missing_1",
            },
            body: JSON.stringify({
              query: "invoice",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("requests tenant search ensure workflow jobs through the backend HTTP surface", async () => {
    const requestTenantIndexEnsureWorkflowJob = vi.fn((input) =>
      Effect.succeed({
        jobId: `workflow-job-search:${input.scope}:${input.scopeId}`,
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: input.scope,
        tenantScopeId: input.scopeId,
        attempts: 0,
        scheduledAt: input.scheduledAt ?? "2026-05-06T10:30:00.000Z",
      }),
    );
    const handler = createTestHandler({ requestTenantIndexEnsureWorkflowJob });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchApiPath.requestTenantIndexEnsureWorkflowJob}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: platformScope.organization,
              scopeId: "org_1",
              settings: {
                filterableAttributes: ["status", "moduleId"],
                sortableAttributes: ["updatedAt"],
                searchableAttributes: ["title", "content"],
                rankingRules: ["words", "typo", "sort"],
                synonyms: {
                  invoice: ["bill", "statement"],
                },
              },
              scheduledAt: "2026-05-06T10:30:00.000Z",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        status: workflowJobStatus.scheduled,
      }),
    );
    expect(requestTenantIndexEnsureWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        scheduledAt: "2026-05-06T10:30:00.000Z",
        settings: {
          filterableAttributes: ["status", "moduleId"],
          sortableAttributes: ["updatedAt"],
          searchableAttributes: ["title", "content"],
          rankingRules: ["words", "typo", "sort"],
          synonyms: {
            invoice: ["bill", "statement"],
          },
        },
      }),
    );
  });

  it("returns 502 when search workflow dependencies are unavailable", async () => {
    const handler = createTestHandler({
      requestTenantIndexEnsureWorkflowJob: () =>
        Effect.fail({
          _tag: "SearchWorkflowUnavailableError",
          dependency: "convexWorkflowClient",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchApiPath.requestTenantIndexEnsureWorkflowJob}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: platformScope.organization,
              scopeId: "org_1",
              settings: {
                filterableAttributes: ["status"],
                sortableAttributes: ["updatedAt"],
                searchableAttributes: ["title"],
                rankingRules: ["words"],
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("requests tenant search reindex workflow jobs through the backend HTTP surface", async () => {
    const requestTenantIndexReindexWorkflowJob = vi.fn((input) =>
      Effect.succeed({
        jobId: `workflow-job-search:${input.scope}:${input.scopeId}`,
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: input.scope,
        tenantScopeId: input.scopeId,
        attempts: 0,
        scheduledAt: input.scheduledAt ?? "2026-05-06T10:30:00.000Z",
      }),
    );
    const handler = createTestHandler({ requestTenantIndexReindexWorkflowJob });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchApiPath.requestTenantIndexReindexWorkflowJob}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: platformScope.organization,
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );
    expect(requestTenantIndexReindexWorkflowJob).toHaveBeenCalledWith({
      sessionId: "sess_support_1",
      scope: platformScope.organization,
      scopeId: "org_1",
    });
  });

  it("returns 409 when tenant search reindex settings are unavailable", async () => {
    const handler = createTestHandler({
      requestTenantIndexReindexWorkflowJob: () =>
        Effect.fail({
          _tag: "SearchTenantIndexSettingsUnavailableError",
          scope: platformScope.organization,
          scopeId: "org_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchApiPath.requestTenantIndexReindexWorkflowJob}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: platformScope.organization,
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Search tenant index settings are not available for reindex.",
    });
  });

  it("returns 404 when the tenant search reindex record is missing", async () => {
    const handler = createTestHandler({
      requestTenantIndexReindexWorkflowJob: () =>
        Effect.fail({
          _tag: "SearchTenantIndexNotFoundError",
          scope: platformScope.organization,
          scopeId: "org_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${searchApiPath.requestTenantIndexReindexWorkflowJob}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: platformScope.organization,
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("returns 403 when search ensure is disabled for the target scope", async () => {
    const handler = createTestHandler({
      ensureTenantIndex: () =>
        Effect.fail({
          _tag: "SearchModuleDisabledError",
          scope: platformScope.organization,
          scopeId: "org_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.ensureTenantIndex}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            settings: {
              filterableAttributes: ["status"],
              sortableAttributes: ["updatedAt"],
              searchableAttributes: ["title"],
              rankingRules: ["words"],
            },
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Search is not enabled for this scope.",
    });
  });

  it("returns 404 when the tenant search index record is missing", async () => {
    const handler = createTestHandler({
      getTenantIndexRecord: () => Effect.succeed(undefined),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.getTenantIndexRecord}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("returns 404 when the operator session no longer resolves to a request context", async () => {
    const handler = createTestHandler({
      listTenantIndexRecords: () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError",
          sessionId: "sess_support_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.listTenantIndexRecords}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("gets a durable tenant search lifecycle record through the backend HTTP surface", async () => {
    const handler = createTestHandler({
      getTenantIndexRecord: () =>
        Effect.succeed({
          indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
          scope: platformScope.organization,
          scopeId: "org_1",
          documentCount: 2,
          lifecycleState: searchIndexLifecycleState.ready,
          createdAt: "2026-04-27T17:00:00.000Z",
          updatedAt: "2026-04-27T17:15:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.getTenantIndexRecord}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );
  });

  it("lists durable search lifecycle records through the backend HTTP surface", async () => {
    const handler = createTestHandler({
      listTenantIndexRecords: () =>
        Effect.succeed([
          {
            indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
            scope: platformScope.organization,
            scopeId: "org_1",
            documentCount: 0,
            lifecycleState: searchIndexLifecycleState.deleted,
            deletedAt: "2026-04-27T18:30:00.000Z",
            createdAt: "2026-04-27T18:00:00.000Z",
            updatedAt: "2026-04-27T18:30:00.000Z",
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.listTenantIndexRecords}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        lifecycleState: searchIndexLifecycleState.deleted,
      }),
    ]);
  });

  it("returns 401 when the operator session header is missing", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.listTenantIndexRecords}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
  });

  it("returns 403 when the operator is not allowed to manage search lifecycle state", async () => {
    const handler = createTestHandler({
      listTenantIndexRecords: () =>
        Effect.fail({
          _tag: "SearchAccessDeniedError",
          actorType: actorType.supportOperator,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.listTenantIndexRecords}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Search lifecycle management is not allowed for this session.",
    });
  });

  it("returns 502 when a backend dependency request fails", async () => {
    const handler = createTestHandler({
      listTenantIndexRecords: () =>
        Effect.fail({
          _tag: "SearchTenantIndexPostgresRepositoryQueryError",
          operation: "listSearchTenantIndexRecords",
          cause: new Error("Postgres unavailable."),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.listTenantIndexRecords}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("deletes tenant search indexes even when the search module is disabled for the target scope", async () => {
    const handler = createTestHandler({
      deleteTenantIndex: () =>
        Effect.succeed({
          indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
          scope: platformScope.organization,
          scopeId: "org_1",
          deleted: true,
          deletedAt: "2026-04-27T18:00:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${searchApiPath.deleteTenantIndex}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_support_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        deleted: true,
      }),
    );
  });
});
