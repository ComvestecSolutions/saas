import { spawnSync } from "child_process";

const runBackendApiSupportOperationsProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import {
  adminSupportOperationsApiBasePath,
  adminSupportOperationsApiPath,
} from './packages/platform/src/services/governance/support-operations-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const supportOperationsHandler = () => Response.json({ route: 'support-operations' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: supportOperationsHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingSupportOperationsApp = createBackendApiApp({
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
  new Request('http://localhost' + adminSupportOperationsApiBasePath + '/cases/list', {
    method: 'POST',
  }),
);
const tenantHealthRequestRef = document.paths[adminSupportOperationsApiPath.tenantHealth]?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
const tenantHealthResponseRef = document.paths[adminSupportOperationsApiPath.tenantHealth]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
const tenantHealth404Description = document.paths[adminSupportOperationsApiPath.tenantHealth]?.post?.responses?.['404']?.description;
const tenantHealthRepairGapItemSchema = document.components.schemas.SupportOperationsTenantHealthView?.properties?.repairGaps?.items;
const tenantHealthRepairGapItemRef = tenantHealthRepairGapItemSchema?.$ref;
const tenantHealthRepairGapSchema =
  tenantHealthRepairGapItemRef === undefined
    ? tenantHealthRepairGapItemSchema
    : document.components.schemas[
        tenantHealthRepairGapItemRef.split('/').at(-1)
      ];
const tenantHealthRepairGapHasLastError = Boolean(
  tenantHealthRepairGapSchema?.properties?.lastError,
);
const tenantHealthCaseItemSchema = document.components.schemas.SupportOperationsTenantHealthView?.properties?.cases?.items;
const tenantHealthCaseItemRef = tenantHealthCaseItemSchema?.$ref;
const tenantHealthCaseSchema =
  tenantHealthCaseItemRef === undefined
    ? tenantHealthCaseItemSchema
    : document.components.schemas[
        tenantHealthCaseItemRef.split('/').at(-1)
      ];
