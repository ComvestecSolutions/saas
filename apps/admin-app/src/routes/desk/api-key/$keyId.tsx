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
  platformScope,
  platformScopes,
  webhookApiKeyStatus,
  type WebhookApiKeyTenantScope,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import {
  revokeAdminWebhookApiKey,
  rotateAdminWebhookApiKey,
} from "../../../lib/api-key-detail-mutations-server";
import type { AdminApiKeyDetailRouteData } from "../../../lib/api-key-detail-route-data";

/**
 * `/desk/api-key/$keyId` — spec-canonical Webhook API Key Detail
 * v2 surface shipped by Phase 5 Support / compliance /
 * integrations operator screens commit 3 (admin-app
 * implementation plan §8.12 + §11 + §8.13). Consumes the
 * `api-key-detail-{loader,route-data,route-server}` trio gated
 * end-to-end through `resolveTrustedRequestContextFromSessionId`
 * and the `webhooks-api-access` platform service.
 *
 * Layout follows the spec §11 "spine first, body second"
 * convention shipped on `/desk/incident/$incidentId`,
 * `/desk/legal-hold/$holdId`, and `/desk/delivery/$deliveryId`:
 *   - Summary panel (label, prefix, status, created/rotated/
 *     revoked timestamps).
 *   - Scopes & usage panel (scope, scope id, key id).
 *   - Rotate-key + revoke-key CTAs gated through
 *     `HighRiskActionGuard`.
 *
 * The rotate / revoke CTAs now execute through the
 * `rotateAdminWebhookApiKey` / `revokeAdminWebhookApiKey`
 * mutations-server entrypoints. The current backend contract is
 * still session-id based and does not yet accept the guard
 * reason or note payload directly.
 *
 * `WebhookApiKeyAdminView` deliberately does not expose the
 * raw secret (one-time-only on creation), so no `RevealField`
 * wrapping is needed on this detail view.
 */
const rotateReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "webhook-api-key.rotate.suspected-leak",
    label: "Suspected leak — rotate key",
  },
  {
    id: "webhook-api-key.rotate.scheduled-rotation",
    label: "Scheduled rotation — rotate key",
  },
  {
    id: "webhook-api-key.rotate.compliance-cadence",
    label: "Compliance cadence — rotate key",
  },
];

const revokeReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "webhook-api-key.revoke.confirmed-compromise",
    label: "Confirmed compromise — revoke key",
  },
  {
    id: "webhook-api-key.revoke.subscriber-offboarded",
    label: "Subscriber offboarded — revoke key",
  },
  {
    id: "webhook-api-key.revoke.policy-violation",
    label: "Policy violation — revoke key",
  },
];

const RawSearchSchema = Schema.Struct({
  scope: Schema.optional(Schema.String),
  scopeId: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;

const knownTenantScopes = new Set<string>([
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
]);

const decodeScope = (value: string | undefined): WebhookApiKeyTenantScope => {
  if (value === undefined || !knownTenantScopes.has(value)) {
    return platformScope.organization;
  }
  return value as WebhookApiKeyTenantScope;
};

const decodeScopeId = (value: string | undefined): string =>
  value !== undefined && value.length > 0 ? value : platformScope.organization;

export const Route = createAdminAppFileRoute("/desk/api-key/$keyId")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const { loadAdminApiKeyDetailLoaderData } =
      await import("../../../lib/api-key-detail-loader");
    return loadAdminApiKeyDetailLoaderData({
      keyId: params.keyId,
      scope: decodeScope(deps.search.scope),
      scopeId: decodeScopeId(deps.search.scopeId),
    });
  },
  component: ApiKeyDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading API key detail…" />
  ),
});

