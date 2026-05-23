import { type ReactNode } from "react";
import { StatusChip, type StatusChipTone } from "./StatusChip";

/**
 * LogStream — dense, live-tail capable list for audit + log
 * explorers (spec §8.8). Presentational only: the consumer owns the
 * data subscription and toggles `liveTail`. Correlation-id chips are
 * click-through via `onCorrelationSelect`, which is the canonical
 * way to open the matching correlation graph as a paired pane.
 *
 * Facet pills are rendered along the toolbar; selection is driven
 * via `selectedFacets` + `onFacetToggle` so the surrounding URL state
 * stays the single source of truth.
 *
 * Two-layer rule: rendered as a matte canvas surface; never nested
 * inside another glass surface.
 */
export type LogStreamFacet = {
  readonly id: string;
  readonly label: ReactNode;
  readonly tone?: StatusChipTone;
  readonly count?: number;
};

export type LogStreamEntry = {
  readonly id: string;
  readonly timestamp: string;
  readonly tone?: StatusChipTone;
  readonly message: ReactNode;
  readonly actor?: ReactNode;
  readonly correlationId?: string;
};

export type LogStreamProps = {
  readonly entries: readonly LogStreamEntry[];
  readonly facets?: readonly LogStreamFacet[];
  readonly selectedFacets?: ReadonlySet<string>;
  readonly onFacetToggle?: (facetId: string) => void;
  readonly liveTail?: boolean;
  readonly onLiveTailToggle?: (next: boolean) => void;
  readonly onEntrySelect?: (entry: LogStreamEntry) => void;
  readonly onCorrelationSelect?: (correlationId: string) => void;
  readonly emptyState?: ReactNode;
  readonly ariaLabel?: string;
};

export function LogStream({
  entries,
  facets,
  selectedFacets,
  onFacetToggle,
  liveTail = false,
  onLiveTailToggle,
  onEntrySelect,
  onCorrelationSelect,
  emptyState,
  ariaLabel = "Log stream",
}: LogStreamProps) {
  return (
    <section
      role="region"
      aria-label={ariaLabel}
      data-pattern="log-stream"
      data-live-tail={liveTail ? "true" : "false"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 0,
        background: "color-mix(in oklab, var(--canvas-850) 60%, transparent)",
        border: "1px solid color-mix(in oklab, white 6%, transparent)",
        borderRadius: 8,
        padding: 6,
      }}
    >
      <div
        data-log-stream-toolbar
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {facets?.map((facet) => {
          const selected = selectedFacets?.has(facet.id) === true;
          return (
            <button
              key={facet.id}
              type="button"
              role="switch"
              aria-checked={selected}
              data-facet={facet.id}
              data-facet-selected={selected ? "true" : "false"}
              onClick={() => onFacetToggle?.(facet.id)}
              disabled={onFacetToggle === undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                height: 28,
                paddingInline: 6,
                background: selected
                  ? "color-mix(in oklab, white 8%, transparent)"
                  : "transparent",
                border: "1px solid color-mix(in oklab, white 8%, transparent)",
                borderRadius: 4,
                color: "var(--fg-default)",
                cursor: onFacetToggle === undefined ? "default" : "pointer",
                font: "inherit",
                fontSize: "0.75rem",
              }}
            >
              {facet.tone !== undefined ? (
                <StatusChip tone={facet.tone} size="sm">
                  {facet.label}
                </StatusChip>
              ) : (
                <span>{facet.label}</span>
              )}
              {facet.count !== undefined ? (
                <span style={{ color: "var(--fg-muted)" }}>{facet.count}</span>
              ) : null}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {onLiveTailToggle !== undefined ? (
          <button
            type="button"
            role="switch"
            aria-checked={liveTail}
            data-testid="log-stream-live-tail"
            onClick={() => onLiveTailToggle(!liveTail)}
            style={{
              height: 28,
              paddingInline: 8,
              background: liveTail ? "var(--status-active-bg)" : "transparent",
              border: `1px solid ${
                liveTail
                  ? "var(--status-active-border)"
                  : "color-mix(in oklab, white 8%, transparent)"
              }`,
              borderRadius: 4,
              color: liveTail ? "var(--status-active-fg)" : "var(--fg-default)",
              cursor: "pointer",
              font: "inherit",
              fontSize: "0.75rem",
            }}
          >
            {liveTail ? "● live" : "○ paused"}
          </button>
        ) : null}
      </div>
      <ol
        role="log"
        data-log-stream-list
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "auto",
          minHeight: 0,
          flex: 1,
        }}
      >
        {entries.length === 0
          ? (emptyState ?? (
              <li
                data-log-stream-empty
                style={{
                  padding: 8,
                  color: "var(--fg-muted)",
                  fontSize: "0.8125rem",
                  textAlign: "center",
                }}
              >
                No entries.
              </li>
            ))
          : entries.map((entry) => (
              <li
                key={entry.id}
                data-log-entry={entry.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto auto 1fr auto",
                  alignItems: "center",
                  gap: 6,
                  padding: 4,
                  borderRadius: 4,
                  background:
                    "color-mix(in oklab, var(--canvas-900) 30%, transparent)",
                }}
              >
                <time
                  dateTime={entry.timestamp}
                  style={{
                    fontFamily:
                      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                    fontSize: "0.6875rem",
                    color: "var(--fg-muted)",
                  }}
                >
                  {entry.timestamp}
                </time>
                {entry.tone !== undefined ? (
                  <StatusChip tone={entry.tone} size="sm">
                    {entry.tone}
                  </StatusChip>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  data-log-entry-message
                  onClick={() => onEntrySelect?.(entry)}
                  disabled={onEntrySelect === undefined}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    textAlign: "left",
                    color: "var(--fg-default)",
                    font: "inherit",
                    fontSize: "0.8125rem",
                    cursor: onEntrySelect === undefined ? "default" : "pointer",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.message}
                  {entry.actor !== undefined ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "var(--fg-muted)",
                        fontSize: "0.6875rem",
                      }}
                    >
                      {entry.actor}
                    </span>
                  ) : null}
                </button>
                {entry.correlationId !== undefined ? (
                  <button
                    type="button"
                    data-log-entry-correlation={entry.correlationId}
                    onClick={() =>
                      onCorrelationSelect?.(entry.correlationId ?? "")
                    }
                    disabled={onCorrelationSelect === undefined}
                    aria-label={`Open correlation ${entry.correlationId}`}
                    style={{
                      fontFamily:
                        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                      fontSize: "0.6875rem",
                      color: "var(--fg-secondary)",
                      background: "transparent",
                      border:
                        "1px solid color-mix(in oklab, white 6%, transparent)",
                      borderRadius: 4,
                      paddingInline: 4,
                      paddingBlock: 2,
                      cursor:
                        onCorrelationSelect === undefined
                          ? "default"
                          : "pointer",
                    }}
                  >
                    {entry.correlationId}
                  </button>
                ) : null}
              </li>
            ))}
      </ol>
    </section>
  );
}
