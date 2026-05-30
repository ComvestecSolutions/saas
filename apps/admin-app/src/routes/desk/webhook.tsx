import { Schema } from "effect";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  EmptyState,
  StateScreen,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import {
  operatorWebhookDeliveryStatus,
  PlatformScopeSchema,
  webhookSubscriptionStatus,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { AdminTenantTargetForm } from "../../components/admin-tenant-target-form";
import {
  buildAdminTenantTarget,
  buildAdminTenantTargetSearch,
} from "../../lib/admin-tenant-target";
import { resolveAdminTenantTargetDisplayName } from "../../lib/admin-tenant-target-display-name";
import {
  ExternalIcon,
  FilterBar,
  KpiCard,
  OpsPanel,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  Tabs,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import type {
  AdminWebhookListInput,
  AdminWebhookListRouteData,
} from "../../lib/webhook-list-route-data";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../lib/effect-boundary";

/**
 * `/desk/webhook` — canonical webhook operations surface.
 *
 * The route keeps the spec-canonical
 * `webhook-list-{loader,route-data,route-server}` contract, but the
 * operator UX is upgraded around it: names-first tenant targeting,
 * posture KPIs, attention framing, focused-delivery context, and
 * searchable/sortable/paginated endpoint and delivery rosters.
 */

const RawSearchSchema = Schema.Struct({
  scope: Schema.optional(Schema.String),
  scopeId: Schema.optional(Schema.String),
  selectedDeliveryId: Schema.optional(Schema.String),
});
const RawSearchBoundarySchema = Schema.Struct({
  scope: Schema.optional(Schema.Unknown),
  scopeId: Schema.optional(Schema.Unknown),
  selectedDeliveryId: Schema.optional(Schema.Unknown),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type ReadyData = Extract<AdminWebhookListRouteData, { readonly kind: "ready" }>;
type Tab = "subscriptions" | "deliveries";
const decodeRawSearchBoundary = decodeSyncBoundary(RawSearchBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const decodeScope = decodeSchemaOrUndefined(PlatformScopeSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const validateSearch = (raw: unknown): RawSearch => {
  const search = decodeRawSearchBoundary(raw);
  const scope = decodeSearchString(search.scope);
  const scopeId = decodeSearchString(search.scopeId);
  const selectedDeliveryId = decodeSearchString(search.selectedDeliveryId);

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedDeliveryId === undefined ? {} : { selectedDeliveryId }),
  };
};

const decodeLoaderInput = (raw: RawSearch): AdminWebhookListInput => {
  const scope = decodeScope(raw.scope);
  const scopeId = decodeNonEmptyString(raw.scopeId);
  const selectedDeliveryId = decodeNonEmptyString(raw.selectedDeliveryId);

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedDeliveryId === undefined ? {} : { selectedDeliveryId }),
  };
};

const formatDate = (value: string | null | undefined): string =>
  value === undefined || value === null
    ? "—"
    : value.slice(0, 16).replace("T", " ");

const computeFailureRatePercent = (ready: ReadyData): number => {
  if (ready.deliveries.length === 0) {
    return 0;
  }

  const failedDeliveries = ready.deliveries.filter(
    (delivery) =>
      delivery.status === operatorWebhookDeliveryStatus.failed ||
      delivery.status === operatorWebhookDeliveryStatus.exhausted,
  ).length;

  return Math.round((failedDeliveries / ready.deliveries.length) * 100);
};

export const Route = createAdminAppFileRoute("/desk/webhook")({
  validateSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/webhook-list-loader").then(
      ({ loadAdminWebhookListLoaderData }) =>
        loadAdminWebhookListLoaderData(decodeLoaderInput(deps.search)),
    ),
  component: WebhookListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading webhook posture…" />
  ),
});

function WebhookListRoute() {
  const data: AdminWebhookListRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view webhook posture."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access webhook posture."
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

  return <WebhookReadyRoute data={data} />;
}