const tenantHealthCaseScopeAllowsPlatform = Boolean(
  tenantHealthCaseSchema?.properties?.tenantScope?.enum?.includes('platform'),
);
const caseUpsertRequestRef = document.paths[adminSupportOperationsApiPath.upsertCase]?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
const caseUpsertResponseRef = document.paths[adminSupportOperationsApiPath.upsertCase]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
const caseUpsert404Description = document.paths[adminSupportOperationsApiPath.upsertCase]?.post?.responses?.['404']?.description;
const caseListRequestRef = document.paths[adminSupportOperationsApiPath.listCases]?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
const caseListResponseRef = document.paths[adminSupportOperationsApiPath.listCases]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
const caseList404Description = document.paths[adminSupportOperationsApiPath.listCases]?.post?.responses?.['404']?.description;
const impersonationListRequestRef = document.paths[adminSupportOperationsApiPath.listImpersonationSessions]?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
const impersonationListResponseRef = document.paths[adminSupportOperationsApiPath.listImpersonationSessions]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
const impersonationRevokeResponseRef = document.paths[adminSupportOperationsApiPath.revokeImpersonationSession]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
const impersonationRevoke409Description = document.paths[adminSupportOperationsApiPath.revokeImpersonationSession]?.post?.responses?.['409']?.description;
const requestRef = document.paths[adminSupportOperationsApiPath.listBreakGlassIncidents]?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
const listResponseRef = document.paths[adminSupportOperationsApiPath.listBreakGlassIncidents]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
const reviewResponseRef = document.paths[adminSupportOperationsApiPath.reviewBreakGlassIncident]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
const review409Description = document.paths[adminSupportOperationsApiPath.reviewBreakGlassIncident]?.post?.responses?.['409']?.description;
const startResponseRef = document.paths[adminSupportOperationsApiPath.startImpersonation]?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref;
const grantResponseRef = document.paths[adminSupportOperationsApiPath.grantBreakGlass]?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref;
const routeBody = await routeResponse.json();
console.log(JSON.stringify({
  tenantHealthRequestRef,
  tenantHealthResponseRef,
  tenantHealth404Description,
  tenantHealthRepairGapHasLastError,
  tenantHealthCaseScopeAllowsPlatform,
  caseUpsertRequestRef,
  caseUpsertResponseRef,
  caseUpsert404Description,
  caseListRequestRef,
  caseListResponseRef,
  caseList404Description,
  impersonationListRequestRef,
  impersonationListResponseRef,
  impersonationRevokeResponseRef,
  impersonationRevoke409Description,
  requestRef,
  listResponseRef,
  reviewResponseRef,
  review409Description,
  startResponseRef,
  grantResponseRef,
  hasCaseViewSchema: Boolean(document.components.schemas.SupportOperationsCaseSupportView),
  hasCaseViewListSchema: Boolean(document.components.schemas.SupportOperationsCaseSupportViewList),
  hasImpersonationViewSchema: Boolean(document.components.schemas.SupportOperationsImpersonationSessionSupportView),
  hasImpersonationViewListSchema: Boolean(document.components.schemas.SupportOperationsImpersonationSessionSupportViewList),
  hasSupportViewSchema: Boolean(document.components.schemas.SupportOperationsBreakGlassIncidentSupportView),
  hasSupportViewListSchema: Boolean(document.components.schemas.SupportOperationsBreakGlassIncidentSupportViewList),
  routeStatus: routeResponse.status,
  routeBody,
}));`,
    ],
    {
      cwd: process.cwd(),
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly tenantHealthRequestRef?: string;
    readonly tenantHealthResponseRef?: string;
    readonly tenantHealth404Description?: string;
    readonly tenantHealthRepairGapHasLastError: boolean;
    readonly tenantHealthCaseScopeAllowsPlatform: boolean;
    readonly caseUpsertRequestRef?: string;
    readonly caseUpsertResponseRef?: string;
    readonly caseUpsert404Description?: string;
    readonly caseListRequestRef?: string;
    readonly caseListResponseRef?: string;
    readonly caseList404Description?: string;
    readonly impersonationListRequestRef?: string;
    readonly impersonationListResponseRef?: string;
    readonly impersonationRevokeResponseRef?: string;
    readonly impersonationRevoke409Description?: string;
    readonly requestRef?: string;
    readonly listResponseRef?: string;
    readonly reviewResponseRef?: string;
    readonly review409Description?: string;
    readonly startResponseRef?: string;
    readonly grantResponseRef?: string;
    readonly hasCaseViewSchema: boolean;
    readonly hasCaseViewListSchema: boolean;
    readonly hasImpersonationViewSchema: boolean;
    readonly hasImpersonationViewListSchema: boolean;
    readonly hasSupportViewSchema: boolean;
    readonly hasSupportViewListSchema: boolean;
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
  };
};

describe("platform backend api support-operations transport", () => {
  it("documents and mounts the support-operations backend routes", () => {
    const probe = runBackendApiSupportOperationsProbe();

    expect(probe.tenantHealthRequestRef).toBe(
      "#/components/schemas/SupportOperationsGetTenantHealthRequest",
    );
    expect(probe.tenantHealthResponseRef).toBe(
      "#/components/schemas/SupportOperationsTenantHealthView",
    );
    expect(probe.tenantHealth404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.tenantHealthRepairGapHasLastError).toBe(false);
    expect(probe.tenantHealthCaseScopeAllowsPlatform).toBe(false);
    expect(probe.caseUpsertRequestRef).toBe(
      "#/components/schemas/SupportOperationsUpsertCaseRequest",
    );
    expect(probe.caseUpsertResponseRef).toBe(
      "#/components/schemas/SupportOperationsCaseSupportView",
    );
    expect(probe.caseUpsert404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.caseListRequestRef).toBe(
      "#/components/schemas/SupportOperationsListCasesRequest",
    );
    expect(probe.caseListResponseRef).toBe(
      "#/components/schemas/SupportOperationsCaseSupportViewList",
    );
    expect(probe.caseList404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.impersonationListRequestRef).toBe(
      "#/components/schemas/SupportOperationsListImpersonationSessionsRequest",
    );
    expect(probe.impersonationListResponseRef).toBe(
      "#/components/schemas/SupportOperationsImpersonationSessionSupportViewList",
    );
    expect(probe.impersonationRevokeResponseRef).toBe(
      "#/components/schemas/SupportOperationsImpersonationSessionSupportView",
    );
    expect(probe.impersonationRevoke409Description).toBe(
      "Impersonation session is no longer active or has already been revoked.",
    );
    expect(probe.requestRef).toBe(
      "#/components/schemas/SupportOperationsListBreakGlassIncidentsRequest",
    );
    expect(probe.listResponseRef).toBe(
      "#/components/schemas/SupportOperationsBreakGlassIncidentSupportViewList",
    );
    expect(probe.reviewResponseRef).toBe(
      "#/components/schemas/SupportOperationsBreakGlassIncidentSupportView",
    );
    expect(probe.review409Description).toBe(
      "Break-glass incident has already been reviewed.",
    );
    expect(probe.startResponseRef).toBe(
      "#/components/schemas/SupportImpersonationGrant",
    );
    expect(probe.grantResponseRef).toBe("#/components/schemas/BreakGlassGrant");
    expect(probe.hasCaseViewSchema).toBe(true);
    expect(probe.hasCaseViewListSchema).toBe(true);
    expect(probe.hasImpersonationViewSchema).toBe(true);
    expect(probe.hasImpersonationViewListSchema).toBe(true);
    expect(probe.hasSupportViewSchema).toBe(true);
    expect(probe.hasSupportViewListSchema).toBe(true);
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "support-operations" });
  }, 30_000);
});
