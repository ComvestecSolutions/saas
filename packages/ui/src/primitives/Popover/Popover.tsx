import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../utils/cn";
import { glassSurface } from "../../utils/glass";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, style, sideOffset = 6, ...rest }, ref) {
  const surface = glassSurface({ radius: "pane" });
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn("ops-popover-content", surface.className, className)}
        style={{ ...surface.style, padding: 8, minWidth: 160, ...style }}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  );
});