function WebhookReadyRoute({ data }: { readonly data: ReadyData }) {
  const navigate = useNavigate({ from: "/desk/webhook" });
  const [tab, setTab] = useState<Tab>(
    data.selectedDeliveryId === undefined ? "subscriptions" : "deliveries",
  );
  const subscriptionsState = useTableState<
    "sub" | "url" | "status" | "delivery"
  >({
    initialPageSize: 25,
    initialSortKey: "delivery",
    initialSortDir: "desc",
  });
  const deliveriesState = useTableState<
    "id" | "sub" | "status" | "attempts" | "enqueued"
  >({
    initialPageSize: 25,
    initialSortKey: "enqueued",
    initialSortDir: "desc",
  });

  const selectedTarget =
    data.scope === null || data.scopeId === null
      ? undefined
      : buildAdminTenantTarget({
          scope: data.scope,
          scopeId: data.scopeId,
        });
  const targetDisplayName =
    selectedTarget === undefined
      ? null
      : resolveAdminTenantTargetDisplayName(selectedTarget);
  const failureRatePercent = useMemo(
    () => computeFailureRatePercent(data),
    [data],
  );
  const inactiveEndpoints = useMemo(
    () =>
      data.subscriptions.filter(
        (item) => item.status !== webhookSubscriptionStatus.active,
      ).length,
    [data.subscriptions],
  );
  const failedDeliveries = useMemo(
    () =>
      data.deliveries.filter(
        (item) =>
          item.status === operatorWebhookDeliveryStatus.failed ||
          item.status === operatorWebhookDeliveryStatus.exhausted,
      ).length,
    [data.deliveries],
  );
  const exhaustedDeliveries = useMemo(
    () =>
      data.deliveries.filter(
        (item) => item.status === operatorWebhookDeliveryStatus.exhausted,
      ).length,
    [data.deliveries],
  );
  const selectedDelivery = useMemo(
    () =>
      data.selectedDeliveryId === undefined
        ? undefined
        : data.deliveries.find((item) => item.id === data.selectedDeliveryId),
    [data.deliveries, data.selectedDeliveryId],
  );

  const subscriptionsView = applyTableState(
    data.subscriptions,
    subscriptionsState,
    {
      searchOn: (item) =>
        `${item.subscriptionId} ${item.url} ${item.status} ${item.events.join(" ")}`,
      sortOn: {
        sub: (item) => item.subscriptionId,
        url: (item) => item.url,
        status: (item) => item.status,
        delivery: (item) => item.lastDeliveryAt ?? "",
      },
    },
  );
  const deliveriesView = applyTableState(data.deliveries, deliveriesState, {
    searchOn: (item) =>
      `${item.id} ${item.subscriptionId} ${item.eventType} ${item.status} ${item.requestUrl}`,
    sortOn: {
      id: (item) => item.id,
      sub: (item) => item.subscriptionId,
      status: (item) => item.status,
      attempts: (item) => item.attemptCount,
      enqueued: (item) => item.enqueuedAt,
    },
  });

  return (
    <section
      className="ops-screen"
      data-testid="webhook-list-ready"
      data-pattern="webhook-v3"
    >
      <ScreenHeader
        title="Webhook Operations"
        breadcrumbs={[{ label: "Resources" }, { label: "Webhooks" }]}
        subtitle={
          selectedTarget === undefined ? (
            <>
              Choose a named tenant target to review endpoints and deliveries.
            </>
          ) : (
            <>
              <span>{targetDisplayName}</span> ·{" "}
              <span className="mono">{selectedTarget.scope}</span> ·{" "}
              <span className="mono">{selectedTarget.scopeId}</span> ·{" "}
              {data.subscriptions.length} subscriptions ·{" "}
              {data.deliveries.length} recent deliveries
            </>
          )
        }
      />

      <section className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Choose tenant target</p>
        </div>
        <AdminTenantTargetForm
          initialScope={selectedTarget?.scope}
          initialScopeId={selectedTarget?.scopeId}
          submitLabel="Load webhook view"
          submitVariant="secondary"
          onSubmit={(target) =>
            navigate({ search: buildAdminTenantTargetSearch(target) })
          }
        />
      </section>

      {selectedTarget === undefined ? (
        <EmptyState
          title="Choose a tenant target"
          description="Pick a named tenant target above. Exact scope-id lookup should be the fallback, not the normal workflow."
        />
      ) : (
        <>
          <div className="ops-bento" data-testid="webhook-list-posture">
            <KpiCard
              label="Active endpoints"
              value={(data.subscriptions.length - inactiveEndpoints).toString()}
              tone={
                data.subscriptions.length - inactiveEndpoints > 0
                  ? "good"
                  : "neutral"
              }
            />
            <KpiCard
              label="Recent deliveries"
              value={data.deliveries.length.toString()}
            />
            <KpiCard
              label="Failure rate"
              value={`${failureRatePercent}%`}
              tone={failureRatePercent >= 10 ? "warn" : "neutral"}
            />
            <KpiCard
              label="Exhausted attempts"
              value={exhaustedDeliveries.toString()}
              tone={exhaustedDeliveries > 0 ? "alert" : "neutral"}
            />
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <OpsPanel
              title="Attention queue"
              tone={
                failedDeliveries > 0 || exhaustedDeliveries > 0
                  ? "alert"
                  : inactiveEndpoints > 0
                    ? "warn"
                    : "neutral"
              }
            >
              <div style={{ display: "grid", gap: 6 }}>
                <AttentionRow
                  label="Non-active endpoints"
                  value={`${inactiveEndpoints}`}
                  tone={inactiveEndpoints > 0 ? "warn" : "neutral"}
                />
                <AttentionRow
                  label="Failed deliveries"
                  value={`${failedDeliveries}`}
                  tone={failedDeliveries > 0 ? "alert" : "neutral"}
                />
                <AttentionRow
                  label="Exhausted delivery retries"
                  value={`${exhaustedDeliveries}`}
                  tone={exhaustedDeliveries > 0 ? "alert" : "neutral"}
                />
              </div>
            </OpsPanel>

            {selectedDelivery === undefined ? (
              <OpsPanel title="Focused delivery">
                <p className="ops-text-muted">
                  Open a delivery detail from the roster to keep retry posture,
                  signature timing, and payload context in reach.
                </p>
              </OpsPanel>
            ) : (
              <OpsPanel
                title="Focused delivery"
                tone={
                  resolveStatusVariant(selectedDelivery.status) === "error"
                    ? "alert"
                    : resolveStatusVariant(selectedDelivery.status) ===
                        "pending"
                      ? "warn"
                      : "neutral"
                }
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className="mono">{selectedDelivery.id}</span>
                    <StatusChip
                      status={selectedDelivery.status}
                      variant={resolveStatusVariant(selectedDelivery.status)}
                    />
                  </div>
                  <p style={{ margin: 0 }}>
                    {selectedDelivery.eventType} ·{" "}
                    <span className="mono">
                      {selectedDelivery.subscriptionId}
                    </span>
                  </p>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span className="ops-text-muted">
                      Request:{" "}
                      <span className="mono ops-redacted">
                        {selectedDelivery.requestMethod}{" "}
                        {selectedDelivery.requestUrl}
                      </span>
                    </span>
                    <span className="ops-text-muted">
                      Enqueued:{" "}
                      <span className="mono">
                        {formatDate(selectedDelivery.enqueuedAt)}
                      </span>
                    </span>
                  </div>
                  <div>
                    <Link
                      className="ops-btn ops-btn--xs"
                      to="/desk/delivery/$deliveryId"
                      params={{ deliveryId: selectedDelivery.id }}
                      search={{
                        scope: selectedTarget.scope,
                        scopeId: selectedTarget.scopeId,
                      }}
                    >
                      <ExternalIcon size={11} /> Open delivery detail
                    </Link>
                  </div>
                </div>
              </OpsPanel>
            )}
          </div>

          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              {
                value: "subscriptions",
                label: "Endpoints",
                count: data.subscriptions.length,
              },
              {
                value: "deliveries",
                label: "Deliveries",
                count: data.deliveries.length,
              },
            ]}
          />

          {tab === "subscriptions" ? (
            <section className="ops-card">
              <FilterBar
                searchValue={subscriptionsState.search}
                onSearchChange={subscriptionsState.setSearch}
                searchPlaceholder="Search subscriptions, URL, or event…"
              />
              {subscriptionsView.visible.length === 0 ? (
                <EmptyState
                  title="No webhook endpoints"
                  description="No webhook endpoints match the current filters."
                />
              ) : (
                <div
                  className="ops-table-wrapper"
                  data-testid="webhook-list-endpoints-table"
                >
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            subscriptionsState,
                            "sub",
                          )}
                          onToggle={() => subscriptionsState.toggleSort("sub")}
                        >
                          Subscription
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            subscriptionsState,
                            "url",
                          )}
                          onToggle={() => subscriptionsState.toggleSort("url")}
                        >
                          URL
                        </SortableTableHeader>
                        <th>Events</th>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            subscriptionsState,
                            "status",
                          )}
                          onToggle={() =>
                            subscriptionsState.toggleSort("status")
                          }
                        >
                          Status
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            subscriptionsState,
                            "delivery",
                          )}
                          onToggle={() =>
                            subscriptionsState.toggleSort("delivery")
                          }
                        >
                          Last delivery
                        </SortableTableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptionsView.visible.map((item) => (
                        <tr
                          key={item.subscriptionId}
                          data-testid="webhook-list-endpoint-row"
                        >
                          <td className="mono">{item.subscriptionId}</td>
                          <td className="mono ops-redacted">{item.url}</td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              {item.events.map((event) => (
                                <span
                                  key={`${item.subscriptionId}:${event}`}
                                  className="mono ops-text-muted"
                                >
                                  {event}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <StatusChip
                              status={item.status}
                              variant={resolveStatusVariant(item.status)}
                            />
                          </td>
                          <td className="mono">
                            {formatDate(item.lastDeliveryAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={subscriptionsState.page}
                pageSize={subscriptionsState.pageSize}
                total={subscriptionsView.total}
                onPageChange={subscriptionsState.setPage}
                onPageSizeChange={subscriptionsState.setPageSize}
              />
            </section>
          ) : null}

          {tab === "deliveries" ? (
            <section className="ops-card">
              <FilterBar
                searchValue={deliveriesState.search}
                onSearchChange={deliveriesState.setSearch}
                searchPlaceholder="Search deliveries, subscription, or event…"
              />
              {deliveriesView.visible.length === 0 ? (
                <EmptyState
                  title="No webhook deliveries"
                  description="No deliveries match the current filters."
                />
              ) : (
                <div
                  className="ops-table-wrapper"
                  data-testid="webhook-list-deliveries-table"
                >
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(deliveriesState, "id")}
                          onToggle={() => deliveriesState.toggleSort("id")}
                        >
                          Delivery
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            deliveriesState,
                            "sub",
                          )}
                          onToggle={() => deliveriesState.toggleSort("sub")}
                        >
                          Subscription
                        </SortableTableHeader>
                        <th>Event</th>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            deliveriesState,
                            "status",
                          )}
                          onToggle={() => deliveriesState.toggleSort("status")}
                        >
                          Status
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            deliveriesState,
                            "attempts",
                          )}
                          onToggle={() =>
                            deliveriesState.toggleSort("attempts")
                          }
                        >
                          Attempts
                        </SortableTableHeader>
                        <SortableTableHeader
                          ariaSort={resolveTableAriaSort(
                            deliveriesState,
                            "enqueued",
                          )}
                          onToggle={() =>
                            deliveriesState.toggleSort("enqueued")
                          }
                        >
                          Enqueued
                        </SortableTableHeader>
                        <th>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveriesView.visible.map((item) => {
                        const isFocused = item.id === data.selectedDeliveryId;

                        return (
                          <tr
                            key={item.id}
                            data-testid="webhook-list-delivery-row"
                            style={
                              isFocused
                                ? {
                                    boxShadow:
                                      "inset 0 0 0 1px rgba(161, 170, 255, 0.45)",
                                  }
                                : undefined
                            }
                          >
                            <td className="mono">{item.id}</td>
                            <td className="mono">{item.subscriptionId}</td>
                            <td>{item.eventType}</td>
                            <td>
                              <StatusChip
                                status={item.status}
                                variant={resolveStatusVariant(item.status)}
                              />
                            </td>
                            <td className="mono">{item.attemptCount}</td>
                            <td className="mono">
                              {formatDate(item.enqueuedAt)}
                            </td>
                            <td>
                              <Link
                                data-testid="webhook-list-delivery-link"
                                className="ops-btn ops-btn--xs"
                                to="/desk/delivery/$deliveryId"
                                params={{ deliveryId: item.id }}
                                search={{
                                  scope: selectedTarget.scope,
                                  scopeId: selectedTarget.scopeId,
                                }}
                              >
                                <ExternalIcon size={11} /> Detail
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={deliveriesState.page}
                pageSize={deliveriesState.pageSize}
                total={deliveriesView.total}
                onPageChange={deliveriesState.setPage}
                onPageSizeChange={deliveriesState.setPageSize}
              />
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function AttentionRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: "neutral" | "warn" | "alert";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: 6,
        borderRadius: 8,
        border:
          tone === "alert"
            ? "1px solid rgba(255, 122, 122, 0.35)"
            : tone === "warn"
              ? "1px solid rgba(255, 203, 107, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.08)",
        background:
          tone === "alert"
            ? "rgba(96, 24, 24, 0.24)"
            : tone === "warn"
              ? "rgba(98, 70, 18, 0.2)"
              : "rgba(255, 255, 255, 0.02)",
      }}
    >
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
