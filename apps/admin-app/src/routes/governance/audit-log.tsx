import { createAdminAppFileRoute } from "../../file-route";
import { loadAdminAuditLogLoaderData } from "../../lib/governance-loaders";
import { EmptyState, LoadingState, PermissionDeniedState } from "@comvestec/ui";
import { platformModuleId, type PlatformModuleId } from "@comvestec/contracts";
import { Schema } from "effect";

const platformModuleIds = Object.values(platformModuleId) as PlatformModuleId[];

const AuditLogSearchSchema = Schema.Struct({
  module: Schema.optional(Schema.NonEmptyString),
});

export const Route = createAdminAppFileRoute("/governance/audit-log")({
  validateSearch: (raw) => Schema.validateSync(AuditLogSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ module: search.module }),
  loader: ({ deps }) =>
    loadAdminAuditLogLoaderData(
      deps.module != null &&
        platformModuleIds.includes(deps.module as PlatformModuleId)
        ? (deps.module as PlatformModuleId)
        : undefined,
    ),
  component: AuditLog,
  pendingComponent: () => <LoadingState title="Loading audit log…" />,
});

function AuditLog() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access the audit log."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to access the audit log."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { events } = data;
  const selectedModule = search.module ?? platformModuleId.auditLog;

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Audit Log</h1>
        <p className="ops-screen-subtitle">
          {events.length} events for{" "}
          <span style={{ fontFamily: "var(--ops-font-mono)" }}>
            {selectedModule}
          </span>
        </p>
      </div>

      <div className="ops-card">
        <label
          className="ops-field"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            maxWidth: "320px",
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
            Module
          </span>
          <select
            className="ops-field-input"
            value={selectedModule}
            onChange={(e) =>
              navigate({
                search: { module: e.target.value as PlatformModuleId },
              })
            }
          >
            {platformModuleIds.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ops-card">
        <p className="ops-card-title">Events ({events.length})</p>
        {events.length === 0 ? (
          <EmptyState
            title="No events"
            description={`No audit events found for module "${selectedModule}".`}
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.eventId}>
                    <td className="mono">
                      {event.timestamp.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="mono">{event.moduleId}</td>
                    <td className="mono">{event.action}</td>
                    <td className="mono ops-redacted">{event.actorId}</td>
                    <td className="mono ops-redacted">{event.target}</td>
                    <td style={{ color: "var(--ops-text-secondary)" }}>
                      {event.reason ?? "—"}
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
