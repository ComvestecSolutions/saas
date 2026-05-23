import { type ReactNode } from "react";

/**
 * KeyValueCards — mobile-friendly key/value card rendering for the
 * same row shape `DenseDataTable` consumes.
 *
 * Admin-app spec §11 Phase 8 rule "Tables become labelled key/value
 * cards under mobile breakpoint" plus guardrail §14.12 "No
 * horizontal-scroll-only tables on any breakpoint". The Operator Desk
 * admin-app composes this pattern under mobile breakpoints in lieu of
 * `DenseDataTable` when the loader data is the same shape. This
 * pattern carries no faceted filters or saved views — those interactions
 * stay on `DenseDataTable` and are reachable from desktop and tablet.
 *
 * Spacing: 6px between cards, 4px between rows inside a card (spec §12
 * allowed units 2/4/6/8/10).
 */
export type KeyValueCardEntry = {
  readonly id: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
};

export type KeyValueCard<TRow> = {
  readonly id: string;
  readonly title: ReactNode;
  readonly status?: ReactNode;
  readonly entries: readonly KeyValueCardEntry[];
  readonly row: TRow;
};

export type KeyValueCardsProps<TRow> = {
  readonly cards: readonly KeyValueCard<TRow>[];
  readonly onSelect?: (row: TRow) => void;
  readonly ariaLabel?: string;
  readonly emptyState?: ReactNode;
};

export function KeyValueCards<TRow>({
  cards,
  onSelect,
  ariaLabel = "Records",
  emptyState,
}: KeyValueCardsProps<TRow>) {
  if (cards.length === 0) {
    return (
      <section
        role="region"
        aria-label={ariaLabel}
        data-pattern="key-value-cards"
        data-empty="true"
        style={{
          padding: 10,
          textAlign: "center",
          color: "var(--fg-muted)",
          background: "color-mix(in oklab, var(--canvas-850) 60%, transparent)",
          border: "1px solid color-mix(in oklab, white 6%, transparent)",
          borderRadius: 8,
        }}
      >
        {emptyState ?? "No records."}
      </section>
    );
  }
  return (
    <ul
      role="list"
      aria-label={ariaLabel}
      data-pattern="key-value-cards"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {cards.map((card) => (
        <li
          key={card.id}
          data-card-id={card.id}
          style={{
            background:
              "color-mix(in oklab, var(--canvas-850) 60%, transparent)",
            border: "1px solid color-mix(in oklab, white 6%, transparent)",
            borderRadius: 8,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              minHeight: 28,
            }}
          >
            {onSelect === undefined ? (
              <span
                data-card-title
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "var(--fg-default)",
                }}
              >
                {card.title}
              </span>
            ) : (
              <button
                type="button"
                data-card-open={card.id}
                onClick={() => onSelect(card.row)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  font: "inherit",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "var(--fg-default)",
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                {card.title}
              </button>
            )}
            {card.status !== undefined ? (
              <span data-card-status>{card.status}</span>
            ) : null}
          </header>
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
              rowGap: 4,
              columnGap: 6,
              fontSize: "0.8125rem",
            }}
          >
            {card.entries.map((entry) => (
              <div
                key={entry.id}
                data-card-entry={entry.id}
                style={{ display: "contents" }}
              >
                <dt
                  style={{
                    color: "var(--fg-muted)",
                    fontSize: "0.6875rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    alignSelf: "center",
                  }}
                >
                  {entry.label}
                </dt>
                <dd
                  style={{
                    margin: 0,
                    color: "var(--fg-default)",
                  }}
                >
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
