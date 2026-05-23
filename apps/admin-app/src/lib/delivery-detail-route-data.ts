import { Effect, Option } from "effect";
import {
  type OperatorWebhookDelivery,
  type PlatformScope,
  type RequestContext,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getOperatorWebhookDeliveryFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/r/delivery/$deliveryId` Webhook Delivery Detail v2 surface
 * (admin-app implementation plan §8.12 + §11 — Phase 5 Support
 * / compliance / integrations operator screens commit 3).
 * Mirrors the v2 loader-trio pattern shipped for `/r/invoice`,
 * `/r/meter`, `/r/domain`, `/r/incident`, and `/r/legal-hold`.
 *
 * Backed live by the operator-webhook-delivery platform
 * service through `resolveTrustedRequestContextFromSessionId`
 * followed by `getOperatorWebhookDeliveryFromEnvironment`,
 * which takes a `RequestContext` rather than a session id.
 *
 * Scope (`scope` + `scopeId`) is carried in the URL search
 * payload purely for breadcrumb / back-pivot rendering — the
 * canonical delivery row carries its own `targetTenant` so the
 * loader does not gate on the URL scope (and ready-state carries
 * the delivery's own target back to the route component).
 *
 * The retry-delivery CTA is wired through `HighRiskActionGuard`
 * at the route component level — the mutations-server handler
 * body for `retryOperatorWebhookDeliveryFromEnvironment` is
 * tracked under the Admin app row's Phase 5 follow-ups in the
 * implementation tracker (spine first, body second; mirrors the
 * release-grant CTA on `/r/incident/$incidentId` and the
 * release-hold CTA on `/r/legal-hold/$holdId`).
 */
export type AdminDeliveryDetailInput = {
  readonly deliveryId: string;
  readonly scope?: PlatformScope;
  readonly scopeId?: string;
};

export type AdminDeliveryDetailRouteData =
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
      readonly delivery: OperatorWebhookDelivery;
      readonly scope: PlatformScope | null;
      readonly scopeId: string | null;
    };

type GetOperatorWebhookDelivery = (
  environment: unknown,
  input: { readonly requestContext: RequestContext; readonly id: string },
) => ReturnType<typeof getOperatorWebhookDeliveryFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminDeliveryDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getOperatorWebhookDelivery: GetOperatorWebhookDelivery;
};

const defaultDependencies: AdminDeliveryDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getOperatorWebhookDelivery: getOperatorWebhookDeliveryFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminDeliveryDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Delivery detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Webhook delivery detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminDeliveryDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminDeliveryDetailInput,
  dependencies: AdminDeliveryDetailDependencies = defaultDependencies,
): Effect.Effect<AdminDeliveryDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .getOperatorWebhookDelivery(environment, {
                requestContext,
                id: input.deliveryId,
              })
              .pipe(
                Effect.map(
                  (deliveryOption): AdminDeliveryDetailRouteData =>
                    Option.match(deliveryOption, {
                      onNone: () => ({
                        kind: "error" as const,
                        title: "Delivery not found",
                        description:
                          "The requested webhook delivery could not be located. The delivery id may be stale or already pruned.",
                      }),
                      onSome: (delivery) => ({
                        kind: "ready" as const,
                        delivery,
                        scope: input.scope ?? null,
                        scopeId: input.scopeId ?? null,
                      }),
                    }),
                ),
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
    Effect.catchTag("OperatorWebhookDeliveryUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect this webhook delivery.",
      } as const),
    ),
    Effect.catchTag("OperatorWebhookDeliveryMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("OperatorWebhookDeliveryNotFound", () =>
      Effect.succeed({
        kind: "error",
        title: "Delivery not found",
        description:
          "The requested webhook delivery could not be located. The delivery id may be stale or already pruned.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
