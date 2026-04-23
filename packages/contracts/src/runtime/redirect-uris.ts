import { Schema } from "effect";

const isAbsoluteHttpRedirectUri = (value: string) => {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const AbsoluteRedirectUriSchema = Schema.NonEmptyString.pipe(
  Schema.filter(isAbsoluteHttpRedirectUri),
);

export type AbsoluteRedirectUri = Schema.Schema.Type<
  typeof AbsoluteRedirectUriSchema
>;
