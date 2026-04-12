import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const PostgresHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.postgres,
);

export type PostgresHealthcheck = Schema.Schema.Type<
  typeof PostgresHealthcheckSchema
>;

export type PostgresAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.postgres;
  readonly connectionStringName: "POSTGRES_URL";
  readonly healthcheck: Effect.Effect<PostgresHealthcheck>;
};

export class PostgresAdapter extends Context.Tag("PostgresAdapter")<
  PostgresAdapter,
  PostgresAdapterService
>() {}

export const makePostgresAdapter = () =>
  Effect.succeed<PostgresAdapterService>({
    serviceName: platformAdapterServiceName.postgres,
    connectionStringName: "POSTGRES_URL",
    healthcheck: Effect.succeed({
      healthy: true,
      service: platformAdapterServiceName.postgres,
    }),
  });

export const PostgresAdapterLive = Layer.effect(
  PostgresAdapter,
  makePostgresAdapter(),
);
