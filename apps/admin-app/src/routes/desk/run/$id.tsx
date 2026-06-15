import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  HighRiskActionGuard,
  StateScreen,
  StatusChip,
  type HighRiskReason,
  type StatusChipTone,
} from "@comvestec/ui";
import { workflowRunStatus } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { KpiCard, ScreenHeader } from "../../../components/ui";
import type { AdminWorkflowRunDetailRouteData } from "../../../lib/workflow-run-detail-route-data";
import {
  cancelAdminWorkflowRun,
  replayAdminWorkflowRun,
} from "../../../lib/workflow-run-detail-mutations-server";
import { formatAdminTimestamp } from "../../../lib/timestamp-format";

/**
 * `/desk/run/$id` — spec-canonical Workflow Run Detail v2 surface
 * shipped by Phase 6 vendor + workflow operator screens commit
 * 6b (admin-app implementation plan §8.14 + §11). Consumes the
 * `workflow-run-detail-{loader,route-data,route-server}` trio
 * gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId` and the
 * `workflow-runs-admin` platform service.
 *
 * Layout follows the spec §11 "spine first, body second"
 * convention shipped on `/desk/incident/$incidentId`,
 * `/desk/legal-hold/$holdId`, `/desk/delivery/$deliveryId`, and
 * `/desk/api-key/$keyId`:
 *   - Summary panel (run id, workflow, module, status,
 *     attempt, queued/started/finished timestamps).
 *   - Steps roster with per-step status + timestamps.
 *   - Payload projection + audit correlation id panel.
 *   - Replay + cancel CTAs gated through `HighRiskActionGuard`
 *     with the `workflow-run.replay.*` /
 *     `workflow-run.cancel.*` reason catalogs.
 *
 * The replay / cancel mutation bodies (binding the
 * `replayWorkflowRunFromEnvironment` /
 * `cancelWorkflowRunFromEnvironment` helpers through a
 * mutations-server entrypoint) are tracked under the Admin app
 * row's Phase 6 follow-ups in the implementation tracker —
 * spine first, body second (mirrors the rotate / revoke CTAs
 * on `/desk/api-key/$keyId`). The guards capture the operator's
 * reason + note today.
 *
 * `lastError` and `payloadProjection` carry the platform-side
 * `regulated-sensitive` classification; the route renders the
 * server-supplied projection verbatim and does NOT re-derive
 * sensitive fields client-side.
 */
const replayReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "workflow-run.replay.transient-vendor-failure",
    label: "Transient vendor failure — replay run",
  },
  {
    id: "workflow-run.replay.code-fix-deployed",
    label: "Code fix deployed — replay run",
  },
  {
    id: "workflow-run.replay.support-escalation",
    label: "Support escalation — replay run",
  },
];

const cancelReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "workflow-run.cancel.duplicate-submission",
    label: "Duplicate submission — cancel run",
  },
  {
    id: "workflow-run.cancel.stuck-run",
    label: "Stuck run — cancel run",
  },
  {
    id: "workflow-run.cancel.policy-violation",
    label: "Policy violation — cancel run",
  },
];

const buildWorkflowStatusTone = (status: string): StatusChipTone => {
  switch (status) {
    case workflowRunStatus.succeeded:
      return "success";
    case workflowRunStatus.failed:
    case workflowRunStatus.canceled:
      return "error";
    case workflowRunStatus.stale:
      return "drift";
    default:
      return "pending";
  }
};

const buildWorkflowStatusKpiTone = (
  status: string,
): "accent" | "good" | "warn" | "alert" => {
  switch (buildWorkflowStatusTone(status)) {
    case "success":
      return "good";
    case "error":
      return "alert";
    case "drift":
      return "warn";
    default:
      return "accent";
  }
};

const formatWorkflowTimestamp = (value: string | null | undefined) =>
  value === undefined || value === null ? "—" : formatAdminTimestamp(value);

export const Route = createAdminAppFileRoute("/desk/run/$id")({
  loader: async ({ params }) => {
    const { loadAdminWorkflowRunDetailLoaderData } =
      await import("../../../lib/workflow-run-detail-loader");
    return loadAdminWorkflowRunDetailLoaderData({ runId: params.id });
  },
  component: WorkflowRunDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading workflow run…" />
  ),
});

