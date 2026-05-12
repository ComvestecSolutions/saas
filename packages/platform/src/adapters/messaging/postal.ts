import { createPrivateKey, createPublicKey } from "node:crypto";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  emailDeliveryBounceType,
  emailDeliveryProviderEventType,
  type EmailDeliveryProviderEvent,
  EmailDeliveryProviderEventSchema,
} from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const PostalAdapterOptionsSchema = Schema.Struct({
  apiUrl: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

type PostalAdapterRuntimeOptions = Schema.Schema.Type<
  typeof PostalAdapterOptionsSchema
>;

export type PostalAdapterOptions = PostalAdapterRuntimeOptions & {
  readonly fetch?: typeof fetch;
};

const PostalHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.postal,
);

export type PostalHealthcheck = Schema.Schema.Type<
  typeof PostalHealthcheckSchema
>;

export const PostalSendEmailInputSchema = Schema.Struct({
  messageId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
  html: Schema.NonEmptyString,
  text: Schema.optional(Schema.NonEmptyString),
  fromEmail: Schema.NonEmptyString,
  fromName: Schema.NonEmptyString,
  replyToEmail: Schema.NonEmptyString,
});

export type PostalSendEmailInput = Schema.Schema.Type<
  typeof PostalSendEmailInputSchema
>;

export const PostalSendEmailReceiptSchema = Schema.Struct({
  messageId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  status: Schema.Literal("queued"),
  sentAt: Schema.NonEmptyString,
  provider: Schema.Literal(platformAdapterServiceName.postal),
});

export type PostalSendEmailReceipt = Schema.Schema.Type<
  typeof PostalSendEmailReceiptSchema
>;

const PostalWebhookEventConstantSchema = Schema.Struct({
  messageSent: Schema.Literal("MessageSent"),
  messageDelayed: Schema.Literal("MessageDelayed"),
  messageDeliveryFailed: Schema.Literal("MessageDeliveryFailed"),
  messageBounced: Schema.Literal("MessageBounced"),
});

const postalWebhookEvent = Schema.validateSync(
  PostalWebhookEventConstantSchema,
)({
  messageSent: "MessageSent",
  messageDelayed: "MessageDelayed",
  messageDeliveryFailed: "MessageDeliveryFailed",
  messageBounced: "MessageBounced",
} satisfies Schema.Schema.Type<typeof PostalWebhookEventConstantSchema>);

const PostalWebhookEnvelopeSchema = Schema.Struct({
  event: Schema.NonEmptyString,
  timestamp: Schema.Number,
  payload: Schema.Unknown,
  uuid: Schema.NonEmptyString,
});

type PostalWebhookEnvelope = Schema.Schema.Type<
  typeof PostalWebhookEnvelopeSchema
>;

const PostalWebhookMessagePayloadSchema = Schema.Struct({
  message: Schema.Struct({
    message_id: Schema.NonEmptyString,
  }),
  timestamp: Schema.optional(Schema.Number),
});

const PostalWebhookBouncePayloadSchema = Schema.Struct({
  original_message: Schema.Struct({
    message_id: Schema.NonEmptyString,
  }),
  bounce: Schema.Struct({
    timestamp: Schema.optional(Schema.Number),
  }),
});

const PostalWebhookVerificationKeySchema = Schema.Struct({
  kid: Schema.NonEmptyString,
  kty: Schema.Literal("RSA"),
  n: Schema.NonEmptyString,
  e: Schema.NonEmptyString,
  alg: Schema.optional(Schema.NonEmptyString),
  use: Schema.optional(Schema.NonEmptyString),
});

type PostalWebhookVerificationKey = Schema.Schema.Type<
  typeof PostalWebhookVerificationKeySchema
>;

const PostalWebhookVerificationKeysSchema = Schema.Struct({
  keys: Schema.Array(PostalWebhookVerificationKeySchema),
});

type PostalWebhookVerificationKeys = Schema.Schema.Type<
  typeof PostalWebhookVerificationKeysSchema
>;

const selfHostedPostalSigningKeyId = "self-hosted-postal-signing-key";

const PostalSendMessageResponseSchema = Schema.Struct({
  status: Schema.NonEmptyString,
  data: Schema.optional(
    Schema.Struct({
      message_id: Schema.optional(Schema.NonEmptyString),
    }),
  ),
});

type PostalSendMessageResponse = Schema.Schema.Type<
  typeof PostalSendMessageResponseSchema
>;

export type PostalAdapterRequestError = {
  readonly _tag: "PostalAdapterRequestError";
  readonly operation:
    | "healthcheck"
    | "sendEmail"
    | "fetchWebhookVerificationKeys";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type PostalWebhookSignatureError = {
  readonly _tag: "PostalWebhookSignatureError";
  readonly reason:
    | "signingKeyMissing"
    | "signatureHeaderMissing"
    | "signatureKeyIdMissing"
    | "signatureKeyImportFailed"
    | "signatureVerificationFailed";
  readonly keyId?: string;
  readonly cause?: unknown;
};

export type PostalWebhookPayloadMappingError = {
  readonly _tag: "PostalWebhookPayloadMappingError";
  readonly event: string;
  readonly reason: "invalidJson" | "invalidPayload" | "invalidTimestamp";
  readonly cause?: ParseResult.ParseError;
};

export type PostalWebhookValidationError =
  | PostalAdapterRequestError
  | PostalWebhookSignatureError
  | PostalWebhookPayloadMappingError;

export type PostalAdapterError =
  | ParseResult.ParseError
  | PostalAdapterRequestError;

type PostalRequestFailure = {
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

const isPostalRequestFailure = (
  cause: unknown,
): cause is PostalRequestFailure =>
  typeof cause === "object" && cause !== null && "cause" in cause;

const buildPostalRequestError = (
  operation: PostalAdapterRequestError["operation"],
  failure: PostalRequestFailure,
): PostalAdapterRequestError => ({
  _tag: "PostalAdapterRequestError",
  operation,
  cause: failure.cause,
  ...(failure.status !== undefined ? { status: failure.status } : {}),
  ...(failure.body !== undefined ? { body: failure.body } : {}),
});

const decodePostalSendMessageResponse = Schema.decodeUnknown(
  PostalSendMessageResponseSchema,
);

const decodePostalSendEmailReceipt = Schema.decodeUnknown(
  PostalSendEmailReceiptSchema,
);

const decodePostalHealthcheck = Schema.decodeUnknown(PostalHealthcheckSchema);

const decodePostalWebhookEnvelope = Schema.decodeUnknown(
  PostalWebhookEnvelopeSchema,
);

const decodePostalWebhookMessagePayload = Schema.decodeUnknown(
  PostalWebhookMessagePayloadSchema,
);

const decodePostalWebhookBouncePayload = Schema.decodeUnknown(
  PostalWebhookBouncePayloadSchema,
);

const decodePostalWebhookVerificationKeys = Schema.decodeUnknown(
  PostalWebhookVerificationKeysSchema,
);

const decodeEmailDeliveryProviderEvent = Schema.decodeUnknown(
  EmailDeliveryProviderEventSchema,
);

const buildPostalFromHeader = (input: PostalSendEmailInput) =>
  `${input.fromName} <${input.fromEmail}>`;

const mapPostalWebhookPayloadError = (input: {
  readonly event: string;
  readonly reason: PostalWebhookPayloadMappingError["reason"];
  readonly cause?: ParseResult.ParseError;
}): PostalWebhookPayloadMappingError => ({
  _tag: "PostalWebhookPayloadMappingError",
  event: input.event,
  reason: input.reason,
  ...(input.cause !== undefined ? { cause: input.cause } : {}),
});

const normalizePostalWebhookTimestamp = (input: {
  readonly event: string;
  readonly timestamp: number;
}): Effect.Effect<string, PostalWebhookPayloadMappingError> => {
  const eventDate = new Date(input.timestamp * 1000);

  return Number.isFinite(eventDate.getTime())
    ? Effect.succeed(eventDate.toISOString())
    : Effect.fail(
        mapPostalWebhookPayloadError({
          event: input.event,
          reason: "invalidTimestamp",
        }),
      );
};

const parsePostalWebhookJsonBody = (
  body: string,
): Effect.Effect<unknown, PostalWebhookPayloadMappingError> =>
  Effect.try({
    try: () => JSON.parse(body),
    catch: () =>
      mapPostalWebhookPayloadError({
        event: "unknown",
        reason: "invalidJson",
      }),
  });

const fetchPostalWebhookVerificationKeys = (input: {
  readonly apiUrl: string;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<PostalWebhookVerificationKeys, PostalAdapterRequestError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await input.fetchImplementation(
        new URL("/.well-known/jwks.json", input.apiUrl).toString(),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );
      const responseText = await response.text();

      if (!response.ok) {
        throw {
          cause: response.statusText,
          status: response.status,
          body: responseText,
        } satisfies PostalRequestFailure;
      }

      return responseText.length === 0 ? {} : JSON.parse(responseText);
    },
    catch: (cause) => {
      if (isPostalRequestFailure(cause)) {
        return buildPostalRequestError("fetchWebhookVerificationKeys", cause);
      }

      return buildPostalRequestError("fetchWebhookVerificationKeys", {
        cause,
      });
    },
  }).pipe(
    Effect.flatMap(decodePostalWebhookVerificationKeys),
    Effect.mapError((cause) =>
      cause._tag === "ParseError"
        ? buildPostalRequestError("fetchWebhookVerificationKeys", { cause })
        : cause,
    ),
  );

const buildPostalWebhookVerificationKeysFromSigningKey = (input: {
  readonly signingKeyBase64: string;
}): Effect.Effect<PostalWebhookVerificationKeys, PostalWebhookSignatureError> =>
  Effect.try({
    try: () => {
      const privateKey = createPrivateKey(
        Buffer.from(input.signingKeyBase64, "base64").toString("utf8"),
      );
      const publicJwk = createPublicKey(privateKey).export({
        format: "jwk",
      }) as JsonWebKey;

      return {
        keys: [
          {
            kid: selfHostedPostalSigningKeyId,
            kty: "RSA",
            n: publicJwk.n,
            e: publicJwk.e,
            ...(typeof publicJwk.alg === "string"
              ? { alg: publicJwk.alg }
              : {}),
            ...(typeof publicJwk.use === "string"
              ? { use: publicJwk.use }
              : { use: "sig" }),
          },
        ],
      };
    },
    catch: (cause) =>
      ({
        _tag: "PostalWebhookSignatureError",
        reason: "signatureKeyImportFailed",
        keyId: selfHostedPostalSigningKeyId,
        cause,
      }) satisfies PostalWebhookSignatureError,
  }).pipe(
    Effect.flatMap(decodePostalWebhookVerificationKeys),
    Effect.mapError((cause) =>
      cause._tag === "ParseError"
        ? ({
            _tag: "PostalWebhookSignatureError",
            reason: "signatureKeyImportFailed",
            keyId: selfHostedPostalSigningKeyId,
            cause,
          } satisfies PostalWebhookSignatureError)
        : cause,
    ),
  );

const resolvePostalWebhookVerificationKeys = (input: {
  readonly apiUrl: string;
  readonly fetchImplementation: typeof fetch;
  readonly signingKeyBase64?: string;
}): Effect.Effect<
  PostalWebhookVerificationKeys,
  PostalAdapterRequestError | PostalWebhookSignatureError
> =>
  input.signingKeyBase64 !== undefined
    ? buildPostalWebhookVerificationKeysFromSigningKey({
        signingKeyBase64: input.signingKeyBase64,
      })
    : fetchPostalWebhookVerificationKeys({
        apiUrl: input.apiUrl,
        fetchImplementation: input.fetchImplementation,
      });

const extractPostalWebhookSignatureHeaders = (
  request: Request,
): Effect.Effect<
  {
    readonly signature: string;
    readonly keyId: string;
  },
  PostalWebhookSignatureError
> => {
  const signature = request.headers.get("X-Postal-Signature-256");

  if (signature === null || signature.length === 0) {
    return Effect.fail({
      _tag: "PostalWebhookSignatureError",
      reason: "signatureHeaderMissing",
    } satisfies PostalWebhookSignatureError);
  }

  const keyId = request.headers.get("X-Postal-Signature-KID");

  if (keyId === null || keyId.length === 0) {
    return Effect.fail({
      _tag: "PostalWebhookSignatureError",
      reason: "signatureKeyIdMissing",
    } satisfies PostalWebhookSignatureError);
  }

  return Effect.succeed({
    signature,
    keyId,
  });
};

const verifyPostalWebhookSignature = (input: {
  readonly body: string;
  readonly signature: string;
  readonly keyId: string;
  readonly verificationKeys: PostalWebhookVerificationKeys;
}): Effect.Effect<void, PostalWebhookSignatureError> => {
  const verificationKey =
    input.verificationKeys.keys.find(
      (candidate) => candidate.kid === input.keyId,
    ) ??
    (input.verificationKeys.keys.length === 1
      ? input.verificationKeys.keys[0]
      : undefined);

  if (verificationKey === undefined) {
    return Effect.fail({
      _tag: "PostalWebhookSignatureError",
      reason: "signingKeyMissing",
      keyId: input.keyId,
    } satisfies PostalWebhookSignatureError);
  }

  return Effect.tryPromise({
    try: async () => {
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        {
          kty: verificationKey.kty,
          kid: verificationKey.kid,
          n: verificationKey.n,
          e: verificationKey.e,
          ...(verificationKey.alg !== undefined
            ? { alg: verificationKey.alg }
            : {}),
          ...(verificationKey.use !== undefined
            ? { use: verificationKey.use }
            : {}),
        } as JsonWebKey,
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        },
        false,
        ["verify"],
      );
      const signatureBytes = Buffer.from(input.signature, "base64");
      const verified = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        signatureBytes,
        new TextEncoder().encode(input.body),
      );

      if (!verified) {
        throw {
          _tag: "PostalWebhookSignatureError",
          reason: "signatureVerificationFailed",
          keyId: input.keyId,
        } satisfies PostalWebhookSignatureError;
      }
    },
    catch: (cause) => {
      if (
        typeof cause === "object" &&
        cause !== null &&
        "_tag" in cause &&
        cause._tag === "PostalWebhookSignatureError"
      ) {
        return cause as PostalWebhookSignatureError;
      }

      return {
        _tag: "PostalWebhookSignatureError",
        reason: "signatureKeyImportFailed",
        keyId: input.keyId,
        cause,
      } satisfies PostalWebhookSignatureError;
    },
  });
};

