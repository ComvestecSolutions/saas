import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  AbsoluteRedirectUriSchema,
  ActorTypeSchema,
  identityClaimKey,
} from "@comvestec/contracts";
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
  themeHint: Schema.optional(Schema.NonEmptyString),
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

const KeycloakIdentityTokenInputSchema = Schema.Struct({
  idToken: Schema.NonEmptyString,
});

export type KeycloakIdentityTokenInput = Schema.Schema.Type<
  typeof KeycloakIdentityTokenInputSchema
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

const KeycloakImpersonationInputSchema = Schema.Struct({
  impersonatedActorId: Schema.NonEmptyString,
});

export type KeycloakImpersonationInput = Schema.Schema.Type<
  typeof KeycloakImpersonationInputSchema
>;

const KeycloakSessionRevocationInputSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type KeycloakSessionRevocationInput = Schema.Schema.Type<
  typeof KeycloakSessionRevocationInputSchema
>;

export const KeycloakSessionSchema = Schema.Struct({
  authenticated: Schema.Literal(true),
  sessionId: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
  actorType: Schema.optional(ActorTypeSchema),
  tenantHint: Schema.optional(Schema.NonEmptyString),
});

export type KeycloakSession = Schema.Schema.Type<typeof KeycloakSessionSchema>;

export const KeycloakIdentityTokenValidationSchema = Schema.Struct({
  actorId: Schema.NonEmptyString,
  realm: Schema.NonEmptyString,
  actorType: Schema.optional(ActorTypeSchema),
  tenantHint: Schema.optional(Schema.NonEmptyString),
});

export type KeycloakIdentityTokenValidation = Schema.Schema.Type<
  typeof KeycloakIdentityTokenValidationSchema
>;

export const KeycloakImpersonationSessionSchema = Schema.Struct({
  session: KeycloakSessionSchema,
  idToken: Schema.NonEmptyString,
  expiresInSeconds: Schema.Number,
});

export type KeycloakImpersonationSession = Schema.Schema.Type<
  typeof KeycloakImpersonationSessionSchema
>;

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
  themeHint: Schema.optional(Schema.NonEmptyString),
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
  expires_in: Schema.Number,
  session_state: Schema.optional(Schema.NonEmptyString),
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
  tenant_hint: Schema.optional(Schema.NonEmptyString),
  [identityClaimKey.actorType]: Schema.optional(ActorTypeSchema),
});

type KeycloakTokenIntrospectionResponse = Schema.Schema.Type<
  typeof KeycloakTokenIntrospectionResponseSchema
>;

const KeycloakIdentityTokenHeaderSchema = Schema.Struct({
  alg: Schema.NonEmptyString,
  kid: Schema.optional(Schema.NonEmptyString),
  typ: Schema.optional(Schema.NonEmptyString),
});

type KeycloakIdentityTokenHeader = Schema.Schema.Type<
  typeof KeycloakIdentityTokenHeaderSchema
>;

const KeycloakIdentityTokenClaimsSchema = Schema.Struct({
  iss: Schema.NonEmptyString,
  aud: Schema.Union(Schema.NonEmptyString, Schema.Array(Schema.NonEmptyString)),
  sub: Schema.NonEmptyString,
  exp: Schema.Number,
  nbf: Schema.optional(Schema.Number),
  tenant_hint: Schema.optional(Schema.NonEmptyString),
  [identityClaimKey.actorType]: Schema.optional(ActorTypeSchema),
});

type KeycloakIdentityTokenClaims = Schema.Schema.Type<
  typeof KeycloakIdentityTokenClaimsSchema
>;

const KeycloakJsonWebKeySchema = Schema.Struct({
  kid: Schema.optional(Schema.NonEmptyString),
  kty: Schema.NonEmptyString,
  use: Schema.optional(Schema.NonEmptyString),
  alg: Schema.optional(Schema.NonEmptyString),
  n: Schema.optional(Schema.NonEmptyString),
  e: Schema.optional(Schema.NonEmptyString),
});

type KeycloakJsonWebKey = Schema.Schema.Type<typeof KeycloakJsonWebKeySchema>;

