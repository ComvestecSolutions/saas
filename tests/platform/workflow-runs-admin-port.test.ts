import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  platformModuleId,
  platformScope,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  workflowRunStatus,
} from "@comvestec/contracts";
import { type WorkflowJobRecord } from "@comvestec/modules";
import {
  makeDefaultWorkflowRunsPort,
  WorkflowRunsAdminCancelUnavailable,
  WorkflowRunsAdminReplayUnavailable,
  type WorkflowRunsPortDependencies,
} from "@comvestec/platform";

const fixedNow = new Date("2026-06-02T10:00:00.000Z");

const buildWorkflowJobRecord = (
  overrides: Partial<WorkflowJobRecord> = {},
): WorkflowJobRecord => ({
  jobId: "job_workflow_runs_1",
  runtime: "convex",
  sourceModuleId: platformModuleId.search,
  kind: workflowJobKind.searchIndexEnsure,
  trigger: workflowJobTrigger.operatorRequested,
  status: workflowJobStatus.failed,
  tenantScope: platformScope.organization,
  tenantScopeId: "org_workflow_runs",
  attempts: 2,
  scheduledAt: "2026-06-01T10:00:00.000Z",
  completedAt: "2026-06-01T10:02:00.000Z",
  lastError: "Search ensure failed.",
  gapReason: workflowJobGapReason.repairFailed,
  payload: {
    correlationId: "corr_workflow_runs_1",
    requestContext: {
      correlationId: "corr_nested_workflow_runs_1",
    },
  },
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:02:00.000Z",
  ...overrides,
});

