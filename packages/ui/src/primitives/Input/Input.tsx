import {
  forwardRef,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn";

export type InputSize = "sm" | "md";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  readonly inputSize?: InputSize;
  readonly invalid?: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    inputSize = "md",
    invalid = false,
    leading,
    trailing,
    disabled,
    className,
    style,
    ...rest
  },
  forwardedRef,
) {
  const height = inputSize === "sm" ? 28 : 32;
  const wrapper: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height,
    minHeight: height,
    paddingInline: 8,
    background: "color-mix(in oklab, var(--slate-800) 55%, transparent)",
    border: `1px solid ${
      invalid
        ? "var(--status-error-border)"
        : "color-mix(in oklab, white 8%, transparent)"
    }`,
    borderRadius: 4,
    color: "var(--fg-default)",
    opacity: disabled === true ? 0.55 : 1,
    cursor: disabled === true ? "not-allowed" : "text",
    width: "100%",
  };
  return (
    <label
      className={cn("ops-input", className)}
      data-invalid={invalid ? "" : undefined}
      data-disabled={disabled === true ? "" : undefined}
      style={{ ...wrapper, ...style }}
    >
      {leading}
      <input
        ref={forwardedRef}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "inherit",
          font: "inherit",
          height: "100%",
        }}
        {...rest}
      />
      {trailing}
    </label>
  );
});
