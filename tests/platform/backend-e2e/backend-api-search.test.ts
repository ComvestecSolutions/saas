import {
  platformModuleId,
  platformScope,
  searchIndexLifecycleState,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e("backend e2e search transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runSearchProbe = () =>
    runBackendE2eBunProbe<{
      readonly tenantScopeId: string;
      readonly caseId: string;
      readonly searchQuery: string;
      readonly searchIndexName: string;
      readonly futureEnsureScheduledAt: string;
      readonly futureReindexScheduledAt: string;
      readonly unauthenticatedListStatus: number;
      readonly unauthenticatedListBody: {
        readonly error: string;
      };
      readonly currentTenantUnauthenticatedStatus: number;
      readonly currentTenantUnauthenticatedBody: {
        readonly error: string;
      };
      readonly ensureStatus: number;
      readonly ensureBody: {
        readonly indexName: string;
        readonly scope: string;
        readonly scopeId: string;
        readonly documentCount: number;
        readonly lifecycleState: string;
      };
      readonly getStatus: number;
      readonly getBody: {
        readonly indexName: string;
        readonly scope: string;
        readonly scopeId: string;
        readonly documentCount: number;
        readonly lifecycleState: string;
      };
      readonly listStatus: number;
      readonly listBody: ReadonlyArray<{
        readonly indexName: string;
        readonly scope: string;
        readonly scopeId: string;
        readonly documentCount: number;
        readonly lifecycleState: string;
      }>;
      readonly supportCaseQueryStatus: number;
      readonly supportCaseQueryBody: {
        readonly query: string;
        readonly hits: ReadonlyArray<{
          readonly caseId: string;
          readonly supportAgent: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly summary: string;
          readonly status: string;
          readonly priority: string;
        }>;
        readonly estimatedTotalHits: number;
      };
      readonly managedFilesQueryStatus: number;
      readonly managedFilesQueryBody: {
        readonly query: string;
        readonly hits: ReadonlyArray<unknown>;
        readonly estimatedTotalHits: number;
      };
      readonly currentTenantManagedFilesQueryStatus: number;
      readonly currentTenantManagedFilesQueryBody: {
        readonly query: string;
        readonly hits: ReadonlyArray<unknown>;
        readonly estimatedTotalHits: number;
      };
      readonly requestEnsureStatus: number;
      readonly requestEnsureBody: {
        readonly jobId: string;
        readonly sourceModuleId: string;
        readonly kind: string;
        readonly trigger: string;
        readonly status: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly attempts: number;
        readonly scheduledAt: string;
      };
      readonly requestReindexStatus: number;
      readonly requestReindexBody: {
        readonly jobId: string;
        readonly sourceModuleId: string;
        readonly kind: string;
        readonly trigger: string;
        readonly status: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly attempts: number;
        readonly scheduledAt: string;
      };
      readonly deleteStatus: number;
      readonly deleteBody: {
        readonly indexName: string;
        readonly scope: string;
        readonly scopeId: string;
        readonly deleted: boolean;
        readonly deletedAt: string;
      };
    }>(
      `import { Effect } from 'effect';
import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  platformModuleId,
  platformScope,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
} from '@comvestec/contracts';
import {
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  searchApiPath,
  searchTenantApiPath,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';
import { searchTenantIndexesTable } from './packages/modules/src/persistence/postgres/domains/search/schema.ts';
import { workflowJobsTable } from './packages/modules/src/persistence/postgres/domains/workflow-jobs.ts';
import { supportOperationsCasesTable } from './packages/modules/src/persistence/postgres/governance/support-operations.ts';

const runStep = async (label, operation, timeoutMs = 15000) => {
  let timeoutHandle;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(label + ' timed out after ' + timeoutMs + 'ms.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const runId = Date.now().toString();
const tenantScopeId = 'org_backend_e2e_search_' + runId;
const searchIndexName =
  platformModuleId.search + ':' + platformScope.organization + ':' + tenantScopeId;
const operatorActorId = 'usr_backend_e2e_search_operator_' + runId;
const operatorSessionId = 'sess_backend_e2e_search_operator_' + runId;
const tenantActorId = 'usr_backend_e2e_search_tenant_' + runId;
const tenantSessionId = 'sess_backend_e2e_search_tenant_' + runId;
const supportCaseId = 'case_backend_e2e_search_' + runId;
const supportAgentId = 'usr_backend_e2e_search_agent_' + runId;
const searchQuery = 'invoice';
const futureEnsureScheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const futureReindexScheduledAt = new Date(
  Date.now() + 20 * 60 * 1000,
).toISOString();

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: operatorSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId: operatorActorId,
      sessionId: operatorSessionId,
      correlationId: 'corr_backend_e2e_search_operator_' + runId,
      reason: 'Validate search backend route family',
      tenant: {
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        organizationId: tenantScopeId,
        enterpriseId: 'ent_backend_e2e_search',
      },
    },
  }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: tenantSessionId,
    requestContext: {
      actorType: actorType.organizationAdmin,
      actorId: tenantActorId,
      sessionId: tenantSessionId,
      correlationId: 'corr_backend_e2e_search_tenant_' + runId,
      tenant: {
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        organizationId: tenantScopeId,
        enterpriseId: 'ent_backend_e2e_search',
      },
    },
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const oryKeto = await Effect.runPromise(
  makeOryKetoAdapter({
    readUrl: process.env.KETO_READ_URL,
    writeUrl: process.env.KETO_WRITE_URL,
  }),
);
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.module,
    object: platformModuleId.search,
    relation: authorizationRelation.admin,
    subject: operatorActorId,
  }),
);
await waitForOryKetoTuple({
  oryKeto,
  tuple: {
    namespace: authorizationNamespace.module,
    object: platformModuleId.search,
    relation: authorizationRelation.admin,
    subject: operatorActorId,
  },
});

const postgres = await Effect.runPromise(
  makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
await postgres.database.insert(supportOperationsCasesTable).values({
  caseId: supportCaseId,
  supportAgent: supportAgentId,
  tenantScope: platformScope.organization,
  tenantScopeId,
  summary: 'Invoice support case seeded for backend e2e ' + runId,
  status: supportOperationsCaseStatus.open,
  priority: supportOperationsCasePriority.high,
  startedAt: new Date('2026-05-12T08:00:00.000Z'),
  lastUpdatedAt: new Date('2026-05-12T08:05:00.000Z'),
});

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

const requestJson = async (input) => {
  const response = await input;
  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

  const waitForSupportCaseQueryResult = async (baseUrl) => {
    const deadline = Date.now() + 30_000;

  while (Date.now() <= deadline) {
    const response = await runStep(
      'query support cases',
      requestJson(
        fetch(new URL(searchApiPath.querySupportCases, baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [subscriberJourneySessionHeaderName]: operatorSessionId,
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: tenantScopeId,
            query: searchQuery,
            status: [supportOperationsCaseStatus.open],
            priority: [supportOperationsCasePriority.high],
            sort: {
              field: 'lastUpdatedAt',
              direction: 'desc',
            },
          }),
        }),
      ),
    );

    if (
      response.status === 200 &&
      response.body !== null &&
      Array.isArray(response.body.hits) &&
      response.body.hits.some((hit) => hit.caseId === supportCaseId)
    ) {
      return response;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error('Timed out waiting for support-case search results.');
};

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const indexSettings = {
    filterableAttributes: ['status', 'priority', 'tenantScopeId'],
    sortableAttributes: ['startedAt', 'lastUpdatedAt'],
    searchableAttributes: ['summary'],
    rankingRules: ['words', 'typo', 'sort'],
    synonyms: {
      invoice: ['bill', 'statement'],
    },
  };
  const unauthenticatedListResponse = await runStep(
    'list search indexes without trusted session',
    requestJson(
      fetch(new URL(searchApiPath.listTenantIndexRecords, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
        }),
      }),
    ),
  );
  const currentTenantUnauthenticatedResponse = await runStep(
    'query current-tenant managed files without trusted session',
    requestJson(
      fetch(new URL(searchTenantApiPath.queryManagedFiles, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
        }),
      }),
    ),
  );
  const ensureResponse = await runStep(
    'ensure tenant search index',
    requestJson(
      fetch(new URL(searchApiPath.ensureTenantIndex, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: operatorSessionId,
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          settings: indexSettings,
        }),
      }),
    ),
    30_000,
  );
  const getResponse = await runStep(
    'get search tenant index record',
    requestJson(
      fetch(new URL(searchApiPath.getTenantIndexRecord, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: operatorSessionId,
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
        }),
      }),
    ),
  );
  const listResponse = await runStep(
    'list search tenant index records',
    requestJson(
      fetch(new URL(searchApiPath.listTenantIndexRecords, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: operatorSessionId,
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
        }),
      }),
    ),
  );
  const supportCaseQueryResponse = await waitForSupportCaseQueryResult(baseUrl);
  const managedFilesQueryResponse = await runStep(
    'query managed-file previews',
    requestJson(
      fetch(new URL(searchApiPath.queryManagedFiles, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: operatorSessionId,
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          query: searchQuery,
        }),
      }),
    ),
  );
  const currentTenantManagedFilesQueryResponse = await runStep(
    'query current-tenant managed files',
    requestJson(
      fetch(new URL(searchTenantApiPath.queryManagedFiles, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: tenantSessionId,
        },
        body: JSON.stringify({
          query: searchQuery,
        }),
      }),
    ),
  );
  const requestEnsureResponse = await runStep(
    'request tenant search ensure workflow job',
    requestJson(
      fetch(new URL(searchApiPath.requestTenantIndexEnsureWorkflowJob, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: operatorSessionId,
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          settings: indexSettings,
          scheduledAt: futureEnsureScheduledAt,
        }),
      }),
    ),
  );
  const requestReindexResponse = await runStep(
    'request tenant search reindex workflow job',
    requestJson(
      fetch(new URL(searchApiPath.requestTenantIndexReindexWorkflowJob, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: operatorSessionId,
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          scheduledAt: futureReindexScheduledAt,
        }),
      }),
    ),
  );
  const deleteResponse = await runStep(
    'delete tenant search index',
    requestJson(
      fetch(new URL(searchApiPath.deleteTenantIndex, baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: operatorSessionId,
        },
        body: JSON.stringify({
          scope: platformScope.organization,
          scopeId: tenantScopeId,
        }),
      }),
    ),
  );

  console.log(
    JSON.stringify({
      tenantScopeId,
      caseId: supportCaseId,
      searchQuery,
      searchIndexName,
      futureEnsureScheduledAt,
      futureReindexScheduledAt,
      unauthenticatedListStatus: unauthenticatedListResponse.status,
      unauthenticatedListBody: unauthenticatedListResponse.body,
      currentTenantUnauthenticatedStatus:
        currentTenantUnauthenticatedResponse.status,
      currentTenantUnauthenticatedBody:
        currentTenantUnauthenticatedResponse.body,
      ensureStatus: ensureResponse.status,
      ensureBody: ensureResponse.body,
      getStatus: getResponse.status,
      getBody: getResponse.body,
      listStatus: listResponse.status,
      listBody: listResponse.body,
      supportCaseQueryStatus: supportCaseQueryResponse.status,
      supportCaseQueryBody: supportCaseQueryResponse.body,
      managedFilesQueryStatus: managedFilesQueryResponse.status,
      managedFilesQueryBody: managedFilesQueryResponse.body,
      currentTenantManagedFilesQueryStatus:
        currentTenantManagedFilesQueryResponse.status,
      currentTenantManagedFilesQueryBody:
        currentTenantManagedFilesQueryResponse.body,
      requestEnsureStatus: requestEnsureResponse.status,
      requestEnsureBody: requestEnsureResponse.body,
      requestReindexStatus: requestReindexResponse.status,
      requestReindexBody: requestReindexResponse.body,
      deleteStatus: deleteResponse.status,
      deleteBody: deleteResponse.body,
    }),
  );
} finally {
  server.stop(true);
  await Effect.runPromise(Effect.ignore(postgres.close));
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 90_000,
      },
    );

  it("drives the real search backend route family through durable search state", () => {
    const probe = runSearchProbe();

    expect(probe.unauthenticatedListStatus).toBe(401);
    expect(probe.unauthenticatedListBody).toEqual({
      error: "Authenticated operator session is required.",
    });
    expect(probe.currentTenantUnauthenticatedStatus).toBe(401);
    expect(probe.currentTenantUnauthenticatedBody).toEqual({
      error: "Authenticated session is required.",
    });

    expect(probe.ensureStatus).toBe(200);
    expect(probe.ensureBody).toEqual(
      expect.objectContaining({
        indexName: probe.searchIndexName,
        scope: platformScope.organization,
        scopeId: probe.tenantScopeId,
        documentCount: 1,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );

    expect(probe.getStatus).toBe(200);
    expect(probe.getBody).toEqual(
      expect.objectContaining({
        indexName: probe.searchIndexName,
        scope: platformScope.organization,
        scopeId: probe.tenantScopeId,
        documentCount: 1,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );

    expect(probe.listStatus).toBe(200);
    expect(probe.listBody).toEqual([
      expect.objectContaining({
        indexName: probe.searchIndexName,
        scope: platformScope.organization,
        scopeId: probe.tenantScopeId,
        documentCount: 1,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    ]);

    expect(probe.supportCaseQueryStatus).toBe(200);
    expect(probe.supportCaseQueryBody).toEqual({
      query: probe.searchQuery,
      hits: [
        expect.objectContaining({
          caseId: probe.caseId,
          supportAgent: expect.stringContaining(
            "usr_backend_e2e_search_agent_",
          ),
          tenantScope: platformScope.organization,
          tenantScopeId: probe.tenantScopeId,
          summary: expect.stringMatching(new RegExp(probe.searchQuery, "i")),
          status: supportOperationsCaseStatus.open,
          priority: supportOperationsCasePriority.high,
        }),
      ],
      estimatedTotalHits: 1,
    });

    expect(probe.managedFilesQueryStatus).toBe(200);
    expect(probe.managedFilesQueryBody).toEqual({
      query: probe.searchQuery,
      hits: [],
      estimatedTotalHits: 0,
    });

    expect(probe.currentTenantManagedFilesQueryStatus).toBe(200);
    expect(probe.currentTenantManagedFilesQueryBody).toEqual({
      query: probe.searchQuery,
      hits: [],
      estimatedTotalHits: 0,
    });

    expect(probe.requestEnsureStatus).toBe(200);
    expect(probe.requestEnsureBody).toEqual(
      expect.objectContaining({
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: probe.tenantScopeId,
        attempts: 0,
        scheduledAt: probe.futureEnsureScheduledAt,
      }),
    );

    expect(probe.requestReindexStatus).toBe(200);
    expect(probe.requestReindexBody).toEqual(
      expect.objectContaining({
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: probe.tenantScopeId,
        attempts: 0,
        scheduledAt: probe.futureReindexScheduledAt,
      }),
    );

    expect(probe.deleteStatus).toBe(200);
    expect(probe.deleteBody).toEqual(
      expect.objectContaining({
        indexName: probe.searchIndexName,
        scope: platformScope.organization,
        scopeId: probe.tenantScopeId,
        deleted: true,
      }),
    );
  });
});
