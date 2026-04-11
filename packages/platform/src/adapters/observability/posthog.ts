import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const PosthogAdapterOptionsSchema = Schema.Struct({
  apiKey: Schema.NonEmptyString,
  host: Schema.NonEmptyString,
});

const PosthogHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.posthog,
);

export type PosthogHealthcheck = Schema.Schema.Type<
  typeof PosthogHealthcheckSchema
>;

export type PosthogAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.posthog;
  readonly host: string;
  readonly healthcheck: Effect.Effect<PosthogHealthcheck>;
};

export class PosthogAdapter extends Context.Tag("PosthogAdapter")<
  PosthogAdapter,
  PosthogAdapterService
>() {}

export const makePosthogAdapter = (input: unknown) =>
  Schema.decodeUnknown(PosthogAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): PosthogAdapterService => ({
        serviceName: platformAdapterServiceName.posthog,
        host: options.host,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.posthog,
        }),
      }),
    ),
  );

export const makePosthogAdapterLayer = (options: unknown) =>
  Layer.effect(PosthogAdapter, makePosthogAdapter(options));
