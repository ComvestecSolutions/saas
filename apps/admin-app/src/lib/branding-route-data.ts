import { Effect } from "effect";
import { platformScope } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getTenantBrandingSupportSafeViewFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";
import { buildAdminTenantTarget } from "./admin-tenant-target";

export type AdminBrandingRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "no-scope" }
  | {
      readonly kind: "ready";
      readonly branding: Awaited<
        Effect.Effect.Success<
          ReturnType<typeof getTenantBrandingSupportSafeViewFromSessionId>
        >
      >;
    };

export const loadAdminBrandingRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  scope: string,
  scopeId: string,
): Effect.Effect<AdminBrandingRouteData, never, never> =>
  Effect.sync(() => buildAdminTenantTarget({ scope, scopeId })).pipe(
    Effect.flatMap((target) => {
      if (target === undefined) {
        return Effect.succeed({ kind: "no-scope" } as const);
      }

      if (target.scope === platformScope.individual) {
        return Effect.succeed({
          kind: "denied",
          reason:
            "Branding view currently supports organization and enterprise tenant targets.",
        } as const);
      }

      const brandingScope =
        target.scope === platformScope.enterprise
          ? platformScope.enterprise
          : platformScope.organization;

      return extractRequiredSubscriberJourneySessionId(request).pipe(
        Effect.flatMap((sessionId) =>
          retryTransientAdminSessionReadiness(() =>
            getTenantBrandingSupportSafeViewFromSessionId(environment, {
              sessionId,
              scope: brandingScope,
              scopeId: target.scopeId,
            }).pipe(
              Effect.map(
                (branding): AdminBrandingRouteData => ({
                  kind: "ready",
                  branding,
                }),
              ),
            ),
          ),
        ),
      );
    }),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("TenantBrandingAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect support-safe branding data for this tenant target.",
      } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
