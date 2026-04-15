import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const MeilisearchAdapterOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

export type MeilisearchAdapterOptions = Schema.Schema.Type<
  typeof MeilisearchAdapterOptionsSchema
>;

const MeilisearchHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.meilisearch,
);

export type MeilisearchHealthcheck = Schema.Schema.Type<
  typeof MeilisearchHealthcheckSchema
>;

export type MeilisearchAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.meilisearch;
  readonly url: string;
  readonly healthcheck: Effect.Effect<MeilisearchHealthcheck>;
};

export class MeilisearchAdapter extends Context.Tag("MeilisearchAdapter")<
  MeilisearchAdapter,
  MeilisearchAdapterService
>() {}

export const makeMeilisearchAdapter = (input: MeilisearchAdapterOptions) =>
  Schema.decodeUnknown(MeilisearchAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): MeilisearchAdapterService => ({
        serviceName: platformAdapterServiceName.meilisearch,
        url: options.url,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.meilisearch,
        }),
      }),
    ),
  );

export const makeMeilisearchAdapterLayer = (
  options: MeilisearchAdapterOptions,
) => Layer.effect(MeilisearchAdapter, makeMeilisearchAdapter(options));
