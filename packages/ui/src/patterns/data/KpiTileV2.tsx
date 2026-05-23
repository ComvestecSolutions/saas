import type { ReactNode } from "react";
import { type StatusChipTone } from "./StatusChip";

/**
 * KpiTileV2 — onClick-required posture tile for Operations Home
 * (spec §8.2). The tile owns its colour palette via the StatusChip
 * tone vocabulary so the pulse ribbon, KPI tile, and status chip
 * all use the same canonical mapping.
 *
 * Per spec §8.2 every tile is interactive (opens the underlying
 * resource as a pane), so `onClick` is required, not optional.
 */
export type KpiTileV2Props = {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly tone: StatusChipTone;
  readonly onClick: () => void;
  readonly trend?: ReactNode;
  readonly hint?: ReactNode;
  readonly ariaLabel?: string;
};

const toneToAccent: Record<StatusChipTone, string> = {
  nominal: "var(--status-active-fg)",
  success: "var(--status-active-fg)",
  pending: "var(--status-pending-fg)",
  drift: "var(--status-drift-fg)",
  error: "var(--status-error-fg)",
};

const toneToBorder: Record<StatusChipTone, string> = {
  nominal: "var(--status-active-border)",
  success: "var(--status-active-border)",
  pending: "var(--status-pending-border)",
  drift: "var(--status-drift-border)",
  error: "var(--status-error-border)",
};

export function KpiTileV2({
  label,
  value,
  tone,
  onClick,
  trend,
  hint,
  ariaLabel,
}: KpiTileV2Props) {
  return (
    <button
      type="button"
      data-pattern="kpi-tile-v2"
      data-tone={tone}
      onClick={onClick}
      aria-label={
        ariaLabel ??
        (typeof label === "string" && typeof value === "string"
          ? `${label}: ${value}`
          : undefined)
      }
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
        padding: 8,
        background: "color-mix(in oklab, var(--canvas-850) 60%, transparent)",
        border: `1px solid ${toneToBorder[tone]}`,
        borderRadius: 8,
        color: "var(--fg-default)",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        minWidth: 0,
        font: "inherit",
      }}
    >
      <span
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--fg-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          color: toneToAccent[tone],
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {trend !== undefined ? (
        <span
          data-kpi-slot="trend"
          style={{ fontSize: "0.75rem", color: "var(--fg-secondary)" }}
        >
          {trend}
        </span>
      ) : null}
      {hint !== undefined ? (
        <span
          data-kpi-slot="hint"
          style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}
        >
          {hint}
        </span>
      ) : null}
    </button>
  );
}
