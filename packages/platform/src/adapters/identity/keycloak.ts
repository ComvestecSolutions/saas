import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const KeycloakAdapterOptionsSchema = Schema.Struct({
  baseUrl: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
});

const KeycloakLoginRedirectInputSchema = Schema.Struct({
  tenantHint: Schema.optional(Schema.NonEmptyString),
  displayNameHint: Schema.optional(Schema.NonEmptyString),
  returnHost: Schema.optional(Schema.NonEmptyString),
});

export const KeycloakSessionSchema = Schema.Struct({
  authenticated: Schema.Literal(true),
  sessionId: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
});

export type KeycloakSession = Schema.Schema.Type<typeof KeycloakSessionSchema>;

export const KeycloakLoginRedirectSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  displayNameHint: Schema.optional(Schema.NonEmptyString),
  returnHost: Schema.optional(Schema.NonEmptyString),
});

export type KeycloakLoginRedirect = Schema.Schema.Type<
  typeof KeycloakLoginRedirectSchema
>;

const KeycloakHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.keycloak,
);

export type KeycloakHealthcheck = Schema.Schema.Type<
  typeof KeycloakHealthcheckSchema
>;

export type KeycloakAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.keycloak;
  readonly issuerUrl: string;
  readonly realm: string;
  readonly healthcheck: Effect.Effect<KeycloakHealthcheck>;
  readonly buildLoginRedirect: (
    input: unknown,
  ) => Effect.Effect<KeycloakLoginRedirect, ParseResult.ParseError>;
  readonly validateSession: (
    input: unknown,
  ) => Effect.Effect<KeycloakSession, ParseResult.ParseError>;
};

export class KeycloakAdapter extends Context.Tag("KeycloakAdapter")<
  KeycloakAdapter,
  KeycloakAdapterService
>() {}

export const makeKeycloakAdapter = (input: unknown) =>
  Schema.decodeUnknown(KeycloakAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): KeycloakAdapterService => ({
        serviceName: platformAdapterServiceName.keycloak,
        issuerUrl: `${options.baseUrl}/realms/${options.realm}`,
        realm: options.realm,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.keycloak,
        }),
        buildLoginRedirect: (loginInput: unknown) =>
          Schema.decodeUnknown(KeycloakLoginRedirectInputSchema)(
            loginInput,
          ).pipe(
            Effect.flatMap((decodedInput) =>
              Schema.decodeUnknown(KeycloakLoginRedirectSchema)({
                url:
                  `${options.baseUrl}/realms/${options.realm}/protocol/openid-connect/auth` +
                  `?tenant_hint=${encodeURIComponent(decodedInput.tenantHint ?? "")}` +
                  `&return_host=${encodeURIComponent(decodedInput.returnHost ?? "")}`,
                realm: options.realm,
                tenantHint: decodedInput.tenantHint,
                displayNameHint: decodedInput.displayNameHint,
                returnHost: decodedInput.returnHost,
              }),
            ),
          ),
        validateSession: (sessionInput: unknown) =>
          Schema.decodeUnknown(KeycloakSessionSchema)(sessionInput),
      }),
    ),
  );

export const makeKeycloakAdapterLayer = (options: unknown) =>
  Layer.effect(KeycloakAdapter, makeKeycloakAdapter(options));
