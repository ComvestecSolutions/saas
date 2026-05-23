import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import type { AdminTenantTarget } from "./admin-tenant-target";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the `/r/tenants` directory
 * (admin-app implementation plan §9 — Phase 2 Desk Core commit
 * 3 cutover). Mirrors `operations-home-route-data.ts` and
 * `capability-snapshot-v2-route-data.ts`: the route consumes a
 * thin `shell | stale-session | denied | error | ready` shape.
 *
 * Escape-hatch note (Phase 2 commit 3): no Phase-1 platform
 * helper currently exposes a tenant-directory list aggregate
 * shaped for the dense data table v2 — `admin-organization-
 * actions.ts` lists per-tenant members and
 * `admin-tenant-management-actions.ts` covers per-tenant
 * onboarding/membership/invitation read paths only. The loader
 * therefore still ships the typed fixture as its data source
 * while gating end-to-end through
 * `resolveTrustedRequestContextFromSessionId`, so the loader
 * trio + route component + browser harness wiring is in place
 * the moment the platform-side aggregate lands. The tracker
 * records the platform-side gap explicitly under the Admin app
 * row's deferred Phase 2 follow-ups.
 */
export type AdminTenantsDirectoryRowEnvironment =
  | "platform"
  | "production"
  | "staging"
  | "sandbox";

export type AdminTenantsDirectoryRowStatus = "active" | "pending" | "suspended";

/**
 * Display-only row shape used by the `/r/tenants` data table.
 * Typed identically to the slice 1b-tail `TenantDirectoryRow`
 * fixture row so the existing `desk/fixtures/tenants.ts` shape
 * remains the single source of truth until the Phase-1
 * aggregate ships.
 */
export type AdminTenantsDirectoryRow = {
  readonly key: string;
  readonly displayName: string;
  readonly target: AdminTenantTarget;
  readonly environment: AdminTenantsDirectoryRowEnvironment;
  readonly status: AdminTenantsDirectoryRowStatus;
  readonly approvalsOpen: number;
};

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

type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

type LoadTenantsDirectoryRows = () => Effect.Effect<
  readonly AdminTenantsDirectoryRow[],
  never
>;

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

/**
 * Default fixture-backed row source for the loader. Once the
 * platform-side aggregate ships, swap this out for the
 * `*FromEnvironment` helper without touching the route trio.
 */
const loadFixtureTenantsDirectoryRows: LoadTenantsDirectoryRows = () =>
  Effect.promise(async () => {
    const { tenantDirectoryFixture } = await import("../desk/fixtures/tenants");
    return tenantDirectoryFixture;
  });

export const loadAdminTenantsDirectoryRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  resolveTrustedRequestContext: ResolveTrustedRequestContext = (
    env,
    sessionId,
  ) => resolveTrustedRequestContextFromSessionId(env, sessionId),
  loadRows: LoadTenantsDirectoryRows = loadFixtureTenantsDirectoryRows,
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() =>
            loadRows().pipe(
              Effect.map(
                (rows): AdminTenantsDirectoryRouteData => ({
                  kind: "ready",
                  rows,
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
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
