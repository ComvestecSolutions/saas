import { Schema } from "effect";
import { Link } from "@tanstack/react-router";
import { StateScreen, StatusChip } from "@comvestec/ui";
import { platformScope } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { KpiCard, ScreenHeader } from "../../../components/ui";
import type {
  AdminKeycloakRoleDetailInput,
  AdminKeycloakRoleDetailRouteData,
} from "../../../lib/keycloak-role-detail-route-data";

const knownPlatformScopes = Object.values(platformScope);

const RawSearchSchema = Schema.Struct({
  tenantScope: Schema.optional(Schema.String),
  tenantScopeId: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;

const decodeLoaderInput = (
  roleId: string,
  raw: RawSearch,
): AdminKeycloakRoleDetailInput | null => {
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
    roleId,
    tenant: {
      scope:
        raw.tenantScope as (typeof platformScope)[keyof typeof platformScope],
      scopeId: raw.tenantScopeId,
    },
  };
};

const buildTenantWorkspacePath = (
  tenantScope: string,
  tenantScopeId: string,
): string =>
  `/r/tenant/${encodeURIComponent(tenantScopeId)}?scope=${encodeURIComponent(tenantScope)}`;

const buildKeycloakUserPath = (
  userId: string,
  tenantScope: string,
  tenantScopeId: string,
): string =>
  `/r/kc-user/${encodeURIComponent(userId)}?tenantScope=${encodeURIComponent(tenantScope)}&tenantScopeId=${encodeURIComponent(tenantScopeId)}`;

export const Route = createAdminAppFileRoute("/r/kc-role/$id")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const input = decodeLoaderInput(params.id, deps.search);
    if (input === null) {
      return {
        kind: "error" as const,
        title: "Keycloak role tenant required",
        description:
          "Provide tenantScope and tenantScopeId search params to load Keycloak role detail.",
      } satisfies AdminKeycloakRoleDetailRouteData;
    }

    const { loadAdminKeycloakRoleDetailLoaderData } =
      await import("../../../lib/keycloak-role-detail-loader");

    return loadAdminKeycloakRoleDetailLoaderData(input);
  },
  component: KeycloakRoleDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading Keycloak role detail…" />
  ),
});

