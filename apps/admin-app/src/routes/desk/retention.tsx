import { Schema } from "effect";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  EmptyState,
  StateScreen,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import { PlatformScopeSchema } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { AdminTenantTargetForm } from "../../components/admin-tenant-target-form";
import {
  buildAdminTenantTarget,
  buildAdminTenantTargetSearch,
} from "../../lib/admin-tenant-target";
import { resolveAdminTenantTargetDisplayName } from "../../lib/admin-tenant-target-display-name";
import {
  AlertIcon,
  ExternalIcon,
  FilterBar,
  KpiCard,
  OpsPanel,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  Tabs,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import type {
  AdminRetentionListInput,
  AdminRetentionListRouteData,
} from "../../lib/retention-list-route-data";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../lib/effect-boundary";

/**
 * `/desk/retention` — canonical retention operations surface.
 *
 * The canonical route keeps the spec-canonical
 * `retention-list-{loader,route-data,route-server}` contract while
 * adopting the denser names-first operator workflow that previously
 * only lived on the legacy compliance screen.
 */

const RawSearchSchema = Schema.Struct({
  scope: Schema.optional(Schema.String),
  scopeId: Schema.optional(Schema.String),
  selectedHoldId: Schema.optional(Schema.String),
});
const RawSearchBoundarySchema = Schema.Struct({
  scope: Schema.optional(Schema.Unknown),
  scopeId: Schema.optional(Schema.Unknown),
  selectedHoldId: Schema.optional(Schema.Unknown),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type ReadyData = Extract<
  AdminRetentionListRouteData,
  { readonly kind: "ready" }
>;
type Tab = "policies" | "holds" | "schedule";
const decodeRawSearchBoundary = decodeSyncBoundary(RawSearchBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const decodeScope = decodeSchemaOrUndefined(PlatformScopeSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const validateSearch = (raw: unknown): RawSearch => {
  const search = decodeRawSearchBoundary(raw);
  const scope = decodeSearchString(search.scope);
  const scopeId = decodeSearchString(search.scopeId);
  const selectedHoldId = decodeSearchString(search.selectedHoldId);

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedHoldId === undefined ? {} : { selectedHoldId }),
  };
};

const decodeLoaderInput = (raw: RawSearch): AdminRetentionListInput => {
  const scope = decodeScope(raw.scope);
  const scopeId = decodeNonEmptyString(raw.scopeId);
  const selectedHoldId = decodeNonEmptyString(raw.selectedHoldId);

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedHoldId === undefined ? {} : { selectedHoldId }),
  };
};

const formatDate = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 16).replace("T", " ");

export const Route = createAdminAppFileRoute("/desk/retention")({
  validateSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/retention-list-loader").then(
      ({ loadAdminRetentionListLoaderData }) =>
        loadAdminRetentionListLoaderData(decodeLoaderInput(deps.search)),
    ),
  component: RetentionListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading retention posture…" />
  ),
});

function RetentionListRoute() {
  const data: AdminRetentionListRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view retention posture."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access retention posture."
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

  return <RetentionReadyRoute data={data} />;
}

