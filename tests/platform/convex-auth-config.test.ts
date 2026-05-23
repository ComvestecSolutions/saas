import { afterEach, describe, expect, it, vi } from "vitest";

const authConfigModulePath = "../../convex/auth.config";

const originalEnvironment = {
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM,
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
  KEYCLOAK_BASE_URL: process.env.KEYCLOAK_BASE_URL,
  KEYCLOAK_BASE_URL_INTERNAL: process.env.KEYCLOAK_BASE_URL_INTERNAL,
};

const restoreEnvironment = () => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
      continue;
    }

    process.env[name] = value;
  }
};

describe("convex auth config", () => {
  afterEach(() => {
    restoreEnvironment();
    vi.resetModules();
  });

  it("uses only the public Keycloak issuer URL for Convex providers", async () => {
    process.env.KEYCLOAK_REALM = "comvestec";
    process.env.KEYCLOAK_CLIENT_ID = "saas-platform";
    process.env.KEYCLOAK_BASE_URL = "http://localhost:8080";
    process.env.KEYCLOAK_BASE_URL_INTERNAL = "http://keycloak:8080";

    vi.resetModules();

    const authConfigModule = await import(authConfigModulePath);

    expect(authConfigModule.default).toEqual({
      providers: [
        {
          applicationID: "saas-platform",
          domain: "http://localhost:8080/realms/comvestec",
        },
      ],
    });
  });

  it("fails when the public Keycloak base URL is missing", async () => {
    process.env.KEYCLOAK_REALM = "comvestec";
    process.env.KEYCLOAK_CLIENT_ID = "saas-platform";
    delete process.env.KEYCLOAK_BASE_URL;
    process.env.KEYCLOAK_BASE_URL_INTERNAL = "http://keycloak:8080";

    vi.resetModules();

    await expect(import(authConfigModulePath)).rejects.toThrow(
      "KEYCLOAK_BASE_URL must be set to a non-empty string.",
    );
  });
});
