import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const GlitchtipAdapterOptionsSchema = Schema.Struct({
  dsn: Schema.NonEmptyString,
});

const GlitchtipHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.glitchtip,
);

export type GlitchtipHealthcheck = Schema.Schema.Type<
  typeof GlitchtipHealthcheckSchema
>;

export type GlitchtipAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.glitchtip;
  readonly dsn: string;
  readonly healthcheck: Effect.Effect<GlitchtipHealthcheck>;
};

export class GlitchtipAdapter extends Context.Tag("GlitchtipAdapter")<
  GlitchtipAdapter,
  GlitchtipAdapterService
>() {}

export const makeGlitchtipAdapter = (input: unknown) =>
  Schema.decodeUnknown(GlitchtipAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): GlitchtipAdapterService => ({
        serviceName: platformAdapterServiceName.glitchtip,
        dsn: options.dsn,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.glitchtip,
        }),
      }),
    ),
  );

export const makeGlitchtipAdapterLayer = (options: unknown) =>
  Layer.effect(GlitchtipAdapter, makeGlitchtipAdapter(options));
