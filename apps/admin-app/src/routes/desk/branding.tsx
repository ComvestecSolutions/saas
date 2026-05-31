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
  OpsPanel,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  Tabs,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../lib/effect-boundary";
import { resolveAdminTenantTargetDisplayName } from "../../lib/admin-tenant-target-display-name";
import {
  buildAdminTenantTarget,
  buildAdminTenantWorkspacePath,
  serializeAdminTenantTarget,
} from "../../lib/admin-tenant-target";
import {
  AdminRouteTenantTargetsSearchSchema,
  decodeAdminRouteTenantTargetsSearch,
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
const RawSearchBoundarySchema = Schema.Struct({
  tenants: Schema.optional(Schema.Unknown),
  selectedTenantId: Schema.optional(Schema.Unknown),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type ReadyData = Extract<
  AdminBrandingListRouteData,
  { readonly kind: "ready" }
>;
type BrandingFilter = "all" | "attention" | "supported" | "unsupported";
const decodeRawSearchBoundary = decodeSyncBoundary(RawSearchBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const decodeSelectedTenantId = decodeSchemaOrUndefined(Schema.NonEmptyString);

const validateSearch = (raw: unknown): RawSearch => {
  const search = decodeRawSearchBoundary(raw);
  const tenants = decodeAdminRouteTenantTargetsSearch(search.tenants);
  const selectedTenantId = decodeSearchString(search.selectedTenantId);

  return {
    ...(tenants === undefined ? {} : { tenants }),
    ...(selectedTenantId === undefined ? {} : { selectedTenantId }),
  };
};

const decodeLoaderInput = (raw: RawSearch): AdminBrandingListInput => {
  const tenantTargets: readonly AdminBrandingListTenantTarget[] =
    decodeAdminRouteTenantTargets(raw.tenants);
  const selectedTenantId = decodeSelectedTenantId(raw.selectedTenantId);

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

const resolveBrandingSelectionKey = (
  tenant: AdminBrandingListTenantTarget,
): string => serializeAdminTenantTarget(tenant);

const isMatchingBrandingSelection = (
  selectedTenantId: string | undefined,
  tenant: AdminBrandingListTenantTarget,
): boolean =>
  selectedTenantId !== undefined &&
  (selectedTenantId === tenant.scopeId ||
    selectedTenantId === resolveBrandingSelectionKey(tenant));

export const Route = createAdminAppFileRoute("/desk/branding")({
  validateSearch,
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
        : data.rows.find((row) =>
            isMatchingBrandingSelection(data.selectedTenantId, row.tenant),
          ),
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

  const handleSelect = (target: AdminBrandingListTenantTarget) => {
    void navigate({
      search: (current) => ({
        ...current,
        selectedTenantId: resolveBrandingSelectionKey(target),
      }),
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
          selectedTenantId: resolveBrandingSelectionKey(target),
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
          ...(isMatchingBrandingSelection(current.selectedTenantId, target)
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

      <div className="ops-shell-grid">
        <aside className="ops-shell-grid__aside">
          <section
            className="ops-card"
            data-testid="branding-list-target-manager"
          >
            <div className="ops-card-head">
              <p className="ops-card-head__title">Branding target set</p>
              <span className="ops-card-head__count">
                {tenantTargets.length}
              </span>
            </div>
            <div className="ops-stack-md">
              <p className="ops-note">
                Queue named organization or enterprise tenants here so branding
                review stays operator-readable instead of JSON-shaped.
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
                  className="ops-target-picker-empty"
                  data-testid="branding-list-empty"
                >
                  No branding targets selected yet. Add a named tenant above, or
                  pivot from{" "}
                  <Link
                    to="/desk/tenants"
                    data-testid="branding-list-pivot-tenants"
                  >
                    tenant directory
                  </Link>{" "}
                  when you want to compare posture across more than one company.
                </div>
              ) : (
                <div
                  className="ops-stack-sm"
                  data-testid="branding-list-target-set"
                >
                  {tenantTargets.map((tenant) => {
                    const key = resolveBrandingSelectionKey(tenant);
                    const isSelected = isMatchingBrandingSelection(
                      data.selectedTenantId,
                      tenant,
                    );

                    return (
                      <div
                        key={key}
                        data-testid="branding-list-target-chip"
                        data-selected={isSelected ? "true" : "false"}
                        className="ops-target-card"
                      >
                        <div className="ops-target-card-header">
                          <div>
                            <p className="ops-target-card-title">
                              {resolveAdminTenantTargetDisplayName(tenant)}
                            </p>
                            <p className="ops-target-card-subtitle">
                              {tenant.scope}
                            </p>
                            <p className="ops-target-card-meta">
                              {tenant.scopeId}
                            </p>
                          </div>
                          {isSelected ? (
                            <Badge variant="active">Focused</Badge>
                          ) : null}
                        </div>
                        <div className="ops-inline-actions">
                          <button
                            type="button"
                            className="ops-btn ops-btn--xs"
                            data-testid="branding-list-focus-target"
                            aria-pressed={isSelected}
                            onClick={() => handleSelect(tenant)}
                          >
                            Focus
                          </button>
                          <button
                            type="button"
                            className="ops-btn ops-btn--xs"
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

          <OpsPanel
            title="Comparison workflow"
            description="Keep a compact queue of the tenants you are actively comparing."
            tone="neutral"
          >
            <ul className="ops-guidance-list">
              <li>
                Start from named tenants rather than hand-editing URL payloads.
              </li>
              <li>
                Focus one tenant to keep workspace pivots and posture details
                anchored.
              </li>
              <li>
                Use the posture table below to compare changed domains,
                support-safe company identity, and unsupported scope drift.
              </li>
            </ul>
          </OpsPanel>
        </aside>

        <div className="ops-shell-grid__main">
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

          <div className="ops-pane-grid">
            {selectedRow === undefined ? (
              <>
                <OpsPanel
                  title="Focus a tenant"
                  description="Choose one of the queued tenants to keep support-safe company identity, effective scope, and workspace pivots in reach while you compare."
                >
                  <EmptyState
                    title="Choose branding targets"
                    description="Start with named organization or enterprise targets from the target queue to build a usable posture board."
                  />
                </OpsPanel>
                <OpsPanel
                  title="What stays here"
                  description="This route owns the comparison workflow, not the deeper publication helpers."
                >
                  <div className="ops-target-signal-list">
                    <div className="ops-target-signal">
                      <div className="ops-target-signal-copy">
                        <p className="ops-target-signal-title">
                          Support-safe posture
                        </p>
                        <p className="ops-target-signal-detail">
                          Company identity, effective scope, and custom-domain
                          status stay visible without exposing publisher-only
                          fields.
                        </p>
                      </div>
                    </div>
                    <div className="ops-target-signal">
                      <div className="ops-target-signal-copy">
                        <p className="ops-target-signal-title">
                          Workspace pivot
                        </p>
                        <p className="ops-target-signal-detail">
                          Move from the focused tenant into the full tenant
                          workspace when you need deeper branding helpers.
                        </p>
                      </div>
                    </div>
                  </div>
                </OpsPanel>
              </>
            ) : (
              <>
                <OpsPanel
                  title="Focused tenant"
                  description="Keep the selected company anchored while you compare the rest of the queue."
                  tone={selectedRow.unsupported ? "warn" : "neutral"}
                  data-testid="branding-list-focus-panel"
                >
                  <div className="ops-stack-md">
                    <div className="ops-inline-cluster">
                      <span className="ops-copy-row ops-copy-row--strong">
                        {getBrandingRowDisplayName(selectedRow)}
                      </span>
                      {selectedRow.unsupported ? (
                        <Badge variant="neutral">unsupported scope</Badge>
                      ) : (
                        <StatusChip
                          status={
                            selectedRow.branding?.customDomainStatus ?? "—"
                          }
                          variant={resolveStatusVariant(
                            selectedRow.branding?.customDomainStatus ?? "—",
                          )}
                        />
                      )}
                    </div>
                    <div className="ops-meta-grid">
                      <div>
                        <p className="ops-meta-label">Company</p>
                        <p className="ops-meta-value ops-redacted">
                          {selectedRow.branding?.companyName ??
                            "Unsupported scope"}
                        </p>
                      </div>
                      <div>
                        <p className="ops-meta-label">Effective scope</p>
                        <p className="ops-meta-value ops-meta-value--mono">
                          {selectedRow.branding?.effectiveScope ??
                            selectedRow.tenant.scope}
                        </p>
                      </div>
                      <div>
                        <p className="ops-meta-label">Last changed</p>
                        <p className="ops-meta-value ops-meta-value--mono">
                          {formatDate(selectedRow.branding?.changedAt)}
                        </p>
                      </div>
                    </div>
                    <p className="ops-note">
                      Side-by-side preview, asset publish, and sender-identity
                      actions still live behind the deeper typed branding
                      helpers. This workspace keeps the comparison loop fast.
                    </p>
                    {(() => {
                      const workspaceTarget = buildAdminTenantTarget({
                        scope: selectedRow.tenant.scope,
                        scopeId: selectedRow.tenant.scopeId,
                      });

                      return workspaceTarget === undefined ? null : (
                        <div className="ops-inline-actions">
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
                </OpsPanel>

                <OpsPanel
                  title="Focused posture"
                  description="Signal deck for the currently selected tenant."
                >
                  <div className="ops-target-signal-list">
                    <div className="ops-target-signal">
                      <div className="ops-target-signal-copy">
                        <p className="ops-target-signal-title">
                          Domain lifecycle
                        </p>
                        <p className="ops-target-signal-detail">
                          {getBrandingRowDomainStatus(selectedRow)}
                        </p>
                      </div>
                    </div>
                    <div className="ops-target-signal">
                      <div className="ops-target-signal-copy">
                        <p className="ops-target-signal-title">
                          Support-safe company view
                        </p>
                        <p className="ops-target-signal-detail">
                          {selectedRow.unsupported
                            ? "Scope is unsupported for branding posture review."
                            : "Company identity is available and ready for side-by-side review."}
                        </p>
                      </div>
                    </div>
                    <div className="ops-target-signal">
                      <div className="ops-target-signal-copy">
                        <p className="ops-target-signal-title">
                          Queue coverage
                        </p>
                        <p className="ops-target-signal-detail">
                          {tenantTargets.length} named target
                          {tenantTargets.length === 1 ? "" : "s"} loaded into
                          the active comparison board.
                        </p>
                      </div>
                    </div>
                  </div>
                </OpsPanel>
              </>
            )}
          </div>

          {tenantTargets.length === 0 ? null : (
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
                            ariaSort={resolveTableAriaSort(
                              tableState,
                              "target",
                            )}
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
                            ariaSort={resolveTableAriaSort(
                              tableState,
                              "company",
                            )}
                            onToggle={() => tableState.toggleSort("company")}
                          >
                            Company
                          </SortableTableHeader>
                          <SortableTableHeader
                            ariaSort={resolveTableAriaSort(
                              tableState,
                              "status",
                            )}
                            onToggle={() => tableState.toggleSort("status")}
                          >
                            Domain status
                          </SortableTableHeader>
                          <th>Effective scope</th>
                          <SortableTableHeader
                            ariaSort={resolveTableAriaSort(
                              tableState,
                              "changed",
                            )}
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
                          const isSelected = isMatchingBrandingSelection(
                            data.selectedTenantId,
                            row.tenant,
                          );
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
                                  <Badge variant="neutral">
                                    unsupported scope
                                  </Badge>
                                ) : (
                                  <StatusChip
                                    status={
                                      row.branding?.customDomainStatus ?? "—"
                                    }
                                    variant={resolveStatusVariant(
                                      row.branding?.customDomainStatus ?? "—",
                                    )}
                                  />
                                )}
                              </td>
                              <td className="mono">
                                {row.branding?.effectiveScope ??
                                  row.tenant.scope}
                              </td>
                              <td className="mono">
                                {formatDate(row.branding?.changedAt)}
                              </td>
                              <td>
                                <div className="ops-inline-actions">
                                  <button
                                    type="button"
                                    className="ops-btn ops-btn--xs"
                                    data-testid="branding-list-select"
                                    aria-pressed={isSelected}
                                    onClick={() => handleSelect(row.tenant)}
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
        </div>
      </div>
    </section>
  );
}
