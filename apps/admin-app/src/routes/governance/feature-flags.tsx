import { useMemo, useState } from "react";
import { createAdminAppFileRoute } from "../../file-route";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  Badge,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../../components/admin-session-required-state";
import {
  ScreenHeader,
  KpiCard,
  FilterBar,
  SegmentedTabs,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  resolveTableAriaSort,
} from "../../components/ui";

const FlagIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 2v12M3 2h8l-2 4 2 4H3"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Route = createAdminAppFileRoute("/governance/feature-flags")({
  loader: () =>
    import("../../lib/governance-loaders").then(
      ({ loadAdminFeatureFlagsLoaderData }) =>
        loadAdminFeatureFlagsLoaderData(),
    ),
  component: FeatureFlags,
  pendingComponent: () => <LoadingState title="Loading feature flags…" />,
});

type StateFilter = "all" | "enabled" | "disabled";

function FeatureFlags() {
  const data = Route.useLoaderData();
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const tableState = useTableState<"key" | "owner" | "state">({
    initialPageSize: 25,
    initialSortKey: "key",
    initialSortDir: "asc",
  });

  const flags = data.kind === "ready" ? data.flags : [];

  const enabledCount = useMemo(
    () => flags.filter((f) => f.effectiveState).length,
    [flags],
  );
  const disabledCount = flags.length - enabledCount;
  const owners = useMemo(
    () => new Set(flags.map((f) => f.owner)).size,
    [flags],
  );

  const filtered = useMemo(
    () =>
      stateFilter === "all"
        ? flags
        : flags.filter((f) => (stateFilter === "enabled") === f.effectiveState),
    [flags, stateFilter],
  );
  const { visible, total } = applyTableState(filtered, tableState, {
    searchOn: (f) => `${f.key} ${f.owner} ${f.description}`,
    sortOn: {
      key: (f) => f.key,
      owner: (f) => f.owner,
      state: (f) => (f.effectiveState ? 1 : 0),
    },
  });

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access feature flags."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to access feature flags."
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
        icon={<FlagIcon />}
        title="Feature Flags"
        breadcrumbs={[{ label: "Governance" }, { label: "Feature Flags" }]}
        subtitle={`Module-declared feature flags. Effective state combines code defaults with runtime overrides.`}
      />

      <div className="ops-bento">
        <KpiCard label="Enabled" value={enabledCount} tone="good" />
        <KpiCard label="Disabled" value={disabledCount} />
        <KpiCard label="Total flags" value={flags.length} tone="accent" />
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
              onChange={(v) => {
                setStateFilter(v);
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
          <EmptyState
            title="No feature flags match"
            description="Try clearing filters or adjusting the search query."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
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
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "state")}
                    onToggle={() => tableState.toggleSort("state")}
                  >
                    State
                  </SortableTableHeader>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((flag) => (
                  <tr key={flag.key}>
                    <td className="mono text-strong">{flag.key}</td>
                    <td className="mono">{flag.owner}</td>
                    <td>
                      <Badge
                        variant={flag.effectiveState ? "active" : "neutral"}
                      >
                        <span
                          className={
                            flag.effectiveState
                              ? "ops-dot ops-dot--active"
                              : "ops-dot"
                          }
                        />
                        {flag.effectiveState ? "enabled" : "disabled"}
                      </Badge>
                    </td>
                    <td
                      style={{
                        maxWidth: 360,
                        color: "var(--ops-text-secondary)",
                      }}
                    >
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
    </div>
  );
}
