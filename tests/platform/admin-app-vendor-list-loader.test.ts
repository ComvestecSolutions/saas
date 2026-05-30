/**
 * Admin-app vendor-list loader tests (admin-app implementation
 * plan §8.15 + §11 — Phase 6 vendor + workflow operator
 * screens commit 6a). Covers the discriminated-union mapping
 * of the `/desk/vendors` loader trio backed live by
 * `getVendorHealthAggregateFromEnvironment` through
 * `resolveTrustedRequestContextFromSessionId`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `VendorHealthAggregatorUnauthorized` → `denied`
 *   - `VendorHealthAggregatorMissingActorIdentity` → `stale-session`
 *   - `VendorHealthAggregatorAllSourcesFailedError` → `error`
 *   - boundary `Error` → `error`
 *   - happy path → `ready` carrying the aggregate
 *
 * Mirrors `tests/platform/admin-app-webhook-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  platformAdapterServiceName,
  type VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import {
  loadAdminVendorListRouteDataFromRequest,
  type AdminVendorListDependencies,
} from "../../apps/admin-app/src/lib/vendor-list-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleAggregate: VendorHealthAggregateProjection = {
  entries: [
    {
      serviceName: platformAdapterServiceName.keycloak,
      status: "healthy",
      version: "26.0.0",
      latencyMs: 12,
      lastCheckedAt: new Date(0).toISOString(),
    },
  ],
  partialFailures: [],
  generatedAt: new Date(0).toISOString(),
  correlationId: "corr_loader_test",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getVendorHealthAggregate: () =>
    Effect.succeed({ aggregate: sampleAggregate, isFresh: true }),
} as unknown as AdminVendorListDependencies;

const failingResolveContext = (tag: string): AdminVendorListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getVendorHealthAggregate: () =>
      Effect.succeed({ aggregate: sampleAggregate, isFresh: true }),
  }) as unknown as AdminVendorListDependencies;

const failingAggregate = (tag: string): AdminVendorListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getVendorHealthAggregate: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminVendorListDependencies;

const throwingDependencies = (error: unknown): AdminVendorListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getVendorHealthAggregate: () => Effect.fail(error),
  }) as unknown as AdminVendorListDependencies;

describe("admin-app vendor-list loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorListRouteDataFromRequest(
        buildRequest(undefined),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready carrying the vendor-health aggregate", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.aggregate.entries.length).toBe(1);
    expect(result.aggregate.correlationId).toBe("corr_loader_test");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorListRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        {},
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the aggregator raises Unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorListRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        {},
        failingAggregate("VendorHealthAggregatorUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the aggregator raises MissingActorIdentity", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorListRouteDataFromRequest(
        buildRequest("sess-missing"),
        {},
        {},
        failingAggregate("VendorHealthAggregatorMissingActorIdentity"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when every upstream healthcheck source fails", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorListRouteDataFromRequest(
        buildRequest("sess-allfail"),
        {},
        {},
        failingAggregate("VendorHealthAggregatorAllSourcesFailedError"),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Vendor posture unavailable");
  });

  it("returns error with the boundary message when an untagged Error escapes", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorListRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        {},
        throwingDependencies(new Error("Upstream aggregator down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.description).toBe("Upstream aggregator down.");
  });
});
