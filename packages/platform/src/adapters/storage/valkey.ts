import { createClient } from "redis";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { RequestContextSchema } from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ValkeyAdapterRuntimeOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  maxCacheSize: Schema.optional(Schema.Number),
  sessionTtlSeconds: Schema.optional(Schema.Number),
});

type ValkeyAdapterRuntimeOptions = Schema.Schema.Type<
  typeof ValkeyAdapterRuntimeOptionsSchema
>;

export type ValkeyRedisClient = {
  readonly isOpen: boolean;
  connect: () => Promise<void>;
  quit: () => Promise<void>;
  ping: () => Promise<string>;
  incrByFloat: (key: string, increment: number) => Promise<string>;
  set: (
    key: string,
    value: string,
    options?: { readonly EX?: number },
  ) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
};

export type ValkeyAdapterOptions = ValkeyAdapterRuntimeOptions & {
  readonly client?: ValkeyRedisClient;
};

const ValkeyCounterInputSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  incrementBy: Schema.Number,
});

export type ValkeyCounterInput = Schema.Schema.Type<
  typeof ValkeyCounterInputSchema
>;

const ValkeySessionWriteInputSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  requestContext: RequestContextSchema,
});

export type ValkeySessionWriteInput = Schema.Schema.Type<
  typeof ValkeySessionWriteInputSchema
>;

const ValkeySessionLookupInputSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type ValkeySessionLookupInput = Schema.Schema.Type<
  typeof ValkeySessionLookupInputSchema
>;

export const ValkeyCounterSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  value: Schema.Number,
});

export type ValkeyCounter = Schema.Schema.Type<typeof ValkeyCounterSchema>;

export const ValkeySessionEntrySchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  requestContext: RequestContextSchema,
});

export type ValkeySessionEntry = Schema.Schema.Type<
  typeof ValkeySessionEntrySchema
>;

export type ValkeyAdapterOperationError = {
  readonly _tag: "ValkeyAdapterOperationError";
  readonly operation:
    | "connect"
    | "healthcheck"
    | "incrementCounter"
    | "writeSession"
    | "readSession"
    | "close";
  readonly cause: unknown;
};

export type ValkeyAdapterError =
  | ParseResult.ParseError
  | ValkeyAdapterOperationError;

const decodeValkeyCounter = Schema.decodeUnknown(ValkeyCounterSchema);

const decodeValkeySessionEntry = Schema.decodeUnknown(ValkeySessionEntrySchema);

const buildValkeyOperationError = (
  operation: ValkeyAdapterOperationError["operation"],
  cause: unknown,
): ValkeyAdapterOperationError => ({
  _tag: "ValkeyAdapterOperationError",
  operation,
  cause,
});

const ValkeyHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.valkey,
);

export type ValkeyHealthcheck = Schema.Schema.Type<
  typeof ValkeyHealthcheckSchema
>;

export type ValkeyAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.valkey;
  readonly url: string;
  readonly healthcheck: Effect.Effect<
    ValkeyHealthcheck,
    ParseResult.ParseError | ValkeyAdapterOperationError
  >;
  readonly incrementCounter: (
    input: ValkeyCounterInput,
  ) => Effect.Effect<ValkeyCounter, ValkeyAdapterError>;
  readonly writeSession: (
    input: ValkeySessionWriteInput,
  ) => Effect.Effect<ValkeySessionEntry, ValkeyAdapterError>;
  readonly readSession: (
    input: ValkeySessionLookupInput,
  ) => Effect.Effect<ValkeySessionEntry | undefined, ValkeyAdapterError>;
  readonly close: Effect.Effect<void, ValkeyAdapterOperationError>;
};

export class ValkeyAdapter extends Context.Tag("ValkeyAdapter")<
  ValkeyAdapter,
  ValkeyAdapterService
>() {}

