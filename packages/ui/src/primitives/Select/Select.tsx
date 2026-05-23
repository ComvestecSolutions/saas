import * as SelectPrimitive from "@radix-ui/react-select";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../utils/cn";
import { glassSurface } from "../../utils/glass";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;
export const SelectLabel = SelectPrimitive.Label;
export const SelectSeparator = SelectPrimitive.Separator;

export const SelectTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, style, children, ...rest }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn("ops-select-trigger", className)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        height: 32,
        minWidth: 120,
        paddingInline: 8,
        borderRadius: 4,
        background: "color-mix(in oklab, var(--slate-800) 55%, transparent)",
        border: "1px solid color-mix(in oklab, white 8%, transparent)",
        color: "var(--fg-default)",
        font: "inherit",
        cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
      <SelectPrimitive.Icon aria-hidden>▾</SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent(
  { className, children, position = "popper", style, ...rest },
  ref,
) {
  const surface = glassSurface({ radius: "pane" });
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn("ops-select-content", surface.className, className)}
        style={{ ...surface.style, padding: 4, minWidth: 160, ...style }}
        {...rest}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, style, children, ...rest }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn("ops-select-item", className)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        paddingInline: 8,
        borderRadius: 4,
        cursor: "pointer",
        color: "var(--fg-default)",
        ...style,
      }}
      {...rest}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
