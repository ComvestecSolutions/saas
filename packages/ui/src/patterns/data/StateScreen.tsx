import type { ReactNode } from "react";

/**
 * StateScreen — the single component every Operator Desk route shares
 * for empty / loading / denied / stale / 404 / 5xx (spec §8.19).
 *
 * Two-layer rule: StateScreen renders as a matte canvas card; it must
 * never appear nested inside a glass surface. Spacing units stay on
 * the 2 / 4 / 6 / 8 / 10 ladder.
 *
 * Accepts a `correlationId` so operators can copy the active request
 * correlation when reporting a failure.
 */
export type StateScreenVariant =
  | "empty"
  | "loading"
  | "denied"
  | "stale"
  | "404"
  | "5xx";

export type StateScreenProps = {
  readonly variant: StateScreenVariant;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly correlationId?: string;
};

type VariantStyle = {
  readonly background: string;
  readonly border: string;
  readonly iconColor: string;
  readonly icon: string;
  readonly defaultTitle: string;
};

const variantStyles: Record<StateScreenVariant, VariantStyle> = {
  empty: {
    background: "var(--ops-surface-2, transparent)",
    border: "1px solid color-mix(in oklab, white 6%, transparent)",
    iconColor: "var(--fg-muted)",
    icon: "∅",
    defaultTitle: "Nothing to show",
  },
  loading: {
    background: "var(--ops-surface-2, transparent)",
    border: "1px solid color-mix(in oklab, white 6%, transparent)",
    iconColor: "var(--fg-muted)",
    icon: "…",
    defaultTitle: "Loading…",
  },
  denied: {
    background: "var(--status-pending-bg)",
    border: "1px solid var(--status-pending-border)",
    iconColor: "var(--status-pending-fg)",
    icon: "🔒",
    defaultTitle: "Access denied",
  },
  stale: {
    background: "var(--status-drift-bg)",
    border: "1px solid var(--status-drift-border)",
    iconColor: "var(--status-drift-fg)",
    icon: "⟳",
    defaultTitle: "Session is stale",
  },
  "404": {
    background: "var(--ops-surface-2, transparent)",
    border: "1px solid color-mix(in oklab, white 6%, transparent)",
    iconColor: "var(--fg-muted)",
    icon: "404",
    defaultTitle: "Resource not found",
  },
  "5xx": {
    background: "var(--status-error-bg)",
    border: "1px solid var(--status-error-border)",
    iconColor: "var(--status-error-fg)",
    icon: "⚠",
    defaultTitle: "Something went wrong",
  },
};

export function StateScreen({
  variant,
  title,
  description,
  action,
  correlationId,
}: StateScreenProps) {
  const tokens = variantStyles[variant];
  const resolvedTitle = title ?? tokens.defaultTitle;
  return (
    <div
      role={variant === "loading" ? "status" : "alert"}
      aria-live={variant === "loading" ? "polite" : undefined}
      data-pattern="state-screen"
      data-variant={variant}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 10,
        minHeight: 200,
        textAlign: "center",
        background: tokens.background,
        border: tokens.border,
        borderRadius: 8,
      }}
    >
      {variant === "loading" ? (
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "2px solid color-mix(in oklab, white 12%, transparent)",
            borderTopColor: "var(--fg-default)",
            display: "inline-block",
            animation: "ops-spin 600ms linear infinite",
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          data-state-icon=""
          style={{
            fontSize: "1.25rem",
            color: tokens.iconColor,
            fontWeight: 600,
          }}
        >
          {tokens.icon}
        </span>
      )}
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          fontSize: "0.9375rem",
          color: "var(--fg-default)",
        }}
      >
        {resolvedTitle}
      </p>
      {description !== undefined ? (
        <p
          style={{
            margin: 0,
            fontSize: "0.8125rem",
            color: "var(--fg-muted)",
            maxWidth: "44ch",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      ) : null}
      {action !== undefined ? <div>{action}</div> : null}
      {correlationId !== undefined ? (
        <p
          data-testid="state-screen-correlation"
          style={{
            margin: 0,
            fontFamily:
              "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
            fontSize: "0.6875rem",
            color: "var(--fg-muted)",
          }}
        >
          correlation: {correlationId}
        </p>
      ) : null}
    </div>
  );
}
