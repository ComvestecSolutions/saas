import { convexDeploymentManagedEnvironmentVariableNames } from "../../tooling/scripts/convex/environment-variables";

describe("convex environment sync allowlist", () => {
  it("syncs only deployment-managed worker environment variables", () => {
    expect([...convexDeploymentManagedEnvironmentVariableNames].sort()).toEqual(
      [
        "KETO_READ_URL_INTERNAL",
        "KETO_WRITE_URL_INTERNAL",
        "KEYCLOAK_BASE_URL",
        "KEYCLOAK_BASE_URL_INTERNAL",
        "KEYCLOAK_CLIENT_ID",
        "KEYCLOAK_CLIENT_SECRET",
        "KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD",
        "KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME",
        "KEYCLOAK_REALM",
        "MEILISEARCH_API_KEY",
        "MEILISEARCH_URL_INTERNAL",
        "POLAR_ACCESS_TOKEN",
        "POLAR_API_URL",
        "POSTGRES_URL_INTERNAL",
        "UNLEASH_API_KEY",
        "UNLEASH_URL_INTERNAL",
        "VALKEY_URL_INTERNAL",
      ],
    );
  });
});
