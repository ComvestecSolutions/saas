import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../utils/cn";
import { glassSurface } from "../../utils/glass";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;
export const DropdownMenuLabel = DropdownMenuPrimitive.Label;

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent(
  { className, style, sideOffset = 6, ...rest },
  ref,
) {
  const surface = glassSurface({ radius: "pane" });
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn("ops-dropdown", surface.className, className)}
        style={{ ...surface.style, padding: 4, minWidth: 160, ...style }}
        {...rest}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(function DropdownMenuItem({ className, style, ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn("ops-dropdown-item", className)}
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
    />
  );
});
