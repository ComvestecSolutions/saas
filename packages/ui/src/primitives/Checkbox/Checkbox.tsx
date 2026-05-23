import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../utils/cn";

export type CheckboxProps = ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
>;

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox({ className, style, ...rest }, ref) {
    return (
      <CheckboxPrimitive.Root
        ref={ref}
        className={cn("ops-checkbox", className)}
        style={{
          width: 16,
          height: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          background: "color-mix(in oklab, var(--slate-800) 70%, transparent)",
          border: "1px solid color-mix(in oklab, white 12%, transparent)",
          cursor: "pointer",
          color: "var(--fg-inverse)",
          ...style,
        }}
        {...rest}
      >
        <CheckboxPrimitive.Indicator>
          <span
            data-state-marker
            style={{
              display: "block",
              width: 10,
              height: 10,
              background: "var(--emerald-500)",
              borderRadius: 2,
            }}
          />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  },
);
