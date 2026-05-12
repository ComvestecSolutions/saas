import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const OpenPanelAdapterOptionsSchema = Schema.Struct({
  clientId: Schema.NonEmptyString,
  clientSecret: Schema.NonEmptyString,
  apiUrl: Schema.NonEmptyString,
});

export type OpenPanelAdapterOptions = Schema.Schema.Type<
  typeof OpenPanelAdapterOptionsSchema
>;

const OpenPanelTrackEventPropertiesSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: Schema.Unknown,
});

export const OpenPanelTrackEventSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.optional(OpenPanelTrackEventPropertiesSchema),
  profileId: Schema.optional(
    Schema.Union(Schema.NonEmptyString, Schema.Number),
  ),
  groups: Schema.optional(Schema.Array(Schema.NonEmptyString)),
});

export type OpenPanelTrackEvent = Schema.Schema.Type<
  typeof OpenPanelTrackEventSchema
>;

const OpenPanelHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.openpanel,
);

const decodeOpenPanelHealthcheck = Schema.decodeUnknown(
  OpenPanelHealthcheckSchema,
);

export type OpenPanelHealthcheck = Schema.Schema.Type<
  typeof OpenPanelHealthcheckSchema
>;

const decodeOpenPanelTrackEvent = Schema.decodeUnknown(
  OpenPanelTrackEventSchema,
);

type OpenPanelAdapterOperation = "healthcheck" | "trackEvent";

export class OpenPanelAdapterRequestError extends Error {
  readonly _tag = "OpenPanelAdapterRequestError";

  constructor(
    readonly operation: OpenPanelAdapterOperation,
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(
      `OpenPanel ${operation} failed with status ${status} for ${endpoint}.`,
    );
    this.name = "OpenPanelAdapterRequestError";
  }
}

export class OpenPanelAdapterTransportError extends Error {
  readonly _tag = "OpenPanelAdapterTransportError";

  constructor(
    readonly operation: OpenPanelAdapterOperation,
    readonly endpoint: string,
    readonly transportCause: unknown,
  ) {
    super(`OpenPanel ${operation} transport failed for ${endpoint}.`);
    this.name = "OpenPanelAdapterTransportError";
  }
}

export type OpenPanelAdapterError =
  | ParseResult.ParseError
  | OpenPanelAdapterRequestError
  | OpenPanelAdapterTransportError;

type OpenPanelAdapterRuntimeOptions = OpenPanelAdapterOptions & {
  readonly fetch?: typeof fetch;
};

const buildOpenPanelTrackEndpoint = (apiUrl: string) =>
  `${apiUrl.replace(/\/+$/, "")}/track`;

const buildOpenPanelHeaders = (input: {
  readonly clientId: string;
  readonly clientSecret: string;
}) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  "openpanel-client-id": input.clientId,
  "openpanel-client-secret": input.clientSecret,
});

const OpenPanelAuthenticatedHealthcheckPayload = {
  payload: {
    properties: {
      __revenue: 1,
    },
  },
} as const;

const createOpenPanelHealthcheck = (input: {
  readonly apiUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<OpenPanelHealthcheck, OpenPanelAdapterError> => {
  const endpoint = buildOpenPanelTrackEndpoint(input.apiUrl);

  return Effect.tryPromise({
    try: () =>
      input.fetchImplementation(endpoint, {
        method: "POST",
        headers: buildOpenPanelHeaders({
          clientId: input.clientId,
          clientSecret: input.clientSecret,
        }),
        body: JSON.stringify(OpenPanelAuthenticatedHealthcheckPayload),
      }),
    catch: (cause) =>
      new OpenPanelAdapterTransportError("healthcheck", endpoint, cause),
  }).pipe(
    Effect.flatMap(
      (response): Effect.Effect<OpenPanelHealthcheck, OpenPanelAdapterError> =>
        response.ok || response.status === 400 || response.status === 422
          ? decodeOpenPanelHealthcheck({
              healthy: true,
              service: platformAdapterServiceName.openpanel,
            })
          : Effect.fail(
              new OpenPanelAdapterRequestError(
                "healthcheck",
                endpoint,
                response.status,
              ),
            ),
    ),
  );
};

const createOpenPanelTrackEvent = (input: {
  readonly apiUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const endpoint = buildOpenPanelTrackEndpoint(input.apiUrl);

  return (event: OpenPanelTrackEvent) =>
    decodeOpenPanelTrackEvent(event).pipe(
      Effect.flatMap((payload) =>
        Effect.tryPromise({
          try: () =>
            input.fetchImplementation(endpoint, {
              method: "POST",
              headers: buildOpenPanelHeaders({
                clientId: input.clientId,
                clientSecret: input.clientSecret,
              }),
              body: JSON.stringify({
                type: "track",
                payload,
              }),
            }),
          catch: (cause) =>
            new OpenPanelAdapterTransportError("trackEvent", endpoint, cause),
        }).pipe(
          Effect.flatMap((response) =>
            response.ok
              ? Effect.succeed(payload)
              : Effect.fail(
                  new OpenPanelAdapterRequestError(
                    "trackEvent",
                    endpoint,
                    response.status,
                  ),
                ),
          ),
        ),
      ),
    );
};

export type OpenPanelAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.openpanel;
  readonly clientId: string;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<
    OpenPanelHealthcheck,
    OpenPanelAdapterError
  >;
  readonly trackEvent: (
    input: OpenPanelTrackEvent,
  ) => Effect.Effect<OpenPanelTrackEvent, OpenPanelAdapterError>;
};

export class OpenPanelAdapter extends Context.Tag("OpenPanelAdapter")<
  OpenPanelAdapter,
  OpenPanelAdapterService
>() {}

export const makeOpenPanelAdapter = (input: OpenPanelAdapterRuntimeOptions) =>
  Schema.decodeUnknown(OpenPanelAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): OpenPanelAdapterService => ({
        serviceName: platformAdapterServiceName.openpanel,
        clientId: options.clientId,
        apiUrl: options.apiUrl,
        healthcheck: createOpenPanelHealthcheck({
          apiUrl: options.apiUrl,
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          fetchImplementation: input.fetch ?? fetch,
        }),
        trackEvent: createOpenPanelTrackEvent({
          apiUrl: options.apiUrl,
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          fetchImplementation: input.fetch ?? fetch,
        }),
      }),
    ),
  );

export const makeOpenPanelAdapterLayer = (options: OpenPanelAdapterOptions) =>
  Layer.effect(OpenPanelAdapter, makeOpenPanelAdapter(options));