const mapPostalWebhookEnvelopeToProviderEvent = (
  envelope: PostalWebhookEnvelope,
): Effect.Effect<
  EmailDeliveryProviderEvent | null,
  PostalWebhookPayloadMappingError
> => {
  switch (envelope.event) {
    case postalWebhookEvent.messageSent:
      return decodePostalWebhookMessagePayload(envelope.payload).pipe(
        Effect.mapError((cause) =>
          mapPostalWebhookPayloadError({
            event: envelope.event,
            reason: "invalidPayload",
            cause,
          }),
        ),
        Effect.flatMap((payload) =>
          normalizePostalWebhookTimestamp({
            event: envelope.event,
            timestamp: payload.timestamp ?? envelope.timestamp,
          }).pipe(
            Effect.flatMap((occurredAt) =>
              decodeEmailDeliveryProviderEvent({
                messageId: payload.message.message_id,
                eventType: emailDeliveryProviderEventType.delivered,
                occurredAt,
              }).pipe(
                Effect.mapError((cause) =>
                  mapPostalWebhookPayloadError({
                    event: envelope.event,
                    reason: "invalidPayload",
                    cause,
                  }),
                ),
              ),
            ),
          ),
        ),
      );
    case postalWebhookEvent.messageDelayed:
      return decodePostalWebhookMessagePayload(envelope.payload).pipe(
        Effect.mapError((cause) =>
          mapPostalWebhookPayloadError({
            event: envelope.event,
            reason: "invalidPayload",
            cause,
          }),
        ),
        Effect.flatMap((payload) =>
          normalizePostalWebhookTimestamp({
            event: envelope.event,
            timestamp: payload.timestamp ?? envelope.timestamp,
          }).pipe(
            Effect.flatMap((occurredAt) =>
              decodeEmailDeliveryProviderEvent({
                messageId: payload.message.message_id,
                eventType: emailDeliveryProviderEventType.bounced,
                bounceType: emailDeliveryBounceType.soft,
                occurredAt,
              }).pipe(
                Effect.mapError((cause) =>
                  mapPostalWebhookPayloadError({
                    event: envelope.event,
                    reason: "invalidPayload",
                    cause,
                  }),
                ),
              ),
            ),
          ),
        ),
      );
    case postalWebhookEvent.messageDeliveryFailed:
      return decodePostalWebhookMessagePayload(envelope.payload).pipe(
        Effect.mapError((cause) =>
          mapPostalWebhookPayloadError({
            event: envelope.event,
            reason: "invalidPayload",
            cause,
          }),
        ),
        Effect.flatMap((payload) =>
          normalizePostalWebhookTimestamp({
            event: envelope.event,
            timestamp: payload.timestamp ?? envelope.timestamp,
          }).pipe(
            Effect.flatMap((occurredAt) =>
              decodeEmailDeliveryProviderEvent({
                messageId: payload.message.message_id,
                eventType: emailDeliveryProviderEventType.bounced,
                bounceType: emailDeliveryBounceType.hard,
                occurredAt,
              }).pipe(
                Effect.mapError((cause) =>
                  mapPostalWebhookPayloadError({
                    event: envelope.event,
                    reason: "invalidPayload",
                    cause,
                  }),
                ),
              ),
            ),
          ),
        ),
      );
    case postalWebhookEvent.messageBounced:
      return decodePostalWebhookBouncePayload(envelope.payload).pipe(
        Effect.mapError((cause) =>
          mapPostalWebhookPayloadError({
            event: envelope.event,
            reason: "invalidPayload",
            cause,
          }),
        ),
        Effect.flatMap((payload) =>
          normalizePostalWebhookTimestamp({
            event: envelope.event,
            timestamp: payload.bounce.timestamp ?? envelope.timestamp,
          }).pipe(
            Effect.flatMap((occurredAt) =>
              decodeEmailDeliveryProviderEvent({
                messageId: payload.original_message.message_id,
                eventType: emailDeliveryProviderEventType.bounced,
                bounceType: emailDeliveryBounceType.hard,
                occurredAt,
              }).pipe(
                Effect.mapError((cause) =>
                  mapPostalWebhookPayloadError({
                    event: envelope.event,
                    reason: "invalidPayload",
                    cause,
                  }),
                ),
              ),
            ),
          ),
        ),
      );
    default:
      return Effect.succeed(null);
  }
};

