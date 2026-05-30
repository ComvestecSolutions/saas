import { Effect } from "effect";
import {
  type PlatformScope,
  type RetentionLegalHoldComplianceView,
  type RetentionPolicyAdminView,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listRetentionLegalHoldsFromSessionId,
  listRetentionPoliciesFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/desk/retention` Retention & Legal-hold v2 surface (admin-app
 * implementation plan §8.11 + §11 — Phase 5 Support /
 * compliance / integrations operator screens commit 2). Mirrors
 * the v2 loader-trio pattern shipped for `/desk/billing`,
 * `/desk/branding`, and `/desk/support`: the route component consumes
 * a thin `shell | stale-session | denied | error | ready`
 * discriminated union and renders the compliance retention
 * posture (policies + legal holds + upcoming schedule entries).
 *
 * Backed live by two Phase 1 by-session helpers:
 *
 *   - `listRetentionPoliciesFromSessionId` → retention policy
 *     rows (data-type, retention-days, legal-hold-active flag).
 *   - `listRetentionLegalHoldsFromSessionId` → legal hold rows
 *     (status, placed-at, released-at, evidence), the upstream
 *     of the per-hold detail surface `/desk/legal-hold/$holdId`.
 *
 * Schedule entries (next-run-at, due-policy, target) do not yet
 * have a dedicated by-session helper exported from
 * `packages/platform/src/services/apps/admin-retention-actions.ts`.
 * Under the documented escape hatch in the Phase 5 commit
 * brief, the loader emits an empty schedule readonly array
 * shaped to a local canonical view and the gap is tracked in
 * the implementation tracker — spine first, body second
 * (mirrors the verify CTA on `/desk/domain/$hostname` and the
 * release-grant CTA on `/desk/incident/$incidentId`).
 *
 * Tenant target (scope + scopeId) is supplied via the route's
 * search params. When the operator has not yet picked a target
 * the loader yields `ready` with empty arrays and the route
 * surfaces a "select a scope" affordance (mirrors the empty
 * `tenants` set behavior on `/desk/billing` and `/desk/branding`).
 */
export type RetentionScheduleEntryView = {
  readonly entryId: string;
  readonly policyId: string;
  readonly dataType: string;
  readonly nextRunAt: string;
};

export type AdminRetentionListInput = {
  readonly scope?: PlatformScope;
  readonly scopeId?: string;
  readonly selectedHoldId?: string;
};

export type AdminRetentionListRouteData =
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
      readonly scope: PlatformScope | null;
      readonly scopeId: string | null;
      readonly policies: readonly RetentionPolicyAdminView[];
      readonly holds: readonly RetentionLegalHoldComplianceView[];
      readonly scheduleEntries: readonly RetentionScheduleEntryView[];
      readonly selectedHoldId?: string;
    };

type ListRetentionPolicies = typeof listRetentionPoliciesFromSessionId;
type ListRetentionLegalHolds = typeof listRetentionLegalHoldsFromSessionId;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminRetentionListDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listRetentionPolicies: ListRetentionPolicies;
  readonly listRetentionLegalHolds: ListRetentionLegalHolds;
};

const defaultDependencies: AdminRetentionListDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listRetentionPolicies: listRetentionPoliciesFromSessionId,
  listRetentionLegalHolds: listRetentionLegalHoldsFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminRetentionListRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Retention posture unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Retention posture could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminRetentionListRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminRetentionListInput,
  dependencies: AdminRetentionListDependencies = defaultDependencies,
): Effect.Effect<AdminRetentionListRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() => {
            if (
              input.scope === undefined ||
              input.scopeId === undefined ||
              input.scopeId.length === 0
            ) {
              return Effect.succeed<AdminRetentionListRouteData>({
                kind: "ready",
                scope: null,
                scopeId: null,
                policies: [],
                holds: [],
                scheduleEntries: [],
                ...(input.selectedHoldId === undefined
                  ? {}
                  : { selectedHoldId: input.selectedHoldId }),
              });
            }
            const scope = input.scope;
            const scopeId = input.scopeId;
            return Effect.all({
              policies: dependencies.listRetentionPolicies(environment, {
                sessionId,
                scope,
                scopeId,
              }),
              holds: dependencies.listRetentionLegalHolds(environment, {
                sessionId,
                scope,
                scopeId,
              }),
            }).pipe(
              Effect.map(
                ({ policies, holds }): AdminRetentionListRouteData => ({
                  kind: "ready",
                  scope,
                  scopeId,
                  policies,
                  holds,
                  // Schedule-entry by-session helper is not yet
                  // exported from
                  // packages/platform/src/services/apps/admin-retention-actions.ts.
                  // Tracked under the Admin app row's Phase 5
                  // follow-ups — spine first, body second.
                  scheduleEntries: [],
                  ...(input.selectedHoldId === undefined
                    ? {}
                    : { selectedHoldId: input.selectedHoldId }),
                }),
              ),
            );
          }),
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
          "The current operator session cannot inspect retention policies or legal holds for this scope.",
      } as const),
    ),
    Effect.catchTag("RetentionLegalHoldUnauthenticatedActorError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
