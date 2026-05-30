import { Schema } from "effect";
import { Link } from "@tanstack/react-router";
import { RevealField, StateScreen } from "@comvestec/ui";
import { useState } from "react";
import { platformScope } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { AdminTenantTargetForm } from "../../components/admin-tenant-target-form";
import { KpiCard, ScreenHeader } from "../../components/ui";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../lib/effect-boundary";
import { resolveAdminTenantTargetDisplayName } from "../../lib/admin-tenant-target-display-name";
import { serializeAdminTenantTarget } from "../../lib/admin-tenant-target";
import { formatAdminNumber } from "../../lib/number-format";
import {
  AdminRouteTenantTargetsSearchSchema,
  decodeAdminRouteTenantTargetsSearch,
  decodeAdminRouteTenantTargets,
  dedupeAdminRouteTenantTargets,
  encodeAdminRouteTenantTargets,
} from "../../lib/admin-route-tenant-targets";
import type {
  AdminBillingListInput,
  AdminBillingListRowDegradedSource,
  AdminBillingListRouteData,
  AdminBillingListTenantTarget,
} from "../../lib/billing-list-route-data";

/**
 * `/desk/billing` — spec-canonical Billing Operations v2 surface
 * shipped by Phase 4 Domain operator screens commit 1 (admin-app
 * implementation plan §8.10 + §11). Consumes the
 * `billing-list-{loader,route-data,route-server}.ts` trio,
 * gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId`, and renders the
 * global posture KPIs (MRR / ARR) plus a per-tenant
 * DenseDataTable keyed off the
 * `shell | stale-session | denied | error | ready`
 * discriminated union.
 *
 * Row-level degraded-source signals from the loader surface inline
 * so operators see fallback tenant reads without re-deriving the
 * list. Selecting
 * a row flips the `selectedTenantId` URL state so deep-links
 * round-trip through the loader. The tenant target set itself
 * is supplied via the `tenants` JSON-encoded search param —
 * Phase 1 does not yet expose a typed billing-scope directory
 * aggregate (tracked under the Admin app row's Phase 4
 * follow-ups in the implementation tracker).
 *
 * Refund / Polar action affordances are deep-link-only per
 * `specs/02-apps/admin-app/plan.md §16 Q2`; no mutation surface
 * lives in this loader.
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

const decodeLoaderInput = (raw: RawSearch): AdminBillingListInput => {
  const tenantTargets: readonly AdminBillingListTenantTarget[] =
    decodeAdminRouteTenantTargets(raw.tenants);
  const selectedTenantId = decodeSelectedTenantId(raw.selectedTenantId);
  return {
    tenantTargets,
    ...(selectedTenantId === undefined ? {} : { selectedTenantId }),
  };
};

const formatMinorUnits = (
  amount: number,
  currency: string | null | undefined,
): string => {
  const major = amount / 100;
  const symbol = currency ?? "";
  return `${symbol ? `${symbol} ` : ""}${formatAdminNumber(major, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const Route = createAdminAppFileRoute("/desk/billing")({
  validateSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/billing-list-loader").then(
      ({ loadAdminBillingListLoaderData }) =>
        loadAdminBillingListLoaderData(decodeLoaderInput(deps.search)),
    ),
  component: BillingListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading billing posture…" />
  ),
});

function BillingListRoute() {
  const data: AdminBillingListRouteData = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tenantTargets =
    dedupeAdminRouteTenantTargets<AdminBillingListTenantTarget>(
      decodeAdminRouteTenantTargets(search.tenants),
    );
  const [revealedRows, setRevealedRows] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view billing posture."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access billing posture."
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

  const { posture, rows, selectedTenantId } = data;
  const selectedRow =
    selectedTenantId === undefined
      ? undefined
      : rows.find((row) => row.tenant.scopeId === selectedTenantId);
  const selectedRowKey =
    selectedRow === undefined
      ? undefined
      : `${selectedRow.tenant.scope}:${selectedRow.tenant.scopeId}`;
  const selectedProjection = selectedRow?.projection ?? null;
  const selectedWorkspaceScope =
    selectedRow === undefined
      ? undefined
      : selectedRow.tenant.scope === platformScope.organization ||
          selectedRow.tenant.scope === platformScope.enterprise ||
          selectedRow.tenant.scope === platformScope.individual
        ? selectedRow.tenant.scope
        : undefined;
  const trackedCustomerCount = rows.reduce(
    (total, row) => total + row.customerCount,
    0,
  );
  const projectionGapCount = rows.reduce(
    (total, row) => total + (row.projection === null ? 1 : 0),
    0,
  );
  const degradedTargetCount = rows.reduce(
    (total, row) => total + ((row.degradedSources?.length ?? 0) > 0 ? 1 : 0),
    0,
  );
  const displayNameByTargetKey = new Map(
    rows.map((row) => [
      serializeAdminTenantTarget(row.tenant),
      row.displayName,
    ]),
  );
  const rowByTargetKey = new Map(
    rows.map((row) => [serializeAdminTenantTarget(row.tenant), row]),
  );
  const projectionCoverageBadgeClassName =
    rows.length === 0
      ? "ops-signal-badge ops-signal-badge--accent"
      : projectionGapCount === 0
        ? "ops-signal-badge ops-signal-badge--good"
        : "ops-signal-badge ops-signal-badge--warn";
  const projectionCoverageLabel =
    rows.length === 0
      ? "No targets loaded"
      : projectionGapCount === 0
        ? "Full projection coverage"
        : `${projectionGapCount} projection gap${projectionGapCount === 1 ? "" : "s"}`;

  const toggleReveal = (key: string) => {
    setRevealedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelect = (key: string) => {
    void navigate({
      search: (current) => ({
        ...current,
        selectedTenantId: key,
      }),
    });
  };

  const handleAddTenantTarget = (target: AdminBillingListTenantTarget) => {
    void navigate({
      search: (current) => {
        const nextTargets =
          dedupeAdminRouteTenantTargets<AdminBillingListTenantTarget>([
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

  const handleRemoveTenantTarget = (target: AdminBillingListTenantTarget) => {
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
      data-testid="billing-list-ready"
      data-pattern="billing-v2"
      className="ops-screen ops-screen--tight ops-stack-md"
    >
      <ScreenHeader
        title="Billing Operations"
        breadcrumbs={[{ label: "Resources" }, { label: "Billing" }]}
        subtitle={
          <>
            {posture.tenantCount} tenant{posture.tenantCount === 1 ? "" : "s"}{" "}
            in the current billing board
          </>
        }
        actions={
          <>
            <Link className="ops-btn ops-btn--ghost" to="/desk/tenants">
              Tenant directory
            </Link>
            <Link className="ops-btn ops-btn--ghost" to="/desk/vendors">
              Vendor health
            </Link>
          </>
        }
      />
      <div className="ops-stack-sm">
        <div className="ops-inline-cluster">
          <span className="ops-signal-badge ops-signal-badge--accent">
            {selectedRow === undefined ? "Portfolio view" : "Focused tenant"}
          </span>
          <span className={projectionCoverageBadgeClassName}>
            {projectionCoverageLabel}
          </span>
          {degradedTargetCount > 0 ? (
            <span className="ops-signal-badge ops-signal-badge--warn">
              {degradedTargetCount} degraded target
              {degradedTargetCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div className="ops-pane-grid" data-testid="billing-list-posture">
          <KpiCard
            label="Aggregate MRR (6m)"
            value={formatMinorUnits(
              posture.aggregateMrrMinorUnits,
              posture.currency,
            )}
          />
          <KpiCard
            label="Aggregate ARR (12m)"
            value={formatMinorUnits(
              posture.aggregateArrMinorUnits,
              posture.currency,
            )}
          />
          <KpiCard
            label="Tracked customers"
            value={formatAdminNumber(trackedCustomerCount)}
            tone={trackedCustomerCount > 0 ? "good" : "neutral"}
          />
          <KpiCard
            label="Projection gaps"
            value={projectionGapCount.toString()}
            tone={projectionGapCount > 0 ? "warn" : "good"}
          />
        </div>
      </div>

      <div className="ops-shell-grid">
        <aside data-testid="billing-list-focus">
          <section className="ops-card">
            <div className="ops-card-head">
              <p className="ops-card-head__title">Focused tenant</p>
            </div>
            {selectedRow === undefined ? (
              <div
                className="ops-stack-sm"
                data-testid="billing-list-focus-empty"
              >
                <p className="ops-note">
                  Focus a target from the card deck or the billing table to keep
                  workspace drill-through and source posture in view while you
                  compare revenue.
                </p>
                <div className="ops-inline-cluster">
                  <Link
                    className="ops-btn ops-btn--ghost ops-btn--xs"
                    to="/desk/tenants"
                  >
                    Review tenants
                  </Link>
                  <Link
                    className="ops-btn ops-btn--ghost ops-btn--xs"
                    to="/desk/vendors"
                  >
                    Check Polar health
                  </Link>
                </div>
              </div>
            ) : (
              <div
                className="ops-stack-sm"
                data-testid="billing-list-focus-summary"
              >
                <div className="ops-inline-cluster">
                  <span className="ops-signal-badge ops-signal-badge--accent">
                    {selectedRow.tenant.scope}
                  </span>
                  <span
                    className={
                      selectedProjection === null
                        ? "ops-signal-badge ops-signal-badge--warn"
                        : "ops-signal-badge ops-signal-badge--good"
                    }
                  >
                    {selectedProjection === null
                      ? "Projection gap"
                      : "Projection loaded"}
                  </span>
                  {(selectedRow.degradedSources?.length ?? 0) > 0 ? (
                    <span className="ops-signal-badge ops-signal-badge--warn">
                      Degraded read
                    </span>
                  ) : null}
                </div>
                <div className="ops-cell-stack">
                  <span className="ops-cell-stack__title">
                    {selectedRow.displayName}
                  </span>
                  <span className="mono ops-text-muted">
                    {selectedRow.tenant.scopeId}
                  </span>
                </div>
                {(selectedRow.degradedSources?.length ?? 0) > 0 ? (
                  <p className="ops-note">
                    {describeBillingDegradedSources(
                      selectedRow.degradedSources ?? [],
                    )}
                  </p>
                ) : null}
                <div className="ops-detail-grid">
                  <div className="ops-detail-card">
                    <span className="ops-detail-card__label">Customers</span>
                    <span className="mono">
                      {formatAdminNumber(selectedRow.customerCount)}
                    </span>
                  </div>
                  <div className="ops-detail-card">
                    <span className="ops-detail-card__label">MRR</span>
                    <span className="mono">
                      {selectedProjection === null
                        ? "—"
                        : formatMinorUnits(
                            selectedProjection.snapshot.subscriptionMrr
                              .amountMinorUnits,
                            selectedProjection.snapshot.subscriptionMrr
                              .currency,
                          )}
                    </span>
                  </div>
                  <div className="ops-detail-card">
                    <span className="ops-detail-card__label">
                      Active subscriptions
                    </span>
                    <span className="mono">
                      {selectedProjection === null
                        ? "—"
                        : formatAdminNumber(
                            selectedProjection.snapshot.activeSubscriptionCount,
                          )}
                    </span>
                  </div>
                  <div className="ops-detail-card">
                    <span className="ops-detail-card__label">
                      Source of truth
                    </span>
                    <span>
                      {selectedProjection === null
                        ? "Missing Polar projection"
                        : "Polar projection snapshot"}
                    </span>
                  </div>
                </div>
                <div className="ops-stack-xs">
                  <span className="ops-detail-card__label">
                    Polar account id
                  </span>
                  <RevealField
                    label="Polar account id"
                    value={
                      <span className="mono">
                        {selectedProjection?.snapshot.sourcePolarAccountId ??
                          "—"}
                      </span>
                    }
                    revealed={
                      selectedRowKey === undefined
                        ? false
                        : revealedRows.has(selectedRowKey)
                    }
                    onReveal={() => {
                      if (selectedRowKey !== undefined) {
                        toggleReveal(selectedRowKey);
                      }
                    }}
                    onHide={() => {
                      if (selectedRowKey !== undefined) {
                        toggleReveal(selectedRowKey);
                      }
                    }}
                  />
                </div>
                <div className="ops-inline-cluster">
                  {selectedWorkspaceScope === undefined ? (
                    <Link
                      className="ops-btn ops-btn--ghost ops-btn--xs"
                      to="/desk/vendors"
                    >
                      Review vendor health
                    </Link>
                  ) : (
                    <Link
                      className="ops-btn ops-btn--primary ops-btn--xs"
                      to="/desk/tenant/$tenantId"
                      params={{ tenantId: selectedRow.tenant.scopeId }}
                      search={{ scope: selectedWorkspaceScope }}
                    >
                      Open workspace
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>
        </aside>

        <div className="ops-shell-grid__main">
          <section
            className="ops-card"
            data-testid="billing-list-target-manager"
          >
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                Billing target set
                <span className="ops-card-head__count">
                  {tenantTargets.length}
                </span>
              </p>
            </div>
            <div className="ops-stack-md">
              <p className="ops-note">
                Add named organization or enterprise tenants here instead of
                hand-assembling scope ids. The active set drives the billing
                board, the focused summary, and the workspace pivots.
              </p>
              <AdminTenantTargetForm
                allowedScopes={[
                  platformScope.organization,
                  platformScope.enterprise,
                ]}
                submitLabel="Add billing target"
                submitVariant="secondary"
                onSubmit={handleAddTenantTarget}
              />
              {tenantTargets.length === 0 ? (
                <div
                  className="ops-callout-card ops-stack-xs"
                  data-testid="billing-list-target-empty"
                >
                  <span className="ops-detail-card__label">No targets yet</span>
                  <p className="ops-note">
                    Add a named tenant above, or pivot from{" "}
                    <Link
                      to="/desk/tenants"
                      data-testid="billing-list-pivot-tenants"
                    >
                      tenant directory
                    </Link>{" "}
                    when you want to broaden the current target set.
                  </p>
                </div>
              ) : (
                <div
                  className="ops-link-grid"
                  data-testid="billing-list-target-set"
                >
                  {tenantTargets.map((tenant) => {
                    const key = serializeAdminTenantTarget(tenant);
                    const isFocused = selectedTenantId === tenant.scopeId;
                    const targetRow = rowByTargetKey.get(key);
                    const degradedSources = targetRow?.degradedSources ?? [];

                    return (
                      <article
                        key={key}
                        className="ops-callout-card ops-stack-xs"
                        data-testid="billing-list-target-chip"
                      >
                        <div className="ops-inline-cluster">
                          <span className="ops-signal-badge ops-signal-badge--accent">
                            {tenant.scope}
                          </span>
                          {isFocused ? (
                            <span className="ops-signal-badge ops-signal-badge--good">
                              Focused
                            </span>
                          ) : null}
                          {degradedSources.length > 0 ? (
                            <span className="ops-signal-badge ops-signal-badge--warn">
                              Degraded
                            </span>
                          ) : null}
                        </div>
                        <div className="ops-cell-stack">
                          <span className="ops-cell-stack__title">
                            {displayNameByTargetKey.get(key) ??
                              resolveAdminTenantTargetDisplayName(tenant)}
                          </span>
                          <span className="mono ops-text-muted">
                            {tenant.scopeId}
                          </span>
                        </div>
                        {degradedSources.length > 0 ? (
                          <p className="ops-note">
                            {describeBillingDegradedSources(degradedSources)}
                          </p>
                        ) : null}
                        <div className="ops-inline-cluster">
                          <button
                            type="button"
                            className={
                              isFocused
                                ? "ops-btn ops-btn--primary ops-btn--xs"
                                : "ops-btn ops-btn--xs"
                            }
                            data-testid="billing-list-focus-target"
                            disabled={isFocused}
                            onClick={() => handleSelect(tenant.scopeId)}
                          >
                            {isFocused ? "Focused" : "Focus"}
                          </button>
                          <button
                            type="button"
                            className="ops-btn ops-btn--danger ops-btn--xs"
                            data-testid="billing-list-remove-target"
                            onClick={() => handleRemoveTenantTarget(tenant)}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {rows.length === 0 ? (
            <section className="ops-card" data-testid="billing-list-empty">
              <div className="ops-card-head">
                <p className="ops-card-head__title">Billing board empty</p>
              </div>
              <p className="ops-note">
                Add one or more billing targets above to load tenant posture,
                projection coverage, and customer counts for comparison.
              </p>
            </section>
          ) : (
            <section
              className="ops-card"
              data-testid="billing-list-table-region"
            >
              <div className="ops-card-head">
                <p className="ops-card-head__title">
                  Tenant billing posture
                  <span className="ops-card-head__count">{rows.length}</span>
                </p>
                {selectedRow === undefined ? null : (
                  <div className="ops-card-head__actions">
                    <span className="ops-signal-badge ops-signal-badge--accent">
                      Focused: {selectedRow.displayName}
                    </span>
                  </div>
                )}
              </div>
              <div className="ops-table-wrapper">
                <table
                  className="ops-table"
                  data-testid="billing-list-table"
                  data-pattern="dense-data-table"
                  aria-label="Tenant billing posture"
                >
                  <thead>
                    <tr>
                      <th scope="col">Tenant</th>
                      <th scope="col">Scope</th>
                      <th scope="col">Customers</th>
                      <th scope="col">MRR</th>
                      <th scope="col">Subs</th>
                      <th scope="col">Source id</th>
                      <th scope="col">Focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const rowKey = `${row.tenant.scope}:${row.tenant.scopeId}`;
                      const isSelected =
                        selectedTenantId === row.tenant.scopeId;
                      const revealed = revealedRows.has(rowKey);
                      const degradedSources = row.degradedSources ?? [];

                      return (
                        <tr
                          key={rowKey}
                          className={isSelected ? "is-selected" : undefined}
                          data-testid="billing-list-row"
                          data-row-key={rowKey}
                          data-selected={isSelected ? "true" : "false"}
                        >
                          <td>
                            <div className="ops-cell-stack">
                              <span className="ops-cell-stack__title text-strong">
                                {row.displayName}
                              </span>
                              <span className="mono ops-text-muted">
                                {row.tenant.scopeId}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="ops-inline-cluster">
                              <span className="ops-signal-badge ops-signal-badge--accent">
                                {row.tenant.scope}
                              </span>
                              {degradedSources.length > 0 ? (
                                <span className="ops-signal-badge ops-signal-badge--warn">
                                  Degraded
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="num">
                            {formatAdminNumber(row.customerCount)}
                          </td>
                          <td className="num">
                            {row.projection === null
                              ? "—"
                              : formatMinorUnits(
                                  row.projection.snapshot.subscriptionMrr
                                    .amountMinorUnits,
                                  row.projection.snapshot.subscriptionMrr
                                    .currency,
                                )}
                          </td>
                          <td className="num">
                            {row.projection === null
                              ? "—"
                              : formatAdminNumber(
                                  row.projection.snapshot
                                    .activeSubscriptionCount,
                                )}
                          </td>
                          <td>
                            <RevealField
                              label="Polar account id"
                              value={
                                <span className="mono">
                                  {row.projection?.snapshot
                                    .sourcePolarAccountId ?? "—"}
                                </span>
                              }
                              revealed={revealed}
                              onReveal={() => toggleReveal(rowKey)}
                              onHide={() => toggleReveal(rowKey)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className={
                                isSelected
                                  ? "ops-btn ops-btn--primary ops-btn--xs"
                                  : "ops-btn ops-btn--xs"
                              }
                              data-testid="billing-list-select"
                              disabled={isSelected}
                              onClick={() => handleSelect(row.tenant.scopeId)}
                            >
                              {isSelected ? "Focused" : "Focus"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

function describeBillingDegradedSources(
  degradedSources: readonly AdminBillingListRowDegradedSource[],
): string {
  return degradedSources
    .map((source) =>
      source === "projection"
        ? "Revenue projection unavailable"
        : "Customer read unavailable",
    )
    .join(" · ");
}
