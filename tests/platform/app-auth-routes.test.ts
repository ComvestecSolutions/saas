import { Effect } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  createAdminAppAuthCallbackStateFromEnvironment,
  createProductAppAuthCallbackStateFromEnvironment,
  decodeProductAppAuthCallbackStateFromEnvironment,
  getPublicWebSnapshotForRequestContext,
  platformRequestCorrelationIdHeaderName,
  subscriberJourneySessionCookieName,
} from "@comvestec/platform";
import { handleAdminAuthCallbackRequest } from "../../apps/admin-app/src/auth/callback-route";
import { handleAdminAuthStartRequest } from "../../apps/admin-app/src/auth/start-route";
import {
  handleAdminLogoutRequest,
  handleAdminStaleSessionRecoveryRequest,
} from "../../apps/admin-app/src/auth/session-transport-route";
import { handlePublicWebAuthStartRequest } from "../../apps/public-web/src/auth/start-route";
import { handleProductAuthCallbackRequest } from "../../apps/product-app/src/auth/callback-route";
import {
  handleProductLogoutRequest,
  handleProductStaleSessionRecoveryRequest,
} from "../../apps/product-app/src/auth/session-transport-route";

const authRouteEnvironment = {
  PRODUCT_APP_BASE_URL: "http://localhost:3002",
  ADMIN_APP_BASE_URL: "http://localhost:3004",
  KEYCLOAK_CLIENT_SECRET: "route-state-secret",
};

const preparePublicAuthStartForRouteTests: NonNullable<
  Parameters<typeof handlePublicWebAuthStartRequest>[3]
> = (input) =>
  Effect.gen(function* () {
    const correlationId = input.correlationId ?? "corr_public_auth_start";
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
              scopeId: "usr_prepared_1",
              individualId: "usr_prepared_1",
            }
          : {
              scope: platformScope.organization,
              scopeId: "org_prepared_1",
              organizationId: "org_prepared_1",
            },
      enabledModules: [
        platformModuleId.tenantManagement,
        platformModuleId.identitySession,
        platformModuleId.billingAndMetering,
      ],
      snapshot,
    };
  });

