import { Effect, Schema } from "effect";
import {
  actorType,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  billingSubscriptionStatus,
  platformScope,
} from "@comvestec/contracts";
import { BillingWebhookProcessingResultSchema } from "@comvestec/modules";
import {
  createSubscriberJourneyHttpHandler,
  platformAdapterServiceName,
  subscriberJourneyApiPath,
  type SubscriberJourneyService,
} from "@comvestec/platform";

const unexpectedSubscriberJourneyServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected subscriber journey test service call."));

const defaultResolveRequestContext: SubscriberJourneyService["resolveRequestContext"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultStartAuthentication: SubscriberJourneyService["startAuthentication"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCompleteAuthentication: SubscriberJourneyService["completeAuthentication"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCreateCheckoutSession: SubscriberJourneyService["createCheckoutSession"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultProcessBillingWebhook: SubscriberJourneyService["processBillingWebhook"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultReplayBillingWebhook: SubscriberJourneyService["replayBillingWebhook"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultBuildProductBootstrap: SubscriberJourneyService["buildProductBootstrap"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const createSubscriberJourneyServiceDouble = (
  overrides: Partial<SubscriberJourneyService>,
): SubscriberJourneyService => ({
  listPublicPlans:
    overrides.listPublicPlans ?? unexpectedSubscriberJourneyServiceEffect(),
  resolveRequestContext:
    overrides.resolveRequestContext ?? defaultResolveRequestContext,
  startAuthentication:
    overrides.startAuthentication ?? defaultStartAuthentication,
  completeAuthentication:
    overrides.completeAuthentication ?? defaultCompleteAuthentication,
  createCheckoutSession:
    overrides.createCheckoutSession ?? defaultCreateCheckoutSession,
  processBillingWebhook:
    overrides.processBillingWebhook ?? defaultProcessBillingWebhook,
  replayBillingWebhook:
    overrides.replayBillingWebhook ?? defaultReplayBillingWebhook,
  buildProductBootstrap:
    overrides.buildProductBootstrap ?? defaultBuildProductBootstrap,
});

const createTestHandler = (
  service: Partial<SubscriberJourneyService>,
  options?: Parameters<typeof createSubscriberJourneyHttpHandler>[1],
) =>
  createSubscriberJourneyHttpHandler(
    (use) => use(createSubscriberJourneyServiceDouble(service)),
    options,
  );

describe("platform subscriber journey http", () => {
  it("lists public plans through the backend-owned HTTP surface", async () => {
    const handler = createTestHandler({
      listPublicPlans: Effect.succeed([
        {
          planId: "plan_starter",
          planKey: "starter",
          displayName: "Starter",
          active: true,
          prices: [
            {
              priceId: "price_starter_month",
              interval: "month",
              currency: "USD",
              amountMinor: 1900,
              active: true,
              providerPriceId: "polar_price_starter_month",
            },
          ],
        },
      ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.listPublicPlans}`,
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plans: [
        expect.objectContaining({
          planId: "plan_starter",
          planKey: "starter",
        }),
      ],
    });
  });

  it("starts authentication through the backend-owned HTTP surface", async () => {
    const handler = createTestHandler({
      startAuthentication: (input) =>
        Effect.succeed({
          correlationId: input.requestContext.correlationId,
          redirect: {
            url: "http://localhost:8080/realms/comvestec/protocol/openid-connect/auth",
            realm: "comvestec",
            tenantHint: input.tenantHint,
            returnHost: input.returnHost,
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestContext: {
                actorType: actorType.anonymous,
                correlationId: "corr_http_start",
                tenant: {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              },
              tenantHint: "org_http",
              returnHost: "https://product.example.com/auth/callback",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        correlationId: "corr_http_start",
        redirect: expect.objectContaining({ tenantHint: "org_http" }),
      }),
    );
  });

  it("returns 400 for invalid JSON payloads", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: "{invalid-json",
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON.",
    });
  });

  it("returns 400 when auth completion session payload does not match the shared keycloak input contract", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.completeAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session: {
                unsupported: true,
              },
              correlationId: "corr_http_complete",
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_http_complete",
              },
              enabledModules: [],
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("processes verified polar webhook requests through the HTTP surface", async () => {
    const processBillingWebhook: SubscriberJourneyService["processBillingWebhook"] =
      (
        input: Parameters<SubscriberJourneyService["processBillingWebhook"]>[0],
      ) =>
        Schema.decodeUnknown(BillingWebhookProcessingResultSchema)({
          reconciliation: {
            action: billingWebhookReconciliationAction.activate,
            event: {
              provider: input.provider,
              deliveryId: input.deliveryId,
              eventId: input.eventId,
              eventType: input.eventType,
              occurredAt: input.occurredAt,
              subscriptionId: input.subscriptionId,
              tenantScope: input.tenantScope,
              tenantScopeId: input.tenantScopeId,
              planId: input.planId,
              priceId: input.priceId,
              ...(input.customerId !== undefined
                ? { customerId: input.customerId }
                : {}),
            },
            subscription: {
              subscriptionId: input.subscriptionId,
              planId: input.planId,
              priceId: input.priceId,
              status: billingSubscriptionStatus.active,
              interval: "month",
              entitlements: [],
            },
            entitlementsActive: true,
          },
          projection: {
            webhookReceipt: {
              receiptId: `${input.provider}:${input.deliveryId}`,
              provider: platformAdapterServiceName.polar,
              deliveryId: input.deliveryId,
              eventType: input.eventType,
              processingState: "processed",
              verifiedSignature: true,
              scope: input.tenantScope,
              scopeId: input.tenantScopeId,
              payload: {
                eventId: input.eventId,
                subscriptionId: input.subscriptionId,
                planId: input.planId,
                priceId: input.priceId,
                occurredAt: input.occurredAt,
                action: billingWebhookReconciliationAction.activate,
                entitlementsActive: true,
                ...(input.customerId !== undefined
                  ? { customerId: input.customerId }
                  : {}),
              },
              receivedAt: input.occurredAt,
              processedAt: input.occurredAt,
            },
            subscription: {
              subscriptionId: input.subscriptionId,
              provider: platformAdapterServiceName.polar,
              providerSubscriptionId: input.subscriptionId,
              scope: input.tenantScope,
              scopeId: input.tenantScopeId,
              planId: input.planId,
              priceId: input.priceId,
              status: billingSubscriptionStatus.active,
              metadata: {
                action: billingWebhookReconciliationAction.activate,
                interval: "month",
                entitlementsActive: true,
                ...(input.customerId !== undefined
                  ? { customerId: input.customerId }
                  : {}),
              },
            },
            paymentEvent: {
              eventId: `${input.provider}:${input.eventId}`,
              provider: platformAdapterServiceName.polar,
              providerEventId: input.eventId,
              subscriptionId: input.subscriptionId,
              scope: input.tenantScope,
              scopeId: input.tenantScopeId,
              eventType: input.eventType,
              status: "succeeded",
              effectiveAt: input.occurredAt,
              payload: {
                planId: input.planId,
                priceId: input.priceId,
                action: billingWebhookReconciliationAction.activate,
                ...(input.customerId !== undefined
                  ? { customerId: input.customerId }
                  : {}),
              },
            },
            entitlements: [],
          },
        });

    const handler = createTestHandler(
      {
        processBillingWebhook,
      },
      {
        parsePolarWebhookRequest: () =>
          Effect.succeed({
            provider: platformAdapterServiceName.polar,
            deliveryId: "wh_http_1",
            eventId: "evt_http_1",
            eventType: billingWebhookEventType.checkoutCompleted,
            occurredAt: new Date().toISOString(),
            verifiedSignature: true,
            subscriptionId: "sub_http_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_http_1",
            planId: "plan_starter",
            priceId: "price_starter_month",
            customerId: "cus_http_1",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.processBillingWebhook}`,
          {
            method: "POST",
            body: JSON.stringify({ type: "order.paid" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          action: billingWebhookReconciliationAction.activate,
        }),
      }),
    );
  });

  it("returns 401 when raw polar webhook verification fails", async () => {
    const handler = createTestHandler(
      {},
      {
        parsePolarWebhookRequest: () =>
          Effect.fail({
            _tag: "PolarWebhookSignatureError",
            deliveryId: "wh_http_bad",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.processBillingWebhook}`,
          {
            method: "POST",
            body: JSON.stringify({ type: "order.paid" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication or signature validation failed.",
    });
  });
});
