import { Effect } from "effect";
import { platformModuleId } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminFeatureFlagsFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

type FeatureFlag = Awaited<
  Effect.Effect.Success<ReturnType<typeof listAdminFeatureFlagsFromSessionId>>
>[number];

export type AdminFeatureFlagsRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly flags: readonly FeatureFlag[];
    };

export const loadAdminFeatureFlagsRouteDataFromRequest = (
  request: Request,
  environment: unknown,
): Effect.Effect<AdminFeatureFlagsRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        listAdminFeatureFlagsFromSessionId(environment, {
          sessionId,
          moduleId: platformModuleId.featureFlags,
        }).pipe(
          Effect.map(
            (flags): AdminFeatureFlagsRouteData => ({
              kind: "ready",
              flags,
            }),
          ),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("AdminGovernanceReadAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect governed feature flags.",
      } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
