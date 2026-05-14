import type { ReactNode } from "react";

/**
 * Status semantics map (from implementation plan):
 *
 * - neutral  → Slate   → applied/complete/current
 * - active   → Emerald → active/healthy
 * - pending  → Amber   → pending/scheduled/verifying
 * - drift    → Violet  → drift/mismatch/deprecated
 * - error    → Crimson → error/blocked/expired/denied
 */
export type BadgeVariant =
  | "neutral"
  | "active"
  | "pending"
  | "drift"
  | "error"
  | "accent";

type BadgeProps = {
  readonly variant?: BadgeVariant;
  readonly children: ReactNode;
};

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  neutral: { bg: "rgba(100,116,139,0.15)", text: "var(--ops-status-neutral)" },
  active: { bg: "rgba(16,185,129,0.12)", text: "var(--ops-status-active)" },
  pending: { bg: "rgba(245,158,11,0.12)", text: "var(--ops-status-pending)" },
  drift: { bg: "rgba(139,92,246,0.12)", text: "var(--ops-status-drift)" },
  error: { bg: "rgba(239,68,68,0.12)", text: "var(--ops-status-error)" },
  accent: { bg: "var(--ops-accent-soft)", text: "var(--ops-accent-text)" },
};

export function Badge({ variant = "neutral", children }: BadgeProps) {
  const colors = variantColors[variant];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: "var(--ops-radius)",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
