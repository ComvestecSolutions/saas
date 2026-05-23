/**
 * Admin-app `/admin/tokens` loader tests (admin-app implementation
 * plan §11 — Phase 7 admin-org screens commit 7b-2-tokens).
 * Covers the discriminated-union mapping of the `/admin/tokens`
 * loader trio backed live by the Phase 7a-2b-iii helper
 * `listAdminOperatorTestTokensFromEnvironment` composed with
 * `resolveTrustedRequestContextFromSessionId`.
 *
 *   - missing subscriber-journey session id → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` from the
 *     context resolver → `stale-session`
 *   - `AdminOperatorTestTokensAccessDenied` from the platform
 *     service → `denied` with operator-facing copy
 *   - `AdminOperatorTestTokensMissingActor` → `stale-session`
 *   - upstream list helper Error → `error` with upstream copy
 *   - happy path → `ready` with totals + tokens + preserved
 *     filter
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { adminOperatorTestTokenListStatusFilter } from "@comvestec/contracts";
import {
  loadAdminTokensRouteDataFromRequest,
  type AdminTokensDependencies,
  type AdminTokensInput,
} from "../../apps/admin-app/src/lib/admin-tokens-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/admin/tokens", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseInput: AdminTokensInput = {
  filter: { status: adminOperatorTestTokenListStatusFilter.active },
};

const trustedContext = {
  actorId: "usr_admin_owner",
  actorType: "admin-owner",
} as const;

const sampleResult = {
  tokens: [
    {
      id: "aot_1",
      tokenPrefix: "aott_a1b2c3d4",
      label: "QA harness",
      issuedBy: "usr_admin_owner",
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(60_000).toISOString(),
    },
  ],
  totals: { active: 1, expiringSoon: 0, revoked: 0 },
} as const;

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(trustedContext),
  listAdminOperatorTestTokens: () => Effect.succeed(sampleResult),
} as unknown as AdminTokensDependencies;

const failingContext = (tag: string): AdminTokensDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listAdminOperatorTestTokens: () => Effect.succeed(sampleResult),
  }) as unknown as AdminTokensDependencies;

const failingList = (error: unknown): AdminTokensDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(trustedContext),
    listAdminOperatorTestTokens: () => Effect.fail(error),
  }) as unknown as AdminTokensDependencies;

describe("admin-app /admin/tokens loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminTokensRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the identity session context is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminTokensRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the platform service rejects a non-admin-owner actor", async () => {
    const result = await Effect.runPromise(
      loadAdminTokensRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingList({
          _tag: "AdminOperatorTestTokensAccessDenied",
          reason: "non-admin-owner",
          operation: "list",
        } as const),
      ),
    );
    expect(result.kind).toBe("denied");
    if (result.kind !== "denied") return;
    expect(result.reason).toContain("admin-owner");
  });

  it("returns stale-session when the platform service reports a missing actor", async () => {
    const result = await Effect.runPromise(
      loadAdminTokensRouteDataFromRequest(
        buildRequest("sess-no-actor"),
        {},
        baseInput,
        failingList({
          _tag: "AdminOperatorTestTokensMissingActor",
          operation: "list",
        } as const),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error with upstream copy when the list helper raises an Error", async () => {
    const result = await Effect.runPromise(
      loadAdminTokensRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        failingList(new Error("Admin-operator-test-tokens port down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Admin operator test tokens unavailable");
    expect(result.description).toBe("Admin-operator-test-tokens port down.");
  });

  it("returns ready with the totals + tokens and preserves the filter", async () => {
    const result = await Effect.runPromise(
      loadAdminTokensRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.result.totals.active).toBe(1);
    expect(result.result.tokens).toHaveLength(1);
    expect(result.result.tokens[0]?.tokenPrefix).toBe("aott_a1b2c3d4");
    expect(result.filter?.status).toBe(
      adminOperatorTestTokenListStatusFilter.active,
    );
  });
});
