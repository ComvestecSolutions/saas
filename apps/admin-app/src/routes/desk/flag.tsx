import { useMemo, useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { Schema } from "effect";
import { EmptyState, StateScreen, StatusChip } from "@comvestec/ui";
import {
  featureFlagLifecycle,
  platformModuleId,
  platformModuleIds,
  type PlatformModuleId,
} from "@comvestec/contracts";
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
import type {
  AdminGovernanceFlagV2Input,
  AdminGovernanceFlagV2RouteData,
} from "../../lib/governance-flag-route-data";

/**
 * `/desk/flag` — canonical Feature Flags surface with the richer
 * list shell: KPIs, enabled/disabled pivots, search, sort,
 * pagination, and direct deep-links into the selected flag.
 */

const RawSearchSchema = Schema.Struct({
  moduleId: Schema.optional(Schema.String),
  flagKey: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type StateFilter = "all" | "enabled" | "disabled";

const platformModuleIdValues = platformModuleIds as readonly PlatformModuleId[];

const isKnownPlatformModuleId = (value: string): value is PlatformModuleId =>
  (platformModuleIdValues as readonly string[]).includes(value);

const decodeSearch = (search: RawSearch): AdminGovernanceFlagV2Input => {
  const moduleId =
    search.moduleId !== undefined && isKnownPlatformModuleId(search.moduleId)
      ? search.moduleId
      : platformModuleId.featureFlags;
  const flagKey =
    search.flagKey !== undefined && search.flagKey.length > 0
      ? search.flagKey
      : undefined;
  return {
    moduleId,
    ...(flagKey === undefined ? {} : { flagKey }),
  };
};

const lifecycleTone = (
  lifecycle: string,
): "nominal" | "success" | "drift" | "error" => {
  if (lifecycle === featureFlagLifecycle.active) {
    return "success";
  }
  if (lifecycle === featureFlagLifecycle.deprecated) {
    return "drift";
  }
  if (lifecycle === featureFlagLifecycle.retired) {
    return "error";
  }
  return "nominal";
};

export const Route = createAdminAppFileRoute("/desk/flag")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/governance-flag-loader").then(
      ({ loadAdminGovernanceFlagV2LoaderData }) =>
        loadAdminGovernanceFlagV2LoaderData(decodeSearch(deps.search)),
    ),
  component: FeatureFlagListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading feature flags…" />
  ),
});

function FeatureFlagListRoute() {
  const data: AdminGovernanceFlagV2RouteData = Route.useLoaderData();
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const tableState = useTableState<"key" | "owner" | "state">({
    initialPageSize: 25,
    initialSortKey: "key",
    initialSortDir: "asc",
  });

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access feature flags."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access feature flags."
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

  const enabledCount = useMemo(
    () => data.flags.filter((flag) => flag.effectiveState).length,
    [data.flags],
  );
  const disabledCount = data.flags.length - enabledCount;
  const owners = useMemo(
    () => new Set(data.flags.map((flag) => flag.owner)).size,
    [data.flags],
  );
  const filtered =
    stateFilter === "all"
      ? data.flags
      : data.flags.filter(
          (flag) => (stateFilter === "enabled") === flag.effectiveState,
        );
  const { visible, total } = applyTableState(filtered, tableState, {
    searchOn: (flag) =>
      `${flag.key} ${flag.owner} ${flag.description} ${flag.lifecycle} ${flag.source}`,
    sortOn: {
      key: (flag) => flag.key,
      owner: (flag) => flag.owner,
      state: (flag) => (flag.effectiveState ? 1 : 0),
    },
  });

  return (
    <section
      className="ops-screen"
      data-testid="feature-flag-list-ready"
      data-pattern="feature-flag-v2"
    >
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Feature Flags"
        breadcrumbs={[{ label: "Resources" }, { label: "Feature flags" }]}
        subtitle="Module-declared feature flags. Effective state combines code defaults with runtime overrides."
      />

      <div className="ops-bento" data-testid="feature-flag-kpis">
        <KpiCard label="Enabled" value={enabledCount} tone="good" />
        <KpiCard label="Disabled" value={disabledCount} />
        <KpiCard label="Total flags" value={data.flags.length} tone="accent" />
        <KpiCard label="Owning modules" value={owners} />
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            All flags
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search by key, owner, or description…"
          trailing={
            <SegmentedTabs<StateFilter>
              ariaLabel="State filter"
              value={stateFilter}
              onChange={(value) => {
                setStateFilter(value);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: "enabled", label: "Enabled" },
                { value: "disabled", label: "Disabled" },
              ]}
            />
          }
        />

        {visible.length === 0 ? (
          <div data-testid="feature-flag-list-empty">
            <EmptyState
              title="No feature flags match"
              description="Try clearing filters or adjusting the search query."
            />
          </div>
        ) : (
          <div className="ops-table-wrapper">
            <table
              className="ops-table"
              data-testid="feature-flag-list-table"
              data-pattern="dense-data-table"
            >
              <thead>
                <tr>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "key")}
                    onToggle={() => tableState.toggleSort("key")}
                  >
                    Flag
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "owner")}
                    onToggle={() => tableState.toggleSort("owner")}
                  >
                    Owner
                  </SortableTableHeader>
                  <th>Lifecycle</th>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "state")}
                    onToggle={() => tableState.toggleSort("state")}
                  >
                    State
                  </SortableTableHeader>
                  <th>Entitled</th>
                  <th>Dependencies</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((flag) => (
                  <tr
                    key={flag.key}
                    data-testid="feature-flag-list-row"
                    data-row-key={flag.key}
                  >
                    <td>
                      <Link
                        data-testid="feature-flag-list-row-link"
                        to="/desk/flag/$flagKey"
                        params={{ flagKey: flag.key }}
                        preload={false}
                      >
                        {flag.key}
                      </Link>
                    </td>
                    <td className="mono">{flag.owner}</td>
                    <td>
                      <StatusChip
                        tone={lifecycleTone(flag.lifecycle)}
                        size="sm"
                      >
                        {flag.lifecycle}
                      </StatusChip>
                    </td>
                    <td>
                      <StatusChip
                        tone={flag.effectiveState ? "success" : "drift"}
                        size="sm"
                      >
                        {flag.effectiveState ? "enabled" : "disabled"}
                      </StatusChip>
                    </td>
                    <td>{flag.entitled ? "yes" : "no"}</td>
                    <td>{flag.dependencies.length}</td>
                    <td style={{ color: "var(--ops-text-secondary)" }}>
                      {flag.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </div>

      <Outlet />
    </section>
  );
}
