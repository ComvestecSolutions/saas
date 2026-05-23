import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  getCapabilitySnapshotV2FromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import type { CapabilitySnapshotV2 } from "@comvestec/contracts";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the Capability snapshot v2
 * shell refresh (admin-app implementation plan §9 item 13 + Phase 2
 * Desk Core cutover). Mirrors `operations-home-route-data.ts`:
 * the route data is consumed as
 * `shell | stale-session | denied | error | ready`, and the
 * `ready` variant exposes both the typed snapshot and a
 * `fromCache` flag the posture board (commit 2) uses to surface
 * cache freshness.
 *
 * The capability snapshot v2 envelope is fully serializable
 * (`CapabilitySnapshotV2Schema` is composed of scalar + array
 * fields only, with no `Record<string, unknown>` payload), so
 * there is no `drillFilters`-style projection to apply here.
 * If that ever changes, project unknowns at this boundary
 * before they cross the TanStack Start server-function edge.
 */
export type AdminCapabilitySnapshotV2RouteData =
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
      readonly snapshot: CapabilitySnapshotV2;
      readonly fromCache: boolean;
    };

type GetCapabilitySnapshotV2 = typeof getCapabilitySnapshotV2FromEnvironment;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

const buildErrorState = (
  error: unknown,
): Extract<AdminCapabilitySnapshotV2RouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Capability snapshot unavailable",
      description: error.message,
    };
  }

  return {
    kind: "error",
    title: "Capability snapshot unavailable",
    description:
      "The capability snapshot could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

export const loadAdminCapabilitySnapshotV2RouteDataFromRequest = (
  request: Request,
  environment: unknown,
  resolveTrustedRequestContext: ResolveTrustedRequestContext = (
    env,
    sessionId,
  ) => resolveTrustedRequestContextFromSessionId(env, sessionId),
  getCapabilitySnapshotV2: GetCapabilitySnapshotV2 = (env, input) =>
    getCapabilitySnapshotV2FromEnvironment(env, input),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            getCapabilitySnapshotV2(environment, { requestContext }).pipe(
              Effect.map(
                (view): AdminCapabilitySnapshotV2RouteData => ({
                  kind: "ready",
                  snapshot: view.snapshot,
                  fromCache: view.fromCache,
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
    Effect.catchTag("CapabilitySnapshotV2MissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("CapabilitySnapshotV2Unauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot derive the capability snapshot for this surface.",
      } as const),
    ),
    Effect.catchTag("CapabilitySnapshotV2ReasonNotInCatalog", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The reason supplied with this request is not present in the platform reason catalog.",
      } as const),
    ),
    Effect.catchTag("CapabilitySnapshotV2ReasonActionMismatch", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The reason supplied with this request does not gate the capability snapshot read action.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
