import { Slot } from "@radix-ui/react-slot";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Render the button as a `<Slot/>` for composition (Radix pattern). */
  readonly asChild?: boolean;
  /** When `true`, shows a spinner and disables interaction. */
  readonly loading?: boolean;
  /** Render the button as a square icon-only target at the current size. */
  readonly iconOnly?: boolean;
  /** Optional leading content (icon or short marker). */
  readonly leading?: ReactNode;
  /** Optional trailing content (icon or short marker). */
  readonly trailing?: ReactNode;
};

const sizeHeights: Record<ButtonSize, number> = { sm: 28, md: 32, lg: 36 };

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--emerald-600)",
    color: "var(--fg-inverse)",
    border: "1px solid transparent",
  },
  secondary: {
    background: "color-mix(in oklab, var(--slate-700) 60%, transparent)",
    color: "var(--fg-default)",
    border: "1px solid color-mix(in oklab, white 8%, transparent)",
  },
  ghost: {
    background: "transparent",
    color: "var(--fg-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "transparent",
    color: "var(--status-error-fg)",
    border: "1px solid var(--status-error-border)",
  },
};

const Spinner = ({ size }: { readonly size: number }): ReactNode => (
  <span
    role="status"
    aria-label="Loading"
    style={{
      display: "inline-block",
      width: size,
      height: size,
      borderRadius: "50%",
      border: "2px solid currentColor",
      borderTopColor: "transparent",
      animation: "ops-spin 600ms linear infinite",
    }}
  />
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      asChild = false,
      loading = false,
      iconOnly = false,
      leading,
      trailing,
      disabled,
      className,
      style,
      type,
      children,
      ...rest
    },
    forwardedRef,
  ) {
    const Component = asChild ? Slot : "button";
    const isDisabled = disabled === true || loading;
    const height = sizeHeights[size];
    // Spacing rule: padding pairs ≤ 10px between adjacent surfaces.
    const horizontal = size === "lg" ? 10 : size === "md" ? 8 : 6;
    const inner: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height,
      minWidth: iconOnly ? height : undefined,
      paddingInline: iconOnly ? 0 : horizontal,
      borderRadius: 4,
      fontFamily: "inherit",
      fontWeight: 500,
      fontSize: size === "sm" ? "0.8125rem" : "0.875rem",
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled ? 0.55 : 1,
      transition:
        "background 120ms ease, opacity 60ms ease, border-color 120ms ease",
      whiteSpace: "nowrap",
      ...variantStyles[variant],
      ...style,
    };
    return (
      <Component
        ref={forwardedRef}
        type={asChild ? undefined : (type ?? "button")}
        disabled={asChild ? undefined : isDisabled}
        aria-disabled={isDisabled ? true : undefined}
        aria-busy={loading ? true : undefined}
        data-variant={variant}
        data-size={size}
        data-loading={loading ? "" : undefined}
        data-icon-only={iconOnly ? "" : undefined}
        className={cn("ops-button", className)}
        style={inner}
        {...rest}
      >
        {loading ? (
          <Spinner size={size === "sm" ? 12 : 14} />
        ) : (
          <>
            {leading}
            {children}
            {trailing}
          </>
        )}
      </Component>
    );
  },
);
