import { Effect } from "effect";
import type { AuditEvent } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  queryAdminOrganizationScopedAuditEventsFromEnvironment,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/admin/audit` admin-organization-scoped audit feed surface
 * (admin-app implementation plan §11 — Phase 7 admin-org screens
 * commit 7b-2-audit). Mirrors the Phase 6 / Phase 7b-1 v2
 * loader-trio shape.
 *
 * Backed live by the Phase 7a-1 helper
 * `queryAdminOrganizationScopedAuditEventsFromEnvironment`, which
 * pins the underlying `queryAdminAuditEventsByModule` call to
 * `platformModuleId.adminOrganization` so the route can never
 * widen the scope through caller-supplied input. Reuses the
 * audit-log v2 typed-error braid mapping
 * (`AdminGovernanceReadAccessDeniedError` → `denied`,
 * `AdminGovernanceRequestContext{NotFound,Malformed}Error` →
 * `stale-session`) so operator-facing affordances stay
 * consistent across the audit surfaces.
 */
export type AdminAuditInput = Record<string, never>;

export type AdminAuditRouteData =
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
      readonly events: ReadonlyArray<AuditEvent>;
    };

type QueryAdminOrganizationScopedAuditEvents = (
  environment: unknown,
  input: { readonly sessionId: string },
) => ReturnType<typeof queryAdminOrganizationScopedAuditEventsFromEnvironment>;

export type AdminAuditDependencies = {
  readonly queryAdminOrganizationScopedAuditEvents: QueryAdminOrganizationScopedAuditEvents;
};

const defaultDependencies: AdminAuditDependencies = {
  queryAdminOrganizationScopedAuditEvents:
    queryAdminOrganizationScopedAuditEventsFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminAuditRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Admin organization audit feed unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Admin organization audit events could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream admin-governance audit port is failing.",
});

export const loadAdminAuditRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  dependencies: AdminAuditDependencies = defaultDependencies,
): Effect.Effect<AdminAuditRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies
          .queryAdminOrganizationScopedAuditEvents(environment, { sessionId })
          .pipe(
            Effect.map(
              (events): AdminAuditRouteData => ({
                kind: "ready",
                events,
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
          "The current operator session cannot inspect admin organization audit activity.",
      } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
