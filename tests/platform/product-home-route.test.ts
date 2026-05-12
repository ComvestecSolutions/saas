import { Effect } from "effect";
import {
  actorType,
  billingPlanInterval,
  billingSubscriptionStatus,
  platformScope,
} from "@comvestec/contracts";
import type { ProductBootstrapResult } from "@comvestec/platform";
import { createGetProductHomeData } from "../../apps/product-app/src/lib/home-route-server";
import { loadProductHomeRouteDataFromRequest } from "../../apps/product-app/src/lib/home-route-data";
import { loadProductHomeLoaderData } from "../../apps/product-app/src/lib/home-route-loader";
import { createTanstackStartTestServerRuntime } from "../tanstack-start-test-runtime";

describe("product home route data", () => {
  it("falls back to the shell when subscriber session transport is missing", async () => {
    const buildProductBootstrap = vi.fn(() => {
      throw new Error(
        "Expected bootstrap helper not to run without a subscriber session.",
      );
    });

    await expect(
      Effect.runPromise(
        loadProductHomeRouteDataFromRequest(
          new Request("http://localhost:3002/"),
          {},
          buildProductBootstrap,
        ),
      ),
    ).resolves.toEqual({ kind: "shell" });

    expect(buildProductBootstrap).not.toHaveBeenCalled();
  });

  it("falls back to the shell when the session id no longer resolves to request context", async () => {
    await expect(
      Effect.runPromise(
        loadProductHomeRouteDataFromRequest(
          new Request("http://localhost:3002/", {
            headers: {
              cookie: "comvestec_session=sess_missing_context",
            },
          }),
          {},
          () =>
            Effect.fail({
              _tag: "IdentitySessionRequestContextNotFoundError",
              sessionId: "sess_missing_context",
            } as const),
        ),
      ),
    ).resolves.toEqual({ kind: "stale-session" });
  });

  it("redirects the root loader through the stale-session recovery route", async () => {
    try {
      await loadProductHomeLoaderData(() =>
        Promise.resolve({ kind: "stale-session" }),
      );
      throw new Error("Expected the product home loader to redirect.");
    } catch (error) {
      const redirectResponse = error as Response & {
        readonly options?: {
          readonly statusCode?: number;
          readonly to?: string;
        };
      };

      expect(redirectResponse).toBeInstanceOf(Response);
      expect(redirectResponse.status).toBe(307);
      expect(redirectResponse.options?.statusCode).toBe(307);
      expect(redirectResponse.options?.to).toBe("/auth/stale-session");
    }
  });

  it("returns the backend bootstrap when the shared request helper succeeds", async () => {
    const bootstrap = {
      requestContext: {
        actorType: actorType.organizationAdmin,
        actorId: "usr_product_home",
        sessionId: "sess_product_home",
        correlationId: "corr_product_home",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_product_home",
          organizationId: "org_product_home",
        },
      },
      authorization: {
        allowed: true,
        cacheKey: "product-home-bootstrap",
        reason: "Allowed by persisted authorization relation.",
        auditRequired: false,
      },
      billingStatus: {
        plan: "plan_starter",
        billingInterval: billingPlanInterval.month,
        status: billingSubscriptionStatus.active,
        usage: [],
      },
      enabledModules: [],
    } satisfies ProductBootstrapResult;

    await expect(
      Effect.runPromise(
        loadProductHomeRouteDataFromRequest(
          new Request("http://localhost:3002/", {
            headers: {
              cookie: "comvestec_session=sess_product_home",
            },
          }),
          {},
          () => Effect.succeed(bootstrap),
        ),
      ),
    ).resolves.toEqual({
      kind: "bootstrap",
      bootstrap,
    });
  });

  it("passes the TanStack Start server request through middleware before delegating to the route helper", async () => {
    const environment = { PRODUCT_APP_ENV: "test" };
    const serverRuntime = createTanstackStartTestServerRuntime(
      "http://localhost:3002/",
    );
    let capturedRequest: Request | undefined;
    let capturedEnvironment: unknown;
    const getProductHomeData = createGetProductHomeData(
      (request, currentEnvironment) => {
        capturedRequest = request;
        capturedEnvironment = currentEnvironment;

        return Effect.succeed({ kind: "shell" } as const);
      },
      environment,
      serverRuntime,
    );

    await expect(
      getProductHomeData.__executeServer({
        method: "GET",
        data: undefined,
        headers: {
          cookie: "comvestec_session=sess_product_home_boundary",
          "x-product-home": "server-boundary",
        },
      }),
    ).resolves.toEqual({ kind: "shell" });

    expect(capturedEnvironment).toBe(environment);
    expect(capturedRequest).toBeInstanceOf(Request);
    expect(capturedRequest?.method).toBe("GET");
    expect(capturedRequest?.headers.get("cookie")).toBe(
      "comvestec_session=sess_product_home_boundary",
    );
    expect(capturedRequest?.headers.get("x-product-home")).toBe(
      "server-boundary",
    );
  });
});