const buildPostalSendMessageRequestBody = (input: PostalSendEmailInput) => ({
  to: [input.recipient],
  from: buildPostalFromHeader(input),
  subject: input.subject,
  reply_to: input.replyToEmail,
  html_body: input.html,
  ...(input.text != null ? { plain_body: input.text } : {}),
  headers: {
    "Message-ID": input.messageId,
    "X-Comvestec-Tracking-Message-Id": input.messageId,
  },
});

const createPostalSendMessageRequest = (options: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly request: PostalSendEmailInput;
  readonly fetchImplementation: typeof fetch;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await options.fetchImplementation(
        new URL("/api/v1/send/message", options.apiUrl).toString(),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Server-API-Key": options.apiKey,
          },
          body: JSON.stringify(
            buildPostalSendMessageRequestBody(options.request),
          ),
        },
      );
      const responseText = await response.text();

      if (!response.ok) {
        throw {
          cause: response.statusText,
          status: response.status,
          body: responseText,
        } satisfies PostalRequestFailure;
      }

      return responseText.length === 0 ? {} : JSON.parse(responseText);
    },
    catch: (cause) => {
      if (isPostalRequestFailure(cause)) {
        return buildPostalRequestError("sendEmail", cause);
      }

      return buildPostalRequestError("sendEmail", { cause });
    },
  }).pipe(
    Effect.flatMap(decodePostalSendMessageResponse),
    Effect.flatMap((response: PostalSendMessageResponse) =>
      response.status === "success"
        ? Effect.succeed(response)
        : Effect.fail(
            buildPostalRequestError("sendEmail", {
              cause: response.data ?? response.status,
              status: 200,
              body: JSON.stringify(response),
            }),
          ),
    ),
  );

