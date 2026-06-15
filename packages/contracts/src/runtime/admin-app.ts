import { Schema } from "effect";
import { AdminOperatorIdentitySchema } from "../access/admin-operators";
import { ActorTypeSchema } from "../access/actor-types";
import { AdminOrgRoleSchema } from "../access/capability-snapshot-v2";
import { ProjectionProfileSchema } from "../data/projection-profiles";

const AdminRoutePathConstantSchema = Schema.Struct({
  operationsHome: Schema.Literal("/desk"),
  profile: Schema.Literal("/admin/profile"),
  repairOperations: Schema.Literal("/repair-operations"),
  tenantWorkspaceDiscovery: Schema.Literal("/desk/tenants"),
  tenantWorkspace: Schema.Literal("/desk/tenant/$tenantId"),
  runtimeConfig: Schema.Literal("/desk/config"),
  featureFlags: Schema.Literal("/desk/flag"),
  accessControl: Schema.Literal("/desk/access"),
  auditLog: Schema.Literal("/desk/audit"),
  supportOperations: Schema.Literal("/desk/support"),
  branding: Schema.Literal("/desk/branding"),
  billing: Schema.Literal("/desk/billing"),
  complianceRetention: Schema.Literal("/desk/retention"),
  webhooksApiAccess: Schema.Literal("/desk/webhook"),
});

export const adminRoutePath = Schema.validateSync(AdminRoutePathConstantSchema)(
  {
    operationsHome: "/desk",
    profile: "/admin/profile",
    repairOperations: "/repair-operations",
    tenantWorkspaceDiscovery: "/desk/tenants",
    tenantWorkspace: "/desk/tenant/$tenantId",
    runtimeConfig: "/desk/config",
    featureFlags: "/desk/flag",
    accessControl: "/desk/access",
    auditLog: "/desk/audit",
    supportOperations: "/desk/support",
    branding: "/desk/branding",
    billing: "/desk/billing",
    complianceRetention: "/desk/retention",
    webhooksApiAccess: "/desk/webhook",
  } satisfies Schema.Schema.Type<typeof AdminRoutePathConstantSchema>,
);

export const adminRoutePaths = [
  adminRoutePath.operationsHome,
  adminRoutePath.profile,
  adminRoutePath.repairOperations,
  adminRoutePath.tenantWorkspaceDiscovery,
  adminRoutePath.tenantWorkspace,
  adminRoutePath.runtimeConfig,
  adminRoutePath.featureFlags,
  adminRoutePath.accessControl,
  adminRoutePath.auditLog,
  adminRoutePath.supportOperations,
  adminRoutePath.branding,
  adminRoutePath.billing,
  adminRoutePath.complianceRetention,
  adminRoutePath.webhooksApiAccess,
] as const;

export const AdminRoutePathSchema = Schema.Literal(...adminRoutePaths);

export type AdminRoutePath = Schema.Schema.Type<typeof AdminRoutePathSchema>;

const AdminOperatorCapabilityConstantSchema = Schema.Struct({
  operationsHome: Schema.Literal("operations-home"),
  repairOperations: Schema.Literal("repair-operations"),
  tenantWorkspace: Schema.Literal("tenant-workspace"),
  runtimeConfig: Schema.Literal("runtime-config"),
  featureFlags: Schema.Literal("feature-flags"),
  accessControl: Schema.Literal("access-control"),
  auditLog: Schema.Literal("audit-log"),
  supportOperations: Schema.Literal("support-operations"),
  branding: Schema.Literal("branding"),
  billing: Schema.Literal("billing"),
  complianceRetention: Schema.Literal("compliance-retention"),
  webhooksApiAccess: Schema.Literal("webhooks-api-access"),
});

export const adminOperatorCapability = Schema.validateSync(
  AdminOperatorCapabilityConstantSchema,
)({
  operationsHome: "operations-home",
  repairOperations: "repair-operations",
  tenantWorkspace: "tenant-workspace",
  runtimeConfig: "runtime-config",
  featureFlags: "feature-flags",
  accessControl: "access-control",
  auditLog: "audit-log",
  supportOperations: "support-operations",
  branding: "branding",
  billing: "billing",
  complianceRetention: "compliance-retention",
  webhooksApiAccess: "webhooks-api-access",
} satisfies Schema.Schema.Type<typeof AdminOperatorCapabilityConstantSchema>);

