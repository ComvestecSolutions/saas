import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  queryAdminAuditEventsByActorFromEnvironment,
  queryAdminAuditEventsByModuleFromEnvironment,
  queryAdminAuditEventsByTargetFromEnvironment,
  queryAdminAuditEventsByTenantFromEnvironment,
} from "@comvestec/platform";
import {
  type AuditEvent,
  type PlatformModuleId,
  type PlatformScope,
} from "@comvestec/contracts";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Audit Log v2 route data (admin-app implementation plan §9 —
 * Phase 2 Desk Core commit 6). Mirrors the v2 loader-trio
 * pattern shipped for `/desk/tenants` and `/desk/tenant/$tenantId`:
 * the route component consumes a thin `shell | stale-session |
 * denied | error | ready` discriminated union.
 *
 * The route is backed live by the
 * `queryAdminAuditEventsBy{Module,Target,Actor,Tenant}FromEnvironment`
 * helpers in `packages/platform/src/services/apps/admin-governance-actions.ts`,
 * gated through `resolveTrustedRequestContextFromSessionId`
 * (the platform helpers wrap that internally), with the
 * `AdminGovernanceReadAccessDenied{,RequestContextNotFound,RequestContextMalformed}Error`
 * braid mapped onto the discriminated union via `Effect.catchTag`.
 *
 * The query-mode is selected from the URL filter state:
 *
 *   - `actor` set → `queryAdminAuditEventsByActorFromEnvironment`
 *   - `tenantScope` + `tenantScopeId` set → `queryAdminAuditEventsByTenantFromEnvironment`
 *   - `target` + `module` set → `queryAdminAuditEventsByTargetFromEnvironment`
 *   - default → `queryAdminAuditEventsByModuleFromEnvironment` against the
 *     selected module (defaults to `platformModuleId.auditLog`).
 *
 * Post-query local filtering applies for `action`, `correlation`,
 * and the time-window range; `classification` and `ip` are
 * advisory-only filter intents until the `AuditEvent` schema
 * gains those fields (Phase 1 follow-up). They round-trip
 * through the URL so operators can record query intent and so
 * the omnibar (commit 7) can deep-link into them.
 *
 * Escape-hatch note (Phase 2 commit 6): the standalone
 * `packages/ui/src/patterns/log-stream.tsx` primitive is
 * deferred to commit 7 per the prompt's authorized escape
 * hatch; the route renders rows inline through existing UI
 * primitives + the v2 `RevealField` for redactable cells.
 */
export type AdminAuditLogV2TimeWindowPreset =
  | "1h"
  | "6h"
  | "24h"
  | "7d"
  | "custom";

export type AdminAuditLogV2Filters = {
  readonly module: PlatformModuleId;
  readonly actor?: string;
  readonly target?: string;
  readonly tenantScope?: PlatformScope;
  readonly tenantScopeId?: string;
  readonly action?: string;
  readonly classification?: string;
  readonly correlation?: string;
  readonly ip?: string;
  readonly window: AdminAuditLogV2TimeWindowPreset;
  readonly customFrom?: string;
  readonly customTo?: string;
  readonly liveTail: boolean;
};

export type AdminAuditLogV2QueryMode =
  | "by-actor"
  | "by-tenant"
  | "by-target"
  | "by-module";

export type AdminAuditLogV2RouteData =
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
      readonly events: readonly AuditEvent[];
      readonly filters: AdminAuditLogV2Filters;
      readonly appliedQueryMode: AdminAuditLogV2QueryMode;
      readonly totalBeforeLocalFilter: number;
    };

type QueryByModule = typeof queryAdminAuditEventsByModuleFromEnvironment;
type QueryByTarget = typeof queryAdminAuditEventsByTargetFromEnvironment;
type QueryByActor = typeof queryAdminAuditEventsByActorFromEnvironment;
type QueryByTenant = typeof queryAdminAuditEventsByTenantFromEnvironment;

export type AdminAuditLogV2QueryDependencies = {
  readonly queryByModule: QueryByModule;
  readonly queryByTarget: QueryByTarget;
  readonly queryByActor: QueryByActor;
  readonly queryByTenant: QueryByTenant;
};

