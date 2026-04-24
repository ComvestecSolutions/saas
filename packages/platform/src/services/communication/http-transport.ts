import { Effect, ParseResult } from "effect";

export type TaggedError<Tag extends string = string> = {
  readonly _tag: Tag;
};

export const isTaggedError = (error: unknown): error is TaggedError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof (error as { readonly _tag?: unknown })._tag === "string";

export const createJsonResponse = (
  body: unknown,
  status = 200,
  headers?: HeadersInit,
) =>
  Response.json(body, {
    status,
    ...(headers !== undefined ? { headers } : {}),
  });

export const createMethodNotAllowedResponse = (
  allowedMethods: readonly string[],
) =>
  createJsonResponse({ error: "Method not allowed." }, 405, {
    Allow: allowedMethods.join(", "),
  });

export const createNotFoundResponse = (message: string) =>
  createJsonResponse({ error: message }, 404);

export const readOptionalSearchParam = (url: URL, key: string) => {
  const value = url.searchParams.get(key);

  return value === null ? undefined : value;
};

export const parseRequestJson = <InvalidJsonTag extends string>(
  request: Request,
  invalidJsonTag: InvalidJsonTag,
): Effect.Effect<unknown, TaggedError<InvalidJsonTag>> =>
  Effect.tryPromise({
    try: () => request.json(),
    catch: (): TaggedError<InvalidJsonTag> => ({
      _tag: invalidJsonTag,
    }),
  });

export const readRequestJson = <
  A,
  R = never,
  InvalidJsonTag extends string = string,
>(input: {
  readonly request: Request;
  readonly invalidJsonTag: InvalidJsonTag;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}): Effect.Effect<A, TaggedError<InvalidJsonTag> | ParseResult.ParseError, R> =>
  parseRequestJson(input.request, input.invalidJsonTag).pipe(
    Effect.flatMap((payload) => input.decode(payload)),
  );

export const readRequestQuery = <A, R = never>(input: {
  readonly url: URL;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}): Effect.Effect<A, ParseResult.ParseError, R> =>
  input.decode(Object.fromEntries(input.url.searchParams.entries()));

export const matchHttpEffect = <A, E>(input: {
  readonly effect: Effect.Effect<A, E>;
  readonly onSuccess: (value: A) => Response;
  readonly onFailure: (error: E) => Response;
}) =>
  input.effect.pipe(
    Effect.match({
      onFailure: input.onFailure,
      onSuccess: input.onSuccess,
    }),
  );
