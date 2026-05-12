import { Schema } from "effect";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { IsoTimestampSchema } from "../runtime";

const RetentionDataTypeConstantSchema = Schema.Struct({
  fileObject: Schema.Literal("file-object"),
  webhookReceipt: Schema.Literal("webhook-receipt"),
  auditLogEvent: Schema.Literal("audit-log-event"),
});

export const retentionDataType = Schema.validateSync(
  RetentionDataTypeConstantSchema,
)({
  fileObject: "file-object",
  webhookReceipt: "webhook-receipt",
  auditLogEvent: "audit-log-event",
} satisfies Schema.Schema.Type<typeof RetentionDataTypeConstantSchema>);

export const RetentionDataTypeSchema = Schema.Literal(
  retentionDataType.fileObject,
  retentionDataType.webhookReceipt,
  retentionDataType.auditLogEvent,
);

export type RetentionDataType = Schema.Schema.Type<
  typeof RetentionDataTypeSchema
>;

const RetentionLegalHoldStatusConstantSchema = Schema.Struct({
  active: Schema.Literal("active"),
  released: Schema.Literal("released"),
});

export const retentionLegalHoldStatus = Schema.validateSync(
  RetentionLegalHoldStatusConstantSchema,
)({
  active: "active",
  released: "released",
} satisfies Schema.Schema.Type<typeof RetentionLegalHoldStatusConstantSchema>);

export const RetentionLegalHoldStatusSchema = Schema.Literal(
  retentionLegalHoldStatus.active,
  retentionLegalHoldStatus.released,
);

export type RetentionLegalHoldStatus = Schema.Schema.Type<
  typeof RetentionLegalHoldStatusSchema
>;

export const RetentionDaysSchema = Schema.Number.pipe(
  Schema.filter((value) => Number.isInteger(value) && value > 0),
);

export type RetentionDays = Schema.Schema.Type<typeof RetentionDaysSchema>;

export const RetentionPolicyRecordSchema = Schema.Struct({
  policyId: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  dataType: RetentionDataTypeSchema,
  retentionDays: RetentionDaysSchema,
  changedBy: Schema.NonEmptyString,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type RetentionPolicyRecord = Schema.Schema.Type<
  typeof RetentionPolicyRecordSchema
>;

export const RetentionPolicyRecordListSchema = Schema.Array(
  RetentionPolicyRecordSchema,
);

export type RetentionPolicyRecordList = Schema.Schema.Type<
  typeof RetentionPolicyRecordListSchema
>;

export const RetentionPolicyAdminViewSchema = Schema.Struct({
  policyId: Schema.NonEmptyString,
  dataType: RetentionDataTypeSchema,
  retentionDays: RetentionDaysSchema,
  legalHoldActive: Schema.Boolean,
});

export type RetentionPolicyAdminView = Schema.Schema.Type<
  typeof RetentionPolicyAdminViewSchema
>;

export const RetentionPolicyAdminViewListSchema = Schema.Array(
  RetentionPolicyAdminViewSchema,
);

export type RetentionPolicyAdminViewList = Schema.Schema.Type<
  typeof RetentionPolicyAdminViewListSchema
>;

export const RetentionLegalHoldRecordSchema = Schema.Struct({
  legalHoldId: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  dataType: RetentionDataTypeSchema,
  targetId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  evidence: Schema.NonEmptyString,
  status: RetentionLegalHoldStatusSchema,
  placedBy: Schema.NonEmptyString,
  placedAt: IsoTimestampSchema,
  releasedBy: Schema.optional(Schema.NonEmptyString),
  releasedAt: Schema.optional(IsoTimestampSchema),
});

export type RetentionLegalHoldRecord = Schema.Schema.Type<
  typeof RetentionLegalHoldRecordSchema
>;

export const RetentionLegalHoldRecordListSchema = Schema.Array(
  RetentionLegalHoldRecordSchema,
);

export type RetentionLegalHoldRecordList = Schema.Schema.Type<
  typeof RetentionLegalHoldRecordListSchema
>;

export const RetentionLegalHoldComplianceViewSchema = Schema.Struct({
  legalHoldId: Schema.NonEmptyString,
  dataType: RetentionDataTypeSchema,
  targetId: Schema.NonEmptyString,
  status: RetentionLegalHoldStatusSchema,
  placedAt: IsoTimestampSchema,
  releasedAt: Schema.optional(IsoTimestampSchema),
  evidence: Schema.NonEmptyString,
  legalHoldActive: Schema.Boolean,
});

export type RetentionLegalHoldComplianceView = Schema.Schema.Type<
  typeof RetentionLegalHoldComplianceViewSchema
>;

export const RetentionLegalHoldComplianceViewListSchema = Schema.Array(
  RetentionLegalHoldComplianceViewSchema,
);

export type RetentionLegalHoldComplianceViewList = Schema.Schema.Type<
  typeof RetentionLegalHoldComplianceViewListSchema
>;

export const UpsertRetentionPolicyInputSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  dataType: RetentionDataTypeSchema,
  retentionDays: RetentionDaysSchema,
  changedBy: Schema.NonEmptyString,
});

export type UpsertRetentionPolicyInput = Schema.Schema.Type<
  typeof UpsertRetentionPolicyInputSchema
>;

export const RetentionPolicyListRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type RetentionPolicyListRequest = Schema.Schema.Type<
  typeof RetentionPolicyListRequestSchema
>;

export const PlaceRetentionLegalHoldInputSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  dataType: RetentionDataTypeSchema,
  targetId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  evidence: Schema.NonEmptyString,
  placedBy: Schema.NonEmptyString,
});

export type PlaceRetentionLegalHoldInput = Schema.Schema.Type<
  typeof PlaceRetentionLegalHoldInputSchema
>;

export const ReleaseRetentionLegalHoldInputSchema = Schema.Struct({
  legalHoldId: Schema.NonEmptyString,
  releasedBy: Schema.NonEmptyString,
});

export type ReleaseRetentionLegalHoldInput = Schema.Schema.Type<
  typeof ReleaseRetentionLegalHoldInputSchema
>;

export const RetentionLegalHoldListRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type RetentionLegalHoldListRequest = Schema.Schema.Type<
  typeof RetentionLegalHoldListRequestSchema
>;

export const RetentionGuardCheckInputSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  dataType: RetentionDataTypeSchema,
  targetId: Schema.NonEmptyString,
});

export type RetentionGuardCheckInput = Schema.Schema.Type<
  typeof RetentionGuardCheckInputSchema
>;

export const RetentionGuardDecisionSchema = Schema.Struct({
  dataType: RetentionDataTypeSchema,
  retentionDays: Schema.optional(RetentionDaysSchema),
  policyId: Schema.optional(Schema.NonEmptyString),
  legalHoldActive: Schema.Boolean,
  purgeBlocked: Schema.Boolean,
});

export type RetentionGuardDecision = Schema.Schema.Type<
  typeof RetentionGuardDecisionSchema
>;
