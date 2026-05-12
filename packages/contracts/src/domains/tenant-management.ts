import { Schema } from "effect";
import { authorizationRelation } from "../access/authorization";
import { TenantContextSchema } from "../access/tenant-context";
import { PublicBrandingProjectionSchema } from "./tenant-branding";
import { PlatformModuleIdSchema } from "../module-registry/modules";
import { IsoTimestampSchema } from "../runtime/timestamps";

const OnboardingStepStatusConstantSchema = Schema.Struct({
  notStarted: Schema.Literal("not-started"),
  inProgress: Schema.Literal("in-progress"),
  completed: Schema.Literal("completed"),
});

export const onboardingStepStatus = Schema.validateSync(
  OnboardingStepStatusConstantSchema,
)({
  notStarted: "not-started",
  inProgress: "in-progress",
  completed: "completed",
} satisfies Schema.Schema.Type<typeof OnboardingStepStatusConstantSchema>);

export const onboardingStepStatuses = [
  onboardingStepStatus.notStarted,
  onboardingStepStatus.inProgress,
  onboardingStepStatus.completed,
] as const;

export const OnboardingStepStatusSchema = Schema.Literal(
  ...onboardingStepStatuses,
);

export type OnboardingStepStatus = Schema.Schema.Type<
  typeof OnboardingStepStatusSchema
>;

const TenantOnboardingRunStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  inProgress: Schema.Literal("in-progress"),
  completed: Schema.Literal("completed"),
  failed: Schema.Literal("failed"),
});

export const tenantOnboardingRunStatus = Schema.validateSync(
  TenantOnboardingRunStatusConstantSchema,
)({
  pending: "pending",
  inProgress: "in-progress",
  completed: "completed",
  failed: "failed",
} satisfies Schema.Schema.Type<typeof TenantOnboardingRunStatusConstantSchema>);

export const tenantOnboardingRunStatuses = [
  tenantOnboardingRunStatus.pending,
  tenantOnboardingRunStatus.inProgress,
  tenantOnboardingRunStatus.completed,
  tenantOnboardingRunStatus.failed,
] as const;

export const TenantOnboardingRunStatusSchema = Schema.Literal(
  ...tenantOnboardingRunStatuses,
);

export type TenantOnboardingRunStatus = Schema.Schema.Type<
  typeof TenantOnboardingRunStatusSchema
>;

export const tenantMembershipRelations = [
  authorizationRelation.owner,
  authorizationRelation.admin,
  authorizationRelation.editor,
  authorizationRelation.member,
  authorizationRelation.viewer,
] as const;

export const TenantMembershipRelationSchema = Schema.Literal(
  ...tenantMembershipRelations,
);

export type TenantMembershipRelation = Schema.Schema.Type<
  typeof TenantMembershipRelationSchema
>;

export const TenantMembershipViewSchema = Schema.Struct({
  subject: Schema.NonEmptyString,
  relations: Schema.Array(TenantMembershipRelationSchema),
});

export type TenantMembershipView = Schema.Schema.Type<
  typeof TenantMembershipViewSchema
>;

export const TenantMembershipViewListSchema = Schema.Array(
  TenantMembershipViewSchema,
);

export type TenantMembershipViewList = Schema.Schema.Type<
  typeof TenantMembershipViewListSchema
>;

const TenantMembershipMutationActionConstantSchema = Schema.Struct({
  grant: Schema.Literal("grant"),
  revoke: Schema.Literal("revoke"),
});

export const tenantMembershipMutationAction = Schema.validateSync(
  TenantMembershipMutationActionConstantSchema,
)({
  grant: "grant",
  revoke: "revoke",
} satisfies Schema.Schema.Type<
  typeof TenantMembershipMutationActionConstantSchema
>);

export const tenantMembershipMutationActions = [
  tenantMembershipMutationAction.grant,
  tenantMembershipMutationAction.revoke,
] as const;

export const TenantMembershipMutationActionSchema = Schema.Literal(
  ...tenantMembershipMutationActions,
);

export type TenantMembershipMutationAction = Schema.Schema.Type<
  typeof TenantMembershipMutationActionSchema
>;

const TenantInvitationStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  revoked: Schema.Literal("revoked"),
  expired: Schema.Literal("expired"),
  redeemed: Schema.Literal("redeemed"),
});

export const tenantInvitationStatus = Schema.validateSync(
  TenantInvitationStatusConstantSchema,
)({
  pending: "pending",
  revoked: "revoked",
  expired: "expired",
  redeemed: "redeemed",
} satisfies Schema.Schema.Type<typeof TenantInvitationStatusConstantSchema>);

