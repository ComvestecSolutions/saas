import { useEffect, useState, type FormEvent } from "react";
import { Schema } from "effect";
import { Badge, EmptyState, PermissionDeniedState } from "@comvestec/ui";
import {
  universalSearchPrefix,
  type UniversalSearchPrefix,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { AdminSessionRequiredState } from "../../components/admin-session-required-state";
import { KpiCard, ScreenHeader } from "../../components/ui";
import type { AdminUniversalSearchRouteData } from "../../lib/universal-search-route-data";
import {
  resolveUniversalSearchEntryPermalink,
  universalSearchFacetLabel,
} from "../../lib/universal-search-presentation";

const SearchRouteSchema = Schema.Struct({
  q: Schema.optional(Schema.String),
  prefix: Schema.optional(Schema.String),
});

const knownUniversalSearchPrefixes = new Set<string>(
  Object.values(universalSearchPrefix),
);

const decodeSearchPrefix = (
  value: string | undefined,
): UniversalSearchPrefix | undefined =>
  value !== undefined && knownUniversalSearchPrefixes.has(value)
    ? (value as UniversalSearchPrefix)
    : undefined;

const formatSearchTimestamp = (value: string): string =>
  value.slice(0, 16).replace("T", " ");

export const Route = createAdminAppFileRoute("/desk/search")({
  validateSearch: (raw) => Schema.validateSync(SearchRouteSchema)(raw),
  loaderDeps: ({ search }) => ({
    query: search.q?.trim() ?? "",
    prefixFilter: decodeSearchPrefix(search.prefix),
  }),
  loader: async ({ deps }) => {
    const { loadAdminUniversalSearchLoaderData } =
      await import("../../lib/universal-search-loader");

    return loadAdminUniversalSearchLoaderData({
      query: deps.query,
      ...(deps.prefixFilter === undefined
        ? {}
        : { prefixFilter: deps.prefixFilter }),
    });
  },
  component: SearchRoute,
  pendingComponent: () => <EmptyState title="Loading search…" />,
});

function SearchRoute() {
  const data: AdminUniversalSearchRouteData = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q ?? "");
  const [prefix, setPrefix] = useState(search.prefix ?? "");

  useEffect(() => {
    setQuery(search.q ?? "");
    setPrefix(search.prefix ?? "");
  }, [search.prefix, search.q]);

  const trimmedQuery = search.q?.trim() ?? "";
  const hasQuery = trimmedQuery.length > 0;

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextQuery = query.trim();
    const nextPrefix = decodeSearchPrefix(prefix);

    navigate({
      search:
        nextQuery.length === 0
          ? {}
          : {
              q: nextQuery,
              ...(nextPrefix === undefined ? {} : { prefix: nextPrefix }),
            },
    });
  };

  if (!hasQuery) {
    return (
      <section
        data-testid="admin-search-empty"
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
      >
        <ScreenHeader
          title="Search"
          breadcrumbs={[{ label: "Resources" }, { label: "Search" }]}
          subtitle="Federated operator search across tenants, governance, billing, and resource surfaces."
        />
        <SearchForm
          query={query}
          prefix={prefix}
          onQueryChange={setQuery}
          onPrefixChange={setPrefix}
          onSubmit={submitSearch}
        />
        <EmptyState
          title="Search the operator catalog"
          description="Enter a search term or prefix filter to inspect federated results across the admin workbench."
        />
      </section>
    );
  }

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to run federated search."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to access federated search."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }
  if (data.kind === "error") {
    return <EmptyState title={data.title} description={data.description} />;
  }

  const { result, fromCache } = data;

  return (
    <section
      data-testid="admin-search-ready"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Search"
        breadcrumbs={[{ label: "Resources" }, { label: "Search" }]}
        subtitle={
          <>
            Query <span className="mono">{result.query}</span> · correlation{" "}
            <span className="mono">{result.correlationId}</span>
          </>
        }
      />

      <SearchForm
        query={query}
        prefix={prefix}
        onQueryChange={setQuery}
        onPrefixChange={setPrefix}
        onSubmit={submitSearch}
      />

      <div
        data-testid="admin-search-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Results"
          value={result.entries.length}
          tone={result.entries.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Partial failures"
          value={result.partialFailures.length}
          tone={result.partialFailures.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Index freshness"
          value={result.indexFreshness.isFresh ? "Fresh" : "Stale"}
          tone={result.indexFreshness.isFresh ? "good" : "warn"}
        />
        <KpiCard
          label="Cache"
          value={fromCache ? "Hit" : "Live"}
          tone={fromCache ? "neutral" : "good"}
        />
      </div>

      {result.partialFailures.length > 0 ? (
        <div
          data-testid="admin-search-partial-failures"
          className="ops-card"
          style={{ display: "grid", gap: 6 }}
        >
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Partial failures
              <span className="ops-card-head__count">
                {result.partialFailures.length}
              </span>
            </p>
          </div>
          {result.partialFailures.map((failure) => (
            <div
              key={`${failure.facet}:${failure.reason}`}
              style={{ display: "grid", gap: 2 }}
            >
              <strong>{universalSearchFacetLabel(failure.facet)}</strong>
              <span>{failure.reason}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Result workspace
            <span className="ops-card-head__count">
              {result.entries.length}
            </span>
          </p>
          <span className="mono">
            Generated {formatSearchTimestamp(result.generatedAt)}
          </span>
        </div>

        {result.entries.length === 0 ? (
          <EmptyState
            title="No search results"
            description="No federated results matched the current query. Broaden the term or switch the prefix filter."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table
              data-testid="admin-search-results-table"
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Facet</th>
                  <th>Scope</th>
                  <th>Classification</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {result.entries.map((entry) => (
                  <tr
                    key={`${entry.facet}:${entry.id}`}
                    data-testid="admin-search-result-row"
                  >
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="text-strong">{entry.label}</span>
                        <span style={{ color: "var(--ops-text-secondary)" }}>
                          {entry.subtitle ?? entry.id}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <Badge variant="neutral">
                        {universalSearchFacetLabel(entry.facet)}
                      </Badge>
                    </td>
                    <td style={{ padding: 4 }}>
                      <span className="mono">{entry.scopeTag}</span>
                    </td>
                    <td style={{ padding: 4 }}>
                      <span className="mono">{entry.fieldClassification}</span>
                    </td>
                    <td style={{ padding: 4 }}>
                      <a
                        href={resolveUniversalSearchEntryPermalink(entry)}
                        data-testid="admin-search-result-link"
                      >
                        Open result
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

type SearchFormProps = {
  readonly query: string;
  readonly prefix: string;
  readonly onQueryChange: (value: string) => void;
  readonly onPrefixChange: (value: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function SearchForm({
  query,
  prefix,
  onQueryChange,
  onPrefixChange,
  onSubmit,
}: Readonly<SearchFormProps>) {
  return (
    <form
      data-testid="admin-search-form"
      onSubmit={onSubmit}
      className="ops-card"
      style={{
        display: "grid",
        gap: 6,
        gridTemplateColumns: "minmax(240px, 1.8fr) minmax(160px, 1fr) auto",
        alignItems: "end",
      }}
    >
      <label style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}>
        <span>Search query</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Search tenants, invoices, domains, or governance events…"
        />
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}>
        <span>Prefix filter</span>
        <select
          value={prefix}
          onChange={(event) => onPrefixChange(event.currentTarget.value)}
        >
          <option value="">All facets</option>
          {Object.values(universalSearchPrefix).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <button type="submit">Run search</button>
    </form>
  );
}
