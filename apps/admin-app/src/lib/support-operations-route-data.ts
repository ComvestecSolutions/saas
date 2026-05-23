import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  listSupportCasesFromSessionId,
  listSupportBreakGlassIncidentsFromSessionId,
  listSupportImpersonationSessionsFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

type SupportCase = Awaited<
  Effect.Effect.Success<ReturnType<typeof listSupportCasesFromSessionId>>
>[number];

type BreakGlassIncident = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listSupportBreakGlassIncidentsFromSessionId>
  >
>[number];

type ImpersonationSession = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listSupportImpersonationSessionsFromSessionId>
  >
>[number];

export type AdminSupportOperationsRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly cases: readonly SupportCase[];
      readonly incidents: readonly BreakGlassIncident[];
      readonly impersonationSessions: readonly ImpersonationSession[];
    };

export const loadAdminSupportOperationsRouteDataFromRequest = (
  request: Request,
  environment: unknown,
): Effect.Effect<AdminSupportOperationsRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        Effect.all({
          cases: listSupportCasesFromSessionId(environment, {
            sessionId,
          }),
          incidents: listSupportBreakGlassIncidentsFromSessionId(environment, {
            sessionId,
          }),
          impersonationSessions: listSupportImpersonationSessionsFromSessionId(
            environment,
            { sessionId },
          ),
        }).pipe(
          Effect.map(
            ({
              cases,
              incidents,
              impersonationSessions,
            }): AdminSupportOperationsRouteData => ({
              kind: "ready",
              cases,
              incidents,
              impersonationSessions,
            }),
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
    Effect.catchTag("SupportOperationsReadAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect support cases, break-glass incidents, or impersonation sessions.",
      } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
