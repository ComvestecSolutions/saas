import { useState } from "react";
import { Schema } from "effect";
import { createAdminAppFileRoute } from "../file-route";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
  Badge,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../components/admin-session-required-state";
import { AdminTenantTargetForm } from "../components/admin-tenant-target-form";
import { buildAdminTenantTargetSearch } from "../lib/admin-tenant-target";
import {
  ScreenHeader,
  KpiCard,
  Tabs,
  FilterBar,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  ClockIcon,
  AlertIcon,
  resolveTableAriaSort,
} from "../components/ui";

const ComplianceSearchSchema = Schema.Struct({
  scopeId: Schema.optional(Schema.NonEmptyString),
  scope: Schema.optional(Schema.NonEmptyString),
});

export const Route = createAdminAppFileRoute("/compliance-retention")({
  validateSearch: (raw) => Schema.validateSync(ComplianceSearchSchema)(raw),
  loaderDeps: ({ search }) => ({
    scopeId: search.scopeId,
    scope: search.scope,
  }),
  loader: ({ deps }) =>
    import("../lib/operational-loaders").then(
      ({ loadAdminComplianceRetentionLoaderData }) =>
        loadAdminComplianceRetentionLoaderData(deps.scope, deps.scopeId),
    ),
  component: ComplianceRetention,
  pendingComponent: () => (
    <LoadingState title="Loading compliance and retention…" />
  ),
});

type Tab = "policies" | "holds";

function ComplianceRetention() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<Tab>("policies");
  const policiesState = useTableState<"policy" | "data" | "days">({
    initialPageSize: 25,
  });
  const holdsState = useTableState<"hold" | "data" | "status" | "placed">({
    initialPageSize: 25,
    initialSortKey: "placed",
    initialSortDir: "desc",
  });

  const policies = data.kind === "ready" ? data.policies : [];
  const holds = data.kind === "ready" ? data.holds : [];

  const policiesView = applyTableState(policies, policiesState, {
    searchOn: (p) => `${p.policyId} ${p.dataType}`,
    sortOn: {
      policy: (p) => p.policyId,
      data: (p) => p.dataType,
      days: (p) => p.retentionDays,
    },
  });
  const holdsView = applyTableState(holds, holdsState, {
    searchOn: (h) => `${h.legalHoldId} ${h.dataType} ${h.targetId}`,
    sortOn: {
      hold: (h) => h.legalHoldId,
      data: (h) => h.dataType,
      status: (h) => h.status,
      placed: (h) => h.placedAt,
    },
  });

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access compliance and retention."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to access compliance and retention."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const activeHolds = holds.filter((h) => h.legalHoldActive).length;

  return (
    <div className="ops-screen">
      <ScreenHeader
        icon={<ClockIcon />}
        title="Compliance & Retention"
        breadcrumbs={[{ label: "Operations" }, { label: "Compliance" }]}
        subtitle="Retention policies and legal holds for a search-selected tenant target."
      />

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Choose tenant target</p>
        </div>
        <AdminTenantTargetForm
          initialScope={search.scope}
          initialScopeId={search.scopeId}
          submitLabel="Load compliance view"
          submitVariant="secondary"
          onSubmit={(target) =>
            navigate({ search: buildAdminTenantTargetSearch(target) })
          }
        />
      </div>

      {data.kind === "no-scope" ? (
        <EmptyState
          title="Choose a tenant target"
          description="Pick a named tenant target above, or fall back to the exact internal lookup only when necessary."
        />
      ) : (
        <>
          <div className="ops-bento">
            <KpiCard
              label="Retention policies"
              value={policies.length}
              tone="accent"
            />
            <KpiCard
              label="Active legal holds"
              value={activeHolds}
              tone={activeHolds > 0 ? "alert" : "good"}
              icon={activeHolds > 0 ? <AlertIcon /> : undefined}
            />
            <KpiCard label="Total holds (history)" value={holds.length} />
          </div>

          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              {
                value: "policies",
                label: "Retention policies",
                count: policies.length,
              },
              { value: "holds", label: "Legal holds", count: holds.length },
            ]}
          />

          {tab === "policies" ? (
            <div className="ops-card">
              <FilterBar
                searchValue={policiesState.search}
                onSearchChange={policiesState.setSearch}
                searchPlaceholder="Search policies…"
              />
              {policiesView.visible.length === 0 ? (
                <EmptyState
                  title="No retention policies"
                  description="No data retention policies are configured."
                />
              ) : (
                <div className="ops-table-wrapper">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            policiesState,
                            "policy",
                          )}
                          onToggle={() => policiesState.toggleSort("policy")}
                        >
                          Policy ID
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(policiesState, "data")}
                          onToggle={() => policiesState.toggleSort("data")}
                        >
                          Data type
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(policiesState, "days")}
                          onToggle={() => policiesState.toggleSort("days")}
                          align="right"
                        >
                          Retention (days)
                        </SortableTableHeader>
                        <th>Legal hold active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policiesView.visible.map((p) => (
                        <tr key={p.policyId}>
                          <td className="mono">{p.policyId}</td>
                          <td>
                            <Badge variant="neutral">{p.dataType}</Badge>
                          </td>
                          <td className="num">{p.retentionDays}</td>
                          <td>
                            <Badge
                              variant={
                                p.legalHoldActive ? "pending" : "neutral"
                              }
                            >
                              {p.legalHoldActive ? "yes" : "no"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={policiesState.page}
                pageSize={policiesState.pageSize}
                total={policiesView.total}
                onPageChange={policiesState.setPage}
                onPageSizeChange={policiesState.setPageSize}
              />
            </div>
          ) : (
            <div className="ops-card">
              <FilterBar
                searchValue={holdsState.search}
                onSearchChange={holdsState.setSearch}
                searchPlaceholder="Search holds…"
              />
              {holdsView.visible.length === 0 ? (
                <EmptyState
                  title="No legal holds"
                  description="No active legal holds are in effect."
                />
              ) : (
                <div className="ops-table-wrapper">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(holdsState, "hold")}
                          onToggle={() => holdsState.toggleSort("hold")}
                        >
                          Hold ID
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(holdsState, "data")}
                          onToggle={() => holdsState.toggleSort("data")}
                        >
                          Data type
                        </SortableTableHeader>
                        <th>Target</th>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(holdsState, "status")}
                          onToggle={() => holdsState.toggleSort("status")}
                        >
                          Status
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(holdsState, "placed")}
                          onToggle={() => holdsState.toggleSort("placed")}
                        >
                          Placed
                        </SortableTableHeader>
                        <th>Released</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdsView.visible.map((h) => (
                        <tr key={h.legalHoldId}>
                          <td className="mono">{h.legalHoldId}</td>
                          <td>
                            <Badge variant="neutral">{h.dataType}</Badge>
                          </td>
                          <td className="mono ops-redacted">{h.targetId}</td>
                          <td>
                            <StatusChip
                              status={h.status}
                              variant={resolveStatusVariant(h.status)}
                            />
                          </td>
                          <td className="mono">{h.placedAt.slice(0, 10)}</td>
                          <td className="mono">
                            {h.releasedAt ? h.releasedAt.slice(0, 10) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={holdsState.page}
                pageSize={holdsState.pageSize}
                total={holdsView.total}
                onPageChange={holdsState.setPage}
                onPageSizeChange={holdsState.setPageSize}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
