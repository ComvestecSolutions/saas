import { useState } from "react";
import { Schema } from "effect";
import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  EmptyState,
  HighRiskActionGuard,
  StateScreen,
  StatusChip,
  resolveStatusVariant,
  type HighRiskReason,
} from "@comvestec/ui";
import {
  NotificationChannelSchema,
  NotificationDeliveryStatusSchema,
  notificationDeliveryStatus,
  type NotificationCenterAdminListFilters,
  type NotificationDeliveryStatus,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  Tabs,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import type {
  AdminNotifyListInput,
  AdminNotifyListRouteData,
} from "../../lib/notify-list-route-data";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../lib/effect-boundary";
import { resendAdminNotification } from "../../lib/notify-detail-mutations-server";
import { formatAdminNumber } from "../../lib/number-format";

/**
 * `/desk/notify` — canonical notification-center workspace.
 *
 * The route keeps the `notify-list-{loader,route-data,route-server}`
 * contract intact and upgrades the shell into an operator queue
 * with search, attention pivots, focused delivery context, resend
 * guardrails, and detail-route handoff.
 */

const resendReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "notification-center.resend.delivery-stalled",
    label: "Delivery stalled — resend notification",
  },
  {
    id: "notification-center.resend.provider-outage-recovery",
    label: "Provider outage recovery — resend notification",
  },
  {
    id: "notification-center.resend.support-escalation",
    label: "Support escalation — resend notification",
  },
];

