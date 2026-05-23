import { useState } from "react";
import { Schema } from "effect";
import { createAdminAppFileRoute } from "../../file-route";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
  Badge,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../../components/admin-session-required-state";
import { AdminTenantTargetForm } from "../../components/admin-tenant-target-form";
import { buildAdminTenantTargetSearch } from "../../lib/admin-tenant-target";
import {
  ScreenHeader,
  KpiCard,
  Tabs,
  FilterBar,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  KeyIcon,
  resolveTableAriaSort,
} from "../../components/ui";

const WebhookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M6 8a2 2 0 100-4 2 2 0 000 4z"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path
      d="M6 8l2 4h4M8 4H4a2 2 0 000 4"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);

const WebhooksSearchSchema = Schema.Struct({
  scopeId: Schema.optional(Schema.NonEmptyString),
  scope: Schema.optional(Schema.NonEmptyString),
});

export const Route = createAdminAppFileRoute(
  "/integrations/webhooks-api-access",
)({
  validateSearch: (raw) => Schema.validateSync(WebhooksSearchSchema)(raw),
  loaderDeps: ({ search }) => ({
    scopeId: search.scopeId,
    scope: search.scope,
  }),
  loader: ({ deps }) =>
    import("../../lib/operational-loaders").then(
      ({ loadAdminWebhooksApiAccessLoaderData }) =>
        loadAdminWebhooksApiAccessLoaderData(deps.scope, deps.scopeId),
    ),
  component: WebhooksApiAccess,
  pendingComponent: () => (
    <LoadingState title="Loading webhooks and API access…" />
  ),
});

type Tab = "subscriptions" | "keys";

