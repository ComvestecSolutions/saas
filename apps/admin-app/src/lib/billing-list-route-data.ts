import { Effect, Option } from "effect";
import {
  type PlatformScope,
  platformScope,
  reasonCatalogId,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getPolarRevenueProjectionFromEnvironment,
  listPolarCustomersByExternalIdFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
  type PolarRevenueProjectionSnapshotView,
} from "@comvestec/platform";
import { resolveAdminTenantTargetDisplayName } from "./admin-tenant-target-display-name";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the `/desk/billing` Billing
 * Operations v2 surface (admin-app implementation plan §8.10 +
 * §11 — Phase 4 Domain operator screens commit 1). Mirrors the
 * v2 loader-trio pattern shipped for `/desk/config`, `/desk/flag`,
 * `/desk/access`, and `/desk/tenants`: the route component consumes a
 * thin `shell | stale-session | denied | error | ready`
 * discriminated union.
 *
 * Backed live by two Phase 1 helpers:
 *
 *   - `getPolarRevenueProjectionFromEnvironment` →
 *     per-tenant MRR / ARR snapshot used for the global posture
 *     header AND the per-tenant row.
 *   - `listPolarCustomersByExternalIdFromEnvironment` →
 *     per-tenant Polar customer count for the row's
 *     `customerCount` column.
 *
 * Escape-hatch notes (Phase 4 commit 1, tracked under Admin app
 * row Phase 4 follow-ups):
 *
 *   - No Phase 1 helper currently exposes a typed multi-tenant
 *     directory aggregate for billing scope. The loader accepts
 *     the explicit list of `tenantTargets` from the URL search
 *     and renders an empty-state when none are supplied — the
 *     tenant directory surface (`/desk/tenants`) is the upstream
 *     pivot until the platform-side aggregate ships.
 *   - Per-tenant failure isolation (`partialFailures`) deferred
 *     until the typed error channel for `Effect.catchTags` is
 *     stabilized for the Polar adapter union; today any
 *     per-tenant Polar failure degrades the whole posture board
 *     to `error`, surfaced through the outer `catchAll`.
 */
export type AdminBillingListTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminBillingListInput = {
  readonly tenantTargets: readonly AdminBillingListTenantTarget[];
  readonly selectedTenantId?: string;
};

export type AdminBillingListRow = {
  readonly tenant: AdminBillingListTenantTarget;
  readonly displayName: string;
  readonly projection: PolarRevenueProjectionSnapshotView | null;
  readonly customerCount: number;
};

export type AdminBillingListPosture = {
  readonly tenantCount: number;
  readonly aggregateMrrMinorUnits: number;
  readonly aggregateArrMinorUnits: number;
  readonly currency: string | null;
};

export type AdminBillingListRouteData =
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
      readonly rows: readonly AdminBillingListRow[];
      readonly posture: AdminBillingListPosture;
      readonly selectedTenantId?: string;
    };

type GetPolarRevenueProjection =
  typeof getPolarRevenueProjectionFromEnvironment;
type ListPolarCustomersByExternalId =
  typeof listPolarCustomersByExternalIdFromEnvironment;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminBillingListDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getPolarRevenueProjection: GetPolarRevenueProjection;
  readonly listPolarCustomersByExternalId: ListPolarCustomersByExternalId;
};

const defaultDependencies: AdminBillingListDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getPolarRevenueProjection: getPolarRevenueProjectionFromEnvironment,
  listPolarCustomersByExternalId: listPolarCustomersByExternalIdFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminBillingListRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Billing posture unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Billing posture could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

const computePosture = (
  rows: readonly AdminBillingListRow[],
): AdminBillingListPosture => {
  let aggregateMrr = 0;
  let aggregateArr = 0;
  let currency: string | null = null;
  for (const row of rows) {
    if (row.projection === null) continue;
    const mrr = row.projection.snapshot.subscriptionMrr;
    aggregateMrr += mrr.amountMinorUnits;
    aggregateArr += mrr.amountMinorUnits * 12;
    currency ??= mrr.currency;
  }
  return {
    tenantCount: rows.length,
    aggregateMrrMinorUnits: aggregateMrr,
    aggregateArrMinorUnits: aggregateArr,
    currency,
  };
};

export const loadAdminBillingListRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminBillingListInput,
  dependencies: AdminBillingListDependencies = defaultDependencies,
): Effect.Effect<AdminBillingListRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            Effect.forEach(
              input.tenantTargets,
              (tenant) =>
                Effect.all({
                  projection: dependencies.getPolarRevenueProjection(
                    environment,
                    {
                      requestContext,
                      tenant,
                    },
                  ),
                  customers: dependencies.listPolarCustomersByExternalId(
                    environment,
                    {
                      requestContext,
                      query: {
                        tenant,
                        externalId: tenant.scopeId,
                        reasonCatalogId: reasonCatalogId.polarCustomerRead,
                      },
                    },
                  ),
                }).pipe(
                  Effect.map(
                    ({ projection, customers }): AdminBillingListRow => ({
                      tenant,
                      displayName: resolveAdminTenantTargetDisplayName(tenant),
                      projection: Option.getOrNull(projection),
                      customerCount: customers.summaries.length,
                    }),
                  ),
                ),
              { concurrency: 4 },
            ).pipe(
              Effect.map(
                (rows): AdminBillingListRouteData => ({
                  kind: "ready",
                  rows,
                  posture: computePosture(rows),
                  ...(input.selectedTenantId === undefined
                    ? {}
                    : { selectedTenantId: input.selectedTenantId }),
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
    Effect.catchTag("PolarRevenueProjectionUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot review Polar billing posture for this tenant set.",
      } as const),
    ),
    Effect.catchTag("PolarCustomerReadUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot review Polar customer data for this tenant set.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );

export const adminBillingListPlatformTenantSentinel: AdminBillingListTenantTarget =
  {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  };
