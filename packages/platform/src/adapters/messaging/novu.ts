import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const NovuAdapterOptionsSchema = Schema.Struct({
  apiKey: Schema.NonEmptyString,
  apiUrl: Schema.NonEmptyString,
});

export type NovuAdapterOptions = Schema.Schema.Type<
  typeof NovuAdapterOptionsSchema
>;

type NovuAdapterRuntimeOptions = NovuAdapterOptions & {
  readonly fetch?: typeof fetch;
};

const NovuHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.novu,
);

const decodeNovuHealthcheck = Schema.decodeUnknown(NovuHealthcheckSchema);

export type NovuHealthcheck = Schema.Schema.Type<typeof NovuHealthcheckSchema>;

export const NovuTriggerNotificationInputSchema = Schema.Struct({
  channel: Schema.Literal("email"),
  recipient: Schema.NonEmptyString,
  template: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
});

export type NovuTriggerNotificationInput = Schema.Schema.Type<
  typeof NovuTriggerNotificationInputSchema
>;

const decodeNovuTriggerNotificationInput = Schema.decodeUnknown(
  NovuTriggerNotificationInputSchema,
);

export const NovuNotificationDispatchReceiptSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  channel: Schema.Literal("email"),
  status: Schema.Literal("queued"),
  recipient: Schema.NonEmptyString,
  template: Schema.NonEmptyString,
  createdAt: Schema.NonEmptyString,
  provider: Schema.Literal(platformAdapterServiceName.novu),
});

export type NovuNotificationDispatchReceipt = Schema.Schema.Type<
  typeof NovuNotificationDispatchReceiptSchema
>;

const decodeNovuNotificationDispatchReceipt = Schema.decodeUnknown(
  NovuNotificationDispatchReceiptSchema,
);

const NovuTriggerEventPayloadSchema = Schema.Union(
  Schema.Struct({
    acknowledged: Schema.Boolean,
    status: Schema.optional(Schema.NonEmptyString),
    transactionId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    acknowledged: Schema.Boolean,
    status: Schema.optional(Schema.NonEmptyString),
    id: Schema.NonEmptyString,
  }),
  Schema.Struct({
    acknowledged: Schema.Boolean,
    status: Schema.optional(Schema.NonEmptyString),
    data: Schema.Struct({
      transactionId: Schema.NonEmptyString,
    }),
  }),
);

const NovuTriggerEventResponseSchema = Schema.Union(
  NovuTriggerEventPayloadSchema,
  Schema.Struct({
    data: NovuTriggerEventPayloadSchema,
  }),
);

type NovuTriggerEventPayload = Schema.Schema.Type<
  typeof NovuTriggerEventPayloadSchema
>;

type NovuTriggerEventResponse = Schema.Schema.Type<
  typeof NovuTriggerEventResponseSchema
>;

const decodeNovuTriggerEventResponse = Schema.decodeUnknown(
  NovuTriggerEventResponseSchema,
);

type NovuAdapterOperation = "healthcheck" | "triggerNotification";

export class NovuAdapterRequestError extends Error {
  readonly _tag = "NovuAdapterRequestError";

  constructor(
    readonly operation: NovuAdapterOperation,
    readonly endpoint: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(`Novu ${operation} failed with status ${status} for ${endpoint}.`);
    this.name = "NovuAdapterRequestError";
  }
}

export class NovuAdapterTransportError extends Error {
  readonly _tag = "NovuAdapterTransportError";

  constructor(
    readonly operation: NovuAdapterOperation,
    readonly endpoint: string,
    readonly transportCause: unknown,
  ) {
    super(`Novu ${operation} transport failed for ${endpoint}.`);
    this.name = "NovuAdapterTransportError";
  }
}

export type NovuAdapterError =
  | ParseResult.ParseError
  | NovuAdapterRequestError
  | NovuAdapterTransportError;

const buildNovuEndpoint = (apiUrl: string, pathname: string) =>
  new URL(pathname, apiUrl).toString();

const buildNovuHeaders = (apiKey: string) => ({
  Accept: "application/json",
  Authorization: `ApiKey ${apiKey}`,
  "Content-Type": "application/json",
});

export const buildNovuWorkflowIdentifier = (template: string) =>
  template.replaceAll(".", "-");

const buildNovuTriggerRequestBody = (input: NovuTriggerNotificationInput) => ({
  name: buildNovuWorkflowIdentifier(input.template),
  to: {
    subscriberId: input.recipient.toLowerCase(),
    email: input.recipient,
  },
  payload: {
    subject: input.subject,
    recipient: input.recipient,
  },
  overrides: {
    email: {
      subject: input.subject,
    },
  },
});