function WebhooksApiAccess() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<Tab>("subscriptions");
  const subsState = useTableState<"sub" | "url" | "status" | "delivery">({
    initialPageSize: 25,
    initialSortKey: "delivery",
    initialSortDir: "desc",
  });
  const keysState = useTableState<"key" | "label" | "status" | "created">({
    initialPageSize: 25,
    initialSortKey: "created",
    initialSortDir: "desc",
  });

  const subscriptions = data.kind === "ready" ? data.subscriptions : [];
  const apiKeys = data.kind === "ready" ? data.apiKeys : [];

  const subsView = applyTableState(subscriptions, subsState, {
    searchOn: (s) =>
      `${s.subscriptionId} ${s.url} ${s.events.join(" ")} ${s.status}`,
    sortOn: {
      sub: (s) => s.subscriptionId,
      url: (s) => s.url,
      status: (s) => s.status,
      delivery: (s) => s.lastDeliveryAt ?? "",
    },
  });
  const keysView = applyTableState(apiKeys, keysState, {
    searchOn: (k) => `${k.apiKeyId} ${k.label} ${k.prefix} ${k.status}`,
    sortOn: {
      key: (k) => k.apiKeyId,
      label: (k) => k.label,
      status: (k) => k.status,
      created: (k) => k.createdAt,
    },
  });

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view webhooks and API access."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to view integration data."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const activeSubs = subscriptions.filter((s) => s.status === "active").length;
  const activeKeys = apiKeys.filter((k) => k.status === "active").length;

  return (
    <div className="ops-screen">
      <ScreenHeader
        icon={<WebhookIcon />}
        title="Webhooks & API Access"
        breadcrumbs={[{ label: "Integrations" }, { label: "Webhooks & API" }]}
        subtitle="Webhook subscriptions and API key registry for a search-selected tenant target."
      />

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Choose tenant target</p>
        </div>
        <AdminTenantTargetForm
          initialScope={search.scope}
          initialScopeId={search.scopeId}
          submitLabel="Load integration view"
          submitVariant="secondary"
          onSubmit={(target) =>
            navigate({ search: buildAdminTenantTargetSearch(target) })
          }
        />
      </div>

      {data.kind === "no-scope" ? (
        <EmptyState
          title="Choose a tenant target"
          description="Pick a named tenant target above, or use the exact internal lookup only when the catalog does not yet include it."
        />
      ) : (
        <>
          <div className="ops-bento">
            <KpiCard
              label="Active webhooks"
              value={activeSubs}
              tone={activeSubs > 0 ? "good" : "neutral"}
            />
            <KpiCard
              label="Active API keys"
              value={activeKeys}
              tone={activeKeys > 0 ? "good" : "neutral"}
              icon={<KeyIcon />}
            />
            <KpiCard label="Total subscriptions" value={subscriptions.length} />
            <KpiCard label="Total keys (history)" value={apiKeys.length} />
          </div>

          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              {
                value: "subscriptions",
                label: "Subscriptions",
                count: subscriptions.length,
              },
              { value: "keys", label: "API keys", count: apiKeys.length },
            ]}
          />

          {tab === "subscriptions" ? (
            <div className="ops-card">
              <FilterBar
                searchValue={subsState.search}
                onSearchChange={subsState.setSearch}
                searchPlaceholder="Search subscriptions…"
              />
              {subsView.visible.length === 0 ? (
                <EmptyState
                  title="No webhook subscriptions"
                  description="No webhook endpoints are registered."
                />
              ) : (
                <div className="ops-table-wrapper">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(subsState, "sub")}
                          onToggle={() => subsState.toggleSort("sub")}
                        >
                          Subscription ID
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(subsState, "url")}
                          onToggle={() => subsState.toggleSort("url")}
                        >
                          URL
                        </SortableTableHeader>
                        <th>Events</th>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(subsState, "status")}
                          onToggle={() => subsState.toggleSort("status")}
                        >
                          Status
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(subsState, "delivery")}
                          onToggle={() => subsState.toggleSort("delivery")}
                        >
                          Last delivery
                        </SortableTableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {subsView.visible.map((s) => (
                        <tr key={s.subscriptionId}>
                          <td className="mono">{s.subscriptionId}</td>
                          <td
                            className="mono ops-redacted"
                            style={{
                              maxWidth: 240,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {s.url}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              {s.events.map((event) => (
                                <Badge key={event} variant="neutral">
                                  {event}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td>
                            <StatusChip
                              status={s.status}
                              variant={resolveStatusVariant(s.status)}
                            />
                          </td>
                          <td className="mono">
                            {s.lastDeliveryAt
                              ? s.lastDeliveryAt.slice(0, 10)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={subsState.page}
                pageSize={subsState.pageSize}
                total={subsView.total}
                onPageChange={subsState.setPage}
                onPageSizeChange={subsState.setPageSize}
              />
            </div>
          ) : (
            <div className="ops-card">
              <FilterBar
                searchValue={keysState.search}
                onSearchChange={keysState.setSearch}
                searchPlaceholder="Search API keys…"
              />
              {keysView.visible.length === 0 ? (
                <EmptyState
                  title="No API keys"
                  description="No API keys are registered."
                />
              ) : (
                <div className="ops-table-wrapper">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(keysState, "key")}
                          onToggle={() => keysState.toggleSort("key")}
                        >
                          Key ID
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(keysState, "label")}
                          onToggle={() => keysState.toggleSort("label")}
                        >
                          Label
                        </SortableTableHeader>
                        <th>Prefix</th>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(keysState, "status")}
                          onToggle={() => keysState.toggleSort("status")}
                        >
                          Status
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(keysState, "created")}
                          onToggle={() => keysState.toggleSort("created")}
                        >
                          Created
                        </SortableTableHeader>
                        <th>Revoked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keysView.visible.map((k) => (
                        <tr key={k.apiKeyId}>
                          <td className="mono ops-redacted">{k.apiKeyId}</td>
                          <td>{k.label}</td>
                          <td className="mono">{k.prefix}</td>
                          <td>
                            <StatusChip
                              status={k.status}
                              variant={resolveStatusVariant(k.status)}
                            />
                          </td>
                          <td className="mono">{k.createdAt.slice(0, 10)}</td>
                          <td className="mono">
                            {k.revokedAt ? k.revokedAt.slice(0, 10) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={keysState.page}
                pageSize={keysState.pageSize}
                total={keysView.total}
                onPageChange={keysState.setPage}
                onPageSizeChange={keysState.setPageSize}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
