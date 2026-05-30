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
import { platformScope } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { AdminTenantTargetForm } from "../../components/admin-tenant-target-form";
import {
  ExternalIcon,
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  Tabs,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import { resolveAdminTenantTargetDisplayName } from "../../lib/admin-tenant-target-display-name";
import {
  buildAdminTenantTarget,
  buildAdminTenantWorkspacePath,
  serializeAdminTenantTarget,
} from "../../lib/admin-tenant-target";
import {
  AdminRouteTenantTargetsSearchSchema,
  decodeAdminRouteTenantTargets,
  dedupeAdminRouteTenantTargets,
  encodeAdminRouteTenantTargets,
} from "../../lib/admin-route-tenant-targets";
import type {
  AdminBrandingListInput,
  AdminBrandingListRouteData,
  AdminBrandingListRow,
  AdminBrandingListTenantTarget,
} from "../../lib/branding-list-route-data";

/**
 * `/desk/branding` — canonical branding operations surface.
 *
 * The canonical branding route keeps the
 * `branding-list-{loader,route-data,route-server}` contract, but
 * upgrades the operator UX to match the rest of the redesign:
 * in-route target management, search and filter controls, posture
 * KPIs, and focused tenant context instead of a JSON-driven table
 * shell.
 */

const RawSearchSchema = Schema.Struct({
  tenants: AdminRouteTenantTargetsSearchSchema,
  selectedTenantId: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type ReadyData = Extract<
  AdminBrandingListRouteData,
  { readonly kind: "ready" }
>;
type BrandingFilter = "all" | "attention" | "supported" | "unsupported";

const decodeLoaderInput = (raw: RawSearch): AdminBrandingListInput => {
  const tenantTargets: readonly AdminBrandingListTenantTarget[] =
    decodeAdminRouteTenantTargets(raw.tenants);
  const selectedTenantId =
    raw.selectedTenantId !== undefined && raw.selectedTenantId.length > 0
      ? raw.selectedTenantId
      : undefined;

  return {
    tenantTargets,
    ...(selectedTenantId === undefined ? {} : { selectedTenantId }),
  };
};

const formatDate = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 16).replace("T", " ");

const getBrandingRowDisplayName = (row: AdminBrandingListRow): string =>
  resolveAdminTenantTargetDisplayName(row.tenant);

const getBrandingRowDomainStatus = (row: AdminBrandingListRow): string =>
  row.unsupported
    ? "unsupported scope"
    : (row.branding?.customDomainStatus ?? "—");

const isBrandingAttentionRow = (row: AdminBrandingListRow): boolean =>
  row.unsupported || row.branding?.customDomainStatus === "verifying";

export const Route = createAdminAppFileRoute("/desk/branding")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/branding-list-loader").then(
      ({ loadAdminBrandingListLoaderData }) =>
        loadAdminBrandingListLoaderData(decodeLoaderInput(deps.search)),
    ),
  component: BrandingListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading branding posture…" />
  ),
});

function BrandingListRoute() {
  const data: AdminBrandingListRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view branding posture."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access branding posture."
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

  return <BrandingReadyRoute data={data} />;
}

