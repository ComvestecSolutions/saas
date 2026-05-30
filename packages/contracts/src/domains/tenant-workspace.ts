/**
 * Tenant workspace aggregate v2 contracts per admin-app
 * implementation plan §9 item 4 and the Operator Desk
 * `/desk/tenant/<id>` Tenant workspace section of
 * `specs/02-apps/admin-app/spec.md`.
 *
 * The aggregate is the single payload that the admin-app's Desk
 * Center Workbench loads on `/desk/tenant/<id>`. The platform
 * service that produces this payload fans out to multiple
 * tenant-scoped sources (overview, members, recent activity,
 * open incidents, usage spotlights, pending approvals) with
 * per-section failure tolerance: any source that fails degrades
 * to an empty section and surfaces a typed entry in
 * `partialFailures` instead of poisoning the whole snapshot.
 *
 * Differences vs the Operations Home aggregate v2:
 *   - every payload carries the canonical `tenant` it was
 *     produced for, so cross-tenant pivoting at the desk shell
 *     is impossible by construction
 *   - KPI tiles, recent audit entries, and pending approvals
 *     reuse the Operations Home shapes (`OperationsHomeKpi`,
 *     `OperationsHomeRecentAuditEntry`,
 *     `OperationsHomePendingApproval`) so the desk renderer
 *     stays uniform
 */
import { Schema } from "effect";
import { TenantContextSchema } from "../access/tenant-context";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { BillingSubscriptionStatusSchema } from "./billing-metering";
import {
  OperationsHomeKpiSchema,
  OperationsHomePendingApprovalSchema,
  OperationsHomeRecentAuditEntrySchema,
} from "./operations-home";

// ---------------------------------------------------------------------------
// Tenant overview section
// ---------------------------------------------------------------------------

const TenantWorkspaceBrandingStateConstantSchema = Schema.Struct({
  unpublished: Schema.Literal("unpublished"),
  published: Schema.Literal("published"),
  pendingReview: Schema.Literal("pending-review"),
  customDomainActive: Schema.Literal("custom-domain-active"),
});

export const tenantWorkspaceBrandingState = Schema.validateSync(
  TenantWorkspaceBrandingStateConstantSchema,
)({
  unpublished: "unpublished",
  published: "published",
  pendingReview: "pending-review",
  customDomainActive: "custom-domain-active",
} satisfies Schema.Schema.Type<
  typeof TenantWorkspaceBrandingStateConstantSchema
>);

export const tenantWorkspaceBrandingStates = [
  tenantWorkspaceBrandingState.unpublished,
  tenantWorkspaceBrandingState.published,
  tenantWorkspaceBrandingState.pendingReview,
  tenantWorkspaceBrandingState.customDomainActive,
] as const;

export const TenantWorkspaceBrandingStateSchema = Schema.Literal(
  ...tenantWorkspaceBrandingStates,
);

export type TenantWorkspaceBrandingState = Schema.Schema.Type<
  typeof TenantWorkspaceBrandingStateSchema
>;

const TenantWorkspaceSupportTierConstantSchema = Schema.Struct({
  standard: Schema.Literal("standard"),
  priority: Schema.Literal("priority"),
  enterprise: Schema.Literal("enterprise"),
});

export const tenantWorkspaceSupportTier = Schema.validateSync(
  TenantWorkspaceSupportTierConstantSchema,
)({
  standard: "standard",
  priority: "priority",
  enterprise: "enterprise",
} satisfies Schema.Schema.Type<
  typeof TenantWorkspaceSupportTierConstantSchema
>);

export const tenantWorkspaceSupportTiers = [
  tenantWorkspaceSupportTier.standard,
  tenantWorkspaceSupportTier.priority,
  tenantWorkspaceSupportTier.enterprise,
] as const;

export const TenantWorkspaceSupportTierSchema = Schema.Literal(
  ...tenantWorkspaceSupportTiers,
);

export type TenantWorkspaceSupportTier = Schema.Schema.Type<
  typeof TenantWorkspaceSupportTierSchema
