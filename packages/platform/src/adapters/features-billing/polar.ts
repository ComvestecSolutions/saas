import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const PolarAdapterOptionsSchema = Schema.Struct({
  apiKey: Schema.NonEmptyString,
  apiUrl: Schema.NonEmptyString,
});

const PolarHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.polar,
);

export type PolarHealthcheck = Schema.Schema.Type<
  typeof PolarHealthcheckSchema
>;

export type PolarAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.polar;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<PolarHealthcheck>;
};

export class PolarAdapter extends Context.Tag("PolarAdapter")<
  PolarAdapter,
  PolarAdapterService
>() {}

export const makePolarAdapter = (input: unknown) =>
  Schema.decodeUnknown(PolarAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): PolarAdapterService => ({
        serviceName: platformAdapterServiceName.polar,
        apiUrl: options.apiUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.polar,
        }),
      }),
    ),
  );

export const makePolarAdapterLayer = (options: unknown) =>
  Layer.effect(PolarAdapter, makePolarAdapter(options));