const buildWorkflowJobRow = (record: WorkflowJobRecord) => ({
  jobId: record.jobId,
  runtime: record.runtime,
  sourceModuleId: record.sourceModuleId,
  kind: record.kind,
  trigger: record.trigger,
  status: record.status,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  attempts: record.attempts,
  scheduledAt: new Date(record.scheduledAt),
  completedAt:
    record.completedAt === undefined ? null : new Date(record.completedAt),
  lastError: record.lastError ?? null,
  gapReason: record.gapReason ?? null,
  payload: record.payload,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const createDependencies = (
  overrides: Partial<WorkflowRunsPortDependencies> = {},
): WorkflowRunsPortDependencies => ({
  listWorkflowJobRows:
    overrides.listWorkflowJobRows ?? (() => Effect.succeed([])),
  getWorkflowJob: overrides.getWorkflowJob ?? (() => Effect.succeed(undefined)),
  persistWorkflowJob:
    overrides.persistWorkflowJob ?? ((record) => Effect.succeed(record)),
  cancelWorkflowJobIfUpdatedAtMatches:
    overrides.cancelWorkflowJobIfUpdatedAtMatches ??
    (() => Effect.succeed(undefined)),
  now: overrides.now ?? (() => fixedNow),
});

describe("workflow-runs admin default workflow-jobs port", () => {
  it("maps live workflow-job rows and details into admin run envelopes", async () => {
    const failedRecord = buildWorkflowJobRecord();
    const staleRecord = buildWorkflowJobRecord({
      jobId: "job_workflow_runs_stale",
      sourceModuleId: platformModuleId.notificationCenter,
      kind: workflowJobKind.notificationCenterEmailDigest,
      status: workflowJobStatus.blocked,
      completedAt: undefined,
      updatedAt: "2026-05-31T09:00:00.000Z",
      lastError: "Digest worker blocked.",
      payload: {
        requestContext: {
          correlationId: "corr_workflow_runs_stale",
        },
      },
    });
    const listCalls: Array<
      Parameters<WorkflowRunsPortDependencies["listWorkflowJobRows"]>[0]
    > = [];
    const port = makeDefaultWorkflowRunsPort(
      createDependencies({
        listWorkflowJobRows: (input) => {
          listCalls.push(input);
          return Effect.succeed([
            buildWorkflowJobRow(failedRecord),
            buildWorkflowJobRow(staleRecord),
          ]);
        },
        getWorkflowJob: ({ jobId }) =>
          Effect.succeed(jobId === staleRecord.jobId ? staleRecord : undefined),
      }),
    );

    const list = await Effect.runPromise(
      port.listRuns({
        filters: { moduleId: platformModuleId.search },
        pageSize: 1,
      }),
    );

    expect(listCalls).toEqual([
      {
        filters: { moduleId: platformModuleId.search },
        pageSize: 1,
        now: fixedNow,
      },
    ]);
    expect(list).toEqual({
      runs: [
        {
          runId: failedRecord.jobId,
          moduleId: failedRecord.sourceModuleId,
          workflowKey: failedRecord.kind,
          status: workflowRunStatus.failed,
          queuedAt: failedRecord.scheduledAt,
          startedAt: failedRecord.scheduledAt,
          finishedAt: failedRecord.completedAt,
          durationMs: 120_000,
          attempt: 2,
          lastError: failedRecord.lastError,
        },
      ],
      nextPageToken: `${failedRecord.scheduledAt}::${failedRecord.jobId}`,
    });

    const detail = await Effect.runPromise(
      port.getRunDetail({ runId: staleRecord.jobId }),
    );
    expect(detail._tag).toBe("Some");
    if (detail._tag === "Some") {
      expect(detail.value).toEqual({
        runId: staleRecord.jobId,
        moduleId: staleRecord.sourceModuleId,
        workflowKey: staleRecord.kind,
        status: workflowRunStatus.stale,
        queuedAt: staleRecord.scheduledAt,
        startedAt: staleRecord.scheduledAt,
        attempt: 2,
        lastError: staleRecord.lastError,
        steps: [
          {
            stepKey: staleRecord.kind,
            status: workflowRunStatus.stale,
            startedAt: staleRecord.scheduledAt,
            error: staleRecord.lastError,
          },
        ],
        payloadProjection: JSON.stringify(staleRecord.payload, null, 2),
        auditCorrelationId: "corr_workflow_runs_stale",
      });
    }
  });

  it("requeues replayable runs by clearing terminal diagnostics and rescheduling now", async () => {
    const failedRecord = buildWorkflowJobRecord();
    let persistedRecord: WorkflowJobRecord | undefined;
    const port = makeDefaultWorkflowRunsPort(
      createDependencies({
        getWorkflowJob: () => Effect.succeed(failedRecord),
        persistWorkflowJob: (record) => {
          persistedRecord = record;
          return Effect.succeed(record);
        },
      }),
    );

    await expect(
      Effect.runPromise(port.replayRun({ runId: failedRecord.jobId })),
    ).resolves.toEqual({ accepted: true });

    expect(persistedRecord).toEqual({
      ...failedRecord,
      status: workflowJobStatus.scheduled,
      scheduledAt: fixedNow.toISOString(),
      completedAt: undefined,
      lastError: undefined,
      gapReason: undefined,
      updatedAt: fixedNow.toISOString(),
    });
  });

  it("rejects replay and cancel requests once the underlying run state is no longer eligible", async () => {
    const activeRecord = buildWorkflowJobRecord({
      jobId: "job_workflow_runs_active",
      status: workflowJobStatus.running,
      completedAt: undefined,
      updatedAt: "2026-06-02T09:59:30.000Z",
    });
    const failedRecord = buildWorkflowJobRecord();
    const port = makeDefaultWorkflowRunsPort(
      createDependencies({
        getWorkflowJob: ({ jobId }) =>
          Effect.succeed(
            jobId === activeRecord.jobId ? activeRecord : failedRecord,
          ),
      }),
    );

    const replayError = await Effect.runPromise(
      Effect.flip(port.replayRun({ runId: activeRecord.jobId })),
    );
    expect(replayError).toBeInstanceOf(WorkflowRunsAdminReplayUnavailable);

    const cancelError = await Effect.runPromise(
      Effect.flip(port.cancelRun({ runId: failedRecord.jobId })),
    );
    expect(cancelError).toBeInstanceOf(WorkflowRunsAdminCancelUnavailable);
  });
});
