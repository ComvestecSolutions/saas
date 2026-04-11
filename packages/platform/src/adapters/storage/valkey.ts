import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ValkeyAdapterOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  maxCacheSize: Schema.optional(Schema.Number),
});

const ValkeyCounterInputSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  incrementBy: Schema.Number,
});

export const ValkeyCounterSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  value: Schema.Number,
});

export type ValkeyCounter = Schema.Schema.Type<typeof ValkeyCounterSchema>;

const ValkeyHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.valkey,
);

export type ValkeyHealthcheck = Schema.Schema.Type<
  typeof ValkeyHealthcheckSchema
>;

export type ValkeyAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.valkey;
  readonly url: string;
  readonly healthcheck: Effect.Effect<ValkeyHealthcheck>;
  readonly incrementCounter: (
    input: unknown,
  ) => Effect.Effect<ValkeyCounter, ParseResult.ParseError>;
};

export class ValkeyAdapter extends Context.Tag("ValkeyAdapter")<
  ValkeyAdapter,
  ValkeyAdapterService
>() {}

export const makeValkeyAdapter = (input: unknown) =>
  Schema.decodeUnknown(ValkeyAdapterOptionsSchema)(input).pipe(
    Effect.map((options): ValkeyAdapterService => {
      const counters = new Map<string, number>();
      const maxCacheSize = Math.max(
        1,
        Math.floor(options.maxCacheSize ?? 1000),
      );

      const evictOldestCounter = () => {
        const oldest = counters.keys().next().value;
        if (oldest !== undefined) {
          counters.delete(oldest);
        }
      };

      return {
        serviceName: platformAdapterServiceName.valkey,
        url: options.url,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.valkey,
        }),
        incrementCounter: (counterInput: unknown) =>
          Schema.decodeUnknown(ValkeyCounterInputSchema)(counterInput).pipe(
            Effect.flatMap((decodedInput) => {
              const nextValue =
                (counters.get(decodedInput.key) ?? 0) +
                decodedInput.incrementBy;
              counters.set(decodedInput.key, nextValue);

              if (counters.size > maxCacheSize) {
                evictOldestCounter();
              }

              return Schema.decodeUnknown(ValkeyCounterSchema)({
                key: decodedInput.key,
                value: nextValue,
              });
            }),
          ),
      };
    }),
  );

export const makeValkeyAdapterLayer = (options: unknown) =>
  Layer.effect(ValkeyAdapter, makeValkeyAdapter(options));
