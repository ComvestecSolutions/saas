import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const OpenmeterAdapterOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

export type OpenmeterAdapterOptions = Schema.Schema.Type<
  typeof OpenmeterAdapterOptionsSchema
>;

type OpenmeterAdapterRuntimeOptions = OpenmeterAdapterOptions & {
  readonly fetch?: typeof fetch;
};

export const OpenmeterUsageEventSchema = Schema.Struct({
  subject: Schema.NonEmptyString,
  eventName: Schema.NonEmptyString,
  quantity: Schema.Number,
  capturedAt: Schema.NonEmptyString,
});

export type OpenmeterUsageEvent = Schema.Schema.Type<
  typeof OpenmeterUsageEventSchema
>;

const decodeOpenmeterUsageEvent = Schema.decodeUnknown(
  OpenmeterUsageEventSchema,
);

const OpenmeterHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.openmeter,
);

const decodeOpenmeterHealthcheck = Schema.decodeUnknown(
  OpenmeterHealthcheckSchema,
);

export type OpenmeterHealthcheck = Schema.Schema.Type<
  typeof OpenmeterHealthcheckSchema
>;

type OpenmeterAdapterOperation = "healthcheck" | "ingestUsage";

export class OpenmeterAdapterRequestError extends Error {
  readonly _tag = "OpenmeterAdapterRequestError";

  constructor(
    readonly operation: OpenmeterAdapterOperation,
    readonly endpoint: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(
      `OpenMeter ${operation} failed with status ${status} for ${endpoint}.`,
    );
    this.name = "OpenmeterAdapterRequestError";
  }
}

export class OpenmeterAdapterTransportError extends Error {
  readonly _tag = "OpenmeterAdapterTransportError";

  constructor(
    readonly operation: OpenmeterAdapterOperation,
    readonly endpoint: string,
    readonly transportCause: unknown,
  ) {
    super(`OpenMeter ${operation} transport failed for ${endpoint}.`);
    this.name = "OpenmeterAdapterTransportError";
  }
}

export type OpenmeterAdapterError =
  | ParseResult.ParseError
  | OpenmeterAdapterRequestError
  | OpenmeterAdapterTransportError;

const openmeterIngestEndpointPaths = [
  "/api/v1/ingest",
  "/api/v1/events",
] as const;

const buildOpenmeterEndpoint = (url: string, pathname: string) =>
  new URL(pathname, url).toString();

const buildOpenmeterHeaders = (apiKey: string) => ({
  Accept: "application/json",
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/cloudevents+json",
});

const buildOpenmeterUsageEventPayload = (input: OpenmeterUsageEvent) => ({
  specversion: "1.0",
  type: input.eventName,
  id: crypto.randomUUID(),
  time: input.capturedAt,
  source: "comvestec-platform",
  subject: input.subject,
  data: {
    eventName: input.eventName,
    quantity: input.quantity,
  },
});

const createOpenmeterHealthcheck = (input: {
  readonly url: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<OpenmeterHealthcheck, OpenmeterAdapterError> => {
  const endpoint = buildOpenmeterEndpoint(input.url, "/api/v1/debug/metrics");

  return Effect.tryPromise({
    try: () =>
      input.fetchImplementation(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${input.apiKey}`,
        },
      }),
    catch: (cause) =>
      new OpenmeterAdapterTransportError("healthcheck", endpoint, cause),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.openmeter,
          })
        : Effect.tryPromise({
            try: async () => {
              throw new OpenmeterAdapterRequestError(
                "healthcheck",
                endpoint,
                response.status,
                await response.text(),
              );
            },
            catch: (cause) =>
              cause instanceof OpenmeterAdapterRequestError
                ? cause
                : new OpenmeterAdapterTransportError(
                    "healthcheck",
                    endpoint,
                    cause,
                  ),
          }),
    ),
    Effect.flatMap(decodeOpenmeterHealthcheck),
  );
};

const createOpenmeterIngestRequest = (input: {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly usageEvent: OpenmeterUsageEvent;
  readonly fetchImplementation: typeof fetch;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await input.fetchImplementation(input.endpoint, {
        method: "POST",
        headers: buildOpenmeterHeaders(input.apiKey),
        body: JSON.stringify(buildOpenmeterUsageEventPayload(input.usageEvent)),
      });

      if (!response.ok) {
        throw new OpenmeterAdapterRequestError(
          "ingestUsage",
          input.endpoint,
          response.status,
          await response.text(),
        );
      }

      return input.usageEvent;
    },
    catch: (cause) => {
      if (cause instanceof OpenmeterAdapterRequestError) {
        return cause;
      }

      return new OpenmeterAdapterTransportError(
        "ingestUsage",
        input.endpoint,
        cause,
      );
    },
  });

const createOpenmeterIngestUsage = (input: {
  readonly url: string;
  readonly apiKey: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const primaryEndpoint = buildOpenmeterEndpoint(
    input.url,
    openmeterIngestEndpointPaths[0],
  );
  const compatibilityEndpoint = buildOpenmeterEndpoint(
    input.url,
    openmeterIngestEndpointPaths[1],
  );

  return (usageInput: OpenmeterUsageEvent) =>
    decodeOpenmeterUsageEvent(usageInput).pipe(
      Effect.flatMap((usageEvent) =>
        createOpenmeterIngestRequest({
          endpoint: primaryEndpoint,
          apiKey: input.apiKey,
          usageEvent,
          fetchImplementation: input.fetchImplementation,
        }).pipe(
          Effect.catchAll((error) =>
            error instanceof OpenmeterAdapterRequestError &&
            (error.status === 404 || error.status === 405)
              ? createOpenmeterIngestRequest({
                  endpoint: compatibilityEndpoint,
                  apiKey: input.apiKey,
                  usageEvent,
                  fetchImplementation: input.fetchImplementation,
                })
              : Effect.fail(error),
          ),
        ),
      ),
    );
};

export type OpenmeterAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.openmeter;
  readonly url: string;
  readonly healthcheck: Effect.Effect<
    OpenmeterHealthcheck,
    OpenmeterAdapterError
  >;
  readonly ingestUsage: (
    input: OpenmeterUsageEvent,
  ) => Effect.Effect<OpenmeterUsageEvent, OpenmeterAdapterError>;
};

export class OpenmeterAdapter extends Context.Tag("OpenmeterAdapter")<
  OpenmeterAdapter,
  OpenmeterAdapterService
>() {}

export const makeOpenmeterAdapter = (input: OpenmeterAdapterRuntimeOptions) =>
  Schema.decodeUnknown(OpenmeterAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): OpenmeterAdapterService => ({
        serviceName: platformAdapterServiceName.openmeter,
        url: options.url,
        healthcheck: createOpenmeterHealthcheck({
          url: options.url,
          apiKey: options.apiKey,
          fetchImplementation: input.fetch ?? fetch,
        }),
        ingestUsage: createOpenmeterIngestUsage({
          url: options.url,
          apiKey: options.apiKey,
          fetchImplementation: input.fetch ?? fetch,
        }),
      }),
    ),
  );

export const makeOpenmeterAdapterLayer = (options: OpenmeterAdapterOptions) =>
  Layer.effect(OpenmeterAdapter, makeOpenmeterAdapter(options));
