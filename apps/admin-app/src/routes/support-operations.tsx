import { createAdminAppFileRoute } from "../file-route";
import { loadAdminSupportOperationsLoaderData } from "../lib/operational-loaders";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
  Badge,
} from "@comvestec/ui";

export const Route = createAdminAppFileRoute("/support-operations")({
  loader: () => loadAdminSupportOperationsLoaderData(),
  component: SupportOperations,
  pendingComponent: () => <LoadingState title="Loading support operations…" />,
});

function SupportOperations() {
  const data = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access support operations."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to access support operations."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { cases, incidents, impersonationSessions } = data;
  const openCases = cases.filter(
    (c) => c.status === "open" || c.status === "escalated",
  ).length;
  const pendingIncidents = incidents.filter(
    (i) => i.status === "pending-review",
  ).length;
  const activeSessions = impersonationSessions.filter(
    (s) => s.status === "active",
  ).length;

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Support Operations</h1>
        <p className="ops-screen-subtitle">
          Cases, break-glass incidents, and impersonation sessions
        </p>
      </div>

      <div className="ops-posture-grid">
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{openCases}</span>
          <span className="ops-posture-label">Open cases</span>
        </div>
        <div className="ops-posture-card ops-posture-card--alert">
          <span className="ops-posture-metric">{pendingIncidents}</span>
          <span className="ops-posture-label">Pending break-glass</span>
        </div>
        <div className="ops-posture-card ops-posture-card--alert">
          <span className="ops-posture-metric">{activeSessions}</span>
          <span className="ops-posture-label">Active impersonation</span>
        </div>
      </div>

      {/* Support cases */}
      <div className="ops-card">
        <p className="ops-card-title">Support cases ({cases.length})</p>
        {cases.length === 0 ? (
          <EmptyState
            title="No support cases"
            description="No active support cases."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.caseId}>
                    <td className="mono">{c.caseId}</td>
                    <td>{c.summary}</td>
                    <td>
                      <StatusChip
                        status={c.status}
                        variant={resolveStatusVariant(c.status)}
                      />
                    </td>
                    <td>
                      <Badge
                        variant={c.priority === "high" ? "pending" : "neutral"}
                      >
                        {c.priority}
                      </Badge>
                    </td>
                    <td className="mono">{c.startedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Break-glass incidents */}
      <div className="ops-card">
        <p className="ops-card-title">
          Break-glass incidents ({incidents.length})
        </p>
        {incidents.length === 0 ? (
          <EmptyState
            title="No break-glass incidents"
            description="No break-glass access has been recorded."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Status</th>
                  <th>Approved by</th>
                  <th>Reason</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.caseId}>
                    <td className="mono">{i.caseId}</td>
                    <td>
                      <StatusChip
                        status={i.status}
                        variant={resolveStatusVariant(i.status)}
                      />
                    </td>
                    <td className="mono ops-redacted">{i.approvedBy}</td>
                    <td>{i.reason}</td>
                    <td className="mono">
                      {i.expiresAt.slice(0, 19).replace("T", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Impersonation sessions */}
      <div className="ops-card">
        <p className="ops-card-title">
          Impersonation sessions ({impersonationSessions.length})
        </p>
        {impersonationSessions.length === 0 ? (
          <EmptyState
            title="No impersonation sessions"
            description="No operator impersonation sessions are recorded."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Status</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {impersonationSessions.map((s) => (
                  <tr key={s.caseId}>
                    <td className="mono">{s.caseId}</td>
                    <td>
                      <StatusChip
                        status={s.status}
                        variant={resolveStatusVariant(s.status)}
                      />
                    </td>
                    <td className="mono">
                      {s.startedAt.slice(0, 19).replace("T", " ")}
                    </td>
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
