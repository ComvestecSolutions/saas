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

export const OpenmeterUsageEventSchema = Schema.Struct({
  subject: Schema.NonEmptyString,
  eventName: Schema.NonEmptyString,
  quantity: Schema.Number,
  capturedAt: Schema.NonEmptyString,
});

export type OpenmeterUsageEvent = Schema.Schema.Type<
  typeof OpenmeterUsageEventSchema
>;

const OpenmeterHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.openmeter,
);

export type OpenmeterHealthcheck = Schema.Schema.Type<
  typeof OpenmeterHealthcheckSchema
>;

export type OpenmeterAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.openmeter;
  readonly url: string;
  readonly healthcheck: Effect.Effect<OpenmeterHealthcheck>;
  readonly ingestUsage: (
    input: OpenmeterUsageEvent,
  ) => Effect.Effect<OpenmeterUsageEvent, ParseResult.ParseError>;
};

export class OpenmeterAdapter extends Context.Tag("OpenmeterAdapter")<
  OpenmeterAdapter,
  OpenmeterAdapterService
>() {}

export const makeOpenmeterAdapter = (input: OpenmeterAdapterOptions) =>
  Schema.decodeUnknown(OpenmeterAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): OpenmeterAdapterService => ({
        serviceName: platformAdapterServiceName.openmeter,
        url: options.url,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.openmeter,
        }),
        ingestUsage: (usageInput: OpenmeterUsageEvent) =>
          Schema.decodeUnknown(OpenmeterUsageEventSchema)(usageInput),
      }),
    ),
  );

export const makeOpenmeterAdapterLayer = (options: OpenmeterAdapterOptions) =>
  Layer.effect(OpenmeterAdapter, makeOpenmeterAdapter(options));
