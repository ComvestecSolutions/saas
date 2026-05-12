import { Effect } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  decodeProductBillingCheckoutHandoffTokenFromEnvironment,
  decodeProductAppAuthCallbackStateFromEnvironment,
  getPublicWebSnapshotForRequestContext,
  platformRequestCorrelationIdHeaderName,
} from "@comvestec/platform";
import { handlePublicWebBillingCheckoutRequest } from "../../apps/public-web/src/billing/checkout-route";
import { handlePublicWebBillingReturnRequest } from "../../apps/public-web/src/billing/return-route";

const publicWebBillingRouteEnvironment = {
  APP_BASE_URL: "http://localhost:3000",
  PRODUCT_APP_BASE_URL: "http://localhost:3002",
  KEYCLOAK_CLIENT_SECRET: "route-state-secret",
};

const preparePublicAuthStartForRouteTests: NonNullable<
  Parameters<typeof handlePublicWebBillingCheckoutRequest>[3]
> = (input) =>
  Effect.gen(function* () {
    const correlationId =
      input.correlationId ?? "corr_public_billing_auth_start";
    const requestContext = {
      actorType: actorType.anonymous,
      correlationId,
      host: input.host,
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    };
    const snapshot =
      yield* getPublicWebSnapshotForRequestContext(requestContext);

    return {
      correlationId,
      requestContext,
      tenant:
        input.tenantScopeHint === platformScope.individual
          ? {
              scope: platformScope.individual,
              scopeId: "usr_checkout_1",
              individualId: "usr_checkout_1",
            }
          : {
              scope: platformScope.organization,
              scopeId: "org_checkout_1",
              organizationId: "org_checkout_1",
            },
      enabledModules: [
        platformModuleId.tenantManagement,
        platformModuleId.identitySession,
        platformModuleId.billingAndMetering,
      ],
      snapshot,
    };
  });

