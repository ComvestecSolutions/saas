import { Effect } from "effect";
import type { SupportOperationsBreakGlassIncidentSupportView } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getSupportBreakGlassIncidentFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/desk/incident/$incidentId` Break-glass Incident Detail v2
 * surface (admin-app implementation plan §8.8 + §11 — Phase 5
 * Support / compliance / integrations operator screens commit
 * 1). Mirrors the v2 loader-trio pattern shipped for
 * `/desk/invoice`, `/desk/meter`, and `/desk/domain`.
 *
 * Backed live by the Phase 1
 * `getSupportBreakGlassIncidentFromSessionId` helper, which
 * yields the canonical incident support view (status, approver,
 * reason, started-at and expires-at timestamps). The route
 * surface uses these to render the approval timeline, reviewer
 * panel, and expiry countdown.
 *
 * The release-grant CTA is wired through `HighRiskActionGuard`
 * at the route component level — the mutations-server handler
 * body for `releaseBreakGlassGrantFromEnvironment` is tracked
 * under the Admin app row's Phase 5 follow-ups in the
 * implementation tracker (spine first, body second; mirrors the
 * verify CTA on `/desk/domain/$hostname`).
 */
export type AdminIncidentDetailInput = {
  readonly incidentId: string;
};

export type AdminIncidentDetailRouteData =
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
      readonly incident: SupportOperationsBreakGlassIncidentSupportView;
    };

type GetSupportBreakGlassIncident =
  typeof getSupportBreakGlassIncidentFromSessionId;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminIncidentDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getSupportBreakGlassIncident: GetSupportBreakGlassIncident;
};

const defaultDependencies: AdminIncidentDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getSupportBreakGlassIncident: getSupportBreakGlassIncidentFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminIncidentDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Incident detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Incident detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminIncidentDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminIncidentDetailInput,
  dependencies: AdminIncidentDetailDependencies = defaultDependencies,
): Effect.Effect<AdminIncidentDetailRouteData, never> => {
  const generatedAt = new Date().toISOString();

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() =>
            dependencies
              .getSupportBreakGlassIncident(environment, {
                sessionId,
                caseId: input.incidentId,
              })
              .pipe(
                Effect.map(
                  (incident): AdminIncidentDetailRouteData => ({
                    kind: "ready",
                    generatedAt,
                    incident,
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
          "The current operator session cannot inspect this break-glass incident.",
      } as const),
    ),
    Effect.catchTag("SupportOperationsReadUnauthenticatedActorError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("SupportOperationsBreakGlassIncidentNotFoundError", () =>
      Effect.succeed({
        kind: "error",
        title: "Incident not found",
        description:
          "The requested break-glass incident could not be located. The incident id may be stale.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
};
