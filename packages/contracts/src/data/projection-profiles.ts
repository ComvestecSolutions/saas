import { Schema } from "effect";

const ProjectionProfileConstantSchema = Schema.Struct({
  summary: Schema.Literal("summary"),
  detail: Schema.Literal("detail"),
  admin: Schema.Literal("admin"),
  supportSafe: Schema.Literal("support-safe"),
  billing: Schema.Literal("billing"),
  complianceReview: Schema.Literal("compliance-review"),
});

export const projectionProfile = Schema.validateSync(
  ProjectionProfileConstantSchema,
)({
  summary: "summary",
  detail: "detail",
  admin: "admin",
  supportSafe: "support-safe",
  billing: "billing",
  complianceReview: "compliance-review",
} satisfies Schema.Schema.Type<typeof ProjectionProfileConstantSchema>);

export const projectionProfiles = [
  projectionProfile.summary,
  projectionProfile.detail,
  projectionProfile.admin,
  projectionProfile.supportSafe,
  projectionProfile.billing,
  projectionProfile.complianceReview,
] as const;

export const ProjectionProfileSchema = Schema.Literal(...projectionProfiles);

export type ProjectionProfile = Schema.Schema.Type<
  typeof ProjectionProfileSchema
>;
