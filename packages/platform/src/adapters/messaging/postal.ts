import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const PostalAdapterOptionsSchema = Schema.Struct({
  apiUrl: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

const PostalHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.postal,
);

export type PostalHealthcheck = Schema.Schema.Type<
  typeof PostalHealthcheckSchema
>;

export type PostalAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.postal;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<PostalHealthcheck>;
};

export class PostalAdapter extends Context.Tag("PostalAdapter")<
  PostalAdapter,
  PostalAdapterService
>() {}

export const makePostalAdapter = (input: unknown) =>
  Schema.decodeUnknown(PostalAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): PostalAdapterService => ({
        serviceName: platformAdapterServiceName.postal,
        apiUrl: options.apiUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.postal,
        }),
      }),
    ),
  );

export const makePostalAdapterLayer = (options: unknown) =>
  Layer.effect(PostalAdapter, makePostalAdapter(options));
