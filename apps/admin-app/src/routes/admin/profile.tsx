import { useState } from "react";
import { adminOrgRole } from "@comvestec/contracts";
import { StateScreen, StatusChip, type StatusChipTone } from "@comvestec/ui";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SegmentedTabs,
  ShieldIcon,
  SortableTableHeader,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import type { AdminProfileRouteData } from "../../lib/admin-profile-route-data";
import {
  adminOrgRoleLabel,
  adminOrgRoleSummary,
} from "../../lib/admin-org-role-display";

/**
 * `/admin/profile` — spec-canonical admin-organization operator
 * profile surface shipped by Phase 7 admin-org screens commit
 * 7b-1 (admin-app implementation plan §11). Consumes the
 * `admin-profile-{loader,route-data,route-server}` trio gated
 * end-to-end through `extractRequiredSubscriberJourneySessionId`
 * and the `getAdminOperatorProfileFromEnvironment` admin-org
 * platform helper.
 *
 * Distinct from the legacy `/profile` surface which reads from
 * the shell root loader — this surface ships its own
 * Phase 6 6c-style discriminated-union loader trio so the
 * admin-org profile pane is independently retryable, can carry
 * its own denied/stale-session/error affordances, and stays
 * aligned with the Phase 7 admin-org route taxonomy
 * (`/admin/profile`, `/admin/members`, `/admin/workspaces`).
 */
export const Route = createAdminAppFileRoute("/admin/profile")({
  loader: async () => {
    const { loadAdminProfileLoaderData } =
      await import("../../lib/admin-profile-loader");
    return loadAdminProfileLoaderData({});
  },
  component: AdminProfileRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading admin operator profile…" />
  ),
});

type ReadyAdminProfileRouteData = Extract<
  AdminProfileRouteData,
  { readonly kind: "ready" }
>;
type AdminProfileCapability =
  ReadyAdminProfileRouteData["profile"]["capabilities"][number];
type AdminProfileCapabilityFilter =
  | "all"
  | "allowed"
  | "constrained"
  | "hidden";
type AdminProfileSortKey = "capability" | "route" | "access" | "policies";

const buildVisibilityTone = (
  capability: AdminProfileCapability,
): StatusChipTone => (capability.visible ? "nominal" : "drift");

const buildAccessTone = (capability: AdminProfileCapability): StatusChipTone =>
  capability.allowed ? "success" : "error";

