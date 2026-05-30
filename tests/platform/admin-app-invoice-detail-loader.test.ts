/**
 * Admin-app Invoice-detail loader tests (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 1).
 * Covers the discriminated-union mapping of the
 * `/desk/invoice/$invoiceId` loader trio backed live by
 * `getPolarCustomerByIdFromEnvironment`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `PolarCustomerReadUnauthorized` → `denied`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the customer summary
 *   - missing customer → `error`
 *
 * Mirrors `tests/platform/admin-app-billing-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { platformScope, type RequestContext } from "@comvestec/contracts";
import {
  loadAdminInvoiceDetailRouteDataFromRequest,
  type AdminInvoiceDetailDependencies,
  type AdminInvoiceDetailInput,
} from "../../apps/admin-app/src/lib/invoice-detail-route-data";

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

const sampleCustomer = {
  summary: {
    customerId: "cust_polar_1",
    externalId: "org_demo",
    email: "billing@fixture.local",
    name: "Fixture Customer",
    createdAt: new Date(0).toISOString(),
    totalSpendCents: 1_000_00,
    subscriptionCount: 1,
  },
  isFresh: true,
};

const baseInput: AdminInvoiceDetailInput = {
  invoiceId: "inv_demo_01",
  tenant: { scope: platformScope.organization, scopeId: "org_demo" },
  customerId: "cust_polar_1",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
  getPolarCustomerById: () => Effect.succeed(Option.some(sampleCustomer)),
} as unknown as AdminInvoiceDetailDependencies;

const customerMissingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
  getPolarCustomerById: () => Effect.succeed(Option.none()),
} as unknown as AdminInvoiceDetailDependencies;

const failingResolveContext = (tag: string): AdminInvoiceDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getPolarCustomerById: () => Effect.succeed(Option.some(sampleCustomer)),
  }) as unknown as AdminInvoiceDetailDependencies;

const failingCustomer = (tag: string): AdminInvoiceDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
    getPolarCustomerById: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminInvoiceDetailDependencies;

const throwingDependencies = (error: unknown): AdminInvoiceDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(fakeRequestContext),
    getPolarCustomerById: () => Effect.fail(error),
  }) as unknown as AdminInvoiceDetailDependencies;

describe("admin-app invoice-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminInvoiceDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the customer summary when the helper resolves Some", async () => {
    const result = await Effect.runPromise(
      loadAdminInvoiceDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.invoiceId).toBe("inv_demo_01");
    expect(result.customer.summary.customerId).toBe("cust_polar_1");
  });

  it("returns error when the customer is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminInvoiceDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        customerMissingDependencies,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Invoice customer not found");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminInvoiceDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the Polar customer helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminInvoiceDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingCustomer("PolarCustomerReadUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when the platform helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminInvoiceDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(
          new Error("Upstream Polar customer endpoint timed out."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Invoice detail unavailable");
    expect(result.description).toBe(
      "Upstream Polar customer endpoint timed out.",
    );
  });
});
