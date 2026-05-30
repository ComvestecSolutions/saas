/**
 * Admin-app Webhook-list loader tests (admin-app
 * implementation plan §8.12 + §11 — Phase 5 Support /
 * compliance / integrations operator screens commit 3).
 * Covers the discriminated-union mapping of the `/desk/webhook`
 * loader trio backed live by `listWebhookSubscriptionsFromSessionId`
 * composed with `listOperatorWebhookDeliveriesFromEnvironment`
 * through `resolveTrustedRequestContextFromSessionId`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `WebhooksApiAccessAccessDeniedError` → `denied`
 *   - `WebhooksApiAccessUnauthenticatedActorError` → `stale-session`
 *   - `OperatorWebhookDeliveryUnauthorized` → `denied`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying subscriptions + deliveries
 *   - empty scope → `ready` with empty arrays (mirrors
 *     `/desk/retention` empty-scope behavior)
 *
 * Mirrors `tests/platform/admin-app-retention-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  operatorWebhookDeliveryStatus,
  platformScope,
  webhookSubscriptionStatus,
} from "@comvestec/contracts";
import {
  loadAdminWebhookListRouteDataFromRequest,
  type AdminWebhookListDependencies,
  type AdminWebhookListInput,
} from "../../apps/admin-app/src/lib/webhook-list-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleSubscription = {
  subscriptionId: "sub_demo_01",
  url: "https://hooks.example.com/demo/1",
  events: ["billing.subscription.updated"],
  status: webhookSubscriptionStatus.active,
  lastDeliveryAt: new Date(0).toISOString(),
};

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
  status: operatorWebhookDeliveryStatus.delivered,
  attemptCount: 1,
  enqueuedAt: new Date(0).toISOString(),
  correlationId: "cor_demo_01",
};

const baseInput: AdminWebhookListInput = {
  scope: platformScope.organization,
  scopeId: "org_demo",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listWebhookSubscriptions: () => Effect.succeed([sampleSubscription]),
  listOperatorWebhookDeliveries: () => Effect.succeed([sampleDelivery]),
} as unknown as AdminWebhookListDependencies;

const failingResolveContext = (tag: string): AdminWebhookListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listWebhookSubscriptions: () => Effect.succeed([sampleSubscription]),
    listOperatorWebhookDeliveries: () => Effect.succeed([sampleDelivery]),
  }) as unknown as AdminWebhookListDependencies;

const failingSubscriptions = (tag: string): AdminWebhookListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listWebhookSubscriptions: () => Effect.fail({ _tag: tag } as const),
    listOperatorWebhookDeliveries: () => Effect.succeed([sampleDelivery]),
  }) as unknown as AdminWebhookListDependencies;

const failingDeliveries = (tag: string): AdminWebhookListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listWebhookSubscriptions: () => Effect.succeed([sampleSubscription]),
    listOperatorWebhookDeliveries: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminWebhookListDependencies;

const throwingDependencies = (error: unknown): AdminWebhookListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listWebhookSubscriptions: () => Effect.fail(error),
    listOperatorWebhookDeliveries: () => Effect.succeed([sampleDelivery]),
  }) as unknown as AdminWebhookListDependencies;

describe("admin-app webhook-list loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with subscriptions and deliveries when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.subscriptions).toHaveLength(1);
    expect(result.deliveries).toHaveLength(1);
    expect(result.subscriptions[0]?.subscriptionId).toBe("sub_demo_01");
    expect(result.deliveries[0]?.id).toBe("dlv_demo_01");
  });

  it("returns ready with empty arrays when no scope is selected", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
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
    expect(result.subscriptions).toEqual([]);
    expect(result.deliveries).toEqual([]);
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when subscriptions raises access-denied", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingSubscriptions("WebhooksApiAccessAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when subscriptions raises unauthenticated-actor", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
        buildRequest("sess-unauth"),
        {},
        baseInput,
        failingSubscriptions("WebhooksApiAccessUnauthenticatedActorError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when deliveries raises OperatorWebhookDeliveryUnauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
        buildRequest("sess-denied-deliveries"),
        {},
        baseInput,
        failingDeliveries("OperatorWebhookDeliveryUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when subscriptions raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminWebhookListRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(
          new Error("Upstream webhook adapter unreachable."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Webhook posture unavailable");
    expect(result.description).toBe("Upstream webhook adapter unreachable.");
  });
});
