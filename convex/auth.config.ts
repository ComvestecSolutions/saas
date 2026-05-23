import type { AuthConfig } from "convex/server";

type ConvexAuthEnvironment = {
  readonly KEYCLOAK_REALM: string;
  readonly KEYCLOAK_CLIENT_ID: string;
  readonly KEYCLOAK_BASE_URL: string;
};

const requireNonEmptyEnvironmentValue = (
  name: keyof ConvexAuthEnvironment,
  value: string | undefined,
) => {
  const trimmedValue = value?.trim();

  if (trimmedValue === undefined || trimmedValue.length === 0) {
    throw new Error(`${name} must be set to a non-empty string.`);
  }

  return trimmedValue;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const buildIssuerUrl = (input: {
  readonly baseUrl: string;
  readonly realm: string;
}) => `${trimTrailingSlash(input.baseUrl)}/realms/${input.realm}`;

const convexAuthEnvironment: ConvexAuthEnvironment = {
  KEYCLOAK_REALM: requireNonEmptyEnvironmentValue(
    "KEYCLOAK_REALM",
    process.env.KEYCLOAK_REALM,
  ),
  KEYCLOAK_CLIENT_ID: requireNonEmptyEnvironmentValue(
    "KEYCLOAK_CLIENT_ID",
    process.env.KEYCLOAK_CLIENT_ID,
  ),
  KEYCLOAK_BASE_URL: requireNonEmptyEnvironmentValue(
    "KEYCLOAK_BASE_URL",
    process.env.KEYCLOAK_BASE_URL,
  ),
};

const keycloakRealm = convexAuthEnvironment.KEYCLOAK_REALM;

const keycloakClientId = convexAuthEnvironment.KEYCLOAK_CLIENT_ID;

// Convex auth providers must use the public issuer URL. Internal Docker-only
// transport hosts such as http://keycloak:8080 remain valid for worker runtime
// calls, but Convex rejects them in auth.config because they are not HTTPS or
// localhost-resolvable provider domains.
const keycloakIssuerUrl = buildIssuerUrl({
  baseUrl: convexAuthEnvironment.KEYCLOAK_BASE_URL,
  realm: keycloakRealm,
});

export default {
  providers: [
    {
      domain: keycloakIssuerUrl,
      applicationID: keycloakClientId,
    },
  ],
} satisfies AuthConfig;
