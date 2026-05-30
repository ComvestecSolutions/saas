import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Schema } from "effect";
import { Badge, EmptyState, StateScreen } from "@comvestec/ui";
import {
  universalSearchFacet,
  universalSearchPrefix,
  UniversalSearchPrefixSchema,
  type UniversalSearchPrefix,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  FilterSelect,
  KpiCard,
  OpsPanel,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../lib/effect-boundary";
import { formatAdminInteger } from "../../lib/number-format";
import { formatAdminTimestamp } from "../../lib/timestamp-format";
import type { AdminUniversalSearchRouteData } from "../../lib/universal-search-route-data";
import {
  resolveUniversalSearchEntryDestination,
  universalSearchFacetLabel,
} from "../../lib/universal-search-presentation";

const SearchRouteSchema = Schema.Struct({
  q: Schema.optional(Schema.String),
  prefix: Schema.optional(Schema.String),
});
const SearchRouteBoundarySchema = Schema.Struct({
  q: Schema.optional(Schema.Unknown),
  prefix: Schema.optional(Schema.Unknown),
});

type SearchRouteSearch = Schema.Schema.Type<typeof SearchRouteSchema>;
const decodeSearchRouteBoundary = decodeSyncBoundary(SearchRouteBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const decodeSearchPrefix = decodeSchemaOrUndefined(UniversalSearchPrefixSchema);

const validateSearch = (raw: unknown): SearchRouteSearch => {
  const search = decodeSearchRouteBoundary(raw);
  const q = decodeSearchString(search.q);
  const prefix = decodeSearchString(search.prefix);

  return {
    ...(q === undefined ? {} : { q }),
    ...(prefix === undefined ? {} : { prefix }),
  };
};
const searchPrefixOptions = [
  { value: "", label: "All facets" },
  ...Object.values(universalSearchPrefix).map((value) => ({
    value,
    label: value,
  })),
] as const;
const searchFacetOrder = [
  universalSearchFacet.tenants,
  universalSearchFacet.users,
  universalSearchFacet.featureFlags,
  universalSearchFacet.configKeys,
  universalSearchFacet.auditEvents,
  universalSearchFacet.invoices,
  universalSearchFacet.webhooks,
  universalSearchFacet.customDomains,
] as const;
const searchSurfaceGuidance = [
  {
    label: "Tenant control plane",
    description:
      "Workspace posture, support context, billing, branding, and repair paths.",
  },
  {
    label: "Governance surfaces",
    description:
      "Flags, runtime config, authorization subjects, and audit evidence.",
  },
  {
    label: "Revenue posture",
    description:
      "Invoices, webhook delivery workflows, and vendor-backed operational context.",
  },
  {
    label: "Operator triage",
    description:
      "A single query path for the screens operators actually need to land on quickly.",
  },
] as const;

const resolveSearchPrefixLabel = (value: string | undefined): string =>
  decodeSearchPrefix(value) ?? "All facets";

type ReadyAdminUniversalSearchRouteData = Extract<
  AdminUniversalSearchRouteData,
  { readonly kind: "ready" }
>;
type SearchSortKey = "result" | "facet" | "scope" | "classification";

export const Route = createAdminAppFileRoute("/desk/search")({
  validateSearch,
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
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading federated search…" />
  ),
});

function SearchRoute() {
  const data: AdminUniversalSearchRouteData = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q ?? "");
  const [prefix, setPrefix] = useState(search.prefix ?? "");
  const tableState = useTableState<SearchSortKey>({
    initialPageSize: 10,
    initialSortKey: "result",
    initialSortDir: "asc",
  });

  useEffect(() => {
    setQuery(search.q ?? "");
    setPrefix(search.prefix ?? "");
    tableState.setPage(1);
  }, [search.prefix, search.q, tableState.setPage]);

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
      <section className="ops-screen" data-testid="admin-search-empty">
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
        <div className="admin-search-grid">
          <div className="admin-search-main">
            <div className="ops-card">
              <EmptyState
                title="Search the operator catalog"
                description="Enter a search term or prefix filter to inspect federated results across the admin workbench."
              />
            </div>
          </div>
          <div className="admin-search-aside">
            <OpsPanel
              title="Available prefixes"
              description="Narrow the backend fan-out before the query leaves the route."
            >
              <div className="ops-chip-grid">
                {searchPrefixOptions.slice(1).map((option) => (
                  <div key={option.value} className="ops-chip-card">
                    <span className="ops-chip-label">{option.label}</span>
                  </div>
                ))}
              </div>
            </OpsPanel>
            <OpsPanel
              title="Indexed operator surfaces"
              description="Search lands you on the actual control-plane surfaces instead of duplicating those workflows here."
            >
              <div className="ops-meta-grid">
                {searchSurfaceGuidance.map((item) => (
                  <div key={item.label}>
                    <p className="ops-meta-label">{item.label}</p>
                    <p className="ops-meta-value">{item.description}</p>
                  </div>
                ))}
              </div>
            </OpsPanel>
          </div>
        </div>
      </section>
    );
  }

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to run federated search."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access federated search."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <StateScreen
        variant="denied"
        title="Access denied"
        description={data.reason}
      />
    );
  }
  if (data.kind === "error") {
    return (
      <StateScreen
        variant="5xx"
        title={data.title}
        description={data.description}
      />
    );
  }

  const { result, fromCache } = data;
  const facetBreakdown = useMemo(() => {
    const counts = new Map<(typeof searchFacetOrder)[number], number>();
    for (const entry of result.entries) {
      counts.set(entry.facet, (counts.get(entry.facet) ?? 0) + 1);
    }
    return searchFacetOrder
      .map((facet) => ({
        facet,
        count: counts.get(facet) ?? 0,
      }))
      .filter((item) => item.count > 0);
  }, [result.entries]);
  const { visible, total } = applyTableState(result.entries, tableState, {
    searchOn: (entry) =>
      [
        entry.label,
        entry.subtitle ?? "",
        entry.id,
        entry.scopeTag,
        entry.fieldClassification,
        universalSearchFacetLabel(entry.facet),
      ].join(" "),
    sortOn: {
      result: (entry) => `${entry.label} ${entry.subtitle ?? entry.id}`,
      facet: (entry) => universalSearchFacetLabel(entry.facet),
      scope: (entry) => entry.scopeTag,
      classification: (entry) => entry.fieldClassification,
    },
  });
  const queryPosture = [
    {
      label: "Query",
      value: result.query,
      mono: true,
    },
    {
      label: "Prefix",
      value: resolveSearchPrefixLabel(search.prefix),
      mono: false,
    },
    {
      label: "Correlation",
      value: result.correlationId,
      mono: true,
    },
    {
      label: "Generated",
      value: formatAdminTimestamp(result.generatedAt),
      mono: true,
    },
    {
      label: "Cache",
      value: fromCache ? "Hit" : "Live",
      mono: false,
    },
    {
      label: "Freshness",
      value: result.indexFreshness.isFresh ? "Fresh" : "Stale",
      mono: false,
    },
  ] as const;

  return (
    <section className="ops-screen" data-testid="admin-search-ready">
      <ScreenHeader
        title="Search"
        breadcrumbs={[{ label: "Resources" }, { label: "Search" }]}
        subtitle={
          <>
            Query <span className="mono">{result.query}</span> ·{" "}
            {formatAdminInteger(total)} matches across{" "}
            {formatAdminInteger(facetBreakdown.length)} indexed facets
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

      <div data-testid="admin-search-kpis" className="ops-bento">
        <KpiCard
          label="Results"
          value={formatAdminInteger(total)}
          tone={result.entries.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Facets hit"
          value={formatAdminInteger(facetBreakdown.length)}
          tone={facetBreakdown.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Partial failures"
          value={formatAdminInteger(result.partialFailures.length)}
          tone={result.partialFailures.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Cache"
          value={fromCache ? "Hit" : "Live"}
          tone={fromCache ? "neutral" : "good"}
        />
      </div>

      <div className="admin-search-grid">
        <div className="admin-search-main">
          <div className="ops-card">
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                Result workspace
                <span className="ops-card-head__count">
                  {formatAdminInteger(total)}
                </span>
              </p>
            </div>

            {total === 0 ? (
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
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "result")}
                        onToggle={() => tableState.toggleSort("result")}
                      >
                        Result
                      </SortableTableHeader>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "facet")}
                        onToggle={() => tableState.toggleSort("facet")}
                      >
                        Facet
                      </SortableTableHeader>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(tableState, "scope")}
                        onToggle={() => tableState.toggleSort("scope")}
                      >
                        Scope
                      </SortableTableHeader>
                      <SortableTableHeader
                        ariaSort={resolveTableAriaSort(
                          tableState,
                          "classification",
                        )}
                        onToggle={() => tableState.toggleSort("classification")}
                      >
                        Classification
                      </SortableTableHeader>
                      <th>Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((entry) => (
                      <SearchResultRow
                        key={`${entry.facet}:${entry.id}`}
                        entry={entry}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {total > 0 ? (
              <Pagination
                page={tableState.page}
                pageSize={tableState.pageSize}
                total={total}
                onPageChange={tableState.setPage}
                onPageSizeChange={tableState.setPageSize}
              />
            ) : null}
          </div>
        </div>

        <div className="admin-search-aside">
          <OpsPanel
            title="Query posture"
            description="Snapshot of the last federated query and backend response posture."
            data-testid="admin-search-query-posture"
          >
            <div className="ops-meta-grid">
              {queryPosture.map((item) => (
                <div key={item.label}>
                  <p className="ops-meta-label">{item.label}</p>
                  <p
                    className={[
                      "ops-meta-value",
                      item.mono ? "ops-meta-value--mono" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </OpsPanel>

          <OpsPanel
            title="Facet spread"
            description="Which indexed surfaces contributed the current result set."
            data-testid="admin-search-facet-breakdown"
          >
            {facetBreakdown.length === 0 ? (
              <p className="ops-meta-value">
                No indexed facets returned a match for this query.
              </p>
            ) : (
              <div className="ops-chip-grid">
                {facetBreakdown.map((item) => (
                  <div key={item.facet} className="ops-chip-card">
                    <span className="ops-chip-label">
                      {universalSearchFacetLabel(item.facet)}
                    </span>
                    <span className="mono">
                      {formatAdminInteger(item.count)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </OpsPanel>

          <OpsPanel
            title={
              result.partialFailures.length > 0
                ? "Partial failures"
                : "Search health"
            }
            tone={result.partialFailures.length > 0 ? "warn" : "neutral"}
            description={
              result.partialFailures.length > 0
                ? "Some indexed facets degraded while the route still returned partial results."
                : "All requested facets responded without partial failures on the last query."
            }
            data-testid="admin-search-health-panel"
          >
            {result.partialFailures.length > 0 ? (
              <div className="admin-search-failure-list">
                {result.partialFailures.map((failure) => (
                  <div
                    key={`${failure.facet}:${failure.reason}`}
                    className="admin-search-failure-item"
                  >
                    <strong>{universalSearchFacetLabel(failure.facet)}</strong>
                    <span>{failure.reason}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ops-meta-grid">
                <div>
                  <p className="ops-meta-label">Coverage</p>
                  <p className="ops-meta-value">
                    All requested facets responded on the latest query.
                  </p>
                </div>
                <div>
                  <p className="ops-meta-label">Last reindex</p>
                  <p className="ops-meta-value ops-meta-value--mono">
                    {formatAdminTimestamp(
                      result.indexFreshness.lastReindexedAt,
                    )}
                  </p>
                </div>
              </div>
            )}
          </OpsPanel>
        </div>
      </div>
    </section>
  );
}

function SearchResultRow({
  entry,
}: {
  readonly entry: ReadyAdminUniversalSearchRouteData["result"]["entries"][number];
}) {
  const destination = resolveUniversalSearchEntryDestination(entry);

  return (
    <tr data-testid="admin-search-result-row">
      <td>
        <div className="admin-search-result-copy">
          <span className="text-strong">{entry.label}</span>
          <span className="admin-search-result-subtitle">
            {entry.subtitle ?? entry.id}
          </span>
        </div>
      </td>
      <td>
        <Badge variant="neutral">
          {universalSearchFacetLabel(entry.facet)}
        </Badge>
      </td>
      <td>
        <span className="mono">{entry.scopeTag}</span>
      </td>
      <td>
        <span className="mono">{entry.fieldClassification}</span>
      </td>
      <td>
        {destination.external ? (
          <a
            href={destination.href}
            data-testid="admin-search-result-link"
            className="ops-btn ops-btn--xs"
            target="_blank"
            rel="noreferrer noopener"
          >
            Open result
          </a>
        ) : (
          <Link
            to={destination.href}
            data-testid="admin-search-result-link"
            className="ops-btn ops-btn--xs"
          >
            Open result
          </Link>
        )}
      </td>
    </tr>
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
      className="admin-search-form"
    >
      <FilterBar
        searchValue={query}
        onSearchChange={onQueryChange}
        searchPlaceholder="Search tenants, invoices, domains, or governance events…"
        trailing={
          <button type="submit" className="ops-btn ops-btn--primary">
            Run search
          </button>
        }
      >
        <FilterSelect
          label="Prefix filter"
          value={prefix}
          onChange={onPrefixChange}
          options={searchPrefixOptions}
        />
      </FilterBar>
    </form>
  );
}
