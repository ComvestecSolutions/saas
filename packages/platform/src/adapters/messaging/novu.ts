import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
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

export const NovuTriggerEventInputSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  to: Schema.Unknown,
  payload: Schema.optional(Schema.Unknown),
  overrides: Schema.optional(Schema.Unknown),
  transactionId: Schema.optional(Schema.NonEmptyString),
  actor: Schema.optional(Schema.Unknown),
  tenant: Schema.optional(Schema.Unknown),
  context: Schema.optional(Schema.Unknown),
});

export type NovuTriggerEventInput = Schema.Schema.Type<
  typeof NovuTriggerEventInputSchema
>;

const decodeNovuTriggerEventInput = Schema.decodeUnknown(
  NovuTriggerEventInputSchema,
);

export const NovuTriggeredEventReceiptSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  createdAt: Schema.NonEmptyString,
  provider: Schema.Literal(platformAdapterServiceName.novu),
});

export type NovuTriggeredEventReceipt = Schema.Schema.Type<
  typeof NovuTriggeredEventReceiptSchema
>;

const decodeNovuTriggeredEventReceipt = Schema.decodeUnknown(
  NovuTriggeredEventReceiptSchema,
);

const NovuChannelTypeSchema = Schema.Literal(
  "in_app",
  "email",
  "sms",
  "chat",
  "push",
);

export type NovuChannelType = Schema.Schema.Type<typeof NovuChannelTypeSchema>;

const NovuSubscriberRecordSchema = Schema.Struct({
  subscriberId: Schema.NonEmptyString,
  email: Schema.optional(Schema.NullOr(Schema.String)),
  phone: Schema.optional(Schema.NullOr(Schema.String)),
  firstName: Schema.optional(Schema.NullOr(Schema.String)),
  lastName: Schema.optional(Schema.NullOr(Schema.String)),
});

export type NovuSubscriberRecord = Schema.Schema.Type<
  typeof NovuSubscriberRecordSchema
>;

export const NovuMessageRecordSchema = Schema.Struct({
  _id: Schema.NonEmptyString,
  _notificationId: Schema.NonEmptyString,
  _subscriberId: Schema.NonEmptyString,
  _templateId: Schema.optional(Schema.NullOr(Schema.String)),
  templateIdentifier: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: Schema.NonEmptyString,
  deliveredAt: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  content: Schema.optional(Schema.Unknown),
  transactionId: Schema.NonEmptyString,
  subject: Schema.optional(Schema.NullOr(Schema.String)),
  channel: NovuChannelTypeSchema,
  email: Schema.optional(Schema.NullOr(Schema.String)),
  phone: Schema.optional(Schema.NullOr(Schema.String)),
  directWebhookUrl: Schema.optional(Schema.NullOr(Schema.String)),
  providerId: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.NonEmptyString,
  errorText: Schema.optional(Schema.NullOr(Schema.String)),
  payload: Schema.optional(Schema.Unknown),
  overrides: Schema.optional(Schema.Unknown),
  contextKeys: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  subscriber: Schema.optional(Schema.NullOr(NovuSubscriberRecordSchema)),
});

export type NovuMessageRecord = Schema.Schema.Type<
  typeof NovuMessageRecordSchema
>;

export const NovuMessagePageSchema = Schema.Struct({
  hasMore: Schema.Boolean,
  data: Schema.Array(NovuMessageRecordSchema),
  pageSize: Schema.Number,
  page: Schema.Number,
  totalCount: Schema.optional(Schema.Number),
});

export type NovuMessagePage = Schema.Schema.Type<typeof NovuMessagePageSchema>;

const decodeNovuMessagePage = Schema.decodeUnknown(NovuMessagePageSchema);

const NovuNotificationTriggerRecordSchema = Schema.Struct({
  identifier: Schema.NonEmptyString,
});

const NovuNotificationEventTemplateSchema = Schema.Struct({
  triggers: Schema.Array(NovuNotificationTriggerRecordSchema),
});

export const NovuNotificationEventRecordSchema = Schema.Struct({
  _id: Schema.NonEmptyString,
  transactionId: Schema.NonEmptyString,
  payload: Schema.optional(Schema.Unknown),
  to: Schema.optional(Schema.Unknown),
  contextKeys: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  subscriber: Schema.optional(Schema.NullOr(NovuSubscriberRecordSchema)),
  template: Schema.optional(Schema.NullOr(NovuNotificationEventTemplateSchema)),
});

export type NovuNotificationEventRecord = Schema.Schema.Type<
  typeof NovuNotificationEventRecordSchema
