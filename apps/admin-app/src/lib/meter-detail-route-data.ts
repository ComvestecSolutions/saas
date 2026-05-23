import { Effect, Option } from "effect";
import {
  type OpenMeterUsageQueryGranularity,
  type PlatformScope,
  reasonCatalogId,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getOpenMeterMeterBySlugFromEnvironment,
  getOpenMeterUsageQueryFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
  type OpenMeterMeterReadView,
  type OpenMeterUsageQueryView,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for `/r/meter/$meterId`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 1). Composes two Phase 1 helpers:
 *
 *   - `getOpenMeterMeterBySlugFromEnvironment` → meter summary
 *     (display name, aggregation, event-type).
 *   - `getOpenMeterUsageQueryFromEnvironment` → aggregated
 *     usage time-series for the time window.
 *
 * Escape-hatch note (Phase 4 commit 1, tracked under Admin app
 * row Phase 4 follow-ups): per-source `partialFailures` for the
 * usage query is deferred until the typed error channel for the
 * OpenMeter adapter union is stabilized for `Effect.catchTags`.
 * Today the usage call surfaces as `null` when the meter
 * surface should still render but the time window has no data,
 * and otherwise degrades through the outer `catchAll` to
 * `error`. Meter-summary failures bubble through the same outer
 * `catchAll` because the surface cannot meaningfully render
 * without the meter identity.
 */
export type AdminMeterDetailTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminMeterDetailWindow = {
  readonly from: string;
  readonly to: string;
};

export type AdminMeterDetailInput = {
  readonly meterSlug: string;
  readonly tenant: AdminMeterDetailTenantTarget;
  readonly subject?: string;
  readonly granularity?: OpenMeterUsageQueryGranularity;
  readonly window?: AdminMeterDetailWindow;
};

export type AdminMeterDetailRouteData =
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
      readonly tenant: AdminMeterDetailTenantTarget;
      readonly meter: OpenMeterMeterReadView;
      readonly usage: OpenMeterUsageQueryView | null;
    };

type GetOpenMeterMeterBySlug = typeof getOpenMeterMeterBySlugFromEnvironment;
type GetOpenMeterUsageQuery = typeof getOpenMeterUsageQueryFromEnvironment;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminMeterDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getOpenMeterMeterBySlug: GetOpenMeterMeterBySlug;
  readonly getOpenMeterUsageQuery: GetOpenMeterUsageQuery;
};

const defaultDependencies: AdminMeterDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getOpenMeterMeterBySlug: getOpenMeterMeterBySlugFromEnvironment,
  getOpenMeterUsageQuery: getOpenMeterUsageQueryFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminMeterDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Meter detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Meter detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminMeterDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminMeterDetailInput,
  dependencies: AdminMeterDetailDependencies = defaultDependencies,
): Effect.Effect<AdminMeterDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .getOpenMeterMeterBySlug(environment, {
                requestContext,
                query: {
                  tenant: input.tenant,
                  meterSlug: input.meterSlug,
                  reasonCatalogId: reasonCatalogId.openMeterMeterRead,
                },
              })
              .pipe(
                Effect.flatMap((meterOption) =>
                  Option.match(meterOption, {
                    onNone: (): Effect.Effect<
                      AdminMeterDetailRouteData,
                      never
                    > =>
                      Effect.succeed({
                        kind: "error",
                        title: "Meter not found",
                        description:
                          "The OpenMeter meter could not be located. The meter slug may be stale or the meter may have been removed from the tenant catalog.",
                      } as const),
                    onSome: (meter) => {
                      const subject = input.subject;
                      const granularity = input.granularity;
                      const window = input.window;
                      if (
                        subject === undefined ||
                        granularity === undefined ||
                        window === undefined
                      ) {
                        return Effect.succeed({
                          kind: "ready",
                          tenant: input.tenant,
                          meter,
                          usage: null,
                        } as const);
                      }
                      return dependencies
                        .getOpenMeterUsageQuery(environment, {
                          requestContext,
                          query: {
                            tenant: input.tenant,
                            subject,
                            meterSlug: input.meterSlug,
                            granularity,
                            window,
                          },
                        })
                        .pipe(
                          Effect.map(
                            (usageOption) =>
                              ({
                                kind: "ready",
                                tenant: input.tenant,
                                meter,
                                usage: Option.getOrNull(usageOption),
                              }) as const,
                          ),
                        );
                    },
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
    Effect.catchTag("OpenMeterMeterReadUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot review OpenMeter meter metadata for this tenant.",
      } as const),
    ),
    Effect.catchTag("OpenMeterUsageQueryUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot review OpenMeter usage data for this tenant.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