describe("public web billing routes", () => {
  it("starts hosted checkout by signing a post-auth handoff into the product checkout route", async () => {
    let capturedInput:
      | Parameters<
          NonNullable<
            Parameters<typeof handlePublicWebBillingCheckoutRequest>[2]
          >
        >[0]
      | undefined;
    const startAuthentication: NonNullable<
      Parameters<typeof handlePublicWebBillingCheckoutRequest>[2]
    > = (input) => {
      capturedInput = input;

      return Effect.succeed({
        redirect: {
          url: "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
        },
      });
    };

    const response = await handlePublicWebBillingCheckoutRequest(
      publicWebBillingRouteEnvironment,
      new Request(
        "http://localhost:3000/billing/checkout?planId=plan_growth&priceId=price_growth_month&tenantHint=org_demo",
      ),
      startAuthentication,
      preparePublicAuthStartForRouteTests,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
    );

    if (capturedInput === undefined) {
      throw new Error(
        "Expected public billing auth-start input to be captured.",
      );
    }

    const decodedState = await Effect.runPromise(
      decodeProductAppAuthCallbackStateFromEnvironment(
        publicWebBillingRouteEnvironment,
        capturedInput.state ?? "",
      ),
    );
    const handoffPath = new URL(
      decodedState.postAuthRedirectPath ?? "/",
      "http://localhost:3002",
    );
    const handoff = handoffPath.searchParams.get("handoff");

    if (handoff === null) {
      throw new Error("Expected signed billing handoff token to be present.");
    }

    const decodedHandoff = await Effect.runPromise(
      decodeProductBillingCheckoutHandoffTokenFromEnvironment(
        publicWebBillingRouteEnvironment,
        handoff,
      ),
    );

    expect(capturedInput.requestContext.host).toBe("localhost:3000");
    expect(handoffPath.pathname).toBe("/billing/checkout");
    expect(decodedHandoff).toMatchObject({
      planId: "plan_growth",
      priceId: "price_growth_month",
      successUrl: "http://localhost:3000/billing/success",
      cancelUrl: "http://localhost:3000/billing/cancel",
    });
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      capturedInput.requestContext.correlationId,
    );
  });

  it("carries prepared branding hints into checkout-triggered auth redirects", async () => {
    let capturedInput:
      | Parameters<
          NonNullable<
            Parameters<typeof handlePublicWebBillingCheckoutRequest>[2]
          >
        >[0]
      | undefined;
    const startAuthentication: NonNullable<
      Parameters<typeof handlePublicWebBillingCheckoutRequest>[2]
    > = (input) => {
      capturedInput = input;

      return Effect.succeed({
        redirect: {
          url: "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
        },
      });
    };
    const prepareBrandedPublicAuthStart: NonNullable<
      Parameters<typeof handlePublicWebBillingCheckoutRequest>[3]
    > = (input) =>
      preparePublicAuthStartForRouteTests(input).pipe(
        Effect.map((preparation) => ({
          ...preparation,
          snapshot: {
            ...preparation.snapshot,
            branding: {
              ...preparation.snapshot.branding,
              companyName: "Acme Checkout",
              projection: {
                ...preparation.snapshot.branding.projection,
                companyName: "Acme Checkout",
                themeTokens: {
                  ...preparation.snapshot.branding.projection.themeTokens,
                  primary: "#14532D",
                },
              },
            },
          },
        })),
      );

    const response = await handlePublicWebBillingCheckoutRequest(
      publicWebBillingRouteEnvironment,
      new Request(
        "http://localhost:3000/billing/checkout?planId=plan_growth&priceId=price_growth_month&tenantHint=org_demo",
      ),
      startAuthentication,
      prepareBrandedPublicAuthStart,
    );

    expect(response.status).toBe(302);

    if (capturedInput === undefined) {
      throw new Error(
        "Expected branded public billing auth-start input to be captured.",
      );
    }

    expect(capturedInput.displayNameHint).toBe("Acme Checkout");
    expect(capturedInput.themeHint).toBe("#14532D");
  });

  it("returns 502 when checkout auth-start preparation hits a backend dependency failure", async () => {
    const failingPreparations: ReadonlyArray<
      NonNullable<Parameters<typeof handlePublicWebBillingCheckoutRequest>[3]>
    > = [
      () =>
        Effect.fail({
          _tag: "BillingStatePostgresRepositoryQueryError",
          operation: "getTenantAccessState",
          cause: new Error("billing-state unavailable"),
        }),
      () =>
        Effect.fail({
          _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
          operation: "listOverridesByModule",
          cause: new Error("runtime-config unavailable"),
        }),
    ];

    for (const preparePublicAuthStart of failingPreparations) {
      const response = await handlePublicWebBillingCheckoutRequest(
        publicWebBillingRouteEnvironment,
        new Request(
          "http://localhost:3000/billing/checkout?planId=plan_growth&priceId=price_growth_month&tenantHint=org_demo",
        ),
        undefined,
        preparePublicAuthStart,
      );

      expect(response.status).toBe(502);
      expect(
        response.headers.get(platformRequestCorrelationIdHeaderName),
      ).toEqual(expect.any(String));
      await expect(response.json()).resolves.toEqual({
        error:
          "A backend dependency request failed while starting public billing checkout.",
      });
    }
  });

  it("treats public-web billing success routes as advisory redirects back to the landing page", async () => {
    const response = await handlePublicWebBillingReturnRequest(
      {},
      new Request("http://localhost:3000/billing/success", {
        headers: {
          [platformRequestCorrelationIdHeaderName]:
            "corr_public_billing_success",
        },
      }),
      "success",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_public_billing_success",
    );
  });

  it("treats public-web billing cancel routes as advisory redirects back to the landing page", async () => {
    const response = await handlePublicWebBillingReturnRequest(
      {},
      new Request("http://localhost:3000/billing/cancel", {
        headers: {
          [platformRequestCorrelationIdHeaderName]:
            "corr_public_billing_cancel",
        },
      }),
      "cancel",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_public_billing_cancel",
    );
  });
});
