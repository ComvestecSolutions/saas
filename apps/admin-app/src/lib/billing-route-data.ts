import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  listBillingRepairGapsFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

type BillingRepairGap = Awaited<
  Effect.Effect.Success<ReturnType<typeof listBillingRepairGapsFromSessionId>>
>["jobs"][number];

export type AdminBillingRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "ready"; readonly gaps: readonly BillingRepairGap[] };

export const loadAdminBillingRouteDataFromRequest = (
  request: Request,
  environment: unknown,
): Effect.Effect<AdminBillingRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        listBillingRepairGapsFromSessionId(environment, { sessionId }).pipe(
          Effect.map(
            (result): AdminBillingRouteData => ({
              kind: "ready",
              gaps: result.jobs,
            }),
          ),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("ManagedBillingPlanAccessDeniedError", (error) =>
      Effect.succeed({ kind: "denied", reason: error.reason } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
