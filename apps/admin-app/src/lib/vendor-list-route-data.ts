import { Effect } from "effect";
import {
  type RequestContext,
  type VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getVendorHealthAggregateFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/desk/vendors` Vendor Health v2 list surface (admin-app
 * implementation plan §8.15 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6a). Mirrors the v2 loader-trio
 * pattern shipped for `/desk/billing`, `/desk/branding`, `/desk/support`,
 * `/desk/retention`, and `/desk/webhook`.
 *
 * Backed live by the `vendor-health-aggregator` platform
 * service (Phase 1 backend item 9). The aggregator takes a
 * `RequestContext` rather than a session id, so the loader
 * composes two reads through `Effect.all`:
 *
 *   - `resolveTrustedRequestContextFromSessionId` →
 *     `RequestContext` (the operator-trusted projection of the
 *     subscriber-journey session).
 *   - `getVendorHealthAggregateFromEnvironment` →
 *     `VendorHealthAggregateProjection` (one row per adapter
 *     keyed by `platformAdapterServiceName.*`).
 *
 * Aggregate v2 partial-failure semantics are preserved end-to-
 * end: per-source failures arrive in `partialFailures` and the
 * matching `entries` row carries `status: 'unavailable'`. The
 * loader does NOT collapse partial failures into the typed
 * `error` state — only the (rare) all-sources-failed case maps
 * to `error`.
 */
export type AdminVendorListInput = Record<string, never>;

export type AdminVendorListRouteData =
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
      readonly aggregate: VendorHealthAggregateProjection;
    };

type GetVendorHealthAggregate = (
  environment: unknown,
  input: { readonly requestContext: RequestContext },
) => ReturnType<typeof getVendorHealthAggregateFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminVendorListDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getVendorHealthAggregate: GetVendorHealthAggregate;
};

const defaultDependencies: AdminVendorListDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getVendorHealthAggregate: getVendorHealthAggregateFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminVendorListRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Vendor posture unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Vendor posture could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminVendorListRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  _input: AdminVendorListInput,
  dependencies: AdminVendorListDependencies = defaultDependencies,
): Effect.Effect<AdminVendorListRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        Effect.all({
          requestContext: dependencies.resolveTrustedRequestContext(
            environment,
            sessionId,
          ),
        }).pipe(
          Effect.flatMap(({ requestContext }) =>
            dependencies
              .getVendorHealthAggregate(environment, { requestContext })
              .pipe(
                Effect.map(
                  ({ aggregate }): AdminVendorListRouteData => ({
                    kind: "ready",
                    aggregate,
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
    Effect.catchTag("VendorHealthAggregatorUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect the vendor-health aggregate.",
      } as const),
    ),
    Effect.catchTag("VendorHealthAggregatorMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("VendorHealthAggregatorAllSourcesFailedError", () =>
      Effect.succeed({
        kind: "error",
        title: "Vendor posture unavailable",
        description:
          "Every upstream vendor healthcheck source failed. The platform has degraded to an unavailable state for vendor posture; retry shortly.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
