import type { ChangeEvent, ReactNode } from "react";
import { SearchIcon } from "./icons";

type FilterBarProps = {
  readonly children?: ReactNode;
  readonly searchValue?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
  readonly trailing?: ReactNode;
};

export function FilterBar({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  trailing,
}: FilterBarProps) {
  return (
    <div className="ops-toolbar" role="toolbar" aria-label="Filters">
      <div className="ops-toolbar__group">
        {onSearchChange !== undefined && (
          <label className="ops-search">
            <span className="ops-search__icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="search"
              className="ops-search__input"
              value={searchValue ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onSearchChange(e.currentTarget.value)
              }
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </label>
        )}
        {children}
      </div>
      {trailing !== undefined && (
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {trailing}
        </div>
      )}
    </div>
  );
}

type FilterSelectProps = {
  readonly label?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly id?: string;
};

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  id,
}: FilterSelectProps) {
  return (
    <label
      style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
      htmlFor={id}
    >
      {label !== undefined && (
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--ops-text-muted)",
          }}
        >
          {label}
        </span>
      )}
      <select
        id={id}
        className="ops-select"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type SegmentedTabsProps<T extends string> = {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly items: readonly { readonly value: T; readonly label: string }[];
  readonly ariaLabel?: string;
};

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel = "Segmented control",
}: SegmentedTabsProps<T>) {
  return (
    <div className="ops-segmented" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="ops-segmented__btn"
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
