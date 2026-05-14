import { Schema } from "effect";
import { createAdminAppFileRoute } from "../../file-route";
import { loadAdminWebhooksApiAccessLoaderData } from "../../lib/operational-loaders";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
  Badge,
} from "@comvestec/ui";

const WebhooksSearchSchema = Schema.Struct({
  scopeId: Schema.optional(Schema.NonEmptyString),
  scope: Schema.optional(Schema.NonEmptyString),
});

export const Route = createAdminAppFileRoute(
  "/integrations/webhooks-api-access",
)({
  validateSearch: (raw) => Schema.validateSync(WebhooksSearchSchema)(raw),
  loaderDeps: ({ search }) => ({
    scopeId: search.scopeId,
    scope: search.scope,
  }),
  loader: ({ deps }) =>
    loadAdminWebhooksApiAccessLoaderData(deps.scope, deps.scopeId),
  component: WebhooksApiAccess,
  pendingComponent: () => (
    <LoadingState title="Loading webhooks and API access…" />
  ),
});

function WebhooksApiAccess() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to view webhooks and API access."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to view integration data."
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
        <h1 className="ops-screen-title">Webhooks & API Access</h1>
        <p className="ops-screen-subtitle">
          Webhook subscriptions and API key registry — enter a scope ID
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
          description="Provide a scope and scope ID above to load webhook and API key data."
        />
      ) : (
        <>
          <div className="ops-posture-grid">
            <div className="ops-posture-card">
              <span className="ops-posture-metric">
                {data.subscriptions.filter((s) => s.status === "active").length}
              </span>
              <span className="ops-posture-label">Active webhooks</span>
            </div>
            <div className="ops-posture-card">
              <span className="ops-posture-metric">
                {data.apiKeys.filter((k) => k.status === "active").length}
              </span>
              <span className="ops-posture-label">Active API keys</span>
            </div>
            <div className="ops-posture-card">
              <span className="ops-posture-metric">
                {data.subscriptions.length}
              </span>
              <span className="ops-posture-label">Total subscriptions</span>
            </div>
          </div>

          <div className="ops-card">
            <p className="ops-card-title">
              Webhook subscriptions ({data.subscriptions.length})
            </p>
            {data.subscriptions.length === 0 ? (
              <EmptyState
                title="No webhook subscriptions"
                description="No webhook endpoints are registered."
              />
            ) : (
              <div className="ops-table-wrapper">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Subscription ID</th>
                      <th>URL</th>
                      <th>Events</th>
                      <th>Status</th>
                      <th>Last delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((s) => (
                      <tr key={s.subscriptionId}>
                        <td className="mono">{s.subscriptionId}</td>
                        <td
                          className="mono ops-redacted"
                          style={{
                            maxWidth: "240px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.url}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "4px",
                              flexWrap: "wrap",
                            }}
                          >
                            {s.events.map((event) => (
                              <Badge key={event} variant="neutral">
                                {event}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td>
                          <StatusChip
                            status={s.status}
                            variant={resolveStatusVariant(s.status)}
                          />
                        </td>
                        <td className="mono">
                          {s.lastDeliveryAt
                            ? s.lastDeliveryAt.slice(0, 10)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="ops-card">
            <p className="ops-card-title">API keys ({data.apiKeys.length})</p>
            {data.apiKeys.length === 0 ? (
              <EmptyState
                title="No API keys"
                description="No API keys are registered."
              />
            ) : (
              <div className="ops-table-wrapper">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Key ID</th>
                      <th>Label</th>
                      <th>Prefix</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Revoked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.apiKeys.map((k) => (
                      <tr key={k.apiKeyId}>
                        <td className="mono ops-redacted">{k.apiKeyId}</td>
                        <td>{k.label}</td>
                        <td className="mono">{k.prefix}</td>
                        <td>
                          <StatusChip
                            status={k.status}
                            variant={resolveStatusVariant(k.status)}
                          />
                        </td>
                        <td className="mono">{k.createdAt.slice(0, 10)}</td>
                        <td className="mono">
                          {k.revokedAt ? k.revokedAt.slice(0, 10) : "—"}
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