function RetentionReadyRoute({ data }: { readonly data: ReadyData }) {
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<Tab>(
    data.selectedHoldId === undefined ? "policies" : "holds",
  );
  const policiesState = useTableState<"policy" | "data" | "days">({
    initialPageSize: 25,
  });
  const holdsState = useTableState<"hold" | "data" | "status" | "placed">({
    initialPageSize: 25,
    initialSortKey: "placed",
    initialSortDir: "desc",
  });
  const scheduleState = useTableState<"entry" | "policy" | "data" | "nextRun">({
    initialPageSize: 25,
    initialSortKey: "nextRun",
    initialSortDir: "asc",
  });

  const selectedTarget =
    data.scope === null || data.scopeId === null
      ? undefined
      : buildAdminTenantTarget({
          scope: data.scope,
          scopeId: data.scopeId,
        });
  const targetDisplayName =
    selectedTarget === undefined
      ? null
      : resolveAdminTenantTargetDisplayName(selectedTarget);
  const activeHolds = useMemo(
    () => data.holds.filter((item) => item.legalHoldActive).length,
    [data.holds],
  );
  const releasedHolds = useMemo(
    () => data.holds.filter((item) => item.releasedAt !== undefined).length,
    [data.holds],
  );
  const policiesWithHolds = useMemo(
    () => data.policies.filter((item) => item.legalHoldActive).length,
    [data.policies],
  );
  const selectedHold = useMemo(
    () =>
      data.selectedHoldId === undefined
        ? undefined
        : data.holds.find((item) => item.legalHoldId === data.selectedHoldId),
    [data.holds, data.selectedHoldId],
  );

  const policiesView = applyTableState(data.policies, policiesState, {
    searchOn: (item) => `${item.policyId} ${item.dataType}`,
    sortOn: {
      policy: (item) => item.policyId,
      data: (item) => item.dataType,
      days: (item) => item.retentionDays,
    },
  });
  const holdsView = applyTableState(data.holds, holdsState, {
    searchOn: (item) =>
      `${item.legalHoldId} ${item.dataType} ${item.targetId} ${item.status} ${item.evidence}`,
    sortOn: {
      hold: (item) => item.legalHoldId,
      data: (item) => item.dataType,
      status: (item) => item.status,
      placed: (item) => item.placedAt,
    },
  });
  const scheduleView = applyTableState(data.scheduleEntries, scheduleState, {
    searchOn: (item) => `${item.entryId} ${item.policyId} ${item.dataType}`,
    sortOn: {
      entry: (item) => item.entryId,
      policy: (item) => item.policyId,
      data: (item) => item.dataType,
      nextRun: (item) => item.nextRunAt,
    },
  });

  return (
    <section
      className="ops-screen"
      data-testid="retention-list-ready"
      data-pattern="retention-v3"
    >
      <ScreenHeader
        title="Retention & Legal Holds"
        breadcrumbs={[{ label: "Resources" }, { label: "Retention" }]}
        subtitle={
          selectedTarget === undefined ? (
            <>
              Choose a named tenant target to inspect policies and legal holds.
            </>
          ) : (
            <>
              <span>{targetDisplayName}</span> ·{" "}
              <span className="mono">{selectedTarget.scope}</span> ·{" "}
              <span className="mono">{selectedTarget.scopeId}</span> ·{" "}
              {activeHolds} active holds · {data.policies.length} policies
            </>
          )
        }
      />

      <section className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Choose tenant target</p>
        </div>
        <AdminTenantTargetForm
          initialScope={selectedTarget?.scope}
          initialScopeId={selectedTarget?.scopeId}
          submitLabel="Load retention view"
          submitVariant="secondary"
          onSubmit={(target) =>
            navigate({ search: buildAdminTenantTargetSearch(target) })
          }
        />
      </section>

      {selectedTarget === undefined ? (
        <EmptyState
          title="Choose a tenant target"
          description="Pick a named tenant target above. Exact internal lookup should stay the fallback path, not the normal retention workflow."
        />
      ) : (
        <>
          <div className="ops-bento" data-testid="retention-list-posture">
            <KpiCard
              label="Retention policies"
              value={data.policies.length.toString()}
              tone="accent"
            />
            <KpiCard
              label="Active legal holds"
              value={activeHolds.toString()}
              tone={activeHolds > 0 ? "alert" : "good"}
              icon={activeHolds > 0 ? <AlertIcon /> : undefined}
            />
            <KpiCard
              label="Policies under hold"
              value={policiesWithHolds.toString()}
              tone={policiesWithHolds > 0 ? "warn" : "neutral"}
            />
            <KpiCard
              label="Upcoming schedule"
              value={data.scheduleEntries.length.toString()}
            />
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <OpsPanel
              title="Attention queue"
              tone={
                activeHolds > 0
                  ? "alert"
                  : policiesWithHolds > 0
                    ? "warn"
                    : "neutral"
              }
            >
              <div style={{ display: "grid", gap: 6 }}>
                <AttentionRow
                  label="Active holds requiring release governance"
                  value={`${activeHolds}`}
                  tone={activeHolds > 0 ? "alert" : "neutral"}
                />
                <AttentionRow
                  label="Policies with legal-hold override active"
                  value={`${policiesWithHolds}`}
                  tone={policiesWithHolds > 0 ? "warn" : "neutral"}
                />
                <AttentionRow
                  label="Released holds retained for evidence"
                  value={`${releasedHolds}`}
                  tone={releasedHolds > 0 ? "neutral" : "neutral"}
                />
              </div>
            </OpsPanel>

            {selectedHold === undefined ? (
              <OpsPanel title="Focused hold">
                <p className="ops-text-muted">
                  Open a legal hold from the roster to keep evidence, target,
                  and lifecycle state in reach.
                </p>
              </OpsPanel>
            ) : (
              <OpsPanel
                title="Focused hold"
                tone={
                  resolveStatusVariant(selectedHold.status) === "error"
                    ? "alert"
                    : resolveStatusVariant(selectedHold.status) === "pending"
                      ? "warn"
                      : "neutral"
                }
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className="mono">{selectedHold.legalHoldId}</span>
                    <StatusChip
                      status={selectedHold.status}
                      variant={resolveStatusVariant(selectedHold.status)}
                    />
                  </div>
                  <p style={{ margin: 0 }}>
                    <Badge variant="neutral">{selectedHold.dataType}</Badge>
                  </p>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span className="ops-text-muted">
                      Target:{" "}
                      <span className="mono ops-redacted">
                        {selectedHold.targetId}
                      </span>
                    </span>
                    <span className="ops-text-muted">
                      Evidence:{" "}
                      <span className="mono ops-redacted">
                        {selectedHold.evidence}
                      </span>
                    </span>
                  </div>
                  <div>
                    <Link
                      className="ops-btn ops-btn--xs"
                      to="/desk/legal-hold/$holdId"
                      params={{ holdId: selectedHold.legalHoldId }}
                      search={{
                        scope: selectedTarget.scope,
                        scopeId: selectedTarget.scopeId,
                      }}
                    >
                      <ExternalIcon size={11} /> Open hold detail
                    </Link>
                  </div>
                </div>
              </OpsPanel>
            )}
          </div>

          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              {
                value: "policies",
                label: "Retention policies",
                count: data.policies.length,
              },
              {
                value: "holds",
                label: "Legal holds",
                count: data.holds.length,
              },
              {
                value: "schedule",
                label: "Schedule",
                count: data.scheduleEntries.length,
              },
            ]}
          />

          {tab === "policies" ? (
            <section className="ops-card">
              <FilterBar
                searchValue={policiesState.search}
                onSearchChange={policiesState.setSearch}
                searchPlaceholder="Search policies…"
              />
              {policiesView.visible.length === 0 ? (
                <EmptyState
                  title="No retention policies"
                  description="No policies match the current filters."
                />
              ) : (
                <div
                  className="ops-table-wrapper"
                  data-testid="retention-list-policies-table"
                >
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
                      {policiesView.visible.map((item) => (
                        <tr
                          key={item.policyId}
                          data-testid="retention-list-policy-row"
                        >
                          <td className="mono">{item.policyId}</td>
                          <td>
                            <Badge variant="neutral">{item.dataType}</Badge>
                          </td>
                          <td className="num">{item.retentionDays}</td>
                          <td>
                            <Badge
                              variant={
                                item.legalHoldActive ? "pending" : "neutral"
                              }
                            >
                              {item.legalHoldActive ? "yes" : "no"}
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
            </section>
          ) : null}

          {tab === "holds" ? (
            <section className="ops-card">
              <FilterBar
                searchValue={holdsState.search}
                onSearchChange={holdsState.setSearch}
                searchPlaceholder="Search holds, targets, or evidence…"
              />
              {holdsView.visible.length === 0 ? (
                <EmptyState
                  title="No legal holds"
                  description="No legal holds match the current filters."
                />
              ) : (
                <div
                  className="ops-table-wrapper"
                  data-testid="retention-list-holds-table"
                >
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
                        <th>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdsView.visible.map((item) => {
                        const isFocused =
                          item.legalHoldId === data.selectedHoldId;

                        return (
                          <tr
                            key={item.legalHoldId}
                            data-testid="retention-list-hold-row"
                            style={
                              isFocused
                                ? {
                                    boxShadow:
                                      "inset 0 0 0 1px rgba(161, 170, 255, 0.45)",
                                  }
                                : undefined
                            }
                          >
                            <td className="mono">{item.legalHoldId}</td>
                            <td>
                              <Badge variant="neutral">{item.dataType}</Badge>
                            </td>
                            <td className="mono ops-redacted">
                              {item.targetId}
                            </td>
                            <td>
                              <StatusChip
                                status={item.status}
                                variant={resolveStatusVariant(item.status)}
                              />
                            </td>
                            <td className="mono">
                              {formatDate(item.placedAt)}
                            </td>
                            <td className="mono">
                              {formatDate(item.releasedAt)}
                            </td>
                            <td>
                              <Link
                                className="ops-btn ops-btn--xs"
                                data-testid="retention-list-hold-link"
                                to="/desk/legal-hold/$holdId"
                                params={{ holdId: item.legalHoldId }}
                                search={{
                                  scope: selectedTarget.scope,
                                  scopeId: selectedTarget.scopeId,
                                }}
                              >
                                <ExternalIcon size={11} /> Detail
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
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
            </section>
          ) : null}

          {tab === "schedule" ? (
            <section className="ops-card">
              <FilterBar
                searchValue={scheduleState.search}
                onSearchChange={scheduleState.setSearch}
                searchPlaceholder="Search schedule entries…"
              />
              {scheduleView.visible.length === 0 ? (
                <EmptyState
                  title="No upcoming retention schedule"
                  description="The by-session schedule helper is still pending, so no future purge queue entries are available on this surface yet."
                />
              ) : (
                <div className="ops-table-wrapper">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            scheduleState,
                            "entry",
                          )}
                          onToggle={() => scheduleState.toggleSort("entry")}
                        >
                          Entry
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            scheduleState,
                            "policy",
                          )}
                          onToggle={() => scheduleState.toggleSort("policy")}
                        >
                          Policy
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(scheduleState, "data")}
                          onToggle={() => scheduleState.toggleSort("data")}
                        >
                          Data type
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            scheduleState,
                            "nextRun",
                          )}
                          onToggle={() => scheduleState.toggleSort("nextRun")}
                        >
                          Next run
                        </SortableTableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleView.visible.map((item) => (
                        <tr key={item.entryId}>
                          <td className="mono">{item.entryId}</td>
                          <td className="mono">{item.policyId}</td>
                          <td>{item.dataType}</td>
                          <td className="mono">{formatDate(item.nextRunAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={scheduleState.page}
                pageSize={scheduleState.pageSize}
                total={scheduleView.total}
                onPageChange={scheduleState.setPage}
                onPageSizeChange={scheduleState.setPageSize}
              />
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function AttentionRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: "neutral" | "warn" | "alert";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: 6,
        borderRadius: 8,
        border:
          tone === "alert"
            ? "1px solid rgba(255, 122, 122, 0.35)"
            : tone === "warn"
              ? "1px solid rgba(255, 203, 107, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.08)",
        background:
          tone === "alert"
            ? "rgba(96, 24, 24, 0.24)"
            : tone === "warn"
              ? "rgba(98, 70, 18, 0.2)"
              : "rgba(255, 255, 255, 0.02)",
      }}
    >
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
