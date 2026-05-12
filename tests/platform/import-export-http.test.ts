import { Effect } from "effect";
import {
  actorType,
  importExportJobFormat,
  importExportJobSource,
  platformModuleId,
  platformScope,
  workflowJobStatus,
} from "@comvestec/contracts";
import { subscriberJourneySessionHeaderName } from "@comvestec/platform";
import {
  createImportExportHttpHandler,
  importExportApiPath,
} from "../../packages/platform/src/services/domains/import-export-http";
import type { ImportExportServiceApi } from "../../packages/platform/src/services/domains/import-export";

const unexpectedImportExportHttpEffect = <A>() =>
  Effect.die(new Error("Unexpected import-export HTTP service call."));

const createImportExportServiceDouble = (
  overrides: Partial<ImportExportServiceApi>,
): ImportExportServiceApi => ({
  requestManagedFileSummaryExport:
    overrides.requestManagedFileSummaryExport ??
    (() => unexpectedImportExportHttpEffect()),
  requestSupportCaseSummaryExport:
    overrides.requestSupportCaseSummaryExport ??
    (() => unexpectedImportExportHttpEffect()),
  getImportExportJob:
    overrides.getImportExportJob ?? (() => unexpectedImportExportHttpEffect()),
  runImportExportManagedFileSummaryWorkflowJob:
    overrides.runImportExportManagedFileSummaryWorkflowJob ??
    (() => unexpectedImportExportHttpEffect()),
  runImportExportSupportCaseSummaryWorkflowJob:
    overrides.runImportExportSupportCaseSummaryWorkflowJob ??
    (() => unexpectedImportExportHttpEffect()),
});

const createTestHandler = (service: Partial<ImportExportServiceApi>) =>
  createImportExportHttpHandler((use) =>
    use(createImportExportServiceDouble(service)),
  );

describe("platform import-export http", () => {
  it("returns 400 when the import-export target scope is platform", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${importExportApiPath.requestManagedFileSummaryExport}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("requests managed-file summary exports through the backend HTTP surface", async () => {
    const requestManagedFileSummaryExport = vi.fn((input) =>
      Effect.succeed({
        jobId: `workflow-job-import-export:${input.scope}:${input.scopeId}`,
        tenantScope: input.scope,
        tenantScopeId: input.scopeId,
        source: importExportJobSource.managedFileSummaryCsv,
        format: importExportJobFormat.csv,
        status: workflowJobStatus.scheduled,
        createdAt: "2026-05-07T14:00:00.000Z",
      }),
    );
    const handler = createTestHandler({ requestManagedFileSummaryExport });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${importExportApiPath.requestManagedFileSummaryExport}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: platformScope.organization,
              scopeId: "org_1",
              format: importExportJobFormat.csv,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: `workflow-job-import-export:${platformScope.organization}:org_1`,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.managedFileSummaryCsv,
      format: importExportJobFormat.csv,
      status: workflowJobStatus.scheduled,
      createdAt: "2026-05-07T14:00:00.000Z",
    });
    expect(requestManagedFileSummaryExport).toHaveBeenCalledWith({
      sessionId: "sess_support_1",
      scope: platformScope.organization,
      scopeId: "org_1",
      format: importExportJobFormat.csv,
    });
  });

  it("requests support-case summary exports through the backend HTTP surface", async () => {
    const requestSupportCaseSummaryExport = vi.fn((input) =>
      Effect.succeed({
        jobId: `workflow-job-import-export-support:${input.scope}:${input.scopeId}`,
        tenantScope: input.scope,
        tenantScopeId: input.scopeId,
        source: importExportJobSource.supportCaseSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.scheduled,
        createdAt: "2026-05-07T14:05:00.000Z",
      }),
    );
    const handler = createTestHandler({ requestSupportCaseSummaryExport });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${importExportApiPath.requestSupportCaseSummaryExport}`,
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
    await expect(response.json()).resolves.toEqual({
      jobId: `workflow-job-import-export-support:${platformScope.organization}:org_1`,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.supportCaseSummaryJson,
      format: importExportJobFormat.json,
      status: workflowJobStatus.scheduled,
      createdAt: "2026-05-07T14:05:00.000Z",
    });
    expect(requestSupportCaseSummaryExport).toHaveBeenCalledWith({
      sessionId: "sess_support_1",
      scope: platformScope.organization,
      scopeId: "org_1",
    });
  });

  it("returns route-specific 403 messages for export requests and inspection", async () => {
    const requestManagedFileSummaryExport = vi.fn(() =>
      Effect.fail({
        _tag: "ImportExportAccessDeniedError" as const,
        actorType: actorType.supportOperator,
      }),
    );
    const requestSupportCaseSummaryExport = vi.fn(() =>
      Effect.fail({
        _tag: "ImportExportAccessDeniedError" as const,
        actorType: actorType.supportOperator,
      }),
    );
    const getImportExportJob = vi.fn(() =>
      Effect.fail({
        _tag: "ImportExportAccessDeniedError" as const,
        actorType: actorType.supportOperator,
      }),
    );
    const handler = createTestHandler({
      requestManagedFileSummaryExport,
      requestSupportCaseSummaryExport,
      getImportExportJob,
    });

    const requestResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${importExportApiPath.requestManagedFileSummaryExport}`,
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
    const inspectResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${importExportApiPath.getImportExportJob}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              jobId: "job_import_export_1",
            }),
          },
        ),
      ),
    );
    const supportCaseRequestResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${importExportApiPath.requestSupportCaseSummaryExport}`,
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

    expect(requestResponse.status).toBe(403);
    await expect(requestResponse.json()).resolves.toEqual({
      error: "Managed-file summary export is not allowed for this session.",
    });
    expect(supportCaseRequestResponse.status).toBe(403);
    await expect(supportCaseRequestResponse.json()).resolves.toEqual({
      error: "Support-case summary export is not allowed for this session.",
    });
    expect(inspectResponse.status).toBe(403);
    await expect(inspectResponse.json()).resolves.toEqual({
      error: "Import-export inspection is not allowed for this session.",
    });
  });

  it("returns 409 when a managed-file summary export is blocked by retention legal hold", async () => {
    const handler = createTestHandler({
      requestManagedFileSummaryExport: () =>
        Effect.fail({
          _tag: "ImportExportManagedFileSummaryExportBlockedError" as const,
          scope: platformScope.organization,
          scopeId: "org_1",
          format: importExportJobFormat.json,
          blockedTargetId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
          reason:
            "Managed-file summary export is blocked by an active retention legal hold on file-storage:organization:org_1:file_1.",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${importExportApiPath.requestManagedFileSummaryExport}`,
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
      error:
        "Managed-file summary export is blocked by an active retention legal hold.",
    });
  });
});
