import { useMemo, useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { Schema } from "effect";
import { EmptyState, StateScreen, StatusChip } from "@comvestec/ui";
import {
  platformModuleId,
  platformModuleIds,
  type PlatformModuleId,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  Pagination,
  resolveTableAriaSort,
  ScreenHeader,
  ShieldIcon,
  SortableTableHeader,
  Tabs,
  applyTableState,
  useTableState,
} from "../../components/ui";
import type {
  AdminGovernanceConfigV2Input,
  AdminGovernanceConfigV2RouteData,
} from "../../lib/governance-config-route-data";

/**
 * `/desk/config` — canonical Runtime Config surface with a useful
 * list shell: KPIs, overrides vs proposals tabs, search, sort,
 * pagination, and direct deep-links into the selected key detail
 * drawer.
 */

const RawSearchSchema = Schema.Struct({
  moduleId: Schema.optional(Schema.String),
  key: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type RuntimeConfigTab = "overrides" | "proposals";

const platformModuleIdValues = platformModuleIds as readonly PlatformModuleId[];

const isKnownPlatformModuleId = (value: string): value is PlatformModuleId =>
  (platformModuleIdValues as readonly string[]).includes(value);

const decodeSearch = (search: RawSearch): AdminGovernanceConfigV2Input => {
  const moduleId =
    search.moduleId !== undefined && isKnownPlatformModuleId(search.moduleId)
      ? search.moduleId
      : platformModuleId.runtimeConfig;
  const key =
    search.key !== undefined && search.key.length > 0 ? search.key : undefined;
  return {
    moduleId,
    ...(key === undefined ? {} : { key }),
  };
};

export const Route = createAdminAppFileRoute("/desk/config")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/governance-config-loader").then(
      ({ loadAdminGovernanceConfigV2LoaderData }) =>
        loadAdminGovernanceConfigV2LoaderData(decodeSearch(deps.search)),
    ),
  component: RuntimeConfigListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading runtime config…" />
  ),
});

