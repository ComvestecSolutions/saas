import { Effect } from "effect";
import { platformScope } from "@comvestec/contracts";
import { decodeProductBillingCheckoutHandoffTokenFromEnvironment } from "@comvestec/platform";
import { createGetAdminTenantRepairData } from "../../../apps/admin-app/src/lib/tenant-repair-route-server";
import { loadAdminTenantRepairRouteDataFromRequest } from "../../../apps/admin-app/src/lib/tenant-repair-route-data";
import { createGetProductHomeData } from "../../../apps/product-app/src/lib/home-route-server";
import { loadProductHomeRouteDataFromRequest } from "../../../apps/product-app/src/lib/home-route-data";
import { handlePublicWebAuthStartRequest } from "../../../apps/public-web/src/auth/start-route";
import { handlePublicWebBillingCheckoutRequest } from "../../../apps/public-web/src/billing/checkout-route";
import { createTanstackStartTestServerRuntime } from "../../tanstack-start-test-runtime";
import { describe, expect, it } from "vitest";
import {
  decodeAuthCallbackStateFromRedirectLocation,
  isLocalBackendE2eFeatureFlagsReady,
  requireResponseCorrelationId,
  requireResponseRedirectLocation,
  runBackendE2eStep,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;
const describeLocalBackendE2eFeatureFlagsReady =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describe("backend e2e app server-side transport", () => {
  it("falls back to the product-app shell through the real server-function boundary without a subscriber session", async () => {
    const getProductHomeData = createGetProductHomeData(
      loadProductHomeRouteDataFromRequest,
      process.env,
      createTanstackStartTestServerRuntime("http://localhost:3002/"),
    );

    await expect(
      runBackendE2eStep(
        "product-app home server function",
        getProductHomeData.__executeServer({
          method: "GET",
          data: undefined,
          headers: {
            "x-product-home": "backend-e2e",
          },
        }),
      ),
    ).resolves.toEqual({ kind: "shell" });
  });

  it("falls back to the admin-app shell through the real server-function boundary without an operator session", async () => {
    const getAdminTenantRepairData = createGetAdminTenantRepairData(
      loadAdminTenantRepairRouteDataFromRequest,
      process.env,
      createTanstackStartTestServerRuntime(
        "http://localhost:3001/admin/tenants/repair",
      ),
    );

    await expect(
      runBackendE2eStep(
        "admin-app tenant repair server function",
        getAdminTenantRepairData.__executeServer({
          method: "GET",
          data: undefined,
          headers: {
            "x-admin-home": "backend-e2e",
          },
        }),
      ),
    ).resolves.toEqual({ kind: "shell" });
  });

  describeLocalBackendE2eFeatureFlagsReady("local stack route parity", () => {
    const environment = localBackendE2eEnvironment!;

    it("starts public auth through the real public-web route boundary", async () => {
      const response = await runBackendE2eStep(
        "public-web auth start",
        handlePublicWebAuthStartRequest(
          process.env,
          new Request(
            `${environment.APP_BASE_URL}/auth/start?tenantHint=org_smoke`,
          ),
        ),
      );

      expect(response.status).toBe(302);

      const redirectLocation = requireResponseRedirectLocation(response);
      const correlationId = requireResponseCorrelationId(response);
      const redirectUrl = new URL(redirectLocation);
      const decodedState = await Effect.runPromise(
        decodeAuthCallbackStateFromRedirectLocation(
          environment,
          redirectLocation,
        ),
      );

      expect(redirectUrl.origin).toBe(
        new URL(environment.KEYCLOAK_BASE_URL).origin,
      );
      expect(redirectUrl.pathname).toBe(
        `/realms/${environment.KEYCLOAK_REALM}/protocol/openid-connect/auth`,
      );
      expect(decodedState.redirectUri).toBe(
        new URL("/auth/callback", environment.PRODUCT_APP_BASE_URL).toString(),
      );
      expect(decodedState.correlationId).toBe(correlationId);
      expect(decodedState.tenant.scope).toBe(platformScope.organization);
    });

    it("starts public billing checkout through the real public-web route boundary", async () => {
      const response = await runBackendE2eStep(
        "public-web billing checkout kickoff",
        handlePublicWebBillingCheckoutRequest(
          process.env,
          new Request(
            `${environment.APP_BASE_URL}/billing/checkout?planId=plan_growth&priceId=price_growth_month&tenantHint=org_smoke`,
          ),
        ),
      );

      expect(response.status).toBe(302);

      const redirectLocation = requireResponseRedirectLocation(response);
      const correlationId = requireResponseCorrelationId(response);
      const redirectUrl = new URL(redirectLocation);
      const decodedState = await Effect.runPromise(
        decodeAuthCallbackStateFromRedirectLocation(
          environment,
          redirectLocation,
        ),
      );
      const postAuthRedirect = new URL(
        decodedState.postAuthRedirectPath ?? "/",
        environment.PRODUCT_APP_BASE_URL,
      );
      const handoff = postAuthRedirect.searchParams.get("handoff");

      if (handoff === null) {
        throw new Error(
          "Expected public billing checkout to sign a post-auth handoff token.",
        );
      }

      const decodedHandoff = await Effect.runPromise(
        decodeProductBillingCheckoutHandoffTokenFromEnvironment(
          environment,
          handoff,
        ),
      );

      expect(redirectUrl.origin).toBe(
        new URL(environment.KEYCLOAK_BASE_URL).origin,
      );
      expect(redirectUrl.pathname).toBe(
        `/realms/${environment.KEYCLOAK_REALM}/protocol/openid-connect/auth`,
      );
      expect(decodedState.correlationId).toBe(correlationId);
      expect(postAuthRedirect.pathname).toBe("/billing/checkout");
      expect(decodedHandoff.planId).toBe("plan_growth");
      expect(decodedHandoff.priceId).toBe("price_growth_month");
      expect(decodedHandoff.successUrl).toBe(
        new URL("/billing/success", environment.APP_BASE_URL).toString(),
      );
      expect(decodedHandoff.cancelUrl).toBe(
        new URL("/billing/cancel", environment.APP_BASE_URL).toString(),
      );
    });
  });
});