>;

export const TenantWorkspaceOverviewSchema = Schema.Struct({
  displayName: Schema.NonEmptyString,
  brandingState: TenantWorkspaceBrandingStateSchema,
  planTier: Schema.NonEmptyString,
  billingStatus: Schema.optional(BillingSubscriptionStatusSchema),
  legalHoldActive: Schema.Boolean,
});

export type TenantWorkspaceOverview = Schema.Schema.Type<
  typeof TenantWorkspaceOverviewSchema
>;

// ---------------------------------------------------------------------------
// Members section (top 20)
// ---------------------------------------------------------------------------

const TenantWorkspaceMemberRoleConstantSchema = Schema.Struct({
  owner: Schema.Literal("owner"),
  admin: Schema.Literal("admin"),
  member: Schema.Literal("member"),
  viewer: Schema.Literal("viewer"),
});

export const tenantWorkspaceMemberRole = Schema.validateSync(
  TenantWorkspaceMemberRoleConstantSchema,
)({
  owner: "owner",
  admin: "admin",
  member: "member",
  viewer: "viewer",
} satisfies Schema.Schema.Type<typeof TenantWorkspaceMemberRoleConstantSchema>);

export const tenantWorkspaceMemberRoles = [
  tenantWorkspaceMemberRole.owner,
  tenantWorkspaceMemberRole.admin,
  tenantWorkspaceMemberRole.member,
  tenantWorkspaceMemberRole.viewer,
] as const;

export const TenantWorkspaceMemberRoleSchema = Schema.Literal(
  ...tenantWorkspaceMemberRoles,
);

export type TenantWorkspaceMemberRole = Schema.Schema.Type<
  typeof TenantWorkspaceMemberRoleSchema
>;

export const TenantWorkspaceMemberSchema = Schema.Struct({
  subjectId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  role: TenantWorkspaceMemberRoleSchema,
  lastSeenAt: Schema.optional(IsoTimestampSchema),
});

export type TenantWorkspaceMember = Schema.Schema.Type<
  typeof TenantWorkspaceMemberSchema
>;

// ---------------------------------------------------------------------------
// Recent activity (top 20 audit events scoped to the tenant)
// ---------------------------------------------------------------------------

export const TenantWorkspaceRecentActivityEntrySchema =
  OperationsHomeRecentAuditEntrySchema;

export type TenantWorkspaceRecentActivityEntry = Schema.Schema.Type<
  typeof TenantWorkspaceRecentActivityEntrySchema
>;

// ---------------------------------------------------------------------------
// Open incidents (per-vendor, scoped to the tenant)
// ---------------------------------------------------------------------------

const TenantWorkspaceIncidentSeverityConstantSchema = Schema.Struct({
  info: Schema.Literal("info"),
  warning: Schema.Literal("warning"),
  critical: Schema.Literal("critical"),
});

export const tenantWorkspaceIncidentSeverity = Schema.validateSync(
  TenantWorkspaceIncidentSeverityConstantSchema,
)({
  info: "info",
  warning: "warning",
  critical: "critical",
} satisfies Schema.Schema.Type<
  typeof TenantWorkspaceIncidentSeverityConstantSchema
>);

export const tenantWorkspaceIncidentSeverities = [
  tenantWorkspaceIncidentSeverity.info,
  tenantWorkspaceIncidentSeverity.warning,
  tenantWorkspaceIncidentSeverity.critical,
] as const;

export const TenantWorkspaceIncidentSeveritySchema = Schema.Literal(
  ...tenantWorkspaceIncidentSeverities,
);

export type TenantWorkspaceIncidentSeverity = Schema.Schema.Type<
  typeof TenantWorkspaceIncidentSeveritySchema
>;

export const TenantWorkspaceOpenIncidentSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  vendor: Schema.NonEmptyString,
  severity: TenantWorkspaceIncidentSeveritySchema,
  title: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  openedAt: IsoTimestampSchema,
  deepLink: Schema.optional(Schema.NonEmptyString),
});

