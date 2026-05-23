import { spawnSync } from "child_process";
import { Effect, ParseResult } from "effect";
import {
  actorType,
  billingPlanInterval,
  billingPlanVisibility,
  customDomainLifecycleState,
  platformModuleId,
  platformScope,
  runtimeConfigAuditAction,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  type PlatformModuleId,
  workflowJobStatus,
} from "@comvestec/contracts";
import {
  emailDeliveryFeatureFlag,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import { platformHost, findModuleManifest } from "@comvestec/config";
import {
  makeRuntimeConfigModule,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigPostgresRepositoryService,
  runtimeConfigSyncArtifactStatus,
} from "@comvestec/modules";
import {
  buildAdminAppAuthStartInputFromEnvironment,
  createAdminAppAuthCallbackStateFromEnvironment,
  buildProductBootstrapFromEnvironment,
  buildProductBootstrapFromSessionId,
  buildClearedSubscriberJourneySessionCookieHeader,
  buildSubscriberJourneySessionCookieHeader,
  cancelBillingRepairGapFromSessionId,
  createManagedBillingPlanFromSessionId,
  createProductAppAuthCallbackStateFromEnvironment,
  createProductBillingCheckoutHandoffTokenFromEnvironment,
  createSubscriberCheckoutSessionFromRequest,
  decodeAdminAppAuthCallbackStateFromEnvironment,
  decodeProductBillingCheckoutHandoffTokenFromEnvironment,
  decodeProductAppAuthCallbackStateFromEnvironment,
  extractAuthenticatedWorkflowExecutionContext,
  extractAuthenticatedWorkflowExecutionContextFromHeaders,
  extractBearerToken,
  invalidateSubscriberSessionFromRequest,
  extractRequiredSubscriberJourneySessionId,
  extractRequiredSubscriberJourneySessionIdFromHeader,
  listPublicBillingPlansFromEnvironment,
  listBillingRepairGapsFromSessionId,
  replayBillingRepairGapFromWorkflowExecutionContext,
  extractSubscriberJourneySessionId,
  extractSubscriberJourneySessionIdFromHeader,
  makeRuntimeEnvironment,
  makePlatformEnvironmentLayer,
  getPublicWebSnapshot,
  getProductAppSnapshot,
  getAdminAppSnapshot,
  getPublicWebSnapshotForRequestContext,
  getPublicWebSnapshotForRequestContextWithRuntimeConfig,
  getProductAppSnapshotForRequestContext,
  getProductAppSnapshotForRequestContextWithRuntimeConfig,
  getAdminAppSnapshotForRequestContext,
  getAdminAppSnapshotForRequestContextWithGovernanceService,
  resolveSearchTransportRuntimeOptionsFromConvexEnvironment,
  resolveSubscriberRequestContextFromSessionId,
  resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
  runManualBillingReconciliationFromWorkflowExecutionContext,
  resolvePublicWebBillingReturnUrlsFromEnvironment,
  validateAdminAppAuthCallbackRedirectUriFromEnvironment,
  validateProductAppAuthCallbackRedirectUriFromEnvironment,
  validatePublicWebBillingReturnUrlFromEnvironment,
  startAdminAppAuthenticationFromEnvironment,
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

const createInMemoryRuntimeConfigRepository = (
  overrides: readonly RuntimeConfigOverrideRecord[],
): RuntimeConfigPostgresRepositoryService =>
  ({
    listOverridesByModule: (moduleId: PlatformModuleId) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
  }) as unknown as RuntimeConfigPostgresRepositoryService;

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
        openpanelClientSecret: "client_secret_demo",
        openpanelApiUrl: "http://localhost:3005/api",
        novuApiKey: "novu-api-key",
        novuApiUrl: "http://localhost:3101",
        meilisearchUrl: "http://localhost:7700",
        meilisearchApiKey: "meili-master-key",
        polarAccessToken: "polar-access-token",
        polarApiUrl: "http://localhost:8888",
        polarWebhookSecret: "polar-webhook-secret",
        openmeterUrl: "http://localhost:8889",
        openmeterApiKey: "openmeter-api-key",
        postalApiUrl: "http://localhost:5000",
        postalApiKey: "postal-api-key",
        platformEmailSenderDisplayName: "Comvestec Platform",
        platformEmailSenderFromEmail: "support@platform.example",
        platformEmailSenderReplyToEmail: "reply@platform.example",
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
          OPENMETER_URL: "http://127.0.0.1:8889",
          OPENMETER_API_KEY: "openmeter-api-key",
          VALKEY_URL: "redis://127.0.0.1:6379",
          UNLEASH_URL: "http://127.0.0.1:4242",
          UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
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
      openmeterUrl: "http://127.0.0.1:8889",
      openmeterApiKey: "openmeter-api-key",
      valkeyUrl: "redis://127.0.0.1:6379",
      unleashUrl: "http://127.0.0.1:4242",
      unleashApiKey: "default:development.unleash-insecure-api-token",
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
          UNLEASH_URL_INTERNAL: "http://unleash:4242",
          UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
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
      unleashUrl: "http://unleash:4242",
      unleashApiKey: "default:development.unleash-insecure-api-token",
      ketoReadUrl: "http://keto-read:4466",
      ketoWriteUrl: "http://keto-write:4467",
    });
  });

  it("resolves search runtime options from the Convex worker environment", async () => {
    await expect(
      Effect.runPromise(
        resolveSearchTransportRuntimeOptionsFromConvexEnvironment({
          CONVEX_CLOUD_URL: "http://127.0.0.1:3210",
          CONVEX_SITE_URL: "http://127.0.0.1:3211",
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
          UNLEASH_URL_INTERNAL: "http://unleash:4242",
          UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
          MEILISEARCH_URL_INTERNAL: "http://meilisearch:7700",
          MEILISEARCH_API_KEY: "meilisearch-api-key",
          KETO_READ_URL_INTERNAL: "http://keto-read:4466",
          KETO_WRITE_URL_INTERNAL: "http://keto-write:4467",
        }),
      ),
    ).resolves.toEqual({
      subscriberJourney: {
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
        unleashUrl: "http://unleash:4242",
        unleashApiKey: "default:development.unleash-insecure-api-token",
        ketoReadUrl: "http://keto-read:4466",
        ketoWriteUrl: "http://keto-write:4467",
      },
      convex: {
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
      },
      meilisearchUrl: "http://meilisearch:7700",
      meilisearchApiKey: "meilisearch-api-key",
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
      UNLEASH_URL: "http://127.0.0.1:4242",
      UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
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
      UNLEASH_URL: "http://127.0.0.1:4242",
      UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
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
      UNLEASH_URL_INTERNAL: "http://unleash:4242",
      UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
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
      UNLEASH_URL_INTERNAL: "http://unleash:4242",
      UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
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
          UNLEASH_URL: "http://127.0.0.1:4242",
          UNLEASH_API_KEY: "default:development.unleash-insecure-api-token",
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

  it("does not crash subscriber journey helper imports in a clean bun runtime", () => {
    const proc = spawnSync(
      "bun",
      [
        "-e",
        `import { Effect } from "effect";
import { runSubscriberJourneyFromEnvironment } from "./packages/platform/src/services/domains/subscriber-journey";
const exit = await Effect.runPromiseExit(
  runSubscriberJourneyFromEnvironment({}, (service) => service.listPublicPlans),
);
console.log(JSON.stringify({ exitTag: exit._tag }));`,
      ],
      {
        cwd: process.cwd(),
      },
    );

    expect(proc.status).toBe(0);
    expect(proc.stderr?.toString()).toBe("");
    expect(JSON.parse((proc.stdout ?? "").toString())).toEqual({
      exitTag: "Failure",
    });
  }, 20_000);

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

  it("extracts header-only subscriber journey session ids for backend-owned HTTP boundaries", async () => {
    await expect(
      Effect.runPromise(
        extractSubscriberJourneySessionIdFromHeader(
          new Request("http://localhost:3000", {
            headers: {
              "x-comvestec-session-id": "  sess_header_only  ",
              cookie: "comvestec_session=sess_cookie_only",
            },
          }),
        ),
      ),
    ).resolves.toBe("sess_header_only");

    await expect(
      Effect.runPromise(
        extractSubscriberJourneySessionIdFromHeader(
          new Request("http://localhost:3000", {
            headers: {
              cookie: "comvestec_session=sess_cookie_only",
            },
          }),
        ),
      ),
    ).resolves.toBeUndefined();

    await expect(
      Effect.runPromise(
        Effect.flip(
          extractRequiredSubscriberJourneySessionIdFromHeader(
            new Request("http://localhost:3000", {
              headers: {
                cookie: "comvestec_session=sess_cookie_only",
              },
            }),
          ),
        ),
      ),
    ).resolves.toEqual({
      _tag: "SubscriberJourneySessionIdMissingError",
    });
  });

  it("requires subscriber journey session ids when extracting first-party bootstrap transport", async () => {
    await expect(
      Effect.runPromise(
        Effect.flip(
          extractRequiredSubscriberJourneySessionId(
            new Request("http://localhost:3000"),
          ),
        ),
      ),
    ).resolves.toEqual({
      _tag: "SubscriberJourneySessionIdMissingError",
    });
  });

  it("builds product bootstrap requests from normalized first-party session transport", async () => {
    let capturedInput: { readonly sessionId: string } | undefined;

    await expect(
      Effect.runPromise(
        buildProductBootstrapFromSessionId(
          {},
          { sessionId: "sess:bootstrap_cookie" },
          (input) => {
            capturedInput = input;

            return Effect.succeed({
              requestContext: {
                actorType: actorType.organizationAdmin,
                actorId: "usr_bootstrap_cookie",
                sessionId: input.sessionId,
                correlationId: "corr_bootstrap_cookie",
                tenant: {
                  scope: platformScope.organization,
                  scopeId: "org_bootstrap_cookie",
                  organizationId: "org_bootstrap_cookie",
                },
              },
              authorization: {
                allowed: true,
                reason: "Allowed by persisted authorization relation.",
                cacheKey: "bootstrap:cookie:org_bootstrap_cookie",
                auditRequired: false,
              },
            });
          },
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          sessionId: "sess:bootstrap_cookie",
        }),
      }),
    );

    expect(capturedInput).toEqual({
      sessionId: "sess:bootstrap_cookie",
    });
  });

  it("extracts bearer tokens from authorization headers", async () => {
    await expect(
      Effect.runPromise(
        extractBearerToken(
          new Request("http://localhost:3000", {
            headers: {
              authorization: "Bearer token_value",
            },
          }),
        ),
      ),
    ).resolves.toBe("token_value");

    await expect(
      Effect.runPromise(
        extractBearerToken(
          new Request("http://localhost:3000", {
            headers: {
              authorization: "Basic token_value",
            },
          }),
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("builds authenticated workflow execution transport from shared request helpers", async () => {
    await expect(
      Effect.runPromise(
        extractAuthenticatedWorkflowExecutionContext(
          new Request("http://localhost:3000", {
            headers: {
              authorization: "Bearer token_value",
              cookie: "comvestec_session=sess%3Aworkflow",
            },
          }),
        ),
      ),
    ).resolves.toEqual({
      sessionId: "sess:workflow",
      convexAuthToken: "token_value",
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          extractAuthenticatedWorkflowExecutionContext(
            new Request("http://localhost:3000", {
              headers: {
                "x-comvestec-session-id": "sess_workflow",
              },
            }),
          ),
        ),
      ),
    ).resolves.toEqual({
      _tag: "BearerTokenMissingError",
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          extractAuthenticatedWorkflowExecutionContextFromHeaders(
            new Request("http://localhost:3000", {
              headers: {
                authorization: "Bearer token_value",
                cookie: "comvestec_session=sess%3Aworkflow",
              },
            }),
          ),
        ),
      ),
    ).resolves.toEqual({
      _tag: "SubscriberJourneySessionIdMissingError",
    });
  });

  it("builds request-context lookups from normalized first-party session transport", async () => {
    let capturedInput: { readonly sessionId: string } | undefined;

    await expect(
      Effect.runPromise(
        resolveSubscriberRequestContextFromSessionId(
          {},
          { sessionId: "sess:request_context" },
          (input) => {
            capturedInput = input;

            return Effect.succeed({
              actorType: actorType.organizationAdmin,
              actorId: "usr_request_context",
              sessionId: input.sessionId,
              correlationId: "corr_request_context",
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_request_context",
                organizationId: "org_request_context",
              },
            });
          },
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        sessionId: "sess:request_context",
      }),
    );

    expect(capturedInput).toEqual({
      sessionId: "sess:request_context",
    });
  });

  it("builds backend session invalidation requests from request-backed session transport", async () => {
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly correlationId: string;
          readonly reason: "logout" | "stale-session";
        }
      | undefined;

    await expect(
      Effect.runPromise(
        invalidateSubscriberSessionFromRequest(
          {},
          {
            request: new Request("http://localhost:3002/auth/logout", {
              headers: {
                cookie: "comvestec_session=sess%3Alogout_request",
              },
            }),
            correlationId: "corr_logout_request",
            reason: "logout",
          },
          (input) => {
            capturedInput = input;

            return Effect.succeed({
              sessionId: input.sessionId,
              correlationId: input.correlationId,
              reason: input.reason,
              invalidated: true,
            });
          },
        ),
      ),
    ).resolves.toEqual({
      sessionId: "sess:logout_request",
      correlationId: "corr_logout_request",
      reason: "logout",
      invalidated: true,
    });

    expect(capturedInput).toEqual({
      sessionId: "sess:logout_request",
      correlationId: "corr_logout_request",
      reason: "logout",
    });
  });

  it("skips backend session invalidation when no first-party session transport is present", async () => {
    let invalidationAttempted = false;

    await expect(
      Effect.runPromise(
        invalidateSubscriberSessionFromRequest(
          {},
          {
            request: new Request("http://localhost:3002/auth/stale-session"),
            correlationId: "corr_stale_request",
            reason: "stale-session",
          },
          () => {
            invalidationAttempted = true;

            return Effect.succeed({
              sessionId: "sess_unused",
              correlationId: "corr_stale_request",
              reason: "stale-session",
              invalidated: true,
            });
          },
        ),
      ),
    ).resolves.toBeUndefined();

    expect(invalidationAttempted).toBe(false);
  });

  it("builds checkout session requests from request-backed session transport", async () => {
    let capturedResolveInput: { readonly sessionId: string } | undefined;
    let capturedCheckoutInput:
      | {
          readonly planId: string;
          readonly priceId: string;
          readonly successUrl: string;
          readonly cancelUrl: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
        }
      | undefined;

    await expect(
      Effect.runPromise(
        createSubscriberCheckoutSessionFromRequest(
          {},
          {
            request: new Request(
              "http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_month",
              {
                headers: {
                  cookie: "comvestec_session=sess%3Acheckout_request",
                },
              },
            ),
            planId: "plan_growth",
            priceId: "price_growth_month",
            successPath: "/billing/success",
            cancelPath: "/billing/cancel",
          },
          (input) => {
            capturedResolveInput = input;

            return Effect.succeed({
              actorType: actorType.organizationAdmin,
              actorId: "usr_checkout_request",
              sessionId: input.sessionId,
              correlationId: "corr_checkout_request",
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_checkout_request",
                organizationId: "org_checkout_request",
              },
            });
          },
          (input) => {
            capturedCheckoutInput = input;

            return Effect.succeed({
              checkoutSessionId: "checkout_request_1",
              checkoutUrl:
                "https://billing.example.com/checkouts/checkout_request_1",
              planId: input.planId,
              priceId: input.priceId,
              interval: billingPlanInterval.month,
              provider: "polar",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            });
          },
        ),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: "checkout_request_1",
      checkoutUrl: "https://billing.example.com/checkouts/checkout_request_1",
    });

    expect(capturedResolveInput).toEqual({
      sessionId: "sess:checkout_request",
    });
    expect(capturedCheckoutInput).toEqual({
      planId: "plan_growth",
      priceId: "price_growth_month",
      successUrl: "http://localhost:3002/billing/success",
      cancelUrl: "http://localhost:3002/billing/cancel",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_checkout_request",
      organizationId: "org_checkout_request",
    });
  });

  it("preserves absolute checkout return URLs when they are already validated upstream", async () => {
    let capturedCheckoutInput:
      | {
          readonly planId: string;
          readonly priceId: string;
          readonly successUrl: string;
          readonly cancelUrl: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
        }
      | undefined;

    await expect(
      Effect.runPromise(
        createSubscriberCheckoutSessionFromRequest(
          {},
          {
            request: new Request(
              "http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_month",
              {
                headers: {
                  cookie: "comvestec_session=sess%3Acheckout_request",
                },
              },
            ),
            planId: "plan_growth",
            priceId: "price_growth_month",
            successUrl: "http://localhost:3000/billing/success",
            cancelUrl: "http://localhost:3000/billing/cancel",
          },
          (input) =>
            Effect.succeed({
              actorType: actorType.organizationAdmin,
              actorId: "usr_checkout_request",
              sessionId: input.sessionId,
              correlationId: "corr_checkout_request",
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_checkout_request",
                organizationId: "org_checkout_request",
              },
            }),
          (input) => {
            capturedCheckoutInput = input;

            return Effect.succeed({
              checkoutSessionId: "checkout_request_2",
              checkoutUrl:
                "https://billing.example.com/checkouts/checkout_request_2",
              planId: input.planId,
              priceId: input.priceId,
              interval: billingPlanInterval.month,
              provider: "polar",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            });
          },
        ),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: "checkout_request_2",
      checkoutUrl: "https://billing.example.com/checkouts/checkout_request_2",
    });

    expect(capturedCheckoutInput).toEqual({
      planId: "plan_growth",
      priceId: "price_growth_month",
      successUrl: "http://localhost:3000/billing/success",
      cancelUrl: "http://localhost:3000/billing/cancel",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_checkout_request",
      organizationId: "org_checkout_request",
    });
  });

  it("rejects absolute URLs passed through the local checkout return-path branch", async () => {
    let resolveAttempted = false;
    let checkoutAttempted = false;

    await expect(
      Effect.runPromise(
        Effect.flip(
          createSubscriberCheckoutSessionFromRequest(
            {},
            {
              request: new Request(
                "http://localhost:3002/billing/checkout?planId=plan_growth&priceId=price_growth_month",
                {
                  headers: {
                    cookie: "comvestec_session=sess%3Acheckout_request",
                  },
                },
              ),
              planId: "plan_growth",
              priceId: "price_growth_month",
              successPath: "https://evil.example.com/success",
              cancelPath: "/billing/cancel",
            },
            (input) => {
              resolveAttempted = true;

              return Effect.succeed({
                actorType: actorType.organizationAdmin,
                actorId: "usr_checkout_request",
                sessionId: input.sessionId,
                correlationId: "corr_checkout_request",
                tenant: {
                  scope: platformScope.organization,
                  scopeId: "org_checkout_request",
                  organizationId: "org_checkout_request",
                },
              });
            },
            () => {
              checkoutAttempted = true;

              return Effect.die(
                "checkout should not run for invalid local paths",
              );
            },
          ),
        ),
      ),
    ).resolves.toBeInstanceOf(ParseResult.ParseError);

    expect(resolveAttempted).toBe(true);
    expect(checkoutAttempted).toBe(false);
  });

  it("round-trips signed product billing checkout handoff tokens", async () => {
    const environment = {
      KEYCLOAK_CLIENT_SECRET: "billing-handoff-secret",
    };
    const token = await Effect.runPromise(
      createProductBillingCheckoutHandoffTokenFromEnvironment(environment, {
        planId: "plan_growth",
        priceId: "price_growth_month",
        successUrl: "http://localhost:3000/billing/success",
        cancelUrl: "http://localhost:3000/billing/cancel",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    await expect(
      Effect.runPromise(
        decodeProductBillingCheckoutHandoffTokenFromEnvironment(
          environment,
          token,
        ),
      ),
    ).resolves.toMatchObject({
      planId: "plan_growth",
      priceId: "price_growth_month",
      successUrl: "http://localhost:3000/billing/success",
      cancelUrl: "http://localhost:3000/billing/cancel",
    });
  });

  it("resolves and validates the approved public-web billing return URLs", async () => {
    const environment = {
      APP_BASE_URL: "http://localhost:3000",
    };

    await expect(
      Effect.runPromise(
        resolvePublicWebBillingReturnUrlsFromEnvironment(environment),
      ),
    ).resolves.toEqual({
      successUrl: "http://localhost:3000/billing/success",
      cancelUrl: "http://localhost:3000/billing/cancel",
    });

    await expect(
      Effect.runPromise(
        validatePublicWebBillingReturnUrlFromEnvironment(environment, {
          returnKind: "success",
          returnUrl: "http://localhost:3000/billing/success",
        }),
      ),
    ).resolves.toBe("http://localhost:3000/billing/success");

    await expect(
      Effect.runPromise(
        Effect.flip(
          validatePublicWebBillingReturnUrlFromEnvironment(environment, {
            returnKind: "cancel",
            returnUrl: "https://evil.example.com/cancel",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "PublicWebBillingReturnUrlMismatchError",
      returnKind: "cancel",
      expectedReturnUrl: "http://localhost:3000/billing/cancel",
    });
  });

  it("builds repair-gap list requests from normalized first-party session transport", async () => {
    let capturedInput: { readonly sessionId: string } | undefined;

    await expect(
      Effect.runPromise(
        listBillingRepairGapsFromSessionId(
          {},
          { sessionId: "sess_admin_gap_list" },
          (input) => {
            capturedInput = input;
            return Effect.succeed({ jobs: [] });
          },
        ),
      ),
    ).resolves.toEqual({ jobs: [] });

    expect(capturedInput).toEqual({
      sessionId: "sess_admin_gap_list",
    });
  });

  it("builds managed billing plan requests from normalized first-party session transport", async () => {
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly plan: {
            readonly planKey: string;
            readonly displayName: string;
            readonly visibility: string;
            readonly price: {
              readonly interval: string;
              readonly currency: string;
              readonly amountMinor: number;
            };
            readonly entitlements: readonly unknown[];
          };
        }
      | undefined;

    await expect(
      Effect.runPromise(
        createManagedBillingPlanFromSessionId(
          {},
          {
            sessionId: "sess_admin_plan_create",
            plan: {
              planKey: "scale",
              displayName: "Scale",
              visibility: billingPlanVisibility.draft,
              price: {
                interval: billingPlanInterval.month,
                currency: "USD",
                amountMinor: 4900,
              },
              entitlements: [],
            },
          },
          (input) => {
            capturedInput = {
              sessionId: input.sessionId,
              plan: {
                planKey: input.plan.planKey,
                displayName: input.plan.displayName,
                visibility: input.plan.visibility,
                price: {
                  interval: input.plan.price.interval,
                  currency: input.plan.price.currency,
                  amountMinor: input.plan.price.amountMinor,
                },
                entitlements: input.plan.entitlements,
              },
            };
            return Effect.succeed({
              plan: {
                planId: "plan_scale",
                planKey: input.plan.planKey,
                displayName: input.plan.displayName,
                active: true,
                prices: [],
                entitlements: input.plan.entitlements,
              },
              visibility: input.plan.visibility,
              provider: "polar",
            });
          },
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        plan: expect.objectContaining({
          planKey: "scale",
        }),
      }),
    );

    expect(capturedInput).toEqual({
      sessionId: "sess_admin_plan_create",
      plan: {
        planKey: "scale",
        displayName: "Scale",
        visibility: billingPlanVisibility.draft,
        price: {
          interval: billingPlanInterval.month,
          currency: "USD",
          amountMinor: 4900,
        },
        entitlements: [],
      },
    });
  });

  it("builds repair-gap replay requests from normalized first-party workflow transport", async () => {
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly convexAuthToken: string;
          readonly jobId: string;
        }
      | undefined;

    await expect(
      Effect.runPromise(
        replayBillingRepairGapFromWorkflowExecutionContext(
          {},
          {
            sessionId: "sess_admin_gap_replay",
            convexAuthToken: "token_value",
            jobId: "workflow-jobs:billing-repair:org_demo",
          },
          (input) => {
            capturedInput = input;
            return Effect.succeed({
              job: {
                jobId: input.jobId,
                tenantScope: platformScope.organization,
                tenantScopeId: "org_demo",
                status: workflowJobStatus.completed,
                attempts: 2,
                scheduledAt: "2026-04-20T09:00:00.000Z",
                completedAt: "2026-04-20T09:01:00.000Z",
              },
            });
          },
        ),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: "workflow-jobs:billing-repair:org_demo",
      }),
    });

    expect(capturedInput).toEqual({
      sessionId: "sess_admin_gap_replay",
      convexAuthToken: "token_value",
      jobId: "workflow-jobs:billing-repair:org_demo",
    });
  });

  it("builds repair-gap cancellation requests from normalized first-party workflow transport", async () => {
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly convexAuthToken: string;
          readonly jobId: string;
        }
      | undefined;

    await expect(
      Effect.runPromise(
        cancelBillingRepairGapFromSessionId(
          {},
          {
            sessionId: "sess:admin_gap_cancel",
            convexAuthToken: "token_value",
            jobId: "workflow-jobs:billing-repair:org_demo",
          },
          (input) => {
            capturedInput = input;
            return Effect.succeed({
              job: {
                jobId: input.jobId,
                tenantScope: platformScope.organization,
                tenantScopeId: "org_demo",
                status: workflowJobStatus.canceled,
                attempts: 2,
                scheduledAt: "2026-04-20T09:00:00.000Z",
                completedAt: "2026-04-20T09:01:00.000Z",
              },
            });
          },
        ),
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        jobId: "workflow-jobs:billing-repair:org_demo",
        status: workflowJobStatus.canceled,
      }),
    });

    expect(capturedInput).toEqual({
      sessionId: "sess:admin_gap_cancel",
      convexAuthToken: "token_value",
      jobId: "workflow-jobs:billing-repair:org_demo",
    });
  });

  it("builds manual reconciliation requests from normalized first-party workflow transport", async () => {
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly convexAuthToken: string;
          readonly now?: string;
        }
      | undefined;

    await expect(
      Effect.runPromise(
        runManualBillingReconciliationFromWorkflowExecutionContext(
          {},
          {
            sessionId: "sess_admin_manual_reconciliation",
            convexAuthToken: "token_value",
            now: "2026-04-20T09:00:00.000Z",
          },
          (input) => {
            capturedInput = {
              sessionId: input.sessionId,
              convexAuthToken: input.convexAuthToken,
              ...(input.now !== undefined ? { now: input.now } : {}),
            };
            return Effect.succeed({ jobs: [] });
          },
        ),
      ),
    ).resolves.toEqual({ jobs: [] });

    expect(capturedInput).toEqual({
      sessionId: "sess_admin_manual_reconciliation",
      convexAuthToken: "token_value",
      now: "2026-04-20T09:00:00.000Z",
    });
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
    expect(buildClearedSubscriberJourneySessionCookieHeader()).toBe(
      "comvestec_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    expect(
      buildClearedSubscriberJourneySessionCookieHeader({ secure: true }),
    ).toBe(
      "comvestec_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure",
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

  it("allows only the approved admin auth callback redirect uri", async () => {
    await expect(
      Effect.runPromise(
        validateAdminAppAuthCallbackRedirectUriFromEnvironment(
          { ADMIN_APP_BASE_URL: "http://localhost:3004" },
          "http://localhost:3004/auth/callback",
        ),
      ),
    ).resolves.toBe("http://localhost:3004/auth/callback");

    await expect(
      Effect.runPromise(
        Effect.flip(
          validateAdminAppAuthCallbackRedirectUriFromEnvironment(
            { ADMIN_APP_BASE_URL: "http://localhost:3004" },
            "https://evil.example.com/auth/callback",
          ),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ProductAppAuthCallbackRedirectNotAllowedError",
      redirectUri: "https://evil.example.com/auth/callback",
      expectedRedirectUri: "http://localhost:3004/auth/callback",
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
        postAuthRedirectPath:
          "/billing/checkout?planId=plan_growth&priceId=price_growth_monthly",
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
      postAuthRedirectPath:
        "/billing/checkout?planId=plan_growth&priceId=price_growth_monthly",
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

  it("round-trips signed admin auth callback state", async () => {
    const environment = {
      ADMIN_APP_BASE_URL: "http://localhost:3004",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };
    const state = await Effect.runPromise(
      createAdminAppAuthCallbackStateFromEnvironment(environment, {
        correlationId: "corr_admin_signed_state",
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

    await expect(
      Effect.runPromise(
        decodeAdminAppAuthCallbackStateFromEnvironment(environment, state),
      ),
    ).resolves.toMatchObject({
      correlationId: "corr_admin_signed_state",
      redirectUri: "http://localhost:3004/auth/callback",
      postAuthRedirectPath: "/governance/runtime-config",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
      enabledModules: [platformModuleId.identitySession],
    });
  });

  it("builds admin auth start input with the validated callback and signed state", async () => {
    const environment = {
      ADMIN_APP_BASE_URL: "http://localhost:3004",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };

    const authStartInput = await Effect.runPromise(
      buildAdminAppAuthStartInputFromEnvironment(environment, {
        host: "localhost:3004",
        correlationId: "corr_admin_start",
        postAuthRedirectPath: "/governance/runtime-config",
      }),
    );
    const { state } = authStartInput;

    if (state === undefined) {
      throw new Error("Expected admin auth-start state to be defined.");
    }

    const callbackUrl = new URL(authStartInput.redirectUri);
    const decodedState = await Effect.runPromise(
      decodeAdminAppAuthCallbackStateFromEnvironment(environment, state),
    );

    expect(authStartInput.requestContext.host).toBe("localhost:3004");
    expect(authStartInput.requestContext.tenant).toEqual({
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    });
    expect(authStartInput.displayNameHint).toBe("Comvestec Operations");
    expect(authStartInput.themeHint).toBe("#3b82f6");
    expect(callbackUrl.origin).toBe("http://localhost:3004");
    expect(callbackUrl.pathname).toBe("/auth/callback");
    expect(decodedState.correlationId).toBe("corr_admin_start");
    expect(decodedState.tenant).toEqual({
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    });
    expect(decodedState.postAuthRedirectPath).toBe(
      "/governance/runtime-config",
    );
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

  it("starts admin auth against the admin callback allowlist instead of the product callback allowlist", async () => {
    const environment = {
      ADMIN_APP_BASE_URL: "http://localhost:3004",
      PRODUCT_APP_BASE_URL: "http://localhost:3002",
      KEYCLOAK_CLIENT_SECRET: "state-secret",
    };
    let capturedInput:
      | Parameters<
          NonNullable<
            Parameters<typeof startAdminAppAuthenticationFromEnvironment>[2]
          >
        >[0]
      | undefined;

    await expect(
      Effect.runPromise(
        startAdminAppAuthenticationFromEnvironment(
          environment,
          {
            host: "localhost:3004",
            postAuthRedirectPath: "/governance/runtime-config",
          },
          (input) => {
            capturedInput = input;

            return Effect.succeed({
              correlationId: input.requestContext.correlationId,
              redirect: {
                url: "https://identity.example.com/auth",
                realm: "comvestec",
                redirectUri: input.redirectUri,
                displayNameHint: input.displayNameHint,
                themeHint: input.themeHint,
                ...(input.state === undefined ? {} : { state: input.state }),
              },
            });
          },
        ),
      ),
    ).resolves.toEqual({
      correlationId: expect.any(String),
      redirect: {
        url: "https://identity.example.com/auth",
        realm: "comvestec",
        redirectUri: "http://localhost:3004/auth/callback",
        displayNameHint: "Comvestec Operations",
        themeHint: "#3b82f6",
        state: expect.any(String),
      },
    });

    expect(capturedInput?.redirectUri).toBe(
      "http://localhost:3004/auth/callback",
    );
    expect(capturedInput?.requestContext.tenant).toEqual({
      scope: platformScope.platform,
      scopeId: platformScope.platform,
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
      getPublicWebSnapshotForRequestContext({
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

  it("builds public web snapshots with stored tenant-branding projection", async () => {
    let listOverridesCallCount = 0;

    const snapshot = await Effect.runPromise(
      getPublicWebSnapshotForRequestContextWithRuntimeConfig(
        {
          actorType: actorType.anonymous,
          correlationId: "public-web.custom.stored-branding",
          host: platformHost.localDevelopment,
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        {
          listOverridesByModule: (moduleId) => {
            listOverridesCallCount += 1;

            return Effect.succeed([
              {
                moduleId,
                key: tenantBrandingConfigKey.companyName,
                scope: platformScope.platform,
                scopeId: platformScope.platform,
                value: "Comvestec Platform",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_runtime_config",
                changedAt: "2026-04-25T10:00:00.000Z",
              },
            ]);
          },
          resolveConfigValue: ({ key, moduleId }) =>
            Effect.succeed({
              moduleId,
              key,
              effectiveValue:
                key === tenantBrandingConfigKey.companyName
                  ? "Comvestec Platform"
                  : "inherit",
              source:
                key === tenantBrandingConfigKey.companyName
                  ? runtimeResolutionSource.runtimeOverride
                  : runtimeResolutionSource.codeDefault,
              entitled: true,
              resolvedScope: platformScope.platform,
              resolvedScopeId: platformScope.platform,
            }),
        },
        [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            active: true,
            grantedAt: "2026-04-25T10:00:00.000Z",
          },
        ],
      ),
    );

    expect(listOverridesCallCount).toBe(1);
    expect(snapshot.branding.companyName).toBe("Comvestec Platform");
    expect(snapshot.branding.projection.companyName).toBe("Comvestec Platform");
    expect(snapshot.branding.projection.effectiveScope).toBe(
      platformScope.platform,
    );
  });

  it("keeps stored tenant-branding projection visible when entitlement metadata is false", async () => {
    const snapshot = await Effect.runPromise(
      getPublicWebSnapshotForRequestContextWithRuntimeConfig(
        {
          actorType: actorType.anonymous,
          correlationId: "public-web.custom.override-enabled-branding",
          host: platformHost.localDevelopment,
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        {
          listOverridesByModule: (moduleId) =>
            Effect.succeed([
              {
                moduleId,
                key: tenantBrandingConfigKey.companyName,
                scope: platformScope.platform,
                scopeId: platformScope.platform,
                value: "Comvestec Platform",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_runtime_config",
                changedAt: "2026-04-25T10:00:00.000Z",
              },
            ]),
          resolveConfigValue: ({ key, moduleId }) =>
            Effect.succeed({
              moduleId,
              key,
              effectiveValue:
                key === tenantBrandingConfigKey.companyName
                  ? "Comvestec Platform"
                  : "inherit",
              source:
                key === tenantBrandingConfigKey.companyName
                  ? runtimeResolutionSource.runtimeOverride
                  : runtimeResolutionSource.codeDefault,
              entitled: false,
              resolvedScope: platformScope.platform,
              resolvedScopeId: platformScope.platform,
            }),
        },
        [],
      ),
    );

    expect(snapshot.branding.companyName).toBe("Comvestec Platform");
    expect(snapshot.branding.projection.companyName).toBe("Comvestec Platform");
    expect(snapshot.branding.projection.entitled).toBe(false);
    expect(snapshot.branding.projection.effectiveScope).toBe(
      platformScope.platform,
    );
  });

  it("builds product app snapshot for a custom request context", async () => {
    const snapshot = await Effect.runPromise(
      getProductAppSnapshotForRequestContext({
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

  it("builds product app snapshots with stored tenant-branding projection", async () => {
    let listOverridesCallCount = 0;

    const snapshot = await Effect.runPromise(
      getProductAppSnapshotForRequestContextWithRuntimeConfig(
        {
          actorType: actorType.organizationMember,
          actorId: "usr_custom_member",
          sessionId: "sess_custom",
          correlationId: "product-app.custom.stored-branding",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_custom",
            enterpriseId: "ent_custom",
            organizationId: "org_custom",
            individualId: "usr_custom_member",
          },
        },
        {
          listOverridesByModule: (moduleId) => {
            listOverridesCallCount += 1;

            return Effect.succeed([
              {
                moduleId,
                key: tenantBrandingConfigKey.companyName,
                scope: platformScope.platform,
                scopeId: platformScope.platform,
                value: "Acme Organization",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_runtime_config",
                changedAt: "2026-04-25T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.themePrimary,
                scope: platformScope.platform,
                scopeId: platformScope.platform,
                value: "#14532D",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_runtime_config",
                changedAt: "2026-04-25T10:00:00.000Z",
              },
            ]);
          },
          resolveConfigValue: ({ key, moduleId }) =>
            Effect.succeed({
              moduleId,
              key,
              effectiveValue:
                key === tenantBrandingConfigKey.companyName
                  ? "Acme Organization"
                  : key === tenantBrandingConfigKey.themePrimary
                    ? "#14532D"
                    : "inherit",
              source:
                key === tenantBrandingConfigKey.companyName ||
                key === tenantBrandingConfigKey.themePrimary
                  ? runtimeResolutionSource.runtimeOverride
                  : runtimeResolutionSource.codeDefault,
              entitled: true,
              resolvedScope: platformScope.platform,
              resolvedScopeId: platformScope.platform,
            }),
        },
        [],
      ),
    );

    expect(listOverridesCallCount).toBe(1);
    expect(snapshot.branding.moduleId).toBe(platformModuleId.tenantBranding);
    expect(snapshot.branding.companyName).toBe("Acme Organization");
    expect(snapshot.branding.projection.companyName).toBe("Acme Organization");
    expect(snapshot.branding.projection.themeTokens.primary).toBe("#14532D");
    expect(snapshot.branding.projection.effectiveScope).toBe(
      platformScope.platform,
    );
  });

  it("builds admin app snapshot for a custom request context", async () => {
    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequestContext({
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
    expect(snapshot.branding.moduleId).toBe(platformModuleId.tenantBranding);
  });

  it("builds an admin app snapshot through the direct governance service boundary", async () => {
    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequestContextWithGovernanceService(
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

  it("builds admin app branding preview with tenant-scoped custom-domain state", async () => {
    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequestContextWithGovernanceService(
        {
          actorType: actorType.platformOperator,
          actorId: "usr_governance_admin",
          sessionId: "sess_governance_admin_branding",
          correlationId: "admin-app.governance.branding",
          reason: "Review tenant branding state",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            enterpriseId: "ent_demo",
            organizationId: "org_demo",
          },
        },
        {
          listRuntimeConfigOverrides: () => Effect.succeed([]),
          listRuntimeConfigProposals: () => Effect.succeed([]),
          queryAuditEventsByModule: () => Effect.succeed([]),
        },
        {
          listOverridesByModule: (moduleId) =>
            Effect.succeed([
              {
                moduleId,
                key: tenantBrandingConfigKey.companyName,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "Acme Organization",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.themePrimary,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "#14532D",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.customDomainHost,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "login.acme.example",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.replyToEmail,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "reply@acme.example",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
            ]),
          resolveConfigValue: ({ key, moduleId }) =>
            Effect.succeed({
              moduleId,
              key,
              effectiveValue:
                key === tenantBrandingConfigKey.companyName
                  ? "Acme Organization"
                  : key === tenantBrandingConfigKey.themePrimary
                    ? "#14532D"
                    : key === tenantBrandingConfigKey.customDomainHost
                      ? "login.acme.example"
                      : key === tenantBrandingConfigKey.replyToEmail
                        ? "reply@acme.example"
                        : "inherit",
              source:
                key === tenantBrandingConfigKey.companyName ||
                key === tenantBrandingConfigKey.themePrimary ||
                key === tenantBrandingConfigKey.customDomainHost ||
                key === tenantBrandingConfigKey.replyToEmail
                  ? runtimeResolutionSource.runtimeOverride
                  : runtimeResolutionSource.codeDefault,
              entitled: true,
              resolvedScope: platformScope.organization,
              resolvedScopeId: "org_demo",
            }),
          resolveStoredFeatureFlag: ({ moduleId, flag }) =>
            Effect.succeed({
              moduleId,
              key: flag.key,
              effectiveValue:
                flag.key === tenantBrandingFeatureFlag.enabled ||
                flag.key === tenantBrandingFeatureFlag.customDomain ||
                flag.key === tenantBrandingFeatureFlag.brandedEmails,
              source: runtimeResolutionSource.entitlement,
              entitled:
                flag.key === tenantBrandingFeatureFlag.enabled ||
                flag.key === tenantBrandingFeatureFlag.customDomain ||
                flag.key === tenantBrandingFeatureFlag.brandedEmails,
            }),
        },
        [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.brandedEmails,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
        ],
      ),
    );

    expect(snapshot.branding.companyName).toBe("Acme Organization");
    expect(snapshot.branding.projection.themeTokens.primary).toBe("#14532D");
    expect(snapshot.branding.projection.replyToEmail).toBe(
      "reply@acme.example",
    );
    expect(snapshot.branding.projection.customDomainHost).toBe(
      "login.acme.example",
    );
    expect(snapshot.branding.projection.customDomainStatus).toBe(
      customDomainLifecycleState.unverified,
    );
    expect(snapshot.branding.projection.effectiveScope).toBe(
      platformScope.organization,
    );
  });

  it("omits admin-only branding fields when subfeature entitlements are absent", async () => {
    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequestContextWithGovernanceService(
        {
          actorType: actorType.platformOperator,
          actorId: "usr_governance_admin",
          sessionId: "sess_governance_admin_branding_unentitled",
          correlationId: "admin-app.governance.branding.unentitled",
          reason: "Review tenant branding state",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            enterpriseId: "ent_demo",
            organizationId: "org_demo",
          },
        },
        {
          listRuntimeConfigOverrides: () => Effect.succeed([]),
          listRuntimeConfigProposals: () => Effect.succeed([]),
          queryAuditEventsByModule: () => Effect.succeed([]),
        },
        {
          listOverridesByModule: (moduleId) =>
            Effect.succeed([
              {
                moduleId,
                key: tenantBrandingConfigKey.companyName,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "Acme Organization",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.themePrimary,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "#14532D",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.customDomainHost,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "login.acme.example",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.replyToEmail,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "reply@acme.example",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
            ]),
          resolveConfigValue: ({ key, moduleId }) =>
            Effect.succeed({
              moduleId,
              key,
              effectiveValue:
                key === tenantBrandingConfigKey.companyName
                  ? "Acme Organization"
                  : key === tenantBrandingConfigKey.themePrimary
                    ? "#14532D"
                    : key === tenantBrandingConfigKey.customDomainHost
                      ? "login.acme.example"
                      : key === tenantBrandingConfigKey.replyToEmail
                        ? "reply@acme.example"
                        : "inherit",
              source:
                key === tenantBrandingConfigKey.companyName ||
                key === tenantBrandingConfigKey.themePrimary ||
                key === tenantBrandingConfigKey.customDomainHost ||
                key === tenantBrandingConfigKey.replyToEmail
                  ? runtimeResolutionSource.runtimeOverride
                  : runtimeResolutionSource.codeDefault,
              entitled: true,
              resolvedScope: platformScope.organization,
              resolvedScopeId: "org_demo",
            }),
          resolveStoredFeatureFlag: ({ moduleId, flag }) =>
            Effect.succeed({
              moduleId,
              key: flag.key,
              effectiveValue: flag.key === tenantBrandingFeatureFlag.enabled,
              source:
                flag.key === tenantBrandingFeatureFlag.enabled
                  ? runtimeResolutionSource.entitlement
                  : runtimeResolutionSource.unentitledDefault,
              entitled: flag.key === tenantBrandingFeatureFlag.enabled,
            }),
        },
        [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
        ],
      ),
    );

    expect(snapshot.branding.companyName).toBe("Acme Organization");
    expect(snapshot.branding.projection.themeTokens.primary).toBe("#14532D");
    expect(snapshot.branding.projection.replyToEmail).toBeUndefined();
    expect(snapshot.branding.projection.customDomainHost).toBeUndefined();
    expect(snapshot.branding.projection.customDomainStatus).toBe(
      customDomainLifecycleState.unverified,
    );
  });

  it("redacts confidential branding fields for support operators", async () => {
    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequestContextWithGovernanceService(
        {
          actorType: actorType.supportOperator,
          actorId: "usr_support_operator",
          sessionId: "sess_support_operator_branding",
          correlationId: "admin-app.governance.branding.support",
          reason: "Review tenant branding state",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            enterpriseId: "ent_demo",
            organizationId: "org_demo",
          },
        },
        {
          listRuntimeConfigOverrides: () => Effect.succeed([]),
          listRuntimeConfigProposals: () => Effect.succeed([]),
          queryAuditEventsByModule: () => Effect.succeed([]),
        },
        {
          listOverridesByModule: (moduleId) =>
            Effect.succeed([
              {
                moduleId,
                key: tenantBrandingConfigKey.companyName,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "Acme Organization",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.themePrimary,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "#14532D",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.customDomainHost,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "login.acme.example",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
              {
                moduleId,
                key: tenantBrandingConfigKey.replyToEmail,
                scope: platformScope.organization,
                scopeId: "org_demo",
                value: "reply@acme.example",
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: "usr_governance_admin",
                changedAt: "2026-04-29T10:00:00.000Z",
              },
            ]),
          resolveConfigValue: ({ key, moduleId }) =>
            Effect.succeed({
              moduleId,
              key,
              effectiveValue:
                key === tenantBrandingConfigKey.companyName
                  ? "Acme Organization"
                  : key === tenantBrandingConfigKey.themePrimary
                    ? "#14532D"
                    : key === tenantBrandingConfigKey.customDomainHost
                      ? "login.acme.example"
                      : key === tenantBrandingConfigKey.replyToEmail
                        ? "reply@acme.example"
                        : "inherit",
              source:
                key === tenantBrandingConfigKey.companyName ||
                key === tenantBrandingConfigKey.themePrimary ||
                key === tenantBrandingConfigKey.customDomainHost ||
                key === tenantBrandingConfigKey.replyToEmail
                  ? runtimeResolutionSource.runtimeOverride
                  : runtimeResolutionSource.codeDefault,
              entitled: true,
              resolvedScope: platformScope.organization,
              resolvedScopeId: "org_demo",
            }),
          resolveStoredFeatureFlag: ({ moduleId, flag }) =>
            Effect.succeed({
              moduleId,
              key: flag.key,
              effectiveValue:
                flag.key === tenantBrandingFeatureFlag.enabled ||
                flag.key === tenantBrandingFeatureFlag.customDomain ||
                flag.key === tenantBrandingFeatureFlag.brandedEmails,
              source: runtimeResolutionSource.entitlement,
              entitled:
                flag.key === tenantBrandingFeatureFlag.enabled ||
                flag.key === tenantBrandingFeatureFlag.customDomain ||
                flag.key === tenantBrandingFeatureFlag.brandedEmails,
            }),
        },
        [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.brandedEmails,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
        ],
      ),
    );

    expect(snapshot.branding.companyName).toBe("Acme Organization");
    expect(snapshot.branding.projection.themeTokens.primary).toBe("#14532D");
    expect(snapshot.branding.projection.replyToEmail).toBeUndefined();
    expect(snapshot.branding.projection.customDomainHost).toBeUndefined();
    expect(snapshot.branding.projection.customDomainStatus).toBe(
      customDomainLifecycleState.unverified,
    );
  });

  it("hides stored branded email fields when a persisted cross-module dependency disables the flag", async () => {
    const runtimeConfig = await Effect.runPromise(
      makeRuntimeConfigModule(
        createInMemoryRuntimeConfigRepository([
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            scope: platformScope.organization,
            scopeId: "org_demo",
            value: "Acme Organization",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_governance_admin",
            changedAt: "2026-04-29T10:00:00.000Z",
          },
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.replyToEmail,
            scope: platformScope.organization,
            scopeId: "org_demo",
            value: "reply@acme.example",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_governance_admin",
            changedAt: "2026-04-29T10:00:00.000Z",
          },
          {
            moduleId: platformModuleId.emailDelivery,
            key: emailDeliveryFeatureFlag.enabled,
            scope: platformScope.platform,
            scopeId: platformScope.platform,
            value: false,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_governance_admin",
            changedAt: "2026-04-29T10:00:00.000Z",
          },
        ]),
      ),
    );

    const snapshot = await Effect.runPromise(
      getAdminAppSnapshotForRequestContextWithGovernanceService(
        {
          actorType: actorType.platformOperator,
          actorId: "usr_governance_admin",
          sessionId: "sess_governance_admin_branding_dependency",
          correlationId: "admin-app.governance.branding.dependency",
          reason: "Review tenant branding state",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            enterpriseId: "ent_demo",
            organizationId: "org_demo",
          },
        },
        {
          listRuntimeConfigOverrides: () => Effect.succeed([]),
          listRuntimeConfigProposals: () => Effect.succeed([]),
          queryAuditEventsByModule: () => Effect.succeed([]),
        },
        runtimeConfig,
        [
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
          {
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.brandedEmails,
            scope: platformScope.organization,
            scopeId: "org_demo",
            active: true,
            grantedAt: "2026-04-29T10:00:00.000Z",
          },
        ],
      ),
    );

    expect(snapshot.branding.companyName).toBe("Acme Organization");
    expect(snapshot.branding.projection.replyToEmail).toBeUndefined();
  });

  it("denies non-operator admin app governance snapshots", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        getAdminAppSnapshotForRequestContextWithGovernanceService(
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
