import * as ToastPrimitive from "@radix-ui/react-toast";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn";

export const ToastProvider = ToastPrimitive.Provider;
export const ToastClose = ToastPrimitive.Close;
export const ToastAction = ToastPrimitive.Action;

export type ToastVariant = "info" | "success" | "warning" | "error";

const variantStyles: Record<
  ToastVariant,
  { background: string; foreground: string; border: string }
> = {
  info: {
    foreground: "var(--fg-default)",
    background: "color-mix(in oklab, var(--canvas-850) 92%, transparent)",
    border: "color-mix(in oklab, white 8%, transparent)",
  },
  success: {
    foreground: "var(--status-active-fg)",
    background: "var(--status-active-bg)",
    border: "var(--status-active-border)",
  },
  warning: {
    foreground: "var(--status-pending-fg)",
    background: "var(--status-pending-bg)",
    border: "var(--status-pending-border)",
  },
  error: {
    foreground: "var(--status-error-fg)",
    background: "var(--status-error-bg)",
    border: "var(--status-error-border)",
  },
};

export const ToastViewport = forwardRef<
  HTMLOListElement,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(function ToastViewport({ className, style, ...rest }, ref) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      className={cn("ops-toast-viewport", className)}
      style={{
        position: "fixed",
        bottom: 10,
        right: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        outline: "none",
        ...style,
      }}
      {...rest}
    />
  );
});

export type ToastProps = ComponentPropsWithoutRef<
  typeof ToastPrimitive.Root
> & {
  readonly variant?: ToastVariant;
  readonly title?: ReactNode;
};

export const Toast = forwardRef<HTMLLIElement, ToastProps>(function Toast(
  {
    variant = "info",
    title,
    className,
    style,
    children,
    duration = 5000,
    ...rest
  },
  ref,
) {
  const palette = variantStyles[variant];
  return (
    <ToastPrimitive.Root
      ref={ref}
      duration={duration}
      data-variant={variant}
      className={cn("ops-toast", className)}
      style={{
        background: palette.background,
        color: palette.foreground,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: 10,
        minWidth: 240,
        ...style,
      }}
      {...rest}
    >
      {title !== undefined ? (
        <ToastPrimitive.Title style={{ margin: 0, fontWeight: 600 }}>
          {title}
        </ToastPrimitive.Title>
      ) : null}
      {children !== undefined ? (
        <ToastPrimitive.Description style={{ margin: 0 }}>
          {children}
        </ToastPrimitive.Description>
      ) : null}
    </ToastPrimitive.Root>
  );
});