const unwrapNovuTriggerEventResponse = (
  response: NovuTriggerEventResponse,
): NovuTriggerEventPayload =>
  "acknowledged" in response ? response : response.data;

const resolveNovuReceiptId = (response: NovuTriggerEventPayload) => {
  if ("transactionId" in response) {
    return response.transactionId;
  }

  if ("id" in response) {
    return response.id;
  }

  return response.data.transactionId;
};

const createNovuHealthcheck = (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<NovuHealthcheck, NovuAdapterError> => {
  const endpoint = buildNovuEndpoint(input.apiUrl, "/v1/environments/me");

  return Effect.tryPromise({
    try: () =>
      input.fetchImplementation(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `ApiKey ${input.apiKey}`,
        },
      }),
    catch: (cause) =>
      new NovuAdapterTransportError("healthcheck", endpoint, cause),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.novu,
          })
        : Effect.tryPromise({
            try: async () => {
              throw new NovuAdapterRequestError(
                "healthcheck",
                endpoint,
                response.status,
                await response.text(),
              );
            },
            catch: (cause) =>
              cause instanceof NovuAdapterRequestError
                ? cause
                : new NovuAdapterTransportError("healthcheck", endpoint, cause),
          }),
    ),
    Effect.flatMap(decodeNovuHealthcheck),
  );
};

const createNovuTriggerNotification = (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const endpoint = buildNovuEndpoint(input.apiUrl, "/v1/events/trigger");

  return (
    notificationInput: NovuTriggerNotificationInput,
  ): Effect.Effect<NovuNotificationDispatchReceipt, NovuAdapterError> =>
    decodeNovuTriggerNotificationInput(notificationInput).pipe(
      Effect.flatMap((request) =>
        Effect.tryPromise({
          try: async () => {
            const response = await input.fetchImplementation(endpoint, {
              method: "POST",
              headers: buildNovuHeaders(input.apiKey),
              body: JSON.stringify(buildNovuTriggerRequestBody(request)),
            });
            const responseText = await response.text();

            if (!response.ok) {
              throw new NovuAdapterRequestError(
                "triggerNotification",
                endpoint,
                response.status,
                responseText,
              );
            }

            return responseText.length === 0 ? {} : JSON.parse(responseText);
          },
          catch: (cause) => {
            if (cause instanceof NovuAdapterRequestError) {
              return cause;
            }

            return new NovuAdapterTransportError(
              "triggerNotification",
              endpoint,
              cause,
            );
          },
        }).pipe(
          Effect.flatMap(decodeNovuTriggerEventResponse),
          Effect.flatMap(
            (
              response,
            ): Effect.Effect<
              NovuNotificationDispatchReceipt,
              NovuAdapterError
            > => {
              const payload = unwrapNovuTriggerEventResponse(response);

              return payload.acknowledged
                ? decodeNovuNotificationDispatchReceipt({
                    id: resolveNovuReceiptId(payload),
                    channel: request.channel,
                    status: "queued",
                    recipient: request.recipient,
                    template: request.template,
                    createdAt: new Date().toISOString(),
                    provider: platformAdapterServiceName.novu,
                  })
                : Effect.fail(
                    new NovuAdapterRequestError(
                      "triggerNotification",
                      endpoint,
                      202,
                      JSON.stringify(payload),
                    ),
                  );
            },
          ),
        ),
      ),
    );
};

export type NovuAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.novu;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<NovuHealthcheck, NovuAdapterError>;
  readonly triggerNotification: (
    input: NovuTriggerNotificationInput,
  ) => Effect.Effect<NovuNotificationDispatchReceipt, NovuAdapterError>;
};

export class NovuAdapter extends Context.Tag("NovuAdapter")<
  NovuAdapter,
  NovuAdapterService
>() {}

export const makeNovuAdapter = (input: NovuAdapterRuntimeOptions) =>
  Schema.decodeUnknown(NovuAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): NovuAdapterService => ({
        serviceName: platformAdapterServiceName.novu,
        apiUrl: options.apiUrl,
        healthcheck: createNovuHealthcheck({
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
          fetchImplementation: input.fetch ?? fetch,
        }),
        triggerNotification: createNovuTriggerNotification({
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
          fetchImplementation: input.fetch ?? fetch,
        }),
      }),
    ),
  );

export const makeNovuAdapterLayer = (options: NovuAdapterOptions) =>
  Layer.effect(NovuAdapter, makeNovuAdapter(options));