function WorkflowRunDetailRoute() {
  const data: AdminWorkflowRunDetailRouteData = Route.useLoaderData();
  const router = useRouter();
  const replayRun = useServerFn(replayAdminWorkflowRun);
  const cancelRun = useServerFn(cancelAdminWorkflowRun);
  const [replayArmed, setReplayArmed] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view workflow run detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access workflow run detail."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <StateScreen
        variant="denied"
        title="Access denied"
        description={data.reason}
      />
    );
  }
  if (data.kind === "error") {
    return (
      <StateScreen
        variant="5xx"
        title={data.title}
        description={data.description}
      />
    );
  }

  const { run } = data;
  const replayable =
    run.status === workflowRunStatus.failed ||
    run.status === workflowRunStatus.canceled ||
    run.status === workflowRunStatus.stale;
  const cancelable =
    run.status === workflowRunStatus.queued ||
    run.status === workflowRunStatus.running;

  const handleReplayConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    try {
      const result = await replayRun({
        data: {
          runId: run.runId,
          reason: input.reasonId,
          ...(input.note.trim().length === 0
            ? {}
            : { reasonAttachmentText: input.note.trim() }),
        },
      });
      setReplayArmed(false);
      setActionError(null);
      setActionSuccess(
        result.replayRunId === null
          ? `Replay accepted for ${result.runId}.`
          : `Replay accepted for ${result.runId}; follow-up run ${result.replayRunId} queued.`,
      );
      await router.invalidate();
    } catch (error) {
      setReplayArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to replay the workflow run. Retry shortly.",
      );
    }
  };

  const handleCancelConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    try {
      const result = await cancelRun({
        data: {
          runId: run.runId,
          reason: input.reasonId,
          ...(input.note.trim().length === 0
            ? {}
            : { reasonAttachmentText: input.note.trim() }),
        },
      });
      setCancelArmed(false);
      setActionError(null);
      setActionSuccess(`Cancel accepted for ${result.runId}.`);
      await router.invalidate();
    } catch (error) {
      setCancelArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to cancel the workflow run. Retry shortly.",
      );
    }
  };

  const stepErrorCount = run.steps.filter((step) => step.error !== null).length;
  const statusTone = buildWorkflowStatusTone(run.status);

  return (
    <section
      data-testid="workflow-run-detail-ready"
      data-pattern="workflow-run-detail-v2"
      className="ops-screen ops-screen--tight"
    >
      <ScreenHeader
        title={run.workflowKey}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Workflow runs", href: "/desk/runs" },
          { label: run.runId },
        ]}
        subtitle={`${run.moduleId} · Run ${run.runId} · Attempt ${run.attempt}`}
        actions={
          replayable || cancelable ? (
            <div className="ops-inline-actions">
              {replayable ? (
                <button
                  type="button"
                  className="ops-btn ops-btn--primary"
                  data-testid="workflow-run-detail-replay-cta"
                  onClick={() => {
                    setActionError(null);
                    setActionSuccess(null);
                    setReplayArmed(true);
                  }}
                >
                  Replay run
                </button>
              ) : null}
              {cancelable ? (
                <button
                  type="button"
                  className="ops-btn ops-btn--danger"
                  data-testid="workflow-run-detail-cancel-cta"
                  onClick={() => {
                    setActionError(null);
                    setActionSuccess(null);
                    setCancelArmed(true);
                  }}
                >
                  Cancel run
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="workflow-run-detail-action-success"
          role="status"
          className="ops-feedback success"
        >
          {actionSuccess}
        </div>
      ) : null}
      {actionError !== null ? (
        <div
          data-testid="workflow-run-detail-action-error"
          role="alert"
          className="ops-feedback error"
        >
          {actionError}
        </div>
      ) : null}

      <div className="ops-bento" data-testid="workflow-run-detail-kpis">
        <KpiCard
          label="Status"
          value={run.status}
          tone={buildWorkflowStatusKpiTone(run.status)}
          hint={
            replayable
              ? "Replay available"
              : cancelable
                ? "Cancellation available"
                : undefined
          }
        />
        <KpiCard
          label="Attempt"
          value={run.attempt}
          tone={run.attempt > 1 ? "warn" : "neutral"}
          hint="Current execution attempt"
        />
        <KpiCard
          label="Steps"
          value={run.steps.length}
          tone={run.steps.length > 0 ? "neutral" : "warn"}
          hint="Recorded workflow stages"
        />
        <KpiCard
          label="Step errors"
          value={stepErrorCount}
          tone={stepErrorCount > 0 ? "alert" : "good"}
          hint="Stages carrying an error payload"
        />
        <KpiCard
          label="Queued"
          value={formatWorkflowTimestamp(run.queuedAt)}
          tone="neutral"
        />
        <KpiCard
          label="Finished"
          value={formatWorkflowTimestamp(run.finishedAt)}
          tone={
            run.finishedAt === null
              ? run.status === workflowRunStatus.running
                ? "accent"
                : "warn"
              : "neutral"
          }
        />
      </div>

      <div className="ops-insight-grid">
        <section
          data-testid="workflow-run-detail-summary"
          className="ops-insight-card"
        >
          <p className="ops-card-title">Run summary</p>
          <div className="ops-inline-cluster">
            <StatusChip
              tone={statusTone}
              size="sm"
              data-testid="workflow-run-detail-status-chip"
              data-status={run.status}
            >
              {run.status}
            </StatusChip>
            <span className="mono" data-testid="workflow-run-detail-run-id">
              {run.runId}
            </span>
          </div>
          <div className="ops-detail-grid">
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">Workflow</span>
              <span className="mono">{run.workflowKey}</span>
            </div>
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">Module</span>
              <span className="mono">{run.moduleId}</span>
            </div>
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">Queued at</span>
              <span className="mono">
                {formatWorkflowTimestamp(run.queuedAt)}
              </span>
            </div>
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">Started at</span>
              <span className="mono">
                {formatWorkflowTimestamp(run.startedAt)}
              </span>
            </div>
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">Finished at</span>
              <span className="mono">
                {formatWorkflowTimestamp(run.finishedAt)}
              </span>
            </div>
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">Duration (ms)</span>
              <span className="mono">{run.durationMs ?? "—"}</span>
            </div>
          </div>
          {run.lastError !== undefined ? (
            <div
              data-testid="workflow-run-detail-last-error"
              className="ops-feedback error"
            >
              <span className="mono">{run.lastError}</span>
            </div>
          ) : (
            <span className="ops-secondary-text">
              No terminal error is attached to this run.
            </span>
          )}
        </section>

        <section
          data-testid="workflow-run-detail-payload"
          className="ops-insight-card"
        >
          <p className="ops-card-title">Payload &amp; audit</p>
          <div className="ops-detail-grid">
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">
                Audit correlation id
              </span>
              <span
                className="mono"
                data-testid="workflow-run-detail-audit-correlation"
              >
                {run.auditCorrelationId}
              </span>
            </div>
            <div className="ops-detail-card">
              <span className="ops-detail-card__label">Operator posture</span>
              <span>
                {cancelable
                  ? "Cancellation is currently available."
                  : replayable
                    ? "Replay is currently available."
                    : "Run is closed for direct action."}
              </span>
            </div>
          </div>
          <div className="ops-json-frame">
            <pre data-testid="workflow-run-detail-payload-projection">
              {run.payloadProjection}
            </pre>
          </div>
        </section>
      </div>

      <section
        data-testid="workflow-run-detail-steps"
        className="ops-insight-card"
      >
        <p className="ops-card-title">Workflow steps</p>
        <span className="ops-secondary-text">
          Review step timing, terminal failures, and the stages that still need
          operator intervention.
        </span>
        {run.steps.length === 0 ? (
          <div
            data-testid="workflow-run-detail-steps-empty"
            className="ops-feedback error"
          >
            No steps reported for this run.
          </div>
        ) : (
          <div className="ops-table-wrapper">
            <table
              className="ops-table"
              data-testid="workflow-run-detail-steps-table"
              data-pattern="dense-data-table"
            >
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col">Finished</th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {run.steps.map((step) => (
                  <tr
                    key={step.stepKey}
                    data-testid="workflow-run-detail-step-row"
                    data-step-key={step.stepKey}
                    data-status={step.status}
                  >
                    <td className="mono">{step.stepKey}</td>
                    <td>
                      <StatusChip
                        tone={buildWorkflowStatusTone(step.status)}
                        size="sm"
                      >
                        {step.status}
                      </StatusChip>
                    </td>
                    <td className="mono">
                      {formatWorkflowTimestamp(step.startedAt)}
                    </td>
                    <td className="mono">
                      {formatWorkflowTimestamp(step.finishedAt)}
                    </td>
                    <td className="mono">{step.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {replayArmed ? (
        <HighRiskActionGuard
          action={{
            id: "workflow-run-replay",
            label: "Replay workflow run",
          }}
          selection={[run.runId]}
          reasons={replayReasonCatalog}
          requireNote
          confirmLabel="Replay"
          onConfirm={handleReplayConfirm}
          onCancel={() => setReplayArmed(false)}
        />
      ) : null}
      {cancelArmed ? (
        <HighRiskActionGuard
          action={{
            id: "workflow-run-cancel",
            label: "Cancel workflow run",
          }}
          selection={[run.runId]}
          reasons={cancelReasonCatalog}
          requireNote
          confirmLabel="Cancel"
          onConfirm={handleCancelConfirm}
          onCancel={() => setCancelArmed(false)}
        />
      ) : null}
    </section>
  );
}
