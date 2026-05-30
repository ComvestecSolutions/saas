import { Schema } from "effect";
import { Link } from "@tanstack/react-router";
import { RevealField, StateScreen } from "@comvestec/ui";
import { useState } from "react";
import { platformScope } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { AdminTenantTargetForm } from "../../components/admin-tenant-target-form";
import { KpiCard, ScreenHeader } from "../../components/ui";
import { resolveAdminTenantTargetDisplayName } from "../../lib/admin-tenant-target-display-name";
import { serializeAdminTenantTarget } from "../../lib/admin-tenant-target";
import {
  AdminRouteTenantTargetsSearchSchema,
  decodeAdminRouteTenantTargets,
  dedupeAdminRouteTenantTargets,
  encodeAdminRouteTenantTargets,
} from "../../lib/admin-route-tenant-targets";
import type {
  AdminBillingListInput,
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
 * `partialFailures` from the loader surface inline so operators
 * see degraded tenants without re-deriving the list. Selecting
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

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;

const decodeLoaderInput = (raw: RawSearch): AdminBillingListInput => {
  const tenantTargets: readonly AdminBillingListTenantTarget[] =
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

const formatMinorUnits = (
  amount: number,
  currency: string | null | undefined,
): string => {
  const major = amount / 100;
  const symbol = currency ?? "";
  return `${symbol ? `${symbol} ` : ""}${major.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const Route = createAdminAppFileRoute("/desk/billing")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
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
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Billing Operations"
        breadcrumbs={[{ label: "Resources" }, { label: "Billing" }]}
        subtitle={<>{posture.tenantCount} tenants tracked</>}
      />
      <div
        data-testid="billing-list-posture"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
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
          label="Tenants tracked"
          value={posture.tenantCount.toString()}
        />
      </div>
      <div
        data-testid="billing-list-target-manager"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          border: "1px solid var(--ops-border, rgba(255,255,255,0.14))",
          borderRadius: 12,
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--ops-surface-3, rgba(255,255,255,0.06)) 36%, transparent), color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.02)) 90%, transparent))",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--ops-text-muted, rgba(255,255,255,0.64))",
            }}
          >
            Billing target set
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "0.78rem",
              color: "var(--ops-text-secondary, rgba(255,255,255,0.74))",
            }}
          >
            Add named tenant targets here instead of assembling raw billing
            scope IDs by hand.
          </p>
        </div>
        <AdminTenantTargetForm
          allowedScopes={[platformScope.organization, platformScope.enterprise]}
          submitLabel="Add billing target"
          submitVariant="secondary"
          onSubmit={handleAddTenantTarget}
        />
        {tenantTargets.length === 0 ? (
          <div
            data-testid="billing-list-target-empty"
            style={{
              padding: 8,
              borderRadius: 10,
              border: "1px dashed var(--ops-border, rgba(255,255,255,0.14))",
              color: "var(--ops-text-secondary, rgba(255,255,255,0.74))",
              fontSize: "0.78rem",
            }}
          >
            No billing targets selected yet. Add a named tenant above, or pivot
            from{" "}
            <Link to="/desk/tenants" data-testid="billing-list-pivot-tenants">
              tenant directory
            </Link>{" "}
            when you want to broaden the current target set.
          </div>
        ) : (
          <div
            data-testid="billing-list-target-set"
            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            {tenantTargets.map((tenant) => {
              const key = serializeAdminTenantTarget(tenant);

              return (
                <div
                  key={key}
                  data-testid="billing-list-target-chip"
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
                      color: "var(--ops-text-muted, rgba(255,255,255,0.64))",
                    }}
                  >
                    {tenant.scopeId}
                  </span>
                  <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                    <button
                      type="button"
                      data-testid="billing-list-focus-target"
                      onClick={() => handleSelect(tenant.scopeId)}
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      data-testid="billing-list-remove-target"
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
      {rows.length === 0 ? (
        <div data-testid="billing-list-empty" style={{ padding: 6 }}>
          Add one or more billing targets above to load tenant posture.
        </div>
      ) : (
        <table
          data-testid="billing-list-table"
          data-pattern="dense-data-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.8125rem",
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 4 }}>Tenant</th>
              <th style={{ textAlign: "left", padding: 4 }}>Scope</th>
              <th style={{ textAlign: "right", padding: 4 }}>Customers</th>
              <th style={{ textAlign: "right", padding: 4 }}>MRR</th>
              <th style={{ textAlign: "right", padding: 4 }}>Subs</th>
              <th style={{ textAlign: "left", padding: 4 }}>Source id</th>
              <th style={{ textAlign: "left", padding: 4 }}>Drill</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowKey = `${row.tenant.scope}:${row.tenant.scopeId}`;
              const isSelected = selectedTenantId === row.tenant.scopeId;
              const revealed = revealedRows.has(rowKey);
              return (
                <tr
                  key={rowKey}
                  data-testid="billing-list-row"
                  data-row-key={rowKey}
                  data-selected={isSelected ? "true" : "false"}
                  style={{
                    background: isSelected
                      ? "var(--bg-2, transparent)"
                      : "transparent",
                  }}
                >
                  <td style={{ padding: 4 }} className="mono">
                    <div style={{ display: "grid", gap: 2 }}>
                      <span
                        style={{
                          fontFamily: "var(--ops-font-display, inherit)",
                          fontWeight: 700,
                        }}
                      >
                        {row.displayName}
                      </span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color:
                            "var(--ops-text-muted, rgba(255,255,255,0.64))",
                        }}
                      >
                        {row.tenant.scopeId}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: 4 }}>{row.tenant.scope}</td>
                  <td style={{ padding: 4, textAlign: "right" }}>
                    {row.customerCount}
                  </td>
                  <td style={{ padding: 4, textAlign: "right" }}>
                    {row.projection === null
                      ? "—"
                      : formatMinorUnits(
                          row.projection.snapshot.subscriptionMrr
                            .amountMinorUnits,
                          row.projection.snapshot.subscriptionMrr.currency,
                        )}
                  </td>
                  <td style={{ padding: 4, textAlign: "right" }}>
                    {row.projection === null
                      ? "—"
                      : row.projection.snapshot.activeSubscriptionCount}
                  </td>
                  <td style={{ padding: 4 }}>
                    <RevealField
                      label="Polar account id"
                      value={
                        <span className="mono">
                          {row.projection?.snapshot.sourcePolarAccountId ?? "—"}
                        </span>
                      }
                      revealed={revealed}
                      onReveal={() => toggleReveal(rowKey)}
                      onHide={() => toggleReveal(rowKey)}
                    />
                  </td>
                  <td style={{ padding: 4 }}>
                    <button
                      type="button"
                      data-testid="billing-list-select"
                      onClick={() => handleSelect(row.tenant.scopeId)}
                    >
                      Select
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
