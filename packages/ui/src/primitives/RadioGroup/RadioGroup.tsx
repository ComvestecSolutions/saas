import {
  forwardRef,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn";

export type RadioOption = {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
};

export type RadioGroupProps = {
  readonly name: string;
  readonly options: ReadonlyArray<RadioOption>;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly orientation?: "horizontal" | "vertical";
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly "aria-label"?: string;
};

type RadioItemProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "name" | "value" | "checked"
> & {
  readonly name: string;
  readonly value: string;
  readonly checked?: boolean;
};

const RadioItem = forwardRef<HTMLInputElement, RadioItemProps>(
  function RadioItem({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="radio"
        className={cn("ops-radio", className)}
        style={{ accentColor: "var(--emerald-500)", margin: 0 }}
        {...rest}
      />
    );
  },
);

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  function RadioGroup(
    {
      name,
      options,
      value,
      defaultValue,
      onValueChange,
      disabled = false,
      orientation = "vertical",
      className,
      style,
      "aria-label": ariaLabel,
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-orientation={orientation}
        className={cn("ops-radio-group", className)}
        style={{
          display: "inline-flex",
          flexDirection: orientation === "vertical" ? "column" : "row",
          gap: 8,
          ...style,
        }}
      >
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const isChecked =
            value !== undefined
              ? value === option.value
              : defaultValue === option.value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor:
                  disabled || option.disabled === true
                    ? "not-allowed"
                    : "pointer",
                opacity: disabled || option.disabled === true ? 0.55 : 1,
              }}
            >
              <RadioItem
                id={id}
                name={name}
                value={option.value}
                {...(value !== undefined ? { checked: isChecked } : {})}
                {...(value === undefined && defaultValue === option.value
                  ? { defaultChecked: true }
                  : {})}
                disabled={disabled || option.disabled}
                onChange={(event) => {
                  if (event.currentTarget.checked) {
                    onValueChange?.(option.value);
                  }
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    );
  },
);
