import { Effect } from "effect";
import {
  createProductBillingCheckoutHandoffTokenFromEnvironment,
  createSubscriberCheckoutSessionFromRequest,
  platformRequestCorrelationIdHeaderName,
  subscriberJourneySessionCookieName,
} from "@comvestec/platform";
import { handleProductBillingCheckoutRequest } from "../../apps/product-app/src/billing/checkout-route";
import { handleProductBillingReturnRequest } from "../../apps/product-app/src/billing/return-route";

describe("product billing routes", () => {
  it("starts hosted checkout through the shared request-backed helper", async () => {
    let capturedInput:
      | Parameters<typeof createSubscriberCheckoutSessionFromRequest>[1]
      | undefined;

    const response = await handleProductBillingCheckoutRequest(
      {},
      new Request(
        "http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_month",
        {
          headers: {
            cookie: `${subscriberJourneySessionCookieName}=sess_checkout_route`,
          },
        },
      ),
      (input) => {
        capturedInput = input;

        return Effect.succeed({
          checkoutSessionId: "checkout_route_1",
          checkoutUrl: "https://billing.example.com/checkouts/checkout_route_1",
          planId: input.planId,
          priceId: input.priceId,
          interval: "month",
          provider: "polar",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://billing.example.com/checkouts/checkout_route_1",
    );
    expect(capturedInput).toMatchObject({
      planId: "plan_growth",
      priceId: "price_growth_month",
      successPath: "/billing/success",
      cancelPath: "/billing/cancel",
    });
    expect(capturedInput?.request.url).toBe(
      "http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_month",
    );
  });

  it("rejects invalid checkout queries", async () => {
    const response = await handleProductBillingCheckoutRequest(
      {},
      new Request("http://localhost:3002/billing/checkout?planId=plan_growth"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Checkout query or return URLs did not match the expected contract.",
    });
  });

  it("starts hosted checkout with validated public-web return URLs from the signed handoff", async () => {
    let capturedInput:
      | Parameters<typeof createSubscriberCheckoutSessionFromRequest>[1]
      | undefined;
    const handoff = await Effect.runPromise(
      createProductBillingCheckoutHandoffTokenFromEnvironment(
        {
          KEYCLOAK_CLIENT_SECRET: "route-state-secret",
        },
        {
          planId: "plan_growth",
          priceId: "price_growth_month",
          successUrl: "http://localhost:3000/billing/success",
          cancelUrl: "http://localhost:3000/billing/cancel",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ),
    );

    const response = await handleProductBillingCheckoutRequest(
      {
        APP_BASE_URL: "http://localhost:3000",
        KEYCLOAK_CLIENT_SECRET: "route-state-secret",
      },
      new Request(
        `http://localhost:3002/billing/checkout?handoff=${encodeURIComponent(handoff)}`,
        {
          headers: {
            cookie: `${subscriberJourneySessionCookieName}=sess_checkout_route`,
          },
        },
      ),
      (input) => {
        capturedInput = input;

        return Effect.succeed({
          checkoutSessionId: "checkout_route_2",
          checkoutUrl: "https://billing.example.com/checkouts/checkout_route_2",
          planId: input.planId,
          priceId: input.priceId,
          interval: "month",
          provider: "polar",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://billing.example.com/checkouts/checkout_route_2",
    );
    expect(capturedInput).toMatchObject({
      planId: "plan_growth",
      priceId: "price_growth_month",
      successUrl: "http://localhost:3000/billing/success",
      cancelUrl: "http://localhost:3000/billing/cancel",
    });
  });

  it("rejects signed handoff requests when browser query parameters try to override the plan selection", async () => {
    const handoff = await Effect.runPromise(
      createProductBillingCheckoutHandoffTokenFromEnvironment(
        {
          KEYCLOAK_CLIENT_SECRET: "route-state-secret",
        },
        {
          planId: "plan_growth",
          priceId: "price_growth_month",
          successUrl: "http://localhost:3000/billing/success",
          cancelUrl: "http://localhost:3000/billing/cancel",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ),
    );

    const response = await handleProductBillingCheckoutRequest(
      {
        APP_BASE_URL: "http://localhost:3000",
        KEYCLOAK_CLIENT_SECRET: "route-state-secret",
      },
      new Request(
        `http://localhost:3002/billing/checkout?handoff=${encodeURIComponent(handoff)}&planId=plan_enterprise`,
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Checkout query or return URLs did not match the expected contract.",
    });
  });

  it("rejects checkout handoffs that try to override the approved public-web return URLs", async () => {
    const response = await handleProductBillingCheckoutRequest(
      {
        APP_BASE_URL: "http://localhost:3000",
      },
      new Request(
        `http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_month&successUrl=${encodeURIComponent("https://evil.example.com/success")}&cancelUrl=${encodeURIComponent("http://localhost:3000/billing/cancel")}`,
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Checkout query or return URLs did not match the expected contract.",
    });
  });

  it("requires an authenticated subscriber session before checkout starts", async () => {
    const response = await handleProductBillingCheckoutRequest(
      {},
      new Request(
        "http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_month",
      ),
      () =>
        Effect.fail({
          _tag: "SubscriberJourneySessionIdMissingError",
        } as const),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error:
        "An authenticated subscriber session is required before checkout can start.",
    });
  });

  it("treats billing success routes as advisory redirects back to the root shell", async () => {
    const response = await handleProductBillingReturnRequest(
      {},
      new Request("http://localhost:3002/billing/success", {
        headers: {
          [platformRequestCorrelationIdHeaderName]: "corr_billing_success",
        },
      }),
      "success",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_billing_success",
    );
  });

  it("treats billing cancel routes as advisory redirects back to the root shell", async () => {
    const response = await handleProductBillingReturnRequest(
      {},
      new Request("http://localhost:3002/billing/cancel", {
        headers: {
          [platformRequestCorrelationIdHeaderName]: "corr_billing_cancel",
        },
      }),
      "cancel",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_billing_cancel",
    );
  });
});