const createPostalHealthcheckRequest = (options: {
  readonly endpoint: string;
  readonly headers?: HeadersInit;
  readonly fetchImplementation: typeof fetch;
  readonly method?: "GET" | "POST";
  readonly body?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await options.fetchImplementation(options.endpoint, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(options.headers ?? {}),
        },
        ...(options.body !== undefined ? { body: options.body } : {}),
      });
      const responseText = await response.text();

      if (response.ok) {
        return responseText.length === 0 ? {} : JSON.parse(responseText);
      }

      throw {
        cause: response.statusText,
        status: response.status,
        body: responseText,
      } satisfies PostalRequestFailure;
    },
    catch: (cause) =>
      isPostalRequestFailure(cause)
        ? buildPostalRequestError("healthcheck", cause)
        : buildPostalRequestError("healthcheck", { cause }),
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPostalHealthcheckResponseHealthy = (response: unknown) => {
  if (!isRecord(response)) {
    return false;
  }

  const status = response.status;

  if (status === "success") {
    return true;
  }

  if (status !== "error" && status !== "parameter-error") {
    return false;
  }

  const data = response.data;

  if (!isRecord(data)) {
    return false;
  }

  if (typeof data.code === "string") {
    return !["AccessDenied", "InvalidServerAPIKey", "ServerSuspended"].includes(
      data.code,
    );
  }

  return (
    status === "parameter-error" &&
    typeof data.message === "string" &&
    data.message.length > 0
  );
};

