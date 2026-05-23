/**
 * Admin-app Legal-hold-detail loader tests (admin-app
 * implementation plan §8.11 + §11 — Phase 5 Support /
 * compliance / integrations operator screens commit 2). Covers
 * the discriminated-union mapping of the
 * `/r/legal-hold/$holdId` loader trio:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `RetentionLegalHoldAccessDeniedError` → `denied`
 *   - empty list / no match → `error` ("Legal hold not found")
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the matched hold compliance view
 *
 * The loader filters the by-session list result for the
 * requested hold id under the documented escape hatch (no
 * dedicated by-id retention helper is yet exported from
 * `packages/platform/src/services/apps/admin-retention-actions.ts`).
 * Tracked under the Admin app row's Phase 5 follow-ups.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  platformScope,
  retentionDataType,
  retentionLegalHoldStatus,
} from "@comvestec/contracts";
import {
  loadAdminLegalHoldDetailRouteDataFromRequest,
  type AdminLegalHoldDetailDependencies,
  type AdminLegalHoldDetailInput,
} from "../../apps/admin-app/src/lib/legal-hold-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleHold = {
  legalHoldId: "hold_demo_01",
  dataType: retentionDataType.fileObject,
  targetId: "target_demo_01",
  status: retentionLegalHoldStatus.active,
  placedAt: new Date(0).toISOString(),
  evidence: "Ticketed legal hold evidence.",
  legalHoldActive: true,
};

const baseInput: AdminLegalHoldDetailInput = {
  holdId: "hold_demo_01",
  scope: platformScope.organization,
  scopeId: "org_demo",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listRetentionLegalHolds: () => Effect.succeed([sampleHold]),
} as unknown as AdminLegalHoldDetailDependencies;

const noMatchDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listRetentionLegalHolds: () => Effect.succeed([]),
} as unknown as AdminLegalHoldDetailDependencies;

const failingResolveContext = (tag: string): AdminLegalHoldDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listRetentionLegalHolds: () => Effect.succeed([sampleHold]),
  }) as unknown as AdminLegalHoldDetailDependencies;

const failingRetention = (tag: string): AdminLegalHoldDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listRetentionLegalHolds: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminLegalHoldDetailDependencies;

const throwingDependencies = (
  error: unknown,
): AdminLegalHoldDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listRetentionLegalHolds: () => Effect.fail(error),
  }) as unknown as AdminLegalHoldDetailDependencies;

describe("admin-app legal-hold-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminLegalHoldDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the matched hold when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminLegalHoldDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.hold.legalHoldId).toBe("hold_demo_01");
    expect(result.scope).toBe(platformScope.organization);
    expect(result.scopeId).toBe("org_demo");
  });

  it("returns error with not-found copy when the hold id is absent from the list", async () => {
    const result = await Effect.runPromise(
      loadAdminLegalHoldDetailRouteDataFromRequest(
        buildRequest("sess-missing"),
        {},
        baseInput,
        noMatchDependencies,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Legal hold not found");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminLegalHoldDetailRouteDataFromRequest(
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
      loadAdminLegalHoldDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingRetention("RetentionLegalHoldAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when the retention helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminLegalHoldDetailRouteDataFromRequest(
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
    expect(result.title).toBe("Legal hold detail unavailable");
    expect(result.description).toBe("Upstream retention adapter unreachable.");
  });
});
