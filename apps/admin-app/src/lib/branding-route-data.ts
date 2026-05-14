import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  getTenantBrandingSupportSafeViewFromSessionId,
} from "@comvestec/platform";

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
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      getTenantBrandingSupportSafeViewFromSessionId(environment, {
        sessionId,
        scope: scope as "organization",
        scopeId,
      }).pipe(
        Effect.map(
          (branding): AdminBrandingRouteData => ({
            kind: "ready",
            branding,
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
