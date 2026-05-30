import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  resolveTrustedRequestContextFromSessionId,
  runUniversalSearchFromEnvironment,
} from "@comvestec/platform";
import {
  reasonCatalogId,
  type UniversalSearchPrefix,
  type UniversalSearchResult,
} from "@comvestec/contracts";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Universal Search v1 route data (admin-app implementation
 * plan §9 — Phase 2 Desk Core commit 7, item 11). Backs the
 * bottom Command Strip omnibar with a thin
 * `shell | stale-session | denied | error | ready`
 * discriminated union mirroring the v2 loader-trio shape used
 * by `/desk/tenants`, `/desk/tenant/$tenantId`, and `/desk/audit`.
 *
 * The route-data Effect:
 *   1. Extracts the subscriber-journey session id at the
 *      framework boundary via
 *      `extractRequiredSubscriberJourneySessionId`.
 *   2. Resolves the trusted operator `RequestContext` via the
 *      shared `resolveTrustedRequestContextFromSessionId`
 *      helper (services/access) so the route loader stays free
 *      of Valkey shaping and inherits the canonical Valkey
 *      adapter cleanup.
 *   3. Calls `runUniversalSearchFromEnvironment` (root-safe
 *      app helper) with the omnibar-supplied `query` /
 *      `prefixFilter` and the locked
 *      `reasonCatalogId.universalSearchRead` reason.
 *   4. Maps the service tagged errors onto the discriminated
 *      union:
 *        - `SubscriberJourneySessionIdMissingError` → `shell`
 *        - `IdentitySessionRequestContextNotFoundError` →
 *          `stale-session`
 *        - `UniversalSearchUnauthorized` /
 *          `UniversalSearchMissingActorIdentity` → `denied`
 *        - `UniversalSearchAllFacetsFailedError` /
 *          ParseError / adapter errors / catchAll → `error`
 *        - success → `ready` carrying the
 *          `UniversalSearchResult` envelope.
 */
export type AdminUniversalSearchInput = {
  readonly query: string;
  readonly prefixFilter?: UniversalSearchPrefix;
  readonly perFacetLimit?: number;
};

export type AdminUniversalSearchRouteData =
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
      readonly result: UniversalSearchResult;
      readonly fromCache: boolean;
    };

const buildErrorState = (
  error: unknown,
): Extract<AdminUniversalSearchRouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Search unavailable",
      description: error.message,
    };
  }

  return {
    kind: "error",
    title: "Search unavailable",
    description:
      "The federated search service is currently unavailable. Retry shortly; if the problem persists every upstream facet is failing.",
  };
};

export const loadAdminUniversalSearchRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminUniversalSearchInput,
): Effect.Effect<AdminUniversalSearchRouteData, never> => {
  if (input.query.trim().length === 0) {
    return Effect.succeed({ kind: "shell" } as const);
  }

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      resolveTrustedRequestContextFromSessionId(environment, sessionId).pipe(
        Effect.flatMap((requestContext) =>
          retryTransientAdminSessionReadiness(() =>
            runUniversalSearchFromEnvironment(environment, {
              requestContext,
              query: {
                query: input.query,
                reasonCatalogId: reasonCatalogId.universalSearchRead,
                ...(input.prefixFilter === undefined
                  ? {}
                  : { prefixFilter: input.prefixFilter }),
                ...(input.perFacetLimit === undefined
                  ? {}
                  : { perFacetLimit: input.perFacetLimit }),
              },
            }),
          ),
        ),
      ),
    ),
    Effect.map(
      (view): AdminUniversalSearchRouteData => ({
        kind: "ready",
        result: view.result,
        fromCache: view.fromCache,
      }),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("UniversalSearchUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot run federated omnibar search.",
      } as const),
    ),
    Effect.catchTag("UniversalSearchMissingActorIdentity", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The trusted request context does not carry an operator identity required to run federated omnibar search.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
};
