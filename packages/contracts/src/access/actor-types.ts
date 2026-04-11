import { Schema } from "effect";

const ActorTypeConstantSchema = Schema.Struct({
  anonymous: Schema.Literal("anonymous"),
  individualUser: Schema.Literal("individual-user"),
  enterpriseAdmin: Schema.Literal("enterprise-admin"),
  organizationAdmin: Schema.Literal("organization-admin"),
  organizationMember: Schema.Literal("organization-member"),
  platformOperator: Schema.Literal("platform-operator"),
  supportOperator: Schema.Literal("support-operator"),
  serviceActor: Schema.Literal("service-actor"),
});

export const actorType = Schema.validateSync(ActorTypeConstantSchema)({
  anonymous: "anonymous",
  individualUser: "individual-user",
  enterpriseAdmin: "enterprise-admin",
  organizationAdmin: "organization-admin",
  organizationMember: "organization-member",
  platformOperator: "platform-operator",
  supportOperator: "support-operator",
  serviceActor: "service-actor",
} satisfies Schema.Schema.Type<typeof ActorTypeConstantSchema>);

export const actorTypes = [
  actorType.anonymous,
  actorType.individualUser,
  actorType.enterpriseAdmin,
  actorType.organizationAdmin,
  actorType.organizationMember,
  actorType.platformOperator,
  actorType.supportOperator,
  actorType.serviceActor,
] as const;

export const ActorTypeSchema = Schema.Literal(...actorTypes);

export type ActorType = Schema.Schema.Type<typeof ActorTypeSchema>;
