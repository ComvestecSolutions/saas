import { Effect } from "effect";
import type { AdminTenantDirectoryEntry } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listTenantDirectoryFromEnvironment,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the `/desk/tenants` directory
 * (admin-app implementation plan §9 — Phase 2 Desk Core commit
 * 3 cutover). Mirrors `operations-home-route-data.ts` and
 * `capability-snapshot-v2-route-data.ts`: the route consumes a
 * thin `shell | stale-session | denied | error | ready` shape
 * backed by the admin tenant-management service.
 */
export type AdminTenantsDirectoryRow = AdminTenantDirectoryEntry;
export type AdminTenantsDirectoryRowStatus = AdminTenantsDirectoryRow["status"];

export type AdminTenantsDirectoryRouteData =
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
      readonly rows: readonly AdminTenantsDirectoryRow[];
    };

type LoadTenantsDirectoryRows = (
  sessionId: string,
) => Effect.Effect<readonly AdminTenantsDirectoryRow[], unknown>;

const isTaggedError = (error: unknown): error is { readonly _tag: string } =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof (error as { readonly _tag?: unknown })._tag === "string";

const buildErrorState = (
  error: unknown,
): Extract<AdminTenantsDirectoryRouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Tenant directory unavailable",
      description: error.message,
    };
  }

  return {
    kind: "error",
    title: "Tenant directory unavailable",
    description:
      "The tenant directory could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

const buildRouteDataFromError = (
  error: unknown,
): AdminTenantsDirectoryRouteData => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "SubscriberJourneySessionIdMissingError":
        return { kind: "shell" };
      case "IdentitySessionRequestContextNotFoundError":
        return { kind: "stale-session" };
      case "AdminTenantManagementAccessDeniedError":
        return {
          kind: "denied",
          reason:
            "reason" in error && typeof error.reason === "string"
              ? error.reason
              : "Tenant directory access is not allowed for this session.",
        };
      case "AdminTenantManagementDirectoryUnavailableError":
        return {
          kind: "error",
          title: "Tenant directory unavailable",
          description:
            "reason" in error && typeof error.reason === "string"
              ? error.reason
              : "The tenant directory could not be loaded from the current backend state.",
        };
    }
  }

  return buildErrorState(error);
};

const loadTenantDirectoryRowsFromEnvironment =
  (environment: unknown): LoadTenantsDirectoryRows =>
  (sessionId) =>
    listTenantDirectoryFromEnvironment(environment, { sessionId }).pipe(
      Effect.map((result) => result.rows),
    );

export const loadAdminTenantsDirectoryRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  loadRows: LoadTenantsDirectoryRows = loadTenantDirectoryRowsFromEnvironment(
    environment,
  ),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        loadRows(sessionId).pipe(
          Effect.map(
            (rows): AdminTenantsDirectoryRouteData => ({
              kind: "ready",
              rows,
            }),
          ),
        ),
      ),
    ),
    Effect.catchAll((error) => Effect.succeed(buildRouteDataFromError(error))),
  );
