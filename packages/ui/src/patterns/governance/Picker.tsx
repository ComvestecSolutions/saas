import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Input } from "../../primitives/Input/Input";
import { Button } from "../../primitives/Button/Button";
import type { OmnibarSuggestion } from "../desk/Omnibar";

/**
 * Picker — omnibar-backed id picker (admin-app spec §"Auto-context").
 *
 * Every id-bearing input across the admin app is a `Picker`. There is
 * no manual id text path here; the only escape hatch is the
 * disclosure-only "Lookup by id" fallback (spec §"Auto-context").
 *
 * Consumers pass an async `search(query)` that returns
 * `readonly OmnibarSuggestion[]`; the omnibar search service is the
 * single source of truth for ids.
 */
export type PickerProps = {
  readonly value: OmnibarSuggestion | null;
  readonly onValueChange: (value: OmnibarSuggestion | null) => void;
  readonly search: (query: string) => Promise<readonly OmnibarSuggestion[]>;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  /**
   * When true, surfaces the governed "Lookup by id" disclosure that
   * allows pasting a known id when the operator already has it.
   * Off by default — the omnibar is the canonical entry point.
   */
  readonly allowLookupById?: boolean;
  readonly onLookupById?: (id: string) => void;
};

export function Picker({
  value,
  onValueChange,
  search,
  placeholder = "Search…",
  ariaLabel = "Picker",
  allowLookupById = false,
  onLookupById,
}: PickerProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly OmnibarSuggestion[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (query.trim().length === 0) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setLoading(true);
    setError(null);
    let cancelled = false;
    search(query)
      .then((next) => {
        if (cancelled || requestSeqRef.current !== seq) return;
        setSuggestions(next);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled || requestSeqRef.current !== seq) return;
        setSuggestions([]);
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "Search failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [query, search]);

  return (
    <div
      data-pattern="picker"
      role="combobox"
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-controls={listId}
      aria-haspopup="listbox"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {value !== null ? (
        <div
          data-testid="picker-selected"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 4,
            background:
              "color-mix(in oklab, var(--canvas-900) 30%, transparent)",
            border: "1px solid color-mix(in oklab, white 6%, transparent)",
            borderRadius: 4,
          }}
        >
          <span style={{ flex: 1, color: "var(--fg-default)" }}>
            {value.label}
          </span>
          <Button
            variant="ghost"
            size="sm"
            data-testid="picker-clear"
            onClick={() => {
              onValueChange(null);
              setQuery("");
              setOpen(true);
            }}
          >
            Change
          </Button>
        </div>
      ) : (
        <Input
          type="search"
          value={query}
          placeholder={placeholder}
          aria-controls={listId}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      )}
      {open && value === null ? (
        <div
          id={listId}
          role="listbox"
          data-testid="picker-listbox"
          style={{
            background: "var(--canvas-850)",
            border: "1px solid color-mix(in oklab, white 8%, transparent)",
            borderRadius: 8,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {loading ? (
            <span
              data-testid="picker-loading"
              role="status"
              style={{
                padding: 6,
                color: "var(--fg-muted)",
                fontSize: "0.75rem",
              }}
            >
              Searching…
            </span>
          ) : null}
          {error !== null ? (
            <span
              data-testid="picker-error"
              role="alert"
              style={{
                padding: 6,
                color: "var(--status-error-fg)",
                fontSize: "0.75rem",
              }}
            >
              {error}
            </span>
          ) : null}
          {!loading && error === null && suggestions.length === 0 ? (
            <span
              data-testid="picker-empty"
              style={{
                padding: 6,
                color: "var(--fg-muted)",
                fontSize: "0.75rem",
              }}
            >
              {query.trim().length === 0 ? "Type to search." : "No matches."}
            </span>
          ) : null}
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected="false"
              data-suggestion={suggestion.id}
              onClick={() => {
                onValueChange(suggestion);
                setOpen(false);
                setQuery("");
              }}
              style={{
                textAlign: "left",
                padding: 6,
                background: "transparent",
                border: "none",
                color: "var(--fg-default)",
                cursor: "pointer",
                borderRadius: 4,
                font: "inherit",
              }}
            >
              <span>{suggestion.label}</span>
              {suggestion.hint !== undefined ? (
                <span
                  style={{
                    marginLeft: 6,
                    color: "var(--fg-muted)",
                    fontSize: "0.75rem",
                  }}
                >
                  {suggestion.hint}
                </span>
              ) : null}
            </button>
          ))}
          {allowLookupById ? (
            <LookupByIdDisclosure
              value={lookupId}
              onValueChange={setLookupId}
              onSubmit={(id) => {
                onLookupById?.(id);
                setLookupId("");
                setOpen(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type LookupByIdDisclosureProps = {
  readonly value: string;
  readonly onValueChange: (next: string) => void;
  readonly onSubmit: (id: string) => void;
};

function LookupByIdDisclosure({
  value,
  onValueChange,
  onSubmit,
}: LookupByIdDisclosureProps): ReactNode {
  return (
    <details
      data-testid="picker-lookup-by-id"
      style={{
        marginTop: 4,
        borderTop: "1px solid color-mix(in oklab, white 6%, transparent)",
        paddingTop: 4,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: "0.75rem",
          color: "var(--fg-muted)",
          listStyle: "none",
          padding: 4,
        }}
      >
        Lookup by id
      </summary>
      <div style={{ display: "flex", gap: 4, padding: 4 }}>
        <Input
          type="text"
          aria-label="Lookup id"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          data-testid="picker-lookup-submit"
          disabled={value.trim().length === 0}
          onClick={() => onSubmit(value.trim())}
        >
          Open
        </Button>
      </div>
    </details>
  );
}
