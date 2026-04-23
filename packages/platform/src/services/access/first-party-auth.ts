import { Effect, ParseResult, Schema } from "effect";
import {
  AbsoluteRedirectUriSchema,
  IsoTimestampSchema,
  PlatformModuleIdSchema,
  TenantContextSchema,
} from "@comvestec/contracts";

const ProductAppAuthCallbackEnvironmentSchema = Schema.Struct({
  PRODUCT_APP_BASE_URL: AbsoluteRedirectUriSchema,
});

const ProductAppAuthStateEnvironmentSchema = Schema.Struct({
  PRODUCT_APP_BASE_URL: AbsoluteRedirectUriSchema,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
});

export const ProductAppAuthCallbackStatePayloadSchema = Schema.Struct({
  correlationId: Schema.NonEmptyString,
  redirectUri: AbsoluteRedirectUriSchema,
  tenant: TenantContextSchema,
  enabledModules: Schema.Array(PlatformModuleIdSchema),
  expiresAt: IsoTimestampSchema,
});

export type ProductAppAuthCallbackStatePayload = Schema.Schema.Type<
  typeof ProductAppAuthCallbackStatePayloadSchema
>;

export type ProductAppAuthCallbackRedirectNotAllowedError = {
  readonly _tag: "ProductAppAuthCallbackRedirectNotAllowedError";
  readonly redirectUri: string;
  readonly expectedRedirectUri: string;
};

export type ProductAppAuthCallbackStateInvalidError = {
  readonly _tag: "ProductAppAuthCallbackStateInvalidError";
  readonly reason: string;
};

export type ProductAppAuthCallbackStateExpiredError = {
  readonly _tag: "ProductAppAuthCallbackStateExpiredError";
  readonly expiresAt: string;
};

const resolveApprovedProductAppAuthCallbackRedirectUri = (
  productAppBaseUrl: string,
) =>
  Schema.decodeUnknown(AbsoluteRedirectUriSchema)(
    new URL("/auth/callback", productAppBaseUrl).toString(),
  );

const invalidStateError = (
  reason: string,
): ProductAppAuthCallbackStateInvalidError => ({
  _tag: "ProductAppAuthCallbackStateInvalidError",
  reason,
});

// Import a secret string as an HMAC-SHA-256 key via the global Web Crypto API.
// Available in Bun, Node.js ≥ 18, and all modern browsers — no imports required.
const importHmacKey = (secret: string) =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      ),
    catch: () => invalidStateError("State token signing key is invalid."),
  });

// Signs the payload and returns a base64url-encoded HMAC-SHA-256 signature.
const signStatePayload = (secret: string, encodedPayload: string) =>
  importHmacKey(secret).pipe(
    Effect.flatMap((key) =>
      Effect.tryPromise({
        try: async () => {
          const sig = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(encodedPayload),
          );
          const base64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
          return base64
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        },
        catch: () =>
          invalidStateError("State token signature could not be created."),
      }),
    ),
  );

// Verifies the HMAC-SHA-256 signature. crypto.subtle.verify is constant-time,
// which prevents timing attacks without a separate timingSafeEqual primitive.
const verifyStatePayloadSignature = (
  secret: string,
  encodedPayload: string,
  signature: string,
) =>
  importHmacKey(secret).pipe(
    Effect.flatMap((key) =>
      Effect.tryPromise({
        try: () => {
          const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
          const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
          const sigBytes = Uint8Array.from(atob(padded), (c) =>
            c.charCodeAt(0),
          );
          return crypto.subtle.verify(
            "HMAC",
            key,
            sigBytes,
            new TextEncoder().encode(encodedPayload),
          );
        },
        catch: () => invalidStateError("State token signature is invalid."),
      }),
    ),
  );

const decodeStateToken = (
  stateToken: string,
): Effect.Effect<
  {
    readonly encodedPayload: string;
    readonly signature: string;
  },
  ProductAppAuthCallbackStateInvalidError
> => {
  const [encodedPayload, signature, ...rest] = stateToken.split(".");

  return encodedPayload === undefined ||
    signature === undefined ||
    rest.length > 0 ||
    encodedPayload.length === 0 ||
    signature.length === 0
    ? Effect.fail(invalidStateError("State token format is invalid."))
    : Effect.succeed({ encodedPayload, signature });
};

const decodeStatePayload = (encodedPayload: string) =>
  Effect.try({
    try: () =>
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    catch: () => invalidStateError("State token payload could not be decoded."),
  }).pipe(
    Effect.flatMap((payload) =>
      Schema.decodeUnknown(ProductAppAuthCallbackStatePayloadSchema)(payload),
    ),
    Effect.mapError(() => invalidStateError("State token payload is invalid.")),
  );

export const resolveProductAppAuthCallbackRedirectUriFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(ProductAppAuthCallbackEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.flatMap((decodedEnvironment) =>
      resolveApprovedProductAppAuthCallbackRedirectUri(
        decodedEnvironment.PRODUCT_APP_BASE_URL,
      ),
    ),
  );

