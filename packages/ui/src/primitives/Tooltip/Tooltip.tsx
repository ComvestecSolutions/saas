import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent(
  { className, style, sideOffset = 6, children, ...rest },
  ref,
) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn("ops-tooltip", className)}
        style={{
          background: "color-mix(in oklab, var(--canvas-850) 92%, transparent)",
          color: "var(--fg-default)",
          border: "1px solid color-mix(in oklab, white 8%, transparent)",
          borderRadius: 8,
          padding: "6px 8px",
          fontSize: "0.8125rem",
          boxShadow: "0 4px 12px -6px rgb(0 0 0 / 0.5)",
          transitionDuration: "120ms",
          ...style,
        }}
        {...rest}
      >
        {children as ReactNode}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});
