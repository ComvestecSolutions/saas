import { Schema } from "effect";
import { createAdminAppFileRoute } from "../file-route";
import { loadAdminBrandingLoaderData } from "../lib/operational-loaders";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";

const BrandingSearchSchema = Schema.Struct({
  scopeId: Schema.optional(Schema.NonEmptyString),
  scope: Schema.optional(Schema.NonEmptyString),
});

export const Route = createAdminAppFileRoute("/branding")({
  validateSearch: (raw) => Schema.validateSync(BrandingSearchSchema)(raw),
  loaderDeps: ({ search }) => ({
    scopeId: search.scopeId,
    scope: search.scope,
  }),
  loader: ({ deps }) => loadAdminBrandingLoaderData(deps.scope, deps.scopeId),
  component: Branding,
  pendingComponent: () => <LoadingState title="Loading tenant branding…" />,
});

function Branding() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to view tenant branding."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to view tenant branding."
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
        <h1 className="ops-screen-title">Branding</h1>
        <p className="ops-screen-subtitle">
          Support-safe branding view — enter a scope ID to inspect
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
                navigate({
                  search: { ...search, scope: e.target.value },
                })
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
          description="Provide a scope and scope ID above to load the tenant's branding view."
        />
      ) : (
        <div className="ops-card">
          <p className="ops-card-title">Branding details</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            {[
              {
                label: "Company name",
                value: data.branding.companyName,
                mono: false,
              },
              { label: "Scope", value: data.branding.scope, mono: true },
              { label: "Scope ID", value: data.branding.scopeId, mono: true },
              {
                label: "Effective scope",
                value: data.branding.effectiveScope,
                mono: false,
              },
              {
                label: "Changed",
                value: data.branding.changedAt?.slice(0, 10) ?? "—",
                mono: true,
              },
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
                    fontSize: "0.875rem",
                    color: "var(--ops-text)",
                    margin: 0,
                  }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "16px" }}>
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
              Custom domain status
            </p>
            <StatusChip
              status={data.branding.customDomainStatus}
              variant={resolveStatusVariant(data.branding.customDomainStatus)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
