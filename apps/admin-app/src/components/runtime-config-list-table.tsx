import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { StatusChip, type StatusChipTone } from "@comvestec/ui";
import type {
  AdminGovernanceConfigOverride,
  AdminGovernanceConfigProposal,
  AdminGovernanceConfigV2RouteData,
} from "../lib/governance-config-route-data";

/**
 * RuntimeConfigListTable — presentational table used by the
 * `/r/config` list pane and the `/r/config/$moduleId/$configKey`
 * detail pane (admin-app implementation plan §8.5 + §11 — Phase 3
 * Governance & access commit 2). The two routes share the same
 * spec-canonical projection so the detail surface always renders
 * the surrounding rows; clicking a row deep-links into the
 * detail variant of the route.
 *
 * The table is intentionally light — the heavy DenseDataTable
 * affordances are kept for the slice 2 access-control surface
 * where bulk-action grids are needed; the runtime-config table
 * surfaces module + key + scope + effective value + pending
 * indicator and points the operator into the detail drawer.
 */
export type RuntimeConfigListReady = Extract<
  AdminGovernanceConfigV2RouteData,
  { readonly kind: "ready" }
>;

export type RuntimeConfigListTableProps = {
  readonly data: RuntimeConfigListReady;
  readonly selectedKey?: string;
};

type RuntimeConfigRow = {
  readonly id: string;
  readonly moduleId: string;
  readonly key: string;
  readonly scope: string;
  readonly scopeId: string;
  readonly effectiveValue: ReactNode;
  readonly pendingProposalCount: number;
  readonly source: string;
};

const toRow = (
  override: AdminGovernanceConfigOverride,
  proposals: readonly AdminGovernanceConfigProposal[],
): RuntimeConfigRow => {
  const pending = proposals.filter(
    (proposal) =>
      proposal.key === override.key &&
      proposal.scope === override.scope &&
      proposal.scopeId === override.scopeId,
  );
  return {
    id: `${override.moduleId}::${override.key}::${override.scope}::${override.scopeId}`,
    moduleId: override.moduleId,
    key: override.key,
    scope: override.scope,
    scopeId: override.scopeId,
    effectiveValue: override.value ?? "—",
    pendingProposalCount: pending.length,
    source: override.source,
  };
};

const pendingTone: StatusChipTone = "drift";

export function RuntimeConfigListTable({
  data,
  selectedKey,
}: RuntimeConfigListTableProps) {
  const rows = useMemo(
    () => data.overrides.map((override) => toRow(override, data.proposals)),
    [data.overrides, data.proposals],
  );

  if (rows.length === 0) {
    return (
      <div data-testid="runtime-config-list-empty" style={{ padding: 6 }}>
        No runtime config overrides match the current module filter.
      </div>
    );
  }

  return (
    <table
      data-testid="runtime-config-list-table"
      data-pattern="runtime-config-list"
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.8125rem",
      }}
    >
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: 4 }}>Module</th>
          <th style={{ textAlign: "left", padding: 4 }}>Key</th>
          <th style={{ textAlign: "left", padding: 4 }}>Scope</th>
          <th style={{ textAlign: "left", padding: 4 }}>Scope id</th>
          <th style={{ textAlign: "left", padding: 4 }}>Effective</th>
          <th style={{ textAlign: "left", padding: 4 }}>Source</th>
          <th style={{ textAlign: "left", padding: 4 }}>Pending</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected =
            selectedKey !== undefined && row.key === selectedKey;
          return (
            <tr
              key={row.id}
              data-testid="runtime-config-list-row"
              data-row-key={row.key}
              data-selected={isSelected ? "true" : "false"}
              style={{
                background: isSelected
                  ? "color-mix(in oklab, var(--accent-bg, rgba(80,160,255,0.18)) 60%, transparent)"
                  : "transparent",
              }}
            >
              <td style={{ padding: 4 }}>{row.moduleId}</td>
              <td style={{ padding: 4 }}>
                <Link
                  data-testid="runtime-config-list-row-link"
                  to="/r/config/$moduleId/$configKey"
                  params={{ moduleId: row.moduleId, configKey: row.key }}
                  preload={false}
                >
                  {row.key}
                </Link>
              </td>
              <td style={{ padding: 4 }}>{row.scope}</td>
              <td style={{ padding: 4 }}>{row.scopeId}</td>
              <td style={{ padding: 4 }}>{row.effectiveValue}</td>
              <td style={{ padding: 4 }}>{row.source}</td>
              <td style={{ padding: 4 }}>
                {row.pendingProposalCount > 0 ? (
                  <StatusChip tone={pendingTone} size="sm">
                    {`${row.pendingProposalCount} pending`}
                  </StatusChip>
                ) : (
                  <span style={{ color: "var(--fg-muted)" }}>—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
