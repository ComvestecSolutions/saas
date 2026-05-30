import { useState } from "react";
import { Schema } from "effect";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  HighRiskActionGuard,
  StateScreen,
  type HighRiskReason,
} from "@comvestec/ui";
import {
  operatorWebhookDeliveryStatus,
  PlatformScopeSchema,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../../lib/effect-boundary";
import { retryAdminWebhookDelivery } from "../../../lib/delivery-detail-mutations-server";
import type { AdminDeliveryDetailRouteData } from "../../../lib/delivery-detail-route-data";

/**
 * `/desk/delivery/$deliveryId` — spec-canonical Webhook Delivery
 * Detail v2 surface shipped by Phase 5 Support / compliance /
 * integrations operator screens commit 3 (admin-app
 * implementation plan §8.12 + §11 + §8.13). Consumes the
 * `delivery-detail-{loader,route-data,route-server}` trio gated
 * end-to-end through `resolveTrustedRequestContextFromSessionId`
 * and the operator-webhook-delivery `RequestContext`-keyed
 * platform service.
 *
 * Layout follows the spec §11 "spine first, body second"
 * convention shipped on `/desk/incident/$incidentId` and
 * `/desk/legal-hold/$holdId`:
 *   - Summary panel (status, subscription, event-type,
 *     attempts, enqueued/last-attempt timestamps).
 *   - Request payload panel (URL/method/body).
 *   - Response payload panel (last status, last error, last
 *     response snippet).
 *   - Retry-delivery CTA gated through `HighRiskActionGuard`.
 *
 * The retry-delivery CTA now executes through the
 * `retryAdminWebhookDelivery` mutations-server entrypoint, which
 * binds the trusted-session request context to
 * `retryOperatorWebhookDeliveryFromEnvironment`. The current
 * backend contract accepts the catalog reason id but not the
 * guard note.
 */
const retryReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "operator-webhook-delivery.retry.transient-upstream-failure",
    label: "Transient upstream failure — retry delivery",
  },
  {
    id: "operator-webhook-delivery.retry.subscriber-confirmed-loss",
    label: "Subscriber confirmed delivery loss — retry delivery",
  },
  {
    id: "operator-webhook-delivery.retry.signature-rotation",
    label: "Signature rotation — retry delivery",
  },
];

const RawSearchSchema = Schema.Struct({
  scope: Schema.optional(Schema.String),
  scopeId: Schema.optional(Schema.String),
});
const RawSearchBoundarySchema = Schema.Struct({
  scope: Schema.optional(Schema.Unknown),
  scopeId: Schema.optional(Schema.Unknown),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
const decodeRawSearchBoundary = decodeSyncBoundary(RawSearchBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const decodeOptionalScope = decodeSchemaOrUndefined(PlatformScopeSchema);
const decodeOptionalString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const validateSearch = (raw: unknown): RawSearch => {
  const search = decodeRawSearchBoundary(raw);
  const scope = decodeSearchString(search.scope);
  const scopeId = decodeSearchString(search.scopeId);

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
  };
};

export const Route = createAdminAppFileRoute("/desk/delivery/$deliveryId")({
  validateSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const { loadAdminDeliveryDetailLoaderData } =
      await import("../../../lib/delivery-detail-loader");
    const scope = decodeOptionalScope(deps.search.scope);
    const scopeId = decodeOptionalString(deps.search.scopeId);
    return loadAdminDeliveryDetailLoaderData({
      deliveryId: params.deliveryId,
      ...(scope === undefined ? {} : { scope }),
      ...(scopeId === undefined ? {} : { scopeId }),
    });
  },
  component: DeliveryDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading delivery detail…" />
  ),
});

