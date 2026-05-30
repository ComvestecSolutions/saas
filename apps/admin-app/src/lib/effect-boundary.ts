import { Either, Schema } from "effect";

export const EmptyInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({}),
);

const decodeEmptyInputSchema = Schema.decodeUnknownEither(EmptyInputSchema);

export const decodeSyncBoundary = <A, I>(
  schema: Schema.Schema<A, I, never>,
) => {
  const decodeEither = Schema.decodeUnknownEither(schema);

  return (input: unknown): A => {
    const decoded = decodeEither(input);

    if (Either.isLeft(decoded)) {
      throw decoded.left;
    }

    return decoded.right;
  };
};

export const decodeJsonOrUndefined = <A, I>(
  schema: Schema.Schema<A, I, never>,
) => {
  const decodeEither = Schema.decodeUnknownEither(Schema.parseJson(schema));

  return (input: string): A | undefined => {
    const decoded = decodeEither(input);
    return Either.isRight(decoded) ? decoded.right : undefined;
  };
};

export const decodeSchemaOrUndefined = <A, I>(
  schema: Schema.Schema<A, I, never>,
) => {
  const decodeEither = Schema.decodeUnknownEither(schema);

  return (input: unknown): A | undefined => {
    const decoded = decodeEither(input);
    return Either.isRight(decoded) ? decoded.right : undefined;
  };
};

export const decodeEmptyInput = (input: unknown): Record<string, never> => {
  const decoded = decodeEmptyInputSchema(input);

  if (Either.isLeft(decoded)) {
    throw decoded.left;
  }

  return {};
};
