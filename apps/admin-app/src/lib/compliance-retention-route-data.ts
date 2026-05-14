import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  listRetentionPoliciesFromSessionId,
  listRetentionLegalHoldsFromSessionId,
} from "@comvestec/platform";

type RetentionPolicy = Awaited<
  Effect.Effect.Success<ReturnType<typeof listRetentionPoliciesFromSessionId>>
>[number];

type LegalHold = Awaited<
  Effect.Effect.Success<ReturnType<typeof listRetentionLegalHoldsFromSessionId>>
>[number];

export type AdminComplianceRetentionRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "no-scope" }
  | {
      readonly kind: "ready";
      readonly policies: readonly RetentionPolicy[];
      readonly holds: readonly LegalHold[];
    };

export const loadAdminComplianceRetentionRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  scope: string,
  scopeId: string,
): Effect.Effect<AdminComplianceRetentionRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      Effect.all({
        policies: listRetentionPoliciesFromSessionId(environment, {
          sessionId,
          scope: scope as "organization",
          scopeId,
        }),
        holds: listRetentionLegalHoldsFromSessionId(environment, {
          sessionId,
          scope: scope as "organization",
          scopeId,
        }),
      }).pipe(
        Effect.map(
          ({ policies, holds }): AdminComplianceRetentionRouteData => ({
            kind: "ready",
            policies,
            holds,
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
