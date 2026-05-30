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
  notificationChannels,
  notificationDeliveryStatuses,
  notificationDeliveryStatus,
  type NotificationCenterAdminListFilters,
  type NotificationChannel,
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
import { resendAdminNotification } from "../../lib/notify-detail-mutations-server";

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

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type NotifyFilter = "all" | "attention" | "failed" | "queued" | "delivered";

const knownChannels = new Set<string>(notificationChannels);
const knownStatuses = new Set<string>(notificationDeliveryStatuses);

const decodeLoaderInput = (raw: RawSearch): AdminNotifyListInput => {
  const filters: NotificationCenterAdminListFilters = {};
  if (raw.channel !== undefined && knownChannels.has(raw.channel)) {
    Object.assign(filters, { channel: raw.channel as NotificationChannel });
  }
  if (raw.status !== undefined && knownStatuses.has(raw.status)) {
    Object.assign(filters, {
      status: raw.status as NotificationDeliveryStatus,
    });
  }
  if (raw.recipientHash !== undefined && raw.recipientHash.length > 0) {
    Object.assign(filters, { recipientHash: raw.recipientHash });
  }
  if (raw.since !== undefined && raw.since.length > 0) {
    Object.assign(filters, { since: raw.since });
  }
  if (raw.until !== undefined && raw.until.length > 0) {
    Object.assign(filters, { until: raw.until });
  }
  const parsedPageSize =
    raw.pageSize !== undefined ? Number.parseInt(raw.pageSize, 10) : NaN;
  const pageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, 500)
      : 50;
  const pageToken =
    raw.pageToken !== undefined && raw.pageToken.length > 0
      ? raw.pageToken
      : undefined;
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
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
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
  const filteredNotifications = result.notifications.filter((notification) =>
    resolveNotifyFilter(notification.status, filter),
  );
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
  const focusedNotification =
    result.notifications.find(
      (notification) =>
        notification.status === notificationDeliveryStatus.failed,
    ) ??
    result.notifications.find(
      (notification) =>
        notification.status === notificationDeliveryStatus.suppressed,
    ) ??
    result.notifications.find(
      (notification) =>
        notification.status === notificationDeliveryStatus.queued,
    ) ??
    result.notifications[0];
  const uniqueRecipients = new Set(
    result.notifications.map(
      (notification) => notification.recipientProjection,
    ),
  ).size;

  const handleResendConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (resendArmed === null) return;

    try {
      const result = await resendNotification({
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
        result.resendNotificationId === null
          ? `Resend accepted for ${result.notificationId}.`
          : `Resend accepted for ${result.notificationId}; follow-up delivery ${result.resendNotificationId} queued.`,
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
      data-pattern="notify-list-v3"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Notification Center"
        breadcrumbs={[{ label: "Resources" }, { label: "Notifications" }]}
        subtitle={
          <>
            {result.notifications.length} notifications · channel{" "}
            <span className="mono">{filters.channel ?? "all"}</span> · status{" "}
            <span className="mono">{filters.status ?? "all"}</span>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="notify-list-action-success"
          role="status"
          style={{
            padding: 6,
            color: "var(--status-success-fg)",
            background: "var(--status-success-bg)",
            border: "1px solid var(--status-success-border)",
            borderRadius: 4,
          }}
        >
          {actionSuccess}
        </div>
      ) : null}
      {actionError !== null ? (
        <div
          data-testid="notify-list-action-error"
          role="alert"
          style={{
            padding: 6,
            color: "var(--status-error-fg)",
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            borderRadius: 4,
          }}
        >
          {actionError}
        </div>
      ) : null}

      <div
        data-testid="notify-list-posture"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Delivered"
          value={(counts[notificationDeliveryStatus.delivered] ?? 0).toString()}
          tone="good"
        />
        <KpiCard
          label="Sent"
          value={(counts[notificationDeliveryStatus.sent] ?? 0).toString()}
          tone="accent"
        />
        <KpiCard
          label="Queued"
          value={(counts[notificationDeliveryStatus.queued] ?? 0).toString()}
          tone="neutral"
        />
        <KpiCard
          label="Failed"
          value={(counts[notificationDeliveryStatus.failed] ?? 0).toString()}
          tone={
            (counts[notificationDeliveryStatus.failed] ?? 0) > 0
              ? "alert"
              : "neutral"
          }
        />
        <KpiCard
          label="Suppressed"
          value={(
            counts[notificationDeliveryStatus.suppressed] ?? 0
          ).toString()}
          tone={
            (counts[notificationDeliveryStatus.suppressed] ?? 0) > 0
              ? "warn"
              : "neutral"
          }
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <section
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Queue attention</p>
          <div style={{ display: "grid", gap: 6 }}>
            <AttentionRow
              label="Queued"
              value={`${counts[notificationDeliveryStatus.queued] ?? 0}`}
              tone={
                (counts[notificationDeliveryStatus.queued] ?? 0) > 0
                  ? "warn"
                  : "neutral"
              }
            />
            <AttentionRow
              label="Failed"
              value={`${counts[notificationDeliveryStatus.failed] ?? 0}`}
              tone={
                (counts[notificationDeliveryStatus.failed] ?? 0) > 0
                  ? "alert"
                  : "neutral"
              }
            />
            <AttentionRow
              label="Suppressed"
              value={`${counts[notificationDeliveryStatus.suppressed] ?? 0}`}
              tone={
                (counts[notificationDeliveryStatus.suppressed] ?? 0) > 0
                  ? "warn"
                  : "neutral"
              }
            />
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Focused delivery</p>
          {focusedNotification === undefined ? (
            <p className="ops-text-muted" style={{ margin: 0 }}>
              No notification entries are currently available.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="mono">
                  {focusedNotification.notificationId}
                </span>
                <StatusChip
                  status={focusedNotification.status}
                  variant={resolveStatusVariant(focusedNotification.status)}
                />
              </div>
              <p style={{ margin: 0 }}>
                {focusedNotification.subjectProjection}
              </p>
              <div style={{ display: "grid", gap: 4 }}>
                <span className="ops-text-muted">
                  Recipient:{" "}
                  <span className="mono">
                    {focusedNotification.recipientProjection}
                  </span>
                </span>
                <span className="ops-text-muted">
                  Channel:{" "}
                  <span className="mono">{focusedNotification.channel}</span>
                </span>
                <span className="ops-text-muted">
                  Created:{" "}
                  <span className="mono">
                    {formatDate(focusedNotification.createdAt)}
                  </span>
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Link
                  className="ops-btn ops-btn--xs"
                  to="/desk/notify/$id"
                  params={{ id: focusedNotification.notificationId }}
                >
                  Detail
                </Link>
                {notificationCanResend(focusedNotification.status) ? (
                  <button
                    type="button"
                    className="ops-btn ops-btn--xs"
                    onClick={() =>
                      setResendArmed(focusedNotification.notificationId)
                    }
                  >
                    Resend
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>

        <section
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Recipient coverage</p>
          <span className="mono">{uniqueRecipients} distinct recipients</span>
          <span className="ops-text-muted">
            Partial failure buckets:{" "}
            <span className="mono">{partialFailures.length}</span>
          </span>
        </section>
      </div>

      <Tabs<NotifyFilter>
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "All", count: result.notifications.length },
          {
            value: "attention",
            label: "Attention",
            count:
              (counts[notificationDeliveryStatus.queued] ?? 0) +
              (counts[notificationDeliveryStatus.failed] ?? 0) +
              (counts[notificationDeliveryStatus.suppressed] ?? 0),
          },
          {
            value: "failed",
            label: "Failed",
            count: counts[notificationDeliveryStatus.failed] ?? 0,
          },
          {
            value: "queued",
            label: "Queued",
            count: counts[notificationDeliveryStatus.queued] ?? 0,
          },
          {
            value: "delivered",
            label: "Delivered",
            count: counts[notificationDeliveryStatus.delivered] ?? 0,
          },
        ]}
      />

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          border: "1px solid var(--bg-2)",
          borderRadius: 8,
        }}
      >
        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search notifications, recipients, or subjects…"
        />
        {tableView.visible.length === 0 ? (
          <EmptyState
            title="No notifications match"
            description="Adjust the current search or queue pivot to restore notification entries."
          />
        ) : (
          <table
            data-testid="notify-list-entries-table"
            data-pattern="dense-data-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
            }}
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
                <th style={{ textAlign: "left", padding: 4 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableView.visible.map((notification) => (
                <tr
                  key={notification.notificationId}
                  data-testid="notify-list-entry-row"
                  data-notification-id={notification.notificationId}
                  data-status={notification.status}
                  data-channel={notification.channel}
                >
                  <td style={{ padding: 4 }} className="mono">
                    {notification.notificationId}
                  </td>
                  <td style={{ padding: 4 }}>{notification.channel}</td>
                  <td style={{ padding: 4 }}>
                    <StatusChip
                      status={notification.status}
                      variant={resolveStatusVariant(notification.status)}
                    />
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {notification.recipientProjection}
                  </td>
                  <td style={{ padding: 4 }}>
                    {notification.subjectProjection}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {formatDate(notification.createdAt)}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {formatDate(notification.deliveredAt)}
                  </td>
                  <td style={{ padding: 4 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Link
                        to="/desk/notify/$id"
                        params={{ id: notification.notificationId }}
                        data-testid="notify-list-entry-link"
                      >
                        Detail
                      </Link>
                      {notificationCanResend(notification.status) ? (
                        <button
                          type="button"
                          data-testid="notify-list-resend-cta"
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
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={tableView.total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </section>

      {partialFailures.length > 0 ? (
        <section
          data-testid="notify-list-partial-failures"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 6,
            border: "1px solid var(--bg-2)",
            borderRadius: 4,
          }}
        >
          <h2 style={{ fontSize: "0.9375rem", padding: 4, margin: 0 }}>
            Partial failures
          </h2>
          <ul style={{ margin: 0, padding: 4 }}>
            {partialFailures.map((failure) => (
              <li
                key={failure.bucket}
                data-testid="notify-list-partial-failure-row"
                data-bucket={failure.bucket}
              >
                <span className="mono">{failure.bucket}</span>: {failure.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
