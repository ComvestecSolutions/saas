import { useId, useState, type ReactNode } from "react";
import { Input } from "../../primitives/Input/Input";

/**
 * Omnibar — federated operator search input.
 *
 * Scoped prefixes (admin-app plan §3 / §5):
 *   t/   tenants
 *   f/   feature flags
 *   c/   runtime config
 *   u/   users
 *   inv/ invoices
 *   d/   custom domains
 *   kc/  Keycloak resources
 *   ev/  audit events
 *
 * The omnibar is the only id-input UI; every other id-bearing input
 * is a Picker built on top of the same search service. The component
 * itself is presentational — the consuming app passes suggestions
 * and handles selection.
 */
export type OmnibarSuggestion = {
  readonly id: string;
  readonly label: string;
  readonly hint?: ReactNode;
};

export type OmnibarProps = {
  readonly value: string;
  readonly onValueChange: (next: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly onSelectSuggestion?: (suggestion: OmnibarSuggestion) => void;
  readonly suggestions?: readonly OmnibarSuggestion[];
  readonly placeholder?: string;
  readonly ariaLabel?: string;
};

export function Omnibar({
  value,
  onValueChange,
  onSubmit,
  onSelectSuggestion,
  suggestions,
  placeholder = "Search tenants, flags, configs, users…  (Ctrl/Cmd K)",
  ariaLabel = "Operator omnibar",
}: OmnibarProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const hasSuggestions = suggestions !== undefined && suggestions.length > 0;
  const handleValueInput = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(true);
  };
  return (
    <div
      data-pattern="omnibar"
      role="search"
      aria-label={ariaLabel}
      style={{ position: "relative", width: 320, maxWidth: "40vw" }}
    >
      <Input
        type="search"
        value={value}
        onChange={(event) => {
          handleValueInput(event.currentTarget.value);
        }}
        onInput={(event) => {
          handleValueInput(event.currentTarget.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Defer so click-on-suggestion fires before list closes.
          window.setTimeout(() => setOpen(false), 100);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.(event.currentTarget.value);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open && hasSuggestions ? "true" : "false"}
      />
      {open && hasSuggestions ? (
        <ul
          id={listId}
          role="listbox"
          data-testid="omnibar-suggestions"
          style={{
            // Two-depth rule: CommandStrip is glass; the suggestion
            // list is a matte canvas surface so we never nest glass
            // inside glass.
            position: "absolute",
            bottom: "calc(100% + 6px)",
            insetInline: 0,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "var(--canvas-850)",
            border: "1px solid color-mix(in oklab, white 8%, transparent)",
            borderRadius: 8,
            boxShadow: "0 8px 24px -12px rgb(0 0 0 / 0.6)",
            maxHeight: 240,
            overflow: "auto",
            zIndex: 10,
          }}
        >
          {suggestions?.map((suggestion) => (
            <li key={suggestion.id} role="option" aria-selected="false">
              <button
                type="button"
                data-suggestion={suggestion.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectSuggestion?.(suggestion);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: 6,
                  background: "transparent",
                  border: "none",
                  color: "var(--fg-default)",
                  cursor: "pointer",
                  borderRadius: 4,
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
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
