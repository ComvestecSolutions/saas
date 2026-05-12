import { Effect } from "effect";
import {
  importExportJobFormat,
  importExportJobSource,
  platformScope,
  workflowJobStatus,
} from "@comvestec/contracts";
import {
  ImportExportJobPostgresRepository,
  type ImportExportJobPostgresRepositoryService,
  makeImportExportModule,
} from "@comvestec/modules";

const createImportExportRepositoryDouble = () => {
  const records = new Map<
    string,
    Parameters<
      ImportExportJobPostgresRepositoryService["upsertImportExportJobRecord"]
    >[0]
  >();

  const service: ImportExportJobPostgresRepositoryService = {
    upsertImportExportJobRecord: (input) => {
      records.set(input.jobId, input);

      return Effect.succeed(input);
    },
    getImportExportJobRecord: (input) =>
      Effect.succeed(records.get(input.jobId)),
  };

  return { records, service };
};

describe("modules import-export", () => {
  it("persists scheduled and completed managed-file summary export records", async () => {
    const repository = createImportExportRepositoryDouble();
    const importExport = await Effect.runPromise(
      makeImportExportModule().pipe(
        Effect.provideService(
          ImportExportJobPostgresRepository,
          repository.service,
        ),
      ),
    );

    const scheduled = await Effect.runPromise(
      importExport.requestManagedFileSummaryExportRecord({
        jobId:
          "workflow-jobs:import-export-managed-file-summary:operator-requested:organization:org_1:json:corr_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        format: importExportJobFormat.json,
        requestedBy: "usr_support_1",
        requestedAt: "2026-05-07T10:00:00.000Z",
      }),
    );

    const running = await Effect.runPromise(
      importExport.startImportExportJobRecord({
        jobId: scheduled.jobId,
        startedAt: "2026-05-07T10:01:00.000Z",
      }),
    );

    const completed = await Effect.runPromise(
      importExport.completeImportExportJobRecord({
        jobId: scheduled.jobId,
        artifactFileId: "file_export_1",
        rowCount: 2,
        completedAt: "2026-05-07T10:02:00.000Z",
      }),
    );

    expect(scheduled).toEqual({
      jobId: scheduled.jobId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.managedFileSummaryJson,
      format: importExportJobFormat.json,
      status: workflowJobStatus.scheduled,
      createdAt: "2026-05-07T10:00:00.000Z",
    });
    expect(running).toEqual({
      ...scheduled,
      status: workflowJobStatus.running,
      startedAt: "2026-05-07T10:01:00.000Z",
    });
    expect(completed).toEqual({
      ...scheduled,
      status: workflowJobStatus.completed,
      rowCount: 2,
      artifactFileId: "file_export_1",
      startedAt: "2026-05-07T10:01:00.000Z",
      completedAt: "2026-05-07T10:02:00.000Z",
    });
    expect(repository.records.get(scheduled.jobId)).toMatchObject({
      jobId: scheduled.jobId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.managedFileSummaryJson,
      format: importExportJobFormat.json,
      status: workflowJobStatus.completed,
      requestedBy: "usr_support_1",
      rowCount: 2,
      artifactFileId: "file_export_1",
      startedAt: "2026-05-07T10:01:00.000Z",
      completedAt: "2026-05-07T10:02:00.000Z",
    });
  });

  it("blocks managed-file summary export records with a durable error summary", async () => {
    const repository = createImportExportRepositoryDouble();
    const importExport = await Effect.runPromise(
      makeImportExportModule().pipe(
        Effect.provideService(
          ImportExportJobPostgresRepository,
          repository.service,
        ),
      ),
    );

    await Effect.runPromise(
      importExport.requestManagedFileSummaryExportRecord({
        jobId:
          "workflow-jobs:import-export-managed-file-summary:operator-requested:organization:org_1:json:corr_2",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        format: importExportJobFormat.json,
        requestedBy: "usr_support_1",
        requestedAt: "2026-05-07T10:05:00.000Z",
      }),
    );

    const blocked = await Effect.runPromise(
      importExport.blockImportExportJobRecord({
        jobId:
          "workflow-jobs:import-export-managed-file-summary:operator-requested:organization:org_1:json:corr_2",
        lastError: "Upload dependency failed.",
        completedAt: "2026-05-07T10:06:00.000Z",
      }),
    );

    expect(blocked).toEqual({
      jobId:
        "workflow-jobs:import-export-managed-file-summary:operator-requested:organization:org_1:json:corr_2",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.managedFileSummaryJson,
      format: importExportJobFormat.json,
      status: workflowJobStatus.blocked,
      lastError: "Upload dependency failed.",
      completedAt: "2026-05-07T10:06:00.000Z",
      createdAt: "2026-05-07T10:05:00.000Z",
    });
  });

  it("persists CSV managed-file summary export records with the CSV source", async () => {
    const repository = createImportExportRepositoryDouble();
    const importExport = await Effect.runPromise(
      makeImportExportModule().pipe(
        Effect.provideService(
          ImportExportJobPostgresRepository,
          repository.service,
        ),
      ),
    );

    const scheduled = await Effect.runPromise(
      importExport.requestManagedFileSummaryExportRecord({
        jobId:
          "workflow-jobs:import-export-managed-file-summary:operator-requested:organization:org_1:csv:corr_3",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        format: importExportJobFormat.csv,
        requestedBy: "usr_support_1",
        requestedAt: "2026-05-07T10:10:00.000Z",
      }),
    );

    expect(scheduled).toEqual({
      jobId:
        "workflow-jobs:import-export-managed-file-summary:operator-requested:organization:org_1:csv:corr_3",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.managedFileSummaryCsv,
      format: importExportJobFormat.csv,
      status: workflowJobStatus.scheduled,
      createdAt: "2026-05-07T10:10:00.000Z",
    });
  });
});
