import { type ReactNode } from "react";
import { Badge, type BadgeVariant } from "../../primitives/Badge/Badge";

/**
 * Alerts Pulse — command-strip indicator for unread operator alerts.
 *
 * Pulses (animated dot) when there is at least one unread alert.
 * Honours `prefers-reduced-motion` at the consuming app via the
 * `useReducedMotion` runtime hook. The component itself is
 * presentational and renders a `Badge`-backed count chip.
 */
export type AlertsPulseProps = {
  readonly count: number;
  readonly tone?: BadgeVariant;
  readonly onOpen?: () => void;
  readonly children?: ReactNode;
  readonly ariaLabel?: string;
};

export function AlertsPulse({
  count,
  tone,
  onOpen,
  children,
  ariaLabel = "Operator alerts",
}: AlertsPulseProps) {
  const inferredTone: BadgeVariant =
    tone ?? (count === 0 ? "neutral" : count >= 5 ? "error" : "pending");
  const interactive = onOpen !== undefined;
  return (
    <button
      type="button"
      data-pattern="alerts-pulse"
      data-has-alerts={count > 0 ? "true" : "false"}
      aria-label={`${ariaLabel}: ${count} unread`}
      onClick={onOpen}
      disabled={!interactive}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 28,
        paddingInline: 6,
        background: "transparent",
        border: "1px solid color-mix(in oklab, white 6%, transparent)",
        borderRadius: 4,
        color: "var(--fg-default)",
        cursor: interactive ? "pointer" : "default",
      }}
    >
      <Badge variant={inferredTone} size="sm">
        {count}
      </Badge>
      {children ?? "Alerts"}
    </button>
  );
}
