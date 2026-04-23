import { Effect, ParseResult } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
  runtimeConfigAuditAction,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
} from "@comvestec/contracts";
import { tenantBrandingConfigKey } from "@comvestec/config";
import { platformHost, findModuleManifest } from "@comvestec/config";
import { runtimeConfigSyncArtifactStatus } from "@comvestec/modules";
import {
  buildProductBootstrapFromEnvironment,
  buildSubscriberJourneySessionCookieHeader,
  createProductAppAuthCallbackStateFromEnvironment,
  decodeProductAppAuthCallbackStateFromEnvironment,
  listPublicBillingPlansFromEnvironment,
  extractSubscriberJourneySessionId,
  makeRuntimeEnvironment,
  makePlatformEnvironmentLayer,
  getPublicWebSnapshot,
  getProductAppSnapshot,
  getAdminAppSnapshot,
  getPublicWebSnapshotForRequest,
  getProductAppSnapshotForRequest,
  getAdminAppSnapshotForRequest,
  getAdminAppSnapshotForRequestWithGovernanceService,
  resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
  validateProductAppAuthCallbackRedirectUriFromEnvironment,
} from "@comvestec/platform";

const createSignedProductAuthStateToken = async (input: {
  readonly secret: string;
  readonly payload: unknown;
}) => {
  const encodedPayload = Buffer.from(
    JSON.stringify(input.payload),
    "utf8",
  ).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );

  return `${encodedPayload}.${btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")}`;
};

