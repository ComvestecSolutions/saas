import { Schema } from "effect";

export const convexDeploymentManagedEnvironmentShape = {
  POSTGRES_URL_INTERNAL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL_INTERNAL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
  VALKEY_URL_INTERNAL: Schema.NonEmptyString,
  UNLEASH_URL_INTERNAL: Schema.NonEmptyString,
  UNLEASH_API_KEY: Schema.NonEmptyString,
  MEILISEARCH_URL_INTERNAL: Schema.NonEmptyString,
  MEILISEARCH_API_KEY: Schema.NonEmptyString,
  KETO_READ_URL_INTERNAL: Schema.NonEmptyString,
  KETO_WRITE_URL_INTERNAL: Schema.NonEmptyString,
} as const;

export const ConvexDeploymentManagedEnvironmentSchema = Schema.Struct(
  convexDeploymentManagedEnvironmentShape,
);

export type ConvexDeploymentManagedEnvironment = Schema.Schema.Type<
  typeof ConvexDeploymentManagedEnvironmentSchema
>;

export const convexDeploymentManagedEnvironmentVariableNames = Object.keys(
  convexDeploymentManagedEnvironmentShape,
) as Array<keyof ConvexDeploymentManagedEnvironment>;
