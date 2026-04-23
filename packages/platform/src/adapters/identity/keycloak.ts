import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { AbsoluteRedirectUriSchema } from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const KeycloakAdapterRuntimeOptionsSchema = Schema.Struct({
  baseUrl: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
  clientId: Schema.NonEmptyString,
  clientSecret: Schema.NonEmptyString,
});

type KeycloakAdapterRuntimeOptions = Schema.Schema.Type<
  typeof KeycloakAdapterRuntimeOptionsSchema
>;

export type KeycloakAdapterOptions = KeycloakAdapterRuntimeOptions & {
  readonly fetch?: typeof fetch;
};

const KeycloakLoginRedirectInputSchema = Schema.Struct({
  tenantHint: Schema.optional(Schema.NonEmptyString),
  displayNameHint: Schema.optional(Schema.NonEmptyString),
  redirectUri: AbsoluteRedirectUriSchema,
  state: Schema.optional(Schema.NonEmptyString),
});

export type KeycloakLoginRedirectInput = Schema.Schema.Type<
  typeof KeycloakLoginRedirectInputSchema
>;

const KeycloakAccessTokenInputSchema = Schema.Struct({
  accessToken: Schema.NonEmptyString,
});

export type KeycloakAccessTokenInput = Schema.Schema.Type<
  typeof KeycloakAccessTokenInputSchema
>;

const KeycloakAuthorizationCodeInputSchema = Schema.Struct({
  authorizationCode: Schema.NonEmptyString,
  redirectUri: AbsoluteRedirectUriSchema,
});

export type KeycloakAuthorizationCodeInput = Schema.Schema.Type<
  typeof KeycloakAuthorizationCodeInputSchema
>;

const KeycloakPasswordGrantInputSchema = Schema.Struct({
  username: Schema.NonEmptyString,
  password: Schema.NonEmptyString,
});

export type KeycloakPasswordGrantInput = Schema.Schema.Type<
  typeof KeycloakPasswordGrantInputSchema
>;

export const KeycloakSessionSchema = Schema.Struct({
  authenticated: Schema.Literal(true),
  sessionId: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
});

export type KeycloakSession = Schema.Schema.Type<typeof KeycloakSessionSchema>;

export const KeycloakSessionInputSchema: Schema.Schema<
  KeycloakSession | KeycloakAccessTokenInput | KeycloakAuthorizationCodeInput,
  KeycloakSession | KeycloakAccessTokenInput | KeycloakAuthorizationCodeInput,
  never
> = Schema.Union(
  KeycloakSessionSchema,
  KeycloakAccessTokenInputSchema,
  KeycloakAuthorizationCodeInputSchema,
);

export type KeycloakSessionInput = Schema.Schema.Type<
  typeof KeycloakSessionInputSchema
>;

export const KeycloakLoginRedirectSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  displayNameHint: Schema.optional(Schema.NonEmptyString),
  redirectUri: AbsoluteRedirectUriSchema,
  state: Schema.optional(Schema.NonEmptyString),
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

const KeycloakWellKnownConfigurationSchema = Schema.Struct({
  issuer: Schema.NonEmptyString,
});

const KeycloakTokenExchangeResponseSchema = Schema.Struct({
  access_token: Schema.NonEmptyString,
  id_token: Schema.optional(Schema.NonEmptyString),
});

type KeycloakTokenExchangeResponse = Schema.Schema.Type<
  typeof KeycloakTokenExchangeResponseSchema
>;

const KeycloakTokenIntrospectionResponseSchema = Schema.Struct({
  active: Schema.Boolean,
  sub: Schema.optional(Schema.NonEmptyString),
  sid: Schema.optional(Schema.NonEmptyString),
  session_state: Schema.optional(Schema.NonEmptyString),
  iss: Schema.optional(Schema.NonEmptyString),
});

type KeycloakTokenIntrospectionResponse = Schema.Schema.Type<
  typeof KeycloakTokenIntrospectionResponseSchema
>;