type KeycloakRsaJsonWebKey = KeycloakJsonWebKey & {
  readonly n: string;
  readonly e: string;
};

const KeycloakJsonWebKeySetSchema = Schema.Struct({
  keys: Schema.Array(KeycloakJsonWebKeySchema),
});

type KeycloakJsonWebKeySet = Schema.Schema.Type<
  typeof KeycloakJsonWebKeySetSchema
>;

export type KeycloakAdapterRequestError = {
  readonly _tag: "KeycloakAdapterRequestError";
  readonly operation:
    | "healthcheck"
    | "clientCredentialsGrant"
    | "tokenExchange"
    | "tokenIntrospection"
    | "tokenVerification"
    | "passwordGrant"
    | "sessionRevocation";
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

export type KeycloakImpersonationIdTokenMissingError = {
  readonly _tag: "KeycloakImpersonationIdTokenMissingError";
  readonly realm: string;
  readonly clientId: string;
  readonly impersonatedActorId: string;
};

export type KeycloakImpersonationActorMismatchError = {
  readonly _tag: "KeycloakImpersonationActorMismatchError";
  readonly realm: string;
  readonly requestedActorId: string;
  readonly sessionActorId: string;
};

type KeycloakImpersonationIssuedFailure =
  | ParseResult.ParseError
  | KeycloakAdapterRequestError
  | KeycloakSessionInactiveError
  | KeycloakSessionIdentifierMissingError
  | KeycloakImpersonationIdTokenMissingError
  | KeycloakImpersonationActorMismatchError;

export type KeycloakImpersonationCleanupUnavailableError = {
  readonly _tag: "KeycloakImpersonationCleanupUnavailableError";
  readonly issuanceFailure: KeycloakImpersonationIssuedFailure;
};

export type KeycloakImpersonationCompensationError = {
  readonly _tag: "KeycloakImpersonationCompensationError";
  readonly sessionId: string;
  readonly issuanceFailure: KeycloakImpersonationIssuedFailure;
  readonly revocationFailure: KeycloakAdapterRequestError;
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

const decodeKeycloakIdentityTokenInput = Schema.decodeUnknown(
  KeycloakIdentityTokenInputSchema,
);

const decodeKeycloakSessionInput = Schema.decodeUnknown(
  KeycloakSessionInputSchema,
);

const decodeTokenExchangeResponse = Schema.decodeUnknown(
  KeycloakTokenExchangeResponseSchema,
);

const decodePasswordGrantInput = Schema.decodeUnknown(
  KeycloakPasswordGrantInputSchema,
);

const decodeImpersonationInput = Schema.decodeUnknown(
  KeycloakImpersonationInputSchema,
);

const decodeSessionRevocationInput = Schema.decodeUnknown(
  KeycloakSessionRevocationInputSchema,
);

const decodeImpersonationSession = Schema.decodeUnknown(
  KeycloakImpersonationSessionSchema,
);

const decodeTokenIntrospectionResponse = Schema.decodeUnknown(
  KeycloakTokenIntrospectionResponseSchema,
);

const decodeIdentityTokenHeader = Schema.decodeUnknown(
  KeycloakIdentityTokenHeaderSchema,
);

const decodeIdentityTokenClaims = Schema.decodeUnknown(
  KeycloakIdentityTokenClaimsSchema,
);

const decodeJsonWebKeySet = Schema.decodeUnknown(KeycloakJsonWebKeySetSchema);

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

const readOptionalTokenExchangeSessionState = (responseText: string) => {
  const match = /"session_state"\s*:\s*"([^"]+)"/u.exec(responseText);

  return match?.[1] !== undefined && match[1].length > 0 ? match[1] : undefined;
};

const fetchKeycloakResponseText = (options: {
  readonly operation: KeycloakAdapterRequestError["operation"];
  readonly url: string;
  readonly init?: RequestInit;
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

      return responseText;
    },
    catch: (cause) => {
      if (isKeycloakRequestFailure(cause)) {
        return buildKeycloakRequestError(options.operation, cause);
      }

      return buildKeycloakRequestError(options.operation, { cause });
    },
  });

