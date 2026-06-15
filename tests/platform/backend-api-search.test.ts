import { spawnSync } from "child_process";

const runBackendApiSearchProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { subscriberJourneySessionHeaderName } from '@comvestec/platform';
import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
    import { searchApiBasePath, searchApiPath, searchTenantApiBasePath, searchTenantApiPath } from './packages/platform/src/services/domains/search-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const searchHandler = () => Response.json({ route: 'search' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  searchHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingSearchApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const routeResponse = await app.request(
  new Request('http://localhost' + searchApiBasePath + '/indexes/list', {
    method: 'POST',
  }),
);
const tenantRouteResponse = await app.request(
  new Request('http://localhost' + searchTenantApiBasePath + '/query/managed-files', {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingSearchApp.request(
  new Request('http://localhost' + searchApiBasePath + '/indexes/list', {
    method: 'POST',
  }),
);
console.log(JSON.stringify({
  ensureRequestRef: document.paths[searchApiPath.ensureTenantIndex]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  ensureResponseRef: document.paths[searchApiPath.ensureTenantIndex]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  ensure404Description: document.paths[searchApiPath.ensureTenantIndex]?.post?.responses?.['404']?.description,
  ensureScopeEnum: document.components?.schemas?.EnsureSearchTenantIndexHttpRequest?.properties?.scope?.enum,
  requestEnsureRequestRef: document.paths[searchApiPath.requestTenantIndexEnsureWorkflowJob]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  requestEnsureResponseRef: document.paths[searchApiPath.requestTenantIndexEnsureWorkflowJob]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  requestEnsure403Description: document.paths[searchApiPath.requestTenantIndexEnsureWorkflowJob]?.post?.responses?.['403']?.description,
  requestEnsure404Description: document.paths[searchApiPath.requestTenantIndexEnsureWorkflowJob]?.post?.responses?.['404']?.description,
  requestEnsureScopeEnum: document.components?.schemas?.RequestSearchTenantIndexEnsureWorkflowJobHttpRequest?.properties?.scope?.enum,
  requestEnsureSettingsPropertyNames: Object.keys(document.components?.schemas?.RequestSearchTenantIndexEnsureWorkflowJobHttpRequest?.properties?.settings?.properties ?? {}),
  requestReindexRequestRef: document.paths[searchApiPath.requestTenantIndexReindexWorkflowJob]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  requestReindexResponseRef: document.paths[searchApiPath.requestTenantIndexReindexWorkflowJob]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  requestReindex403Description: document.paths[searchApiPath.requestTenantIndexReindexWorkflowJob]?.post?.responses?.['403']?.description,
  requestReindex404Description: document.paths[searchApiPath.requestTenantIndexReindexWorkflowJob]?.post?.responses?.['404']?.description,
  requestReindex409Description: document.paths[searchApiPath.requestTenantIndexReindexWorkflowJob]?.post?.responses?.['409']?.description,
  requestReindexScopeEnum: document.components?.schemas?.RequestSearchTenantIndexReindexWorkflowJobHttpRequest?.properties?.scope?.enum,
  queryRequestRef: document.paths[searchApiPath.queryManagedFiles]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  queryResponseRef: document.paths[searchApiPath.queryManagedFiles]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  query403Description: document.paths[searchApiPath.queryManagedFiles]?.post?.responses?.['403']?.description,
  query404Description: document.paths[searchApiPath.queryManagedFiles]?.post?.responses?.['404']?.description,
  queryScopeEnum: document.components?.schemas?.QuerySearchManagedFilesHttpRequest?.properties?.scope?.enum,
  supportCaseQueryRequestRef: document.paths[searchApiPath.querySupportCases]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  supportCaseQueryResponseRef: document.paths[searchApiPath.querySupportCases]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  supportCaseQuery403Description: document.paths[searchApiPath.querySupportCases]?.post?.responses?.['403']?.description,
  supportCaseQuery404Description: document.paths[searchApiPath.querySupportCases]?.post?.responses?.['404']?.description,
  supportCaseQueryScopeEnum: document.components?.schemas?.QuerySearchSupportCasesHttpRequest?.properties?.scope?.enum,
  supportCaseQueryPropertyNames: Object.keys(document.components?.schemas?.QuerySearchSupportCasesHttpRequest?.properties ?? {}),
  currentTenantQueryRequestRef: document.paths[searchTenantApiPath.queryManagedFiles]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  currentTenantQueryResponseRef: document.paths[searchTenantApiPath.queryManagedFiles]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  currentTenantQuery403Description: document.paths[searchTenantApiPath.queryManagedFiles]?.post?.responses?.['403']?.description,
  currentTenantQuery401Description: document.paths[searchTenantApiPath.queryManagedFiles]?.post?.responses?.['401']?.description,
  getResponseRef: document.paths[searchApiPath.getTenantIndexRecord]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  get403Description: document.paths[searchApiPath.getTenantIndexRecord]?.post?.responses?.['403']?.description,
  lookupScopeEnum: document.components?.schemas?.SearchTenantIndexLookupHttpRequest?.properties?.scope?.enum,
  listResponseRef: document.paths[searchApiPath.listTenantIndexRecords]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  list403Description: document.paths[searchApiPath.listTenantIndexRecords]?.post?.responses?.['403']?.description,
  list404Description: document.paths[searchApiPath.listTenantIndexRecords]?.post?.responses?.['404']?.description,
  deleteResponseRef: document.paths[searchApiPath.deleteTenantIndex]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  delete403Description: document.paths[searchApiPath.deleteTenantIndex]?.post?.responses?.['403']?.description,
  delete404Description: document.paths[searchApiPath.deleteTenantIndex]?.post?.responses?.['404']?.description,
  ensureParameterNames: (document.paths[searchApiPath.ensureTenantIndex]?.post?.parameters ?? []).map((parameter) => parameter.name),
  routeStatus: routeResponse.status,
  routeBody: await routeResponse.json(),
  tenantRouteStatus: tenantRouteResponse.status,
  tenantRouteBody: await tenantRouteResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  subscriberJourneySessionHeaderName,
}));`,
    ],
    {
      cwd: process.cwd(),
      timeout: 90_000,
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly ensureRequestRef?: string;
    readonly ensureResponseRef?: string;
    readonly ensure404Description?: string;
    readonly ensureScopeEnum?: readonly string[];
    readonly requestEnsureRequestRef?: string;
    readonly requestEnsureResponseRef?: string;
    readonly requestEnsure403Description?: string;
    readonly requestEnsure404Description?: string;
    readonly requestEnsureScopeEnum?: readonly string[];
    readonly requestEnsureSettingsPropertyNames: readonly string[];
    readonly requestReindexRequestRef?: string;
    readonly requestReindexResponseRef?: string;
    readonly requestReindex403Description?: string;
    readonly requestReindex404Description?: string;
    readonly requestReindex409Description?: string;
    readonly requestReindexScopeEnum?: readonly string[];
    readonly queryRequestRef?: string;
    readonly queryResponseRef?: string;
    readonly query403Description?: string;
    readonly query404Description?: string;
    readonly queryScopeEnum?: readonly string[];
    readonly supportCaseQueryRequestRef?: string;
    readonly supportCaseQueryResponseRef?: string;
    readonly supportCaseQuery403Description?: string;
    readonly supportCaseQuery404Description?: string;
    readonly supportCaseQueryScopeEnum?: readonly string[];
    readonly supportCaseQueryPropertyNames: readonly string[];
    readonly currentTenantQueryRequestRef?: string;
    readonly currentTenantQueryResponseRef?: string;
    readonly currentTenantQuery403Description?: string;
    readonly currentTenantQuery401Description?: string;
    readonly getResponseRef?: string;
    readonly get403Description?: string;
    readonly lookupScopeEnum?: readonly string[];
    readonly listResponseRef?: string;
    readonly list403Description?: string;
    readonly list404Description?: string;
    readonly deleteResponseRef?: string;
    readonly delete403Description?: string;
    readonly delete404Description?: string;
    readonly ensureParameterNames: readonly string[];
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly tenantRouteStatus: number;
    readonly tenantRouteBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly subscriberJourneySessionHeaderName: string;
  };
};

describe("platform backend api search transport", () => {
  it("documents and mounts the search backend routes", () => {
    const probe = runBackendApiSearchProbe();

    expect(probe.ensureRequestRef).toBe(
      "#/components/schemas/EnsureSearchTenantIndexHttpRequest",
    );
    expect(probe.ensureResponseRef).toBe(
      "#/components/schemas/SearchTenantIndexSummaryView",
    );
    expect(probe.ensure404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.ensureScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.requestEnsureRequestRef).toBe(
      "#/components/schemas/RequestSearchTenantIndexEnsureWorkflowJobHttpRequest",
    );
    expect(probe.requestEnsureResponseRef).toBe(
      "#/components/schemas/WorkflowJobSummary",
    );
    expect(probe.requestEnsure403Description).toBe(
      "Search is not enabled for this scope or search lifecycle management is not allowed for this session.",
    );
    expect(probe.requestEnsure404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.requestEnsureScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.requestEnsureSettingsPropertyNames).toEqual([
      "filterableAttributes",
      "sortableAttributes",
      "searchableAttributes",
      "rankingRules",
      "synonyms",
    ]);
    expect(probe.requestReindexRequestRef).toBe(
      "#/components/schemas/RequestSearchTenantIndexReindexWorkflowJobHttpRequest",
    );
    expect(probe.requestReindexResponseRef).toBe(
      "#/components/schemas/WorkflowJobSummary",
    );
    expect(probe.requestReindex403Description).toBe(
      "Search is not enabled for this scope or search lifecycle management is not allowed for this session.",
    );
    expect(probe.requestReindex404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.requestReindex409Description).toBe(
      "Search tenant index settings are not available for reindex.",
    );
    expect(probe.requestReindexScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.queryRequestRef).toBe(
      "#/components/schemas/QuerySearchManagedFilesHttpRequest",
    );
    expect(probe.queryResponseRef).toBe(
      "#/components/schemas/SearchManagedFileQueryResult",
    );
    expect(probe.query403Description).toBe(
      "Search preview queries are not allowed for this session.",
    );
    expect(probe.query404Description).toBe("Requested resource was not found.");
    expect(probe.queryScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.supportCaseQueryRequestRef).toBe(
      "#/components/schemas/QuerySearchSupportCasesHttpRequest",
    );
    expect(probe.supportCaseQueryResponseRef).toBe(
      "#/components/schemas/SearchSupportCaseQueryResult",
    );
    expect(probe.supportCaseQuery403Description).toBe(
      "Search preview queries are not allowed for this session.",
    );
    expect(probe.supportCaseQuery404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.supportCaseQueryScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.supportCaseQueryPropertyNames).toEqual([
      "scope",
      "scopeId",
      "query",
      "limit",
      "status",
      "priority",
      "sort",
    ]);
    expect(probe.currentTenantQueryRequestRef).toBe(
      "#/components/schemas/QueryCurrentTenantSearchManagedFilesHttpRequest",
    );
    expect(probe.currentTenantQueryResponseRef).toBe(
      "#/components/schemas/SearchManagedFileQueryResult",
    );
    expect(probe.currentTenantQuery401Description).toBe(
      "Authenticated session is required.",
    );
    expect(probe.currentTenantQuery403Description).toBe(
      "Search is not enabled for this scope or tenant search queries are not allowed for this session.",
    );
    expect(probe.getResponseRef).toBe(
      "#/components/schemas/SearchTenantIndexRecord",
    );
    expect(probe.get403Description).toBe(
      "Search lifecycle management is not allowed for this session.",
    );
    expect(probe.lookupScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.listResponseRef).toBe(
      "#/components/schemas/SearchTenantIndexRecordList",
    );
    expect(probe.list403Description).toBe(
      "Search lifecycle management is not allowed for this session.",
    );
    expect(probe.list404Description).toBe("Requested resource was not found.");
    expect(probe.deleteResponseRef).toBe(
      "#/components/schemas/SearchTenantIndexDeletionReceipt",
    );
    expect(probe.delete403Description).toBe(
      "Search lifecycle management is not allowed for this session.",
    );
    expect(probe.delete404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.ensureParameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
    ]);
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "search" });
    expect(probe.tenantRouteStatus).toBe(200);
    expect(probe.tenantRouteBody).toEqual({ route: "search" });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Search route not found.",
    });
  }, 90_000);
});
