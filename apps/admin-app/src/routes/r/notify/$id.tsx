import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  HighRiskActionGuard,
  StateScreen,
  type HighRiskReason,
} from "@comvestec/ui";
import { notificationDeliveryStatus } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import type { AdminNotifyDetailRouteData } from "../../../lib/notify-detail-route-data";
import { resendAdminNotification } from "../../../lib/notify-detail-mutations-server";

/**
 * `/r/notify/$id` — spec-canonical Notification Center v2 detail
 * surface shipped by Phase 6 vendor + workflow operator screens
 * commit 6c (admin-app implementation plan §8.16 + §11).
 * Consumes the `notify-detail-{loader,route-data,route-server}`
 * trio gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId` and the
 * `notification-center-admin` platform service.
 *
 * Layout follows the spec §11 "spine first, body second"
 * convention shipped on `/r/run/$id`, `/r/incident/$incidentId`,
 * `/r/legal-hold/$holdId`, `/r/delivery/$deliveryId`, and
 * `/r/api-key/$keyId`. Mounts as a child of the `/r/notify`
 * list layout so the list spine stays visible above the detail
 * pane (mirrors the `/r/flag` + `/r/flag/$flagKey` pattern).
 *
 * The resend mutation body (binding the
 * `resendNotificationFromEnvironment` helper through a
 * mutations-server entrypoint) is tracked under the Admin app
 * row's Phase 6 follow-ups in the implementation tracker — the
 * guard captures the operator's reason + note today.
 *
 * `payloadProjection` and `providerMetadata` carry the
 * platform-side `regulated-sensitive` classification; the route
 * renders the server-supplied projection verbatim and does NOT
 * re-derive sensitive fields client-side.
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

export const Route = createAdminAppFileRoute("/r/notify/$id")({
  loader: async ({ params }) => {
    const { loadAdminNotifyDetailLoaderData } =
      await import("../../../lib/notify-detail-loader");
    return loadAdminNotifyDetailLoaderData({ notificationId: params.id });
  },
  component: NotifyDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading notification…" />
  ),
});

function NotifyDetailRoute() {
  const data: AdminNotifyDetailRouteData = Route.useLoaderData();
  const router = useRouter();
  const resendNotification = useServerFn(resendAdminNotification);
  const [resendArmed, setResendArmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view notification detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access notification detail."
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

  const { notification } = data;
  const resendable =
    notification.status === notificationDeliveryStatus.failed ||
    notification.status === notificationDeliveryStatus.suppressed;

  const handleResendConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    try {
      const result = await resendNotification({
        data: {
          notificationId: notification.notificationId,
          reason: input.reasonId,
          ...(input.note.trim().length === 0
            ? {}
            : { reasonAttachmentText: input.note.trim() }),
        },
      });
      setResendArmed(false);
      setActionError(null);
      setActionSuccess(
        result.resendNotificationId === null
          ? `Resend accepted for ${result.notificationId}.`
          : `Resend accepted for ${result.notificationId}; follow-up delivery ${result.resendNotificationId} queued.`,
      );
      await router.invalidate();
    } catch (error) {
      setResendArmed(false);
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
      data-testid="notify-detail-ready"
      data-pattern="notify-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={notification.subjectProjection}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Notifications", href: "/r/notify" },
          { label: notification.notificationId },
        ]}
        subtitle={
          <>
            Channel{" "}
            <span
              className="mono"
              data-testid="notify-detail-channel-chip"
              data-channel={notification.channel}
            >
              {notification.channel}
            </span>{" "}
            · Status{" "}
            <span
              className="mono"
              data-testid="notify-detail-status-chip"
              data-status={notification.status}
            >
              {notification.status}
            </span>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="notify-detail-action-success"
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
          data-testid="notify-detail-action-error"
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

      <section
        data-testid="notify-detail-summary"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 6,
          border: "1px solid var(--bg-2)",
          borderRadius: 4,
        }}
      >
        <div>
          <strong>Notification id:</strong>{" "}
          <span className="mono" data-testid="notify-detail-notification-id">
            {notification.notificationId}
          </span>
        </div>
        <div>
          <strong>Recipient:</strong>{" "}
          <span className="mono">{notification.recipientProjection}</span>
        </div>
        <div>
          <strong>Subject:</strong>{" "}
          <span className="mono">{notification.subjectProjection}</span>
        </div>
        <div>
          <strong>Created at:</strong>{" "}
          <span className="mono">{notification.createdAt}</span>
        </div>
        <div>
          <strong>Delivered at:</strong>{" "}
          <span className="mono">{notification.deliveredAt ?? "—"}</span>
        </div>
        {notification.lastError !== undefined ? (
          <div data-testid="notify-detail-last-error">
            <strong>Last error:</strong>{" "}
            <span className="mono">{notification.lastError}</span>
          </div>
        ) : null}
      </section>

      <section
        data-testid="notify-detail-payload"
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
          Payload &amp; provider
        </h2>
        <div>
          <strong>Audit correlation id:</strong>{" "}
          <span className="mono" data-testid="notify-detail-audit-correlation">
            {notification.auditCorrelationId}
          </span>
        </div>
        <pre
          data-testid="notify-detail-payload-projection"
          style={{
            margin: 0,
            padding: 4,
            fontSize: "0.6875rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {notification.payloadProjection}
        </pre>
        <h3 style={{ fontSize: "0.8125rem", padding: 4, margin: 0 }}>
          Provider metadata
        </h3>
        <pre
          data-testid="notify-detail-provider-metadata"
          style={{
            margin: 0,
            padding: 4,
            fontSize: "0.6875rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {notification.providerMetadata}
        </pre>
      </section>

      {resendable ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            data-testid="notify-detail-resend-cta"
            onClick={() => {
              setActionError(null);
              setActionSuccess(null);
              setResendArmed(true);
            }}
          >
            Resend
          </button>
        </div>
      ) : null}

      {resendArmed ? (
        <HighRiskActionGuard
          action={{
            id: "notify-resend",
            label: "Resend notification",
          }}
          selection={[notification.notificationId]}
          reasons={resendReasonCatalog}
          requireNote
          confirmLabel="Resend"
          onConfirm={handleResendConfirm}
          onCancel={() => setResendArmed(false)}
        />
      ) : null}
    </section>
  );
}
