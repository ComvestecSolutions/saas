import type { AuthConfig } from "convex/server";

type ConvexAuthEnvironment = {
  readonly KEYCLOAK_REALM: string;
  readonly KEYCLOAK_CLIENT_ID: string;
  readonly KEYCLOAK_BASE_URL: string;
  readonly KEYCLOAK_BASE_URL_INTERNAL: string;
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

const deduplicate = <A>(values: ReadonlyArray<A>) => [...new Set(values)];

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
  KEYCLOAK_BASE_URL_INTERNAL: requireNonEmptyEnvironmentValue(
    "KEYCLOAK_BASE_URL_INTERNAL",
    process.env.KEYCLOAK_BASE_URL_INTERNAL,
  ),
};

const keycloakRealm = convexAuthEnvironment.KEYCLOAK_REALM;

const keycloakClientId = convexAuthEnvironment.KEYCLOAK_CLIENT_ID;

const keycloakIssuerUrls = deduplicate(
  [
    convexAuthEnvironment.KEYCLOAK_BASE_URL,
    convexAuthEnvironment.KEYCLOAK_BASE_URL_INTERNAL,
  ].map((baseUrl) =>
    buildIssuerUrl({
      baseUrl,
      realm: keycloakRealm,
    }),
  ),
);

export default {
  providers: keycloakIssuerUrls.map((domain) => ({
    domain,
    applicationID: keycloakClientId,
  })),
} satisfies AuthConfig;