function AdminProfileRoute() {
  const data: AdminProfileRouteData = Route.useLoaderData();
  const [capabilityFilter, setCapabilityFilter] =
    useState<AdminProfileCapabilityFilter>("all");
  const tableState = useTableState<AdminProfileSortKey>({
    initialPageSize: 10,
    initialSortKey: "capability",
    initialSortDir: "asc",
  });

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view the admin operator profile."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access the admin operator profile."
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

  const { profile } = data;
  const adminRoleLabel = adminOrgRoleLabel[profile.adminOrgRole];
  const adminRoleTone =
    profile.adminOrgRole === adminOrgRole.owner
      ? "accent"
      : profile.adminOrgRole === adminOrgRole.admin
        ? "good"
        : profile.adminOrgRole === adminOrgRole.none
          ? "warn"
          : "neutral";
  const allowedCapabilities = profile.capabilities.filter((c) => c.allowed);
  const constrainedCapabilities = profile.capabilities.filter(
    (c) => !c.allowed,
  );
  const visibleCapabilities = profile.capabilities.filter((c) => c.visible);
  const hiddenCapabilities = profile.capabilities.filter((c) => !c.visible);
  const totalPolicies = profile.capabilities.reduce(
    (total, capability) => total + capability.actionPolicyIds.length,
    0,
  );
  const filteredCapabilities = profile.capabilities.filter((capability) => {
    switch (capabilityFilter) {
      case "allowed":
        return capability.allowed;
      case "constrained":
        return !capability.allowed;
      case "hidden":
        return !capability.visible;
      default:
        return true;
    }
  });
  const { visible, total } = applyTableState(filteredCapabilities, tableState, {
    searchOn: (capability) =>
      [
        capability.label,
        capability.capability,
        capability.routePath,
        capability.reason ?? "",
        capability.actionPolicyIds.join(" "),
        capability.allowed ? "allowed" : "constrained",
        capability.visible ? "visible" : "hidden",
      ].join(" "),
    sortOn: {
      capability: (capability) => capability.label,
      route: (capability) => capability.routePath,
      access: (capability) =>
        `${capability.allowed ? "1" : "0"}:${capability.visible ? "1" : "0"}`,
      policies: (capability) => capability.actionPolicyIds.length,
    },
  });
  const firstAllowedCapability = allowedCapabilities[0];
  const firstConstrainedCapability = constrainedCapabilities[0];

  return (
    <section
      data-testid="admin-profile-ready"
      data-pattern="admin-profile-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Admin operator profile"
        breadcrumbs={[
          { label: "Admin" },
          { label: "Profile", href: "/admin/profile" },
        ]}
        subtitle="Current operator identity, admin-organization role, and route-by-route capability access for the admin control plane."
      />

      <div
        data-testid="admin-profile-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Admin role"
          value={adminRoleLabel}
          tone={adminRoleTone}
        />
        <KpiCard
          label="Actor type"
          value={profile.identity.actorType}
          tone="neutral"
        />
        <KpiCard
          label="Enabled"
          value={profile.identity.enabled ? "Yes" : "No"}
          tone={profile.identity.enabled ? "good" : "warn"}
        />
        <KpiCard
          label="Allowed capabilities"
          value={allowedCapabilities.length}
          tone={allowedCapabilities.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Constrained capabilities"
          value={constrainedCapabilities.length}
          tone={constrainedCapabilities.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Visible surfaces"
          value={visibleCapabilities.length}
          tone={visibleCapabilities.length > 0 ? "good" : "warn"}
        />
        <KpiCard
          label="Policy guards"
          value={totalPolicies}
          tone={totalPolicies > 0 ? "neutral" : "warn"}
        />
      </div>

      <div className="ops-insight-grid">
        <section
          data-testid="admin-profile-identity"
          className="ops-insight-card"
        >
          <p className="ops-card-title">Operator identity</p>
          <span
            className="text-strong"
            data-testid="admin-profile-display-name"
          >
            {profile.identity.displayName}
          </span>
          <span className="mono">{profile.identity.email}</span>
          <span className="mono" data-testid="admin-profile-actor-id">
            {profile.identity.actorId}
          </span>
          <span className="ops-secondary-text">
            {profile.identity.username}
          </span>
          <span className="ops-secondary-text">
            {adminOrgRoleSummary[profile.adminOrgRole]}
          </span>
        </section>

        <section
          data-testid="admin-profile-session"
          className="ops-insight-card"
        >
          <p className="ops-card-title">Session posture</p>
          <div className="ops-inline-cluster">
            <StatusChip
              tone={profile.identity.enabled ? "success" : "error"}
              size="sm"
            >
              {profile.identity.enabled ? "Enabled" : "Disabled"}
            </StatusChip>
            <StatusChip
              tone={
                profile.adminOrgRole === adminOrgRole.owner
                  ? "nominal"
                  : profile.adminOrgRole === adminOrgRole.none
                    ? "pending"
                    : "success"
              }
              size="sm"
            >
              {adminRoleLabel}
            </StatusChip>
            <StatusChip tone="nominal" size="sm">
              {profile.identity.actorType}
            </StatusChip>
          </div>
          <span className="mono">{profile.sessionId}</span>
          <span className="ops-secondary-text">
            {visibleCapabilities.length} visible surface
            {visibleCapabilities.length === 1 ? "" : "s"} and{" "}
            {hiddenCapabilities.length} hidden entrypoint
            {hiddenCapabilities.length === 1 ? "" : "s"}.
          </span>
        </section>

        <section data-testid="admin-profile-focus" className="ops-insight-card">
          <p className="ops-card-title">Capability focus</p>
          <span className="text-strong">
            {firstAllowedCapability === undefined
              ? "No allowed capability runway"
              : firstAllowedCapability.label}
          </span>
          <span className="mono ops-secondary-text">
            {firstAllowedCapability?.routePath ?? "No route available"}
          </span>
          <span className="ops-secondary-text">
            {firstConstrainedCapability === undefined
              ? "All declared capabilities are currently allowed."
              : (firstConstrainedCapability.reason ??
                "A capability is constrained without an explicit reason.")}
          </span>
        </section>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Capability workspace
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search capabilities, routes, reasons, or policy ids…"
          trailing={
            <SegmentedTabs<AdminProfileCapabilityFilter>
              ariaLabel="Profile capability filter"
              value={capabilityFilter}
              onChange={(value) => {
                setCapabilityFilter(value);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: "allowed", label: "Allowed" },
                { value: "constrained", label: "Constrained" },
                { value: "hidden", label: "Hidden" },
              ]}
            />
          }
        />

        <div className="ops-table-wrapper">
          <table
            className="ops-table"
            data-testid="admin-profile-capability-table"
          >
            <thead>
              <tr>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "capability")}
                  onToggle={() => tableState.toggleSort("capability")}
                >
                  Capability
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "route")}
                  onToggle={() => tableState.toggleSort("route")}
                >
                  Route
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "access")}
                  onToggle={() => tableState.toggleSort("access")}
                >
                  Access
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "policies")}
                  onToggle={() => tableState.toggleSort("policies")}
                >
                  Guardrails
                </SortableTableHeader>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    data-testid="admin-profile-capabilities-empty"
                    style={{ padding: 6 }}
                  >
                    No capabilities match the current profile view.
                  </td>
                </tr>
              ) : (
                visible.map((capability) => (
                  <tr
                    key={`${capability.capability}:${capability.routePath}`}
                    data-testid="admin-profile-capability-row"
                  >
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="text-strong">{capability.label}</span>
                        <span className="mono ops-secondary-text">
                          {capability.capability}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="mono">{capability.routePath}</span>
                        <span className="ops-secondary-text">
                          {capability.visible
                            ? "Visible in admin navigation"
                            : "Hidden entrypoint"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <StatusChip
                            tone={buildAccessTone(capability)}
                            size="sm"
                          >
                            {capability.allowed ? "Allowed" : "Constrained"}
                          </StatusChip>
                          <StatusChip
                            tone={buildVisibilityTone(capability)}
                            size="sm"
                          >
                            {capability.visible ? "Visible" : "Hidden"}
                          </StatusChip>
                        </div>
                        <span className="ops-secondary-text">
                          {capability.reason ??
                            "No explicit access friction recorded."}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="text-strong">
                          {capability.actionPolicyIds.length} guardrail
                          {capability.actionPolicyIds.length === 1 ? "" : "s"}
                        </span>
                        <span className="mono ops-secondary-text">
                          {capability.actionPolicyIds.length === 0
                            ? "No action policy gates"
                            : capability.actionPolicyIds.join(", ")}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </div>
    </section>
  );
}
