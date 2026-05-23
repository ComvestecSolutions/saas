import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Omnibar,
  useOmnibarShortcut,
  type OmnibarSuggestion,
} from "@comvestec/ui";
import {
  adminRoutePath,
  universalSearchFacet,
  universalSearchPrefix,
  type UniversalSearchEntry,
  type UniversalSearchFacet,
  type UniversalSearchPrefix,
} from "@comvestec/contracts";
import { loadAdminUniversalSearchLoaderData } from "../../lib/universal-search-loader";
import type { AdminUniversalSearchRouteData } from "../../lib/universal-search-route-data";

/**
 * Desk-shell omnibar wrapper (admin-app implementation plan
 * §9 — Phase 2 Desk Core commit 7, item 11). Wires the
 * presentational `Omnibar` UI primitive (CommandStrip glass
 * surface) to the `loadAdminUniversalSearchLoaderData` loader
 * trio with a debounced server-fn call, prefix routing, and
 * `/r/...` deep-link navigation.
 *
 * Prefix routing — value is split at the first `/`. Recognised
 * prefixes are decoded against `universalSearchPrefix.*` and
 * forwarded to the service as the typed `prefixFilter`. No
 * prefix → federated search across every facet.
 *
 * Selection → navigation. Each `UniversalSearchEntry` carries a
 * server-built `permalink`. The wrapper prefers the entry's own
 * permalink (the service is the canonical owner of every
 * resource-shell URL); when a permalink is missing or empty
 * (defensive — the contract requires it) the wrapper falls back
 * to a mapped `adminRoutePath.*` or `/r/<facet>/<id>` shape.
 *
 * Escape hatch (commit 7 prompt): keyboard map richer than the
 * primitive default (↑/↓/Enter/Esc), `⌘K` toggle, and the
 * full-screen mobile sheet are deferred to commit 8. The
 * primitive already wires Enter / Escape / focus open-close;
 * `useOmnibarShortcut` already supplies the `⌘K` toggle
 * upstream in `DeskShell`.
 */
export type DeskShellOmnibarProps = {
  readonly ariaLabel?: string;
  readonly onNavigate?: (path: string) => void;
  /**
   * Test seam — accepted so the browser harness can route the
   * server-fn call to its mocked loader without going through
   * the dynamic `import("../../lib/universal-search-loader")`
   * inside the default loader path.
   */
  readonly loadUniversalSearch?: typeof loadAdminUniversalSearchLoaderData;
};

const DEBOUNCE_MS = 200;

type ParsedOmnibarInput = {
  readonly query: string;
  readonly prefixFilter?: UniversalSearchPrefix;
};

const recognisedPrefixes = new Set<string>(
  Object.values(universalSearchPrefix),
);

const parseOmnibarInput = (raw: string): ParsedOmnibarInput => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { query: "" };
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0) return { query: trimmed };
  const candidate = trimmed.slice(0, slashIndex);
  if (!recognisedPrefixes.has(candidate)) {
    return { query: trimmed };
  }
  const rest = trimmed.slice(slashIndex + 1).trim();
  return {
    query: rest.length > 0 ? rest : trimmed,
    prefixFilter: candidate as UniversalSearchPrefix,
  };
};

const facetFallbackPath: Record<UniversalSearchFacet, string> = {
  [universalSearchFacet.tenants]: adminRoutePath.tenantWorkspaceDiscovery,
  [universalSearchFacet.users]: adminRoutePath.accessControl,
  [universalSearchFacet.featureFlags]: adminRoutePath.featureFlags,
  [universalSearchFacet.configKeys]: adminRoutePath.runtimeConfig,
  [universalSearchFacet.auditEvents]: "/r/audit",
  [universalSearchFacet.invoices]: adminRoutePath.billing,
  [universalSearchFacet.webhooks]: adminRoutePath.webhooksApiAccess,
  [universalSearchFacet.customDomains]: adminRoutePath.branding,
};

const resolvePermalink = (entry: UniversalSearchEntry): string => {
  if (entry.permalink.length > 0) return entry.permalink;
  if (entry.facet === universalSearchFacet.tenants) {
    return `/r/tenant/${entry.id}`;
  }
  const fallback = facetFallbackPath[entry.facet];
  return fallback === undefined ? `/r/${entry.facet}/${entry.id}` : fallback;
};

const navigateToPermalink = (
  permalink: string,
  onNavigate: ((path: string) => void) | undefined,
) => {
  if (onNavigate !== undefined) {
    onNavigate(permalink);
    return;
  }

  if (typeof window !== "undefined") {
    window.location.assign(permalink);
  }
};

const facetLabel = (facet: UniversalSearchFacet): string => {
  switch (facet) {
    case universalSearchFacet.tenants:
      return "Tenant";
    case universalSearchFacet.users:
      return "User";
    case universalSearchFacet.featureFlags:
      return "Flag";
    case universalSearchFacet.configKeys:
      return "Config";
    case universalSearchFacet.auditEvents:
      return "Audit";
    case universalSearchFacet.invoices:
      return "Invoice";
    case universalSearchFacet.webhooks:
      return "Webhook";
    case universalSearchFacet.customDomains:
      return "Domain";
  }
};

