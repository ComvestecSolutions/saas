import { Schema } from "effect";
import { Link } from "@tanstack/react-router";
import { StateScreen, StatusChip } from "@comvestec/ui";
import { platformScope } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { KpiCard, ScreenHeader } from "../../../components/ui";
import type {
  AdminKeycloakUserDetailInput,
  AdminKeycloakUserDetailRouteData,
} from "../../../lib/keycloak-user-detail-route-data";

const knownPlatformScopes = Object.values(platformScope);

const RawSearchSchema = Schema.Struct({
  tenantScope: Schema.optional(Schema.String),
  tenantScopeId: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;

const decodeLoaderInput = (
  userId: string,
  raw: RawSearch,
): AdminKeycloakUserDetailInput | null => {
  if (
    raw.tenantScope === undefined ||
    raw.tenantScopeId === undefined ||
    raw.tenantScope.length === 0 ||
    raw.tenantScopeId.length === 0
  ) {
    return null;
  }
  if (!(knownPlatformScopes as readonly string[]).includes(raw.tenantScope)) {
    return null;
  }
  return {
    userId,
    tenant: {
      scope:
        raw.tenantScope as (typeof platformScope)[keyof typeof platformScope],
      scopeId: raw.tenantScopeId,
    },
  };
};

const formatTimestamp = (value: string | undefined): string =>
  value === undefined ? "Not recorded" : value.slice(0, 16).replace("T", " ");

export const Route = createAdminAppFileRoute("/desk/kc-user/$id")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const input = decodeLoaderInput(params.id, deps.search);
    if (input === null) {
      return {
        kind: "error" as const,
        title: "Keycloak user tenant required",
        description:
          "Provide tenantScope and tenantScopeId search params to load Keycloak user detail.",
      } satisfies AdminKeycloakUserDetailRouteData;
    }
    const { loadAdminKeycloakUserDetailLoaderData } =
      await import("../../../lib/keycloak-user-detail-loader");
    return loadAdminKeycloakUserDetailLoaderData(input);
  },
  component: KeycloakUserDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading Keycloak user detail…" />
  ),
});

function KeycloakUserDetailRoute() {
  const data: AdminKeycloakUserDetailRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view Keycloak user detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access Keycloak user detail."
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
  if (data.kind === "not-found") {
    return (
      <StateScreen
        variant="404"
        title={data.title}
        description={data.description}
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

  const { tenant, user, isFresh } = data;
  const tenantWorkspacePath = `/desk/tenant/${encodeURIComponent(tenant.scopeId)}?scope=${encodeURIComponent(tenant.scope)}`;

  return (
    <section
      data-testid="kc-user-detail-ready"
      data-user-id={user.userId}
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={user.username}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Keycloak user" },
          { label: user.username },
        ]}
        subtitle={
          <>
            User <span className="mono">{user.userId}</span> · realm{" "}
            <span className="mono">{user.realm}</span> · tenant{" "}
            <Link to={tenantWorkspacePath}>
              {tenant.scope + "/" + tenant.scopeId}
            </Link>
          </>
        }
      />

      <div
        data-testid="kc-user-detail-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Account"
          value={user.enabled ? "Enabled" : "Disabled"}
          tone={user.enabled ? "good" : "warn"}
        />
        <KpiCard
          label="Email verification"
          value={user.emailVerified ? "Verified" : "Pending"}
          tone={user.emailVerified ? "good" : "warn"}
        />
        <KpiCard
          label="Snapshot"
          value={isFresh ? "Fresh" : "Cached"}
          tone={isFresh ? "good" : "neutral"}
        />
        <KpiCard
          label="Required actions"
          value={user.requiredActions.length}
          tone={user.requiredActions.length > 0 ? "warn" : "neutral"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Identity</p>
          </div>
          <div className="ops-meta-grid">
            <div>
              <p className="ops-meta-label">Username</p>
              <p className="ops-meta-value ops-meta-value--mono">
                {user.username}
              </p>
            </div>
            <div>
              <p className="ops-meta-label">Email</p>
              <p className="ops-meta-value">{user.email}</p>
            </div>
            <div>
              <p className="ops-meta-label">Display name</p>
              <p className="ops-meta-value">
                {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                  "Not set"}
              </p>
            </div>
            <div>
              <p className="ops-meta-label">User id</p>
              <p className="ops-meta-value ops-meta-value--mono">
                {user.userId}
              </p>
            </div>
            <div>
              <p className="ops-meta-label">Realm</p>
              <p className="ops-meta-value ops-meta-value--mono">
                {user.realm}
              </p>
            </div>
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Lifecycle posture</p>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div>
              <p className="ops-meta-label">Enabled</p>
              <StatusChip tone={user.enabled ? "nominal" : "error"} size="sm">
                {user.enabled ? "Enabled" : "Disabled"}
              </StatusChip>
            </div>
            <div>
              <p className="ops-meta-label">Email verification</p>
              <StatusChip
                tone={user.emailVerified ? "nominal" : "pending"}
                size="sm"
              >
                {user.emailVerified ? "Verified" : "Pending"}
              </StatusChip>
            </div>
            <div>
              <p className="ops-meta-label">Created</p>
              <p className="ops-meta-value">
                {formatTimestamp(user.createdAt)}
              </p>
            </div>
            <div>
              <p className="ops-meta-label">Last login</p>
              <p className="ops-meta-value">
                {formatTimestamp(user.lastLogin)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Required actions
            <span className="ops-card-head__count">
              {user.requiredActions.length}
            </span>
          </p>
        </div>
        {user.requiredActions.length === 0 ? (
          <StateScreen
            variant="empty"
            title="No required actions"
            description="This Keycloak user does not currently require any action at next sign-in."
          />
        ) : (
          <div
            data-testid="kc-user-detail-required-actions"
            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            {user.requiredActions.map((action) => (
              <StatusChip key={action} tone="pending" size="sm">
                {action}
              </StatusChip>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