const buildAdminOperatorRequestContextForRouteTests = (
  currentActorType: (typeof actorType)[keyof typeof actorType],
) => ({
  actorType: currentActorType,
  correlationId: "corr_admin_request_context",
  host: "localhost:3004",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

describe("app auth routes", () => {
  it("builds a validated product callback uri before redirecting to the identity provider", async () => {
    const startAuthentication: NonNullable<
      Parameters<typeof handlePublicWebAuthStartRequest>[2]
    > = (input) =>
      Effect.succeed({
        redirect: {
          url: "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
        },
      });

    let capturedInput: Parameters<typeof startAuthentication>[0] | undefined;
    const instrumentedStartAuthentication: typeof startAuthentication = (
      input,
    ) => {
      capturedInput = input;
      return startAuthentication(input);
    };

    let capturedPrepareInput:
      | Parameters<typeof preparePublicAuthStartForRouteTests>[0]
      | undefined;
    const instrumentedPreparePublicAuthStart: typeof preparePublicAuthStartForRouteTests =
      (input) => {
        capturedPrepareInput = input;
        return preparePublicAuthStartForRouteTests(input);
      };

    const response = await handlePublicWebAuthStartRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3000/auth/start?tenantHint=org_demo&displayNameHint=Spoofed+Tenant",
      ),
      instrumentedStartAuthentication,
      instrumentedPreparePublicAuthStart,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
    );

    if (capturedInput === undefined) {
      throw new Error("Expected auth-start input to be captured.");
    }

    const callbackUrl = new URL(capturedInput.redirectUri);
    const decodedState = await Effect.runPromise(
      decodeProductAppAuthCallbackStateFromEnvironment(
        authRouteEnvironment,
        capturedInput.state ?? "",
      ),
    );

    expect(capturedInput.requestContext.host).toBe("localhost:3000");
    expect(capturedInput.tenantHint).toBe("org_demo");
    expect(capturedInput.displayNameHint).toBe("Platform brand fallback");
    expect(capturedInput.themeHint).toBe("#0F172A");
    expect(capturedPrepareInput?.tenantHint).toBe("org_demo");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      capturedInput.requestContext.correlationId,
    );
    expect(callbackUrl.origin).toBe("http://localhost:3002");
    expect(callbackUrl.pathname).toBe("/auth/callback");
    expect(callbackUrl.search).toBe("");
    expect(decodedState.correlationId).toBe(
      capturedInput.requestContext.correlationId,
    );
    expect(decodedState.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: expect.stringMatching(/^org_/),
      organizationId: expect.any(String),
    });
    expect(decodedState.tenant.scopeId).not.toBe("org_demo");
    expect(decodedState.tenant.scopeId).toBe(
      decodedState.tenant.organizationId,
    );
    expect(decodedState.enabledModules).toEqual([
      platformModuleId.tenantManagement,
      platformModuleId.identitySession,
      platformModuleId.billingAndMetering,
    ]);
  });

  it("round-trips the auth-start state into callback completion without tenant drift", async () => {
    let authStartState: string | undefined;
    const startAuthentication: NonNullable<
      Parameters<typeof handlePublicWebAuthStartRequest>[2]
    > = (input) => {
      authStartState = input.state;

      return Effect.succeed({
        redirect: {
          url: "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
        },
      });
    };

    await handlePublicWebAuthStartRequest(
      authRouteEnvironment,
      new Request("http://localhost:3000/auth/start?tenantHint=org_demo"),
      startAuthentication,
      preparePublicAuthStartForRouteTests,
    );

    if (authStartState === undefined) {
      throw new Error("Expected auth-start state to be captured.");
    }

    const decodedState = await Effect.runPromise(
      decodeProductAppAuthCallbackStateFromEnvironment(
        authRouteEnvironment,
        authStartState,
      ),
    );

    let capturedCompleteInput:
      | Parameters<
          NonNullable<Parameters<typeof handleProductAuthCallbackRequest>[2]>
        >[0]
      | undefined;
    const completeAuthentication: NonNullable<
      Parameters<typeof handleProductAuthCallbackRequest>[2]
    > = (input) => {
      capturedCompleteInput = input;

      return Effect.succeed({
        session: {
          sessionId: "sess_roundtrip",
        },
      });
    };

    const response = await handleProductAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3002/auth/callback?code=code_roundtrip&state=${encodeURIComponent(authStartState)}&tenantHint=evil-tenant&tenantScopeId=org_evil&organizationId=org_evil`,
      ),
      completeAuthentication,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      decodedState.correlationId,
    );

    if (capturedCompleteInput === undefined) {
      throw new Error("Expected auth callback input to be captured.");
    }

    expect(capturedCompleteInput).toEqual({
      session: {
        authorizationCode: "code_roundtrip",
        redirectUri: "http://localhost:3002/auth/callback",
      },
      correlationId: decodedState.correlationId,
      host: "localhost:3002",
      tenant: decodedState.tenant,
      enabledModules: [...decodedState.enabledModules],
    });
  });

  it("builds standalone individual callback state when the auth-start scope hint requests it", async () => {
    const startAuthentication: NonNullable<
      Parameters<typeof handlePublicWebAuthStartRequest>[2]
    > = () =>
      Effect.succeed({
        redirect: {
          url: "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
        },
      });

    let capturedInput: Parameters<typeof startAuthentication>[0] | undefined;
    const instrumentedStartAuthentication: typeof startAuthentication = (
      input,
    ) => {
      capturedInput = input;
      return startAuthentication(input);
    };

    await handlePublicWebAuthStartRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3000/auth/start?tenantHint=usr_demo&tenantScopeHint=individual",
      ),
      instrumentedStartAuthentication,
      preparePublicAuthStartForRouteTests,
    );

    if (capturedInput === undefined) {
      throw new Error("Expected auth-start input to be captured.");
    }

    const decodedState = await Effect.runPromise(
      decodeProductAppAuthCallbackStateFromEnvironment(
        authRouteEnvironment,
        capturedInput.state ?? "",
      ),
    );

    expect(capturedInput.tenantHint).toBe("usr_demo");
    expect(decodedState.tenant).toEqual({
      scope: platformScope.individual,
      scopeId: expect.stringMatching(/^usr_/),
      individualId: expect.any(String),
    });
    expect(decodedState.tenant.scopeId).toBe(decodedState.tenant.individualId);
  });

  it("completes the product callback, writes the session cookie, and redirects to the shell root", async () => {
    const completeAuthentication: NonNullable<
      Parameters<typeof handleProductAuthCallbackRequest>[2]
    > = (input) =>
      Effect.succeed({
        session: {
          sessionId: "sess_callback",
        },
      });

    let capturedInput: Parameters<typeof completeAuthentication>[0] | undefined;
    const instrumentedCompleteAuthentication: typeof completeAuthentication = (
      input,
    ) => {
      capturedInput = input;
      return completeAuthentication(input);
    };
    const state = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_1",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          enterpriseId: "ent_demo",
          organizationId: "org_demo",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const response = await handleProductAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3002/auth/callback?code=code_123&state=${encodeURIComponent(state)}`,
        {
          headers: {
            [platformRequestCorrelationIdHeaderName]:
              "corr_external_callback_request",
          },
        },
      ),
      instrumentedCompleteAuthentication,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_external_callback_request",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=sess_callback; Path=/; HttpOnly; SameSite=Lax`,
    );

    if (capturedInput === undefined) {
      throw new Error("Expected auth-callback input to be captured.");
    }

    expect(capturedInput.session).toEqual({
      authorizationCode: "code_123",
      redirectUri: "http://localhost:3002/auth/callback",
    });
    expect(capturedInput.correlationId).toBe("corr_external_callback_request");
    expect(capturedInput.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: "org_demo",
      enterpriseId: "ent_demo",
      organizationId: "org_demo",
    });
    expect(capturedInput.enabledModules).toEqual([
      platformModuleId.tenantManagement,
      platformModuleId.identitySession,
      platformModuleId.billingAndMetering,
    ]);
  });

  it("redirects the product callback to a signed post-auth handoff path when present", async () => {
    const completeAuthentication: NonNullable<
      Parameters<typeof handleProductAuthCallbackRequest>[2]
    > = () =>
      Effect.succeed({
        session: {
          sessionId: "sess_post_auth_redirect",
        },
      });

    const state = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_post_auth_redirect",
        redirectUri: "http://localhost:3002/auth/callback",
        postAuthRedirectPath:
          "/billing/checkout?planId=plan_growth&priceId=price_growth_monthly",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          enterpriseId: "ent_demo",
          organizationId: "org_demo",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const response = await handleProductAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3002/auth/callback?code=code_456&state=${encodeURIComponent(state)}`,
      ),
      completeAuthentication,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_monthly",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=sess_post_auth_redirect; Path=/; HttpOnly; SameSite=Lax`,
    );
  });

  it("preserves signed-state correlation when the identity provider returns an error", async () => {
    const state = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_provider_error",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          enterpriseId: "ent_demo",
          organizationId: "org_demo",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const response = await handleProductAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3002/auth/callback?error=access_denied&error_description=${encodeURIComponent("user canceled sign-in")}&state=${encodeURIComponent(state)}`,
      ),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_provider_error",
    );
    await expect(response.json()).resolves.toEqual({
      error: "Identity provider returned an authentication error.",
      providerError: "access_denied",
      description: "user canceled sign-in",
    });
  });

  it("rejects invalid callback state", async () => {
    const response = await handleProductAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3002/auth/callback?code=code_123&state=not-a-valid-state",
      ),
    );

    expect(response.status).toBe(400);
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
    await expect(response.json()).resolves.toEqual({
      error:
        "Auth callback query or callback state did not match the expected contract.",
    });
  });

  it("preserves signed-state correlation when callback state is expired", async () => {
    const expiredState = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_expired_state",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          enterpriseId: "ent_demo",
          organizationId: "org_demo",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );

    const response = await handleProductAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3002/auth/callback?code=code_123&state=${encodeURIComponent(expiredState)}`,
      ),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_expired_state",
    );
    await expect(response.json()).resolves.toEqual({
      error: "Authentication callback state has expired.",
    });
  });

  it("returns 500 when auth-start backend configuration is invalid", async () => {
    const response = await handlePublicWebAuthStartRequest(
      {
        KEYCLOAK_CLIENT_SECRET: "route-state-secret",
      },
      new Request("http://localhost:3000/auth/start?tenantHint=org_demo"),
      undefined,
      preparePublicAuthStartForRouteTests,
    );

    expect(response.status).toBe(500);
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
    await expect(response.json()).resolves.toEqual({
      error:
        "Public auth start is misconfigured or failed validation at the backend boundary.",
    });
  });

  it("returns 502 when hinted auth-start branding lookup hits a backend dependency failure", async () => {
    const failingPreparePublicAuthStart: typeof preparePublicAuthStartForRouteTests =
      () =>
        Effect.fail({
          _tag: "BillingStatePostgresRepositoryQueryError",
          operation: "getTenantAccessState",
          cause: new Error("billing-state unavailable"),
        });

    const response = await handlePublicWebAuthStartRequest(
      authRouteEnvironment,
      new Request("http://localhost:3000/auth/start?tenantHint=org_demo"),
      undefined,
      failingPreparePublicAuthStart,
    );

    expect(response.status).toBe(502);
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
    await expect(response.json()).resolves.toEqual({
      error:
        "A backend dependency request failed while starting authentication.",
    });
  });

  it("returns 502 when hinted auth-start branding runtime-config lookup hits a backend dependency failure", async () => {
    const failingPreparePublicAuthStart: typeof preparePublicAuthStartForRouteTests =
      () =>
        Effect.fail({
          _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
          operation: "listOverridesByModule",
          cause: new Error("runtime-config unavailable"),
        });

    const response = await handlePublicWebAuthStartRequest(
      authRouteEnvironment,
      new Request("http://localhost:3000/auth/start?tenantHint=org_demo"),
      undefined,
      failingPreparePublicAuthStart,
    );

    expect(response.status).toBe(502);
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
    await expect(response.json()).resolves.toEqual({
      error:
        "A backend dependency request failed while starting authentication.",
    });
  });

  it("returns 400 when auth-start query parameters fail schema validation", async () => {
    const response = await handlePublicWebAuthStartRequest(
      authRouteEnvironment,
      new Request("http://localhost:3000/auth/start?tenantHint="),
    );

    expect(response.status).toBe(400);
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
    await expect(response.json()).resolves.toEqual({
      error: "Auth start query did not match the expected schema.",
    });
  });

  it("clears the subscriber session transport and redirects when logging out", async () => {
    let capturedInput:
      | {
          readonly correlationId: string;
          readonly reason: "logout" | "stale-session";
          readonly request: Request;
        }
      | undefined;

    const response = await handleProductLogoutRequest(
      authRouteEnvironment,
      new Request("http://localhost:3002/auth/logout", {
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_logout`,
          [platformRequestCorrelationIdHeaderName]: "corr_logout",
        },
      }),
      (input) => {
        capturedInput = input;

        return Effect.succeed(undefined);
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_logout",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
    expect(capturedInput).toMatchObject({
      correlationId: "corr_logout",
      reason: "logout",
    });
    expect(capturedInput?.request.url).toBe(
      "http://localhost:3002/auth/logout",
    );
  });

  it("clears the subscriber session transport during stale-session recovery", async () => {
    let capturedInput:
      | {
          readonly correlationId: string;
          readonly reason: "logout" | "stale-session";
          readonly request: Request;
        }
      | undefined;

    const response = await handleProductStaleSessionRecoveryRequest(
      authRouteEnvironment,
      new Request("http://localhost:3002/auth/stale-session", {
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_stale`,
          [platformRequestCorrelationIdHeaderName]:
            "corr_stale_session_recovery",
        },
      }),
      (input) => {
        capturedInput = input;

        return Effect.succeed(undefined);
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_stale_session_recovery",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
    expect(capturedInput).toMatchObject({
      correlationId: "corr_stale_session_recovery",
      reason: "stale-session",
    });
    expect(capturedInput?.request.url).toBe(
      "http://localhost:3002/auth/stale-session",
    );
  });

  it("marks cleared subscriber session cookies as secure on non-localhost logout routes", async () => {
    const response = await handleProductLogoutRequest(
      {
        PRODUCT_APP_BASE_URL: "https://product.example.com",
        KEYCLOAK_CLIENT_SECRET: "route-state-secret",
      },
      new Request("https://product.example.com/auth/logout", {
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_logout_secure`,
          [platformRequestCorrelationIdHeaderName]: "corr_logout_secure",
        },
      }),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://product.example.com/",
    );
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_logout_secure",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure`,
    );
  });

  it("builds a validated admin callback uri before redirecting to the identity provider", async () => {
    let capturedInput:
      | Parameters<
          NonNullable<Parameters<typeof handleAdminAuthStartRequest>[2]>
        >[0]
      | undefined;
    const response = await handleAdminAuthStartRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3004/auth/start?returnTo=%2Fgovernance%2Fruntime-config",
      ),
      (input) => {
        capturedInput = input;

        return Effect.succeed({
          redirect: {
            url: "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
          },
        });
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
    );

    if (capturedInput === undefined) {
      throw new Error("Expected admin auth-start input to be captured.");
    }

    expect(capturedInput.host).toBe("localhost:3004");
    expect(capturedInput.postAuthRedirectPath).toBe(
      "/governance/runtime-config",
    );
  });

  it("recovers to governed sign-in when admin auth-start hits a backend dependency failure", async () => {
    const response = await handleAdminAuthStartRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3004/auth/start?returnTo=%2Fgovernance%2Fruntime-config",
      ),
      () =>
        Effect.fail({
          _tag: "KeycloakAdapterRequestError",
          operation: "startAdminAppAuthentication",
          cause: new Error("keycloak unavailable"),
        } as const),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?returnTo=%2Fgovernance%2Fruntime-config&reason=sign-in-unavailable",
    );
  });

  it("drops invalid admin auth-start returnTo values and restarts at governed sign-in", async () => {
    let startAuthenticationCalled = false;

    const response = await handleAdminAuthStartRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3004/auth/start?returnTo=https%3A%2F%2Fevil.example.com",
      ),
      () => {
        startAuthenticationCalled = true;

        return Effect.succeed({
          redirect: {
            url: "https://identity.example.com/realms/comvestec/protocol/openid-connect/auth",
          },
        });
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?reason=restart-sign-in",
    );
    expect(startAuthenticationCalled).toBe(false);
  });

  it("completes the admin callback, writes the session cookie, and redirects to the signed return path", async () => {
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_admin_callback",
        redirectUri: "http://localhost:3004/auth/callback",
        postAuthRedirectPath: "/governance/access-control",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    let capturedInput:
      | Parameters<
          NonNullable<Parameters<typeof handleAdminAuthCallbackRequest>[2]>
        >[0]
      | undefined;
    let capturedGrantInput:
      | Parameters<
          NonNullable<Parameters<typeof handleAdminAuthCallbackRequest>[3]>
        >[0]
      | undefined;
    let capturedResolveInput:
      | Parameters<
          NonNullable<Parameters<typeof handleAdminAuthCallbackRequest>[4]>
        >[0]
      | undefined;
    let capturedShellReadinessInput:
      | Parameters<
          NonNullable<Parameters<typeof handleAdminAuthCallbackRequest>[5]>
        >[0]
      | undefined;
    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3004/auth/callback?code=code_admin&state=${encodeURIComponent(state)}`,
      ),
      (input) => {
        capturedInput = input;

        return Effect.succeed({
          session: {
            sessionId: "sess_admin_callback",
          },
        });
      },
      (input) => {
        capturedGrantInput = input;
        return Effect.succeed(undefined);
      },
      (input) => {
        capturedResolveInput = input;
        return Effect.succeed(
          buildAdminOperatorRequestContextForRouteTests(
            actorType.platformOperator,
          ),
        );
      },
      (input) => {
        capturedShellReadinessInput = input;
        return Effect.succeed(undefined);
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/governance/access-control",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=sess_admin_callback; Path=/; HttpOnly; SameSite=Lax`,
    );
    expect(capturedInput).toEqual({
      session: {
        authorizationCode: "code_admin",
        redirectUri: "http://localhost:3004/auth/callback",
      },
      correlationId: "corr_admin_callback",
      host: "localhost:3004",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
      enabledModules: [platformModuleId.identitySession],
    });
    expect(capturedResolveInput).toEqual({
      sessionId: "sess_admin_callback",
    });
    expect(capturedShellReadinessInput).toEqual({
      sessionId: "sess_admin_callback",
    });
    expect(capturedGrantInput).toMatchObject({
      sessionId: "sess_admin_callback",
      reason:
        "Activate audited privileged access for the authenticated admin operator session.",
    });

    if (capturedGrantInput === undefined) {
      throw new Error("Expected admin break-glass input to be captured.");
    }

    expect(new Date(capturedGrantInput.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("recovers to governed sign-in when the admin callback state is expired", async () => {
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_admin_callback_expired",
        redirectUri: "http://localhost:3004/auth/callback",
        postAuthRedirectPath: "/governance/access-control",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );

    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3004/auth/callback?code=code_admin_expired&state=${encodeURIComponent(state)}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_admin_callback_expired",
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?returnTo=%2Fgovernance%2Faccess-control&reason=callback-expired",
    );
  });

  it("recovers to governed sign-in when the admin callback state is invalid", async () => {
    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3004/auth/callback?code=code_admin_invalid&state=not-a-valid-state",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?reason=restart-sign-in",
    );
  });

  it("skips break-glass bootstrap after a support-operator admin callback", async () => {
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_admin_support_callback",
        redirectUri: "http://localhost:3004/auth/callback",
        postAuthRedirectPath: "/profile",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const grantBreakGlassAccess = vi.fn(() => Effect.succeed(undefined));

    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3004/auth/callback?code=code_admin_support&state=${encodeURIComponent(state)}`,
      ),
      () =>
        Effect.succeed({
          session: {
            sessionId: "sess_admin_support_callback",
          },
        }),
      grantBreakGlassAccess,
      () =>
        Effect.succeed(
          buildAdminOperatorRequestContextForRouteTests(
            actorType.supportOperator,
          ),
        ),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/profile",
    );
    expect(grantBreakGlassAccess).not.toHaveBeenCalled();
  });

  it("recovers to governed sign-in when admin callback bootstrap cannot establish operator access", async () => {
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_admin_callback_access_denied",
        redirectUri: "http://localhost:3004/auth/callback",
        postAuthRedirectPath: "/profile",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3004/auth/callback?code=code_admin_access_denied&state=${encodeURIComponent(state)}`,
      ),
      () =>
        Effect.succeed({
          session: {
            sessionId: "sess_admin_callback_access_denied",
          },
        }),
      () =>
        Effect.fail({
          _tag: "SupportOperationsReadAccessDeniedError",
          actorType: actorType.platformOperator,
          permission: "support-operations.read",
        } as const),
      () =>
        Effect.succeed(
          buildAdminOperatorRequestContextForRouteTests(
            actorType.platformOperator,
          ),
        ),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?returnTo=%2Fprofile&reason=access-denied",
    );
  });

  it("falls back to a shorter admin break-glass window when the initial duration is rejected", async () => {
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_admin_callback_retry",
        redirectUri: "http://localhost:3004/auth/callback",
        postAuthRedirectPath: "/tenants/org_demo",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const grantInputs: Parameters<
      NonNullable<Parameters<typeof handleAdminAuthCallbackRequest>[3]>
    >[0][] = [];

    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3004/auth/callback?code=code_admin_retry&state=${encodeURIComponent(state)}`,
      ),
      () =>
        Effect.succeed({
          session: {
            sessionId: "sess_admin_callback_retry",
          },
        }),
      (input) => {
        grantInputs.push(input);

        return grantInputs.length === 1
          ? Effect.fail({
              _tag: "InvalidBreakGlassExpiryError",
              expiresAt: input.expiresAt,
            } as const)
          : Effect.succeed(undefined);
      },
      () =>
        Effect.succeed(
          buildAdminOperatorRequestContextForRouteTests(
            actorType.platformOperator,
          ),
        ),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(grantInputs).toHaveLength(2);
    expect(new Date(grantInputs[1]!.expiresAt).getTime()).toBeLessThan(
      new Date(grantInputs[0]!.expiresAt).getTime(),
    );
  });

  it("retries transient admin-shell readiness misses before redirecting after callback", async () => {
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_admin_shell_readiness",
        redirectUri: "http://localhost:3004/auth/callback",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    let attempts = 0;

    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3004/auth/callback?code=code_admin_shell_readiness&state=${encodeURIComponent(state)}`,
      ),
      () =>
        Effect.succeed({
          session: {
            sessionId: "sess_admin_shell_readiness",
          },
        }),
      () => Effect.succeed(undefined),
      () =>
        Effect.succeed(
          buildAdminOperatorRequestContextForRouteTests(
            actorType.supportOperator,
          ),
        ),
      () => {
        attempts += 1;

        return attempts < 3
          ? Effect.fail({
              _tag: "AdminGovernanceRequestContextNotFoundError",
              sessionId: "sess_admin_shell_readiness",
            } as const)
          : Effect.succeed(undefined);
      },
    );

    expect(response.status).toBe(302);
    expect(attempts).toBe(3);
  });

  it("recovers to governed sign-in when the freshly completed session cannot be re-read for break-glass bootstrap", async () => {
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_admin_callback_session_read",
        redirectUri: "http://localhost:3004/auth/callback",
        postAuthRedirectPath: "/governance/runtime-config",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const response = await handleAdminAuthCallbackRequest(
      authRouteEnvironment,
      new Request(
        `http://localhost:3004/auth/callback?code=code_admin_session_read&state=${encodeURIComponent(state)}`,
      ),
      () =>
        Effect.succeed({
          session: {
            sessionId: "sess_admin_callback_session_read",
          },
        }),
      () => Effect.succeed(undefined),
      () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError",
          sessionId: "sess_admin_callback_session_read",
        } as const),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get(platformRequestCorrelationIdHeaderName)).toBe(
      "corr_admin_callback_session_read",
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?returnTo=%2Fgovernance%2Fruntime-config&reason=sign-in-unavailable",
    );
  });

  it("clears the admin session transport and redirects to governed sign-in on logout", async () => {
    const response = await handleAdminLogoutRequest(
      authRouteEnvironment,
      new Request("http://localhost:3004/auth/logout", {
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_admin_logout`,
          [platformRequestCorrelationIdHeaderName]: "corr_admin_logout",
        },
      }),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?reason=signed-out",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
  });

  it("preserves returnTo when logout clears the admin session transport", async () => {
    const response = await handleAdminLogoutRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3004/auth/logout?returnTo=%2Fgovernance%2Fruntime-config",
        {
          headers: {
            cookie: `${subscriberJourneySessionCookieName}=sess_admin_logout`,
            [platformRequestCorrelationIdHeaderName]:
              "corr_admin_logout_return_to",
          },
        },
      ),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?returnTo=%2Fgovernance%2Fruntime-config&reason=signed-out",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
  });

  it("clears the admin session transport and redirects to governed sign-in during stale-session recovery", async () => {
    const response = await handleAdminStaleSessionRecoveryRequest(
      authRouteEnvironment,
      new Request("http://localhost:3004/auth/stale-session", {
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_admin_stale`,
          [platformRequestCorrelationIdHeaderName]: "corr_admin_stale",
        },
      }),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?reason=stale-session",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
  });

  it("preserves returnTo during stale-session recovery", async () => {
    const response = await handleAdminStaleSessionRecoveryRequest(
      authRouteEnvironment,
      new Request(
        "http://localhost:3004/auth/stale-session?returnTo=%2Fgovernance%2Fruntime-config",
        {
          headers: {
            cookie: `${subscriberJourneySessionCookieName}=sess_admin_stale`,
            [platformRequestCorrelationIdHeaderName]:
              "corr_admin_stale_return_to",
          },
        },
      ),
      () => Effect.succeed(undefined),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3004/sign-in?returnTo=%2Fgovernance%2Fruntime-config&reason=stale-session",
    );
    expect(response.headers.get("set-cookie")).toBe(
      `${subscriberJourneySessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
  });
});
