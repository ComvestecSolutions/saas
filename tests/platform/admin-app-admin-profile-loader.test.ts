/**
 * Admin-app `/admin/profile` loader tests (admin-app implementation
 * plan §11 — Phase 7 admin-org screens commit 7b-1). Covers the
 * discriminated-union mapping of the `/admin/profile` loader trio
 * backed live by `getAdminOperatorProfileFromEnvironment`:
 *
 *   - missing subscriber-journey session id → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - tagged unauthorized error → `denied` via catchAll fallback
 *     mapped to `error` (loader has no explicit deny tag; covered
 *     by the `error` branch carrying upstream copy)
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the operator profile
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  loadAdminProfileRouteDataFromRequest,
  type AdminProfileDependencies,
} from "../../apps/admin-app/src/lib/admin-profile-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/admin/profile", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleProfile = {
  identity: {
    actorId: "usr_admin_owner",
    username: "owner",
    email: "owner@example.test",
    displayName: "Admin Owner",
    actorType: "admin-owner" as const,
    enabled: true,
  },
  sessionId: "sess-ok",
  capabilities: [],
};

const succeedingDependencies = {
  getAdminOperatorProfile: () => Effect.succeed(sampleProfile),
} as unknown as AdminProfileDependencies;

const failingProfile = (tag: string): AdminProfileDependencies =>
  ({
    getAdminOperatorProfile: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminProfileDependencies;

const throwingDependencies = (error: unknown): AdminProfileDependencies =>
  ({
    getAdminOperatorProfile: () => Effect.fail(error),
  }) as unknown as AdminProfileDependencies;

describe("admin-app /admin/profile loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminProfileRouteDataFromRequest(
        buildRequest(undefined),
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the operator profile", async () => {
    const result = await Effect.runPromise(
      loadAdminProfileRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.profile.identity.actorId).toBe("usr_admin_owner");
    expect(result.profile.sessionId).toBe("sess-ok");
  });

  it("returns stale-session when the identity session context is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminProfileRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        failingProfile("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error with upstream copy when the helper raises an Error", async () => {
    const result = await Effect.runPromise(
      loadAdminProfileRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        throwingDependencies(new Error("Identity port unavailable.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Operator profile unavailable");
    expect(result.description).toBe("Identity port unavailable.");
  });

  it("returns error with default copy when the helper raises an untagged value", async () => {
    const result = await Effect.runPromise(
      loadAdminProfileRouteDataFromRequest(
        buildRequest("sess-untagged"),
        {},
        throwingDependencies({ kind: "weird" }),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Operator profile unavailable");
    expect(result.description.length).toBeGreaterThan(0);
  });
});
