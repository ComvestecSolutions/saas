/**
 * Admin-app Audit Log v2 loader tests (admin-app
 * implementation plan §9 — Phase 2 Desk Core commit 6).
 * Covers the discriminated-union mapping of the `/r/audit`
 * loader trio backed live by
 * `queryAdminAuditEventsBy{Module,Target,Actor,Tenant}FromEnvironment`
 * in `packages/platform/src/services/apps/admin-governance-actions.ts`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `AdminGovernanceReadAccessDeniedError` → `denied`
 *   - `AdminGovernanceRequestContext{NotFound,Malformed}Error` → `stale-session`
 *   - boundary error → `error`
 *   - happy path (each query mode) → `ready` carrying the events
 *
 * Mirrors `tests/platform/admin-app-tenants-directory-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  auditLogAuditAction,
  platformModuleId,
  platformScope,
  type AuditEvent,
} from "@comvestec/contracts";
import {
  loadAdminAuditLogV2RouteDataFromRequest,
  type AdminAuditLogV2Filters,
} from "../../apps/admin-app/src/lib/audit-log-v2-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseFilters: AdminAuditLogV2Filters = {
  module: platformModuleId.auditLog,
  window: "24h",
  liveTail: false,
};

const sampleEvents: readonly AuditEvent[] = [
  {
    eventId: "audit_event_01",
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    actorId: "usr_platform_operator_1",
    tenantScope: platformScope.organization,
    tenantScopeId: "org_acme",
    moduleId: platformModuleId.auditLog,
    action: auditLogAuditAction.exported,
    target: "export:1",
  },
  {
    eventId: "audit_event_02",
    timestamp: new Date(Date.now() - 120_000).toISOString(),
    actorId: "usr_platform_operator_2",
    tenantScope: platformScope.enterprise,
    tenantScopeId: "ent_globex",
    moduleId: platformModuleId.auditLog,
    action: auditLogAuditAction.exported,
    target: "export:2",
  },
];

const succeedingDependencies = {
  queryByModule: () => Effect.succeed(sampleEvents),
  queryByTarget: () => Effect.succeed([sampleEvents[0]!]),
  queryByActor: () => Effect.succeed([sampleEvents[0]!]),
  queryByTenant: () => Effect.succeed([sampleEvents[1]!]),
};

const failingDependencies = (tag: string) => ({
  queryByModule: () => Effect.fail({ _tag: tag } as const),
  queryByTarget: () => Effect.fail({ _tag: tag } as const),
  queryByActor: () => Effect.fail({ _tag: tag } as const),
  queryByTenant: () => Effect.fail({ _tag: tag } as const),
});

const throwingDependencies = (error: unknown) => ({
  queryByModule: () => Effect.fail(error),
  queryByTarget: () => Effect.fail(error),
  queryByActor: () => Effect.fail(error),
  queryByTenant: () => Effect.fail(error),
});

const stableNow = () => Date.now();

describe("admin-app audit-log v2 loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseFilters,
        succeedingDependencies as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready via queryByModule when no actor/tenant/target filters are set", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseFilters,
        succeedingDependencies as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.appliedQueryMode).toBe("by-module");
    expect(result.events).toHaveLength(2);
    expect(result.totalBeforeLocalFilter).toBe(2);
  });

  it("dispatches to queryByActor when the actor filter is set", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { ...baseFilters, actor: "usr_platform_operator_1" },
        succeedingDependencies as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.appliedQueryMode).toBe("by-actor");
    expect(result.events).toHaveLength(1);
  });

  it("dispatches to queryByTenant when scope + scopeId filters are set", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {
          ...baseFilters,
          tenantScope: platformScope.enterprise,
          tenantScopeId: "ent_globex",
        },
        succeedingDependencies as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.appliedQueryMode).toBe("by-tenant");
  });

  it("dispatches to queryByTarget when the target filter is set", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { ...baseFilters, target: "export:1" },
        succeedingDependencies as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.appliedQueryMode).toBe("by-target");
  });

  it("returns denied when the platform helper raises AdminGovernanceReadAccessDeniedError", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseFilters,
        failingDependencies("AdminGovernanceReadAccessDeniedError") as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseFilters,
        failingDependencies(
          "AdminGovernanceRequestContextNotFoundError",
        ) as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns stale-session when the request context is malformed", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-malformed"),
        {},
        baseFilters,
        failingDependencies(
          "AdminGovernanceRequestContextMalformedError",
        ) as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the platform helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseFilters,
        throwingDependencies(
          new Error("Upstream audit aggregate unavailable."),
        ) as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Audit log unavailable");
    expect(result.description).toBe("Upstream audit aggregate unavailable.");
  });

  it("applies the local action filter to the ready events", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditLogV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { ...baseFilters, action: "nonexistent.action" },
        succeedingDependencies as never,
        stableNow,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.events).toHaveLength(0);
    expect(result.totalBeforeLocalFilter).toBe(2);
  });
});
