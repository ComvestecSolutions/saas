import { Effect, ParseResult, Schema } from "effect";
import {
  AbsoluteRedirectUriSchema,
  IsoTimestampSchema,
} from "@comvestec/contracts";

const PublicWebBillingReturnEnvironmentSchema = Schema.Struct({
  APP_BASE_URL: AbsoluteRedirectUriSchema,
});

const ProductBillingCheckoutHandoffEnvironmentSchema = Schema.Struct({
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
});

export type PublicWebBillingReturnKind = "success" | "cancel";

export const ProductBillingCheckoutHandoffPayloadSchema = Schema.Struct({
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
  successUrl: AbsoluteRedirectUriSchema,
  cancelUrl: AbsoluteRedirectUriSchema,
  expiresAt: IsoTimestampSchema,
});

export type ProductBillingCheckoutHandoffPayload = Schema.Schema.Type<
  typeof ProductBillingCheckoutHandoffPayloadSchema
>;

export type PublicWebBillingReturnUrlMismatchError = {
  readonly _tag: "PublicWebBillingReturnUrlMismatchError";
  readonly returnKind: PublicWebBillingReturnKind;
  readonly returnUrl: string;
  readonly expectedReturnUrl: string;
};

export type ProductBillingCheckoutHandoffInvalidError = {
  readonly _tag: "ProductBillingCheckoutHandoffInvalidError";
  readonly reason: string;
};

export type ProductBillingCheckoutHandoffExpiredError = {
  readonly _tag: "ProductBillingCheckoutHandoffExpiredError";
  readonly expiresAt: string;
};

const invalidCheckoutHandoffError = (
  reason: string,
): ProductBillingCheckoutHandoffInvalidError => ({
  _tag: "ProductBillingCheckoutHandoffInvalidError",
  reason,
});

const decodeProductBillingCheckoutHandoffEnvironment = Schema.decodeUnknown(
  ProductBillingCheckoutHandoffEnvironmentSchema,
);

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
    catch: () =>
      invalidCheckoutHandoffError("Checkout handoff signing key is invalid."),
  });

const signCheckoutHandoffPayload = (secret: string, encodedPayload: string) =>
  importHmacKey(secret).pipe(
    Effect.flatMap((key) =>
      Effect.tryPromise({
        try: async () => {
          const signature = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(encodedPayload),
          );
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(signature)),
          );

          return base64
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        },
        catch: () =>
          invalidCheckoutHandoffError(
            "Checkout handoff signature could not be created.",
          ),
      }),
    ),
  );

const verifyCheckoutHandoffPayloadSignature = (
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
          const signatureBytes = Uint8Array.from(atob(padded), (character) =>
            character.charCodeAt(0),
          );

          return crypto.subtle.verify(
            "HMAC",
            key,
            signatureBytes,
            new TextEncoder().encode(encodedPayload),
          );
        },
        catch: () =>
          invalidCheckoutHandoffError("Checkout handoff signature is invalid."),
      }),
    ),
  );

const decodeCheckoutHandoffToken = (
  handoffToken: string,
): Effect.Effect<
  {
    readonly encodedPayload: string;
    readonly signature: string;
  },
  ProductBillingCheckoutHandoffInvalidError
> => {
  const [encodedPayload, signature, ...rest] = handoffToken.split(".");

  return encodedPayload === undefined ||
    signature === undefined ||
    rest.length > 0 ||
    encodedPayload.length === 0 ||
    signature.length === 0
    ? Effect.fail(
        invalidCheckoutHandoffError(
          "Checkout handoff token format is invalid.",
        ),
      )
    : Effect.succeed({ encodedPayload, signature });
};

const decodeCheckoutHandoffPayload = (
  encodedPayload: string,
): Effect.Effect<
  ProductBillingCheckoutHandoffPayload,
  ProductBillingCheckoutHandoffInvalidError
> =>
  Effect.try({
    try: () =>
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    catch: () =>
      invalidCheckoutHandoffError(
        "Checkout handoff payload could not be decoded.",
      ),
  }).pipe(
    Effect.flatMap((payload) =>
      Schema.decodeUnknown(ProductBillingCheckoutHandoffPayloadSchema)(payload),
    ),
    Effect.mapError(() =>
      invalidCheckoutHandoffError("Checkout handoff payload is invalid."),
    ),
  );

export const createProductBillingCheckoutHandoffTokenFromEnvironment = (
  environment: unknown,
  payload: ProductBillingCheckoutHandoffPayload,
): Effect.Effect<
  string,
  ParseResult.ParseError | ProductBillingCheckoutHandoffInvalidError
