import { Schema } from "effect";
import { ActorTypeSchema } from "./actor-types";

const IdentityClaimKeyConstantSchema = Schema.Struct({
  actorType: Schema.Literal("comvestec_actor_type"),
});

export const identityClaimKey = Schema.validateSync(
  IdentityClaimKeyConstantSchema,
)({
  actorType: "comvestec_actor_type",
} satisfies Schema.Schema.Type<typeof IdentityClaimKeyConstantSchema>);

export const IdentityActorTypeClaimSchema = ActorTypeSchema;

export type IdentityActorTypeClaim = Schema.Schema.Type<
  typeof IdentityActorTypeClaimSchema
>;