describe("platform services", () => {
  it("creates a runtime environment with redacted secrets", async () => {
    const runtimeEnvironment = await Effect.runPromise(
      makeRuntimeEnvironment({
        nodeEnv: "development",
        appBaseUrl: "http://localhost:3000",
        convexUrl: "http://127.0.0.1:3210",
        convexSiteUrl: "http://127.0.0.1:3211",
        convexAdminKey: "admin-key",
        postgresUrl: "postgresql://user:pass@localhost:5432/db",
        keycloakBaseUrl: "http://localhost:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "secret",
        keycloakConvexServiceActorUsername: "convex.billing.service",
        keycloakConvexServiceActorPassword: "service-secret",
        otelEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
        valkeyUrl: "redis://localhost:6379",
        unleashUrl: "http://localhost:4242",
        unleashApiKey: "default:development.unleash-insecure-api-token",
        ketoReadUrl: "http://localhost:4466",
        ketoWriteUrl: "http://localhost:4467",
        errorTrackingDsn: "https://glitchtip.local/api/1/store/",
        openpanelClientId: "client_demo",
        openpanelApiUrl: "http://localhost:3005/api",
        novuApiKey: "novu-api-key",
        novuApiUrl: "http://localhost:3100",
        meilisearchUrl: "http://localhost:7700",
        meilisearchApiKey: "meili-master-key",
        polarAccessToken: "polar-access-token",
        polarApiUrl: "http://localhost:8888",
        polarWebhookSecret: "polar-webhook-secret",
        openmeterUrl: "http://localhost:8889",
        openmeterApiKey: "openmeter-api-key",
        postalApiUrl: "http://localhost:5000",
        postalApiKey: "postal-api-key",
      }),
    );

    expect(runtimeEnvironment.keycloakRealm).toBe("comvestec");
    expect(makePlatformEnvironmentLayer).toBeDefined();
  });

  it("resolves subscriber journey runtime options from required environment", async () => {
    await expect(
      Effect.runPromise(
        resolveSubscriberJourneyRuntimeOptionsFromEnvironment({
          POSTGRES_URL:
            "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
          CONVEX_SELF_HOSTED_URL: "http://127.0.0.1:3210",
          CONVEX_SELF_HOSTED_SITE_URL: "http://127.0.0.1:6791",
          CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
          KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "saas-platform",
          KEYCLOAK_CLIENT_SECRET: "change-me",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
          POLAR_ACCESS_TOKEN: "polar-access-token",
          POLAR_API_URL: "http://127.0.0.1:8888",
          VALKEY_URL: "redis://127.0.0.1:6379",
          KETO_READ_URL: "http://127.0.0.1:4466",
          KETO_WRITE_URL: "http://127.0.0.1:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      convexUrl: "http://127.0.0.1:3210",
      convexSiteUrl: "http://127.0.0.1:6791",
      convexAdminKey: "convex-admin-key",
      keycloakBaseUrl: "http://127.0.0.1:8080",
      keycloakRealm: "comvestec",
      keycloakClientId: "saas-platform",
      keycloakClientSecret: "change-me",
      keycloakConvexServiceActorUsername: "convex.billing.service",
      keycloakConvexServiceActorPassword: "service-secret",
      polarAccessToken: "polar-access-token",
      polarApiUrl: "http://127.0.0.1:8888",
      valkeyUrl: "redis://127.0.0.1:6379",
      ketoReadUrl: "http://127.0.0.1:4466",
      ketoWriteUrl: "http://127.0.0.1:4467",
    });
  });

  it("resolves subscriber journey runtime options from the Convex worker environment", async () => {
    await expect(
      Effect.runPromise(
        resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment({
          POSTGRES_URL_INTERNAL:
            "postgresql://comvestec:comvestec@postgres:5432/comvestec",
          KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
          KEYCLOAK_BASE_URL_INTERNAL: "http://keycloak:8080",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "saas-platform",
          KEYCLOAK_CLIENT_SECRET: "change-me",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
          POLAR_ACCESS_TOKEN: "polar-access-token",
          POLAR_API_URL: "http://polar:8888",
          VALKEY_URL_INTERNAL: "redis://valkey:6379",
          KETO_READ_URL_INTERNAL: "http://keto-read:4466",
          KETO_WRITE_URL_INTERNAL: "http://keto-write:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgresql://comvestec:comvestec@postgres:5432/comvestec",
      keycloakBaseUrl: "http://keycloak:8080",
      keycloakRealm: "comvestec",
      keycloakClientId: "saas-platform",
      keycloakClientSecret: "change-me",
      keycloakConvexServiceActorUsername: "convex.billing.service",
      keycloakConvexServiceActorPassword: "service-secret",
      polarAccessToken: "polar-access-token",
      polarApiUrl: "http://polar:8888",
      valkeyUrl: "redis://valkey:6379",
      ketoReadUrl: "http://keto-read:4466",
      ketoWriteUrl: "http://keto-write:4467",
    });
  });

  it("fails subscriber journey runtime option resolution when required env is missing", async () => {
    const error = await Effect.runPromise(
      Effect.flip(resolveSubscriberJourneyRuntimeOptionsFromEnvironment({})),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    expect(error.message).toContain("POSTGRES_URL");
  });

  it("fails Convex worker runtime option resolution when required env is missing", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment({}),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    expect(error.message).toContain("POSTGRES_URL_INTERNAL");
  });

  it("fails Convex worker runtime option resolution for empty required env values", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment({
          POSTGRES_URL_INTERNAL: "",
          KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
          KEYCLOAK_BASE_URL_INTERNAL: "http://keycloak:8080",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "saas-platform",
          KEYCLOAK_CLIENT_SECRET: "change-me",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
          POLAR_ACCESS_TOKEN: "polar-access-token",
          POLAR_API_URL: "http://polar:8888",
          VALKEY_URL_INTERNAL: "redis://valkey:6379",
          KETO_READ_URL_INTERNAL: "http://keto-read:4466",
          KETO_WRITE_URL_INTERNAL: "http://keto-write:4467",
        }),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    expect(error.message).toContain("POSTGRES_URL_INTERNAL");
  });

  it("requires Convex host values in the standard subscriber journey environment", async () => {
    const baseEnvironment = {
      POSTGRES_URL: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      CONVEX_SELF_HOSTED_URL: "http://127.0.0.1:3210",
      CONVEX_SELF_HOSTED_SITE_URL: "http://127.0.0.1:6791",
      CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
      KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
      KEYCLOAK_REALM: "comvestec",
      KEYCLOAK_CLIENT_ID: "saas-platform",
      KEYCLOAK_CLIENT_SECRET: "change-me",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
      POLAR_ACCESS_TOKEN: "polar-access-token",
      POLAR_API_URL: "http://127.0.0.1:8888",
      VALKEY_URL: "redis://127.0.0.1:6379",
      KETO_READ_URL: "http://127.0.0.1:4466",
      KETO_WRITE_URL: "http://127.0.0.1:4467",
    };

    for (const key of [
      "CONVEX_SELF_HOSTED_URL",
      "CONVEX_SELF_HOSTED_SITE_URL",
      "CONVEX_SELF_HOSTED_ADMIN_KEY",
    ] as const) {
      const invalidEnvironment = { ...baseEnvironment, [key]: "" };
      const error = await Effect.runPromise(
        Effect.flip(
          resolveSubscriberJourneyRuntimeOptionsFromEnvironment(
            invalidEnvironment,
          ),
        ),
      );

      expect(error).toBeInstanceOf(ParseResult.ParseError);
      expect(error.message).toContain(key);
    }
  });

  it("requires Convex host values to be present in the standard subscriber journey environment", async () => {
    const baseEnvironment = {
      POSTGRES_URL: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      CONVEX_SELF_HOSTED_URL: "http://127.0.0.1:3210",
      CONVEX_SELF_HOSTED_SITE_URL: "http://127.0.0.1:6791",
      CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
      KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
      KEYCLOAK_REALM: "comvestec",
      KEYCLOAK_CLIENT_ID: "saas-platform",
      KEYCLOAK_CLIENT_SECRET: "change-me",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
      POLAR_ACCESS_TOKEN: "polar-access-token",
      POLAR_API_URL: "http://127.0.0.1:8888",
      VALKEY_URL: "redis://127.0.0.1:6379",
      KETO_READ_URL: "http://127.0.0.1:4466",
      KETO_WRITE_URL: "http://127.0.0.1:4467",
    };

    for (const key of [
      "CONVEX_SELF_HOSTED_URL",
      "CONVEX_SELF_HOSTED_SITE_URL",
      "CONVEX_SELF_HOSTED_ADMIN_KEY",
    ] as const) {
      const invalidEnvironment = { ...baseEnvironment } as Record<
        string,
        string
      >;

      delete invalidEnvironment[key];

      const error = await Effect.runPromise(
        Effect.flip(
          resolveSubscriberJourneyRuntimeOptionsFromEnvironment(
            invalidEnvironment,
          ),
        ),
      );

      expect(error).toBeInstanceOf(ParseResult.ParseError);
      expect(error.message).toContain(key);
    }
  });

  it("requires Convex host values in the Convex worker environment", async () => {
    const baseEnvironment = {
      POSTGRES_URL_INTERNAL:
        "postgresql://comvestec:comvestec@postgres:5432/comvestec",
      KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
      KEYCLOAK_BASE_URL_INTERNAL: "http://keycloak:8080",
      KEYCLOAK_REALM: "comvestec",
      KEYCLOAK_CLIENT_ID: "saas-platform",
      KEYCLOAK_CLIENT_SECRET: "change-me",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
      POLAR_ACCESS_TOKEN: "polar-access-token",
      POLAR_API_URL: "http://polar:8888",
      VALKEY_URL_INTERNAL: "redis://valkey:6379",
      KETO_READ_URL_INTERNAL: "http://keto-read:4466",
      KETO_WRITE_URL_INTERNAL: "http://keto-write:4467",
    };

    for (const key of [
      "KEYCLOAK_BASE_URL",
      "KEYCLOAK_BASE_URL_INTERNAL",
      "VALKEY_URL_INTERNAL",
      "KETO_READ_URL_INTERNAL",
    ] as const) {
      const invalidEnvironment = { ...baseEnvironment, [key]: "" };
      const error = await Effect.runPromise(
        Effect.flip(
          resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment(
            invalidEnvironment,
          ),
        ),
      );

      expect(error).toBeInstanceOf(ParseResult.ParseError);
      expect(error.message).toContain(key);
    }
  });

  it("requires Convex host values to be present in the Convex worker environment", async () => {
    const baseEnvironment = {
      POSTGRES_URL_INTERNAL:
        "postgresql://comvestec:comvestec@postgres:5432/comvestec",
      KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
      KEYCLOAK_BASE_URL_INTERNAL: "http://keycloak:8080",
      KEYCLOAK_REALM: "comvestec",
      KEYCLOAK_CLIENT_ID: "saas-platform",
      KEYCLOAK_CLIENT_SECRET: "change-me",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
      KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
      POLAR_ACCESS_TOKEN: "polar-access-token",
      POLAR_API_URL: "http://polar:8888",
      VALKEY_URL_INTERNAL: "redis://valkey:6379",
      KETO_READ_URL_INTERNAL: "http://keto-read:4466",
      KETO_WRITE_URL_INTERNAL: "http://keto-write:4467",
    };

    for (const key of [
      "KEYCLOAK_BASE_URL",
      "KEYCLOAK_BASE_URL_INTERNAL",
      "VALKEY_URL_INTERNAL",
      "KETO_READ_URL_INTERNAL",
    ] as const) {
      const invalidEnvironment = { ...baseEnvironment } as Record<
        string,
        string
      >;

      delete invalidEnvironment[key];

      const error = await Effect.runPromise(
        Effect.flip(
          resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment(
            invalidEnvironment,
          ),
        ),
      );

      expect(error).toBeInstanceOf(ParseResult.ParseError);
      expect(error.message).toContain(key);
    }
  });

  it("fails subscriber journey runtime option resolution for empty required env values", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveSubscriberJourneyRuntimeOptionsFromEnvironment({
          POSTGRES_URL: "",
          CONVEX_SELF_HOSTED_URL: "http://127.0.0.1:3210",
          CONVEX_SELF_HOSTED_SITE_URL: "http://127.0.0.1:6791",
          CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
          KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "saas-platform",
          KEYCLOAK_CLIENT_SECRET: "change-me",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.billing.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "service-secret",
          POLAR_ACCESS_TOKEN: "polar-access-token",
          POLAR_API_URL: "http://127.0.0.1:8888",
          VALKEY_URL: "redis://127.0.0.1:6379",
          KETO_READ_URL: "http://127.0.0.1:4466",
          KETO_WRITE_URL: "http://127.0.0.1:4467",
        }),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    expect(error.message).toContain("POSTGRES_URL");
  });

  it("fails direct subscriber journey helpers when required environment is missing", async () => {
    const publicCatalogExit = await Effect.runPromiseExit(
      listPublicBillingPlansFromEnvironment({}),
    );

    const productBootstrapExit = await Effect.runPromiseExit(
      buildProductBootstrapFromEnvironment({}, { sessionId: "sess_transport" }),
    );

    expect(publicCatalogExit._tag).toBe("Failure");
    expect(productBootstrapExit._tag).toBe("Failure");
  });

  it("extracts subscriber journey session ids from header or cookie", async () => {
    await expect(
      Effect.runPromise(
        extractSubscriberJourneySessionId(
          new Request("http://localhost:3000", {
            headers: {
              "x-comvestec-session-id": "  sess_header  ",
            },
          }),
        ),
      ),
    ).resolves.toBe("sess_header");

    await expect(
      Effect.runPromise(
        extractSubscriberJourneySessionId(
          new Request("http://localhost:3000", {
            headers: {
              cookie: "other=value; comvestec_session=sess%3Acookie",
            },
          }),
        ),
      ),
    ).resolves.toBe("sess:cookie");
  });

  it("falls back to the raw subscriber journey session cookie when decoding fails", async () => {
    await expect(
      Effect.runPromise(
        extractSubscriberJourneySessionId(
          new Request("http://localhost:3000", {
            headers: {
              cookie: "comvestec_session=%E0%A4%A",
            },
          }),
        ),
      ),
    ).resolves.toBe("%E0%A4%A");
  });

  it("serializes subscriber journey session cookies for callback responses", () => {
    expect(buildSubscriberJourneySessionCookieHeader("sess:callback")).toBe(
      "comvestec_session=sess%3Acallback; Path=/; HttpOnly; SameSite=Lax",
    );
    expect(
      buildSubscriberJourneySessionCookieHeader("sess:callback", {
        secure: true,
      }),
    ).toBe(
      "comvestec_session=sess%3Acallback; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
  });

  it("allows only the approved product auth callback redirect uri", async () => {
    await expect(
      Effect.runPromise(
        validateProductAppAuthCallbackRedirectUriFromEnvironment(
          { PRODUCT_APP_BASE_URL: "http://localhost:3002" },
          "http://localhost:3002/auth/callback",
        ),
      ),
    ).resolves.toBe("http://localhost:3002/auth/callback");

    await expect(
      Effect.runPromise(
        Effect.flip(
          validateProductAppAuthCallbackRedirectUriFromEnvironment(
            { PRODUCT_APP_BASE_URL: "http://localhost:3002" },
            "https://evil.example.com/auth/callback",
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackRedirectNotAllowedError",
      redirectUri: "https://evil.example.com/auth/callback",
      expectedRedirectUri: "http://localhost:3002/auth/callback",
    });
  });

  it("fails product auth callback redirect validation for invalid environment input", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        validateProductAppAuthCallbackRedirectUriFromEnvironment(
          { PRODUCT_APP_BASE_URL: "" },
          "http://localhost:3002/auth/callback",
        ),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    if (!(error instanceof ParseResult.ParseError)) {
      throw error;
    }

    expect(error.message).toContain("PRODUCT_APP_BASE_URL");
  });

  it("fails product auth callback redirect validation for malformed redirect URIs", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        validateProductAppAuthCallbackRedirectUriFromEnvironment(
          { PRODUCT_APP_BASE_URL: "http://localhost:3002" },
          "/auth/callback",
        ),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    if (!(error instanceof ParseResult.ParseError)) {
      throw error;
    }

    expect(error.message).toContain("/auth/callback");
  });

  it("round-trips signed product auth callback state", async () => {
    const environment = {
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };
    const state = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(environment, {
        correlationId: "corr_signed_state",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_signed_state",
          enterpriseId: "ent_signed_state",
          organizationId: "org_signed_state",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    await expect(
      Effect.runPromise(
        decodeProductAppAuthCallbackStateFromEnvironment(environment, state),
      ),
    ).resolves.toMatchObject({
      correlationId: "corr_signed_state",
      redirectUri: "http://localhost:3002/auth/callback",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_signed_state",
      },
      enabledModules: [
        platformModuleId.tenantManagement,
        platformModuleId.identitySession,
        platformModuleId.billingAndMetering,
      ],
    });
  });

  it("rejects a state token with a tampered HMAC signature", async () => {
    const environment = {
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };
    const validState = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(environment, {
        correlationId: "corr_tamper",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_tamper",
          enterpriseId: "ent_tamper",
          organizationId: "org_tamper",
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    // Flip the first character of the signature to create a structurally valid
    // but cryptographically invalid token.
    const [encodedPayload, sig] = validState.split(".");
    const tamperedSignaturePrefix = sig!.startsWith("A") ? "B" : "A";
    const tampered = `${encodedPayload}.${tamperedSignaturePrefix}${sig!.slice(1)}`;

    await expect(
      Effect.runPromise(
        Effect.flip(
          decodeProductAppAuthCallbackStateFromEnvironment(
            environment,
            tampered,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackStateInvalidError",
    });
  });

  it("rejects malformed state tokens with a typed invalid-state error", async () => {
    const environment = {
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };

    await expect(
      Effect.runPromise(
        Effect.flip(
          decodeProductAppAuthCallbackStateFromEnvironment(
            environment,
            "not-a-valid-state-token",
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackStateInvalidError",
      reason: "State token format is invalid.",
    });
  });

  it("rejects malformed state token signature characters with a typed invalid-state error", async () => {
    const environment = {
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };

    await expect(
      Effect.runPromise(
        Effect.flip(
          decodeProductAppAuthCallbackStateFromEnvironment(
            environment,
            "abc.***",
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackStateInvalidError",
      reason: "State token signature is invalid.",
    });
  });

  it("rejects a state token whose expiresAt is in the past", async () => {
    const environment = {
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };
    const now = new Date("2026-04-19T00:00:00.000Z");
    const expiredState = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(environment, {
        correlationId: "corr_expired",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_expired",
          enterpriseId: "ent_expired",
          organizationId: "org_expired",
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: new Date(now.getTime() - 1_000).toISOString(),
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          decodeProductAppAuthCallbackStateFromEnvironment(
            environment,
            expiredState,
            now,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackStateExpiredError",
    });
  });

  it("rejects a signed state token whose expiresAt is parseable but not a real ISO timestamp", async () => {
    const environment = {
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };
    const malformedState = await createSignedProductAuthStateToken({
      secret: environment.KEYCLOAK_CLIENT_SECRET,
      payload: {
        correlationId: "corr_invalid_expiry",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_invalid_expiry",
          enterpriseId: "ent_invalid_expiry",
          organizationId: "org_invalid_expiry",
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: "Tue, 19 Apr 2026 12:00:00 GMT",
      },
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          decodeProductAppAuthCallbackStateFromEnvironment(
            environment,
            malformedState,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackStateInvalidError",
      reason: "State token payload is invalid.",
    });
  });

  it("rejects a signed state token whose expiresAt has an impossible ISO calendar date", async () => {
    const environment = {
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };
    const malformedState = await createSignedProductAuthStateToken({
      secret: environment.KEYCLOAK_CLIENT_SECRET,
      payload: {
        correlationId: "corr_impossible_expiry",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_impossible_expiry",
          enterpriseId: "ent_impossible_expiry",
          organizationId: "org_impossible_expiry",
        },
        enabledModules: [platformModuleId.identitySession],
        expiresAt: "2026-02-31T12:00:00.000Z",
      },
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          decodeProductAppAuthCallbackStateFromEnvironment(
            environment,
            malformedState,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackStateInvalidError",
      reason: "State token payload is invalid.",
    });
  });

  it("builds effect-backed app snapshots", async () => {
    await expect(
      Effect.runPromise(getPublicWebSnapshot),
    ).resolves.toMatchObject({
      application: "Public web",
      platformRuntime: "effect",
      branding: { moduleId: platformModuleId.tenantBranding },
      requestContext: {
        actorType: actorType.anonymous,
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      },
    });
    await expect(
      Effect.runPromise(getProductAppSnapshot),
    ).resolves.toMatchObject({
      application: "Product app",
      manifest: { moduleId: platformModuleId.tenantManagement },
      brandingManifest: { moduleId: platformModuleId.tenantBranding },
      requestContext: {
        actorType: actorType.organizationMember,
        tenant: { scope: platformScope.organization, scopeId: "org_demo" },
      },
    });
    await expect(Effect.runPromise(getAdminAppSnapshot)).resolves.toMatchObject(
      {
        application: "Admin app",
        manifest: { moduleId: platformModuleId.runtimeConfig },
        brandingManifest: { moduleId: platformModuleId.tenantBranding },
        requestContext: {
          actorType: actorType.platformOperator,
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      },
    );
  });

  it("builds public web snapshot for a custom request context", async () => {
    const snapshot = await Effect.runPromise(
      getPublicWebSnapshotForRequest({
        actorType: actorType.anonymous,
        correlationId: "public-web.custom",
        host: platformHost.localDevelopment,
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );

    expect(snapshot.application).toBe("Public web");
    expect(snapshot.requestContext.correlationId).toBe("public-web.custom");
    expect(snapshot.branding.moduleId).toBe(platformModuleId.tenantBranding);
  });

  it("builds product app snapshot for a custom request context", async () => {
    const snapshot = await Effect.runPromise(
      getProductAppSnapshotForRequest({
        actorType: actorType.organizationMember,
        actorId: "usr_custom_member",
        sessionId: "sess_custom",
        correlationId: "product-app.custom",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_custom",
          enterpriseId: "ent_custom",
          organizationId: "org_custom",
          individualId: "usr_custom_member",
        },
      }),
    );

    expect(snapshot.application).toBe("Product app");
    expect(snapshot.requestContext.actorId).toBe("usr_custom_member");
    expect(snapshot.manifest.moduleId).toBe(platformModuleId.tenantManagement);
  });

  it("builds admin app snapshot for a custom request context", async () => {
    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequest({
        actorType: actorType.platformOperator,
        actorId: "usr_custom_admin",
        sessionId: "sess_custom_admin",
        correlationId: "admin-app.custom",
        reason: "Custom admin inspection",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );

    expect(snapshot.application).toBe("Admin app");
    expect(snapshot.requestContext.actorId).toBe("usr_custom_admin");
    expect(snapshot.manifest.moduleId).toBe(platformModuleId.runtimeConfig);
  });

  it("builds an admin app snapshot through the direct governance service boundary", async () => {
    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequestWithGovernanceService(
        {
          actorType: actorType.platformOperator,
          actorId: "usr_governance_admin",
          sessionId: "sess_governance_admin",
          correlationId: "admin-app.governance",
          reason: "Review persisted runtime state",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        {
          listRuntimeConfigOverrides: (input) =>
            Effect.succeed(
              input.moduleId === platformModuleId.tenantBranding
                ? [
                    {
                      moduleId: input.moduleId,
                      key: tenantBrandingConfigKey.companyName,
                      scope: platformScope.organization,
                      scopeId: "org_demo",
                      value: "Acme Organization",
                      source: runtimeResolutionSource.runtimeOverride,
                      changedBy: "usr_governance_admin",
                      changedAt: "2026-04-17T10:00:00.000Z",
                      approvalReason: "Approved override",
                    },
                  ]
                : [],
            ),
          listRuntimeConfigProposals: (input) =>
            Effect.succeed(
              input.moduleId === platformModuleId.tenantBranding
                ? [
                    {
                      proposalId: "tenant-branding:companyName:update",
                      moduleId: input.moduleId,
                      key: tenantBrandingConfigKey.companyName,
                      action: runtimeChangeProposalAction.update,
                      artifactPath:
                        "specs/00-governance/runtime-config-proposals/tenant-branding.companyName.json",
                      runtimeValue: "Acme Organization",
                      status: runtimeConfigSyncArtifactStatus.pending,
                      generatedAt: "2026-04-17T10:00:00.000Z",
                    },
                  ]
                : [],
            ),
          queryAuditEventsByModule: (input) =>
            Effect.succeed(
              input.moduleId === platformModuleId.runtimeConfig
                ? [
                    {
                      eventId: "runtime-config:override:1",
                      timestamp: "2026-04-17T10:00:00.000Z",
                      actorId: "usr_governance_admin",
                      tenantScope: platformScope.platform,
                      tenantScopeId: platformScope.platform,
                      moduleId: input.moduleId,
                      action: runtimeConfigAuditAction.overrideChanged,
                      target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
                      reason: "Approved override",
                      correlationId: "admin-app.governance",
                    },
                  ]
                : [],
            ),
        },
      ),
    );

    expect(snapshot.application).toBe("Admin app");
    expect(snapshot.governancePreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          overrides: [
            expect.objectContaining({
              key: tenantBrandingConfigKey.companyName,
            }),
          ],
          proposals: [
            expect.objectContaining({
              action: runtimeChangeProposalAction.update,
            }),
          ],
        }),
        expect.objectContaining({
          moduleId: platformModuleId.runtimeConfig,
          auditEvents: [
            expect.objectContaining({
              action: runtimeConfigAuditAction.overrideChanged,
            }),
          ],
        }),
      ]),
    );
  });

  it("denies non-operator admin app governance snapshots", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        getAdminAppSnapshotForRequestWithGovernanceService(
          {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "admin-app.denied",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          {
            listRuntimeConfigOverrides: () => Effect.succeed([]),
            listRuntimeConfigProposals: () => Effect.succeed([]),
            queryAuditEventsByModule: () => Effect.succeed([]),
          },
        ),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("Expected admin governance snapshot access to fail.");
    }
    expect(result.left).toMatchObject({
      _tag: "AdminAppSnapshotAccessDeniedError",
      actorType: actorType.organizationAdmin,
    });
  });

  it("returns MissingModuleManifestError for unknown module", async () => {
    const getRequiredModuleManifest = (moduleId: string) =>
      Effect.fromNullable(
        findModuleManifest(
          moduleId as typeof platformModuleId.tenantManagement,
        ),
      ).pipe(
        Effect.mapError(() => ({
          _tag: "MissingModuleManifestError" as const,
          moduleId,
        })),
      );

    const validResult = await Effect.runPromiseExit(
      getRequiredModuleManifest(platformModuleId.tenantManagement),
    );
    expect(validResult._tag).toBe("Success");

    const invalidResult = await Effect.runPromiseExit(
      getRequiredModuleManifest("nonexistent-module"),
    );
    expect(invalidResult._tag).toBe("Failure");
  });
});
