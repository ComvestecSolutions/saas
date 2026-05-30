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
        display: "grid",
        justifyItems: "center",
        alignContent: "center",
        gap: 10,
        width: "100%",
        minHeight: 240,
        padding: "clamp(18px, 3vw, 32px)",
        textAlign: "center",
        background:
          "linear-gradient(180deg, color-mix(in oklab, white 3%, transparent), transparent 36%), " +
          tokens.background,
        border: tokens.border,
        borderRadius: 18,
        boxShadow:
          "0 28px 48px -40px rgb(0 0 0 / 0.88), inset 0 1px 0 color-mix(in oklab, white 4%, transparent)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 84,
          padding: "5px 10px",
          borderRadius: 999,
          fontFamily: "var(--font-condensed)",
          fontSize: "0.68rem",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--fg-muted)",
          background: "color-mix(in oklab, white 4%, transparent)",
          border: "1px solid color-mix(in oklab, white 6%, transparent)",
        }}
      >
        {variant === "5xx" ? "System fault" : variant.replace("5", "")}
      </span>
      {variant === "loading" ? (
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
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
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: 16,
            fontSize: "1.25rem",
            color: tokens.iconColor,
            fontWeight: 700,
            background: "color-mix(in oklab, white 4%, transparent)",
            border: "1px solid color-mix(in oklab, white 7%, transparent)",
          }}
        >
          {tokens.icon}
        </span>
      )}
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          fontSize: "clamp(1.05rem, 1.4vw, 1.25rem)",
          color: "var(--fg-default)",
          letterSpacing: "-0.02em",
        }}
      >
        {resolvedTitle}
      </p>
      {description !== undefined ? (
        <p
          style={{
            margin: 0,
            fontSize: "0.86rem",
            color: "var(--fg-muted)",
            maxWidth: "56ch",
            lineHeight: 1.7,
          }}
        >
          {description}
        </p>
      ) : null}
      {action !== undefined ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {action}
        </div>
      ) : null}
      {correlationId !== undefined ? (
        <p
          data-testid="state-screen-correlation"
          style={{
            margin: 0,
            fontFamily:
              "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
            fontSize: "0.72rem",
            color: "var(--fg-muted)",
            padding: "5px 8px",
            borderRadius: 999,
            background: "color-mix(in oklab, white 4%, transparent)",
            border: "1px solid color-mix(in oklab, white 6%, transparent)",
          }}
        >
          correlation: {correlationId}
        </p>
      ) : null}
    </div>
  );
}
