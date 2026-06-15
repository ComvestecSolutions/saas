import { spawnSync } from "child_process";

const runBackendApiImportExportProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import { importExportApiBasePath, importExportApiPath } from './packages/platform/src/services/domains/import-export-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const importExportHandler = () => Response.json({ route: 'import-export' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  importExportHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingImportExportApp = createBackendApiApp({
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
  new Request('http://localhost' + importExportApiBasePath + '/jobs/get', {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingImportExportApp.request(
  new Request('http://localhost' + importExportApiBasePath + '/jobs/get', {
    method: 'POST',
  }),
);
console.log(JSON.stringify({
  requestExportRequestRef: document.paths[importExportApiPath.requestManagedFileSummaryExport]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  requestExportResponseRef: document.paths[importExportApiPath.requestManagedFileSummaryExport]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  requestExport403Description: document.paths[importExportApiPath.requestManagedFileSummaryExport]?.post?.responses?.['403']?.description,
  requestExport409Description: document.paths[importExportApiPath.requestManagedFileSummaryExport]?.post?.responses?.['409']?.description,
  requestExport404Description: document.paths[importExportApiPath.requestManagedFileSummaryExport]?.post?.responses?.['404']?.description,
  requestExportScopeEnum: document.components?.schemas?.RequestManagedFileSummaryExportHttpRequest?.properties?.scope?.enum,
  requestExportFormatEnum: document.components?.schemas?.RequestManagedFileSummaryExportHttpRequest?.properties?.format?.enum,
  requestExportPropertyNames: Object.keys(document.components?.schemas?.RequestManagedFileSummaryExportHttpRequest?.properties ?? {}),
  supportCaseExportRequestRef: document.paths[importExportApiPath.requestSupportCaseSummaryExport]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  supportCaseExportResponseRef: document.paths[importExportApiPath.requestSupportCaseSummaryExport]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  supportCaseExport403Description: document.paths[importExportApiPath.requestSupportCaseSummaryExport]?.post?.responses?.['403']?.description,
  supportCaseExport404Description: document.paths[importExportApiPath.requestSupportCaseSummaryExport]?.post?.responses?.['404']?.description,
  supportCaseExportScopeEnum: document.components?.schemas?.RequestSupportCaseSummaryExportHttpRequest?.properties?.scope?.enum,
  supportCaseExportPropertyNames: Object.keys(document.components?.schemas?.RequestSupportCaseSummaryExportHttpRequest?.properties ?? {}),
  getJobRequestRef: document.paths[importExportApiPath.getImportExportJob]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  getJobResponseRef: document.paths[importExportApiPath.getImportExportJob]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  getJob403Description: document.paths[importExportApiPath.getImportExportJob]?.post?.responses?.['403']?.description,
  getJob404Description: document.paths[importExportApiPath.getImportExportJob]?.post?.responses?.['404']?.description,
  getJobPropertyNames: Object.keys(document.components?.schemas?.GetImportExportJobHttpRequest?.properties ?? {}),
  routeStatus: routeResponse.status,
  routeBody: await routeResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
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
    readonly requestExportRequestRef?: string;
    readonly requestExportResponseRef?: string;
    readonly requestExport403Description?: string;
    readonly requestExport409Description?: string;
    readonly requestExport404Description?: string;
    readonly requestExportScopeEnum?: readonly string[];
    readonly requestExportFormatEnum?: readonly string[];
    readonly requestExportPropertyNames: readonly string[];
    readonly supportCaseExportRequestRef?: string;
    readonly supportCaseExportResponseRef?: string;
    readonly supportCaseExport403Description?: string;
    readonly supportCaseExport404Description?: string;
    readonly supportCaseExportScopeEnum?: readonly string[];
    readonly supportCaseExportPropertyNames: readonly string[];
    readonly getJobRequestRef?: string;
    readonly getJobResponseRef?: string;
    readonly getJob403Description?: string;
    readonly getJob404Description?: string;
    readonly getJobPropertyNames: readonly string[];
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
  };
};

describe("platform backend api import-export transport", () => {
  it("documents and mounts the import-export backend routes", () => {
    const probe = runBackendApiImportExportProbe();

    expect(probe.requestExportRequestRef).toBe(
      "#/components/schemas/RequestManagedFileSummaryExportHttpRequest",
    );
    expect(probe.requestExportResponseRef).toBe(
      "#/components/schemas/ImportExportJobAdminView",
    );
    expect(probe.requestExport403Description).toBe(
      "Import export is not enabled for this scope or managed-file summary export is not allowed for this session.",
    );
    expect(probe.requestExport409Description).toBe(
      "Managed-file summary export is blocked by an active retention legal hold.",
    );
    expect(probe.requestExport404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.requestExportScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.requestExportFormatEnum).toEqual(["json", "csv"]);
    expect(probe.requestExportPropertyNames).toEqual([
      "scope",
      "scopeId",
      "format",
    ]);
    expect(probe.supportCaseExportRequestRef).toBe(
      "#/components/schemas/RequestSupportCaseSummaryExportHttpRequest",
    );
    expect(probe.supportCaseExportResponseRef).toBe(
      "#/components/schemas/ImportExportJobAdminView",
    );
    expect(probe.supportCaseExport403Description).toBe(
      "Import export is not enabled for this scope or support-case summary export is not allowed for this session.",
    );
    expect(probe.supportCaseExport404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.supportCaseExportScopeEnum).toEqual([
      "enterprise",
      "organization",
      "individual",
    ]);
    expect(probe.supportCaseExportPropertyNames).toEqual(["scope", "scopeId"]);
    expect(probe.getJobRequestRef).toBe(
      "#/components/schemas/GetImportExportJobHttpRequest",
    );
    expect(probe.getJobResponseRef).toBe(
      "#/components/schemas/ImportExportJobAdminView",
    );
    expect(probe.getJob403Description).toBe(
      "Import-export inspection is not allowed for this session.",
    );
    expect(probe.getJob404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.getJobPropertyNames).toEqual(["jobId"]);
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "import-export" });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Import export route not found.",
    });
  }, 90_000);
});
