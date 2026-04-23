import { Effect } from "effect";
import { platformModuleId, platformScope } from "@comvestec/contracts";
import {
  createProductAppAuthCallbackStateFromEnvironment,
  decodeProductAppAuthCallbackStateFromEnvironment,
  subscriberJourneySessionCookieName,
} from "@comvestec/platform";
import { handlePublicWebAuthStartRequest } from "../../apps/public-web/src/auth/start-route";
import { handleProductAuthCallbackRequest } from "../../apps/product-app/src/auth/callback-route";

const authRouteEnvironment = {
  PRODUCT_APP_BASE_URL: "http://localhost:3002",
  KEYCLOAK_CLIENT_SECRET: "route-state-secret",
};

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

    const response = await Effect.runPromise(
      handlePublicWebAuthStartRequest(
        authRouteEnvironment,
        new Request(
          "http://localhost:3000/auth/start?tenantHint=org_demo&displayNameHint=Spoofed+Tenant",
        ),
        instrumentedStartAuthentication,
      ),
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
    expect(capturedInput.displayNameHint).toBeUndefined();
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

    await Effect.runPromise(
      handlePublicWebAuthStartRequest(
        authRouteEnvironment,
        new Request("http://localhost:3000/auth/start?tenantHint=org_demo"),
        startAuthentication,
      ),
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

    const response = await Effect.runPromise(
      handleProductAuthCallbackRequest(
        authRouteEnvironment,
        new Request(
          `http://localhost:3002/auth/callback?code=code_roundtrip&state=${encodeURIComponent(authStartState)}&tenantHint=evil-tenant&tenantScopeId=org_evil&organizationId=org_evil`,
        ),
        completeAuthentication,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");

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

    await Effect.runPromise(
      handlePublicWebAuthStartRequest(
        authRouteEnvironment,
        new Request(
          "http://localhost:3000/auth/start?tenantHint=usr_demo&tenantScopeHint=individual",
        ),
        instrumentedStartAuthentication,
      ),
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

    const response = await Effect.runPromise(
      handleProductAuthCallbackRequest(
        authRouteEnvironment,
        new Request(
          `http://localhost:3002/auth/callback?code=code_123&state=${encodeURIComponent(state)}`,
        ),
        instrumentedCompleteAuthentication,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3002/");
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
    expect(capturedInput.correlationId).toBe("corr_1");
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

  it("rejects invalid callback state", async () => {
    const response = await Effect.runPromise(
      handleProductAuthCallbackRequest(
        authRouteEnvironment,
        new Request(
          "http://localhost:3002/auth/callback?code=code_123&state=not-a-valid-state",
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Auth callback query or callback state did not match the expected contract.",
    });
  });

  it("returns 500 when auth-start backend configuration is invalid", async () => {
    const response = await Effect.runPromise(
      handlePublicWebAuthStartRequest(
        {
          KEYCLOAK_CLIENT_SECRET: "route-state-secret",
        },
        new Request("http://localhost:3000/auth/start?tenantHint=org_demo"),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error:
        "Public auth start is misconfigured or failed validation at the backend boundary.",
    });
  });

  it("returns 400 when auth-start query parameters fail schema validation", async () => {
    const response = await Effect.runPromise(
      handlePublicWebAuthStartRequest(
        authRouteEnvironment,
        new Request("http://localhost:3000/auth/start?tenantHint="),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Auth start query did not match the expected schema.",
    });
  });
});
