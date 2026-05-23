/**
 * Admin-app Billing-list loader tests (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 1).
 * Covers the discriminated-union mapping of the `/r/billing`
 * loader trio backed live by `getPolarRevenueProjectionFromEnvironment`
 * and `listPolarCustomersByExternalIdFromEnvironment`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `PolarRevenueProjectionUnauthorized` → `denied`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying rows + aggregated posture
 *
 * Mirrors `tests/platform/admin-app-governance-config-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { platformScope, type RequestContext } from "@comvestec/contracts";
import {
  loadAdminBillingListRouteDataFromRequest,
  type AdminBillingListDependencies,
  type AdminBillingListInput,
} from "../../apps/admin-app/src/lib/billing-list-route-data";

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

const sampleProjection = {
  snapshot: {
    id: "proj_org_demo",
    tenant: { scope: platformScope.organization, scopeId: "org_demo" },
    billingPeriodStart: new Date(0).toISOString(),
    billingPeriodEnd: new Date(0).toISOString(),
    subscriptionMrr: { currency: "USD", amountMinorUnits: 250_00 },
    churnRate: 0,
    expansion: { currency: "USD", amountMinorUnits: 0 },
    contraction: { currency: "USD", amountMinorUnits: 0 },
    projectedNextPeriodRevenue: { currency: "USD", amountMinorUnits: 250_00 },
    activeSubscriptionCount: 4,
    sourcePolarAccountId: "acct_demo",
    computedAt: new Date(0).toISOString(),
    correlationId: "corr_demo",
  },
  isFresh: true,
};

const sampleCustomers = {
  summaries: [
    {
      customerId: "cust_1",
      email: "ops@fixture.local",
      createdAt: new Date(0).toISOString(),
      totalSpendCents: 0,
      subscriptionCount: 1,
    },
  ],
  isFresh: true,
};

const baseInput: AdminBillingListInput = {
  tenantTargets: [{ scope: platformScope.organization, scopeId: "org_demo" }],
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
  getPolarRevenueProjection: () =>
    Effect.succeed(Option.some(sampleProjection)),
  listPolarCustomersByExternalId: () => Effect.succeed(sampleCustomers),
} as unknown as AdminBillingListDependencies;

const failingResolveContext = (tag: string): AdminBillingListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getPolarRevenueProjection: () =>
      Effect.succeed(Option.some(sampleProjection)),
    listPolarCustomersByExternalId: () => Effect.succeed(sampleCustomers),
  }) as unknown as AdminBillingListDependencies;

const failingProjection = (tag: string): AdminBillingListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
    getPolarRevenueProjection: () => Effect.fail({ _tag: tag } as const),
    listPolarCustomersByExternalId: () => Effect.succeed(sampleCustomers),
  }) as unknown as AdminBillingListDependencies;

const throwingDependencies = (error: unknown): AdminBillingListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
    getPolarRevenueProjection: () => Effect.fail(error),
    listPolarCustomersByExternalId: () => Effect.fail(error),
  }) as unknown as AdminBillingListDependencies;

describe("admin-app billing-list loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminBillingListRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with per-tenant rows + aggregated posture when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminBillingListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.rows).toHaveLength(1);
    expect(result.posture.tenantCount).toBe(1);
    expect(result.posture.aggregateMrrMinorUnits).toBe(250_00);
    expect(result.posture.aggregateArrMinorUnits).toBe(250_00 * 12);
    expect(result.posture.currency).toBe("USD");
    expect(result.rows[0]?.customerCount).toBe(1);
    expect(result.rows[0]?.displayName).toBe("Acme Co.");
  });

  it("returns ready with empty rows when no tenants are supplied", async () => {
    const result = await Effect.runPromise(
      loadAdminBillingListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { tenantTargets: [] },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.rows).toHaveLength(0);
    expect(result.posture.tenantCount).toBe(0);
    expect(result.posture.currency).toBeNull();
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminBillingListRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the Polar revenue projection helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminBillingListRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingProjection("PolarRevenueProjectionUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when the platform helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminBillingListRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Upstream Polar adapter unreachable.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Billing posture unavailable");
    expect(result.description).toBe("Upstream Polar adapter unreachable.");
  });

  it("preserves selectedTenantId in the ready payload", async () => {
    const result = await Effect.runPromise(
      loadAdminBillingListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { ...baseInput, selectedTenantId: "org_demo" },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.selectedTenantId).toBe("org_demo");
  });
});
