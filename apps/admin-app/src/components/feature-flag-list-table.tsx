import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { StatusChip, type StatusChipTone } from "@comvestec/ui";
import { featureFlagLifecycle } from "@comvestec/contracts";
import type {
  AdminGovernanceFlag,
  AdminGovernanceFlagV2RouteData,
} from "../lib/governance-flag-route-data";

/**
 * FeatureFlagListTable — presentational table used by the
 * `/desk/flag` list pane and the `/desk/flag/$flagKey` detail pane
 * (admin-app implementation plan §8.6 + §11 — Phase 3 Governance
 * & access commit 3). Mirrors the `/desk/config`
 * `RuntimeConfigListTable`: the two routes share the same
 * spec-canonical projection so the detail surface always renders
 * the surrounding rows, and clicking a row deep-links into the
 * detail variant of the route.
 *
 * Columns: flagKey · moduleId · lifecycleState · billable
 * (entitled) · source · dependencies-count · effective state.
 */
export type FeatureFlagListReady = Extract<
  AdminGovernanceFlagV2RouteData,
  { readonly kind: "ready" }
>;

export type FeatureFlagListTableProps = {
  readonly data: FeatureFlagListReady;
  readonly selectedKey?: string;
};

type FeatureFlagRow = {
  readonly key: string;
  readonly moduleId: string;
  readonly lifecycle: ReactNode;
  readonly lifecycleTone: StatusChipTone;
  readonly billable: ReactNode;
  readonly source: string;
  readonly dependencyCount: number;
  readonly effective: ReactNode;
};

const lifecycleTone = (lifecycle: string): StatusChipTone => {
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

const toRow = (flag: AdminGovernanceFlag): FeatureFlagRow => ({
  key: flag.key,
  moduleId: flag.owner,
  lifecycle: flag.lifecycle,
  lifecycleTone: lifecycleTone(flag.lifecycle),
  billable: flag.entitled ? "yes" : "no",
  source: flag.source,
  dependencyCount: flag.dependencies.length,
  effective: flag.effectiveState ? "on" : "off",
});

export function FeatureFlagListTable({
  data,
  selectedKey,
}: FeatureFlagListTableProps) {
  const rows = useMemo(() => data.flags.map(toRow), [data.flags]);

  if (rows.length === 0) {
    return (
      <div data-testid="feature-flag-list-empty" style={{ padding: 6 }}>
        No feature flags match the current module filter.
      </div>
    );
  }

  return (
    <table
      data-testid="feature-flag-list-table"
      data-pattern="feature-flag-list"
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.8125rem",
      }}
    >
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: 4 }}>Flag</th>
          <th style={{ textAlign: "left", padding: 4 }}>Module</th>
          <th style={{ textAlign: "left", padding: 4 }}>Lifecycle</th>
          <th style={{ textAlign: "left", padding: 4 }}>Entitled</th>
          <th style={{ textAlign: "left", padding: 4 }}>Source</th>
          <th style={{ textAlign: "left", padding: 4 }}>Dependencies</th>
          <th style={{ textAlign: "left", padding: 4 }}>Effective</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected =
            selectedKey !== undefined && row.key === selectedKey;
          return (
            <tr
              key={row.key}
              data-testid="feature-flag-list-row"
              data-row-key={row.key}
              data-selected={isSelected ? "true" : "false"}
              style={{
                background: isSelected
                  ? "color-mix(in oklab, var(--accent-bg, rgba(80,160,255,0.18)) 60%, transparent)"
                  : "transparent",
              }}
            >
              <td style={{ padding: 4 }}>
                <Link
                  data-testid="feature-flag-list-row-link"
                  to="/desk/flag/$flagKey"
                  params={{ flagKey: row.key }}
                  preload={false}
                >
                  {row.key}
                </Link>
              </td>
              <td style={{ padding: 4 }}>{row.moduleId}</td>
              <td style={{ padding: 4 }}>
                <StatusChip tone={row.lifecycleTone} size="sm">
                  {row.lifecycle}
                </StatusChip>
              </td>
              <td style={{ padding: 4 }}>{row.billable}</td>
              <td style={{ padding: 4 }}>{row.source}</td>
              <td style={{ padding: 4 }}>{row.dependencyCount}</td>
              <td style={{ padding: 4 }}>{row.effective}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
