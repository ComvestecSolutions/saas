/**
 * Admin-app Retention-list loader tests (admin-app
 * implementation plan §8.11 + §11 — Phase 5 Support /
 * compliance / integrations operator screens commit 2). Covers
 * the discriminated-union mapping of the `/desk/retention` loader
 * trio backed live by the Phase 1 by-session helpers:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `RetentionLegalHoldAccessDeniedError` → `denied`
 *   - `RetentionLegalHoldUnauthenticatedActorError` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying policies + holds (+ stub
 *     schedule entries until the by-session schedule helper
 *     lands; tracked under Admin app row Phase 5 follow-ups)
 *   - empty scope → `ready` with empty arrays (mirrors
 *     `/desk/billing` empty-tenants behavior)
 *
 * Mirrors `tests/platform/admin-app-support-cases-loader.test.ts`
 * and `tests/platform/admin-app-branding-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  platformScope,
  retentionDataType,
  retentionLegalHoldStatus,
} from "@comvestec/contracts";
import {
  loadAdminRetentionListRouteDataFromRequest,
  type AdminRetentionListDependencies,
  type AdminRetentionListInput,
} from "../../apps/admin-app/src/lib/retention-list-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const samplePolicy = {
  policyId: "policy_demo_01",
  dataType: retentionDataType.fileObject,
  retentionDays: 30,
  legalHoldActive: false,
};

const sampleHold = {
  legalHoldId: "hold_demo_01",
  dataType: retentionDataType.fileObject,
  targetId: "target_demo_01",
  status: retentionLegalHoldStatus.active,
  placedAt: new Date(0).toISOString(),
  evidence: "Ticketed legal hold evidence.",
  legalHoldActive: true,
};

const baseInput: AdminRetentionListInput = {
  scope: platformScope.organization,
  scopeId: "org_demo",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listRetentionPolicies: () => Effect.succeed([samplePolicy]),
  listRetentionLegalHolds: () => Effect.succeed([sampleHold]),
} as unknown as AdminRetentionListDependencies;

const failingResolveContext = (tag: string): AdminRetentionListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listRetentionPolicies: () => Effect.succeed([samplePolicy]),
    listRetentionLegalHolds: () => Effect.succeed([sampleHold]),
  }) as unknown as AdminRetentionListDependencies;

const failingRetention = (tag: string): AdminRetentionListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listRetentionPolicies: () => Effect.fail({ _tag: tag } as const),
    listRetentionLegalHolds: () => Effect.succeed([sampleHold]),
  }) as unknown as AdminRetentionListDependencies;

const throwingDependencies = (error: unknown): AdminRetentionListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listRetentionPolicies: () => Effect.fail(error),
    listRetentionLegalHolds: () => Effect.succeed([sampleHold]),
  }) as unknown as AdminRetentionListDependencies;

describe("admin-app retention-list loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with policies and holds when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.policies).toHaveLength(1);
    expect(result.holds).toHaveLength(1);
    expect(result.holds[0]?.legalHoldId).toBe("hold_demo_01");
    expect(result.scheduleEntries).toEqual([]);
  });

  it("returns ready with empty arrays when no scope is selected", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.scope).toBeNull();
    expect(result.scopeId).toBeNull();
    expect(result.policies).toEqual([]);
    expect(result.holds).toEqual([]);
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the retention helper raises access-denied", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingRetention("RetentionLegalHoldAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the retention helper raises unauthenticated-actor", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest("sess-unauth"),
        {},
        baseInput,
        failingRetention("RetentionLegalHoldUnauthenticatedActorError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the retention helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(
          new Error("Upstream retention adapter unreachable."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Retention posture unavailable");
    expect(result.description).toBe("Upstream retention adapter unreachable.");
  });

  it("preserves selectedHoldId in the ready payload", async () => {
    const result = await Effect.runPromise(
      loadAdminRetentionListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { ...baseInput, selectedHoldId: "hold_demo_01" },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.selectedHoldId).toBe("hold_demo_01");
  });
});
