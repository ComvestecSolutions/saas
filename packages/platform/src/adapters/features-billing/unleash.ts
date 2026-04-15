import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const UnleashAdapterOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

export type UnleashAdapterOptions = Schema.Schema.Type<
  typeof UnleashAdapterOptionsSchema
>;

const UnleashHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.unleash,
);

export type UnleashHealthcheck = Schema.Schema.Type<
  typeof UnleashHealthcheckSchema
>;

export type UnleashAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.unleash;
  readonly url: string;
  readonly healthcheck: Effect.Effect<UnleashHealthcheck>;
};

export class UnleashAdapter extends Context.Tag("UnleashAdapter")<
  UnleashAdapter,
  UnleashAdapterService
>() {}

export const makeUnleashAdapter = (input: UnleashAdapterOptions) =>
  Schema.decodeUnknown(UnleashAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): UnleashAdapterService => ({
        serviceName: platformAdapterServiceName.unleash,
        url: options.url,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.unleash,
        }),
      }),
    ),
  );

export const makeUnleashAdapterLayer = (options: UnleashAdapterOptions) =>
  Layer.effect(UnleashAdapter, makeUnleashAdapter(options));
