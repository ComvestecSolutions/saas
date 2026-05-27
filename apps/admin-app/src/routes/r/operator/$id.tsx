import { StateScreen, StatusChip } from "@comvestec/ui";
import { actorType } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { KpiCard, ScreenHeader } from "../../../components/ui";
import type { AdminGovernanceAccessV2RouteData } from "../../../lib/governance-access-route-data";

const detailCardStyle = {
  display: "grid",
  gap: 6,
  padding: 8,
  borderRadius: 12,
  border: "1px solid var(--ops-border, rgba(255,255,255,0.12))",
  background:
    "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.03)) 88%, transparent)",
} as const;

const secondaryTextStyle = {
  color: "var(--ops-text-secondary, rgba(255,255,255,0.7))",
} as const;

const operatorRoleLabel = {
  [actorType.platformOperator]: "Platform operator",
  [actorType.supportOperator]: "Support operator",
} as const;

export const Route = createAdminAppFileRoute("/r/operator/$id")({
  loader: async () => {
    const { loadAdminGovernanceAccessV2LoaderData } =
      await import("../../../lib/governance-access-loader");

    return loadAdminGovernanceAccessV2LoaderData({});
  },
  component: OperatorDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading operator detail…" />
  ),
});

function OperatorDetailRoute() {
  const data: AdminGovernanceAccessV2RouteData = Route.useLoaderData();
  const { id } = Route.useParams();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view operator identity detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access operator identity detail."
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

  const currentOperator = data.memberships.currentOperator;
  const isCurrentOperator = currentOperator.identity.actorId === id;
  const canInspectDirectory =
    currentOperator.identity.actorType === actorType.platformOperator;

  if (!isCurrentOperator && !canInspectDirectory) {
    return (
      <StateScreen
        variant="denied"
        title="Access denied"
        description="Only platform operators may inspect other admin operators. Support operators can review only their own live profile."
      />
    );
  }

  const operator = isCurrentOperator
    ? currentOperator.identity
    : data.memberships.operators.find((candidate) => candidate.actorId === id);

  if (operator === undefined) {
    return (
      <StateScreen
        variant="404"
        title="Operator not found"
        description="The requested admin operator could not be found in the current operator directory snapshot."
      />
    );
  }

  const allowedCapabilities = currentOperator.capabilities.filter(
    (capability) => capability.allowed && capability.visible,
  );
  const sourceLabel = isCurrentOperator
    ? "Current session"
    : "Directory snapshot";

  return (
    <section
      data-testid="admin-operator-detail-ready"
      data-operator-id={operator.actorId}
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={operator.displayName}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Access control", href: "/r/access" },
          { label: operator.displayName },
        ]}
        subtitle={
          <>
            Role <span className="mono">{operator.actorType}</span> · actor{" "}
            <span className="mono">{operator.actorId}</span> · source{" "}
            <span className="mono">{sourceLabel}</span>
          </>
        }
      />

      <div
        data-testid="admin-operator-detail-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Role"
          value={operatorRoleLabel[operator.actorType]}
          tone="neutral"
        />
        <KpiCard
          label="Status"
          value={operator.enabled ? "Enabled" : "Disabled"}
          tone={operator.enabled ? "good" : "warn"}
        />
        <KpiCard
          label="Source"
          value={sourceLabel}
          tone={isCurrentOperator ? "accent" : "neutral"}
        />
        <KpiCard
          label={isCurrentOperator ? "Allowed capabilities" : "Capability view"}
          value={
            isCurrentOperator ? allowedCapabilities.length : "Directory only"
          }
          tone={
            isCurrentOperator && allowedCapabilities.length > 0
              ? "good"
              : "neutral"
          }
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <article style={detailCardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 6,
              alignItems: "center",
            }}
          >
            <strong>Identity</strong>
            <StatusChip tone={operator.enabled ? "nominal" : "error"} size="sm">
              {operator.enabled ? "Enabled" : "Disabled"}
            </StatusChip>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {[
              { label: "Display name", value: operator.displayName },
              { label: "Email", value: operator.email, mono: true },
              { label: "Username", value: operator.username, mono: true },
              { label: "Actor id", value: operator.actorId, mono: true },
              {
                label: "Operator role",
                value: operatorRoleLabel[operator.actorType],
              },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{ display: "grid", gap: 2 }}>
                <span style={secondaryTextStyle}>{label}</span>
                <span className={mono ? "mono" : undefined}>{value}</span>
              </div>
            ))}
          </div>
        </article>

        <article style={detailCardStyle}>
          <strong>Posture</strong>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={secondaryTextStyle}>Directory access</span>
              <span>
                {canInspectDirectory
                  ? "This session can inspect the full admin operator directory."
                  : "This session can inspect only the current operator profile."}
              </span>
            </div>

            <div style={{ display: "grid", gap: 2 }}>
              <span style={secondaryTextStyle}>Detail source</span>
              <span>{sourceLabel}</span>
            </div>

            {isCurrentOperator ? (
              <div style={{ display: "grid", gap: 2 }}>
                <span style={secondaryTextStyle}>Session id</span>
                <span className="mono">{currentOperator.sessionId}</span>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 2 }}>
                <span style={secondaryTextStyle}>Live capability snapshot</span>
                <span>
                  Only the active current operator profile carries a
                  session-bound capability projection today.
                </span>
              </div>
            )}
          </div>
        </article>
      </div>

      {isCurrentOperator ? (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Live capability envelope
              <span className="ops-card-head__count">
                {currentOperator.capabilities.length}
              </span>
            </p>
          </div>

          {currentOperator.capabilities.length === 0 ? (
            <StateScreen
              variant="empty"
              title="No capabilities"
              description="This operator profile does not currently expose any route capabilities."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table
                className="ops-table"
                data-testid="admin-operator-capabilities-table"
              >
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Route</th>
                    <th>Visible</th>
                    <th>Allowed</th>
                  </tr>
                </thead>
                <tbody>
                  {currentOperator.capabilities.map((capability) => (
                    <tr
                      key={capability.capability}
                      data-testid="admin-operator-capability-row"
                    >
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span>{capability.label}</span>
                          <span style={secondaryTextStyle}>
                            {capability.reason ?? capability.capability}
                          </span>
                        </div>
                      </td>
                      <td>
                        <a href={capability.routePath} className="mono">
                          {capability.routePath}
                        </a>
                      </td>
                      <td>
                        <StatusChip
                          tone={capability.visible ? "nominal" : "drift"}
                          size="sm"
                        >
                          {capability.visible ? "Visible" : "Hidden"}
                        </StatusChip>
                      </td>
                      <td>
                        <StatusChip
                          tone={capability.allowed ? "nominal" : "error"}
                          size="sm"
                        >
                          {capability.allowed ? "Allowed" : "Denied"}
                        </StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <StateScreen
          variant="empty"
          title="Capability posture unavailable"
          description="Directory snapshots expose stable operator identity only. Use the live current-operator profile to inspect session-bound route capabilities."
        />
      )}
    </section>
  );
}