export const validateProductAppAuthCallbackRedirectUriFromEnvironment = (
  environment: unknown,
  redirectUri: string,
) =>
  Schema.decodeUnknown(ProductAppAuthCallbackEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.flatMap((decodedEnvironment) =>
      Effect.all({
        approvedRedirectUri: resolveApprovedProductAppAuthCallbackRedirectUri(
          decodedEnvironment.PRODUCT_APP_BASE_URL,
        ),
        decodedRedirectUri: Schema.decodeUnknown(AbsoluteRedirectUriSchema)(
          redirectUri,
        ),
      }).pipe(
        Effect.flatMap(({ approvedRedirectUri, decodedRedirectUri }) =>
          decodedRedirectUri === approvedRedirectUri
            ? Effect.succeed(decodedRedirectUri)
            : Effect.fail({
                _tag: "ProductAppAuthCallbackRedirectNotAllowedError",
                redirectUri: decodedRedirectUri,
                expectedRedirectUri: approvedRedirectUri,
              } satisfies ProductAppAuthCallbackRedirectNotAllowedError),
        ),
      ),
    ),
  );

export const createProductAppAuthCallbackStateFromEnvironment = (
  environment: unknown,
  payload: ProductAppAuthCallbackStatePayload,
): Effect.Effect<
  string,
  | ParseResult.ParseError
  | ProductAppAuthCallbackRedirectNotAllowedError
  | ProductAppAuthCallbackStateInvalidError
> =>
  Schema.decodeUnknown(ProductAppAuthStateEnvironmentSchema)(environment).pipe(
    Effect.flatMap((decodedEnvironment) =>
      Schema.decodeUnknown(ProductAppAuthCallbackStatePayloadSchema)(
        payload,
      ).pipe(
        Effect.flatMap((decodedPayload) =>
          validateProductAppAuthCallbackRedirectUriFromEnvironment(
            decodedEnvironment,
            decodedPayload.redirectUri,
          ).pipe(
            Effect.flatMap(() => {
              const encodedPayload = Buffer.from(
                JSON.stringify(decodedPayload),
                "utf8",
              ).toString("base64url");
              return signStatePayload(
                decodedEnvironment.KEYCLOAK_CLIENT_SECRET,
                encodedPayload,
              ).pipe(Effect.map((sig) => `${encodedPayload}.${sig}`));
            }),
          ),
        ),
      ),
    ),
  );

export const decodeProductAppAuthCallbackStateFromEnvironment = (
  environment: unknown,
  stateToken: string,
  now: Date = new Date(),
): Effect.Effect<
  ProductAppAuthCallbackStatePayload,
  ProductAppAuthCallbackStateError
> =>
  Schema.decodeUnknown(ProductAppAuthStateEnvironmentSchema)(environment).pipe(
    Effect.flatMap((decodedEnvironment) =>
      decodeStateToken(stateToken).pipe(
        Effect.flatMap(({ encodedPayload, signature }) =>
          verifyStatePayloadSignature(
            decodedEnvironment.KEYCLOAK_CLIENT_SECRET,
            encodedPayload,
            signature,
          ).pipe(
            Effect.flatMap((isValid) =>
              isValid
                ? decodeStatePayload(encodedPayload).pipe(
                    Effect.flatMap((decodedPayload) =>
                      validateProductAppAuthCallbackRedirectUriFromEnvironment(
                        decodedEnvironment,
                        decodedPayload.redirectUri,
                      ).pipe(
                        Effect.flatMap(
                          (): Effect.Effect<
                            ProductAppAuthCallbackStatePayload,
                            | ProductAppAuthCallbackRedirectNotAllowedError
                            | ProductAppAuthCallbackStateInvalidError
                            | ProductAppAuthCallbackStateExpiredError
                          > => {
                            const expiresAt = Date.parse(
                              decodedPayload.expiresAt,
                            );

                            if (!Number.isFinite(expiresAt)) {
                              return Effect.fail(
                                invalidStateError(
                                  "State token expiry is invalid.",
                                ),
                              );
                            }

                            if (expiresAt <= now.getTime()) {
                              return Effect.fail({
                                _tag: "ProductAppAuthCallbackStateExpiredError",
                                expiresAt: decodedPayload.expiresAt,
                              } satisfies ProductAppAuthCallbackStateExpiredError);
                            }

                            return Effect.succeed(decodedPayload);
                          },
                        ),
                      ),
                    ),
                  )
                : Effect.fail(
                    invalidStateError("State token signature is invalid."),
                  ),
            ),
          ),
        ),
      ),
    ),
  );

export type ProductAppAuthCallbackStateError =
  | ParseResult.ParseError
  | ProductAppAuthCallbackRedirectNotAllowedError
  | ProductAppAuthCallbackStateInvalidError
  | ProductAppAuthCallbackStateExpiredError;
