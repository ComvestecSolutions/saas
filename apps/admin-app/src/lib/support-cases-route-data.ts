import { Effect } from "effect";
import type {
  SupportOperationsBreakGlassIncidentSupportView,
  SupportOperationsCaseSupportView,
  SupportOperationsImpersonationSessionSupportView,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listSupportBreakGlassIncidentsFromSessionId,
  listSupportCasesFromSessionId,
  listSupportImpersonationSessionsFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/desk/support` Support & Incident v2 surface (admin-app
 * implementation plan §8.8 + §11 — Phase 5 Support / compliance
 * / integrations operator screens commit 1). Mirrors the v2
 * loader-trio pattern shipped for `/desk/billing`, `/desk/branding`,
 * and `/desk/access`: the route component consumes a thin
 * `shell | stale-session | denied | error | ready` discriminated
 * union and reads the support workspace posture (active
 * break-glass incidents + impersonation sessions + open support
 * cases).
 *
 * Backed live by three Phase 1 by-session helpers:
 *
 *   - `listSupportCasesFromSessionId` → operator support case
 *     queue rows (status, priority, last update).
 *   - `listSupportBreakGlassIncidentsFromSessionId` → break-glass
 *     incident rows (pending-review + reviewed), the upstream of
 *     the per-incident detail surface `/desk/incident/$incidentId`.
 *   - `listSupportImpersonationSessionsFromSessionId` → tenant
 *     impersonation sessions, surfaced so operators can pivot
 *     from a case row into the active impersonation banner.
 *
 * Status filtering (case status, incident status) is supplied
 * via the route's search params and forwarded into the typed
 * by-session helper inputs. The v2 surface intentionally
 * supersedes the legacy `support-operations-route-data.ts`
 * shipped under Phase 2 — the legacy file is left in place to
 * keep `/support-operations` linked and only the v2 trio lives
 * on the `/desk/*` route taxonomy.
 */
export type AdminSupportCasesInput = {
  readonly caseStatus?: SupportOperationsCaseSupportView["status"];
  readonly incidentStatus?: SupportOperationsBreakGlassIncidentSupportView["status"];
  readonly impersonationStatus?: SupportOperationsImpersonationSessionSupportView["status"];
  readonly selectedIncidentId?: string;
};

export type AdminSupportCasesRouteData =
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
      readonly generatedAt: SupportOperationsBreakGlassIncidentSupportView["expiresAt"];
      readonly cases: readonly SupportOperationsCaseSupportView[];
      readonly incidents: readonly SupportOperationsBreakGlassIncidentSupportView[];
      readonly impersonationSessions: readonly SupportOperationsImpersonationSessionSupportView[];
      readonly selectedIncidentId?: string;
    };

type ListSupportCases = typeof listSupportCasesFromSessionId;
type ListSupportBreakGlassIncidents =
  typeof listSupportBreakGlassIncidentsFromSessionId;
type ListSupportImpersonationSessions =
  typeof listSupportImpersonationSessionsFromSessionId;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminSupportCasesDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listSupportCases: ListSupportCases;
  readonly listSupportBreakGlassIncidents: ListSupportBreakGlassIncidents;
  readonly listSupportImpersonationSessions: ListSupportImpersonationSessions;
};

const defaultDependencies: AdminSupportCasesDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listSupportCases: listSupportCasesFromSessionId,
  listSupportBreakGlassIncidents: listSupportBreakGlassIncidentsFromSessionId,
  listSupportImpersonationSessions:
    listSupportImpersonationSessionsFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminSupportCasesRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Support workspace unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Support workspace could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminSupportCasesRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminSupportCasesInput,
  dependencies: AdminSupportCasesDependencies = defaultDependencies,
): Effect.Effect<AdminSupportCasesRouteData, never> => {
  const generatedAt = new Date().toISOString();

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() =>
            Effect.all({
              cases: dependencies.listSupportCases(environment, {
                sessionId,
                ...(input.caseStatus === undefined
                  ? {}
                  : { status: input.caseStatus }),
              }),
              incidents: dependencies.listSupportBreakGlassIncidents(
                environment,
                {
                  sessionId,
                  ...(input.incidentStatus === undefined
                    ? {}
                    : { status: input.incidentStatus }),
                },
              ),
              impersonationSessions:
                dependencies.listSupportImpersonationSessions(environment, {
                  sessionId,
                  ...(input.impersonationStatus === undefined
                    ? {}
                    : { status: input.impersonationStatus }),
                }),
            }).pipe(
              Effect.map(
                ({
                  cases,
                  incidents,
                  impersonationSessions,
                }): AdminSupportCasesRouteData => ({
                  kind: "ready",
                  generatedAt,
                  cases,
                  incidents,
                  impersonationSessions,
                  ...(input.selectedIncidentId === undefined
                    ? {}
                    : { selectedIncidentId: input.selectedIncidentId }),
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
    Effect.catchTag("SupportOperationsReadAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect support cases, break-glass incidents, or impersonation sessions.",
      } as const),
    ),
    Effect.catchTag("SupportOperationsReadUnauthenticatedActorError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
};