export const adminOperatorCapabilities = [
  adminOperatorCapability.operationsHome,
  adminOperatorCapability.repairOperations,
  adminOperatorCapability.tenantWorkspace,
  adminOperatorCapability.runtimeConfig,
  adminOperatorCapability.featureFlags,
  adminOperatorCapability.accessControl,
  adminOperatorCapability.auditLog,
  adminOperatorCapability.supportOperations,
  adminOperatorCapability.branding,
  adminOperatorCapability.billing,
  adminOperatorCapability.complianceRetention,
  adminOperatorCapability.webhooksApiAccess,
] as const;

export const AdminOperatorCapabilitySchema = Schema.Literal(
  ...adminOperatorCapabilities,
);

export type AdminOperatorCapability = Schema.Schema.Type<
  typeof AdminOperatorCapabilitySchema
>;

const AdminQuerySortDirectionConstantSchema = Schema.Struct({
  asc: Schema.Literal("asc"),
  desc: Schema.Literal("desc"),
});

export const adminQuerySortDirection = Schema.validateSync(
  AdminQuerySortDirectionConstantSchema,
)({
  asc: "asc",
  desc: "desc",
} satisfies Schema.Schema.Type<typeof AdminQuerySortDirectionConstantSchema>);

export const adminQuerySortDirections = [
  adminQuerySortDirection.asc,
  adminQuerySortDirection.desc,
] as const;

export const AdminQuerySortDirectionSchema = Schema.Literal(
  ...adminQuerySortDirections,
);

export type AdminQuerySortDirection = Schema.Schema.Type<
  typeof AdminQuerySortDirectionSchema
>;

export const AdminQueryPageSchema = Schema.Struct({
  page: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  pageSize: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(1),
    Schema.lessThanOrEqualTo(100),
  ),
});

export type AdminQueryPage = Schema.Schema.Type<typeof AdminQueryPageSchema>;

export const AdminQueryPageInfoSchema = Schema.Struct({
  page: AdminQueryPageSchema,
  totalItems: Schema.NonNegativeInt,
  totalPages: Schema.NonNegativeInt,
  exportMode: Schema.Boolean,
});

export type AdminQueryPageInfo = Schema.Schema.Type<
  typeof AdminQueryPageInfoSchema
>;

const AdminGovernanceActionPolicyIdConstantSchema = Schema.Struct({
  authorizationTupleWrite: Schema.Literal("authorization-tuple-write"),
  authorizationTupleDelete: Schema.Literal("authorization-tuple-delete"),
  runtimeConfigProposalSubmit: Schema.Literal("runtime-config-proposal-submit"),
  runtimeConfigProposalReview: Schema.Literal("runtime-config-proposal-review"),
  breakGlassIncidentReview: Schema.Literal("break-glass-incident-review"),
  repairGapInspection: Schema.Literal("repair-gap-inspection"),
});

export const adminGovernanceActionPolicyId = Schema.validateSync(
  AdminGovernanceActionPolicyIdConstantSchema,
)({
  authorizationTupleWrite: "authorization-tuple-write",
  authorizationTupleDelete: "authorization-tuple-delete",
  runtimeConfigProposalSubmit: "runtime-config-proposal-submit",
  runtimeConfigProposalReview: "runtime-config-proposal-review",
  breakGlassIncidentReview: "break-glass-incident-review",
  repairGapInspection: "repair-gap-inspection",
} satisfies Schema.Schema.Type<
  typeof AdminGovernanceActionPolicyIdConstantSchema
>);

export const adminGovernanceActionPolicyIds = [
  adminGovernanceActionPolicyId.authorizationTupleWrite,
  adminGovernanceActionPolicyId.authorizationTupleDelete,
  adminGovernanceActionPolicyId.runtimeConfigProposalSubmit,
  adminGovernanceActionPolicyId.runtimeConfigProposalReview,
  adminGovernanceActionPolicyId.breakGlassIncidentReview,
  adminGovernanceActionPolicyId.repairGapInspection,
] as const;

