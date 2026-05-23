import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn";
import { glassSurface } from "../../utils/glass";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export type DialogSize = "sm" | "md" | "lg";

const sizeWidths: Record<DialogSize, number> = { sm: 360, md: 520, lg: 760 };

export const DialogOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, style, ...rest }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn("ops-dialog-overlay", className)}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in oklab, var(--canvas-950) 70%, transparent)",
        backdropFilter: "blur(4px)",
        ...style,
      }}
      {...rest}
    />
  );
});

type DialogContentBaseProps = Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  "aria-describedby"
> & {
  readonly size?: DialogSize;
  readonly title: ReactNode;
  readonly actions?: ReactNode;
};

/**
 * Accessibility contract: every dialog must expose an accessible description
 * to assistive tech. Callers either pass a `description` node (which the
 * dialog renders inside its sticky header and auto-links via
 * `aria-describedby`) or supply a pre-existing element id through the
 * `aria-describedby` prop. Bare `<DialogContent title="…">` is a type error.
 */
export type DialogContentProps = DialogContentBaseProps &
  (
    | {
        readonly description: ReactNode;
        readonly "aria-describedby"?: undefined;
      }
    | {
        readonly description?: undefined;
        readonly "aria-describedby": string;
      }
  );

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  function DialogContent(
    {
      size = "md",
      title,
      description,
      actions,
      className,
      style,
      children,
      ...rest
    },
    ref,
  ) {
    const surface = glassSurface({ radius: "pane" });
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn("ops-dialog-content", surface.className, className)}
          style={{
            ...surface.style,
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: sizeWidths[size],
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 16px)",
            display: "flex",
            flexDirection: "column",
            ...style,
          }}
          {...rest}
        >
          <header
            style={{
              position: "sticky",
              top: 0,
              padding: 10,
              borderBottom:
                "1px solid color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <DialogPrimitive.Title
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 600,
                color: "var(--fg-default)",
              }}
            >
              {title}
            </DialogPrimitive.Title>
            {description !== undefined ? (
              <DialogPrimitive.Description
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--fg-muted)",
                }}
              >
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </header>
          <div style={{ overflowY: "auto", padding: 10, flex: 1 }}>
            {children}
          </div>
          {actions !== undefined ? (
            <footer
              style={{
                position: "sticky",
                bottom: 0,
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                padding: 10,
                borderTop:
                  "1px solid color-mix(in oklab, white 6%, transparent)",
              }}
            >
              {actions}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