function KeycloakRoleDetailRoute() {
  const data: AdminKeycloakRoleDetailRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view Keycloak role detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access Keycloak role detail."
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

  const { tenant, role, isFresh } = data;
  const tenantWorkspacePath = buildTenantWorkspacePath(
    tenant.scope,
    tenant.scopeId,
  );

  return (
    <section
      data-testid="kc-role-detail-ready"
      data-role-id={role.roleId}
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={role.roleName}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Keycloak role" },
          { label: role.roleName },
        ]}
        subtitle={
          <>
            Role <span className="mono">{role.roleId}</span> · realm{" "}
            <span className="mono">{role.realm}</span> · tenant{" "}
            <Link to={tenantWorkspacePath}>
              {tenant.scope + "/" + tenant.scopeId}
            </Link>
          </>
        }
      />

      <div
        data-testid="kc-role-detail-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Composite role"
          value={role.composite ? "Yes" : "No"}
          tone={role.composite ? "good" : "neutral"}
        />
        <KpiCard
          label="Client role"
          value={role.clientRole ? "Yes" : "No"}
          tone={role.clientRole ? "warn" : "neutral"}
        />
        <KpiCard
          label="Members"
          value={role.members.length}
          tone={role.members.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Composite roles"
          value={role.compositeRoles.length}
          tone={role.compositeRoles.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Snapshot"
          value={isFresh ? "Fresh" : "Cached"}
          tone={isFresh ? "good" : "neutral"}
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
              <p className="ops-meta-label">Role name</p>
              <p className="ops-meta-value">{role.roleName}</p>
            </div>
            <div>
              <p className="ops-meta-label">Role id</p>
              <p className="ops-meta-value ops-meta-value--mono">
                {role.roleId}
              </p>
            </div>
            <div>
              <p className="ops-meta-label">Realm</p>
              <p className="ops-meta-value ops-meta-value--mono">
                {role.realm}
              </p>
            </div>
            <div>
              <p className="ops-meta-label">Description</p>
              <p className="ops-meta-value">
                {role.description ?? "No Keycloak description was provided."}
              </p>
            </div>
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Membership posture</p>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div>
              <p className="ops-meta-label">Composite</p>
              <StatusChip tone={role.composite ? "nominal" : "drift"} size="sm">
                {role.composite ? "Aggregates other roles" : "Leaf role"}
              </StatusChip>
            </div>
            <div>
              <p className="ops-meta-label">Client binding</p>
              <StatusChip
                tone={role.clientRole ? "pending" : "nominal"}
                size="sm"
              >
                {role.clientRole ? "Client role" : "Realm role"}
              </StatusChip>
            </div>
            <div>
              <p className="ops-meta-label">Tenant target</p>
              <p className="ops-meta-value">
                <Link to={tenantWorkspacePath}>
                  {tenant.scope + "/" + tenant.scopeId}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Composite roles
            <span className="ops-card-head__count">
              {role.compositeRoles.length}
            </span>
          </p>
        </div>
        {role.compositeRoles.length === 0 ? (
          <StateScreen
            variant="empty"
            title="No composite roles"
            description="This Keycloak role does not currently aggregate any other roles."
          />
        ) : (
          <div
            data-testid="kc-role-detail-composites"
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {role.compositeRoles.map((compositeRole) => (
              <div key={compositeRole.roleId} className="ops-card">
                <div className="ops-card-head">
                  <p className="ops-card-head__title">
                    {compositeRole.roleName}
                  </p>
                </div>
                <div className="ops-meta-grid">
                  <div>
                    <p className="ops-meta-label">Role id</p>
                    <p className="ops-meta-value ops-meta-value--mono">
                      {compositeRole.roleId}
                    </p>
                  </div>
                  <div>
                    <p className="ops-meta-label">Description</p>
                    <p className="ops-meta-value">
                      {compositeRole.description ??
                        "No Keycloak description was provided."}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <StatusChip
                      tone={compositeRole.composite ? "nominal" : "drift"}
                      size="sm"
                    >
                      {compositeRole.composite ? "Composite" : "Leaf"}
                    </StatusChip>
                    <StatusChip
                      tone={compositeRole.clientRole ? "pending" : "nominal"}
                      size="sm"
                    >
                      {compositeRole.clientRole ? "Client role" : "Realm role"}
                    </StatusChip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Members
            <span className="ops-card-head__count">{role.members.length}</span>
          </p>
        </div>
        {role.members.length === 0 ? (
          <StateScreen
            variant="empty"
            title="No role members"
            description="No Keycloak users are currently assigned to this role."
          />
        ) : (
          <div
            data-testid="kc-role-detail-members"
            className="ops-activity-list"
          >
            {role.members.map((member) => (
              <div key={member.userId} className="ops-activity-item">
                <div style={{ display: "grid", gap: 4 }}>
                  <span className="ops-activity-module">
                    <span className="ops-dot ops-dot--active" />
                    <Link
                      to={buildKeycloakUserPath(
                        member.userId,
                        tenant.scope,
                        tenant.scopeId,
                      )}
                    >
                      {member.username}
                    </Link>
                  </span>
                  <span className="mono">{member.userId}</span>
                  <span className="ops-alert-detail">
                    {member.email ?? "No email recorded."}
                  </span>
                </div>
                <StatusChip
                  tone={member.enabled ? "nominal" : "error"}
                  size="sm"
                >
                  {member.enabled ? "Enabled" : "Disabled"}
                </StatusChip>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ops-card" data-testid="kc-role-detail-audit">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Audit posture</p>
        </div>
        <p className="ops-alert-detail">
          Every successful Keycloak role read is audited for{" "}
          <span className="mono">{tenant.scope + "/" + tenant.scopeId}</span>.
          This route stays read-only and operator-gated while reusing the shared
          Keycloak role read service.
        </p>
      </div>
    </section>
  );
}