export type TenantWorkspaceOpenIncident = Schema.Schema.Type<
  typeof TenantWorkspaceOpenIncidentSchema
>;

// ---------------------------------------------------------------------------
// Usage spotlights + pending tenant approvals (reuse Operations Home shapes)
// ---------------------------------------------------------------------------

export const TenantWorkspaceUsageSpotlightSchema = OperationsHomeKpiSchema;

export type TenantWorkspaceUsageSpotlight = Schema.Schema.Type<
  typeof TenantWorkspaceUsageSpotlightSchema
>;

export const TenantWorkspacePendingApprovalSchema =
  OperationsHomePendingApprovalSchema;

export type TenantWorkspacePendingApproval = Schema.Schema.Type<
  typeof TenantWorkspacePendingApprovalSchema
>;

// ---------------------------------------------------------------------------
// Partial-failure surface
// ---------------------------------------------------------------------------

const TenantWorkspaceSnapshotSectionConstantSchema = Schema.Struct({
  tenantOverview: Schema.Literal("tenantOverview"),
  members: Schema.Literal("members"),
  recentActivity: Schema.Literal("recentActivity"),
  openIncidents: Schema.Literal("openIncidents"),
  usageSpotlights: Schema.Literal("usageSpotlights"),
  pendingTenantApprovals: Schema.Literal("pendingTenantApprovals"),
});

export const tenantWorkspaceSnapshotSection = Schema.validateSync(
  TenantWorkspaceSnapshotSectionConstantSchema,
)({
  tenantOverview: "tenantOverview",
  members: "members",
  recentActivity: "recentActivity",
  openIncidents: "openIncidents",
  usageSpotlights: "usageSpotlights",
  pendingTenantApprovals: "pendingTenantApprovals",
} satisfies Schema.Schema.Type<
  typeof TenantWorkspaceSnapshotSectionConstantSchema
>);

export const tenantWorkspaceSnapshotSections = [
  tenantWorkspaceSnapshotSection.tenantOverview,
  tenantWorkspaceSnapshotSection.members,
  tenantWorkspaceSnapshotSection.recentActivity,
  tenantWorkspaceSnapshotSection.openIncidents,
  tenantWorkspaceSnapshotSection.usageSpotlights,
  tenantWorkspaceSnapshotSection.pendingTenantApprovals,
] as const;

export const TenantWorkspaceSnapshotSectionSchema = Schema.Literal(
  ...tenantWorkspaceSnapshotSections,
);

export type TenantWorkspaceSnapshotSection = Schema.Schema.Type<
  typeof TenantWorkspaceSnapshotSectionSchema
>;

export const TenantWorkspacePartialFailureSchema = Schema.Struct({
  section: TenantWorkspaceSnapshotSectionSchema,
  reason: Schema.NonEmptyString,
});

export type TenantWorkspacePartialFailure = Schema.Schema.Type<
  typeof TenantWorkspacePartialFailureSchema
>;

// ---------------------------------------------------------------------------
// Snapshot envelope
// ---------------------------------------------------------------------------

export const TenantWorkspaceSnapshotSchema = Schema.Struct({
  generatedAt: IsoTimestampSchema,
  correlationId: Schema.NonEmptyString,
  tenant: TenantContextSchema,
  windowMinutes: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  tenantOverview: Schema.NullOr(TenantWorkspaceOverviewSchema),
  members: Schema.Array(TenantWorkspaceMemberSchema),
  recentActivity: Schema.Array(TenantWorkspaceRecentActivityEntrySchema),
  openIncidents: Schema.Array(TenantWorkspaceOpenIncidentSchema),
  usageSpotlights: Schema.Array(TenantWorkspaceUsageSpotlightSchema),
  pendingTenantApprovals: Schema.Array(TenantWorkspacePendingApprovalSchema),
  partialFailures: Schema.Array(TenantWorkspacePartialFailureSchema),
});

export type TenantWorkspaceSnapshot = Schema.Schema.Type<
  typeof TenantWorkspaceSnapshotSchema
>;
