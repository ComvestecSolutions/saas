import { useMemo, useState } from "react";
import { createAdminAppFileRoute } from "../../file-route";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../../components/admin-session-required-state";
import {
  ScreenHeader,
  KpiCard,
  Tabs,
  FilterBar,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  SettingsIcon,
  resolveTableAriaSort,
} from "../../components/ui";

export const Route = createAdminAppFileRoute("/governance/runtime-config")({
  loader: () =>
    import("../../lib/governance-loaders").then(
      ({ loadAdminRuntimeConfigLoaderData }) =>
        loadAdminRuntimeConfigLoaderData(),
    ),
  component: RuntimeConfig,
  pendingComponent: () => (
    <LoadingState title="Loading runtime configuration…" />
  ),
});

type Tab = "overrides" | "proposals";

function RuntimeConfig() {
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("overrides");
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

  const overrides = data.kind === "ready" ? data.overrides : [];
  const proposals = data.kind === "ready" ? data.proposals : [];

  const overridesView = applyTableState(overrides, overridesState, {
    searchOn: (o) =>
      `${o.moduleId} ${o.key} ${o.scope} ${String(o.value ?? "")}`,
    sortOn: {
      module: (o) => o.moduleId,
      key: (o) => o.key,
      scope: (o) => o.scope,
      changedAt: (o) => o.changedAt,
    },
  });
  const proposalsView = applyTableState(proposals, proposalsState, {
    searchOn: (p) =>
      `${p.moduleId} ${p.key} ${p.action ?? ""} ${String(p.value ?? "")}`,
    sortOn: {
      module: (p) => p.moduleId,
      key: (p) => p.key,
      action: (p) => p.action ?? "",
      changedAt: (p) => p.changedAt ?? "",
    },
  });

  const moduleCount = useMemo(
    () =>
      new Set([
        ...overrides.map((o) => o.moduleId),
        ...proposals.map((p) => p.moduleId),
      ]).size,
    [overrides, proposals],
  );

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access runtime configuration."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to access runtime configuration."
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
        icon={<SettingsIcon />}
        title="Runtime Configuration"
        breadcrumbs={[{ label: "Governance" }, { label: "Runtime Config" }]}
        subtitle="Active runtime overrides and pending proposals across platform modules."
      />

      <div className="ops-bento">
        <KpiCard
          label="Active overrides"
          value={overrides.length}
          tone={overrides.length > 0 ? "accent" : "neutral"}
        />
        <KpiCard
          label="Pending proposals"
          value={proposals.length}
          tone={proposals.length > 0 ? "warn" : "good"}
        />
        <KpiCard label="Modules touched" value={moduleCount} />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "overrides", label: "Overrides", count: overrides.length },
          { value: "proposals", label: "Proposals", count: proposals.length },
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
            <EmptyState
              title="No active overrides"
              description="All modules are running on default configuration values."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table className="ops-table">
                <thead>
                  <tr>
                    {(
                      [
                        ["module", "Module"],
                        ["key", "Key"],
                      ] as const
                    ).map(([k, l]) => (
                      <SortableTableHeader
                        key={k}
                        ariaSort={resolveTableAriaSort(overridesState, k)}
                        onToggle={() => overridesState.toggleSort(k)}
                      >
                        {l}
                      </SortableTableHeader>
                    ))}
                    <th>Value</th>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(overridesState, "scope")}
                      onToggle={() => overridesState.toggleSort("scope")}
                    >
                      Scope
                    </SortableTableHeader>
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
                  {overridesView.visible.map((o) => (
                    <tr key={`${o.moduleId}-${o.key}`}>
                      <td className="mono">{o.moduleId}</td>
                      <td className="mono text-strong">{o.key}</td>
                      <td className="mono ops-redacted">
                        {o.value != null ? String(o.value) : "(unset)"}
                      </td>
                      <td>{o.scope}</td>
                      <td className="mono">{o.changedAt.slice(0, 10)}</td>
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
            <EmptyState
              title="No pending proposals"
              description="There are no staged configuration changes awaiting approval."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table className="ops-table">
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
                  {proposalsView.visible.map((p) => (
                    <tr key={p.proposalId}>
                      <td className="mono">{p.moduleId}</td>
                      <td className="mono text-strong">{p.key}</td>
                      <td className="mono ops-redacted">
                        {p.value != null ? String(p.value) : "(unset)"}
                      </td>
                      <td>
                        <StatusChip
                          status={p.action ?? "pending"}
                          variant={resolveStatusVariant(p.action ?? "pending")}
                        />
                      </td>
                      <td className="mono">
                        {p.changedAt?.slice(0, 10) ?? "—"}
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
    </div>
  );
}
