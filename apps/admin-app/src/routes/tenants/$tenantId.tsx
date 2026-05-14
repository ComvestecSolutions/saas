import { createAdminAppFileRoute } from "../../file-route";
import { loadAdminTenantWorkspaceLoaderData } from "../../lib/tenant-workspace-loader";
import {
  EmptyState,
  PermissionDeniedState,
  LoadingState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";

export const Route = createAdminAppFileRoute("/tenants/$tenantId")({
  loader: ({ params }) => loadAdminTenantWorkspaceLoaderData(params.tenantId),
  component: TenantWorkspace,
  pendingComponent: () => <LoadingState title="Loading tenant workspace…" />,
});

function TenantWorkspace() {
  const data = Route.useLoaderData();
  const { tenantId } = Route.useParams();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access the tenant workspace."
      />
    );
  }

  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate before accessing tenant workspace."
      />
    );
  }

  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { workspace } = data;
  const tenant = workspace.tenant;
  const onboardingSteps = workspace.onboarding.run?.steps ?? [];

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Tenant Workspace</h1>
        <p className="ops-screen-subtitle">
          <span style={{ fontFamily: "var(--ops-font-mono)" }}>{tenantId}</span>
          {" · "}
          {tenant.scope}
        </p>
      </div>

      {/* Tenant overview */}
      <div className="ops-card">
        <p className="ops-card-title">Tenant context</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            { label: "Scope ID", value: tenant.scopeId, mono: true },
            { label: "Scope", value: tenant.scope, mono: false },
          ].map(({ label, value, mono }) => (
            <div key={label}>
              <p
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ops-text-muted)",
                  margin: "0 0 4px",
                }}
              >
                {label}
              </p>
              <p
                style={{
                  fontFamily: mono ? "var(--ops-font-mono)" : "inherit",
                  fontSize: "0.85rem",
                  color: "var(--ops-text)",
                  margin: 0,
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Onboarding status */}
      <div className="ops-card">
        <p className="ops-card-title">Onboarding review</p>
        {workspace.onboarding.run == null ? (
          <EmptyState title="No onboarding run found" />
        ) : (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {onboardingSteps.map((step) => (
              <div
                key={step.stepId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 10px",
                  border: "1px solid var(--ops-border)",
                  borderRadius: "var(--ops-radius)",
                  background: "var(--ops-surface-3)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--ops-text-secondary)",
                  }}
                >
                  {step.label}
                </span>
                <StatusChip
                  status={step.status}
                  variant={resolveStatusVariant(step.status)}
                />
              </div>
            ))}
            {onboardingSteps.length === 0 && (
              <EmptyState title="No onboarding steps found" />
            )}
          </div>
        )}
      </div>

      {/* Memberships */}
      <div className="ops-card">
        <p className="ops-card-title">
          Memberships ({workspace.memberships.length})
        </p>
        {workspace.memberships.length === 0 ? (
          <EmptyState
            title="No members"
            description="This tenant has no current memberships."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Relations</th>
                </tr>
              </thead>
              <tbody>
                {workspace.memberships.map((m) => (
                  <tr key={m.subject}>
                    <td className="mono ops-redacted">{m.subject}</td>
                    <td>{m.relations.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invitations */}
      <div className="ops-card">
        <p className="ops-card-title">
          Pending invitations ({workspace.invitations.length})
        </p>
        {workspace.invitations.length === 0 ? (
          <EmptyState title="No pending invitations" />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Recipient email</th>
                  <th>Relation</th>
                  <th>Status</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {workspace.invitations.map((inv) => (
                  <tr key={inv.invitationId}>
                    <td className="ops-redacted">{inv.recipientEmail}</td>
                    <td>{inv.relation}</td>
                    <td>
                      <StatusChip
                        status={inv.status}
                        variant={resolveStatusVariant(inv.status)}
                      />
                    </td>
                    <td className="mono">{inv.expiresAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent audit */}
      <div className="ops-card">
        <p className="ops-card-title">Recent audit activity</p>
        {workspace.audit.items.length === 0 ? (
          <EmptyState title="No recent audit events" />
        ) : (
          <div className="ops-activity-list">
            {workspace.audit.items.map((event) => (
              <div key={event.eventId} className="ops-activity-item">
                <div>
                  <span className="ops-activity-module">{event.moduleId}</span>
                  <span className="ops-activity-action">
                    {" · "}
                    {event.action}
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
