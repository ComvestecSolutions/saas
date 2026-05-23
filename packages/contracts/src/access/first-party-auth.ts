import { Schema } from "effect";

export const FirstPartyAppPostAuthRedirectPathSchema =
  Schema.NonEmptyString.pipe(Schema.pattern(/^\/(?!\/).*/));
