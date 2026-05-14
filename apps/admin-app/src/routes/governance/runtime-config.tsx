import { createAdminAppFileRoute } from "../../file-route";
import { loadAdminRuntimeConfigLoaderData } from "../../lib/governance-loaders";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";

export const Route = createAdminAppFileRoute("/governance/runtime-config")({
  loader: () => loadAdminRuntimeConfigLoaderData(),
  component: RuntimeConfig,
  pendingComponent: () => (
    <LoadingState title="Loading runtime configuration…" />
  ),
});

function RuntimeConfig() {
  const data = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access runtime configuration."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to access runtime configuration."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { overrides, proposals } = data;

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Runtime Configuration</h1>
        <p className="ops-screen-subtitle">
          Active overrides and pending proposals
        </p>
      </div>

      <div className="ops-card">
        <p className="ops-card-title">Active overrides ({overrides.length})</p>
        {overrides.length === 0 ? (
          <EmptyState
            title="No active overrides"
            description="All modules are running on default configuration values."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Key</th>
                  <th>Value</th>
                  <th>Scope</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={`${o.moduleId}-${o.key}`}>
                    <td className="mono">{o.moduleId}</td>
                    <td className="mono">{o.key}</td>
                    <td className="mono ops-redacted">
                      {o.value != null ? String(o.value) : "(unset)"}
                    </td>
                    <td>{o.scope}</td>
                    <td className="mono">{o.changedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ops-card">
        <p className="ops-card-title">Pending proposals ({proposals.length})</p>
        {proposals.length === 0 ? (
          <EmptyState
            title="No pending proposals"
            description="There are no staged configuration changes awaiting approval."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Key</th>
                  <th>Proposed value</th>
                  <th>Action</th>
                  <th>Changed</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.proposalId}>
                    <td className="mono">{p.moduleId}</td>
                    <td className="mono">{p.key}</td>
                    <td className="mono ops-redacted">
                      {p.value != null ? String(p.value) : "(unset)"}
                    </td>
                    <td>
                      <StatusChip
                        status={p.action ?? "pending"}
                        variant={resolveStatusVariant(p.action ?? "pending")}
                      />
                    </td>
                    <td className="mono">{p.changedAt?.slice(0, 10) ?? "—"}</td>
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
