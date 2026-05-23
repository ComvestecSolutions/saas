import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export type TableState<TKey extends string> = {
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly page: number;
  readonly setPage: (page: number) => void;
  readonly pageSize: number;
  readonly setPageSize: (size: number) => void;
  readonly sortKey: TKey | undefined;
  readonly sortDir: SortDir;
  readonly toggleSort: (key: TKey) => void;
};

type Options<TKey extends string> = {
  readonly initialPageSize?: number;
  readonly initialSortKey?: TKey;
  readonly initialSortDir?: SortDir;
};

export function useTableState<TKey extends string>(
  opts: Options<TKey> = {},
): TableState<TKey> {
  const [search, setSearchRaw] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(opts.initialPageSize ?? 25);
  const [sortKey, setSortKey] = useState<TKey | undefined>(opts.initialSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(
    opts.initialSortDir ?? "desc",
  );

  return useMemo(
    () => ({
      search,
      setSearch: (value) => {
        setSearchRaw(value);
        setPage(1);
      },
      page,
      setPage,
      pageSize,
      setPageSize: (size) => {
        setPageSizeRaw(size);
        setPage(1);
      },
      sortKey,
      sortDir,
      toggleSort: (key) => {
        if (sortKey !== key) {
          setSortKey(key);
          setSortDir("asc");
        } else {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        }
      },
    }),
    [search, page, pageSize, sortKey, sortDir],
  );
}

const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

export function applyTableState<T, TKey extends string>(
  rows: readonly T[],
  state: TableState<TKey>,
  opts: {
    readonly searchOn?: (row: T) => string;
    readonly sortOn?: Partial<Record<TKey, (row: T) => unknown>>;
  },
): { readonly visible: readonly T[]; readonly total: number } {
  let result = rows;
  if (state.search.length > 0 && opts.searchOn !== undefined) {
    const needle = state.search.toLowerCase();
    const searchOn = opts.searchOn;
    result = result.filter((row) =>
      searchOn(row).toLowerCase().includes(needle),
    );
  }
  if (state.sortKey !== undefined && opts.sortOn !== undefined) {
    const fn = opts.sortOn[state.sortKey];
    if (fn !== undefined) {
      result = [...result].sort((a, b) => {
        const cmp = compareValues(fn(a), fn(b));
        return state.sortDir === "asc" ? cmp : -cmp;
      });
    }
  }
  const total = result.length;
  const start = (state.page - 1) * state.pageSize;
  const visible = result.slice(start, start + state.pageSize);
  return { visible, total };
}
