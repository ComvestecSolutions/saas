import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn";
import { glassSurface } from "../../utils/glass";

/**
 * Sheet is a Radix Dialog rendered as a slide-in surface.
 * Sides: left | right | bottom. Mobile-first sizing.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export type SheetSide = "left" | "right" | "bottom";

const sidePosition: Record<SheetSide, CSSProperties> = {
  left: { top: 0, left: 0, bottom: 0, width: "min(360px, 90vw)" },
  right: { top: 0, right: 0, bottom: 0, width: "min(360px, 90vw)" },
  bottom: { left: 0, right: 0, bottom: 0, height: "min(60vh, 480px)" },
};

export type SheetContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  readonly side?: SheetSide;
  readonly title: ReactNode;
};

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(
  function SheetContent(
    { side = "right", title, className, style, children, ...rest },
    ref,
  ) {
    const surface = glassSurface({ radius: "pane" });
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background:
              "color-mix(in oklab, var(--canvas-950) 60%, transparent)",
          }}
        />
        <DialogPrimitive.Content
          ref={ref}
          className={cn("ops-sheet", surface.className, className)}
          style={{
            ...surface.style,
            position: "fixed",
            display: "flex",
            flexDirection: "column",
            ...sidePosition[side],
            ...style,
          }}
          {...rest}
        >
          <DialogPrimitive.Title style={{ margin: 0, padding: 10 }}>
            {title}
          </DialogPrimitive.Title>
          <div style={{ padding: 10, overflowY: "auto", flex: 1 }}>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
