/**
 * Admin-app vendor-detail loader tests (admin-app
 * implementation plan §8.15 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6a). Covers the discriminated-union
 * mapping of the `/desk/vendor/$service` loader trio backed live
 * by the SAME `getVendorHealthAggregateFromEnvironment` helper
 * through `resolveTrustedRequestContextFromSessionId`, narrowed
 * by `serviceName` under the documented list-then-filter
 * escape hatch.
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `VendorHealthAggregatorUnauthorized` → `denied`
 *   - aggregator success + matching entry → `ready` (with
 *     partial-failure attachment when one exists)
 *   - aggregator success + no matching entry → `error` (not
 *     found copy)
 *   - boundary `Error` → `error`
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  platformAdapterServiceName,
  type VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import {
  loadAdminVendorDetailRouteDataFromRequest,
  type AdminVendorDetailDependencies,
  type AdminVendorDetailInput,
} from "../../apps/admin-app/src/lib/vendor-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseInput: AdminVendorDetailInput = {
  serviceName: platformAdapterServiceName.keycloak,
};

const aggregateWithKeycloak: VendorHealthAggregateProjection = {
  entries: [
    {
      serviceName: platformAdapterServiceName.keycloak,
      status: "healthy",
      version: "26.0.0",
      latencyMs: 18,
      lastCheckedAt: new Date(0).toISOString(),
    },
  ],
  partialFailures: [],
  generatedAt: new Date(0).toISOString(),
  correlationId: "corr_detail_test",
};

const aggregateWithoutKeycloak: VendorHealthAggregateProjection = {
  entries: [],
  partialFailures: [],
  generatedAt: new Date(0).toISOString(),
  correlationId: "corr_detail_empty",
};

const aggregateWithPartialFailure: VendorHealthAggregateProjection = {
  entries: [
    {
      serviceName: platformAdapterServiceName.keycloak,
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: new Date(0).toISOString(),
      message: "Keycloak admin unreachable.",
    },
  ],
  partialFailures: [
    {
      serviceName: platformAdapterServiceName.keycloak,
      reason: "Keycloak admin unreachable.",
    },
  ],
  generatedAt: new Date(0).toISOString(),
  correlationId: "corr_detail_partial",
};

const succeedingDependencies = (
  aggregate: VendorHealthAggregateProjection,
): AdminVendorDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getVendorHealthAggregate: () =>
      Effect.succeed({ aggregate, isFresh: true }),
  }) as unknown as AdminVendorDetailDependencies;

const failingResolveContext = (tag: string): AdminVendorDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getVendorHealthAggregate: () =>
      Effect.succeed({ aggregate: aggregateWithKeycloak, isFresh: true }),
  }) as unknown as AdminVendorDetailDependencies;

const failingAggregate = (tag: string): AdminVendorDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getVendorHealthAggregate: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminVendorDetailDependencies;

const throwingDependencies = (error: unknown): AdminVendorDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getVendorHealthAggregate: () => Effect.fail(error),
  }) as unknown as AdminVendorDetailDependencies;

describe("admin-app vendor-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies(aggregateWithKeycloak),
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the matching aggregate entry", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies(aggregateWithKeycloak),
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.entry.serviceName).toBe(platformAdapterServiceName.keycloak);
    expect(result.correlationId).toBe("corr_detail_test");
    expect(result.partialFailure).toBeUndefined();
  });

  it("returns ready and attaches the matching partial failure when present", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies(aggregateWithPartialFailure),
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.partialFailure).toEqual({
      serviceName: platformAdapterServiceName.keycloak,
      reason: "Keycloak admin unreachable.",
    });
  });

  it("returns not-found error when the aggregate omits the requested service", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies(aggregateWithoutKeycloak),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Vendor not found");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the aggregator raises Unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingAggregate("VendorHealthAggregatorUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error with the boundary message when an untagged Error escapes", async () => {
    const result = await Effect.runPromise(
      loadAdminVendorDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Vendor aggregator boom.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.description).toBe("Vendor aggregator boom.");
  });
});