function DeliveryDetailRoute() {
  const data: AdminDeliveryDetailRouteData = Route.useLoaderData();
  const router = useRouter();
  const retryDelivery = useServerFn(retryAdminWebhookDelivery);
  const [guardArmed, setGuardArmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator session to view webhook delivery detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access webhook delivery detail."
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

  const { delivery, scope, scopeId } = data;
  const canRetry =
    delivery.status === operatorWebhookDeliveryStatus.failed ||
    delivery.status === operatorWebhookDeliveryStatus.exhausted;
  const breadcrumbScope = scope ?? delivery.targetTenant.scope;
  const breadcrumbScopeId = scopeId ?? delivery.targetTenant.scopeId;

  const handleRetryConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    void input.note;

    try {
      const result = await retryDelivery({
        data: {
          deliveryId: delivery.id,
          retryReasonCatalogId: input.reasonId,
        },
      });
      setGuardArmed(false);
      setActionError(null);
      setActionSuccess(`Retry accepted for ${result.deliveryId}.`);
      await router.invalidate();
    } catch (error) {
      setGuardArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to retry the delivery. Retry shortly.",
      );
    }
  };

  return (
    <section
      data-testid="delivery-detail-ready"
      data-pattern="delivery-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={delivery.id}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Webhooks", href: "/desk/webhook" },
          { label: delivery.id },
        ]}
        subtitle={
          <>
            Status{" "}
            <span
              className="mono"
              data-testid="delivery-detail-status-chip"
              data-status={delivery.status}
            >
              {delivery.status}
            </span>{" "}
            · Scope{" "}
            <span className="mono">
              {breadcrumbScope}/{breadcrumbScopeId}
            </span>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="delivery-detail-action-success"
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
          data-testid="delivery-detail-action-error"
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
        data-testid="delivery-detail-summary"
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
          <strong>Subscription:</strong>{" "}
          <span className="mono" data-testid="delivery-detail-subscription">
            {delivery.subscriptionId}
          </span>
        </div>
        <div>
          <strong>Event:</strong>{" "}
          <span data-testid="delivery-detail-event">{delivery.eventType}</span>
        </div>
        <div>
          <strong>Attempts:</strong>{" "}
          <span className="mono" data-testid="delivery-detail-attempts">
            {delivery.attemptCount}
          </span>
        </div>
        <div>
          <strong>Enqueued at:</strong>{" "}
          <span className="mono">{delivery.enqueuedAt}</span>
        </div>
        <div>
          <strong>Last attempt at:</strong>{" "}
          <span className="mono">{delivery.lastAttemptAt ?? "—"}</span>
        </div>
        <div>
          <strong>Correlation id:</strong>{" "}
          <span className="mono">{delivery.correlationId}</span>
        </div>
      </section>

      <section
        data-testid="delivery-detail-request"
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
          Request payload
        </h2>
        <div>
          <strong>Method:</strong>{" "}
          <span className="mono">{delivery.requestMethod}</span>
        </div>
        <div>
          <strong>URL:</strong>{" "}
          <span className="mono" data-testid="delivery-detail-request-url">
            {delivery.requestUrl}
          </span>
        </div>
        <pre
          data-testid="delivery-detail-request-body"
          style={{
            margin: 0,
            padding: 4,
            background: "var(--bg-1)",
            borderRadius: 4,
            fontSize: "0.75rem",
            overflowX: "auto",
          }}
        >
          {delivery.requestBody}
        </pre>
      </section>

      <section
        data-testid="delivery-detail-response"
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
          Response payload
        </h2>
        <div>
          <strong>Last status:</strong>{" "}
          <span className="mono">{delivery.lastResponseStatus ?? "—"}</span>
        </div>
        <div>
          <strong>Last error:</strong>{" "}
          <span data-testid="delivery-detail-last-error">
            {delivery.lastErrorMessage ?? "—"}
          </span>
        </div>
        {delivery.lastResponseBodySnippet !== undefined ? (
          <pre
            data-testid="delivery-detail-response-body"
            style={{
              margin: 0,
              padding: 4,
              background: "var(--bg-1)",
              borderRadius: 4,
              fontSize: "0.75rem",
              overflowX: "auto",
            }}
          >
            {delivery.lastResponseBodySnippet}
          </pre>
        ) : (
          <div data-testid="delivery-detail-response-body-empty">
            No response body captured.
          </div>
        )}
      </section>

      {canRetry ? (
        <div>
          <button
            type="button"
            data-testid="delivery-detail-retry-cta"
            onClick={() => setGuardArmed(true)}
          >
            Retry delivery
          </button>
        </div>
      ) : null}
      {guardArmed ? (
        <HighRiskActionGuard
          action={{
            id: "operator-webhook-delivery-retry",
            label: "Retry operator webhook delivery",
          }}
          selection={[delivery.id]}
          reasons={retryReasonCatalog}
          requireNote
          confirmLabel="Retry"
          onConfirm={handleRetryConfirm}
          onCancel={() => setGuardArmed(false)}
        />
      ) : null}
    </section>
  );
}