>;

const decodeNovuNotificationEventRecord = Schema.decodeUnknown(
  NovuNotificationEventRecordSchema,
);

export const NovuNotificationLookupSchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
});

export type NovuNotificationLookup = Schema.Schema.Type<
  typeof NovuNotificationLookupSchema
>;

const decodeNovuNotificationLookup = Schema.decodeUnknown(
  NovuNotificationLookupSchema,
);

export const NovuListMessagesInputSchema = Schema.Struct({
  channel: Schema.optional(NovuChannelTypeSchema),
  subscriberId: Schema.optional(Schema.NonEmptyString),
  transactionIds: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  contextKeys: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  page: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  ),
  limit: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  ),
});

export type NovuListMessagesInput = Schema.Schema.Type<
  typeof NovuListMessagesInputSchema
>;

const decodeNovuListMessagesInput = Schema.decodeUnknown(
  NovuListMessagesInputSchema,
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

type NovuAdapterOperation =
  | "healthcheck"
  | "triggerNotification"
  | "triggerEvent"
  | "getNotification"
  | "listMessages";

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

const buildNovuTriggerNotificationRequestBody = (
  input: NovuTriggerNotificationInput,
) => ({
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

const createNovuTriggerEventOperation = (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const endpoint = buildNovuEndpoint(input.apiUrl, "/v1/events/trigger");

  return (
    operation: "triggerNotification" | "triggerEvent",
    requestBody: unknown,
  ): Effect.Effect<NovuTriggeredEventReceipt, NovuAdapterError> =>
    Effect.tryPromise({
      try: async () => {
        const response = await input.fetchImplementation(endpoint, {
          method: "POST",
          headers: buildNovuHeaders(input.apiKey),
          body: JSON.stringify(requestBody),
        });
        const responseText = await response.text();

        if (!response.ok) {
          throw new NovuAdapterRequestError(
            operation,
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

        return new NovuAdapterTransportError(operation, endpoint, cause);
      },
    }).pipe(
      Effect.flatMap(decodeNovuTriggerEventResponse),
      Effect.flatMap(
        (
          response,
        ): Effect.Effect<NovuTriggeredEventReceipt, NovuAdapterError> => {
          const payload = unwrapNovuTriggerEventResponse(response);

          return payload.acknowledged
            ? decodeNovuTriggeredEventReceipt({
                id: resolveNovuReceiptId(payload),
                createdAt: new Date().toISOString(),
                provider: platformAdapterServiceName.novu,
              })
            : Effect.fail(
                new NovuAdapterRequestError(
                  operation,
                  endpoint,
                  202,
                  JSON.stringify(payload),
                ),
              );
        },
      ),
    );
};

const createNovuTriggerNotification = (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const runTriggerEvent = createNovuTriggerEventOperation(input);

  return (
    notificationInput: NovuTriggerNotificationInput,
  ): Effect.Effect<NovuNotificationDispatchReceipt, NovuAdapterError> =>
    decodeNovuTriggerNotificationInput(notificationInput).pipe(
      Effect.flatMap((request) =>
        runTriggerEvent(
          "triggerNotification",
          buildNovuTriggerNotificationRequestBody(request),
        ).pipe(
          Effect.flatMap((receipt) =>
            decodeNovuNotificationDispatchReceipt({
              id: receipt.id,
              channel: request.channel,
              status: "queued",
              recipient: request.recipient,
              template: request.template,
              createdAt: receipt.createdAt,
              provider: receipt.provider,
            }),
          ),
        ),
      ),
    );
};

const createNovuTriggerEvent = (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const runTriggerEvent = createNovuTriggerEventOperation(input);

  return (
    eventInput: NovuTriggerEventInput,
  ): Effect.Effect<NovuTriggeredEventReceipt, NovuAdapterError> =>
    decodeNovuTriggerEventInput(eventInput).pipe(
      Effect.flatMap((request) =>
        runTriggerEvent("triggerEvent", {
          name: request.name,
          to: request.to,
          ...(request.payload === undefined
            ? {}
            : { payload: request.payload }),
          ...(request.overrides === undefined
            ? {}
            : { overrides: request.overrides }),
          ...(request.transactionId === undefined
            ? {}
            : { transactionId: request.transactionId }),
          ...(request.actor === undefined ? {} : { actor: request.actor }),
          ...(request.tenant === undefined ? {} : { tenant: request.tenant }),
          ...(request.context === undefined
            ? {}
            : { context: request.context }),
        }),
      ),
    );
};

const appendQueryArray = (
  searchParams: URLSearchParams,
  key: string,
  values: ReadonlyArray<string>,
) => {
  for (const value of values) {
    searchParams.append(key, value);
  }
};

const createNovuListMessages = (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const endpoint = buildNovuEndpoint(input.apiUrl, "/v1/messages");

  return (
    listInput: NovuListMessagesInput,
  ): Effect.Effect<NovuMessagePage, NovuAdapterError> =>
    decodeNovuListMessagesInput(listInput).pipe(
      Effect.flatMap((request) => {
        const url = new URL(endpoint);

        if (request.channel !== undefined) {
          url.searchParams.set("channel", request.channel);
        }
        if (request.subscriberId !== undefined) {
          url.searchParams.set("subscriberId", request.subscriberId);
        }
        if (
          request.transactionIds !== undefined &&
          request.transactionIds.length > 0
        ) {
          appendQueryArray(
            url.searchParams,
            "transactionId",
            request.transactionIds,
          );
        }
        if (
          request.contextKeys !== undefined &&
          request.contextKeys.length > 0
        ) {
          appendQueryArray(
            url.searchParams,
            "contextKeys",
            request.contextKeys,
          );
        }
        if (request.page !== undefined) {
          url.searchParams.set("page", request.page.toString());
        }
        if (request.limit !== undefined) {
          url.searchParams.set("limit", request.limit.toString());
        }

        return Effect.tryPromise({
          try: async () => {
            const response = await input.fetchImplementation(url.toString(), {
              method: "GET",
              headers: {
                Accept: "application/json",
                Authorization: `ApiKey ${input.apiKey}`,
              },
            });
            const responseText = await response.text();

            if (!response.ok) {
              throw new NovuAdapterRequestError(
                "listMessages",
                url.toString(),
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
              "listMessages",
              url.toString(),
              cause,
            );
          },
        }).pipe(Effect.flatMap(decodeNovuMessagePage));
      }),
    );
};

const createNovuGetNotification = (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  return (
    notificationLookup: NovuNotificationLookup,
  ): Effect.Effect<
    Option.Option<NovuNotificationEventRecord>,
    NovuAdapterError
  > =>
    decodeNovuNotificationLookup(notificationLookup).pipe(
      Effect.flatMap((request) => {
        const endpoint = buildNovuEndpoint(
          input.apiUrl,
          `/v1/notifications/${encodeURIComponent(request.notificationId)}`,
        );

        return Effect.tryPromise({
          try: async () => {
            const response = await input.fetchImplementation(endpoint, {
              method: "GET",
              headers: {
                Accept: "application/json",
                Authorization: `ApiKey ${input.apiKey}`,
              },
            });

            if (response.status === 404) {
              return null;
            }

            const responseText = await response.text();

            if (!response.ok) {
              throw new NovuAdapterRequestError(
                "getNotification",
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
              "getNotification",
              endpoint,
              cause,
            );
          },
        }).pipe(
          Effect.flatMap((responseBody) =>
            responseBody === null
              ? Effect.succeed(Option.none<NovuNotificationEventRecord>())
              : decodeNovuNotificationEventRecord(responseBody).pipe(
                  Effect.map((notification) => Option.some(notification)),
                ),
          ),
        );
      }),
    );
};

export type NovuAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.novu;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<NovuHealthcheck, NovuAdapterError>;
  readonly triggerNotification: (
    input: NovuTriggerNotificationInput,
  ) => Effect.Effect<NovuNotificationDispatchReceipt, NovuAdapterError>;
  readonly triggerEvent: (
    input: NovuTriggerEventInput,
  ) => Effect.Effect<NovuTriggeredEventReceipt, NovuAdapterError>;
  readonly getNotification: (
    input: NovuNotificationLookup,
  ) => Effect.Effect<
    Option.Option<NovuNotificationEventRecord>,
    NovuAdapterError
  >;
  readonly listMessages: (
    input: NovuListMessagesInput,
  ) => Effect.Effect<NovuMessagePage, NovuAdapterError>;
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
        triggerEvent: createNovuTriggerEvent({
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
          fetchImplementation: input.fetch ?? fetch,
        }),
        getNotification: createNovuGetNotification({
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
          fetchImplementation: input.fetch ?? fetch,
        }),
        listMessages: createNovuListMessages({
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
          fetchImplementation: input.fetch ?? fetch,
        }),
      }),
    ),
  );

export const makeNovuAdapterLayer = (options: NovuAdapterOptions) =>
  Layer.effect(NovuAdapter, makeNovuAdapter(options));
