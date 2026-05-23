import type { CSSProperties, ReactNode } from "react";
import type { TableState } from "./use-table-state";

export type TableAriaSort = "ascending" | "descending" | "none";

export const resolveTableAriaSort = <TKey extends string>(
  state: Pick<TableState<TKey>, "sortKey" | "sortDir">,
  key: TKey,
): TableAriaSort =>
  state.sortKey === key
    ? state.sortDir === "asc"
      ? "ascending"
      : "descending"
    : "none";

type SortableTableHeaderProps = {
  readonly ariaSort: TableAriaSort;
  readonly onToggle: () => void;
  readonly align?: "left" | "center" | "right" | undefined;
  readonly children: ReactNode;
};

const justifyContentByAlign = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const satisfies Record<
  NonNullable<SortableTableHeaderProps["align"]>,
  CSSProperties["justifyContent"]
>;

export function SortableTableHeader({
  ariaSort,
  onToggle,
  align = "left",
  children,
}: Readonly<SortableTableHeaderProps>) {
  return (
    <th
      aria-sort={ariaSort}
      style={align === "left" ? undefined : { textAlign: align }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: justifyContentByAlign[align],
          gap: 6,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "inherit",
          font: "inherit",
          textAlign: align,
          cursor: "pointer",
        }}
      >
        {children}
      </button>
    </th>
  );
}
