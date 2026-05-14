import { createAdminAppFileRoute } from "../../file-route";
import { loadAdminFeatureFlagsLoaderData } from "../../lib/governance-loaders";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  Badge,
} from "@comvestec/ui";

export const Route = createAdminAppFileRoute("/governance/feature-flags")({
  loader: () => loadAdminFeatureFlagsLoaderData(),
  component: FeatureFlags,
  pendingComponent: () => <LoadingState title="Loading feature flags…" />,
});

function FeatureFlags() {
  const data = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access feature flags."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to access feature flags."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { flags } = data;

  const enabledCount = flags.filter((f) => f.effectiveState).length;
  const disabledCount = flags.length - enabledCount;

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Feature Flags</h1>
        <p className="ops-screen-subtitle">
          {flags.length} flags · {enabledCount} enabled · {disabledCount}{" "}
          disabled
        </p>
      </div>

      <div className="ops-posture-grid">
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{enabledCount}</span>
          <span className="ops-posture-label">Enabled</span>
        </div>
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{disabledCount}</span>
          <span className="ops-posture-label">Disabled</span>
        </div>
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{flags.length}</span>
          <span className="ops-posture-label">Total flags</span>
        </div>
      </div>

      <div className="ops-card">
        <p className="ops-card-title">All flags</p>
        {flags.length === 0 ? (
          <EmptyState
            title="No feature flags"
            description="No feature flags are registered for this environment."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Owner</th>
                  <th>State</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={flag.key}>
                    <td className="mono">{flag.key}</td>
                    <td className="mono">{flag.owner}</td>
                    <td>
                      <Badge
                        variant={flag.effectiveState ? "active" : "neutral"}
                      >
                        {flag.effectiveState ? "enabled" : "disabled"}
                      </Badge>
                    </td>
                    <td
                      style={{
                        maxWidth: "320px",
                        color: "var(--ops-text-secondary)",
                      }}
                    >
                      {flag.description}
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
