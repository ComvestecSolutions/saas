import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../utils/cn";

/**
 * Badge — 4px chip only (admin-app plan §7).
 *
 * Variants map to the canonical status palette (spec §13):
 *   neutral → Slate    → applied / complete / current
 *   active  → Emerald  → active / healthy
 *   pending → Amber    → pending / verifying
 *   drift   → Violet   → drift / mismatch / deprecated
 *   error   → Crimson  → error / blocked / expired / denied
 */
export type BadgeVariant = "neutral" | "active" | "pending" | "drift" | "error";

export type BadgeSize = "sm" | "md";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly variant?: BadgeVariant;
  readonly size?: BadgeSize;
  readonly children: ReactNode;
};

const variantTokens: Record<
  BadgeVariant,
  { background: string; foreground: string; border: string }
> = {
  neutral: {
    background: "var(--status-neutral-bg)",
    foreground: "var(--status-neutral-fg)",
    border: "var(--status-neutral-border)",
  },
  active: {
    background: "var(--status-active-bg)",
    foreground: "var(--status-active-fg)",
    border: "var(--status-active-border)",
  },
  pending: {
    background: "var(--status-pending-bg)",
    foreground: "var(--status-pending-fg)",
    border: "var(--status-pending-border)",
  },
  drift: {
    background: "var(--status-drift-bg)",
    foreground: "var(--status-drift-fg)",
    border: "var(--status-drift-border)",
  },
  error: {
    background: "var(--status-error-bg)",
    foreground: "var(--status-error-fg)",
    border: "var(--status-error-border)",
  },
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "neutral", size = "md", className, style, children, ...rest },
  ref,
) {
  const tokens = variantTokens[variant];
  return (
    <span
      ref={ref}
      data-variant={variant}
      data-size={size}
      className={cn("ops-badge", className)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: size === "sm" ? 16 : 20,
        paddingInline: 6,
        borderRadius: 4,
        background: tokens.background,
        color: tokens.foreground,
        border: `1px solid ${tokens.border}`,
        fontSize: size === "sm" ? "0.6875rem" : "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
});