> =>
  decodeProductBillingCheckoutHandoffEnvironment(environment).pipe(
    Effect.flatMap((decodedEnvironment) =>
      Schema.decodeUnknown(ProductBillingCheckoutHandoffPayloadSchema)(
        payload,
      ).pipe(
        Effect.flatMap((decodedPayload) => {
          const encodedPayload = Buffer.from(
            JSON.stringify(decodedPayload),
            "utf8",
          ).toString("base64url");

          return signCheckoutHandoffPayload(
            decodedEnvironment.KEYCLOAK_CLIENT_SECRET,
            encodedPayload,
          ).pipe(Effect.map((signature) => `${encodedPayload}.${signature}`));
        }),
      ),
    ),
  );

export const decodeProductBillingCheckoutHandoffTokenFromEnvironment = (
  environment: unknown,
  handoffToken: string,
  now: Date = new Date(),
): Effect.Effect<
  ProductBillingCheckoutHandoffPayload,
  | ParseResult.ParseError
  | ProductBillingCheckoutHandoffInvalidError
  | ProductBillingCheckoutHandoffExpiredError
> =>
  decodeProductBillingCheckoutHandoffEnvironment(environment).pipe(
    Effect.flatMap(
      (
        decodedEnvironment,
      ): Effect.Effect<
        ProductBillingCheckoutHandoffPayload,
        ProductBillingCheckoutHandoffInvalidError
      > =>
        decodeCheckoutHandoffToken(handoffToken).pipe(
          Effect.flatMap(({ encodedPayload, signature }) =>
            verifyCheckoutHandoffPayloadSignature(
              decodedEnvironment.KEYCLOAK_CLIENT_SECRET,
              encodedPayload,
              signature,
            ).pipe(
              Effect.flatMap(
                (
                  verified,
                ): Effect.Effect<
                  ProductBillingCheckoutHandoffPayload,
                  ProductBillingCheckoutHandoffInvalidError
                > =>
                  verified
                    ? decodeCheckoutHandoffPayload(encodedPayload)
                    : Effect.fail(
                        invalidCheckoutHandoffError(
                          "Checkout handoff signature is invalid.",
                        ),
                      ),
              ),
            ),
          ),
        ),
    ),
    Effect.flatMap(
      (
        decodedPayload,
      ): Effect.Effect<
        ProductBillingCheckoutHandoffPayload,
        | ProductBillingCheckoutHandoffInvalidError
        | ProductBillingCheckoutHandoffExpiredError
      > => {
        const expiresAt = Date.parse(decodedPayload.expiresAt);

        if (!Number.isFinite(expiresAt)) {
          return Effect.fail(
            invalidCheckoutHandoffError("Checkout handoff expiry is invalid."),
          );
        }

        if (expiresAt <= now.getTime()) {
          return Effect.fail({
            _tag: "ProductBillingCheckoutHandoffExpiredError",
            expiresAt: decodedPayload.expiresAt,
          } satisfies ProductBillingCheckoutHandoffExpiredError);
        }

        return Effect.succeed(decodedPayload);
      },
    ),
  );

export const resolvePublicWebBillingReturnUrlFromEnvironment = (
  environment: unknown,
  returnKind: PublicWebBillingReturnKind,
): Effect.Effect<string, ParseResult.ParseError> =>
  Schema.decodeUnknown(PublicWebBillingReturnEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map((decodedEnvironment) =>
      new URL(
        `/billing/${returnKind}`,
        decodedEnvironment.APP_BASE_URL,
      ).toString(),
    ),
  );

export const resolvePublicWebBillingReturnUrlsFromEnvironment = (
  environment: unknown,
) =>
  Effect.all({
    successUrl: resolvePublicWebBillingReturnUrlFromEnvironment(
      environment,
      "success",
    ),
    cancelUrl: resolvePublicWebBillingReturnUrlFromEnvironment(
      environment,
      "cancel",
    ),
  });

export const validatePublicWebBillingReturnUrlFromEnvironment = (
  environment: unknown,
  input: {
    readonly returnKind: PublicWebBillingReturnKind;
    readonly returnUrl: string;
  },
): Effect.Effect<
  string,
  ParseResult.ParseError | PublicWebBillingReturnUrlMismatchError
> =>
  resolvePublicWebBillingReturnUrlFromEnvironment(
    environment,
    input.returnKind,
  ).pipe(
    Effect.flatMap((expectedReturnUrl) =>
      input.returnUrl === expectedReturnUrl
        ? Effect.succeed(input.returnUrl)
        : Effect.fail({
            _tag: "PublicWebBillingReturnUrlMismatchError",
            returnKind: input.returnKind,
            returnUrl: input.returnUrl,
            expectedReturnUrl,
          } as const),
    ),
  );
