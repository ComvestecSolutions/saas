import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../utils/cn";

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, style, ...rest }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn("ops-tabs-list", className)}
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 2,
        borderBottom: "1px solid color-mix(in oklab, white 6%, transparent)",
        ...style,
      }}
      {...rest}
    />
  );
});

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, style, ...rest }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn("ops-tabs-trigger", className)}
      style={{
        height: 32,
        paddingInline: 8,
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 4,
        color: "var(--fg-secondary)",
        cursor: "pointer",
        font: "inherit",
        ...style,
      }}
      {...rest}
    />
  );
});

export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, style, ...rest }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn("ops-tabs-content", className)}
      style={{ paddingBlock: 8, ...style }}
      {...rest}
    />
  );
});