const defaultQueryDependencies: AdminAuditLogV2QueryDependencies = {
  queryByModule: queryAdminAuditEventsByModuleFromEnvironment,
  queryByTarget: queryAdminAuditEventsByTargetFromEnvironment,
  queryByActor: queryAdminAuditEventsByActorFromEnvironment,
  queryByTenant: queryAdminAuditEventsByTenantFromEnvironment,
};

const timeWindowMillis: Record<
  Exclude<AdminAuditLogV2TimeWindowPreset, "custom">,
  number
> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const resolveTimeWindowRange = (
  filters: AdminAuditLogV2Filters,
  now: () => number,
): { readonly fromMs?: number; readonly toMs?: number } => {
  if (filters.window === "custom") {
    const fromMs = filters.customFrom
      ? Date.parse(filters.customFrom)
      : Number.NaN;
    const toMs = filters.customTo ? Date.parse(filters.customTo) : Number.NaN;
    return {
      ...(Number.isFinite(fromMs) ? { fromMs } : {}),
      ...(Number.isFinite(toMs) ? { toMs } : {}),
    };
  }

  return { fromMs: now() - timeWindowMillis[filters.window] };
};

const applyLocalFilters = (
  events: readonly AuditEvent[],
  filters: AdminAuditLogV2Filters,
  now: () => number,
): readonly AuditEvent[] => {
  const range = resolveTimeWindowRange(filters, now);

  return events.filter((event) => {
    if (filters.action !== undefined && event.action !== filters.action) {
      return false;
    }
    if (
      filters.correlation !== undefined &&
      event.correlationId !== filters.correlation
    ) {
      return false;
    }
    const eventMs = Date.parse(event.timestamp);
    if (!Number.isFinite(eventMs)) {
      return true;
    }
    if (range.fromMs !== undefined && eventMs < range.fromMs) {
      return false;
    }
    if (range.toMs !== undefined && eventMs > range.toMs) {
      return false;
    }
    return true;
  });
};

const selectQueryMode = (
  filters: AdminAuditLogV2Filters,
): AdminAuditLogV2QueryMode => {
  if (filters.actor !== undefined && filters.actor.length > 0) {
    return "by-actor";
  }
  if (
    filters.tenantScope !== undefined &&
    filters.tenantScopeId !== undefined &&
    filters.tenantScopeId.length > 0
  ) {
    return "by-tenant";
  }
  if (filters.target !== undefined && filters.target.length > 0) {
    return "by-target";
  }
  return "by-module";
};

const runSelectedQuery = (
  environment: unknown,
  sessionId: string,
  filters: AdminAuditLogV2Filters,
  mode: AdminAuditLogV2QueryMode,
  dependencies: AdminAuditLogV2QueryDependencies,
) => {
  switch (mode) {
    case "by-actor":
      return dependencies.queryByActor(environment, {
        sessionId,
        actorId: filters.actor ?? "",
      });
    case "by-tenant":
      return dependencies.queryByTenant(environment, {
        sessionId,
        tenantScope: filters.tenantScope as PlatformScope,
        tenantScopeId: filters.tenantScopeId ?? "",
      });
    case "by-target":
      return dependencies.queryByTarget(environment, {
        sessionId,
        moduleId: filters.module,
        target: filters.target ?? "",
      });
    case "by-module":
      return dependencies.queryByModule(environment, {
        sessionId,
        moduleId: filters.module,
      });
  }
};

const buildErrorState = (
  error: unknown,
): Extract<AdminAuditLogV2RouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Audit log unavailable",
      description: error.message,
    };
  }

  return {
    kind: "error",
    title: "Audit log unavailable",
    description:
      "The audit log could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

export const loadAdminAuditLogV2RouteDataFromRequest = (
  request: Request,
  environment: unknown,
  filters: AdminAuditLogV2Filters,
  dependencies: AdminAuditLogV2QueryDependencies = defaultQueryDependencies,
  now: () => number = () => Date.now(),
): Effect.Effect<AdminAuditLogV2RouteData, never> => {
  const mode = selectQueryMode(filters);

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        runSelectedQuery(
          environment,
          sessionId,
          filters,
          mode,
          dependencies,
        ).pipe(
          Effect.map((events): AdminAuditLogV2RouteData => {
            const filtered = applyLocalFilters(events, filters, now);
            return {
              kind: "ready",
              events: filtered,
              filters,
              appliedQueryMode: mode,
              totalBeforeLocalFilter: events.length,
            };
          }),
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
          "The current operator session cannot inspect audit activity for the requested scope.",
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
};
