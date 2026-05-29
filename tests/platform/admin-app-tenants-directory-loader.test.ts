/**
 * Admin-app Tenants directory loader tests (admin-app
 * implementation plan §9 — Phase 2 Desk Core commit 3
 * cutover). Covers the discriminated-union mapping of the
 * `/r/tenants` loader trio:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the projected rows
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  adminTenantDirectoryStatus,
  platformScope,
} from "@comvestec/contracts";
import {
  loadAdminTenantsDirectoryRouteDataFromRequest,
  type AdminTenantsDirectoryRow,
} from "../../apps/admin-app/src/lib/tenants-directory-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const fixtureRows: readonly AdminTenantsDirectoryRow[] = [
  {
    key: "tenant-alpha",
    displayName: "Acme Co.",
    target: {
      scope: platformScope.organization,
      scopeId: "org_demo",
    },
    status: adminTenantDirectoryStatus.active,
    approvalsOpen: 0,
  },
  {
    key: "tenant-beta",
    displayName: "Globex",
    target: {
      scope: platformScope.enterprise,
      scopeId: "ent_atlas",
    },
    status: adminTenantDirectoryStatus.blocked,
    approvalsOpen: 1,
  },
];

const loadRows = (_sessionId: string) => Effect.succeed(fixtureRows);

describe("admin-app tenants-directory loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest(undefined),
        {},
        () => Effect.die(new Error("row source should not run")),
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the identity-session lookup misses", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        (sessionId: string) =>
          Effect.fail({
            _tag: "IdentitySessionRequestContextNotFoundError",
            sessionId,
          } as const),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the tenant directory backend rejects the session", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        () =>
          Effect.fail({
            _tag: "AdminTenantManagementAccessDeniedError",
            reason:
              "Tenant directory currently requires a platform-operator session.",
            auditRequired: false,
          } as const),
      ),
    );
    expect(result.kind).toBe("denied");
    if (result.kind !== "denied") return;
    expect(result.reason).toBe(
      "Tenant directory currently requires a platform-operator session.",
    );
  });

  it("returns error when the tenant directory backend reports an unavailable aggregate", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest("sess-unavailable"),
        {},
        () =>
          Effect.fail({
            _tag: "AdminTenantManagementDirectoryUnavailableError",
            reason:
              "Tenant directory aggregate timed out while loading persisted sources.",
          } as const),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Tenant directory unavailable");
    expect(result.description).toBe(
      "Tenant directory aggregate timed out while loading persisted sources.",
    );
  });

  it("returns error when the row source dies with a typed Error", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest("sess-error"),
        {},
        () =>
          Effect.fail(new Error("Upstream directory aggregate unavailable.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Tenant directory unavailable");
    expect(result.description).toBe(
      "Upstream directory aggregate unavailable.",
    );
  });

  it("returns ready with the projected rows on the happy path", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest("sess-ready"),
        {},
        loadRows,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.displayName).toBe("Acme Co.");
    expect(result.rows[1]?.status).toBe(adminTenantDirectoryStatus.blocked);
  });
});