const createPostalHealthcheck = (options: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<
  PostalHealthcheck,
  ParseResult.ParseError | PostalAdapterRequestError
> =>
  createPostalHealthcheckRequest({
    endpoint: new URL("/api/v1/send/message", options.apiUrl).toString(),
    headers: {
      "X-Server-API-Key": options.apiKey,
    },
    fetchImplementation: options.fetchImplementation,
    method: "POST",
    body: JSON.stringify({}),
  }).pipe(
    Effect.flatMap(
      (
        response,
      ): Effect.Effect<
        PostalHealthcheck,
        ParseResult.ParseError | PostalAdapterRequestError
      > =>
        isPostalHealthcheckResponseHealthy(response)
          ? decodePostalHealthcheck({
              healthy: true,
              service: platformAdapterServiceName.postal,
            })
          : Effect.fail(
              buildPostalRequestError("healthcheck", {
                cause: "Unexpected Postal healthcheck payload",
                status: 200,
                body: JSON.stringify(response),
              }),
            ),
    ),
  );

export const validateAndNormalizePostalWebhookRequest = (input: {
  readonly request: Request;
  readonly apiUrl: string;
  readonly fetchImplementation?: typeof fetch;
  readonly signingKeyBase64?: string;
}): Effect.Effect<
  EmailDeliveryProviderEvent | null,
  PostalWebhookValidationError
> => {
  const fetchImplementation = input.fetchImplementation ?? fetch;

  return Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => input.request.text(),
      catch: () =>
        mapPostalWebhookPayloadError({
          event: "unknown",
          reason: "invalidJson",
        }),
    });
    const headers = yield* extractPostalWebhookSignatureHeaders(input.request);
    const verificationKeys = yield* resolvePostalWebhookVerificationKeys({
      apiUrl: input.apiUrl,
      fetchImplementation,
      ...(input.signingKeyBase64 !== undefined
        ? { signingKeyBase64: input.signingKeyBase64 }
        : {}),
    });

    yield* verifyPostalWebhookSignature({
      body,
      signature: headers.signature,
      keyId: headers.keyId,
      verificationKeys,
    });

    const payload = yield* parsePostalWebhookJsonBody(body);
    const envelope = yield* decodePostalWebhookEnvelope(payload).pipe(
      Effect.mapError((cause) =>
        mapPostalWebhookPayloadError({
          event: "unknown",
          reason: "invalidPayload",
          cause,
        }),
      ),
    );

    return yield* mapPostalWebhookEnvelopeToProviderEvent(envelope);
  });
};

