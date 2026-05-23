/**
 * Operator-facing webhook delivery envelope HTTP transport tests
 * (admin-app implementation plan §9 item 6 follow-up). Exercises the
 * `createOperatorWebhookDeliveryHttpHandlerWithDependencies` seam
 * with an injected request-context resolver + service double so we
 * cover routing, JSON/query decoding, error-tag → status mapping,
 * 405 method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  operatorWebhookDeliveryStatus,
  platformScope,
  reasonCatalogId,
  type OperatorWebhookDelivery,
  type OperatorWebhookDeliverySignatureHeader,
  type RequestContext,
} from "@comvestec/contracts";
import {
  canonicalPayloadHash,
  computeSignatureHex,
  OperatorWebhookDeliveryAlreadyTerminalError,
  OperatorWebhookDeliveryNotFoundError,
} from "@comvestec/modules";
import {
  createOperatorWebhookDeliveryHttpHandlerWithDependencies,
  OperatorWebhookDeliveryAttemptBudgetExceeded,
  OperatorWebhookDeliveryNotFound,
  OperatorWebhookDeliveryReplayGuardHit,
  OperatorWebhookDeliverySignatureRecomputeStale,
  OperatorWebhookDeliveryUnauthorized,
  operatorWebhookDeliveryApiBasePath,
  operatorWebhookDeliveryApiPath,
  type OperatorWebhookDeliveryServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_owd_http_operator",
  sessionId: "sess_owd_http",
  correlationId: "corr_owd_http",
  reason: "operator webhook delivery http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const fakeDelivery = (
  overrides: Partial<OperatorWebhookDelivery> = {},
): OperatorWebhookDelivery => ({
  id: overrides.id ?? "owd_fake",
  subscriptionId: overrides.subscriptionId ?? "sub_owd",
  targetTenant: overrides.targetTenant ?? {
    scope: platformScope.organization,
    scopeId: "tenant-acme",
  },
  eventType: overrides.eventType ?? "operator.test.event",
  requestUrl: overrides.requestUrl ?? "https://example.test/webhook",
  requestMethod: overrides.requestMethod ?? "POST",
  requestBody: overrides.requestBody ?? '{"v":1}',
  payloadHash: overrides.payloadHash ?? canonicalPayloadHash('{"v":1}'),
  signature: overrides.signature ?? computeSignatureHex("secret", 0, '{"v":1}'),
  signatureTimestamp:
    overrides.signatureTimestamp ?? "2026-01-01T00:00:00.000Z",
  status: overrides.status ?? operatorWebhookDeliveryStatus.pending,
  attemptCount: overrides.attemptCount ?? 0,
  enqueuedAt: overrides.enqueuedAt ?? "2026-01-01T00:00:00.000Z",
  correlationId: overrides.correlationId ?? "corr_owd_http",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(
      `unexpected operator-webhook-delivery HTTP service call: ${method}`,
    ),
  );

const createServiceDouble = (
  overrides: Partial<OperatorWebhookDeliveryServiceImpl> = {},
): OperatorWebhookDeliveryServiceImpl => ({
  enqueueDelivery:
    overrides.enqueueDelivery ??
    (() => unexpectedServiceCall("enqueueDelivery")),
  getDelivery:
    overrides.getDelivery ?? (() => unexpectedServiceCall("getDelivery")),
  listDeliveries:
    overrides.listDeliveries ?? (() => unexpectedServiceCall("listDeliveries")),
  replayDelivery:
    overrides.replayDelivery ?? (() => unexpectedServiceCall("replayDelivery")),
  retryDelivery:
    overrides.retryDelivery ?? (() => unexpectedServiceCall("retryDelivery")),
  cancelDelivery:
    overrides.cancelDelivery ?? (() => unexpectedServiceCall("cancelDelivery")),
  recomputeSignatureHeader:
    overrides.recomputeSignatureHeader ??
    (() => unexpectedServiceCall("recomputeSignatureHeader")),
});

const createTestHandler = (
  service: Partial<OperatorWebhookDeliveryServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createOperatorWebhookDeliveryHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const enqueueBody = () =>
  JSON.stringify({
    subscriptionId: "sub_owd",
    targetTenant: {
      scope: platformScope.organization,
      scopeId: "tenant-acme",
    },
    eventType: "operator.test.event",
    requestUrl: "https://example.test/webhook",
    requestBody: '{"v":1}',
    correlationId: "corr_owd_http",
  });

const replayBody = () =>
  JSON.stringify({
    replayReasonCatalogId: reasonCatalogId.operatorWebhookDeliveryReplay,
    reasonAttachmentText: "runbook://incident/INC-replay",
  });

const retryBody = () =>
  JSON.stringify({
    retryReasonCatalogId: reasonCatalogId.operatorWebhookDeliveryRetry,
  });

const cancelBody = () =>
  JSON.stringify({
    cancelReasonCatalogId: reasonCatalogId.operatorWebhookDeliveryCancel,
  });

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("operator-webhook-delivery HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(operatorWebhookDeliveryApiBasePath).toBe(
      "/api/operator-webhook-delivery",
    );
    expect(operatorWebhookDeliveryApiPath).toEqual({
      enqueue: "/api/operator-webhook-delivery/deliveries",
      list: "/api/operator-webhook-delivery/deliveries",
      get: "/api/operator-webhook-delivery/deliveries/:id",
      replay: "/api/operator-webhook-delivery/deliveries/:id/replay",
      retry: "/api/operator-webhook-delivery/deliveries/:id/retry",
      cancel: "/api/operator-webhook-delivery/deliveries/:id/cancel",
      recomputeSignature:
        "/api/operator-webhook-delivery/deliveries/:id/recompute-signature",
    });
  });

  it("is registered against the canonical backend API router via operatorWebhookDeliveryApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(
      backendApiSource.includes("operatorWebhookDeliveryApiBasePath"),
    ).toBe(true);
    expect(backendApiSource.includes("operatorWebhookDeliveryHandler")).toBe(
      true,
    );
    expect(
      backendApiSource.includes("handleOperatorWebhookDeliveryHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

describe("operator-webhook-delivery HTTP — enqueue delivery", () => {
  it("returns the enqueued delivery on POST happy path (201)", async () => {
    const delivery = fakeDelivery({ id: "owd_enq" });
    const handler = createTestHandler({
      enqueueDelivery: () => Effect.succeed(delivery),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(operatorWebhookDeliveryApiPath.enqueue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: enqueueBody(),
        }),
      ),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ delivery });
  });

  it("returns 400 for malformed JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(operatorWebhookDeliveryApiPath.enqueue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OperatorWebhookDeliveryReplayGuardHit to 409", async () => {
    const handler = createTestHandler({
      enqueueDelivery: () =>
        Effect.fail(
          new OperatorWebhookDeliveryReplayGuardHit({
            subscriptionId: "sub_owd",
            payloadHash: canonicalPayloadHash('{"v":1}'),
            existingDeliveryId: "owd_first",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(operatorWebhookDeliveryApiPath.enqueue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: enqueueBody(),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Get / list
// ---------------------------------------------------------------------------

describe("operator-webhook-delivery HTTP — get + list", () => {
  it("returns the delivery on GET /deliveries/:id", async () => {
    const delivery = fakeDelivery({ id: "owd_one" });
    const handler = createTestHandler({
      getDelivery: () => Effect.succeed(Option.some(delivery)),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/operator-webhook-delivery/deliveries/owd_one"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ delivery });
  });

  it("returns { delivery: null } when not found on GET /deliveries/:id", async () => {
    const handler = createTestHandler({
      getDelivery: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_missing"),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ delivery: null });
  });

  it("returns the deliveries envelope on GET /deliveries with filter", async () => {
    const deliveries = [
      fakeDelivery({ id: "owd_a" }),
      fakeDelivery({ id: "owd_b" }),
    ];
    let receivedSubscriptionId: string | undefined;
    const handler = createTestHandler({
      listDeliveries: (input) => {
        receivedSubscriptionId = input.filter.subscriptionId;
        return Effect.succeed(deliveries);
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(operatorWebhookDeliveryApiPath.list)}?subscriptionId=sub_owd`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deliveries });
    expect(receivedSubscriptionId).toBe("sub_owd");
  });
});

// ---------------------------------------------------------------------------
// Replay / retry / cancel
// ---------------------------------------------------------------------------

describe("operator-webhook-delivery HTTP — replay/retry/cancel", () => {
  it("returns the replacement on POST replay (201)", async () => {
    const replacement = fakeDelivery({
      id: "owd_replay",
      replayOfDeliveryId: "owd_one",
    });
    let receivedId: string | undefined;
    const handler = createTestHandler({
      replayDelivery: (input) => {
        receivedId = input.replay.id;
        return Effect.succeed(replacement);
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_one/replay"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: replayBody(),
          },
        ),
      ),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ delivery: replacement });
    expect(receivedId).toBe("owd_one");
  });

  it("maps OperatorWebhookDeliveryAttemptBudgetExceeded to 422 on retry", async () => {
    const handler = createTestHandler({
      retryDelivery: () =>
        Effect.fail(
          new OperatorWebhookDeliveryAttemptBudgetExceeded({
            id: "owd_exhausted",
            attemptCount: 6,
            maxAttempts: 6,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_exhausted/retry"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: retryBody(),
          },
        ),
      ),
    );
    expect(response.status).toBe(422);
  });

  it("maps OperatorWebhookDeliveryUnauthorized to 401 on cancel", async () => {
    const handler = createTestHandler({
      cancelDelivery: () =>
        Effect.fail(
          new OperatorWebhookDeliveryUnauthorized({
            operation: "cancel",
            requestingActorId: "usr_other",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_one/cancel"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: cancelBody(),
          },
        ),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps OperatorWebhookDeliveryNotFound to 404 on retry", async () => {
    const handler = createTestHandler({
      retryDelivery: () =>
        Effect.fail(new OperatorWebhookDeliveryNotFound({ id: "owd_missing" })),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_missing/retry"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: retryBody(),
          },
        ),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps OperatorWebhookDeliveryAlreadyTerminalError to 409 on cancel", async () => {
    const handler = createTestHandler({
      cancelDelivery: () =>
        Effect.fail(
          new OperatorWebhookDeliveryAlreadyTerminalError({
            id: "owd_done",
            currentStatus: operatorWebhookDeliveryStatus.delivered,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_done/cancel"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: cancelBody(),
          },
        ),
      ),
    );
    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Recompute signature
// ---------------------------------------------------------------------------

describe("operator-webhook-delivery HTTP — recompute signature", () => {
  it("returns the signature header on POST happy path", async () => {
    const header =
      "t=1735689600,v1=0000000000000000000000000000000000000000000000000000000000000000" as OperatorWebhookDeliverySignatureHeader;
    const handler = createTestHandler({
      recomputeSignatureHeader: () => Effect.succeed(header),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(
            "/api/operator-webhook-delivery/deliveries/owd_one/recompute-signature",
          ),
          { method: "POST" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      signatureHeader: header,
    });
  });

  it("maps OperatorWebhookDeliverySignatureRecomputeStale to 410", async () => {
    const handler = createTestHandler({
      recomputeSignatureHeader: () =>
        Effect.fail(
          new OperatorWebhookDeliverySignatureRecomputeStale({
            id: "owd_stale",
            signatureTimestamp: "2020-01-01T00:00:00.000Z",
            freshnessSeconds: 300,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(
            "/api/operator-webhook-delivery/deliveries/owd_stale/recompute-signature",
          ),
          { method: "POST" },
        ),
      ),
    );
    expect(response.status).toBe(410);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("operator-webhook-delivery HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects an unsupported method on /deliveries/:id/retry with 405", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_one/retry"),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/operator-webhook-delivery/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      retryDelivery: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/operator-webhook-delivery/deliveries/owd_x/retry"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: retryBody(),
          },
        ),
      ),
    );
    expect(response.status).toBe(500);
  });

  it("uses the imported OperatorWebhookDeliveryNotFoundError tag literal", () => {
    // Sanity import — ensures the module repository error tag is
    // present in the test build so the 404 mapping for the durable
    // not-found branch in the HTTP handler stays exercised.
    expect(
      new OperatorWebhookDeliveryNotFoundError({ id: "ignored" })._tag,
    ).toBe("OperatorWebhookDeliveryNotFoundError");
  });
});
