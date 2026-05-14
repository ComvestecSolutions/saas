import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminGovernanceProjectionProfilesFromSessionId,
} from "@comvestec/platform";

type ProjectionProfile = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listAdminGovernanceProjectionProfilesFromSessionId>
  >
>[number];

export type AdminAccessControlRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly profiles: readonly ProjectionProfile[];
    };

export const loadAdminAccessControlRouteDataFromRequest = (
  request: Request,
  environment: unknown,
): Effect.Effect<AdminAccessControlRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      listAdminGovernanceProjectionProfilesFromSessionId(environment, {
        sessionId,
      }).pipe(
        Effect.map(
          (profiles): AdminAccessControlRouteData => ({
            kind: "ready",
            profiles,
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
