import { createAdminAppFileRoute } from "../file-route";
import { Route as RootRoute } from "./__root";
import { EmptyState, LoadingState } from "@comvestec/ui";
import { ScreenHeader, KpiCard, ShieldIcon } from "../components/ui";

export const Route = createAdminAppFileRoute("/profile")({
  component: AdminProfile,
  pendingComponent: () => <LoadingState title="Loading operator profile…" />,
});

function AdminProfile() {
  const shellData = RootRoute.useLoaderData();

  if (shellData.kind !== "ready") {
    return null;
  }

  const { profile } = shellData;
  const allowedCapabilities = profile.capabilities.filter(
    (capability) => capability.allowed,
  );
  const constrainedCapabilities = profile.capabilities.filter(
    (capability) => !capability.allowed,
  );

  return (
    <div className="ops-screen">
      <ScreenHeader
        icon={<ShieldIcon />}
        title="My profile"
        breadcrumbs={[{ label: "Operations" }, { label: "My profile" }]}
        subtitle="Current operator identity, effective role, and backend-derived capability posture."
      />

      <div className="ops-bento">
        <KpiCard
          label="Role"
          value={profile.identity.actorType}
          tone="accent"
        />
        <KpiCard
          label="Enabled"
          value={profile.identity.enabled ? "Yes" : "No"}
          tone={profile.identity.enabled ? "good" : "warn"}
        />
        <KpiCard
          label="Allowed capabilities"
          value={allowedCapabilities.length}
          tone={allowedCapabilities.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Constrained capabilities"
          value={constrainedCapabilities.length}
          tone={constrainedCapabilities.length > 0 ? "warn" : "neutral"}
        />
      </div>

      <div className="ops-summary-grid">
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Identity</p>
          </div>
          <div className="ops-meta-grid">
            {[
              {
                label: "Display name",
                value: profile.identity.displayName,
                mono: false,
              },
              { label: "Email", value: profile.identity.email, mono: false },
              {
                label: "Username",
                value: profile.identity.username,
                mono: true,
              },
              {
                label: "Actor ID",
                value: profile.identity.actorId,
                mono: true,
              },
              { label: "Session ID", value: profile.sessionId, mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <p className="ops-meta-label">{label}</p>
                <p
                  className={`ops-meta-value${mono ? " ops-meta-value--mono" : ""}`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Role & session posture</p>
          </div>
          <div className="ops-meta-grid">
            {[
              {
                label: "Actor type",
                value: profile.identity.actorType,
                mono: false,
              },
              {
                label: "Identity enabled",
                value: profile.identity.enabled ? "Enabled" : "Disabled",
                mono: false,
              },
              {
                label: "Visible capabilities",
                value: String(
                  profile.capabilities.filter(
                    (capability) => capability.visible,
                  ).length,
                ),
                mono: false,
              },
              {
                label: "Allowed capabilities",
                value: String(allowedCapabilities.length),
                mono: false,
              },
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <p className="ops-meta-label">{label}</p>
                <p
                  className={`ops-meta-value${mono ? " ops-meta-value--mono" : ""}`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Effective capabilities
            <span className="ops-card-head__count">
              {profile.capabilities.length}
            </span>
          </p>
        </div>
        {profile.capabilities.length === 0 ? (
          <EmptyState
            title="No capabilities recorded"
            description="This operator session does not currently expose any admin capabilities."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Route</th>
                  <th>Visible</th>
                  <th>Allowed</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {profile.capabilities.map((capability) => (
                  <tr key={capability.capability}>
                    <td>{capability.label}</td>
                    <td className="mono">{capability.routePath}</td>
                    <td>{capability.visible ? "Yes" : "No"}</td>
                    <td>{capability.allowed ? "Yes" : "No"}</td>
                    <td>{capability.reason ?? "—"}</td>
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