function RuntimeConfigListRoute() {
  const data: AdminGovernanceConfigV2RouteData = Route.useLoaderData();
  const [tab, setTab] = useState<RuntimeConfigTab>("overrides");
  const overridesState = useTableState<
    "module" | "key" | "scope" | "changedAt"
  >({
    initialPageSize: 25,
    initialSortKey: "changedAt",
    initialSortDir: "desc",
  });
  const proposalsState = useTableState<
    "module" | "key" | "action" | "changedAt"
  >({
    initialPageSize: 25,
    initialSortKey: "changedAt",
    initialSortDir: "desc",
  });

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access runtime configuration."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access runtime configuration."
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

  const overridesView = applyTableState(data.overrides, overridesState, {
    searchOn: (override) =>
      `${override.moduleId} ${override.key} ${override.scope} ${override.scopeId} ${String(override.value ?? "")} ${override.source}`,
    sortOn: {
      module: (override) => override.moduleId,
      key: (override) => override.key,
      scope: (override) => `${override.scope}:${override.scopeId}`,
      changedAt: (override) => override.changedAt,
    },
  });
  const proposalsView = applyTableState(data.proposals, proposalsState, {
    searchOn: (proposal) =>
      `${proposal.moduleId} ${proposal.key} ${proposal.action ?? ""} ${proposal.status} ${String(proposal.value ?? "")}`,
    sortOn: {
      module: (proposal) => proposal.moduleId,
      key: (proposal) => proposal.key,
      action: (proposal) => proposal.action ?? "",
      changedAt: (proposal) => proposal.changedAt ?? "",
    },
  });
  const moduleCount = useMemo(
    () =>
      new Set([
        ...data.overrides.map((override) => override.moduleId),
        ...data.proposals.map((proposal) => proposal.moduleId),
      ]).size,
    [data.overrides, data.proposals],
  );

  return (
    <section
      className="ops-screen"
      data-testid="runtime-config-list-ready"
      data-pattern="runtime-config-v2"
    >
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Runtime Configuration"
        breadcrumbs={[{ label: "Resources" }, { label: "Runtime config" }]}
        subtitle="Active runtime overrides and pending proposals across platform modules."
      />

      <div className="ops-bento" data-testid="runtime-config-kpis">
        <KpiCard
          label="Active overrides"
          value={data.overrides.length}
          tone={data.overrides.length > 0 ? "accent" : "neutral"}
        />
        <KpiCard
          label="Pending proposals"
          value={data.proposals.length}
          tone={data.proposals.length > 0 ? "warn" : "good"}
        />
        <KpiCard label="Modules touched" value={moduleCount} />
      </div>

      <Tabs<RuntimeConfigTab>
        value={tab}
        onChange={setTab}
        items={[
          {
            value: "overrides",
            label: "Overrides",
            count: data.overrides.length,
          },
          {
            value: "proposals",
            label: "Proposals",
            count: data.proposals.length,
          },
        ]}
      />

      {tab === "overrides" ? (
        <div className="ops-card">
          <FilterBar
            searchValue={overridesState.search}
            onSearchChange={overridesState.setSearch}
            searchPlaceholder="Search by module, key, scope, or value…"
          />
          {overridesView.visible.length === 0 ? (
            <div data-testid="runtime-config-list-empty">
              <EmptyState
                title="No active overrides"
                description="All modules are running on their declared runtime defaults."
              />
            </div>
          ) : (
            <div className="ops-table-wrapper">
              <table
                className="ops-table"
                data-testid="runtime-config-list-table"
                data-pattern="dense-data-table"
              >
                <thead>
                  <tr>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(overridesState, "module")}
                      onToggle={() => overridesState.toggleSort("module")}
                    >
                      Module
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(overridesState, "key")}
                      onToggle={() => overridesState.toggleSort("key")}
                    >
                      Key
                    </SortableTableHeader>
                    <th>Effective value</th>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(overridesState, "scope")}
                      onToggle={() => overridesState.toggleSort("scope")}
                    >
                      Scope
                    </SortableTableHeader>
                    <th>Source</th>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(
                        overridesState,
                        "changedAt",
                      )}
                      onToggle={() => overridesState.toggleSort("changedAt")}
                    >
                      Updated
                    </SortableTableHeader>
                  </tr>
                </thead>
                <tbody>
                  {overridesView.visible.map((override) => (
                    <tr
                      key={`${override.moduleId}:${override.key}:${override.scope}:${override.scopeId}`}
                      data-testid="runtime-config-list-row"
                      data-row-key={override.key}
                    >
                      <td className="mono">{override.moduleId}</td>
                      <td>
                        <Link
                          data-testid="runtime-config-list-row-link"
                          to="/desk/config/$moduleId/$configKey"
                          params={{
                            moduleId: override.moduleId,
                            configKey: override.key,
                          }}
                          preload={false}
                        >
                          {override.key}
                        </Link>
                      </td>
                      <td className="mono ops-redacted">
                        {override.value != null
                          ? String(override.value)
                          : "(unset)"}
                      </td>
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span>{override.scope}</span>
                          <span
                            className="mono"
                            style={{ color: "var(--ops-text-secondary)" }}
                          >
                            {override.scopeId}
                          </span>
                        </div>
                      </td>
                      <td>{override.source}</td>
                      <td className="mono">
                        {override.changedAt.slice(0, 19).replace("T", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={overridesState.page}
            pageSize={overridesState.pageSize}
            total={overridesView.total}
            onPageChange={overridesState.setPage}
            onPageSizeChange={overridesState.setPageSize}
          />
        </div>
      ) : (
        <div className="ops-card">
          <FilterBar
            searchValue={proposalsState.search}
            onSearchChange={proposalsState.setSearch}
            searchPlaceholder="Search proposals…"
          />
          {proposalsView.visible.length === 0 ? (
            <div data-testid="runtime-config-proposals-empty">
              <EmptyState
                title="No pending proposals"
                description="There are no staged configuration changes awaiting approval."
              />
            </div>
          ) : (
            <div className="ops-table-wrapper">
              <table
                className="ops-table"
                data-testid="runtime-config-proposals-table"
                data-pattern="dense-data-table"
              >
                <thead>
                  <tr>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(proposalsState, "module")}
                      onToggle={() => proposalsState.toggleSort("module")}
                    >
                      Module
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(proposalsState, "key")}
                      onToggle={() => proposalsState.toggleSort("key")}
                    >
                      Key
                    </SortableTableHeader>
                    <th>Proposed value</th>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(proposalsState, "action")}
                      onToggle={() => proposalsState.toggleSort("action")}
                    >
                      Action
                    </SortableTableHeader>
                    <th>Status</th>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(
                        proposalsState,
                        "changedAt",
                      )}
                      onToggle={() => proposalsState.toggleSort("changedAt")}
                    >
                      Changed
                    </SortableTableHeader>
                  </tr>
                </thead>
                <tbody>
                  {proposalsView.visible.map((proposal) => (
                    <tr
                      key={`${proposal.moduleId}:${proposal.key}:${proposal.changedAt ?? proposal.status}`}
                      data-testid="runtime-config-proposals-row"
                    >
                      <td className="mono">{proposal.moduleId}</td>
                      <td>
                        <Link
                          to="/desk/config/$moduleId/$configKey"
                          params={{
                            moduleId: proposal.moduleId,
                            configKey: proposal.key,
                          }}
                          preload={false}
                        >
                          {proposal.key}
                        </Link>
                      </td>
                      <td className="mono ops-redacted">
                        {proposal.value != null
                          ? String(proposal.value)
                          : "(unset)"}
                      </td>
                      <td>{proposal.action ?? "proposal"}</td>
                      <td>
                        <StatusChip
                          tone={
                            proposal.status === "pending" ? "pending" : "drift"
                          }
                          size="sm"
                        >
                          {proposal.status}
                        </StatusChip>
                      </td>
                      <td className="mono">
                        {proposal.changedAt?.slice(0, 19).replace("T", " ") ??
                          "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={proposalsState.page}
            pageSize={proposalsState.pageSize}
            total={proposalsView.total}
            onPageChange={proposalsState.setPage}
            onPageSizeChange={proposalsState.setPageSize}
          />
        </div>
      )}

      <Outlet />
    </section>
  );
}