const parseKeycloakJsonResponse = (input: {
  readonly operation: KeycloakAdapterRequestError["operation"];
  readonly responseText: string;
}) =>
  Effect.try({
    try: () =>
      input.responseText.length === 0 ? {} : JSON.parse(input.responseText),
    catch: (cause) =>
      buildKeycloakRequestError(input.operation, {
        cause,
      }),
  });

const fetchKeycloakJson = (options: {
  readonly operation: KeycloakAdapterRequestError["operation"];
  readonly url: string;
  readonly init?: RequestInit;
  readonly fetchImplementation: typeof fetch;
}) =>
  fetchKeycloakResponseText(options).pipe(
    Effect.flatMap((responseText) =>
      parseKeycloakJsonResponse({
        operation: options.operation,
        responseText,
      }),
    ),
  );

const createKeycloakRequest = <A>(options: {
  readonly operation: KeycloakAdapterRequestError["operation"];
  readonly url: string;
  readonly init?: RequestInit;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError>;
  readonly fetchImplementation: typeof fetch;
}) =>
  fetchKeycloakJson(options).pipe(
    Effect.flatMap(options.decode),
    Effect.mapError(
      (error): KeycloakAdapterRequestError =>
        error._tag === "ParseError"
          ? buildKeycloakRequestError(options.operation, {
              cause: error,
            })
          : error,
    ),
  );

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
  readonly validateIdentityToken: (
    input: KeycloakIdentityTokenInput,
  ) => Effect.Effect<
    KeycloakIdentityTokenValidation,
    KeycloakAdapterRequestError | KeycloakSessionInactiveError
  >;
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
  readonly issueImpersonationSession: (
    input: KeycloakImpersonationInput,
  ) => Effect.Effect<
    KeycloakImpersonationSession,
    | ParseResult.ParseError
    | KeycloakAdapterRequestError
    | KeycloakSessionInactiveError
    | KeycloakSessionIdentifierMissingError
    | KeycloakImpersonationIdTokenMissingError
    | KeycloakImpersonationActorMismatchError
    | KeycloakImpersonationCleanupUnavailableError
    | KeycloakImpersonationCompensationError
  >;
  readonly revokeSession: (
    input: KeycloakSessionRevocationInput,
  ) => Effect.Effect<
    void,
    ParseResult.ParseError | KeycloakAdapterRequestError
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
      const adminRealmUrl = `${options.baseUrl}/admin/realms/${options.realm}`;
      const tokenEndpoint = `${issuerUrl}/protocol/openid-connect/token`;
      const introspectionEndpoint = `${issuerUrl}/protocol/openid-connect/token/introspect`;
      const certsEndpoint = `${issuerUrl}/protocol/openid-connect/certs`;

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
                ...(response[identityClaimKey.actorType] !== undefined
                  ? { actorType: response[identityClaimKey.actorType] }
                  : {}),
                ...(response.tenant_hint !== undefined
                  ? { tenantHint: response.tenant_hint }
                  : {}),
              });
            },
          ),
        );

      const buildIdentityTokenInactiveError = () =>
        ({
          _tag: "KeycloakSessionInactiveError",
          realm: options.realm,
        }) satisfies KeycloakSessionInactiveError;

      const parseIdentityTokenJsonSegment = <A>(input: {
        readonly segment: string;
        readonly decode: (
          value: unknown,
        ) => Effect.Effect<A, ParseResult.ParseError>;
      }) =>
        Effect.try({
          try: () =>
            JSON.parse(
              Buffer.from(input.segment, "base64url").toString("utf8"),
            ),
          catch: () => buildIdentityTokenInactiveError(),
        }).pipe(
          Effect.flatMap(input.decode),
          Effect.mapError(() => buildIdentityTokenInactiveError()),
        );

      const resolveIdentityTokenSegments = (idToken: string) => {
        const [headerSegment, payloadSegment, signatureSegment, extraSegment] =
          idToken.split(".");

        return headerSegment !== undefined &&
          payloadSegment !== undefined &&
          signatureSegment !== undefined &&
          extraSegment === undefined &&
          headerSegment.length > 0 &&
          payloadSegment.length > 0 &&
          signatureSegment.length > 0
          ? Effect.succeed({
              headerSegment,
              payloadSegment,
              signatureSegment,
            })
          : Effect.fail(buildIdentityTokenInactiveError());
      };

      const readIdentityTokenSigningKeys = () =>
        createKeycloakRequest({
          operation: "tokenVerification",
          url: certsEndpoint,
          decode: decodeJsonWebKeySet,
          fetchImplementation,
        });

      const selectIdentityTokenSigningKey = (
        jwkSet: KeycloakJsonWebKeySet,
        header: KeycloakIdentityTokenHeader,
      ): Effect.Effect<KeycloakRsaJsonWebKey, KeycloakSessionInactiveError> => {
        const candidateKeys = jwkSet.keys.filter(
          (key) =>
            key.kty === "RSA" &&
            key.n !== undefined &&
            key.e !== undefined &&
            (key.use === undefined || key.use === "sig") &&
            (header.kid === undefined || key.kid === header.kid) &&
            (key.alg === undefined || key.alg === header.alg),
        );

        return candidateKeys[0] !== undefined
          ? Effect.succeed(candidateKeys[0] as KeycloakRsaJsonWebKey)
          : Effect.fail(buildIdentityTokenInactiveError());
      };

      const verifyRs256IdentityTokenSignature = (input: {
        readonly signedContent: string;
        readonly signatureSegment: string;
        readonly jsonWebKey: KeycloakRsaJsonWebKey;
      }) =>
        Effect.tryPromise({
          try: async () => {
            const subtle = globalThis.crypto?.subtle;

            if (subtle === undefined) {
              throw new Error(
                "Web Crypto is unavailable for Keycloak identity token verification.",
              );
            }

            const importedKey = await subtle.importKey(
              "jwk",
              {
                kty: "RSA",
                n: input.jsonWebKey.n,
                e: input.jsonWebKey.e,
                alg: "RS256",
                ...(input.jsonWebKey.kid !== undefined
                  ? { kid: input.jsonWebKey.kid }
                  : {}),
                ...(input.jsonWebKey.use !== undefined
                  ? { use: input.jsonWebKey.use }
                  : {}),
                ext: true,
              } satisfies JsonWebKey,
              {
                name: "RSASSA-PKCS1-v1_5",
                hash: "SHA-256",
              },
              false,
              ["verify"],
            );

            const verified = await subtle.verify(
              "RSASSA-PKCS1-v1_5",
              importedKey,
              Buffer.from(input.signatureSegment, "base64url"),
              new TextEncoder().encode(input.signedContent),
            );

            if (!verified) {
              throw buildIdentityTokenInactiveError();
            }
          },
          catch: (cause) =>
            typeof cause === "object" &&
            cause !== null &&
            "_tag" in cause &&
            cause._tag === "KeycloakSessionInactiveError"
              ? (cause as KeycloakSessionInactiveError)
              : buildKeycloakRequestError("tokenVerification", { cause }),
        });

      const validateIdentityToken = (
        identityTokenInput: KeycloakIdentityTokenInput,
      ) =>
        decodeKeycloakIdentityTokenInput(identityTokenInput).pipe(
          Effect.mapError(() => buildIdentityTokenInactiveError()),
          Effect.flatMap((decodedInput) =>
            Effect.gen(function* () {
              const { headerSegment, payloadSegment, signatureSegment } =
                yield* resolveIdentityTokenSegments(decodedInput.idToken);
              const header = yield* parseIdentityTokenJsonSegment({
                segment: headerSegment,
                decode: decodeIdentityTokenHeader,
              });

              if (header.alg !== "RS256") {
                return yield* Effect.fail(buildIdentityTokenInactiveError());
              }

              const claims = yield* parseIdentityTokenJsonSegment({
                segment: payloadSegment,
                decode: decodeIdentityTokenClaims,
              });
              const validAudiences = Array.isArray(claims.aud)
                ? claims.aud
                : [claims.aud];
              const currentTimestampSeconds = Math.floor(Date.now() / 1_000);

              if (
                claims.iss !== issuerUrl ||
                !validAudiences.includes(options.clientId) ||
                claims.exp <= currentTimestampSeconds ||
                (claims.nbf !== undefined &&
                  claims.nbf > currentTimestampSeconds)
              ) {
                return yield* Effect.fail(buildIdentityTokenInactiveError());
              }

              const jwkSet = yield* readIdentityTokenSigningKeys();
              const jsonWebKey = yield* selectIdentityTokenSigningKey(
                jwkSet,
                header,
              );

              yield* verifyRs256IdentityTokenSignature({
                signedContent: `${headerSegment}.${payloadSegment}`,
                signatureSegment,
                jsonWebKey,
              });

              return {
                actorId: claims.sub,
                realm: stripRealmPrefix(claims.iss, options.realm),
                ...(claims[identityClaimKey.actorType] !== undefined
                  ? { actorType: claims[identityClaimKey.actorType] }
                  : {}),
                ...(claims.tenant_hint !== undefined
                  ? { tenantHint: claims.tenant_hint }
                  : {}),
              } satisfies KeycloakIdentityTokenValidation;
            }),
          ),
        );

      const issueClientCredentialsAccessToken = () =>
        createKeycloakRequest({
          operation: "clientCredentialsGrant",
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
              grant_type: "client_credentials",
            }).toString(),
          },
          decode: decodeTokenExchangeResponse,
          fetchImplementation,
        }).pipe(Effect.map((response) => response.access_token));

      const revokeSessionById = (sessionId: string) =>
        issueClientCredentialsAccessToken().pipe(
          Effect.flatMap((accessToken) =>
            Effect.tryPromise({
              try: async () => {
                const response = await fetchImplementation(
                  `${adminRealmUrl}/sessions/${sessionId}`,
                  {
                    method: "DELETE",
                    headers: {
                      Accept: "application/json",
                      Authorization: `Bearer ${accessToken}`,
                    },
                  },
                );
                const responseText = await response.text();

                if (!response.ok) {
                  throw {
                    cause: response.statusText,
                    status: response.status,
                    body: responseText,
                  } satisfies KeycloakRequestFailure;
                }
              },
              catch: (cause) => {
                if (isKeycloakRequestFailure(cause)) {
                  return buildKeycloakRequestError("sessionRevocation", cause);
                }

                return buildKeycloakRequestError("sessionRevocation", {
                  cause,
                });
              },
            }),
          ),
        );

      const compensateFailedImpersonationSession = (input: {
        readonly sessionId: string | undefined;
        readonly issuanceFailure: KeycloakImpersonationIssuedFailure;
      }): Effect.Effect<
        never,
        | KeycloakImpersonationIssuedFailure
        | KeycloakImpersonationCleanupUnavailableError
        | KeycloakImpersonationCompensationError
      > => {
        const sessionId = input.sessionId;

        if (sessionId === undefined) {
          return Effect.fail({
            _tag: "KeycloakImpersonationCleanupUnavailableError",
            issuanceFailure: input.issuanceFailure,
          } satisfies KeycloakImpersonationCleanupUnavailableError);
        }

        return revokeSessionById(sessionId).pipe(
          Effect.catchAll((revocationFailure) =>
            Effect.fail({
              _tag: "KeycloakImpersonationCompensationError",
              sessionId,
              issuanceFailure: input.issuanceFailure,
              revocationFailure,
            } satisfies KeycloakImpersonationCompensationError),
          ),
          Effect.zipRight(Effect.fail(input.issuanceFailure)),
        );
      };

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

      const issueImpersonationSession = (
        impersonationInput: KeycloakImpersonationInput,
      ): Effect.Effect<
        KeycloakImpersonationSession,
        | ParseResult.ParseError
        | KeycloakAdapterRequestError
        | KeycloakSessionInactiveError
        | KeycloakSessionIdentifierMissingError
        | KeycloakImpersonationIdTokenMissingError
        | KeycloakImpersonationActorMismatchError
        | KeycloakImpersonationCleanupUnavailableError
        | KeycloakImpersonationCompensationError
      > =>
        decodeImpersonationInput(impersonationInput).pipe(
          Effect.flatMap((decodedInput) =>
            Effect.gen(function* () {
              const tokenExchangeResponseText =
                yield* fetchKeycloakResponseText({
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
                      grant_type:
                        "urn:ietf:params:oauth:grant-type:token-exchange",
                      requested_subject: decodedInput.impersonatedActorId,
                      audience: options.clientId,
                      scope: "openid",
                    }).toString(),
                  },
                  fetchImplementation,
                });
              const tokenExchangeSessionId =
                readOptionalTokenExchangeSessionState(
                  tokenExchangeResponseText,
                );
              const tokenExchangePayload = yield* parseKeycloakJsonResponse({
                operation: "tokenExchange",
                responseText: tokenExchangeResponseText,
              }).pipe(
                Effect.catchAll((issuanceFailure) =>
                  compensateFailedImpersonationSession({
                    sessionId: tokenExchangeSessionId,
                    issuanceFailure,
                  }),
                ),
              );
              const response: KeycloakTokenExchangeResponse =
                yield* decodeTokenExchangeResponse(tokenExchangePayload).pipe(
                  Effect.mapError(
                    (cause): KeycloakAdapterRequestError =>
                      buildKeycloakRequestError("tokenExchange", {
                        cause,
                      }),
                  ),
                  Effect.catchAll((issuanceFailure) =>
                    compensateFailedImpersonationSession({
                      sessionId: tokenExchangeSessionId,
                      issuanceFailure,
                    }),
                  ),
                );

              const session: KeycloakSession = yield* introspectAccessToken(
                response.access_token,
              ).pipe(
                Effect.catchAll((issuanceFailure) =>
                  compensateFailedImpersonationSession({
                    sessionId: tokenExchangeSessionId,
                    issuanceFailure,
                  }),
                ),
              );

              return yield* Effect.gen(function* () {
                if (response.id_token === undefined) {
                  return yield* Effect.fail({
                    _tag: "KeycloakImpersonationIdTokenMissingError",
                    realm: options.realm,
                    clientId: options.clientId,
                    impersonatedActorId: decodedInput.impersonatedActorId,
                  } satisfies KeycloakImpersonationIdTokenMissingError);
                }

                if (session.actorId !== decodedInput.impersonatedActorId) {
                  return yield* Effect.fail({
                    _tag: "KeycloakImpersonationActorMismatchError",
                    realm: options.realm,
                    requestedActorId: decodedInput.impersonatedActorId,
                    sessionActorId: session.actorId,
                  } satisfies KeycloakImpersonationActorMismatchError);
                }

                return yield* decodeImpersonationSession({
                  session,
                  idToken: response.id_token,
                  expiresInSeconds: response.expires_in,
                });
              }).pipe(
                Effect.catchAll((issuanceFailure) =>
                  compensateFailedImpersonationSession({
                    sessionId: session.sessionId,
                    issuanceFailure,
                  }),
                ),
              );
            }),
          ),
        );

      const revokeSession = (
        sessionInput: KeycloakSessionRevocationInput,
      ): Effect.Effect<
        void,
        ParseResult.ParseError | KeycloakAdapterRequestError
      > =>
        decodeSessionRevocationInput(sessionInput).pipe(
          Effect.flatMap((decodedInput) =>
            revokeSessionById(decodedInput.sessionId),
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

              if (decodedInput.themeHint !== undefined) {
                authorizationUrl.searchParams.set(
                  "theme_hint",
                  decodedInput.themeHint,
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
                themeHint: decodedInput.themeHint,
                redirectUri: decodedInput.redirectUri,
                state: decodedInput.state,
              });
            }),
          ),
        validateIdentityToken,
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
        issueImpersonationSession,
        revokeSession,
      };
    }),
  );

export const makeKeycloakAdapterLayer = (options: KeycloakAdapterOptions) =>
  Layer.effect(KeycloakAdapter, makeKeycloakAdapter(options));