function BrandingReadyRoute({ data }: { readonly data: ReadyData }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filter, setFilter] = useState<BrandingFilter>("all");
  const tableState = useTableState<
    "target" | "scope" | "company" | "status" | "changed"
  >({
    initialPageSize: 25,
    initialSortKey: "changed",
    initialSortDir: "desc",
  });
  const tenantTargets =
    dedupeAdminRouteTenantTargets<AdminBrandingListTenantTarget>(
      decodeAdminRouteTenantTargets(search.tenants),
    );
  const supportedRows = useMemo(
    () => data.rows.filter((row) => row.unsupported === false),
    [data.rows],
  );
  const unsupportedRows = useMemo(
    () => data.rows.filter((row) => row.unsupported === true),
    [data.rows],
  );
  const attentionRows = useMemo(
    () => data.rows.filter((row) => isBrandingAttentionRow(row)),
    [data.rows],
  );
  const activeDomainCount = useMemo(
    () =>
      supportedRows.filter(
        (row) => row.branding?.customDomainStatus === "active",
      ).length,
    [supportedRows],
  );
  const verifyingDomainCount = useMemo(
    () =>
      supportedRows.filter(
        (row) => row.branding?.customDomainStatus === "verifying",
      ).length,
    [supportedRows],
  );
  const selectedRow = useMemo(
    () =>
      data.selectedTenantId === undefined
        ? undefined
        : data.rows.find((row) => row.tenant.scopeId === data.selectedTenantId),
    [data.rows, data.selectedTenantId],
  );
  const filteredRows = useMemo(() => {
    switch (filter) {
      case "attention":
        return attentionRows;
      case "supported":
        return supportedRows;
      case "unsupported":
        return unsupportedRows;
      default:
        return data.rows;
    }
  }, [attentionRows, data.rows, filter, supportedRows, unsupportedRows]);
  const tableView = applyTableState(filteredRows, tableState, {
    searchOn: (row) =>
      `${getBrandingRowDisplayName(row)} ${row.tenant.scopeId} ${row.tenant.scope} ${
        row.branding?.companyName ?? ""
      } ${getBrandingRowDomainStatus(row)} ${row.branding?.effectiveScope ?? ""}`,
    sortOn: {
      target: (row) => getBrandingRowDisplayName(row),
      scope: (row) => row.tenant.scope,
      company: (row) => row.branding?.companyName ?? "",
      status: (row) => getBrandingRowDomainStatus(row),
      changed: (row) => row.branding?.changedAt ?? "",
    },
  });

  const handleSelect = (scopeId: string) => {
    void navigate({
      search: (current) => ({ ...current, selectedTenantId: scopeId }),
    });
  };

  const handleAddTenantTarget = (target: AdminBrandingListTenantTarget) => {
    void navigate({
      search: (current) => {
        const nextTargets =
          dedupeAdminRouteTenantTargets<AdminBrandingListTenantTarget>([
            ...decodeAdminRouteTenantTargets(current.tenants),
            target,
          ]);

        return {
          ...current,
          tenants: encodeAdminRouteTenantTargets(nextTargets),
          selectedTenantId: target.scopeId,
        };
      },
    });
  };

  const handleRemoveTenantTarget = (target: AdminBrandingListTenantTarget) => {
    void navigate({
      search: (current) => {
        const remainingTargets = decodeAdminRouteTenantTargets(
          current.tenants,
        ).filter(
          (candidate) =>
            serializeAdminTenantTarget(candidate) !==
            serializeAdminTenantTarget(target),
        );

        return {
          ...current,
          tenants: encodeAdminRouteTenantTargets(remainingTargets),
          ...(current.selectedTenantId === target.scopeId
            ? { selectedTenantId: undefined }
            : {}),
        };
      },
    });
  };

  return (
    <section
      className="ops-screen"
      data-testid="branding-list-ready"
      data-pattern="branding-v3"
    >
      <ScreenHeader
        title="Branding & Domains"
        breadcrumbs={[{ label: "Resources" }, { label: "Branding" }]}
        subtitle={
          tenantTargets.length === 0 ? (
            <>Build a named tenant target set to review branding posture.</>
          ) : (
            <>
              {supportedRows.length} supported target
              {supportedRows.length === 1 ? "" : "s"} · {verifyingDomainCount}{" "}
              verifying domain
              {verifyingDomainCount === 1 ? "" : "s"}
            </>
          )
        }
      />

      <div className="ops-bento" data-testid="branding-list-posture">
        <KpiCard
          label="Targets tracked"
          value={tenantTargets.length.toString()}
        />
        <KpiCard
          label="Active domains"
          value={activeDomainCount.toString()}
          tone={activeDomainCount > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Verifying domains"
          value={verifyingDomainCount.toString()}
          tone={verifyingDomainCount > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Unsupported scopes"
          value={unsupportedRows.length.toString()}
          tone={unsupportedRows.length > 0 ? "alert" : "neutral"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, 1fr)",
        }}
      >
        <section
          className="ops-card"
          data-testid="branding-list-target-manager"
        >
          <div className="ops-card-head">
            <p className="ops-card-head__title">Branding target set</p>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <p className="ops-text-muted" style={{ margin: 0 }}>
              Add named tenant targets here instead of assembling raw branding
              tenant JSON by hand.
            </p>
            <AdminTenantTargetForm
              allowedScopes={[
                platformScope.organization,
                platformScope.enterprise,
              ]}
              submitLabel="Add branding target"
              submitVariant="secondary"
              onSubmit={handleAddTenantTarget}
            />
            {tenantTargets.length === 0 ? (
              <div
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border:
                    "1px dashed var(--ops-border, rgba(255,255,255,0.14))",
                  color: "var(--ops-text-secondary, rgba(255,255,255,0.74))",
                  fontSize: "0.78rem",
                }}
              >
                No branding targets selected yet. Add a named tenant above, or
                pivot from{" "}
                <Link
                  to="/desk/tenants"
                  data-testid="branding-list-pivot-tenants"
                >
                  tenant directory
                </Link>{" "}
                when you want to broaden the current posture board.
              </div>
            ) : (
              <div
                data-testid="branding-list-target-set"
                style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
              >
                {tenantTargets.map((tenant) => {
                  const key = serializeAdminTenantTarget(tenant);

                  return (
                    <div
                      key={key}
                      data-testid="branding-list-target-chip"
                      style={{
                        display: "grid",
                        gap: 2,
                        minWidth: 180,
                        padding: 8,
                        borderRadius: 10,
                        border:
                          "1px solid var(--ops-border, rgba(255,255,255,0.14))",
                        background:
                          "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.02)) 92%, transparent)",
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>
                        {resolveAdminTenantTargetDisplayName(tenant)}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: "0.72rem",
                          color:
                            "var(--ops-text-muted, rgba(255,255,255,0.64))",
                        }}
                      >
                        {tenant.scopeId}
                      </span>
                      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                        <button
                          type="button"
                          data-testid="branding-list-focus-target"
                          onClick={() => handleSelect(tenant.scopeId)}
                        >
                          Focus
                        </button>
                        <button
                          type="button"
                          data-testid="branding-list-remove-target"
                          onClick={() => handleRemoveTenantTarget(tenant)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Focused tenant</p>
          </div>
          {selectedRow === undefined ? (
            <p className="ops-text-muted" style={{ margin: 0 }}>
              Focus a tenant to keep branding posture, support-safe company
              identity, and workspace pivots in reach while you compare targets.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span>{getBrandingRowDisplayName(selectedRow)}</span>
                {selectedRow.unsupported ? (
                  <Badge variant="neutral">unsupported scope</Badge>
                ) : (
                  <StatusChip
                    status={selectedRow.branding?.customDomainStatus ?? "—"}
                    variant={resolveStatusVariant(
                      selectedRow.branding?.customDomainStatus ?? "—",
                    )}
                  />
                )}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <span className="ops-text-muted">
                  Company:{" "}
                  <span className="mono ops-redacted">
                    {selectedRow.branding?.companyName ?? "Unsupported scope"}
                  </span>
                </span>
                <span className="ops-text-muted">
                  Effective scope:{" "}
                  <span className="mono">
                    {selectedRow.branding?.effectiveScope ??
                      selectedRow.tenant.scope}
                  </span>
                </span>
                <span className="ops-text-muted">
                  Changed:{" "}
                  <span className="mono">
                    {formatDate(selectedRow.branding?.changedAt)}
                  </span>
                </span>
              </div>
              <p className="ops-text-muted" style={{ margin: 0 }}>
                Side-by-side preview, asset publish, and sender-identity actions
                still depend on the deeper typed branding helpers. This
                workspace keeps the target set and posture comparison usable
                now.
              </p>
              {(() => {
                const workspaceTarget = buildAdminTenantTarget({
                  scope: selectedRow.tenant.scope,
                  scopeId: selectedRow.tenant.scopeId,
                });

                return workspaceTarget === undefined ? null : (
                  <div>
                    <Link
                      className="ops-btn ops-btn--xs"
                      to={buildAdminTenantWorkspacePath(workspaceTarget)}
                    >
                      <ExternalIcon size={11} /> Open workspace
                    </Link>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      </div>

      {tenantTargets.length === 0 ? (
        <div data-testid="branding-list-empty">
          <EmptyState
            title="Choose branding targets"
            description="Start with named organization or enterprise targets above. Branding review should not begin from a machine-shaped URL payload."
          />
        </div>
      ) : (
        <>
          <Tabs<BrandingFilter>
            value={filter}
            onChange={setFilter}
            items={[
              { value: "all", label: "All", count: data.rows.length },
              {
                value: "attention",
                label: "Needs attention",
                count: attentionRows.length,
              },
              {
                value: "supported",
                label: "Supported",
                count: supportedRows.length,
              },
              {
                value: "unsupported",
                label: "Unsupported",
                count: unsupportedRows.length,
              },
            ]}
          />

          <section className="ops-card">
            <FilterBar
              searchValue={tableState.search}
              onSearchChange={tableState.setSearch}
              searchPlaceholder="Search target, company, or domain status…"
            />
            {tableView.visible.length === 0 ? (
              <EmptyState
                title="No branding targets match"
                description="Adjust the current search or filter to restore branding rows."
              />
            ) : (
              <div
                className="ops-table-wrapper"
                data-testid="branding-list-table"
              >
                <table className="ops-table">
                  <thead>
                    <tr>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "target")}
                        onToggle={() => tableState.toggleSort("target")}
                      >
                        Tenant
                      </SortableTableHeader>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "scope")}
                        onToggle={() => tableState.toggleSort("scope")}
                      >
                        Scope
                      </SortableTableHeader>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "company")}
                        onToggle={() => tableState.toggleSort("company")}
                      >
                        Company
                      </SortableTableHeader>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "status")}
                        onToggle={() => tableState.toggleSort("status")}
                      >
                        Domain status
                      </SortableTableHeader>
                      <th>Effective scope</th>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "changed")}
                        onToggle={() => tableState.toggleSort("changed")}
                      >
                        Changed
                      </SortableTableHeader>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableView.visible.map((row) => {
                      const rowKey = `${row.tenant.scope}:${row.tenant.scopeId}`;
                      const isSelected =
                        data.selectedTenantId === row.tenant.scopeId;
                      const workspaceTarget = buildAdminTenantTarget({
                        scope: row.tenant.scope,
                        scopeId: row.tenant.scopeId,
                      });

                      return (
                        <tr
                          key={rowKey}
                          data-testid="branding-list-row"
                          data-row-key={rowKey}
                          data-selected={isSelected ? "true" : "false"}
                          style={
                            isSelected
                              ? {
                                  boxShadow:
                                    "inset 0 0 0 1px rgba(161, 170, 255, 0.45)",
                                }
                              : undefined
                          }
                        >
                          <td>
                            <div style={{ display: "grid", gap: 2 }}>
                              <span>{getBrandingRowDisplayName(row)}</span>
                              <span className="mono ops-text-muted">
                                {row.tenant.scopeId}
                              </span>
                            </div>
                          </td>
                          <td className="mono">{row.tenant.scope}</td>
                          <td>
                            {row.unsupported ? (
                              <span className="ops-text-muted">
                                Unsupported scope
                              </span>
                            ) : (
                              (row.branding?.companyName ?? "—")
                            )}
                          </td>
                          <td data-testid="branding-list-domain-status">
                            {row.unsupported ? (
                              <Badge variant="neutral">unsupported scope</Badge>
                            ) : (
                              <StatusChip
                                status={row.branding?.customDomainStatus ?? "—"}
                                variant={resolveStatusVariant(
                                  row.branding?.customDomainStatus ?? "—",
                                )}
                              />
                            )}
                          </td>
                          <td className="mono">
                            {row.branding?.effectiveScope ?? row.tenant.scope}
                          </td>
                          <td className="mono">
                            {formatDate(row.branding?.changedAt)}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                type="button"
                                data-testid="branding-list-select"
                                onClick={() => handleSelect(row.tenant.scopeId)}
                              >
                                Focus
                              </button>
                              {workspaceTarget === undefined ? null : (
                                <Link
                                  className="ops-btn ops-btn--xs"
                                  to={buildAdminTenantWorkspacePath(
                                    workspaceTarget,
                                  )}
                                >
                                  <ExternalIcon size={11} /> Open
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={tableState.page}
              pageSize={tableState.pageSize}
              total={tableView.total}
              onPageChange={tableState.setPage}
              onPageSizeChange={tableState.setPageSize}
            />
          </section>
        </>
      )}
    </section>
  );
}