function ApiKeyDetailRoute() {
  const data: AdminApiKeyDetailRouteData = Route.useLoaderData();
  const router = useRouter();
  const rotateApiKey = useServerFn(rotateAdminWebhookApiKey);
  const revokeApiKey = useServerFn(revokeAdminWebhookApiKey);
  const [rotateGuardArmed, setRotateGuardArmed] = useState(false);
  const [revokeGuardArmed, setRevokeGuardArmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // `platformScopes` is imported to keep the URL-known list in sync
  // with the contracts; the validator already narrows to tenant
  // scopes through `decodeScope` above.
  void platformScopes;

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view webhook API key detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access webhook API key detail."
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

  const { apiKey, scope, scopeId } = data;
  const isActive = apiKey.status === webhookApiKeyStatus.active;

  const handleRotateConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    void input.reasonId;
    void input.note;

    try {
      const result = await rotateApiKey({
        data: {
          apiKeyId: apiKey.apiKeyId,
          scope,
          scopeId,
        },
      });
      setRotateGuardArmed(false);
      setActionError(null);
      setActionSuccess(`Rotate accepted for ${result.apiKeyId}.`);
      await router.invalidate();
    } catch (error) {
      setRotateGuardArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to rotate the webhook API key. Retry shortly.",
      );
    }
  };

  const handleRevokeConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    void input.reasonId;
    void input.note;

    try {
      const result = await revokeApiKey({
        data: {
          apiKeyId: apiKey.apiKeyId,
          scope,
          scopeId,
        },
      });
      setRevokeGuardArmed(false);
      setActionError(null);
      setActionSuccess(`Revoke accepted for ${result.apiKeyId}.`);
      await router.invalidate();
    } catch (error) {
      setRevokeGuardArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to revoke the webhook API key. Retry shortly.",
      );
    }
  };

  return (
    <section
      data-testid="api-key-detail-ready"
      data-pattern="api-key-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={apiKey.label}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Webhooks", href: "/desk/webhook" },
          { label: apiKey.apiKeyId },
        ]}
        subtitle={
          <>
            Status{" "}
            <span
              className="mono"
              data-testid="api-key-detail-status-chip"
              data-status={apiKey.status}
            >
              {apiKey.status}
            </span>{" "}
            · Scope{" "}
            <span className="mono">
              {scope}/{scopeId}
            </span>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="api-key-detail-action-success"
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
          data-testid="api-key-detail-action-error"
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
        data-testid="api-key-detail-summary"
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
          <strong>Label:</strong>{" "}
          <span data-testid="api-key-detail-label">{apiKey.label}</span>
        </div>
        <div>
          <strong>Prefix:</strong>{" "}
          <span className="mono" data-testid="api-key-detail-prefix">
            {apiKey.prefix}
          </span>
        </div>
        <div>
          <strong>Key id:</strong>{" "}
          <span className="mono" data-testid="api-key-detail-key-id">
            {apiKey.apiKeyId}
          </span>
        </div>
        <div>
          <strong>Created at:</strong>{" "}
          <span className="mono">{apiKey.createdAt}</span>
        </div>
        <div>
          <strong>Rotated at:</strong>{" "}
          <span className="mono">{apiKey.rotatedAt ?? "—"}</span>
        </div>
        <div>
          <strong>Revoked at:</strong>{" "}
          <span className="mono">{apiKey.revokedAt ?? "—"}</span>
        </div>
      </section>

      <section
        data-testid="api-key-detail-scope"
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
          Scope &amp; usage
        </h2>
        <ul
          data-testid="api-key-detail-scope-list"
          style={{ padding: 4, margin: 0, listStyle: "none" }}
        >
          <li style={{ padding: 4 }}>
            <strong>Scope:</strong> <span className="mono">{scope}</span>
          </li>
          <li style={{ padding: 4 }}>
            <strong>Scope id:</strong> <span className="mono">{scopeId}</span>
          </li>
          <li style={{ padding: 4 }}>
            <strong>Status:</strong>{" "}
            <span className="mono">{apiKey.status}</span>
          </li>
        </ul>
      </section>

      {isActive ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            data-testid="api-key-detail-rotate-cta"
            onClick={() => setRotateGuardArmed(true)}
          >
            Rotate key
          </button>
          <button
            type="button"
            data-testid="api-key-detail-revoke-cta"
            onClick={() => setRevokeGuardArmed(true)}
          >
            Revoke key
          </button>
        </div>
      ) : null}
      {rotateGuardArmed ? (
        <HighRiskActionGuard
          action={{
            id: "webhook-api-key-rotate",
            label: "Rotate webhook API key",
          }}
          selection={[apiKey.apiKeyId]}
          reasons={rotateReasonCatalog}
          requireNote
          confirmLabel="Rotate"
          onConfirm={handleRotateConfirm}
          onCancel={() => setRotateGuardArmed(false)}
        />
      ) : null}
      {revokeGuardArmed ? (
        <HighRiskActionGuard
          action={{
            id: "webhook-api-key-revoke",
            label: "Revoke webhook API key",
          }}
          selection={[apiKey.apiKeyId]}
          reasons={revokeReasonCatalog}
          requireNote
          confirmLabel="Revoke"
          onConfirm={handleRevokeConfirm}
          onCancel={() => setRevokeGuardArmed(false)}
        />
      ) : null}
    </section>
  );
}
