import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const NovuAdapterOptionsSchema = Schema.Struct({
  apiKey: Schema.NonEmptyString,
  apiUrl: Schema.NonEmptyString,
});

const NovuHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.novu,
);

export type NovuHealthcheck = Schema.Schema.Type<typeof NovuHealthcheckSchema>;

export type NovuAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.novu;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<NovuHealthcheck>;
};

export class NovuAdapter extends Context.Tag("NovuAdapter")<
  NovuAdapter,
  NovuAdapterService
>() {}

export const makeNovuAdapter = (input: unknown) =>
  Schema.decodeUnknown(NovuAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): NovuAdapterService => ({
        serviceName: platformAdapterServiceName.novu,
        apiUrl: options.apiUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.novu,
        }),
      }),
    ),
  );

export const makeNovuAdapterLayer = (options: unknown) =>
  Layer.effect(NovuAdapter, makeNovuAdapter(options));
