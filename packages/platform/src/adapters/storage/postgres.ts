import { drizzle } from "drizzle-orm/postgres-js";
import { Context, Effect, Layer, Schema } from "effect";
import postgres from "postgres";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const PostgresAdapterOptionsSchema = Schema.Struct({
  connectionString: Schema.NonEmptyString,
  connectionTimeoutMs: Schema.optional(Schema.Number),
  maxConnections: Schema.optional(Schema.Number),
});

export type PostgresAdapterOptions = Schema.Schema.Type<
  typeof PostgresAdapterOptionsSchema
>;

const PostgresAdapterEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
});

const PostgresHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.postgres,
);

export type PostgresHealthcheck = Schema.Schema.Type<
  typeof PostgresHealthcheckSchema
>;

export type PostgresRuntimeSqlClient = ReturnType<typeof postgres>;

export type PostgresRuntimeDatabase = ReturnType<typeof drizzle>;

export type PostgresAdapterConnectionError = {
  readonly _tag: "PostgresAdapterConnectionError";
  readonly operation: "healthcheck" | "close";
  readonly cause: unknown;
};

export type PostgresAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.postgres;
  readonly connectionStringName: "POSTGRES_URL";
  readonly connectionString: string;
  readonly sqlClient: PostgresRuntimeSqlClient;
  readonly database: PostgresRuntimeDatabase;
  readonly healthcheck: Effect.Effect<
    PostgresHealthcheck,
    PostgresAdapterConnectionError
  >;
  readonly close: Effect.Effect<void, PostgresAdapterConnectionError>;
};

export class PostgresAdapter extends Context.Tag("PostgresAdapter")<
  PostgresAdapter,
  PostgresAdapterService
>() {}

const decodePostgresAdapterEnvironment = Schema.decodeUnknown(
  PostgresAdapterEnvironmentSchema,
);

export const makePostgresAdapter = (input: PostgresAdapterOptions) =>
  Schema.decodeUnknown(PostgresAdapterOptionsSchema)(input).pipe(
    Effect.map((options): PostgresAdapterService => {
      const sqlClient = postgres(options.connectionString, {
        max: options.maxConnections ?? 10,
        prepare: false,
      });
      const database = drizzle(sqlClient);

      return {
        serviceName: platformAdapterServiceName.postgres,
        connectionStringName: "POSTGRES_URL",
        connectionString: options.connectionString,
        sqlClient,
        database,
        healthcheck: Effect.tryPromise({
          try: async () => {
            await sqlClient`select 1`;

            return {
              healthy: true,
              service: platformAdapterServiceName.postgres,
            } satisfies PostgresHealthcheck;
          },
          catch: (cause) =>
            ({
              _tag: "PostgresAdapterConnectionError",
              operation: "healthcheck",
              cause,
            }) satisfies PostgresAdapterConnectionError,
        }),
        close: Effect.tryPromise({
          try: async () => {
            await sqlClient.end({ timeout: options.connectionTimeoutMs ?? 5 });
          },
          catch: (cause) =>
            ({
              _tag: "PostgresAdapterConnectionError",
              operation: "close",
              cause,
            }) satisfies PostgresAdapterConnectionError,
        }),
      };
    }),
  );

export const makePostgresAdapterLayer = (options: PostgresAdapterOptions) =>
  Layer.effect(PostgresAdapter, makePostgresAdapter(options));

export const makePostgresAdapterFromEnvironment = (environment: unknown) =>
  decodePostgresAdapterEnvironment(environment).pipe(
    Effect.flatMap((resolvedEnvironment) =>
      makePostgresAdapter({
        connectionString: resolvedEnvironment.POSTGRES_URL,
      }),
    ),
  );

export const makePostgresAdapterLayerFromEnvironment = (environment: unknown) =>
  Layer.effect(
    PostgresAdapter,
    makePostgresAdapterFromEnvironment(environment),
  );
