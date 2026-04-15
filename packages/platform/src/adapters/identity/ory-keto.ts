import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const OryKetoAdapterRuntimeOptionsSchema = Schema.Struct({
  readUrl: Schema.NonEmptyString,
  writeUrl: Schema.NonEmptyString,
});

type OryKetoAdapterRuntimeOptions = Schema.Schema.Type<
  typeof OryKetoAdapterRuntimeOptionsSchema
>;

export type OryKetoAdapterOptions = OryKetoAdapterRuntimeOptions & {
  readonly fetch?: typeof fetch;
};

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

export type OryKetoCheckInput = Schema.Schema.Type<
  typeof OryKetoCheckInputSchema
>;

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

const OryKetoPermissionCheckResponseSchema = Schema.Struct({
  allowed: Schema.Boolean,
});

export type OryKetoAdapterRequestError = {
  readonly _tag: "OryKetoAdapterRequestError";
  readonly operation: "healthcheck" | "writeTuple" | "check";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type OryKetoAdapterError =
  | ParseResult.ParseError
  | OryKetoAdapterRequestError;

type OryKetoRequestFailure = {
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

const isOryKetoRequestFailure = (
  cause: unknown,
): cause is OryKetoRequestFailure =>
  typeof cause === "object" && cause !== null && "cause" in cause;

const buildOryKetoRequestError = (
  operation: OryKetoAdapterRequestError["operation"],
  failure: OryKetoRequestFailure,
): OryKetoAdapterRequestError => ({
  _tag: "OryKetoAdapterRequestError",
  operation,
  cause: failure.cause,
  ...(failure.status !== undefined ? { status: failure.status } : {}),
  ...(failure.body !== undefined ? { body: failure.body } : {}),
});

const createOryKetoRequest = <A>(options: {
  readonly operation: OryKetoAdapterRequestError["operation"];
  readonly url: string;
  readonly init?: RequestInit;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError>;
  readonly fetchImplementation: typeof fetch;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await options.fetchImplementation(
        options.url,
        options.init,
      );
      const responseText = await response.text();

      if (!response.ok) {
        throw {
          cause: response.statusText,
          status: response.status,
          body: responseText,
        } satisfies OryKetoRequestFailure;
      }

      return responseText.length === 0 ? {} : JSON.parse(responseText);
    },
    catch: (cause) => {
      if (isOryKetoRequestFailure(cause)) {
        return buildOryKetoRequestError(options.operation, cause);
      }

      return buildOryKetoRequestError(options.operation, { cause });
    },
  }).pipe(Effect.flatMap(options.decode));

const OryKetoHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.oryKeto,
);

export type OryKetoHealthcheck = Schema.Schema.Type<
  typeof OryKetoHealthcheckSchema
>;

const decodeOryKetoHealthcheck = Schema.decodeUnknown(OryKetoHealthcheckSchema);

const decodeOryKetoPermissionCheckResponse = Schema.decodeUnknown(
  OryKetoPermissionCheckResponseSchema,
);

export type OryKetoAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.oryKeto;
  readonly readUrl: string;
  readonly writeUrl: string;
  readonly healthcheck: Effect.Effect<
    OryKetoHealthcheck,
    ParseResult.ParseError | OryKetoAdapterRequestError
  >;
  readonly writeTuple: (
    input: OryKetoTuple,
  ) => Effect.Effect<OryKetoTuple, OryKetoAdapterError>;
  readonly check: (
    input: OryKetoCheckInput,
  ) => Effect.Effect<OryKetoCheckResult, OryKetoAdapterError>;
};

export class OryKetoAdapter extends Context.Tag("OryKetoAdapter")<
  OryKetoAdapter,
  OryKetoAdapterService
>() {}

export const makeOryKetoAdapter = (input: OryKetoAdapterOptions) =>
  Schema.decodeUnknown(OryKetoAdapterRuntimeOptionsSchema)(input).pipe(
    Effect.map((options): OryKetoAdapterService => {
      const fetchImplementation = input.fetch ?? fetch;

      return {
        serviceName: platformAdapterServiceName.oryKeto,
        readUrl: options.readUrl,
        writeUrl: options.writeUrl,
        healthcheck: createOryKetoRequest({
          operation: "healthcheck",
          url: new URL("/health/ready", options.readUrl).toString(),
          decode: () =>
            decodeOryKetoHealthcheck({
              healthy: true,
              service: platformAdapterServiceName.oryKeto,
            }),
          fetchImplementation,
        }),
        writeTuple: (tupleInput: OryKetoTuple) =>
          Schema.decodeUnknown(OryKetoTupleSchema)(tupleInput).pipe(
            Effect.flatMap((decodedInput) =>
              createOryKetoRequest({
                operation: "writeTuple",
                url: new URL(
                  "/admin/relation-tuples",
                  options.writeUrl,
                ).toString(),
                init: {
                  method: "PUT",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    namespace: decodedInput.namespace,
                    object: decodedInput.object,
                    relation: decodedInput.relation,
                    subject_id: decodedInput.subject,
                  }),
                },
                decode: () =>
                  Schema.decodeUnknown(OryKetoTupleSchema)(decodedInput),
                fetchImplementation,
              }),
            ),
          ),
        check: (checkInput: OryKetoCheckInput) =>
          Schema.decodeUnknown(OryKetoCheckInputSchema)(checkInput).pipe(
            Effect.flatMap((decodedInput) => {
              const requestUrl = new URL(
                "/relation-tuples/check",
                options.readUrl,
              );

              requestUrl.searchParams.set("namespace", decodedInput.namespace);
              requestUrl.searchParams.set("object", decodedInput.object);
              requestUrl.searchParams.set("relation", decodedInput.relation);
              requestUrl.searchParams.set("subject_id", decodedInput.subject);

              return createOryKetoRequest({
                operation: "check",
                url: requestUrl.toString(),
                decode: decodeOryKetoPermissionCheckResponse,
                fetchImplementation,
              }).pipe(
                Effect.flatMap((response) =>
                  Schema.decodeUnknown(OryKetoCheckResultSchema)({
                    ...decodedInput,
                    allowed: response.allowed,
                  }),
                ),
              );
            }),
          ),
      };
    }),
  );

export const makeOryKetoAdapterLayer = (options: OryKetoAdapterOptions) =>
  Layer.effect(OryKetoAdapter, makeOryKetoAdapter(options));
