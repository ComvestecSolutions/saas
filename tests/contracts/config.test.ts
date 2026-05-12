import { Schema } from "effect";
import {
  PlatformDefaultsSchema,
  PlatformEnvironmentSchema,
} from "@comvestec/config";

describe("contract config", () => {
  it("builds a validated platform environment", () => {
    const environment = Schema.decodeUnknownSync(PlatformEnvironmentSchema)({
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
    });

    expect(environment.keycloakRealm).toBe("comvestec");
  });

  it("builds validated platform defaults", () => {
    const defaults = Schema.decodeUnknownSync(PlatformDefaultsSchema)({
      architecture: "modular-monolith",
      runtime: "effect",
      storage: {
        primaryAppState: "convex",
        systemRecords: "postgresql",
        fileStorage: "convex",
      },
      tenancy: {
        scopes: ["platform", "enterprise", "organization", "individual"],
      },
      security: {
        fieldLevelAccess: true,
        sensitiveReadAudit: true,
        auditPermissionChanges: true,
      },
    });

    expect(defaults.runtime).toBe("effect");
  });
});
