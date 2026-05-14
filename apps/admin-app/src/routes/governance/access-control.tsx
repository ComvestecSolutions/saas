import { createAdminAppFileRoute } from "../../file-route";
import { loadAdminAccessControlLoaderData } from "../../lib/governance-loaders";
import { EmptyState, LoadingState, PermissionDeniedState } from "@comvestec/ui";

export const Route = createAdminAppFileRoute("/governance/access-control")({
  loader: () => loadAdminAccessControlLoaderData(),
  component: AccessControl,
  pendingComponent: () => <LoadingState title="Loading access control…" />,
});

function AccessControl() {
  const data = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access authorization data."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to access authorization data."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { profiles } = data;

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Access Control</h1>
        <p className="ops-screen-subtitle">
          Projection profiles and authorization posture
        </p>
      </div>

      <div className="ops-posture-grid">
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{profiles.length}</span>
          <span className="ops-posture-label">Projection profiles</span>
        </div>
        <div className="ops-posture-card">
          <span className="ops-posture-metric">
            {new Set(profiles.map((p) => p.moduleId)).size}
          </span>
          <span className="ops-posture-label">Modules covered</span>
        </div>
      </div>

      <div className="ops-card">
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--ops-text-secondary)",
            margin: "0 0 12px",
          }}
        >
          ℹ Authorization tuple inspection requires specifying a namespace,
          object, and relation. Use the governance API for targeted tuple
          lookup. This view shows projection profiles registered across all
          modules.
        </p>
      </div>

      <div className="ops-card">
        <p className="ops-card-title">
          Projection profiles ({profiles.length})
        </p>
        {profiles.length === 0 ? (
          <EmptyState
            title="No projection profiles"
            description="No projection profiles are registered."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Module</th>
                  <th>Visible fields</th>
                  <th>Audited fields</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={`${p.moduleId}-${p.profile}`}>
                    <td className="mono">{p.profile}</td>
                    <td className="mono">{p.moduleId}</td>
                    <td>{p.visibleFields.length}</td>
                    <td>{p.auditedFields.length}</td>
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
