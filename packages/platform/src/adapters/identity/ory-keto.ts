import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const OryKetoAdapterOptionsSchema = Schema.Struct({
  readUrl: Schema.NonEmptyString,
  writeUrl: Schema.NonEmptyString,
  maxCacheSize: Schema.optional(Schema.Number),
});

export const OryKetoTupleSchema = Schema.Struct({
  namespace: Schema.NonEmptyString,
  object: Schema.NonEmptyString,
  relation: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
});

export type OryKetoTuple = Schema.Schema.Type<typeof OryKetoTupleSchema>;

const OryKetoCheckInputSchema = Schema.Struct({
  namespace: Schema.NonEmptyString,
  object: Schema.NonEmptyString,
  relation: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
});

export const OryKetoCheckResultSchema = Schema.Struct({
  allowed: Schema.Boolean,
  namespace: Schema.NonEmptyString,
  object: Schema.NonEmptyString,
  relation: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
});

export type OryKetoCheckResult = Schema.Schema.Type<
  typeof OryKetoCheckResultSchema
>;

const OryKetoHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.oryKeto,
);

export type OryKetoHealthcheck = Schema.Schema.Type<
  typeof OryKetoHealthcheckSchema
>;

export type OryKetoAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.oryKeto;
  readonly readUrl: string;
  readonly writeUrl: string;
  readonly healthcheck: Effect.Effect<OryKetoHealthcheck>;
  readonly writeTuple: (
    input: unknown,
  ) => Effect.Effect<OryKetoTuple, ParseResult.ParseError>;
  readonly check: (
    input: unknown,
  ) => Effect.Effect<OryKetoCheckResult, ParseResult.ParseError>;
};

export class OryKetoAdapter extends Context.Tag("OryKetoAdapter")<
  OryKetoAdapter,
  OryKetoAdapterService
>() {}

export const makeOryKetoAdapter = (input: unknown) =>
  Schema.decodeUnknown(OryKetoAdapterOptionsSchema)(input).pipe(
    Effect.map((options): OryKetoAdapterService => {
      const tuples: OryKetoTuple[] = [];
      const maxCacheSize = Math.max(
        1,
        Math.floor(options.maxCacheSize ?? 1000),
      );

      return {
        serviceName: platformAdapterServiceName.oryKeto,
        readUrl: options.readUrl,
        writeUrl: options.writeUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.oryKeto,
        }),
        writeTuple: (tupleInput: unknown) =>
          Schema.decodeUnknown(OryKetoTupleSchema)(tupleInput).pipe(
            Effect.tap((tuple) =>
              Effect.sync(() => {
                tuples.push(tuple);

                if (tuples.length > maxCacheSize) {
                  tuples.shift();
                }
              }),
            ),
          ),
        check: (checkInput: unknown) =>
          Schema.decodeUnknown(OryKetoCheckInputSchema)(checkInput).pipe(
            Effect.flatMap((decodedInput) =>
              Schema.decodeUnknown(OryKetoCheckResultSchema)({
                ...decodedInput,
                allowed: tuples.some(
                  (tuple) =>
                    tuple.namespace === decodedInput.namespace &&
                    tuple.object === decodedInput.object &&
                    tuple.relation === decodedInput.relation &&
                    tuple.subject === decodedInput.subject,
                ),
              }),
            ),
          ),
      };
    }),
  );

export const makeOryKetoAdapterLayer = (options: unknown) =>
  Layer.effect(OryKetoAdapter, makeOryKetoAdapter(options));
