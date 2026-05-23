import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../utils/cn";

export const ScrollArea = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(function ScrollArea({ className, style, children, ...rest }, ref) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("ops-scroll-area", className)}
      style={{ overflow: "hidden", position: "relative", ...style }}
      {...rest}
    >
      <ScrollAreaPrimitive.Viewport style={{ width: "100%", height: "100%" }}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        style={{
          display: "flex",
          touchAction: "none",
          padding: 2,
          width: 8,
        }}
      >
        <ScrollAreaPrimitive.Thumb
          style={{
            flex: 1,
            background: "color-mix(in oklab, white 12%, transparent)",
            borderRadius: 4,
          }}
        />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Scrollbar
        orientation="horizontal"
        style={{
          display: "flex",
          touchAction: "none",
          padding: 2,
          height: 8,
          flexDirection: "column",
        }}
      >
        <ScrollAreaPrimitive.Thumb
          style={{
            flex: 1,
            background: "color-mix(in oklab, white 12%, transparent)",
            borderRadius: 4,
          }}
        />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});