const toSuggestions = (
  data: AdminUniversalSearchRouteData,
): readonly OmnibarSuggestion[] => {
  if (data.kind !== "ready") return [];
  return data.result.entries.map((entry) => ({
    id: `${entry.facet}:${entry.id}`,
    label: entry.label,
    hint: facetLabel(entry.facet),
  }));
};

export function DeskShellOmnibar({
  ariaLabel,
  onNavigate,
  loadUniversalSearch = loadAdminUniversalSearchLoaderData,
}: DeskShellOmnibarProps) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<AdminUniversalSearchRouteData>({
    kind: "shell",
  });
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useOmnibarShortcut(() => {
    // ⌘K / Ctrl-K toggles the omnibar focus/open hint. The
    // shortcut is the single canonical Operator Desk affordance
    // and is owned by the shared `useOmnibarShortcut` hook (rich
    // keyboard map ↑/↓ navigation + full-screen mobile sheet are
    // deferred to commit 8 per the commit-7 escape hatch).
    setOpen((current) => {
      const next = !current;
      const root = containerRef.current;
      if (root !== null) {
        const input = root.querySelector<HTMLInputElement>(
          "input[type='search']",
        );
        if (input !== null) {
          if (next) input.focus();
          else input.blur();
        }
      }
      return next;
    });
  });

  const parsed = useMemo(() => parseOmnibarInput(value), [value]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (parsed.query.trim().length === 0) {
      setState({ kind: "shell" });
      return undefined;
    }

    const requestId = ++requestSeqRef.current;

    debounceRef.current = setTimeout(() => {
      void loadUniversalSearch({
        query: parsed.query,
        ...(parsed.prefixFilter === undefined
          ? {}
          : { prefixFilter: parsed.prefixFilter }),
      })
        .then((next) => {
          if (requestId === requestSeqRef.current) {
            setState(next);
          }
        })
        .catch(() => {
          if (requestId === requestSeqRef.current) {
            setState({
              kind: "error",
              title: "Search unavailable",
              description:
                "The federated search service did not respond. Retry shortly.",
            });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [loadUniversalSearch, parsed.prefixFilter, parsed.query]);

  const suggestionEntryIndex = useMemo(() => {
    const index = new Map<string, UniversalSearchEntry>();
    if (state.kind === "ready") {
      for (const entry of state.result.entries) {
        index.set(`${entry.facet}:${entry.id}`, entry);
      }
    }
    return index;
  }, [state]);

  const suggestions = useMemo(() => toSuggestions(state), [state]);

  const handleSelectSuggestion = useCallback(
    (suggestion: OmnibarSuggestion) => {
      const entry = suggestionEntryIndex.get(suggestion.id);
      if (entry === undefined) return;
      const permalink = resolvePermalink(entry);
      navigateToPermalink(permalink, onNavigate);
      setValue("");
      setOpen(false);
      setState({ kind: "shell" });
    },
    [onNavigate, suggestionEntryIndex],
  );

  const deniedReason = state.kind === "denied" ? state.reason : undefined;
  const errorDescription =
    state.kind === "error" ? state.description : undefined;

  return (
    <div
      ref={containerRef}
      data-component="desk-shell-omnibar"
      data-omnibar-state={state.kind}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <Omnibar
        value={value}
        onValueChange={(next) => {
          setValue(next);
          if (next.length > 0) setOpen(true);
          else setOpen(false);
        }}
        onSubmit={() => setOpen(false)}
        onSelectSuggestion={handleSelectSuggestion}
        suggestions={suggestions}
        ariaLabel={
          ariaLabel ?? (open ? "Operator omnibar (open)" : "Operator omnibar")
        }
      />
      {deniedReason !== undefined ? (
        <p
          data-testid="desk-shell-omnibar-denied"
          role="status"
          style={{
            margin: 0,
            padding: 2,
            fontSize: "0.6875rem",
            color: "var(--fg-muted)",
          }}
        >
          {deniedReason}
        </p>
      ) : null}
      {errorDescription !== undefined ? (
        <p
          data-testid="desk-shell-omnibar-error"
          role="status"
          style={{
            margin: 0,
            padding: 2,
            fontSize: "0.6875rem",
            color: "var(--fg-muted)",
          }}
        >
          {errorDescription}
        </p>
      ) : null}
      {state.kind === "ready" && state.result.entries.length === 0 ? (
        <p
          data-testid="desk-shell-omnibar-empty"
          role="status"
          style={{
            margin: 0,
            padding: 2,
            fontSize: "0.6875rem",
            color: "var(--fg-muted)",
          }}
        >
          No results.
        </p>
      ) : null}
    </div>
  );
}
