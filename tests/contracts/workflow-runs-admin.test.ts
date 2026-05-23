/**
 * Workflow runs admin envelope contracts tests (admin-app
 * implementation plan §9 item 15). Pins:
 *
 *   - schema round-trips for list / detail / replay / cancel
 *     inputs and the list-response envelope
 *   - status enum membership
 *   - registry membership of `permissionScope.workflowRunsAdminRead`
 *     + `.workflowRunsAdminWrite`, `platformModuleId.workflowRunsAdmin`,
 *     and the four `workflowRunsAdminAuditAction.*` entries
 *   - both reason-catalog entries (`workflow-runs-admin.replay` +
 *     `.cancel`) are present, owned by the workflow-runs-admin
 *     module, require an attachment, and gate the matching audit
 *     actions
 */
import { Schema } from "effect";
import { describe, expect, test } from "vitest";
import {
  auditActions,
  permissionScope,
  permissionScopes,
  platformModuleId,
  platformModuleIds,
  reasonCatalogId,
  reasonCatalogRegistry,
  workflowRunsAdminAuditAction,
  WorkflowRunCancelInputSchema,
  WorkflowRunDetailInputSchema,
  WorkflowRunDetailSchema,
  WorkflowRunReplayInputSchema,
  WorkflowRunSummarySchema,
  WorkflowRunsListInputSchema,
  WorkflowRunsListResultSchema,
  workflowRunStatus,
  workflowRunStatuses,
  type WorkflowRunCancelInput,
  type WorkflowRunDetail,
  type WorkflowRunDetailInput,
  type WorkflowRunReplayInput,
  type WorkflowRunSummary,
  type WorkflowRunsListInput,
  type WorkflowRunsListResult,
} from "@comvestec/contracts";

const decodeSummary = Schema.decodeUnknownSync(WorkflowRunSummarySchema);
const decodeDetail = Schema.decodeUnknownSync(WorkflowRunDetailSchema);
const decodeList = Schema.decodeUnknownSync(WorkflowRunsListInputSchema);
const decodeDetailInput = Schema.decodeUnknownSync(
  WorkflowRunDetailInputSchema,
);
const decodeReplayInput = Schema.decodeUnknownSync(
  WorkflowRunReplayInputSchema,
);
const decodeCancelInput = Schema.decodeUnknownSync(
  WorkflowRunCancelInputSchema,
);
const decodeListResult = Schema.decodeUnknownSync(WorkflowRunsListResultSchema);

const requestContext = {
  actorType: "platform-operator" as const,
  actorId: "usr_op",
  sessionId: "sess_wra",
  correlationId: "corr_wra",
  tenant: {
    scope: "platform" as const,
    scopeId: "platform",
  },
};

describe("WorkflowRunsAdmin schemas", () => {
  test("WorkflowRunStatusSchema enum", () => {
    expect(workflowRunStatuses).toEqual([
      "queued",
      "running",
      "succeeded",
      "failed",
      "canceled",
      "stale",
    ]);
  });

  test("WorkflowRunSummarySchema round-trips", () => {
    const summary: WorkflowRunSummary = {
      runId: "run_1",
      moduleId: platformModuleId.workflowJobs,
      workflowKey: "search-index-ensure",
      status: workflowRunStatus.failed,
      queuedAt: "2026-02-01T00:00:00.000Z",
      startedAt: "2026-02-01T00:00:05.000Z",
      finishedAt: "2026-02-01T00:00:10.000Z",
      durationMs: 5000,
      attempt: 2,
      lastError: "timeout",
    };
    expect(decodeSummary(summary)).toStrictEqual(summary);
  });

  test("WorkflowRunDetailSchema round-trips with steps + payloadProjection", () => {
    const detail: WorkflowRunDetail = {
      runId: "run_1",
      moduleId: platformModuleId.workflowJobs,
      workflowKey: "search-index-ensure",
      status: workflowRunStatus.failed,
      queuedAt: "2026-02-01T00:00:00.000Z",
      attempt: 1,
      steps: [
        {
          stepKey: "ensure-index",
          status: workflowRunStatus.failed,
          startedAt: "2026-02-01T00:00:01.000Z",
          finishedAt: "2026-02-01T00:00:09.000Z",
          error: "ECONNREFUSED",
        },
      ],
      payloadProjection: '{"tenantScope":"platform"}',
      auditCorrelationId: "corr_wra_detail",
    };
    expect(decodeDetail(detail)).toStrictEqual(detail);
  });

  test("WorkflowRunsListInputSchema decodes with bounded pageSize + optional pageToken + filters", () => {
    const input: WorkflowRunsListInput = {
      requestContext,
      filters: {
        moduleId: platformModuleId.workflowJobs,
        status: workflowRunStatus.failed,
        since: "2026-02-01T00:00:00.000Z",
        until: "2026-02-02T00:00:00.000Z",
      },
      pageSize: 50,
      pageToken: "tok_next",
    };
    expect(decodeList(input)).toStrictEqual(input);
  });

  test("WorkflowRunsListInputSchema rejects pageSize > 500", () => {
    expect(() =>
      decodeList({
        requestContext,
        filters: {},
        pageSize: 501,
      }),
    ).toThrow();
  });

  test("WorkflowRunDetailInputSchema round-trips", () => {
    const input: WorkflowRunDetailInput = {
      requestContext,
      runId: "run_1",
    };
    expect(decodeDetailInput(input)).toStrictEqual(input);
  });

  test("WorkflowRunReplayInputSchema round-trips", () => {
    const input: WorkflowRunReplayInput = {
      requestContext,
      runId: "run_1",
      reason: reasonCatalogId.workflowRunsAdminReplay,
      reasonAttachmentText: "INC-42 runbook",
    };
    expect(decodeReplayInput(input)).toStrictEqual(input);
  });

  test("WorkflowRunCancelInputSchema round-trips", () => {
    const input: WorkflowRunCancelInput = {
      requestContext,
      runId: "run_1",
      reason: reasonCatalogId.workflowRunsAdminCancel,
      reasonAttachmentText: "INC-43 runbook",
    };
    expect(decodeCancelInput(input)).toStrictEqual(input);
  });

  test("WorkflowRunsListResultSchema admits nextPageToken + partialFailures", () => {
    const result: WorkflowRunsListResult = {
      runs: [],
      nextPageToken: "tok_next",
      partialFailures: [{ bucket: "page-2", reason: "upstream-timeout" }],
    };
    expect(decodeListResult(result)).toStrictEqual(result);
  });
});

