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
 *
 * Escape-hatch note: no Phase-1 platform helper currently
 * exposes a tenant-directory aggregate; the loader still ships
 * the typed fixture as its row source pending the platform
 * follow-up tracked under the Admin app row of the tracker.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  actorType,
  platformScope,
  type RequestContext,
} from "@comvestec/contracts";
import {
  loadAdminTenantsDirectoryRouteDataFromRequest,
  type AdminTenantsDirectoryRow,
} from "../../apps/admin-app/src/lib/tenants-directory-route-data";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess-admin-tenants-directory-loader",
  correlationId: "corr-admin-tenants-directory-loader",
  reason: "tenants-directory loader test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const resolveTrustedRequestContext = (
  _environment: unknown,
  sessionId: string,
) => Effect.succeed({ ...trustedRequestContext, sessionId });

const fixtureRows: readonly AdminTenantsDirectoryRow[] = [
  {
    key: "tenant-alpha",
    displayName: "Acme Co.",
    target: {
      scope: platformScope.organization,
      scopeId: "org_demo",
    },
    environment: "production",
    status: "active",
    approvalsOpen: 0,
  },
  {
    key: "tenant-beta",
    displayName: "Globex",
    target: {
      scope: platformScope.enterprise,
      scopeId: "ent_atlas",
    },
    environment: "production",
    status: "active",
    approvalsOpen: 1,
  },
];

const loadRows = () => Effect.succeed(fixtureRows);

describe("admin-app tenants-directory loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest(undefined),
        {},
        resolveTrustedRequestContext,
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
        (_environment: unknown, sessionId: string) =>
          Effect.fail({
            _tag: "IdentitySessionRequestContextNotFoundError",
            sessionId,
          } as const),
        () => Effect.die(new Error("row source should not run")),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the row source dies with a typed Error", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantsDirectoryRouteDataFromRequest(
        buildRequest("sess-error"),
        {},
        resolveTrustedRequestContext,
        () =>
          Effect.fail(
            new Error(
              "Upstream directory aggregate unavailable.",
            ) as unknown as never,
          ),
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
        resolveTrustedRequestContext,
        loadRows,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.displayName).toBe("Acme Co.");
    expect(result.rows[1]?.environment).toBe("production");
  });
});
