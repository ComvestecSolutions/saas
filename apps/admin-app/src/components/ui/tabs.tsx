import type { ReactNode } from "react";

export type TabItem<T extends string = string> = {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
  readonly icon?: ReactNode;
};

type TabsProps<T extends string> = {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly items: readonly TabItem<T>[];
  readonly ariaLabel?: string;
};

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel = "Sections",
}: TabsProps<T>) {
  return (
    <div className="ops-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          className="ops-tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.icon !== undefined && (
            <span aria-hidden="true">{item.icon}</span>
          )}
          {item.label}
          {item.count !== undefined && (
            <span className="ops-tab__count">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
