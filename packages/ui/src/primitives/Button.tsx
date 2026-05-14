import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly children: ReactNode;
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--ops-accent)",
    color: "#fff",
    border: "1px solid transparent",
  },
  secondary: {
    background: "var(--ops-surface-3)",
    color: "var(--ops-text)",
    border: "1px solid var(--ops-border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--ops-text-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "transparent",
    color: "var(--ops-status-error)",
    border: "1px solid var(--ops-status-error)",
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "4px 10px", fontSize: "0.8rem", height: "28px" },
  md: { padding: "6px 14px", fontSize: "0.875rem", height: "36px" },
};

export function Button({
  variant = "secondary",
  size = "md",
  style,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        borderRadius: "var(--ops-radius)",
        fontFamily: "inherit",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s, background 0.15s",
        whiteSpace: "nowrap",
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
