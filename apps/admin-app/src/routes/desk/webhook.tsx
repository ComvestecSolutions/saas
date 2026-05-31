import { Schema } from "effect";
import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (data.selectedDeliveryId !== undefined) {
      setTab("deliveries");
    }
  }, [data.selectedDeliveryId]);

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
      className="ops-screen ops-shell-grid"
      data-testid="webhook-list-ready"
      data-pattern="webhook-v3"
    >
      <aside className="ops-shell-grid__aside">
        <section className="ops-card" data-testid="webhook-list-target-form">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Choose tenant target</p>
          </div>
          <div className="ops-stack-md">
            <p className="ops-note">
              Load a named tenant so endpoint posture and delivery retry context
              stay anchored to the same operator workflow.
            </p>
            <AdminTenantTargetForm
              initialScope={selectedTarget?.scope}
              initialScopeId={selectedTarget?.scopeId}
              submitLabel="Load webhook view"
              submitVariant="secondary"
              onSubmit={(target) =>
                navigate({ search: buildAdminTenantTargetSearch(target) })
              }
            />
          </div>
        </section>

        <OpsPanel
          title={
            selectedTarget === undefined ? "Workflow guide" : "Focused tenant"
          }
          description={
            selectedTarget === undefined
              ? "This route owns the tenant-scoped endpoint and delivery workspace."
              : "Keep delivery posture and endpoint health pinned to the current tenant."
          }
          tone="neutral"
        >
          {selectedTarget === undefined ? (
            <ul className="ops-guidance-list">
              <li>Search and load the named tenant first.</li>
              <li>
                Review endpoint posture before diving into individual
                deliveries.
              </li>
              <li>
                Use the deliveries tab to pivot into retry and payload detail
                with the same tenant context intact.
              </li>
            </ul>
          ) : (
            <div className="ops-stack-md">
              <div className="ops-inline-cluster">
                <span className="ops-copy-row ops-copy-row--strong">
                  {targetDisplayName}
                </span>
                <StatusChip status={selectedTarget.scope} variant="neutral" />
              </div>
              <div className="ops-meta-grid">
                <div>
                  <p className="ops-meta-label">Scope id</p>
                  <p className="ops-meta-value ops-meta-value--mono">
                    {selectedTarget.scopeId}
                  </p>
                </div>
                <div>
                  <p className="ops-meta-label">Endpoints</p>
                  <p className="ops-meta-value">{data.subscriptions.length}</p>
                </div>
                <div>
                  <p className="ops-meta-label">Deliveries</p>
                  <p className="ops-meta-value">{data.deliveries.length}</p>
                </div>
              </div>
            </div>
          )}
        </OpsPanel>
      </aside>

      <div className="ops-shell-grid__main">
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

        {selectedTarget === undefined ? (
          <div className="ops-pane-grid">
            <OpsPanel
              title="Choose a tenant target"
              description="Load a named tenant from the left rail before you inspect endpoint health and delivery retries."
            >
              <EmptyState
                title="Choose a tenant target"
                description="Exact scope-id lookup should be the fallback, not the normal workflow."
              />
            </OpsPanel>
            <OpsPanel
              title="Why named targets"
              description="The webhook route is built to keep endpoint and delivery posture together."
            >
              <div className="ops-target-signal-list">
                <div className="ops-target-signal">
                  <div className="ops-target-signal-copy">
                    <p className="ops-target-signal-title">
                      Endpoint posture first
                    </p>
                    <p className="ops-target-signal-detail">
                      Start with active/inactive endpoint health before you
                      follow a single delivery.
                    </p>
                  </div>
                </div>
                <div className="ops-target-signal">
                  <div className="ops-target-signal-copy">
                    <p className="ops-target-signal-title">
                      Deep links stay scoped
                    </p>
                    <p className="ops-target-signal-detail">
                      Delivery detail routes inherit the current tenant so retry
                      and payload review never lose operator context.
                    </p>
                  </div>
                </div>
              </div>
            </OpsPanel>
          </div>
        ) : (
          <>
            <div className="ops-bento" data-testid="webhook-list-posture">
              <KpiCard
                label="Active endpoints"
                value={(
                  data.subscriptions.length - inactiveEndpoints
                ).toString()}
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

            <div className="ops-pane-grid">
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
                <div className="ops-stack-sm">
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
                <OpsPanel
                  title="Focused delivery"
                  data-testid="webhook-list-focus"
                >
                  <p className="ops-note">
                    Open a delivery detail from the roster to keep retry
                    posture, signature timing, and payload context in reach.
                  </p>
                </OpsPanel>
              ) : (
                <OpsPanel
                  title="Focused delivery"
                  data-testid="webhook-list-focus"
                  tone={
                    resolveStatusVariant(selectedDelivery.status) === "error"
                      ? "alert"
                      : resolveStatusVariant(selectedDelivery.status) ===
                          "pending"
                        ? "warn"
                        : "neutral"
                  }
                >
                  <div className="ops-stack-md">
                    <div className="ops-inline-cluster">
                      <span className="mono">{selectedDelivery.id}</span>
                      <StatusChip
                        status={selectedDelivery.status}
                        variant={resolveStatusVariant(selectedDelivery.status)}
                      />
                    </div>
                    <p className="ops-note">
                      {selectedDelivery.eventType} ·{" "}
                      <span className="mono">
                        {selectedDelivery.subscriptionId}
                      </span>
                    </p>
                    <div className="ops-meta-grid">
                      <div>
                        <p className="ops-meta-label">Request</p>
                        <p className="ops-meta-value ops-meta-value--mono ops-redacted">
                          {selectedDelivery.requestMethod}{" "}
                          {selectedDelivery.requestUrl}
                        </p>
                      </div>
                      <div>
                        <p className="ops-meta-label">Enqueued</p>
                        <p className="ops-meta-value ops-meta-value--mono">
                          {formatDate(selectedDelivery.enqueuedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="ops-meta-label">Attempts</p>
                        <p className="ops-meta-value">
                          {selectedDelivery.attemptCount}
                        </p>
                      </div>
                    </div>
                    <div className="ops-inline-actions">
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
                            onToggle={() =>
                              subscriptionsState.toggleSort("sub")
                            }
                          >
                            Subscription
                          </SortableTableHeader>
                          <SortableTableHeader
                            ariaSort={resolveTableAriaSort(
                              subscriptionsState,
                              "url",
                            )}
                            onToggle={() =>
                              subscriptionsState.toggleSort("url")
                            }
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
                            ariaSort={resolveTableAriaSort(
                              deliveriesState,
                              "id",
                            )}
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
                            onToggle={() =>
                              deliveriesState.toggleSort("status")
                            }
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
      </div>
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
      className="ops-attention-row"
      data-tone={tone === "neutral" ? undefined : tone}
    >
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