export type PostalAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.postal;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<
    PostalHealthcheck,
    ParseResult.ParseError | PostalAdapterRequestError
  >;
  readonly sendEmail: (
    input: PostalSendEmailInput,
  ) => Effect.Effect<PostalSendEmailReceipt, PostalAdapterError>;
};

export class PostalAdapter extends Context.Tag("PostalAdapter")<
  PostalAdapter,
  PostalAdapterService
>() {}

export const makePostalAdapter = (input: PostalAdapterOptions) =>
  Schema.decodeUnknown(PostalAdapterOptionsSchema)(input).pipe(
    Effect.map((options): PostalAdapterService => {
      const fetchImplementation = input.fetch ?? fetch;

      return {
        serviceName: platformAdapterServiceName.postal,
        apiUrl: options.apiUrl,
        healthcheck: createPostalHealthcheck({
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
          fetchImplementation,
        }),
        sendEmail: (input: PostalSendEmailInput) =>
          Schema.decodeUnknown(PostalSendEmailInputSchema)(input).pipe(
            Effect.flatMap((request) =>
              createPostalSendMessageRequest({
                apiUrl: options.apiUrl,
                apiKey: options.apiKey,
                request,
                fetchImplementation,
              }).pipe(
                Effect.flatMap(() =>
                  decodePostalSendEmailReceipt({
                    messageId: request.messageId,
                    recipient: request.recipient,
                    status: "queued",
                    sentAt: new Date().toISOString(),
                    provider: platformAdapterServiceName.postal,
                  }),
                ),
              ),
            ),
          ),
      };
    }),
  );

export const makePostalAdapterLayer = (options: PostalAdapterOptions) =>
  Layer.effect(PostalAdapter, makePostalAdapter(options));
