import { Schema } from "effect";
import { ActorTypeSchema } from "./actor-types";
import { TenantContextSchema } from "./tenant-context";

export const ImpersonationContextSchema = Schema.Struct({
  impersonatedActorId: Schema.NonEmptyString,
  approvedBy: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
});

export type ImpersonationContext = Schema.Schema.Type<
  typeof ImpersonationContextSchema
>;

export const BreakGlassContextSchema = Schema.Struct({
  approvedBy: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
});

export type BreakGlassContext = Schema.Schema.Type<
  typeof BreakGlassContextSchema
>;

export const RequestContextSchema = Schema.Struct({
  actorType: ActorTypeSchema,
  actorId: Schema.optional(Schema.NonEmptyString),
  sessionId: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.NonEmptyString,
  tenant: TenantContextSchema,
  host: Schema.optional(Schema.NonEmptyString),
  reason: Schema.optional(Schema.NonEmptyString),
  impersonation: Schema.optional(ImpersonationContextSchema),
  breakGlass: Schema.optional(BreakGlassContextSchema),
});

export type RequestContext = Schema.Schema.Type<typeof RequestContextSchema>;
