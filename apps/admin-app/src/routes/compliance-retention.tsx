import { Schema } from "effect";
import { createAdminAppFileRoute } from "../file-route";
import { loadAdminComplianceRetentionLoaderData } from "../lib/operational-loaders";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
  Badge,
} from "@comvestec/ui";

const ComplianceSearchSchema = Schema.Struct({
  scopeId: Schema.optional(Schema.NonEmptyString),
  scope: Schema.optional(Schema.NonEmptyString),
});

export const Route = createAdminAppFileRoute("/compliance-retention")({
  validateSearch: (raw) => Schema.validateSync(ComplianceSearchSchema)(raw),
  loaderDeps: ({ search }) => ({
    scopeId: search.scopeId,
    scope: search.scope,
  }),
  loader: ({ deps }) =>
    loadAdminComplianceRetentionLoaderData(deps.scope, deps.scopeId),
  component: ComplianceRetention,
  pendingComponent: () => (
    <LoadingState title="Loading compliance and retention…" />
  ),
});

function ComplianceRetention() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access compliance and retention."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to access compliance and retention."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Compliance & Retention</h1>
        <p className="ops-screen-subtitle">
          Retention policies and legal holds — enter a scope ID to inspect
        </p>
      </div>

      <div className="ops-card">
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <label
            className="ops-field"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              minWidth: "200px",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ops-text-muted)",
              }}
            >
              Scope
            </span>
            <select
              className="ops-field-input"
              value={search.scope ?? "organization"}
              onChange={(e) =>
                navigate({ search: { ...search, scope: e.target.value } })
              }
            >
              {["organization", "enterprise", "individual"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label
            className="ops-field"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              flex: "1 1 240px",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ops-text-muted)",
              }}
            >
              Scope ID
            </span>
            <input
              className="ops-field-input"
              type="text"
              placeholder="Enter scope ID…"
              defaultValue={search.scopeId ?? ""}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== (search.scopeId ?? "")) {
                  navigate({
                    search: { ...search, scopeId: value || undefined },
                  });
                }
              }}
            />
          </label>
        </div>
      </div>

      {data.kind === "no-scope" ? (
        <EmptyState
          title="Enter a scope ID"
          description="Provide a scope and scope ID above to load retention data."
        />
      ) : (
        <>
          <div className="ops-posture-grid">
            <div className="ops-posture-card">
              <span className="ops-posture-metric">{data.policies.length}</span>
              <span className="ops-posture-label">Retention policies</span>
            </div>
            <div
              className={`ops-posture-card${data.holds.filter((h) => h.legalHoldActive).length > 0 ? " ops-posture-card--alert" : ""}`}
            >
              <span className="ops-posture-metric">
                {data.holds.filter((h) => h.legalHoldActive).length}
              </span>
              <span className="ops-posture-label">Active legal holds</span>
            </div>
          </div>

          <div className="ops-card">
            <p className="ops-card-title">
              Retention policies ({data.policies.length})
            </p>
            {data.policies.length === 0 ? (
              <EmptyState
                title="No retention policies"
                description="No data retention policies are configured."
              />
            ) : (
              <div className="ops-table-wrapper">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Policy ID</th>
                      <th>Data type</th>
                      <th>Retention (days)</th>
                      <th>Legal hold active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.policies.map((p) => (
                      <tr key={p.policyId}>
                        <td className="mono">{p.policyId}</td>
                        <td>
                          <Badge variant="neutral">{p.dataType}</Badge>
                        </td>
                        <td>{p.retentionDays}</td>
                        <td>
                          <Badge
                            variant={p.legalHoldActive ? "pending" : "neutral"}
                          >
                            {p.legalHoldActive ? "yes" : "no"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="ops-card">
            <p className="ops-card-title">Legal holds ({data.holds.length})</p>
            {data.holds.length === 0 ? (
              <EmptyState
                title="No legal holds"
                description="No active legal holds are in effect."
              />
            ) : (
              <div className="ops-table-wrapper">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Hold ID</th>
                      <th>Data type</th>
                      <th>Target</th>
                      <th>Status</th>
                      <th>Placed</th>
                      <th>Released</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.holds.map((h) => (
                      <tr key={h.legalHoldId}>
                        <td className="mono">{h.legalHoldId}</td>
                        <td>
                          <Badge variant="neutral">{h.dataType}</Badge>
                        </td>
                        <td className="mono ops-redacted">{h.targetId}</td>
                        <td>
                          <StatusChip
                            status={h.status}
                            variant={resolveStatusVariant(h.status)}
                          />
                        </td>
                        <td className="mono">{h.placedAt.slice(0, 10)}</td>
                        <td className="mono">
                          {h.releasedAt ? h.releasedAt.slice(0, 10) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
