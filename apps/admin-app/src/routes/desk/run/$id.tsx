import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  HighRiskActionGuard,
  StateScreen,
  type HighRiskReason,
} from "@comvestec/ui";
import { workflowRunStatus } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import type { AdminWorkflowRunDetailRouteData } from "../../../lib/workflow-run-detail-route-data";
import {
  cancelAdminWorkflowRun,
  replayAdminWorkflowRun,
} from "../../../lib/workflow-run-detail-mutations-server";

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

  return (
    <section
      data-testid="workflow-run-detail-ready"
      data-pattern="workflow-run-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={run.workflowKey}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Workflow runs", href: "/desk/runs" },
          { label: run.runId },
        ]}
        subtitle={
          <>
            Status{" "}
            <span
              className="mono"
              data-testid="workflow-run-detail-status-chip"
              data-status={run.status}
            >
              {run.status}
            </span>{" "}
            · Module <span className="mono">{run.moduleId}</span> · Attempt{" "}
            <span className="mono">{run.attempt}</span>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="workflow-run-detail-action-success"
          role="status"
          style={{
            padding: 6,
            color: "var(--status-success-fg)",
            background: "var(--status-success-bg)",
            border: "1px solid var(--status-success-border)",
            borderRadius: 4,
          }}
        >
          {actionSuccess}
        </div>
      ) : null}
      {actionError !== null ? (
        <div
          data-testid="workflow-run-detail-action-error"
          role="alert"
          style={{
            padding: 6,
            color: "var(--status-error-fg)",
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            borderRadius: 4,
          }}
        >
          {actionError}
        </div>
      ) : null}

      <section
        data-testid="workflow-run-detail-summary"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 6,
          border: "1px solid var(--bg-2)",
          borderRadius: 4,
        }}
      >
        <div>
          <strong>Run id:</strong>{" "}
          <span className="mono" data-testid="workflow-run-detail-run-id">
            {run.runId}
          </span>
        </div>
        <div>
          <strong>Workflow:</strong>{" "}
          <span className="mono">{run.workflowKey}</span>
        </div>
        <div>
          <strong>Module:</strong> <span className="mono">{run.moduleId}</span>
        </div>
        <div>
          <strong>Queued at:</strong>{" "}
          <span className="mono">{run.queuedAt}</span>
        </div>
        <div>
          <strong>Started at:</strong>{" "}
          <span className="mono">{run.startedAt ?? "—"}</span>
        </div>
        <div>
          <strong>Finished at:</strong>{" "}
          <span className="mono">{run.finishedAt ?? "—"}</span>
        </div>
        <div>
          <strong>Duration (ms):</strong>{" "}
          <span className="mono">{run.durationMs ?? "—"}</span>
        </div>
        {run.lastError !== undefined ? (
          <div data-testid="workflow-run-detail-last-error">
            <strong>Last error:</strong>{" "}
            <span className="mono">{run.lastError}</span>
          </div>
        ) : null}
      </section>

      <section
        data-testid="workflow-run-detail-steps"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 6,
          border: "1px solid var(--bg-2)",
          borderRadius: 4,
        }}
      >
        <h2 style={{ fontSize: "0.9375rem", padding: 4, margin: 0 }}>Steps</h2>
        {run.steps.length === 0 ? (
          <div
            data-testid="workflow-run-detail-steps-empty"
            style={{ padding: 4 }}
          >
            No steps reported for this run.
          </div>
        ) : (
          <table
            data-testid="workflow-run-detail-steps-table"
            data-pattern="dense-data-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 4 }}>Step</th>
                <th style={{ textAlign: "left", padding: 4 }}>Status</th>
                <th style={{ textAlign: "left", padding: 4 }}>Started</th>
                <th style={{ textAlign: "left", padding: 4 }}>Finished</th>
                <th style={{ textAlign: "left", padding: 4 }}>Error</th>
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
                  <td style={{ padding: 4 }} className="mono">
                    {step.stepKey}
                  </td>
                  <td style={{ padding: 4 }}>{step.status}</td>
                  <td style={{ padding: 4 }} className="mono">
                    {step.startedAt ?? "—"}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {step.finishedAt ?? "—"}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {step.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section
        data-testid="workflow-run-detail-payload"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 6,
          border: "1px solid var(--bg-2)",
          borderRadius: 4,
        }}
      >
        <h2 style={{ fontSize: "0.9375rem", padding: 4, margin: 0 }}>
          Payload &amp; audit
        </h2>
        <div>
          <strong>Audit correlation id:</strong>{" "}
          <span
            className="mono"
            data-testid="workflow-run-detail-audit-correlation"
          >
            {run.auditCorrelationId}
          </span>
        </div>
        <pre
          data-testid="workflow-run-detail-payload-projection"
          style={{
            margin: 0,
            padding: 4,
            fontSize: "0.6875rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {run.payloadProjection}
        </pre>
      </section>

      {replayable || cancelable ? (
        <div style={{ display: "flex", gap: 6 }}>
          {replayable ? (
            <button
              type="button"
              data-testid="workflow-run-detail-replay-cta"
              onClick={() => {
                setActionError(null);
                setActionSuccess(null);
                setReplayArmed(true);
              }}
            >
              Replay
            </button>
          ) : null}
          {cancelable ? (
            <button
              type="button"
              data-testid="workflow-run-detail-cancel-cta"
              onClick={() => {
                setActionError(null);
                setActionSuccess(null);
                setCancelArmed(true);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

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
