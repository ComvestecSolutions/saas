import { Effect } from "effect";
import {
  type OperatorWebhookDelivery,
  type PlatformScope,
  type RequestContext,
  type WebhookSubscriptionAdminView,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listOperatorWebhookDeliveriesFromEnvironment,
  listWebhookSubscriptionsFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/desk/webhook` Webhook Endpoints v2 list surface (admin-app
 * implementation plan §8.12 + §11 — Phase 5 Support /
 * compliance / integrations operator screens commit 3).
 * Mirrors the v2 loader-trio pattern shipped for `/desk/billing`,
 * `/desk/branding`, `/desk/support`, and `/desk/retention`.
 *
 * Backed live by two helpers composed via `Effect.all`:
 *
 *   - `listWebhookSubscriptionsFromSessionId` →
 *     `WebhookSubscriptionAdminView[]` (the endpoint roster).
 *   - `listOperatorWebhookDeliveriesFromEnvironment` →
 *     `OperatorWebhookDelivery[]` (the recent-delivery roster).
 *     This helper takes a `RequestContext` rather than a session
 *     id, so the loader resolves the trusted request-context
 *     first via `resolveTrustedRequestContextFromSessionId` and
 *     feeds the resolved context into the delivery list call.
 *     The list is filtered by `targetTenant` so the roster
 *     matches the selected workspace scope (no by-session
 *     delivery helper exists yet — tracked under the Admin app
 *     row's Phase 5 follow-ups in the implementation tracker;
 *     spine first, body second).
 *
 * Tenant target (`scope` + `scopeId`) is supplied via the
 * route's search params. When the operator has not yet picked a
 * target, the loader yields `ready` with empty arrays and the
 * route surfaces a "select a scope" affordance (mirrors
 * `/desk/billing`, `/desk/branding`, and `/desk/retention`).
 */
export type AdminWebhookListInput = {
  readonly scope?: PlatformScope;
  readonly scopeId?: string;
  readonly selectedDeliveryId?: string;
};

export type AdminWebhookListRouteData =
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
      readonly scope: PlatformScope | null;
      readonly scopeId: string | null;
      readonly subscriptions: readonly WebhookSubscriptionAdminView[];
      readonly deliveries: readonly OperatorWebhookDelivery[];
      readonly selectedDeliveryId?: string;
    };

type ListWebhookSubscriptions = typeof listWebhookSubscriptionsFromSessionId;
type ListOperatorWebhookDeliveries = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly filter: {
      readonly targetTenant?: {
        readonly scope: PlatformScope;
        readonly scopeId: string;
      };
      readonly limit?: number;
    };
  },
) => ReturnType<typeof listOperatorWebhookDeliveriesFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminWebhookListDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listWebhookSubscriptions: ListWebhookSubscriptions;
  readonly listOperatorWebhookDeliveries: ListOperatorWebhookDeliveries;
};

const defaultDependencies: AdminWebhookListDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listWebhookSubscriptions: listWebhookSubscriptionsFromSessionId,
  listOperatorWebhookDeliveries: listOperatorWebhookDeliveriesFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminWebhookListRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Webhook posture unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Webhook posture could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminWebhookListRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminWebhookListInput,
  dependencies: AdminWebhookListDependencies = defaultDependencies,
): Effect.Effect<AdminWebhookListRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) => {
            if (
              input.scope === undefined ||
              input.scopeId === undefined ||
              input.scopeId.length === 0
            ) {
              return Effect.succeed<AdminWebhookListRouteData>({
                kind: "ready",
                scope: null,
                scopeId: null,
                subscriptions: [],
                deliveries: [],
                ...(input.selectedDeliveryId === undefined
                  ? {}
                  : { selectedDeliveryId: input.selectedDeliveryId }),
              });
            }
            const scope = input.scope;
            const scopeId = input.scopeId;
            return Effect.all({
              subscriptions: dependencies.listWebhookSubscriptions(
                environment,
                { sessionId, scope, scopeId },
              ),
              deliveries: dependencies.listOperatorWebhookDeliveries(
                environment,
                {
                  requestContext,
                  filter: {
                    targetTenant: { scope, scopeId },
                    limit: 100,
                  },
                },
              ),
            }).pipe(
              Effect.map(
                ({ subscriptions, deliveries }): AdminWebhookListRouteData => ({
                  kind: "ready",
                  scope,
                  scopeId,
                  subscriptions,
                  deliveries,
                  ...(input.selectedDeliveryId === undefined
                    ? {}
                    : { selectedDeliveryId: input.selectedDeliveryId }),
                }),
              ),
            );
          }),
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
          "The current operator session cannot inspect webhook endpoints or deliveries for this scope.",
      } as const),
    ),
    Effect.catchTag("WebhooksApiAccessUnauthenticatedActorError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("OperatorWebhookDeliveryUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect operator-webhook deliveries.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
