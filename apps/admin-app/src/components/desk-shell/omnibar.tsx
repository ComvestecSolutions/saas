import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Omnibar,
  useOmnibarShortcut,
  type OmnibarSuggestion,
} from "@comvestec/ui";
import {
  adminRoutePath,
  platformModuleIds,
  universalSearchFacet,
  universalSearchPrefix,
  type PlatformModuleId,
  type UniversalSearchEntry,
  type UniversalSearchFacet,
  type UniversalSearchPrefix,
} from "@comvestec/contracts";
import { loadAdminUniversalSearchLoaderData } from "../../lib/universal-search-loader";
import type { AdminUniversalSearchRouteData } from "../../lib/universal-search-route-data";
import {
  resolveUniversalSearchEntryPermalink,
  universalSearchFacetLabel,
} from "../../lib/universal-search-presentation";
import { buildAdminFeatureFlagPath } from "../../lib/admin-feature-flag-path";
import { buildAdminRuntimeConfigPath } from "../../lib/admin-runtime-config-path";
import { navigateAdminPath } from "../../lib/browser-navigation";

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

const knownPlatformModuleIds = new Set<string>(platformModuleIds);

const isPlatformModuleId = (value: string): value is PlatformModuleId =>
  knownPlatformModuleIds.has(value);

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

const navigateToPermalink = (
  permalink: string,
  onNavigate: ((path: string) => void) | undefined,
) => navigateAdminPath(permalink, onNavigate);

const resolveSubmittedPrefixPermalink = (
  input: ParsedOmnibarInput,
): string | undefined => {
  if (input.prefixFilter === undefined || input.query.length === 0) {
    return undefined;
  }

  switch (input.prefixFilter) {
    case universalSearchPrefix.tenant:
      return adminRoutePath.tenantWorkspace.replace(
        "$tenantId",
        encodeURIComponent(input.query),
      );
    case universalSearchPrefix.flag:
      return buildAdminFeatureFlagPath({ flagKey: input.query });
    case universalSearchPrefix.config: {
      const dotIndex = input.query.indexOf(".");
      if (dotIndex <= 0) {
        return undefined;
      }
      const moduleId = input.query.slice(0, dotIndex);
      return isPlatformModuleId(moduleId)
        ? buildAdminRuntimeConfigPath({ moduleId, configKey: input.query })
        : undefined;
    }
    case universalSearchPrefix.invoice:
      return `/r/invoice/${encodeURIComponent(input.query)}`;
    case universalSearchPrefix.domain:
      return `/r/domain/${encodeURIComponent(input.query)}`;
    case universalSearchPrefix.user:
    case universalSearchPrefix.keycloakUser:
    case universalSearchPrefix.event:
      return undefined;
  }
};

const toSuggestions = (
  data: AdminUniversalSearchRouteData,
): readonly OmnibarSuggestion[] => {
  if (data.kind !== "ready") return [];
  return data.result.entries.map((entry) => ({
    id: `${entry.facet}:${entry.id}`,
    label: entry.label,
    hint: universalSearchFacetLabel(entry.facet),
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

  const completeNavigation = useCallback(
    (permalink: string) => {
      navigateToPermalink(permalink, onNavigate);
      setValue("");
      setOpen(false);
      setState({ kind: "shell" });
    },
    [onNavigate],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: OmnibarSuggestion) => {
      const entry = suggestionEntryIndex.get(suggestion.id);
      if (entry === undefined) return;
      completeNavigation(resolveUniversalSearchEntryPermalink(entry));
    },
    [completeNavigation, suggestionEntryIndex],
  );

  const handleSubmit = useCallback(
    (rawValue: string) => {
      const submitted = parseOmnibarInput(rawValue);
      const currentTopEntry =
        state.kind === "ready" &&
        state.result.query === submitted.query &&
        state.result.entries.length > 0
          ? state.result.entries[0]
          : undefined;
      const permalink =
        currentTopEntry === undefined
          ? resolveSubmittedPrefixPermalink(submitted)
          : resolveUniversalSearchEntryPermalink(currentTopEntry);

      if (permalink !== undefined) {
        completeNavigation(permalink);
        return;
      }

      setOpen(false);
    },
    [completeNavigation, state],
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
        onSubmit={handleSubmit}
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
