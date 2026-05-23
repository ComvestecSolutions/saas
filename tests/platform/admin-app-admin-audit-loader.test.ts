/**
 * Admin-app `/admin/audit` loader tests (admin-app implementation
 * plan §11 — Phase 7 admin-org screens commit 7b-2-audit). Covers
 * the discriminated-union mapping of the `/admin/audit` loader
 * trio backed live by the Phase 7a-1
 * `queryAdminOrganizationScopedAuditEventsFromEnvironment` helper
 * (which pins the underlying audit query to
 * `platformModuleId.adminOrganization`).
 *
 *   - missing subscriber-journey session id → `shell`
 *   - `AdminGovernanceRequestContextNotFoundError` → `stale-session`
 *   - `AdminGovernanceRequestContextMalformedError` → `stale-session`
 *   - `AdminGovernanceReadAccessDeniedError` → `denied`
 *   - happy path → `ready` carrying the events array
 *   - upstream Error → `error` carrying upstream copy
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  loadAdminAuditRouteDataFromRequest,
  type AdminAuditDependencies,
} from "../../apps/admin-app/src/lib/admin-audit-route-data";
import { platformModuleId, platformScope } from "@comvestec/contracts";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/admin/audit", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleEvent = {
  eventId: "evt_admin_audit_test_1",
  timestamp: new Date(0).toISOString(),
  actorId: "usr_platform_operator",
  moduleId: platformModuleId.adminOrganization,
  tenantScope: platformScope.platform,
  tenantScopeId: "platform",
  action: "admin-organization.member.invited",
  target: "adm_member_test_1",
  correlationId: "corr_admin_audit_test_1",
} as const;

const succeedingDependencies = {
  queryAdminOrganizationScopedAuditEvents: () => Effect.succeed([sampleEvent]),
} as unknown as AdminAuditDependencies;

const failingQuery = (error: unknown): AdminAuditDependencies =>
  ({
    queryAdminOrganizationScopedAuditEvents: () => Effect.fail(error),
  }) as unknown as AdminAuditDependencies;

describe("admin-app /admin/audit loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditRouteDataFromRequest(
        buildRequest(undefined),
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the request context is not found", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        failingQuery({ _tag: "AdminGovernanceRequestContextNotFoundError" }),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns stale-session when the request context is malformed", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditRouteDataFromRequest(
        buildRequest("sess-malformed"),
        {},
        failingQuery({ _tag: "AdminGovernanceRequestContextMalformedError" }),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when admin-governance read access is denied", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        failingQuery({
          _tag: "AdminGovernanceReadAccessDeniedError",
          actorType: "individual",
        }),
      ),
    );
    expect(result.kind).toBe("denied");
    if (result.kind !== "denied") return;
    expect(result.reason).toContain("admin organization audit");
  });

  it("returns ready with the queried events", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventId).toBe(sampleEvent.eventId);
    expect(result.events[0]?.moduleId).toBe(platformModuleId.adminOrganization);
  });

  it("returns error with upstream copy when the query raises an Error", async () => {
    const result = await Effect.runPromise(
      loadAdminAuditRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        failingQuery(new Error("Admin-governance audit port down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Admin organization audit feed unavailable");
    expect(result.description).toBe("Admin-governance audit port down.");
  });
});