export type KeycloakAdapterRequestError = {
  readonly _tag: "KeycloakAdapterRequestError";
  readonly operation:
    | "healthcheck"
    | "tokenExchange"
    | "tokenIntrospection"
    | "passwordGrant";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type KeycloakPasswordGrantIdTokenMissingError = {
  readonly _tag: "KeycloakPasswordGrantIdTokenMissingError";
  readonly realm: string;
  readonly clientId: string;
  readonly username: string;
};

export type KeycloakSessionInactiveError = {
  readonly _tag: "KeycloakSessionInactiveError";
  readonly realm: KeycloakSession["realm"];
};

export type KeycloakSessionIdentifierMissingError = {
  readonly _tag: "KeycloakSessionIdentifierMissingError";
  readonly realm: KeycloakSession["realm"];
  readonly actorId: KeycloakSession["actorId"];
};

export type KeycloakAdapterError =
  | ParseResult.ParseError
  | KeycloakAdapterRequestError
  | KeycloakSessionInactiveError
  | KeycloakSessionIdentifierMissingError;

type KeycloakRequestFailure = {
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

const isKeycloakRequestFailure = (
  cause: unknown,
): cause is KeycloakRequestFailure =>
  typeof cause === "object" && cause !== null && "cause" in cause;

const buildKeycloakRequestError = (
  operation: KeycloakAdapterRequestError["operation"],
  failure: KeycloakRequestFailure,
): KeycloakAdapterRequestError => ({
  _tag: "KeycloakAdapterRequestError",
  operation,
  cause: failure.cause,
  ...(failure.status !== undefined ? { status: failure.status } : {}),
  ...(failure.body !== undefined ? { body: failure.body } : {}),
});

const decodeKeycloakWellKnownConfiguration = Schema.decodeUnknown(
  KeycloakWellKnownConfigurationSchema,
);

const decodeKeycloakLoginRedirect = Schema.decodeUnknown(
  KeycloakLoginRedirectSchema,
);

const decodeKeycloakSession = Schema.decodeUnknown(KeycloakSessionSchema);

const decodeKeycloakSessionInput = Schema.decodeUnknown(
  KeycloakSessionInputSchema,
);

const decodeTokenExchangeResponse = Schema.decodeUnknown(
  KeycloakTokenExchangeResponseSchema,
);

const decodePasswordGrantInput = Schema.decodeUnknown(
  KeycloakPasswordGrantInputSchema,
);

const decodeTokenIntrospectionResponse = Schema.decodeUnknown(
  KeycloakTokenIntrospectionResponseSchema,
);

const stripRealmPrefix = (
  issuer: string | undefined,
  fallbackRealm: string,
) => {
  if (issuer === undefined) {
    return fallbackRealm;
  }

  const segments = issuer.split("/").filter((segment) => segment.length > 0);

  return segments[segments.length - 1] ?? fallbackRealm;
};

const createKeycloakRequest = <A>(options: {
  readonly operation: KeycloakAdapterRequestError["operation"];
  readonly url: string;
  readonly init?: RequestInit;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError>;
  readonly fetchImplementation: typeof fetch;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await options.fetchImplementation(
        options.url,
        options.init,
      );
      const responseText = await response.text();

      if (!response.ok) {
        throw {
          cause: response.statusText,
          status: response.status,
          body: responseText,
        } satisfies KeycloakRequestFailure;
      }

      return responseText.length === 0 ? {} : JSON.parse(responseText);
    },
    catch: (cause) => {
      if (isKeycloakRequestFailure(cause)) {
        return buildKeycloakRequestError(options.operation, cause);
      }

      return buildKeycloakRequestError(options.operation, { cause });
    },
  }).pipe(Effect.flatMap(options.decode));

export type KeycloakAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.keycloak;
  readonly issuerUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly healthcheck: Effect.Effect<
    KeycloakHealthcheck,
    ParseResult.ParseError | KeycloakAdapterRequestError
  >;
  readonly buildLoginRedirect: (
    input: KeycloakLoginRedirectInput,
  ) => Effect.Effect<KeycloakLoginRedirect, ParseResult.ParseError>;
  readonly validateSession: (
    input: KeycloakSessionInput,
  ) => Effect.Effect<KeycloakSession, KeycloakAdapterError>;
  readonly issueIdTokenWithPasswordGrant: (
    input: KeycloakPasswordGrantInput,
  ) => Effect.Effect<
    string,
    | ParseResult.ParseError
    | KeycloakAdapterRequestError
    | KeycloakPasswordGrantIdTokenMissingError
  >;
};

export class KeycloakAdapter extends Context.Tag("KeycloakAdapter")<
  KeycloakAdapter,
  KeycloakAdapterService
>() {}

