import { Schema } from "effect";
import { PlatformScopeSchema } from "./platform-scopes";

export const TenantContextSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  enterpriseId: Schema.optional(Schema.NonEmptyString),
  organizationId: Schema.optional(Schema.NonEmptyString),
  individualId: Schema.optional(Schema.NonEmptyString),
});

export type TenantContext = Schema.Schema.Type<typeof TenantContextSchema>;
