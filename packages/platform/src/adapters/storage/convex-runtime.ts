import { Effect, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ConvexRuntimeHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.convex,
);

const decodeConvexRuntimeHealthcheck = Schema.decodeUnknown(
  ConvexRuntimeHealthcheckSchema,
);

const convexRuntimeReadyBody = Schema.validateSync(Schema.NonEmptyString)(
  "This Convex deployment is running" satisfies Schema.Schema.Type<
    typeof Schema.NonEmptyString
  >,
);

export class ConvexRuntimeHealthcheckRequestError extends Error {
  readonly _tag = "ConvexRuntimeHealthcheckRequestError";

  constructor(
    readonly endpoint: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(`Convex healthcheck failed with status ${status} for ${endpoint}.`);
    this.name = "ConvexRuntimeHealthcheckRequestError";
  }
}

export class ConvexRuntimeHealthcheckTransportError extends Error {
  readonly _tag = "ConvexRuntimeHealthcheckTransportError";

  constructor(
    readonly endpoint: string,
    readonly transportCause: unknown,
  ) {
    super(`Convex healthcheck transport failed for ${endpoint}.`);
    this.name = "ConvexRuntimeHealthcheckTransportError";
  }
}

export type ConvexRuntimeHealthcheckError =
  | ParseResult.ParseError
  | ConvexRuntimeHealthcheckRequestError
  | ConvexRuntimeHealthcheckTransportError;

export const createConvexRuntimeHealthcheck = (input: {
  readonly deploymentUrl: string;
  readonly fetchImplementation: typeof fetch;
}) => {
  const endpoint = new URL("/", input.deploymentUrl).toString();

  return Effect.tryPromise({
    try: async () => {
      const response = await input.fetchImplementation(endpoint, {
        method: "GET",
        headers: {
          Accept: "text/plain",
        },
      });
      const body = await response.text();

      if (!response.ok || !body.includes(convexRuntimeReadyBody)) {
        throw new ConvexRuntimeHealthcheckRequestError(
          endpoint,
          response.status,
          body,
        );
      }

      return {
        healthy: true,
        service: platformAdapterServiceName.convex,
      } as const;
    },
    catch: (cause) =>
      cause instanceof ConvexRuntimeHealthcheckRequestError
        ? cause
        : new ConvexRuntimeHealthcheckTransportError(endpoint, cause),
  }).pipe(Effect.flatMap(decodeConvexRuntimeHealthcheck));
};
