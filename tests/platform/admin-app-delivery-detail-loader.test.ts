/**
 * Admin-app Delivery-detail loader tests (admin-app
 * implementation plan §8.12 + §11 — Phase 5 Support /
 * compliance / integrations operator screens commit 3).
 * Covers the discriminated-union mapping of the
 * `/r/delivery/$deliveryId` loader trio backed live by
 * `getOperatorWebhookDeliveryFromEnvironment` (returns an
 * `Option`) through `resolveTrustedRequestContextFromSessionId`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `OperatorWebhookDeliveryUnauthorized` → `denied`
 *   - `OperatorWebhookDeliveryMissingActorIdentity` → `stale-session`
 *   - `Option.none` → `error` with the not-found copy
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the delivery + scope echo
 *
 * Mirrors `tests/platform/admin-app-retention-list-loader.test.ts`
 * and `tests/platform/admin-app-legal-hold-detail-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import {
  operatorWebhookDeliveryStatus,
  platformScope,
} from "@comvestec/contracts";
import {
  loadAdminDeliveryDetailRouteDataFromRequest,
  type AdminDeliveryDetailDependencies,
  type AdminDeliveryDetailInput,
} from "../../apps/admin-app/src/lib/delivery-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleDelivery = {
  id: "dlv_demo_01",
  subscriptionId: "sub_demo_01",
  targetTenant: {
    scope: platformScope.organization,
    scopeId: "org_demo",
  },
  eventType: "billing.subscription.updated",
  requestUrl: "https://hooks.example.com/demo/1",
  requestMethod: "POST" as const,
  requestBody: '{"event":"demo"}',
  payloadHash: "a".repeat(64),
  signature: "b".repeat(64),
  signatureTimestamp: new Date(0).toISOString(),
  status: operatorWebhookDeliveryStatus.failed,
  attemptCount: 3,
  enqueuedAt: new Date(0).toISOString(),
  lastAttemptAt: new Date(0).toISOString(),
  lastResponseStatus: 503,
  lastErrorMessage: "Upstream 503",
  correlationId: "cor_demo_01",
};

const baseInput: AdminDeliveryDetailInput = {
  deliveryId: "dlv_demo_01",
  scope: platformScope.organization,
  scopeId: "org_demo",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getOperatorWebhookDelivery: () => Effect.succeed(Option.some(sampleDelivery)),
} as unknown as AdminDeliveryDetailDependencies;

const noneDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getOperatorWebhookDelivery: () => Effect.succeed(Option.none()),
} as unknown as AdminDeliveryDetailDependencies;

const failingResolveContext = (tag: string): AdminDeliveryDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getOperatorWebhookDelivery: () =>
      Effect.succeed(Option.some(sampleDelivery)),
  }) as unknown as AdminDeliveryDetailDependencies;

const failingDelivery = (tag: string): AdminDeliveryDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getOperatorWebhookDelivery: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminDeliveryDetailDependencies;

const throwingDependencies = (
  error: unknown,
): AdminDeliveryDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getOperatorWebhookDelivery: () => Effect.fail(error),
  }) as unknown as AdminDeliveryDetailDependencies;

describe("admin-app delivery-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminDeliveryDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the delivery when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminDeliveryDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.delivery.id).toBe("dlv_demo_01");
    expect(result.scope).toBe(platformScope.organization);
    expect(result.scopeId).toBe("org_demo");
  });

  it("returns not-found error when the delivery option is none", async () => {
    const result = await Effect.runPromise(
      loadAdminDeliveryDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        noneDependencies,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Delivery not found");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminDeliveryDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the delivery helper raises Unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminDeliveryDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingDelivery("OperatorWebhookDeliveryUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the delivery helper raises MissingActorIdentity", async () => {
    const result = await Effect.runPromise(
      loadAdminDeliveryDetailRouteDataFromRequest(
        buildRequest("sess-unauth"),
        {},
        baseInput,
        failingDelivery("OperatorWebhookDeliveryMissingActorIdentity"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the delivery helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminDeliveryDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Upstream delivery adapter down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Delivery detail unavailable");
    expect(result.description).toBe("Upstream delivery adapter down.");
  });
});
