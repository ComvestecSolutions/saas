import { Effect } from "effect";
import {
  type WebhookApiKeyAdminView,
  type WebhookApiKeyTenantScope,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listWebhookApiKeysFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/r/api-key/$keyId` Webhook API Key Detail v2 surface
 * (admin-app implementation plan §8.12 + §11 — Phase 5 Support
 * / compliance / integrations operator screens commit 3).
 * Mirrors the v2 loader-trio pattern shipped for `/r/invoice`,
 * `/r/meter`, `/r/domain`, `/r/incident`, `/r/legal-hold`, and
 * `/r/delivery`.
 *
 * Backed live by `listWebhookApiKeysFromSessionId`. Because the
 * platform does not yet export a dedicated by-id
 * `getWebhookApiKeyFromSessionId` helper, this loader operates
 * under the documented escape hatch: it lists the api keys for
 * the requested tenant scope and filters by `apiKeyId`, yielding
 * a typed `error` state with the canonical "API key not found"
 * copy when no match is found. The dedicated by-id helper is
 * tracked under the Admin app row's Phase 5 follow-ups in the
 * implementation tracker — spine first, body second.
 *
 * Webhook api keys are owner-locked to tenant scopes
 * (`enterprise` / `organization` / `individual`); the route
 * server narrows the wider `PlatformScope` URL input to a
 * `WebhookApiKeyTenantScope` before invoking the loader.
 *
 * The rotate-key and revoke-key CTAs are wired through
 * `HighRiskActionGuard` at the route component level — the
 * mutations-server handler bodies for
 * `rotateWebhookApiKeyFromSessionId` /
 * `revokeWebhookApiKeyFromSessionId` are tracked under the
 * Admin app row's Phase 5 follow-ups (mirrors the release-grant
 * CTA on `/r/incident/$incidentId`, the release-hold CTA on
 * `/r/legal-hold/$holdId`, and the retry CTA on
 * `/r/delivery/$deliveryId`).
 */
export type AdminApiKeyDetailInput = {
  readonly keyId: string;
  readonly scope: WebhookApiKeyTenantScope;
  readonly scopeId: string;
};

export type AdminApiKeyDetailRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "error";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "ready";
      readonly apiKey: WebhookApiKeyAdminView;
      readonly scope: WebhookApiKeyTenantScope;
      readonly scopeId: string;
    };

type ListWebhookApiKeys = typeof listWebhookApiKeysFromSessionId;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminApiKeyDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listWebhookApiKeys: ListWebhookApiKeys;
};

const defaultDependencies: AdminApiKeyDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listWebhookApiKeys: listWebhookApiKeysFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminApiKeyDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "API key detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Webhook API key detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

const notFoundState: Extract<
  AdminApiKeyDetailRouteData,
  { readonly kind: "error" }
> = {
  kind: "error",
  title: "API key not found",
  description:
    "The requested webhook API key could not be located in the current tenant scope. The key id may be stale or already revoked.",
};

export const loadAdminApiKeyDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminApiKeyDetailInput,
  dependencies: AdminApiKeyDetailDependencies = defaultDependencies,
): Effect.Effect<AdminApiKeyDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() =>
            dependencies
              .listWebhookApiKeys(environment, {
                sessionId,
                scope: input.scope,
                scopeId: input.scopeId,
              })
              .pipe(
                Effect.map((apiKeys): AdminApiKeyDetailRouteData => {
                  const match = apiKeys.find(
                    (candidate) => candidate.apiKeyId === input.keyId,
                  );
                  if (match === undefined) return notFoundState;
                  return {
                    kind: "ready",
                    apiKey: match,
                    scope: input.scope,
                    scopeId: input.scopeId,
                  };
                }),
              ),
          ),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("WebhooksApiAccessAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect this webhook API key.",
      } as const),
    ),
    Effect.catchTag("WebhooksApiAccessUnauthenticatedActorError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
