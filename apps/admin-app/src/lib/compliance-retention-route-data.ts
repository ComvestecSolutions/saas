import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  listRetentionPoliciesFromSessionId,
  listRetentionLegalHoldsFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";
import { buildAdminTenantTarget } from "./admin-tenant-target";

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
  Effect.sync(() => buildAdminTenantTarget({ scope, scopeId })).pipe(
    Effect.flatMap((target) =>
      target === undefined
        ? Effect.succeed({ kind: "no-scope" } as const)
        : extractRequiredSubscriberJourneySessionId(request).pipe(
            Effect.flatMap((sessionId) =>
              retryTransientAdminSessionReadiness(() =>
                Effect.all({
                  policies: listRetentionPoliciesFromSessionId(environment, {
                    sessionId,
                    scope: target.scope,
                    scopeId: target.scopeId,
                  }),
                  holds: listRetentionLegalHoldsFromSessionId(environment, {
                    sessionId,
                    scope: target.scope,
                    scopeId: target.scopeId,
                  }),
                }).pipe(
                  Effect.map(
                    ({
                      policies,
                      holds,
                    }): AdminComplianceRetentionRouteData => ({
                      kind: "ready",
                      policies,
                      holds,
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
    Effect.catchTag("RetentionLegalHoldAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect compliance retention controls for this tenant target.",
      } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
