import { createAdminAppFileRoute } from "../file-route";
import { loadAdminBillingLoaderData } from "../lib/operational-loaders";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";

export const Route = createAdminAppFileRoute("/billing")({
  loader: () => loadAdminBillingLoaderData(),
  component: Billing,
  pendingComponent: () => <LoadingState title="Loading billing repair gaps…" />,
});

function Billing() {
  const data = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to view billing repair gaps."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to view billing data."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { gaps } = data;
  const runningGaps = gaps.filter(
    (g) => g.status === "running" || g.status === "scheduled",
  ).length;
  const cancelledGaps = gaps.filter((g) => g.status === "canceled").length;
  const repairedGaps = gaps.filter((g) => g.status === "completed").length;

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Billing</h1>
        <p className="ops-screen-subtitle">
          Billing repair gap registry — read-only view
        </p>
      </div>

      <div className="ops-posture-grid">
        <div
          className={`ops-posture-card${runningGaps > 0 ? " ops-posture-card--alert" : ""}`}
        >
          <span className="ops-posture-metric">{runningGaps}</span>
          <span className="ops-posture-label">Active gaps</span>
        </div>
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{repairedGaps}</span>
          <span className="ops-posture-label">Repaired</span>
        </div>
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{cancelledGaps}</span>
          <span className="ops-posture-label">Cancelled</span>
        </div>
      </div>

      <div className="ops-card">
        <p className="ops-card-title">Repair gaps ({gaps.length})</p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "12px",
            padding: "10px 12px",
            background: "var(--ops-surface-3)",
            border: "1px solid var(--ops-border)",
            borderRadius: "var(--ops-radius)",
          }}
        >
          <span
            style={{ fontSize: "0.875rem", color: "var(--ops-text-secondary)" }}
          >
            ℹ Billing gaps are read-only in the admin app. Replay and cancel
            actions are available only through the repair operations workflow.
          </span>
        </div>
        {gaps.length === 0 ? (
          <EmptyState
            title="No billing repair gaps"
            description="All billing events are in sync."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Gap reason</th>
                  <th>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((gap) => (
                  <tr key={gap.jobId}>
                    <td className="mono">{gap.jobId}</td>
                    <td className="mono">{gap.tenantScopeId}</td>
                    <td>
                      <StatusChip
                        status={gap.status}
                        variant={resolveStatusVariant(gap.status)}
                      />
                    </td>
                    <td>{gap.attempts}</td>
                    <td>{gap.gapReason ?? "—"}</td>
                    <td className="mono">{gap.scheduledAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
