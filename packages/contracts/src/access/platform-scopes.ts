import { Schema } from "effect";

const PlatformScopeConstantSchema = Schema.Struct({
  platform: Schema.Literal("platform"),
  enterprise: Schema.Literal("enterprise"),
  organization: Schema.Literal("organization"),
  individual: Schema.Literal("individual"),
});

export const platformScope = Schema.validateSync(PlatformScopeConstantSchema)({
  platform: "platform",
  enterprise: "enterprise",
  organization: "organization",
  individual: "individual",
} satisfies Schema.Schema.Type<typeof PlatformScopeConstantSchema>);

export const platformScopes = [
  platformScope.platform,
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
] as const;

export const PlatformScopeSchema = Schema.Literal(...platformScopes);

export type PlatformScope = Schema.Schema.Type<typeof PlatformScopeSchema>;