export const tenantInvitationStatuses = [
  tenantInvitationStatus.pending,
  tenantInvitationStatus.revoked,
  tenantInvitationStatus.expired,
  tenantInvitationStatus.redeemed,
] as const;

export const TenantInvitationStatusSchema = Schema.Literal(
  ...tenantInvitationStatuses,
);

export type TenantInvitationStatus = Schema.Schema.Type<
  typeof TenantInvitationStatusSchema
>;

export const TenantInvitationSecretHandoffSchema = Schema.Struct({
  invitationToken: Schema.NonEmptyString,
  expiresAt: IsoTimestampSchema,
});

export type TenantInvitationSecretHandoff = Schema.Schema.Type<
  typeof TenantInvitationSecretHandoffSchema
>;

export const TenantInvitationViewSchema = Schema.Struct({
  invitationId: Schema.NonEmptyString,
  recipientEmail: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  status: TenantInvitationStatusSchema,
  issuedBy: Schema.NonEmptyString,
  issuedAt: IsoTimestampSchema,
  expiresAt: IsoTimestampSchema,
  revokedAt: Schema.optional(IsoTimestampSchema),
  revokedBy: Schema.optional(Schema.NonEmptyString),
  redeemedAt: Schema.optional(IsoTimestampSchema),
  redeemedBy: Schema.optional(Schema.NonEmptyString),
});

export type TenantInvitationView = Schema.Schema.Type<
  typeof TenantInvitationViewSchema
>;

export const TenantInvitationViewListSchema = Schema.Array(
  TenantInvitationViewSchema,
);

export type TenantInvitationViewList = Schema.Schema.Type<
  typeof TenantInvitationViewListSchema
>;

export const TenantOnboardingReviewStepSchema = Schema.Struct({
  stepId: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  status: OnboardingStepStatusSchema,
  requiredModuleId: Schema.optional(PlatformModuleIdSchema),
  retryCount: Schema.Number,
});

export type TenantOnboardingReviewStep = Schema.Schema.Type<
  typeof TenantOnboardingReviewStepSchema
>;

export const TenantOnboardingReviewRunSchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  triggeredBy: Schema.NonEmptyString,
  correlationId: Schema.optional(Schema.NonEmptyString),
  status: TenantOnboardingRunStatusSchema,
  currentStepId: Schema.optional(Schema.NonEmptyString),
  startedAt: IsoTimestampSchema,
  completedAt: Schema.optional(IsoTimestampSchema),
  steps: Schema.Array(TenantOnboardingReviewStepSchema),
});

export type TenantOnboardingReviewRun = Schema.Schema.Type<
  typeof TenantOnboardingReviewRunSchema
>;

