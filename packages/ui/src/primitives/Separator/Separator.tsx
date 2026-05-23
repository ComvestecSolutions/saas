import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../utils/cn";

export const Separator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator(
  { className, style, orientation = "horizontal", ...rest },
  ref,
) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      orientation={orientation}
      className={cn("ops-separator", className)}
      style={{
        background: "color-mix(in oklab, white 6%, transparent)",
        flexShrink: 0,
        ...(orientation === "horizontal"
          ? { width: "100%", height: 1 }
          : { width: 1, height: "100%" }),
        ...style,
      }}
      {...rest}
    />
  );
});