describe("WorkflowRunsAdmin registry pins", () => {
  test("permissionScope.workflowRunsAdminRead + .workflowRunsAdminWrite are in the canonical list", () => {
    expect(permissionScope.workflowRunsAdminRead).toBe(
      "workflow-runs-admin:read",
    );
    expect(permissionScope.workflowRunsAdminWrite).toBe(
      "workflow-runs-admin:write",
    );
    expect(permissionScopes).toContain(permissionScope.workflowRunsAdminRead);
    expect(permissionScopes).toContain(permissionScope.workflowRunsAdminWrite);
  });

  test("platformModuleId.workflowRunsAdmin is in the canonical list", () => {
    expect(platformModuleId.workflowRunsAdmin).toBe("workflow-runs-admin");
    expect(platformModuleIds).toContain(platformModuleId.workflowRunsAdmin);
  });

  test("workflowRunsAdminAuditAction.{listed,detailRead,replayed,canceled} are in the canonical list", () => {
    expect(workflowRunsAdminAuditAction.listed).toBe(
      "workflow-runs-admin.listed",
    );
    expect(workflowRunsAdminAuditAction.detailRead).toBe(
      "workflow-runs-admin.detail-read",
    );
    expect(workflowRunsAdminAuditAction.replayed).toBe(
      "workflow-runs-admin.replayed",
    );
    expect(workflowRunsAdminAuditAction.canceled).toBe(
      "workflow-runs-admin.canceled",
    );
    expect(auditActions).toContain(workflowRunsAdminAuditAction.listed);
    expect(auditActions).toContain(workflowRunsAdminAuditAction.detailRead);
    expect(auditActions).toContain(workflowRunsAdminAuditAction.replayed);
    expect(auditActions).toContain(workflowRunsAdminAuditAction.canceled);
  });

  test("reasonCatalogId.workflowRunsAdminReplay has requiresAttachment: true and gates replayed", () => {
    expect(reasonCatalogId.workflowRunsAdminReplay).toBe(
      "workflow-runs-admin.replay",
    );
    const entry = reasonCatalogRegistry.find(
      (e) => e.id === reasonCatalogId.workflowRunsAdminReplay,
    );
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("registry entry missing");
    }
    expect(entry.moduleId).toBe(platformModuleId.workflowRunsAdmin);
    expect(entry.requiresAttachment).toBe(true);
    expect(entry.auditActionsGated).toEqual([
      workflowRunsAdminAuditAction.replayed,
    ]);
  });

  test("reasonCatalogId.workflowRunsAdminCancel has requiresAttachment: true and gates canceled", () => {
    expect(reasonCatalogId.workflowRunsAdminCancel).toBe(
      "workflow-runs-admin.cancel",
    );
    const entry = reasonCatalogRegistry.find(
      (e) => e.id === reasonCatalogId.workflowRunsAdminCancel,
    );
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("registry entry missing");
    }
    expect(entry.moduleId).toBe(platformModuleId.workflowRunsAdmin);
    expect(entry.requiresAttachment).toBe(true);
    expect(entry.auditActionsGated).toEqual([
      workflowRunsAdminAuditAction.canceled,
    ]);
  });
});
