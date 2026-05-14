import { createAdminAppFileRoute } from "../file-route";
import { loadAdminOperationsHomeLoaderData } from "../lib/operations-home-loader";
import { EmptyState, PermissionDeniedState, LoadingState } from "@comvestec/ui";
import { adminOperatorCapability } from "@comvestec/contracts";

export const Route = createAdminAppFileRoute("/")({
  loader: () => loadAdminOperationsHomeLoaderData(),
  component: OperationsHome,
  pendingComponent: () => <LoadingState title="Loading operations summary…" />,
});

function OperationsHome() {
  const data = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access the admin operations workspace."
      />
    );
  }

  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="The operator session could not be resolved. Please re-authenticate before continuing."
      />
    );
  }

  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { summary } = data;
  const posture = summary.posture;
  const capabilities = summary.capabilities.capabilities;
  const enabledCapabilities = capabilities.filter((c) => c.allowed);
  const repairCapability = capabilities.find(
    (c) => c.capability === adminOperatorCapability.repairOperations,
  );

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Operations Home</h1>
        <p className="ops-screen-subtitle">
          Operator posture, active queues, and recent platform activity for{" "}
          <span
            style={{ fontFamily: "var(--ops-font-mono)", fontSize: "0.85em" }}
          >
            {summary.capabilities.actorType}
          </span>
        </p>
      </div>

      {/* Posture grid */}
      <section>
        <p className="ops-card-title">Platform posture</p>
        <div className="ops-posture-grid">
          <div
            className={`ops-posture-card${posture.openRepairGaps > 0 ? " accent" : ""}`}
          >
            <p className="ops-posture-label">Open repair gaps</p>
            <p className="ops-posture-value">{posture.openRepairGaps}</p>
          </div>
          <div className="ops-posture-card">
            <p className="ops-posture-label">Open support cases</p>
            <p className="ops-posture-value">{posture.openSupportCases}</p>
          </div>
          <div
            className={`ops-posture-card${posture.pendingBreakGlassIncidents > 0 ? " accent" : ""}`}
          >
            <p className="ops-posture-label">Pending break-glass</p>
            <p className="ops-posture-value">
              {posture.pendingBreakGlassIncidents}
            </p>
          </div>
          <div
            className={`ops-posture-card${posture.pendingRuntimeConfigProposals > 0 ? " accent" : ""}`}
          >
            <p className="ops-posture-label">Pending proposals</p>
            <p className="ops-posture-value">
              {posture.pendingRuntimeConfigProposals}
            </p>
          </div>
          <div className="ops-posture-card">
            <p className="ops-posture-label">Blocked repairs</p>
            <p className="ops-posture-value">{posture.blockedRepairGaps}</p>
          </div>
          <div className="ops-posture-card">
            <p className="ops-posture-label">Active impersonations</p>
            <p className="ops-posture-value">
              {posture.activeImpersonationSessions}
            </p>
          </div>
          <div className="ops-posture-card">
            <p className="ops-posture-label">Pending branding</p>
            <p className="ops-posture-value">
              {posture.pendingBrandingProposals}
            </p>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {summary.alerts.length > 0 && (
        <section>
          <p className="ops-card-title">Active alerts</p>
          <div className="ops-alert-list">
            {summary.alerts.map((alert) => (
              <div key={alert.id} className={`ops-alert ${alert.severity}`}>
                <div className="ops-alert-body">
                  <p className="ops-alert-title">{alert.title}</p>
                  <p className="ops-alert-detail">
                    {alert.detail} · {alert.count} item
                    {alert.count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Enabled capabilities */}
      {enabledCapabilities.length > 0 && (
        <div className="ops-card">
          <p className="ops-card-title">Operator surface</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "8px",
              marginTop: "4px",
            }}
          >
            {enabledCapabilities.map((cap) => (
              <a
                key={cap.capability}
                href={cap.routePath}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  padding: "10px 12px",
                  borderRadius: "var(--ops-radius)",
                  border: "1px solid var(--ops-border-strong)",
                  background: "var(--ops-surface-3)",
                  textDecoration: "none",
                  transition: "border-color 0.12s",
                }}
              >
                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "var(--ops-text)",
                  }}
                >
                  {cap.label}
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontFamily: "var(--ops-font-mono)",
                    color: "var(--ops-text-muted)",
                  }}
                >
                  {cap.routePath}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Repair capability hint */}
      {repairCapability?.allowed !== true && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--ops-radius)",
            border: "1px solid var(--ops-border)",
            background: "var(--ops-surface-2)",
            fontSize: "0.85rem",
            color: "var(--ops-text-muted)",
          }}
        >
          {repairCapability?.reason ??
            "Repair Operations controls require a platform-operator session."}
        </div>
      )}

      {/* Recent activity */}
      <div className="ops-card">
        <p className="ops-card-title">Recent activity</p>
        {summary.recentActivity.items.length === 0 ? (
          <EmptyState
            title="No recent activity"
            description="No recent audit events are available for this session."
          />
        ) : (
          <div className="ops-activity-list">
            {summary.recentActivity.items.map((event) => (
              <div key={event.eventId} className="ops-activity-item">
                <div>
                  <span className="ops-activity-module">{event.moduleId}</span>
                  <span className="ops-activity-action">
                    {" · "}
                    {event.action}
                    {event.target !== undefined ? ` · ${event.target}` : ""}
                  </span>
                </div>
                <span className="ops-activity-time">
                  {event.timestamp.slice(0, 19).replace("T", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
