import { Effect } from "effect";
import {
  type PlatformScope,
  type RetentionLegalHoldComplianceView,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listRetentionLegalHoldsFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/r/legal-hold/$holdId` Legal Hold Detail v2 surface
 * (admin-app implementation plan §8.11 + §11 — Phase 5 Support
 * / compliance / integrations operator screens commit 2).
 * Mirrors the v2 loader-trio pattern shipped for `/r/invoice`,
 * `/r/meter`, `/r/domain`, and `/r/incident`.
 *
 * Backed live by the Phase 1
 * `listRetentionLegalHoldsFromSessionId` helper. Because the
 * platform does not yet export a dedicated by-id
 * `getRetentionLegalHoldFromSessionId` helper from
 * `packages/platform/src/services/apps/admin-retention-actions.ts`,
 * this loader operates under the documented escape hatch: it
 * filters the by-session list result for the requested hold id
 * and yields a typed `error` state with the canonical
 * "Legal hold not found" copy when no match is found. The
 * dedicated by-id helper is tracked under the Admin app row's
 * Phase 5 follow-ups in the implementation tracker — spine
 * first, body second.
 *
 * The release-hold CTA is wired through `HighRiskActionGuard`
 * at the route component level — the mutations-server handler
 * body for `releaseRetentionLegalHoldFromEnvironment` is
 * tracked under the same Phase 5 follow-ups (mirrors the
 * release-grant CTA on `/r/incident/$incidentId` and the
 * verify CTA on `/r/domain/$hostname`).
 */
export type AdminLegalHoldDetailInput = {
  readonly holdId: string;
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminLegalHoldDetailRouteData =
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
      readonly hold: RetentionLegalHoldComplianceView;
      readonly scope: PlatformScope;
      readonly scopeId: string;
    };

type ListRetentionLegalHolds = typeof listRetentionLegalHoldsFromSessionId;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminLegalHoldDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listRetentionLegalHolds: ListRetentionLegalHolds;
};

const defaultDependencies: AdminLegalHoldDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listRetentionLegalHolds: listRetentionLegalHoldsFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminLegalHoldDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Legal hold detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Legal hold detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

const notFoundState: Extract<
  AdminLegalHoldDetailRouteData,
  { readonly kind: "error" }
> = {
  kind: "error",
  title: "Legal hold not found",
  description:
    "The requested legal hold could not be located in the current retention scope. The hold id may be stale or already released.",
};

export const loadAdminLegalHoldDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminLegalHoldDetailInput,
  dependencies: AdminLegalHoldDetailDependencies = defaultDependencies,
): Effect.Effect<AdminLegalHoldDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() =>
            dependencies
              .listRetentionLegalHolds(environment, {
                sessionId,
                scope: input.scope,
                scopeId: input.scopeId,
              })
              .pipe(
                Effect.map((holds): AdminLegalHoldDetailRouteData => {
                  const match = holds.find(
                    (candidate) => candidate.legalHoldId === input.holdId,
                  );
                  if (match === undefined) return notFoundState;
                  return {
                    kind: "ready",
                    hold: match,
                    scope: input.scope,
                    scopeId: input.scopeId,
                  };
                }),
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
        reason: "The current operator session cannot inspect this legal hold.",
      } as const),
    ),
    Effect.catchTag("RetentionLegalHoldUnauthenticatedActorError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
