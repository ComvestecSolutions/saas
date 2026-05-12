import { Schema } from "effect";
import { platformScope, PlatformScopeSchema } from "../access/platform-scopes";
import {
  WorkflowJobGapReasonSchema,
  WorkflowJobStatusSchema,
} from "../data/workflow-job-state";
import { IsoTimestampSchema } from "./timestamps";
import {
  SupportOperationsCasePrioritySchema,
  SupportOperationsCaseStatusSchema,
} from "./support-operations-cases";

export {
  supportOperationsCasePriority,
  SupportOperationsCasePrioritySchema,
  type SupportOperationsCasePriority,
  supportOperationsCaseStatus,
  SupportOperationsCaseStatusSchema,
  type SupportOperationsCaseStatus,
  SupportOperationsCaseSupportViewListSchema,
  SupportOperationsCaseSupportViewSchema,
  type SupportOperationsCaseSupportView,
} from "./support-operations-cases";

export const supportOperationsBreakGlassIncidentStatus = {
  pendingReview: "pending-review",
  reviewed: "reviewed",
} as const;

export const SupportOperationsBreakGlassIncidentStatusSchema = Schema.Literal(
  supportOperationsBreakGlassIncidentStatus.pendingReview,
  supportOperationsBreakGlassIncidentStatus.reviewed,
);

export type SupportOperationsBreakGlassIncidentStatus = Schema.Schema.Type<
  typeof SupportOperationsBreakGlassIncidentStatusSchema
>;

export const supportOperationsImpersonationSessionStatus = {
  active: "active",
  revoked: "revoked",
  expired: "expired",
  revocationPending: "revocation-pending",
} as const;

export const SupportOperationsImpersonationSessionStatusSchema = Schema.Literal(
  supportOperationsImpersonationSessionStatus.active,
  supportOperationsImpersonationSessionStatus.revoked,
  supportOperationsImpersonationSessionStatus.expired,
  supportOperationsImpersonationSessionStatus.revocationPending,
);

export type SupportOperationsImpersonationSessionStatus = Schema.Schema.Type<
  typeof SupportOperationsImpersonationSessionStatusSchema
>;

export const SupportOperationsTenantHealthScopeSchema = Schema.Literal(
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
);

export type SupportOperationsTenantHealthScope = Schema.Schema.Type<
  typeof SupportOperationsTenantHealthScopeSchema
>;

export const SupportOperationsTenantHealthCaseSupportViewSchema = Schema.Struct(
  {
    caseId: Schema.NonEmptyString,
    supportAgent: Schema.NonEmptyString,
    tenantScope: SupportOperationsTenantHealthScopeSchema,
    tenantScopeId: Schema.NonEmptyString,
    summary: Schema.NonEmptyString,
    status: SupportOperationsCaseStatusSchema,
    priority: SupportOperationsCasePrioritySchema,
    startedAt: IsoTimestampSchema,
    lastUpdatedAt: IsoTimestampSchema,
  },
);

export type SupportOperationsTenantHealthCaseSupportView = Schema.Schema.Type<
  typeof SupportOperationsTenantHealthCaseSupportViewSchema
>;

export const SupportOperationsTenantHealthCaseSupportViewListSchema =
  Schema.Array(SupportOperationsTenantHealthCaseSupportViewSchema);

export const SupportOperationsTenantHealthRepairGapSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  tenantScope: SupportOperationsTenantHealthScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  status: WorkflowJobStatusSchema,
  attempts: Schema.NonNegativeInt,
  scheduledAt: IsoTimestampSchema,
  completedAt: Schema.optional(IsoTimestampSchema),
  gapReason: Schema.optional(WorkflowJobGapReasonSchema),
});

export type SupportOperationsTenantHealthRepairGap = Schema.Schema.Type<
  typeof SupportOperationsTenantHealthRepairGapSchema
>;

export const SupportOperationsTenantHealthRepairGapListSchema = Schema.Array(
  SupportOperationsTenantHealthRepairGapSchema,
);

export const SupportOperationsTenantHealthViewSchema = Schema.Struct({
  tenantScope: SupportOperationsTenantHealthScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  cases: SupportOperationsTenantHealthCaseSupportViewListSchema,
  repairGaps: SupportOperationsTenantHealthRepairGapListSchema,
});

export type SupportOperationsTenantHealthView = Schema.Schema.Type<
  typeof SupportOperationsTenantHealthViewSchema
>;

export const SupportOperationsBreakGlassIncidentSupportViewSchema =
  Schema.Struct({
    caseId: Schema.NonEmptyString,
    status: SupportOperationsBreakGlassIncidentStatusSchema,
    startedAt: IsoTimestampSchema,
  });

export type SupportOperationsBreakGlassIncidentSupportView = Schema.Schema.Type<
  typeof SupportOperationsBreakGlassIncidentSupportViewSchema
>;

export const SupportOperationsBreakGlassIncidentSupportViewListSchema =
  Schema.Array(SupportOperationsBreakGlassIncidentSupportViewSchema);

export const SupportOperationsImpersonationSessionSupportViewSchema =
  Schema.Struct({
    caseId: Schema.NonEmptyString,
    status: SupportOperationsImpersonationSessionStatusSchema,
    startedAt: IsoTimestampSchema,
  });

export type SupportOperationsImpersonationSessionSupportView =
  Schema.Schema.Type<
    typeof SupportOperationsImpersonationSessionSupportViewSchema
  >;

export const SupportOperationsImpersonationSessionSupportViewListSchema =
  Schema.Array(SupportOperationsImpersonationSessionSupportViewSchema);
