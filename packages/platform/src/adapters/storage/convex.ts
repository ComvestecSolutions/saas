import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ConvexAdapterOptionsSchema = Schema.Struct({
  deploymentUrl: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
});

export type ConvexAdapterOptions = Schema.Schema.Type<
  typeof ConvexAdapterOptionsSchema
>;

const ConvexHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.convex,
);

export type ConvexHealthcheck = Schema.Schema.Type<
  typeof ConvexHealthcheckSchema
>;

export type ConvexAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.convex;
  readonly deploymentUrl: string;
  readonly siteUrl: string;
  readonly healthcheck: Effect.Effect<ConvexHealthcheck>;
};

export class ConvexAdapter extends Context.Tag("ConvexAdapter")<
  ConvexAdapter,
  ConvexAdapterService
>() {}

export const makeConvexAdapter = (input: ConvexAdapterOptions) =>
  Schema.decodeUnknown(ConvexAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): ConvexAdapterService => ({
        serviceName: platformAdapterServiceName.convex,
        deploymentUrl: options.deploymentUrl,
        siteUrl: options.siteUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.convex,
        }),
      }),
    ),
  );

export const makeConvexAdapterLayer = (options: ConvexAdapterOptions) =>
  Layer.effect(ConvexAdapter, makeConvexAdapter(options));
