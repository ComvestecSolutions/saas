import { Effect } from "effect";
import {
  type PlatformAdapterServiceName,
  type RequestContext,
  type VendorHealthAggregateEntry,
  type VendorHealthAggregatePartialFailure,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getVendorHealthAggregateFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/desk/vendor/$service` Vendor Detail v2 surface (admin-app
 * implementation plan §8.15 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6a). Mirrors the v2 loader-trio
 * pattern shipped for `/desk/incident/$incidentId`,
 * `/desk/legal-hold/$holdId`, `/desk/delivery/$deliveryId`, and
 * `/desk/api-key/$keyId`.
 *
 * Backed live by the same `vendor-health-aggregator` platform
 * service consumed by `/desk/vendors` (Phase 1 backend item 9).
 * Per-vendor read helpers (Phase 1 backend item 10 — Keycloak,
 * Polar, OpenMeter, Novu, Postal, GlitchTip, OpenPanel) are
 * intentionally surfaced as deep-link affordances rather than
 * loader-time data fetches: per the implementation plan §8.15
 * the per-vendor detail screen shows health history, version,
 * latency, and a deep-link out to the vendor console. Wiring
 * vendor-specific data panes (e.g. Keycloak user roster,
 * Polar customer lookup) into this loader is tracked under
 * the Admin app row's Phase 6 follow-ups in the implementation
 * tracker — spine first, body second.
 *
 * The loader operates under the documented list-then-filter
 * escape hatch: it reads the full vendor-health aggregate and
 * narrows to the requested `serviceName` because the aggregate
 * is the only currently-published per-vendor read path, and
 * no `getVendorHealthEntryById` helper exists.
 */
export type AdminVendorDetailInput = {
  readonly serviceName: PlatformAdapterServiceName;
};

export type AdminVendorDetailRouteData =
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
      readonly entry: VendorHealthAggregateEntry;
      readonly partialFailure?: VendorHealthAggregatePartialFailure;
      readonly correlationId: string;
      readonly generatedAt: string;
    };

type GetVendorHealthAggregate = (
  environment: unknown,
  input: { readonly requestContext: RequestContext },
) => ReturnType<typeof getVendorHealthAggregateFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminVendorDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getVendorHealthAggregate: GetVendorHealthAggregate;
};

const defaultDependencies: AdminVendorDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getVendorHealthAggregate: getVendorHealthAggregateFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminVendorDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Vendor detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Vendor detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

const notFoundState = (
  serviceName: PlatformAdapterServiceName,
): Extract<AdminVendorDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Vendor not found",
  description: `No vendor-health entry was reported for service '${serviceName}' in the current aggregate. The aggregator may not yet expose a healthcheck for this adapter, or the entry was pruned.`,
});

export const loadAdminVendorDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminVendorDetailInput,
  dependencies: AdminVendorDetailDependencies = defaultDependencies,
): Effect.Effect<AdminVendorDetailRouteData, never> =>
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
                Effect.map(({ aggregate }): AdminVendorDetailRouteData => {
                  const entry = aggregate.entries.find(
                    (candidate) => candidate.serviceName === input.serviceName,
                  );
                  if (entry === undefined)
                    return notFoundState(input.serviceName);
                  const partialFailure = aggregate.partialFailures.find(
                    (candidate) => candidate.serviceName === input.serviceName,
                  );
                  return {
                    kind: "ready",
                    entry,
                    correlationId: aggregate.correlationId,
                    generatedAt: aggregate.generatedAt,
                    ...(partialFailure === undefined ? {} : { partialFailure }),
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
        title: "Vendor detail unavailable",
        description:
          "Every upstream vendor healthcheck source failed. The platform has degraded to an unavailable state for vendor detail; retry shortly.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
