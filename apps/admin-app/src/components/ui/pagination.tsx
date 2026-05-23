import { ChevronLeft, ChevronRight } from "./icons";

type PaginationProps = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (size: number) => void;
  readonly pageSizeOptions?: readonly number[];
};

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  const renderPageBtn = (n: number) => (
    <button
      key={n}
      type="button"
      className="ops-pagination__btn"
      aria-current={n === safePage ? "page" : undefined}
      onClick={() => onPageChange(n)}
    >
      {n}
    </button>
  );

  const visiblePages = (() => {
    const pages: number[] = [];
    const win = 1;
    const push = (n: number) => {
      if (!pages.includes(n)) pages.push(n);
    };
    push(1);
    for (let i = safePage - win; i <= safePage + win; i++) {
      if (i > 1 && i < totalPages) push(i);
    }
    if (totalPages > 1) push(totalPages);
    pages.sort((a, b) => a - b);

    const result: (number | "ellipsis")[] = [];
    let prev = 0;
    for (const n of pages) {
      if (prev > 0 && n - prev > 1) result.push("ellipsis");
      result.push(n);
      prev = n;
    }
    return result;
  })();

  return (
    <div className="ops-pagination">
      <span className="ops-pagination__info">
        {start.toLocaleString()}–{end.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </span>
      <div
        style={{
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {onPageSizeChange !== undefined && (
          <label
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <span
              style={{ fontSize: "0.72rem", color: "var(--ops-text-muted)" }}
            >
              Rows
            </span>
            <select
              className="ops-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.currentTarget.value))}
              style={{ minHeight: 28, padding: "4px 8px" }}
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <div
          className="ops-pagination__nav"
          role="navigation"
          aria-label="Pagination"
        >
          <button
            type="button"
            className="ops-pagination__btn"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={12} />
          </button>
          {visiblePages.map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`e-${i}`}
                className="ops-pagination__btn"
                style={{
                  pointerEvents: "none",
                  border: 0,
                  background: "transparent",
                }}
              >
                …
              </span>
            ) : (
              renderPageBtn(p)
            ),
          )}
          <button
            type="button"
            className="ops-pagination__btn"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
