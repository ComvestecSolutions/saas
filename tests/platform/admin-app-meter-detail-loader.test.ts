/**
 * Admin-app Meter-detail loader tests (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 1).
 * Covers the discriminated-union mapping of the
 * `/desk/meter/$meterId` loader trio backed live by
 * `getOpenMeterMeterBySlugFromEnvironment` +
 * `getOpenMeterUsageQueryFromEnvironment`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `OpenMeterMeterReadUnauthorized` → `denied`
 *   - boundary error → `error`
 *   - happy path without window → `ready` with `usage: null`
 *   - happy path with window → `ready` carrying the usage query
 *   - missing meter → `error`
 *
 * Mirrors `tests/platform/admin-app-billing-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { platformScope, type RequestContext } from "@comvestec/contracts";
import {
  loadAdminMeterDetailRouteDataFromRequest,
  type AdminMeterDetailDependencies,
  type AdminMeterDetailInput,
} from "../../apps/admin-app/src/lib/meter-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const fakeRequestContext = {
  actorType: "platform-operator",
  actorId: "usr_platform_operator_1",
  scope: "platform",
  scopeId: "platform",
} as unknown as RequestContext;

const sampleMeter = {
  summary: {
    meterSlug: "events.fixture",
    displayName: "Fixture events",
    aggregation: "SUM" as const,
    eventType: "events.fixture",
    createdAt: new Date(0).toISOString(),
  },
  isFresh: true,
};

const sampleUsage = {
  result: {
    id: "usage_meter_fixture",
    tenant: { scope: platformScope.organization, scopeId: "org_demo" },
    subject: "sub_1",
    meterSlug: "events.fixture",
    window: {
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-08T00:00:00.000Z",
    },
    granularity: "DAY" as const,
    aggregated: [
      { windowStart: "2026-05-01T00:00:00.000Z", value: 10 },
      { windowStart: "2026-05-02T00:00:00.000Z", value: 20 },
    ],
    computedAt: new Date(0).toISOString(),
    correlationId: "corr_meter",
  },
  isFresh: true,
};

const baseInput: AdminMeterDetailInput = {
  meterSlug: "events.fixture",
  tenant: { scope: platformScope.organization, scopeId: "org_demo" },
};

const inputWithWindow: AdminMeterDetailInput = {
  ...baseInput,
  subject: "sub_1",
  granularity: "DAY",
  window: {
    from: "2026-05-01T00:00:00.000Z",
    to: "2026-05-08T00:00:00.000Z",
  },
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
  getOpenMeterMeterBySlug: () => Effect.succeed(Option.some(sampleMeter)),
  getOpenMeterUsageQuery: () => Effect.succeed(Option.some(sampleUsage)),
} as unknown as AdminMeterDetailDependencies;

const meterMissingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
  getOpenMeterMeterBySlug: () => Effect.succeed(Option.none()),
  getOpenMeterUsageQuery: () => Effect.succeed(Option.some(sampleUsage)),
} as unknown as AdminMeterDetailDependencies;

const failingResolveContext = (tag: string): AdminMeterDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getOpenMeterMeterBySlug: () => Effect.succeed(Option.some(sampleMeter)),
    getOpenMeterUsageQuery: () => Effect.succeed(Option.some(sampleUsage)),
  }) as unknown as AdminMeterDetailDependencies;

const failingMeter = (tag: string): AdminMeterDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
    getOpenMeterMeterBySlug: () => Effect.fail({ _tag: tag } as const),
    getOpenMeterUsageQuery: () => Effect.succeed(Option.some(sampleUsage)),
  }) as unknown as AdminMeterDetailDependencies;

const throwingDependencies = (error: unknown): AdminMeterDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
    getOpenMeterMeterBySlug: () => Effect.fail(error),
    getOpenMeterUsageQuery: () => Effect.fail(error),
  }) as unknown as AdminMeterDetailDependencies;

describe("admin-app meter-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminMeterDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with usage:null when no window is supplied", async () => {
    const result = await Effect.runPromise(
      loadAdminMeterDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.meter.summary.meterSlug).toBe("events.fixture");
    expect(result.usage).toBeNull();
  });

  it("returns ready with the usage query when a window is supplied", async () => {
    const result = await Effect.runPromise(
      loadAdminMeterDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        inputWithWindow,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.usage).not.toBeNull();
    expect(result.usage?.result.aggregated).toHaveLength(2);
  });

  it("returns error when the meter is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminMeterDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        meterMissingDependencies,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Meter not found");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminMeterDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the OpenMeter meter helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminMeterDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingMeter("OpenMeterMeterReadUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when the platform helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminMeterDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(
          new Error("Upstream OpenMeter usage query failed."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Meter detail unavailable");
    expect(result.description).toBe("Upstream OpenMeter usage query failed.");
  });
});