export const AdminTenantOnboardingReviewRequestSchema = Schema.Struct({
  tenant: TenantContextSchema,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type AdminTenantOnboardingReviewRequest = Schema.Schema.Type<
  typeof AdminTenantOnboardingReviewRequestSchema
>;

export const AdminTenantOnboardingReviewResultSchema = Schema.Struct({
  tenant: TenantContextSchema,
  run: Schema.optional(TenantOnboardingReviewRunSchema),
});

export type AdminTenantOnboardingReviewResult = Schema.Schema.Type<
  typeof AdminTenantOnboardingReviewResultSchema
>;

export const AdminTenantMembershipQueryRequestSchema = Schema.Struct({
  tenant: TenantContextSchema,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type AdminTenantMembershipQueryRequest = Schema.Schema.Type<
  typeof AdminTenantMembershipQueryRequestSchema
>;

export const AdminTenantMembershipQueryResultSchema = Schema.Struct({
  tenant: TenantContextSchema,
  memberships: TenantMembershipViewListSchema,
});

export type AdminTenantMembershipQueryResult = Schema.Schema.Type<
  typeof AdminTenantMembershipQueryResultSchema
>;

export const AdminTenantMembershipMutationRequestSchema = Schema.Struct({
  tenant: TenantContextSchema,
  subject: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  action: TenantMembershipMutationActionSchema,
  mutationReason: Schema.NonEmptyString,
});

export type AdminTenantMembershipMutationRequest = Schema.Schema.Type<
  typeof AdminTenantMembershipMutationRequestSchema
>;

export const AdminTenantMembershipMutationResultSchema = Schema.Struct({
  tenant: TenantContextSchema,
  subject: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  action: TenantMembershipMutationActionSchema,
  changed: Schema.Boolean,
  membership: TenantMembershipViewSchema,
});

export type AdminTenantMembershipMutationResult = Schema.Schema.Type<
  typeof AdminTenantMembershipMutationResultSchema
>;

export const AdminTenantInvitationIssueRequestSchema = Schema.Struct({
  tenant: TenantContextSchema,
  recipientEmail: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  issueReason: Schema.NonEmptyString,
});

export type AdminTenantInvitationIssueRequest = Schema.Schema.Type<
  typeof AdminTenantInvitationIssueRequestSchema
>;

const TenantInvitationEmailDeliveryStatusConstantSchema = Schema.Struct({
  queued: Schema.Literal("queued"),
  notQueued: Schema.Literal("not-queued"),
});

export const tenantInvitationEmailDeliveryStatus = Schema.validateSync(
  TenantInvitationEmailDeliveryStatusConstantSchema,
)({
  queued: "queued",
  notQueued: "not-queued",
} satisfies Schema.Schema.Type<
  typeof TenantInvitationEmailDeliveryStatusConstantSchema
>);

export const tenantInvitationEmailDeliveryStatuses = [
  tenantInvitationEmailDeliveryStatus.queued,
  tenantInvitationEmailDeliveryStatus.notQueued,
] as const;

export const TenantInvitationEmailDeliveryStatusSchema = Schema.Literal(
  ...tenantInvitationEmailDeliveryStatuses,
);

export type TenantInvitationEmailDeliveryStatus = Schema.Schema.Type<
  typeof TenantInvitationEmailDeliveryStatusSchema
>;

export const TenantInvitationEmailDeliveryOutcomeSchema = Schema.Union(
  Schema.Struct({
    status: Schema.Literal(tenantInvitationEmailDeliveryStatus.queued),
    template: Schema.NonEmptyString,
    messageId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    status: Schema.Literal(tenantInvitationEmailDeliveryStatus.notQueued),
    template: Schema.NonEmptyString,
  }),
);

export type TenantInvitationEmailDeliveryOutcome = Schema.Schema.Type<
  typeof TenantInvitationEmailDeliveryOutcomeSchema
>;

export const AdminTenantInvitationIssueResultSchema = Schema.Struct({
  tenant: TenantContextSchema,
  invitation: TenantInvitationViewSchema,
  handoff: TenantInvitationSecretHandoffSchema,
  delivery: TenantInvitationEmailDeliveryOutcomeSchema,
});

export type AdminTenantInvitationIssueResult = Schema.Schema.Type<
  typeof AdminTenantInvitationIssueResultSchema
>;

export const AdminTenantInvitationQueryRequestSchema = Schema.Struct({
  tenant: TenantContextSchema,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type AdminTenantInvitationQueryRequest = Schema.Schema.Type<
  typeof AdminTenantInvitationQueryRequestSchema
>;

export const AdminTenantInvitationQueryResultSchema = Schema.Struct({
  tenant: TenantContextSchema,
  invitations: TenantInvitationViewListSchema,
});

export type AdminTenantInvitationQueryResult = Schema.Schema.Type<
  typeof AdminTenantInvitationQueryResultSchema
>;

export const AdminTenantInvitationRevokeRequestSchema = Schema.Struct({
  tenant: TenantContextSchema,
  invitationId: Schema.NonEmptyString,
  revocationReason: Schema.NonEmptyString,
});

export type AdminTenantInvitationRevokeRequest = Schema.Schema.Type<
  typeof AdminTenantInvitationRevokeRequestSchema
>;

export const AdminTenantInvitationRevokeResultSchema = Schema.Struct({
  tenant: TenantContextSchema,
  invitationId: Schema.NonEmptyString,
  changed: Schema.Boolean,
  invitation: TenantInvitationViewSchema,
});

export type AdminTenantInvitationRevokeResult = Schema.Schema.Type<
  typeof AdminTenantInvitationRevokeResultSchema
>;

export const RedeemTenantInvitationRequestSchema = Schema.Struct({
  invitationToken: Schema.NonEmptyString,
});

export type RedeemTenantInvitationRequest = Schema.Schema.Type<
  typeof RedeemTenantInvitationRequestSchema
>;

export const RedeemTenantInvitationResultSchema = Schema.Struct({
  tenant: TenantContextSchema,
  invitationId: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  membershipChanged: Schema.Boolean,
  membership: TenantMembershipViewSchema,
  branding: PublicBrandingProjectionSchema,
});

export type RedeemTenantInvitationResult = Schema.Schema.Type<
  typeof RedeemTenantInvitationResultSchema
>;