const RawSearchSchema = Schema.Struct({
  channel: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  recipientHash: Schema.optional(Schema.String),
  since: Schema.optional(Schema.String),
  until: Schema.optional(Schema.String),
  pageSize: Schema.optional(Schema.String),
  pageToken: Schema.optional(Schema.String),
});
const RawSearchBoundarySchema = Schema.Struct({
  channel: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Unknown),
  recipientHash: Schema.optional(Schema.Unknown),
  since: Schema.optional(Schema.Unknown),
  until: Schema.optional(Schema.Unknown),
  pageSize: Schema.optional(Schema.Unknown),
  pageToken: Schema.optional(Schema.Unknown),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type NotifyFilter = "all" | "attention" | "failed" | "queued" | "delivered";
const decodeRawSearchBoundary = decodeSyncBoundary(RawSearchBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const PositiveSearchNumberSchema = Schema.Union(
  Schema.Int.pipe(Schema.positive()),
  Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
);
const decodeChannel = decodeSchemaOrUndefined(NotificationChannelSchema);
const decodeStatus = decodeSchemaOrUndefined(NotificationDeliveryStatusSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);
const decodePageSize = decodeSchemaOrUndefined(PositiveSearchNumberSchema);

const validateSearch = (raw: unknown): RawSearch => {
  const search = decodeRawSearchBoundary(raw);
  const channel = decodeSearchString(search.channel);
  const status = decodeSearchString(search.status);
  const recipientHash = decodeSearchString(search.recipientHash);
  const since = decodeSearchString(search.since);
  const until = decodeSearchString(search.until);
  const pageSize = decodeSearchString(search.pageSize);
  const pageToken = decodeSearchString(search.pageToken);

  return {
    ...(channel === undefined ? {} : { channel }),
    ...(status === undefined ? {} : { status }),
    ...(recipientHash === undefined ? {} : { recipientHash }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const decodeLoaderInput = (raw: RawSearch): AdminNotifyListInput => {
  const filters: NotificationCenterAdminListFilters = {};
  const channel = decodeChannel(raw.channel);
  if (channel !== undefined) {
    Object.assign(filters, { channel });
  }
  const status = decodeStatus(raw.status);
  if (status !== undefined) {
    Object.assign(filters, { status });
  }
  const recipientHash = decodeNonEmptyString(raw.recipientHash);
  if (recipientHash !== undefined) {
    Object.assign(filters, { recipientHash });
  }
  const since = decodeNonEmptyString(raw.since);
  if (since !== undefined) {
    Object.assign(filters, { since });
  }
  const until = decodeNonEmptyString(raw.until);
  if (until !== undefined) {
    Object.assign(filters, { until });
  }
  const pageSize = Math.min(decodePageSize(raw.pageSize) ?? 50, 500);
  const pageToken = decodeNonEmptyString(raw.pageToken);
  return {
    filters,
    pageSize,
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const formatDate = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 16).replace("T", " ");

const resolveNotifyFilter = (
  status: NotificationDeliveryStatus,
  filter: NotifyFilter,
): boolean => {
  switch (filter) {
    case "attention":
      return (
        status === notificationDeliveryStatus.failed ||
        status === notificationDeliveryStatus.suppressed ||
        status === notificationDeliveryStatus.queued
      );
    case "failed":
      return status === notificationDeliveryStatus.failed;
    case "queued":
      return status === notificationDeliveryStatus.queued;
    case "delivered":
      return status === notificationDeliveryStatus.delivered;
    default:
      return true;
  }
};

const notificationCanResend = (status: NotificationDeliveryStatus): boolean =>
  status === notificationDeliveryStatus.failed ||
  status === notificationDeliveryStatus.suppressed;

export const Route = createAdminAppFileRoute("/desk/notify")({
  validateSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/notify-list-loader").then(
      ({ loadAdminNotifyListLoaderData }) =>
        loadAdminNotifyListLoaderData(decodeLoaderInput(deps.search)),
    ),
  component: NotifyListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading notification center…" />
  ),
});

function NotifyListRoute() {
  const data: AdminNotifyListRouteData = Route.useLoaderData();
  const router = useRouter();
  const resendNotification = useServerFn(resendAdminNotification);
  const [filter, setFilter] = useState<NotifyFilter>("all");
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | undefined
  >();
  const [resendArmed, setResendArmed] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const tableState = useTableState<
    | "notification"
    | "channel"
    | "status"
    | "recipient"
    | "subject"
    | "created"
    | "delivered"
  >({
    initialPageSize: 25,
    initialSortKey: "created",
    initialSortDir: "desc",
  });

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view the notification center."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access the notification center."
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

  const { result, filters } = data;
  const counts = result.notifications.reduce(
    (acc, notification) => {
      acc[notification.status] = (acc[notification.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<NotificationDeliveryStatus, number>,
  );
  const partialFailures = result.partialFailures ?? [];
  const deliveredCount = counts[notificationDeliveryStatus.delivered] ?? 0;
  const sentCount = counts[notificationDeliveryStatus.sent] ?? 0;
  const queuedCount = counts[notificationDeliveryStatus.queued] ?? 0;
  const failedCount = counts[notificationDeliveryStatus.failed] ?? 0;
  const suppressedCount = counts[notificationDeliveryStatus.suppressed] ?? 0;
  const attentionCount = queuedCount + failedCount + suppressedCount;
  const filteredNotifications = result.notifications.filter((notification) =>
    resolveNotifyFilter(notification.status, filter),
  );
  const hasServerFilters =
    filters.channel !== undefined ||
    filters.status !== undefined ||
    filters.recipientHash !== undefined ||
    filters.since !== undefined ||
    filters.until !== undefined;
  const hasClientFilters =
    filter !== "all" || tableState.search.trim().length > 0;
  const tableView = applyTableState(filteredNotifications, tableState, {
    searchOn: (notification) =>
      [
        notification.notificationId,
        notification.channel,
        notification.status,
        notification.recipientProjection,
        notification.subjectProjection,
      ].join(" "),
    sortOn: {
      notification: (notification) => notification.notificationId,
      channel: (notification) => notification.channel,
      status: (notification) => notification.status,
      recipient: (notification) => notification.recipientProjection,
      subject: (notification) => notification.subjectProjection,
      created: (notification) => notification.createdAt,
      delivered: (notification) => notification.deliveredAt ?? "",
    },
  });
  const rosterNotifications = tableView.visible;
  const focusedNotification =
    rosterNotifications.find(
      (notification) => notification.notificationId === selectedNotificationId,
    ) ??
    rosterNotifications.find(
      (notification) =>
        notification.status === notificationDeliveryStatus.failed,
    ) ??
    rosterNotifications.find(
      (notification) =>
        notification.status === notificationDeliveryStatus.suppressed,
    ) ??
    rosterNotifications.find(
      (notification) =>
        notification.status === notificationDeliveryStatus.queued,
    ) ??
    rosterNotifications[0];
  const focusedNotificationPinned =
    selectedNotificationId !== undefined &&
    focusedNotification?.notificationId === selectedNotificationId;
  const uniqueRecipients = new Set(
    result.notifications.map(
      (notification) => notification.recipientProjection,
    ),
  ).size;
  const resendEligibleCount = result.notifications.filter((notification) =>
    notificationCanResend(notification.status),
  ).length;
  const partialFailureBadgeClassName =
    partialFailures.length > 0
      ? "ops-signal-badge ops-signal-badge--warn"
      : "ops-signal-badge ops-signal-badge--good";
  const rosterCountLabel =
    tableView.total === result.notifications.length
      ? `${formatAdminNumber(result.notifications.length)} loaded`
      : `${formatAdminNumber(tableView.total)} matching / ${formatAdminNumber(result.notifications.length)} loaded`;
  const clearRosterFocus = () => {
    setFilter("all");
    tableState.setSearch("");
    tableState.setPage(1);
    setSelectedNotificationId(undefined);
  };

  const handleResendConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (resendArmed === null) return;

    try {
      const resendResult = await resendNotification({
        data: {
          notificationId: resendArmed,
          reason: input.reasonId,
          ...(input.note.trim().length === 0
            ? {}
            : { reasonAttachmentText: input.note.trim() }),
        },
      });
      setResendArmed(null);
      setActionError(null);
      setActionSuccess(
        resendResult.resendNotificationId === null
          ? `Resend accepted for ${resendResult.notificationId}.`
          : `Resend accepted for ${resendResult.notificationId}; follow-up delivery ${resendResult.resendNotificationId} queued.`,
      );
      await router.invalidate();
    } catch (error) {
      setResendArmed(null);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to resend the notification. Retry shortly.",
      );
    }
  };

  return (
    <section
      data-testid="notify-list-ready"
      data-pattern="notify-list-v4"
      className="ops-screen ops-screen--tight ops-stack-md"
    >
      <ScreenHeader
        title="Notification Center"
        breadcrumbs={[{ label: "Resources" }, { label: "Notifications" }]}
        subtitle={
          <>
            {formatAdminNumber(result.notifications.length)} notifications ·
            channel <span className="mono">{filters.channel ?? "all"}</span> ·
            status <span className="mono">{filters.status ?? "all"}</span>
          </>
        }
        actions={
          <>
            <Link className="ops-btn ops-btn--ghost" to="/desk/runs">
              Workflow runs
            </Link>
            <Link className="ops-btn ops-btn--ghost" to="/desk/vendors">
              Vendor health
            </Link>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          className="ops-card-shell ops-card-shell--dense"
          data-testid="notify-list-action-success"
          role="status"
        >
          <div className="ops-inline-cluster">
            <span className="ops-signal-badge ops-signal-badge--good">
              Resend accepted
            </span>
          </div>
          <p className="ops-note">{actionSuccess}</p>
        </div>
      ) : null}
      {actionError !== null ? (
        <div
          className="ops-card-shell ops-card-shell--dense"
          data-testid="notify-list-action-error"
          role="alert"
        >
          <div className="ops-inline-cluster">
            <span className="ops-signal-badge ops-signal-badge--alert">
              Resend failed
            </span>
          </div>
          <p className="ops-note">{actionError}</p>
        </div>
      ) : null}

      <div className="ops-stack-sm">
        <div className="ops-inline-cluster">
          <span className="ops-signal-badge ops-signal-badge--accent">
            {focusedNotification === undefined
              ? "Roster overview"
              : focusedNotificationPinned
                ? "Pinned delivery"
                : "Focused delivery"}
          </span>
          <span className={partialFailureBadgeClassName}>
            {partialFailures.length === 0
              ? "No partial failures"
              : `${partialFailures.length} partial failure bucket${partialFailures.length === 1 ? "" : "s"}`}
          </span>
          {hasServerFilters ? (
            <span className="ops-signal-badge ops-signal-badge--accent">
              Server scope applied
            </span>
          ) : null}
          {hasClientFilters ? (
            <span className="ops-signal-badge ops-signal-badge--accent">
              Client filters active
            </span>
          ) : null}
          {attentionCount > 0 ? (
            <span className="ops-signal-badge ops-signal-badge--warn">
              Attention required
            </span>
          ) : null}
        </div>
        <div className="ops-pane-grid" data-testid="notify-list-posture">
          <KpiCard
            label="Delivered"
            value={formatAdminNumber(deliveredCount)}
            tone="good"
          />
          <KpiCard
            label="Sent"
            value={formatAdminNumber(sentCount)}
            tone="accent"
          />
          <KpiCard
            label="Attention"
            value={formatAdminNumber(attentionCount)}
            tone={attentionCount > 0 ? "warn" : "neutral"}
          />
          <KpiCard
            label="Failed"
            value={formatAdminNumber(failedCount)}
            tone={failedCount > 0 ? "alert" : "neutral"}
          />
          <KpiCard
            label="Suppressed"
            value={formatAdminNumber(suppressedCount)}
            tone={suppressedCount > 0 ? "warn" : "neutral"}
          />
          <KpiCard
            label="Recipients"
            value={formatAdminNumber(uniqueRecipients)}
            tone="neutral"
          />
        </div>
      </div>

      <div className="ops-pane-grid" data-testid="notify-list-focus-grid">
        <section className="ops-card" data-testid="notify-list-focus">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Focused delivery</p>
            <span className="ops-card-head__count">
              {focusedNotification === undefined
                ? "No visible notifications"
                : focusedNotification.channel}
            </span>
          </div>
          {focusedNotification === undefined ? (
            <div className="ops-stack-sm" data-testid="notify-list-focus-empty">
              <p className="ops-note">
                {result.notifications.length === 0
                  ? "No notification entries are currently available."
                  : "The current queue pivot removed every visible notification. Reset the roster or clear the current search to bring a delivery back into focus."}
              </p>
              <div className="ops-inline-cluster">
                <button
                  type="button"
                  className="ops-btn ops-btn--ghost ops-btn--xs"
                  onClick={clearRosterFocus}
                >
                  Reset roster
                </button>
                {hasServerFilters ? (
                  <Link
                    className="ops-btn ops-btn--ghost ops-btn--xs"
                    to="/desk/notify"
                  >
                    Reset server scope
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              className="ops-stack-sm"
              data-testid="notify-list-focus-summary"
            >
              <div className="ops-inline-cluster">
                <StatusChip
                  status={focusedNotification.status}
                  variant={resolveStatusVariant(focusedNotification.status)}
                />
                <span className="ops-signal-badge ops-signal-badge--accent">
                  {focusedNotification.channel}
                </span>
                {focusedNotificationPinned ? (
                  <span className="ops-signal-badge ops-signal-badge--good">
                    Pinned
                  </span>
                ) : null}
                {notificationCanResend(focusedNotification.status) ? (
                  <span className="ops-signal-badge ops-signal-badge--warn">
                    Resend eligible
                  </span>
                ) : null}
              </div>
              <div className="ops-cell-stack">
                <span className="ops-cell-stack__title mono">
                  {focusedNotification.notificationId}
                </span>
                <span className="ops-text-muted">
                  {focusedNotification.subjectProjection}
                </span>
              </div>
              <p className="ops-note">
                {resolveFocusedNotificationNarrative(
                  focusedNotification,
                  focusedNotificationPinned,
                )}
              </p>
              <div className="ops-detail-grid">
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Recipient</span>
                  <span className="mono">
                    {focusedNotification.recipientProjection}
                  </span>
                </div>
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Created</span>
                  <span className="mono">
                    {formatDate(focusedNotification.createdAt)}
                  </span>
                </div>
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Delivered</span>
                  <span className="mono">
                    {formatDate(focusedNotification.deliveredAt)}
                  </span>
                </div>
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Status</span>
                  <span className="mono">{focusedNotification.status}</span>
                </div>
              </div>
              <div className="ops-inline-cluster">
                <Link
                  className="ops-btn ops-btn--primary ops-btn--xs"
                  to="/desk/notify/$id"
                  params={{ id: focusedNotification.notificationId }}
                >
                  Open detail
                </Link>
                {notificationCanResend(focusedNotification.status) ? (
                  <button
                    type="button"
                    className="ops-btn ops-btn--ghost ops-btn--xs"
                    data-testid="notify-list-focus-resend-cta"
                    onClick={() =>
                      setResendArmed(focusedNotification.notificationId)
                    }
                  >
                    Resend
                  </button>
                ) : null}
                {focusedNotificationPinned ? (
                  <button
                    type="button"
                    className="ops-btn ops-btn--ghost ops-btn--xs"
                    onClick={() => setSelectedNotificationId(undefined)}
                  >
                    Clear focus
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <section className="ops-card" data-testid="notify-list-review">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Queue review</p>
            <span className="ops-card-head__count">{rosterCountLabel}</span>
          </div>
          <div className="ops-stack-sm">
            <div className="ops-detail-grid">
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">Attention queue</span>
                <span className="mono">
                  {formatAdminNumber(attentionCount)}
                </span>
              </div>
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">Resend eligible</span>
                <span className="mono">
                  {formatAdminNumber(resendEligibleCount)}
                </span>
              </div>
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">
                  Distinct recipients
                </span>
                <span className="mono">
                  {formatAdminNumber(uniqueRecipients)}
                </span>
              </div>
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">Partial failures</span>
                <span className="mono">
                  {formatAdminNumber(partialFailures.length)}
                </span>
              </div>
            </div>
            <div
              className="ops-stack-sm"
              data-testid="notify-list-partial-failures"
            >
              <div className="ops-inline-cluster">
                <span className={partialFailureBadgeClassName}>
                  {partialFailures.length === 0
                    ? "Notification reads healthy"
                    : "Partial failures require follow-up"}
                </span>
              </div>
              {partialFailures.length === 0 ? (
                <p
                  className="ops-note"
                  data-testid="notify-list-partial-failures-empty"
                >
                  Notification queue, recipient projections, and provider
                  metadata are currently loading without partial failures for
                  this roster.
                </p>
              ) : (
                <div
                  className="ops-link-grid"
                  data-testid="notify-list-review-items"
                >
                  {partialFailures.map((failure) => (
                    <article
                      key={failure.bucket}
                      className="ops-card-shell ops-card-shell--dense"
                      data-testid="notify-list-partial-failure-row"
                      data-bucket={failure.bucket}
                    >
                      <div className="ops-inline-cluster">
                        <span className="ops-signal-badge ops-signal-badge--warn">
                          Partial failure
                        </span>
                        <span className="mono">{failure.bucket}</span>
                      </div>
                      <p className="ops-note">{failure.reason}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="ops-card" data-testid="notify-list-roster">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Notification roster</p>
          <span className="ops-card-head__count">
            {formatAdminNumber(tableView.total)} visible
          </span>
        </div>
        <div className="ops-stack-sm ops-card-shell ops-card-shell--dense">
          <Tabs<NotifyFilter>
            value={filter}
            onChange={setFilter}
            items={[
              {
                value: "all",
                label: "All",
                count: result.notifications.length,
              },
              {
                value: "attention",
                label: "Attention",
                count: attentionCount,
              },
              {
                value: "failed",
                label: "Failed",
                count: failedCount,
              },
              {
                value: "queued",
                label: "Queued",
                count: queuedCount,
              },
              {
                value: "delivered",
                label: "Delivered",
                count: deliveredCount,
              },
            ]}
          />
          <FilterBar
            searchValue={tableState.search}
            onSearchChange={tableState.setSearch}
            searchPlaceholder="Search notifications, recipients, or subjects…"
          />
        </div>
        {rosterNotifications.length === 0 ? (
          <div className="ops-card-shell">
            <EmptyState
              title="No notifications match"
              description="Adjust the current search or queue pivot to restore notification entries."
            />
          </div>
        ) : (
          <div className="ops-table-wrapper">
            <table
              className="ops-table"
              data-testid="notify-list-entries-table"
              aria-label="Notification roster"
            >
              <thead>
                <tr>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "notification")}
                    onToggle={() => tableState.toggleSort("notification")}
                  >
                    Notification
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "channel")}
                    onToggle={() => tableState.toggleSort("channel")}
                  >
                    Channel
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "status")}
                    onToggle={() => tableState.toggleSort("status")}
                  >
                    Status
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "recipient")}
                    onToggle={() => tableState.toggleSort("recipient")}
                  >
                    Recipient
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "subject")}
                    onToggle={() => tableState.toggleSort("subject")}
                  >
                    Subject
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "created")}
                    onToggle={() => tableState.toggleSort("created")}
                  >
                    Created
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "delivered")}
                    onToggle={() => tableState.toggleSort("delivered")}
                  >
                    Delivered
                  </SortableTableHeader>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rosterNotifications.map((notification) => {
                  const isSelected =
                    focusedNotification?.notificationId ===
                    notification.notificationId;

                  return (
                    <tr
                      key={notification.notificationId}
                      className={isSelected ? "is-selected" : undefined}
                      data-testid="notify-list-entry-row"
                      data-notification-id={notification.notificationId}
                      data-status={notification.status}
                      data-channel={notification.channel}
                    >
                      <td className="mono">{notification.notificationId}</td>
                      <td>
                        <span className="ops-signal-badge ops-signal-badge--accent">
                          {notification.channel}
                        </span>
                      </td>
                      <td>
                        <StatusChip
                          status={notification.status}
                          variant={resolveStatusVariant(notification.status)}
                        />
                      </td>
                      <td className="mono">
                        {notification.recipientProjection}
                      </td>
                      <td>{notification.subjectProjection}</td>
                      <td className="mono">
                        {formatDate(notification.createdAt)}
                      </td>
                      <td className="mono">
                        {formatDate(notification.deliveredAt)}
                      </td>
                      <td>
                        <div className="ops-inline-cluster">
                          <button
                            type="button"
                            className={
                              isSelected
                                ? "ops-btn ops-btn--primary ops-btn--xs"
                                : "ops-btn ops-btn--ghost ops-btn--xs"
                            }
                            data-testid="notify-list-entry-focus"
                            onClick={() =>
                              setSelectedNotificationId(
                                notification.notificationId,
                              )
                            }
                          >
                            {isSelected ? "Focused" : "Focus"}
                          </button>
                          <Link
                            className="ops-btn ops-btn--ghost ops-btn--xs"
                            to="/desk/notify/$id"
                            params={{ id: notification.notificationId }}
                            data-testid="notify-list-entry-link"
                          >
                            Detail
                          </Link>
                          {notificationCanResend(notification.status) ? (
                            <button
                              type="button"
                              className="ops-btn ops-btn--ghost ops-btn--xs"
                              data-testid="notify-list-row-resend-cta"
                              data-notification-id={notification.notificationId}
                              onClick={() =>
                                setResendArmed(notification.notificationId)
                              }
                            >
                              Resend
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="ops-card-shell ops-card-shell--dense">
          <Pagination
            page={tableState.page}
            pageSize={tableState.pageSize}
            total={tableView.total}
            onPageChange={tableState.setPage}
            onPageSizeChange={tableState.setPageSize}
          />
        </div>
      </section>

      {resendArmed !== null ? (
        <HighRiskActionGuard
          action={{
            id: "notification-center-resend",
            label: "Resend notification",
          }}
          selection={[resendArmed]}
          reasons={resendReasonCatalog}
          requireNote
          confirmLabel="Resend"
          onConfirm={handleResendConfirm}
          onCancel={() => setResendArmed(null)}
        />
      ) : null}
      <Outlet />
    </section>
  );
}

function resolveFocusedNotificationNarrative(
  notification: Extract<
    AdminNotifyListRouteData,
    { readonly kind: "ready" }
  >["result"]["notifications"][number],
  pinned: boolean,
): string {
  if (pinned) {
    return "Pinned from the visible roster so resend and drill-through stay stable while queue pivots, search, and paging change around it.";
  }

  switch (notification.status) {
    case notificationDeliveryStatus.failed:
      return "Automatically escalated because the visible roster includes a failed notification delivery that likely needs operator follow-up.";
    case notificationDeliveryStatus.suppressed:
      return "Automatically escalated because the visible roster includes a suppressed delivery that may need policy or provider review.";
    case notificationDeliveryStatus.queued:
      return "Automatically escalated because the visible roster still includes queued delivery work awaiting provider completion.";
    default:
      return "Anchoring the visible roster with the first available delivery so queue context and drill-through stay in view.";
  }
}