export const makeKeycloakAdapter = (input: KeycloakAdapterOptions) =>
  Schema.decodeUnknown(KeycloakAdapterRuntimeOptionsSchema)(input).pipe(
    Effect.map((options): KeycloakAdapterService => {
      const fetchImplementation = input.fetch ?? fetch;
      const issuerUrl = `${options.baseUrl}/realms/${options.realm}`;
      const tokenEndpoint = `${issuerUrl}/protocol/openid-connect/token`;
      const introspectionEndpoint = `${issuerUrl}/protocol/openid-connect/token/introspect`;

      const introspectAccessToken = (accessToken: string) =>
        createKeycloakRequest({
          operation: "tokenIntrospection",
          url: introspectionEndpoint,
          init: {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: options.clientId,
              client_secret: options.clientSecret,
              token: accessToken,
            }).toString(),
          },
          decode: decodeTokenIntrospectionResponse,
          fetchImplementation,
        }).pipe(
          Effect.flatMap(
            (
              response,
            ): Effect.Effect<
              KeycloakSession,
              | ParseResult.ParseError
              | KeycloakAdapterRequestError
              | KeycloakSessionInactiveError
              | KeycloakSessionIdentifierMissingError
            > => {
              if (!response.active) {
                return Effect.fail({
                  _tag: "KeycloakSessionInactiveError",
                  realm: options.realm,
                } satisfies KeycloakSessionInactiveError);
              }

              const actorId = response.sub;
              const sessionId = response.sid ?? response.session_state;

              if (actorId === undefined || sessionId === undefined) {
                return Effect.fail({
                  _tag: "KeycloakSessionIdentifierMissingError",
                  realm: stripRealmPrefix(response.iss, options.realm),
                  actorId: actorId ?? "unknown-actor",
                } satisfies KeycloakSessionIdentifierMissingError);
              }

              return decodeKeycloakSession({
                authenticated: true,
                actorId,
                sessionId,
                realm: stripRealmPrefix(response.iss, options.realm),
              });
            },
          ),
        );

      const exchangeAuthorizationCode = (
        authorizationCode: KeycloakAuthorizationCodeInput,
      ) =>
        createKeycloakRequest({
          operation: "tokenExchange",
          url: tokenEndpoint,
          init: {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: options.clientId,
              client_secret: options.clientSecret,
              code: authorizationCode.authorizationCode,
              grant_type: "authorization_code",
              redirect_uri: authorizationCode.redirectUri,
            }).toString(),
          },
          decode: decodeTokenExchangeResponse,
          fetchImplementation,
        }).pipe(
          Effect.flatMap((response: KeycloakTokenExchangeResponse) =>
            introspectAccessToken(response.access_token),
          ),
        );

      const issueIdTokenWithPasswordGrant = (
        grantInput: KeycloakPasswordGrantInput,
      ) =>
        decodePasswordGrantInput(grantInput).pipe(
          Effect.flatMap((decodedInput) =>
            createKeycloakRequest({
              operation: "passwordGrant",
              url: tokenEndpoint,
              init: {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  client_id: options.clientId,
                  client_secret: options.clientSecret,
                  grant_type: "password",
                  scope: "openid",
                  username: decodedInput.username,
                  password: decodedInput.password,
                }).toString(),
              },
              decode: decodeTokenExchangeResponse,
              fetchImplementation,
            }).pipe(
              Effect.flatMap((response: KeycloakTokenExchangeResponse) =>
                response.id_token !== undefined
                  ? Effect.succeed(response.id_token)
                  : Effect.fail({
                      _tag: "KeycloakPasswordGrantIdTokenMissingError",
                      realm: options.realm,
                      clientId: options.clientId,
                      username: decodedInput.username,
                    } satisfies KeycloakPasswordGrantIdTokenMissingError),
              ),
            ),
          ),
        );

      return {
        serviceName: platformAdapterServiceName.keycloak,
        issuerUrl,
        realm: options.realm,
        clientId: options.clientId,
        healthcheck: createKeycloakRequest({
          operation: "healthcheck",
          url: `${issuerUrl}/.well-known/openid-configuration`,
          decode: decodeKeycloakWellKnownConfiguration,
          fetchImplementation,
        }).pipe(
          Effect.flatMap(() =>
            Schema.decodeUnknown(KeycloakHealthcheckSchema)({
              healthy: true,
              service: platformAdapterServiceName.keycloak,
            }),
          ),
        ),
        buildLoginRedirect: (loginInput: KeycloakLoginRedirectInput) =>
          Schema.decodeUnknown(KeycloakLoginRedirectInputSchema)(
            loginInput,
          ).pipe(
            Effect.flatMap((decodedInput) => {
              const authorizationUrl = new URL(
                `${issuerUrl}/protocol/openid-connect/auth`,
              );

              authorizationUrl.searchParams.set("client_id", options.clientId);
              authorizationUrl.searchParams.set("response_type", "code");
              authorizationUrl.searchParams.set("scope", "openid");
              authorizationUrl.searchParams.set(
                "redirect_uri",
                decodedInput.redirectUri,
              );

              if (decodedInput.tenantHint !== undefined) {
                authorizationUrl.searchParams.set(
                  "tenant_hint",
                  decodedInput.tenantHint,
                );
              }

              if (decodedInput.displayNameHint !== undefined) {
                authorizationUrl.searchParams.set(
                  "display_name_hint",
                  decodedInput.displayNameHint,
                );
              }

              if (decodedInput.state !== undefined) {
                authorizationUrl.searchParams.set("state", decodedInput.state);
              }

              return decodeKeycloakLoginRedirect({
                url: authorizationUrl.toString(),
                realm: options.realm,
                tenantHint: decodedInput.tenantHint,
                displayNameHint: decodedInput.displayNameHint,
                redirectUri: decodedInput.redirectUri,
                state: decodedInput.state,
              });
            }),
          ),
        validateSession: (sessionInput: KeycloakSessionInput) =>
          decodeKeycloakSessionInput(sessionInput).pipe(
            Effect.flatMap((decodedInput) => {
              if ("authenticated" in decodedInput) {
                return Effect.succeed(decodedInput);
              }

              if ("accessToken" in decodedInput) {
                return introspectAccessToken(decodedInput.accessToken);
              }

              return exchangeAuthorizationCode(decodedInput);
            }),
          ),
        issueIdTokenWithPasswordGrant,
      };
    }),
  );

export const makeKeycloakAdapterLayer = (options: KeycloakAdapterOptions) =>
  Layer.effect(KeycloakAdapter, makeKeycloakAdapter(options));