export const makeValkeyAdapter = (input: ValkeyAdapterOptions) =>
  Schema.decodeUnknown(ValkeyAdapterRuntimeOptionsSchema)(input).pipe(
    Effect.map((options): ValkeyAdapterService => {
      const client =
        input.client ??
        createClient({
          url: options.url,
        });
      const counterKeyPrefix = "comvestec:counter:";
      const sessionKeyPrefix = "comvestec:session:";
      let connectionPromise: Promise<void> | undefined;

      const ensureConnected = (
        operation: ValkeyAdapterOperationError["operation"],
      ) =>
        Effect.tryPromise({
          try: async () => {
            if (client.isOpen) {
              return;
            }

            if (connectionPromise === undefined) {
              connectionPromise = client
                .connect()
                .then(() => undefined)
                .catch((cause) => {
                  connectionPromise = undefined;
                  throw cause;
                });
            }

            await connectionPromise;
          },
          catch: (cause) => buildValkeyOperationError(operation, cause),
        });

      const toCounterKey = (key: string) => `${counterKeyPrefix}${key}`;

      const toSessionKey = (sessionId: string) =>
        `${sessionKeyPrefix}${sessionId}`;

      const sessionTtlSeconds = Math.max(
        1,
        Math.floor(options.sessionTtlSeconds ?? 86_400),
      );

      return {
        serviceName: platformAdapterServiceName.valkey,
        url: options.url,
        healthcheck: ensureConnected("healthcheck").pipe(
          Effect.flatMap(() =>
            Effect.tryPromise({
              try: () => client.ping(),
              catch: (cause) => buildValkeyOperationError("healthcheck", cause),
            }),
          ),
          Effect.flatMap(() =>
            Schema.decodeUnknown(ValkeyHealthcheckSchema)({
              healthy: true,
              service: platformAdapterServiceName.valkey,
            }),
          ),
        ),
        incrementCounter: (counterInput: ValkeyCounterInput) =>
          Schema.decodeUnknown(ValkeyCounterInputSchema)(counterInput).pipe(
            Effect.flatMap((decodedInput) =>
              ensureConnected("incrementCounter").pipe(
                Effect.flatMap(() =>
                  Effect.tryPromise({
                    try: () =>
                      client.incrByFloat(
                        toCounterKey(decodedInput.key),
                        decodedInput.incrementBy,
                      ),
                    catch: (cause) =>
                      buildValkeyOperationError("incrementCounter", cause),
                  }),
                ),
                Effect.flatMap((nextValue) =>
                  decodeValkeyCounter({
                    key: decodedInput.key,
                    value: Number(nextValue),
                  }),
                ),
              ),
            ),
          ),
        writeSession: (sessionInput: ValkeySessionWriteInput) =>
          Schema.decodeUnknown(ValkeySessionWriteInputSchema)(
            sessionInput,
          ).pipe(
            Effect.flatMap((decodedInput) =>
              ensureConnected("writeSession").pipe(
                Effect.flatMap(() =>
                  Effect.tryPromise({
                    try: () =>
                      client.set(
                        toSessionKey(decodedInput.sessionId),
                        JSON.stringify(decodedInput),
                        { EX: sessionTtlSeconds },
                      ),
                    catch: (cause) =>
                      buildValkeyOperationError("writeSession", cause),
                  }),
                ),
                Effect.flatMap(() => decodeValkeySessionEntry(decodedInput)),
              ),
            ),
          ),
        readSession: (sessionInput: ValkeySessionLookupInput) =>
          Schema.decodeUnknown(ValkeySessionLookupInputSchema)(
            sessionInput,
          ).pipe(
            Effect.flatMap((decodedInput) =>
              ensureConnected("readSession").pipe(
                Effect.flatMap(() =>
                  Effect.tryPromise({
                    try: () => client.get(toSessionKey(decodedInput.sessionId)),
                    catch: (cause) =>
                      buildValkeyOperationError("readSession", cause),
                  }),
                ),
                Effect.flatMap((serializedSession) => {
                  if (serializedSession === null) {
                    return Effect.succeed(undefined);
                  }

                  return Effect.try({
                    try: () => JSON.parse(serializedSession),
                    catch: (cause) =>
                      buildValkeyOperationError("readSession", cause),
                  }).pipe(Effect.flatMap(decodeValkeySessionEntry));
                }),
              ),
            ),
          ),
        close: Effect.tryPromise({
          try: async () => {
            if (client.isOpen) {
              await client.quit();
            }
          },
          catch: (cause) => buildValkeyOperationError("close", cause),
        }),
      };
    }),
  );

export const makeValkeyAdapterLayer = (options: ValkeyAdapterOptions) =>
  Layer.effect(ValkeyAdapter, makeValkeyAdapter(options));
