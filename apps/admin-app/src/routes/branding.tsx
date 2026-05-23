import { Link } from "@tanstack/react-router";
import { platformScope } from "@comvestec/contracts";
import { Schema } from "effect";
import { createAdminAppFileRoute } from "../file-route";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../components/admin-session-required-state";
import { AdminTenantTargetForm } from "../components/admin-tenant-target-form";
import {
  buildAdminTenantTargetSearch,
  buildAdminTenantWorkspacePath,
} from "../lib/admin-tenant-target";
import { ScreenHeader, ExternalIcon } from "../components/ui";

const BrandingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M2 12l4-4 3 3 2-2 3 4H2z"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle
      cx="11.5"
      cy="4.5"
      r="1.5"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);

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
  loader: ({ deps }) =>
    import("../lib/operational-loaders").then(
      ({ loadAdminBrandingLoaderData }) =>
        loadAdminBrandingLoaderData(deps.scope, deps.scopeId),
    ),
  component: Branding,
  pendingComponent: () => <LoadingState title="Loading tenant branding…" />,
});

function Branding() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view tenant branding."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to view tenant branding."
        stale
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
      <ScreenHeader
        icon={<BrandingIcon />}
        title="Branding & Domains"
        breadcrumbs={[{ label: "Operations" }, { label: "Branding" }]}
        subtitle="Search-first branding and domain operations for a selected tenant target."
      />

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Choose tenant target</p>
        </div>
        <AdminTenantTargetForm
          initialScope={search.scope}
          initialScopeId={search.scopeId}
          allowedScopes={[platformScope.organization, platformScope.enterprise]}
          submitLabel="Load branding view"
          submitVariant="secondary"
          onSubmit={(target) =>
            navigate({ search: buildAdminTenantTargetSearch(target) })
          }
        />
      </div>

      {data.kind === "no-scope" ? (
        <EmptyState
          title="Choose a tenant target"
          description="Pick a named tenant target above, or open the exact internal lookup only when you truly need it."
        />
      ) : (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              {data.branding.companyName}
              <span className="ops-card-head__count">
                {data.branding.effectiveScope}
              </span>
            </p>
            <div className="ops-card-head__actions">
              <Link
                className="ops-btn ops-btn--xs"
                to={buildAdminTenantWorkspacePath({
                  scope: data.branding.scope,
                  scopeId: data.branding.scopeId,
                })}
              >
                <ExternalIcon size={11} /> Open workspace
              </Link>
            </div>
          </div>

          <div className="ops-meta-grid">
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
                <p className="ops-meta-label">{label}</p>
                <p
                  style={{
                    fontFamily: mono ? "var(--ops-font-mono)" : "inherit",
                    fontSize: "0.86rem",
                    color: "var(--ops-text)",
                    margin: 0,
                  }}
                >
                  {value}
                </p>
              </div>
            ))}
            <div>
              <p className="ops-meta-label">Custom domain</p>
              <StatusChip
                status={data.branding.customDomainStatus}
                variant={resolveStatusVariant(data.branding.customDomainStatus)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