export const AdminGovernanceActionPolicyIdSchema = Schema.Literal(
  ...adminGovernanceActionPolicyIds,
);

export type AdminGovernanceActionPolicyId = Schema.Schema.Type<
  typeof AdminGovernanceActionPolicyIdSchema
>;

const AdminGovernanceActionPolicySeverityConstantSchema = Schema.Struct({
  informational: Schema.Literal("informational"),
  guarded: Schema.Literal("guarded"),
  highRisk: Schema.Literal("high-risk"),
});

export const adminGovernanceActionPolicySeverity = Schema.validateSync(
  AdminGovernanceActionPolicySeverityConstantSchema,
)({
  informational: "informational",
  guarded: "guarded",
  highRisk: "high-risk",
} satisfies Schema.Schema.Type<
  typeof AdminGovernanceActionPolicySeverityConstantSchema
>);

export const adminGovernanceActionPolicySeverities = [
  adminGovernanceActionPolicySeverity.informational,
  adminGovernanceActionPolicySeverity.guarded,
  adminGovernanceActionPolicySeverity.highRisk,
] as const;

export const AdminGovernanceActionPolicySeveritySchema = Schema.Literal(
  ...adminGovernanceActionPolicySeverities,
);

export type AdminGovernanceActionPolicySeverity = Schema.Schema.Type<
  typeof AdminGovernanceActionPolicySeveritySchema
>;

export const AdminGovernanceReasonOptionSchema = Schema.Struct({
  value: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
});

export type AdminGovernanceReasonOption = Schema.Schema.Type<
  typeof AdminGovernanceReasonOptionSchema
>;

export const AdminGovernanceActionPolicyMetadataSchema = Schema.Struct({
  actionId: AdminGovernanceActionPolicyIdSchema,
  label: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  severity: AdminGovernanceActionPolicySeveritySchema,
  projectionProfile: ProjectionProfileSchema,
  requiresReason: Schema.Boolean,
  requiresComment: Schema.Boolean,
  stepUpRequired: Schema.Boolean,
  reasonOptions: Schema.Array(AdminGovernanceReasonOptionSchema),
});

export type AdminGovernanceActionPolicyMetadata = Schema.Schema.Type<
  typeof AdminGovernanceActionPolicyMetadataSchema
>;

export const AdminGovernanceActionPolicyMetadataListSchema = Schema.Array(
  AdminGovernanceActionPolicyMetadataSchema,
);

export const AdminOperatorCapabilityEntrySchema = Schema.Struct({
  capability: AdminOperatorCapabilitySchema,
  routePath: AdminRoutePathSchema,
  visible: Schema.Boolean,
  allowed: Schema.Boolean,
  label: Schema.NonEmptyString,
  reason: Schema.optional(Schema.NonEmptyString),
  actionPolicyIds: Schema.Array(AdminGovernanceActionPolicyIdSchema),
});

export type AdminOperatorCapabilityEntry = Schema.Schema.Type<
  typeof AdminOperatorCapabilityEntrySchema
>;

export const AdminOperatorCapabilitySnapshotSchema = Schema.Struct({
  actorType: ActorTypeSchema,
  actorId: Schema.optional(Schema.NonEmptyString),
  sessionId: Schema.optional(Schema.NonEmptyString),
  capabilities: Schema.Array(AdminOperatorCapabilityEntrySchema),
});

export type AdminOperatorCapabilitySnapshot = Schema.Schema.Type<
  typeof AdminOperatorCapabilitySnapshotSchema
>;

export const AdminOperatorProfileSchema = Schema.Struct({
  identity: AdminOperatorIdentitySchema,
  sessionId: Schema.NonEmptyString,
  adminOrgRole: AdminOrgRoleSchema,
  capabilities: Schema.Array(AdminOperatorCapabilityEntrySchema),
});

export type AdminOperatorProfile = Schema.Schema.Type<
  typeof AdminOperatorProfileSchema
>;

export const AdminOperatorDirectorySnapshotSchema = Schema.Struct({
  currentOperator: AdminOperatorProfileSchema,
  operators: Schema.Array(AdminOperatorIdentitySchema),
});

export type AdminOperatorDirectorySnapshot = Schema.Schema.Type<
  typeof AdminOperatorDirectorySnapshotSchema
>;
