import { Schema } from "effect";

export const PlatformEnvironmentSchema = Schema.Struct({
  nodeEnv: Schema.NonEmptyString,
  appBaseUrl: Schema.NonEmptyString,
  convexUrl: Schema.NonEmptyString,
  convexSiteUrl: Schema.NonEmptyString,
  convexAdminKey: Schema.NonEmptyString,
  postgresUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  otelEndpoint: Schema.NonEmptyString,
  grafanaBaseUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  unleashUrl: Schema.NonEmptyString,
  unleashApiKey: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
  errorTrackingDsn: Schema.NonEmptyString,
  posthogApiKey: Schema.NonEmptyString,
  posthogHost: Schema.NonEmptyString,
  novuApiKey: Schema.NonEmptyString,
  novuApiUrl: Schema.NonEmptyString,
  meilisearchUrl: Schema.NonEmptyString,
  meilisearchApiKey: Schema.NonEmptyString,
  polarApiKey: Schema.NonEmptyString,
  polarApiUrl: Schema.NonEmptyString,
  openmeterUrl: Schema.NonEmptyString,
  openmeterApiKey: Schema.NonEmptyString,
  postalApiUrl: Schema.NonEmptyString,
  postalApiKey: Schema.NonEmptyString,
});

export type PlatformEnvironment = Schema.Schema.Type<
  typeof PlatformEnvironmentSchema
>;
