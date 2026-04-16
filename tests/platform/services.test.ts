import { Effect } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { platformHost, findModuleManifest } from "@comvestec/config";
import {
  extractSubscriberJourneySessionId,
  makeRuntimeEnvironment,
  makePlatformEnvironmentLayer,
  getPublicWebSnapshot,
  getProductAppSnapshot,
  getAdminAppSnapshot,
  getPublicWebSnapshotForRequest,
  getProductAppSnapshotForRequest,
  getAdminAppSnapshotForRequest,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
} from "@comvestec/platform";

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
          KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "saas-platform",
          KEYCLOAK_CLIENT_SECRET: "change-me",
          POLAR_ACCESS_TOKEN: "polar-access-token",
          POLAR_API_URL: "http://127.0.0.1:8888",
          VALKEY_URL: "redis://127.0.0.1:6379",
          KETO_READ_URL: "http://127.0.0.1:4466",
          KETO_WRITE_URL: "http://127.0.0.1:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      keycloakBaseUrl: "http://127.0.0.1:8080",
      keycloakRealm: "comvestec",
      keycloakClientId: "saas-platform",
      keycloakClientSecret: "change-me",
      polarAccessToken: "polar-access-token",
      polarApiUrl: "http://127.0.0.1:8888",
      valkeyUrl: "redis://127.0.0.1:6379",
      ketoReadUrl: "http://127.0.0.1:4466",
      ketoWriteUrl: "http://127.0.0.1:4467",
    });
  });

  it("fails subscriber journey runtime option resolution when required env is missing", async () => {
    const exit = await Effect.runPromiseExit(
      resolveSubscriberJourneyRuntimeOptionsFromEnvironment({}),
    );

    expect(exit._tag).toBe("Failure");
  });

  it("fails subscriber journey runtime option resolution for empty required env values", async () => {
    const exit = await Effect.runPromiseExit(
      resolveSubscriberJourneyRuntimeOptionsFromEnvironment({
        POSTGRES_URL: "",
        KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
        KEYCLOAK_REALM: "comvestec",
        KEYCLOAK_CLIENT_ID: "saas-platform",
        KEYCLOAK_CLIENT_SECRET: "change-me",
        POLAR_ACCESS_TOKEN: "polar-access-token",
        POLAR_API_URL: "http://127.0.0.1:8888",
        VALKEY_URL: "redis://127.0.0.1:6379",
        KETO_READ_URL: "http://127.0.0.1:4466",
        KETO_WRITE_URL: "http://127.0.0.1:4467",
      }),
    );

    expect(exit._tag).toBe("Failure");
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
