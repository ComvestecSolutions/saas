import { Schema } from "effect";
import type { AuthConfig } from "convex/server";

const ConvexAuthEnvironmentSchema = Schema.Struct({
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL_INTERNAL: Schema.NonEmptyString,
});

const decodeConvexAuthEnvironment = Schema.decodeUnknownSync(
  ConvexAuthEnvironmentSchema,
);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const buildIssuerUrl = (input: {
  readonly baseUrl: string;
  readonly realm: string;
}) => `${trimTrailingSlash(input.baseUrl)}/realms/${input.realm}`;

const deduplicate = <A>(values: ReadonlyArray<A>) => [...new Set(values)];

const convexAuthEnvironment = decodeConvexAuthEnvironment({
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM?.trim(),
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID?.trim(),
  KEYCLOAK_BASE_URL: process.env.KEYCLOAK_BASE_URL?.trim(),
  KEYCLOAK_BASE_URL_INTERNAL: process.env.KEYCLOAK_BASE_URL_INTERNAL?.trim(),
});

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
