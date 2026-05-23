import { Option, Schema } from "effect";
import {
  adminOperatorTestTokensAuditAction,
  adminOrganizationAuditAction,
  adminSavedViewsAuditAction,
  adminWorkspacesAuditAction,
  AuditActionSchema,
  manualBreakGlassAuditAction,
  openMeterUsageQueryAuditAction,
  operationsHomeAuditAction,
  operatorWebhookDeliveryAuditAction,
  polarRevenueProjectionAuditAction,
  tenantWorkspaceAuditAction,
  universalSearchAuditAction,
  vendorHealthAggregatorAuditAction,
  capabilitySnapshotV2AuditAction,
  runAsBannerStateAuditAction,
  workflowRunsAdminAuditAction,
  notificationCenterAdminAuditAction,
  keycloakUserReadAuditAction,
  polarCustomerReadAuditAction,
  openMeterMeterReadAuditAction,
  novuDeliveriesReadAuditAction,
  postalMailLogReadAuditAction,
  glitchTipIssuesReadAuditAction,
  openPanelEventsReadAuditAction,
  type AuditAction,
} from "../runtime/audit-actions";
import {
  platformModuleId,
  type PlatformModuleId,
} from "../module-registry/modules";
import { actorType } from "./actor-types";

/**
 * Typed catalog of canonical audit-log `reason` strings used by
 * first-party platform services when mutating shared
 * governance-critical state. Reasons live alongside their owning
 * domain (admin-organization here) and are referenced by service
 * code rather than spelled inline so that audit reviewers, runbooks,
 * and compliance evidence can pivot on a stable identifier.
 *
 * New reasons SHOULD be added to the matching domain section and
 * appended to the master `reasonCatalogIds` list so the
 * `ReasonCatalogIdSchema` literal union stays in sync.
 */
const ReasonCatalogIdConstantSchema = Schema.Struct({
  adminOrganizationInviteMember: Schema.Literal(
    "admin-organization.invite-member",
  ),
  adminOrganizationRedeemInvitation: Schema.Literal(
    "admin-organization.redeem-invitation",
  ),
  adminOrganizationChangeRole: Schema.Literal("admin-organization.change-role"),
  adminOrganizationRemoveMember: Schema.Literal(
    "admin-organization.remove-member",
  ),
  adminOrganizationBootstrapOwner: Schema.Literal(
    "admin-organization.bootstrap-owner",
  ),
  adminSavedViewCreate: Schema.Literal("admin-saved-views.create"),
  adminSavedViewUpdate: Schema.Literal("admin-saved-views.update"),
  adminSavedViewDelete: Schema.Literal("admin-saved-views.delete"),
  adminSavedViewPin: Schema.Literal("admin-saved-views.pin"),
  adminWorkspaceCreate: Schema.Literal("admin-workspaces.create"),
  adminWorkspaceUpdate: Schema.Literal("admin-workspaces.update"),
  adminWorkspaceDelete: Schema.Literal("admin-workspaces.delete"),
  adminWorkspaceReorder: Schema.Literal("admin-workspaces.reorder"),
  operationsHomeRead: Schema.Literal("operations-home.read"),
  tenantWorkspaceRead: Schema.Literal("tenant-workspace.read"),
  breakGlassIssue: Schema.Literal("manual-break-glass.issue"),
  breakGlassRelease: Schema.Literal("manual-break-glass.release"),
  operatorWebhookDeliveryReplay: Schema.Literal(
    "operator-webhook-delivery.replay",
  ),
  operatorWebhookDeliveryRetry: Schema.Literal(
    "operator-webhook-delivery.retry",
  ),
  operatorWebhookDeliveryCancel: Schema.Literal(
    "operator-webhook-delivery.cancel",
  ),
  polarRevenueProjectionRead: Schema.Literal("polar-revenue-projection.read"),
  polarRevenueProjectionBackfill: Schema.Literal(
    "polar-revenue-projection.backfill",
  ),
  openMeterUsageQueryRead: Schema.Literal("open-meter-usage-query.read"),
  openMeterUsageQueryBackfill: Schema.Literal(
    "open-meter-usage-query.backfill",
  ),
  vendorHealthAggregatorRead: Schema.Literal("vendor-health-aggregator.read"),
  keycloakUserRead: Schema.Literal("keycloak-user-read.read"),
  polarCustomerRead: Schema.Literal("polar-customer-read.read"),
  openMeterMeterRead: Schema.Literal("open-meter-meter-read.read"),
  novuDeliveriesRead: Schema.Literal("novu-deliveries-read.read"),
  postalMailLogRead: Schema.Literal("postal-mail-log-read.read"),
  glitchTipIssuesRead: Schema.Literal("glitchtip-issues-read.read"),
  openPanelEventsRead: Schema.Literal("openpanel-events-read.read"),
  universalSearchRead: Schema.Literal("universal-search.read"),
  universalSearchReindex: Schema.Literal("universal-search.reindex"),
  capabilitySnapshotV2Read: Schema.Literal("capability-snapshot-v2.read"),
  runAsBannerStateRelease: Schema.Literal("run-as-banner-state.release"),
  workflowRunsAdminReplay: Schema.Literal("workflow-runs-admin.replay"),
  workflowRunsAdminCancel: Schema.Literal("workflow-runs-admin.cancel"),
  notificationCenterAdminResend: Schema.Literal(
    "notification-center-admin.resend",
  ),
  adminOperatorTestTokensIssue: Schema.Literal(
    "admin-operator-test-tokens.issue",
  ),
  adminOperatorTestTokensRevoke: Schema.Literal(
    "admin-operator-test-tokens.revoke",
  ),
});

export const reasonCatalogId = Schema.validateSync(
  ReasonCatalogIdConstantSchema,
)({
  adminOrganizationInviteMember: "admin-organization.invite-member",
  adminOrganizationRedeemInvitation: "admin-organization.redeem-invitation",
  adminOrganizationChangeRole: "admin-organization.change-role",
  adminOrganizationRemoveMember: "admin-organization.remove-member",
  adminOrganizationBootstrapOwner: "admin-organization.bootstrap-owner",
  adminSavedViewCreate: "admin-saved-views.create",
  adminSavedViewUpdate: "admin-saved-views.update",
  adminSavedViewDelete: "admin-saved-views.delete",
  adminSavedViewPin: "admin-saved-views.pin",
  adminWorkspaceCreate: "admin-workspaces.create",
  adminWorkspaceUpdate: "admin-workspaces.update",
  adminWorkspaceDelete: "admin-workspaces.delete",
  adminWorkspaceReorder: "admin-workspaces.reorder",
  operationsHomeRead: "operations-home.read",
  tenantWorkspaceRead: "tenant-workspace.read",
  breakGlassIssue: "manual-break-glass.issue",
  breakGlassRelease: "manual-break-glass.release",
  operatorWebhookDeliveryReplay: "operator-webhook-delivery.replay",
  operatorWebhookDeliveryRetry: "operator-webhook-delivery.retry",
  operatorWebhookDeliveryCancel: "operator-webhook-delivery.cancel",
  polarRevenueProjectionRead: "polar-revenue-projection.read",
  polarRevenueProjectionBackfill: "polar-revenue-projection.backfill",
  openMeterUsageQueryRead: "open-meter-usage-query.read",
  openMeterUsageQueryBackfill: "open-meter-usage-query.backfill",
  vendorHealthAggregatorRead: "vendor-health-aggregator.read",
  keycloakUserRead: "keycloak-user-read.read",
  polarCustomerRead: "polar-customer-read.read",
  openMeterMeterRead: "open-meter-meter-read.read",
  novuDeliveriesRead: "novu-deliveries-read.read",
  postalMailLogRead: "postal-mail-log-read.read",
  glitchTipIssuesRead: "glitchtip-issues-read.read",
  openPanelEventsRead: "openpanel-events-read.read",
  universalSearchRead: "universal-search.read",
  universalSearchReindex: "universal-search.reindex",
  capabilitySnapshotV2Read: "capability-snapshot-v2.read",
  runAsBannerStateRelease: "run-as-banner-state.release",
  workflowRunsAdminReplay: "workflow-runs-admin.replay",
  workflowRunsAdminCancel: "workflow-runs-admin.cancel",
  notificationCenterAdminResend: "notification-center-admin.resend",
  adminOperatorTestTokensIssue: "admin-operator-test-tokens.issue",
  adminOperatorTestTokensRevoke: "admin-operator-test-tokens.revoke",
} satisfies Schema.Schema.Type<typeof ReasonCatalogIdConstantSchema>);

export const reasonCatalogIds = [
  reasonCatalogId.adminOrganizationInviteMember,
  reasonCatalogId.adminOrganizationRedeemInvitation,
  reasonCatalogId.adminOrganizationChangeRole,
  reasonCatalogId.adminOrganizationRemoveMember,
  reasonCatalogId.adminOrganizationBootstrapOwner,
  reasonCatalogId.adminSavedViewCreate,
  reasonCatalogId.adminSavedViewUpdate,
  reasonCatalogId.adminSavedViewDelete,
  reasonCatalogId.adminSavedViewPin,
  reasonCatalogId.adminWorkspaceCreate,
  reasonCatalogId.adminWorkspaceUpdate,
  reasonCatalogId.adminWorkspaceDelete,
  reasonCatalogId.adminWorkspaceReorder,
  reasonCatalogId.operationsHomeRead,
  reasonCatalogId.tenantWorkspaceRead,
  reasonCatalogId.breakGlassIssue,
  reasonCatalogId.breakGlassRelease,
  reasonCatalogId.operatorWebhookDeliveryReplay,
  reasonCatalogId.operatorWebhookDeliveryRetry,
  reasonCatalogId.operatorWebhookDeliveryCancel,
  reasonCatalogId.polarRevenueProjectionRead,
  reasonCatalogId.polarRevenueProjectionBackfill,
  reasonCatalogId.openMeterUsageQueryRead,
  reasonCatalogId.openMeterUsageQueryBackfill,
  reasonCatalogId.vendorHealthAggregatorRead,
  reasonCatalogId.keycloakUserRead,
  reasonCatalogId.polarCustomerRead,
  reasonCatalogId.openMeterMeterRead,
  reasonCatalogId.novuDeliveriesRead,
  reasonCatalogId.postalMailLogRead,
  reasonCatalogId.glitchTipIssuesRead,
  reasonCatalogId.openPanelEventsRead,
  reasonCatalogId.universalSearchRead,
  reasonCatalogId.universalSearchReindex,
  reasonCatalogId.capabilitySnapshotV2Read,
  reasonCatalogId.runAsBannerStateRelease,
  reasonCatalogId.workflowRunsAdminReplay,
  reasonCatalogId.workflowRunsAdminCancel,
  reasonCatalogId.notificationCenterAdminResend,
  reasonCatalogId.adminOperatorTestTokensIssue,
  reasonCatalogId.adminOperatorTestTokensRevoke,
] as const;

export const ReasonCatalogIdSchema = Schema.Literal(...reasonCatalogIds);

export type ReasonCatalogId = Schema.Schema.Type<typeof ReasonCatalogIdSchema>;

// ---------------------------------------------------------------------------
// Registry — per-reason metadata used by services to enforce reason-action
// alignment and high-risk attachment requirements (admin-app
// implementation-plan.md §9 item 12).
// ---------------------------------------------------------------------------

/**
 * The minimum operator class authorized to invoke a reason. Services MUST
 * still check their slice-specific authorization predicate; this is a
 * catalog-level floor (never a ceiling) so reviewers can grep the
 * registry for the privilege envelope of every high-risk action.
 */
const MinimumActorClassSchema = Schema.Literal(
  actorType.platformOperator,
  actorType.supportOperator,
);

export type ReasonMinimumActorClass = Schema.Schema.Type<
  typeof MinimumActorClassSchema
>;

export const ReasonCatalogEntrySchema = Schema.Struct({
  id: ReasonCatalogIdSchema,
  displayLabel: Schema.NonEmptyString,
  moduleId: Schema.Literal(
    ...(Object.values(platformModuleId) as ReadonlyArray<PlatformModuleId>),
  ),
  minimumActorClass: MinimumActorClassSchema,
  /**
   * `true` ONLY for high-risk surfaces per
   * `specs/02-apps/admin-app/implementation-plan.md` §9 item 12:
   * break-glass grants, tenant-data backfills, operator-webhook
   * replays, billing/Polar mutations, mass deletes, search reindex.
   * Services with `requiresAttachment: true` MUST also require a
   * non-empty `reasonAttachmentText` input alongside the reason id.
   */
  requiresAttachment: Schema.Boolean,
  auditActionsGated: Schema.NonEmptyArray(AuditActionSchema),
});

export type ReasonCatalogEntry = Schema.Schema.Type<
  typeof ReasonCatalogEntrySchema
>;

/**
 * Master registry. Reviewer invariants pinned by
 * `tests/contracts/reason-catalog.test.ts`:
 *
 *   - every `reasonCatalogId.*` constant appears exactly once
 *   - every `auditActionsGated[]` member exists in the master
 *     `AuditActionSchema` union
 *   - `requiresAttachment` is `true` exclusively for the documented
 *     high-risk surfaces (break-glass issue, billing/Polar/OpenMeter
 *     backfills, operator-webhook replays, universal-search reindex)
 */
export const reasonCatalogRegistry: ReadonlyArray<ReasonCatalogEntry> = [
  {
    id: reasonCatalogId.adminOrganizationInviteMember,
    displayLabel: "Admin org — invite member",
    moduleId: platformModuleId.adminOrganization,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminOrganizationAuditAction.memberInvited],
  },
  {
    id: reasonCatalogId.adminOrganizationRedeemInvitation,
    displayLabel: "Admin org — redeem invitation",
    moduleId: platformModuleId.adminOrganization,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminOrganizationAuditAction.invitationRedeemed],
  },
  {
    id: reasonCatalogId.adminOrganizationChangeRole,
    displayLabel: "Admin org — change member role",
    moduleId: platformModuleId.adminOrganization,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminOrganizationAuditAction.memberRoleChanged],
  },
  {
    id: reasonCatalogId.adminOrganizationRemoveMember,
    displayLabel: "Admin org — remove member",
    moduleId: platformModuleId.adminOrganization,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminOrganizationAuditAction.memberRemoved],
  },
  {
    id: reasonCatalogId.adminOrganizationBootstrapOwner,
    displayLabel: "Admin org — bootstrap owner",
    moduleId: platformModuleId.adminOrganization,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminOrganizationAuditAction.ownerSeeded],
  },
  {
    id: reasonCatalogId.adminSavedViewCreate,
    displayLabel: "Admin saved views — create",
    moduleId: platformModuleId.adminSavedViews,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminSavedViewsAuditAction.created],
  },
  {
    id: reasonCatalogId.adminSavedViewUpdate,
    displayLabel: "Admin saved views — update",
    moduleId: platformModuleId.adminSavedViews,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminSavedViewsAuditAction.updated],
  },
  {
    id: reasonCatalogId.adminSavedViewDelete,
    displayLabel: "Admin saved views — delete",
    moduleId: platformModuleId.adminSavedViews,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminSavedViewsAuditAction.deleted],
  },
  {
    id: reasonCatalogId.adminSavedViewPin,
    displayLabel: "Admin saved views — pin/unpin",
    moduleId: platformModuleId.adminSavedViews,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [
      adminSavedViewsAuditAction.pinned,
      adminSavedViewsAuditAction.unpinned,
    ],
  },
  {
    id: reasonCatalogId.adminWorkspaceCreate,
    displayLabel: "Admin workspaces — create",
    moduleId: platformModuleId.adminWorkspaces,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminWorkspacesAuditAction.create],
  },
  {
    id: reasonCatalogId.adminWorkspaceUpdate,
    displayLabel: "Admin workspaces — update",
    moduleId: platformModuleId.adminWorkspaces,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminWorkspacesAuditAction.update],
  },
  {
    id: reasonCatalogId.adminWorkspaceDelete,
    displayLabel: "Admin workspaces — delete",
    moduleId: platformModuleId.adminWorkspaces,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminWorkspacesAuditAction.delete],
  },
  {
    id: reasonCatalogId.adminWorkspaceReorder,
    displayLabel: "Admin workspaces — reorder",
    moduleId: platformModuleId.adminWorkspaces,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminWorkspacesAuditAction.reorder],
  },
  {
    id: reasonCatalogId.operationsHomeRead,
    displayLabel: "Operations home — read aggregate",
    moduleId: platformModuleId.operationsHome,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [operationsHomeAuditAction.read],
  },
  {
    id: reasonCatalogId.tenantWorkspaceRead,
    displayLabel: "Tenant workspace — read aggregate",
    moduleId: platformModuleId.tenantWorkspace,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [tenantWorkspaceAuditAction.read],
  },
  {
    id: reasonCatalogId.breakGlassIssue,
    displayLabel: "Manual break-glass — issue grant",
    moduleId: platformModuleId.manualBreakGlass,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [manualBreakGlassAuditAction.issue],
  },
  {
    id: reasonCatalogId.breakGlassRelease,
    displayLabel: "Manual break-glass — release grant",
    moduleId: platformModuleId.manualBreakGlass,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [manualBreakGlassAuditAction.release],
  },
  {
    id: reasonCatalogId.operatorWebhookDeliveryReplay,
    displayLabel: "Operator webhook delivery — replay",
    moduleId: platformModuleId.operatorWebhookDelivery,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [operatorWebhookDeliveryAuditAction.replayed],
  },
  {
    id: reasonCatalogId.operatorWebhookDeliveryRetry,
    displayLabel: "Operator webhook delivery — retry",
    moduleId: platformModuleId.operatorWebhookDelivery,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [operatorWebhookDeliveryAuditAction.retried],
  },
  {
    id: reasonCatalogId.operatorWebhookDeliveryCancel,
    displayLabel: "Operator webhook delivery — cancel",
    moduleId: platformModuleId.operatorWebhookDelivery,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [operatorWebhookDeliveryAuditAction.canceled],
  },
  {
    id: reasonCatalogId.polarRevenueProjectionRead,
    displayLabel: "Polar revenue projection — read snapshot",
    moduleId: platformModuleId.polarRevenueProjection,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [polarRevenueProjectionAuditAction.snapshotComputed],
  },
  {
    id: reasonCatalogId.polarRevenueProjectionBackfill,
    displayLabel: "Polar revenue projection — backfill",
    moduleId: platformModuleId.polarRevenueProjection,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [polarRevenueProjectionAuditAction.backfillRequested],
  },
  {
    id: reasonCatalogId.openMeterUsageQueryRead,
    displayLabel: "OpenMeter usage query — read",
    moduleId: platformModuleId.openMeterUsageQuery,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [openMeterUsageQueryAuditAction.queryExecuted],
  },
  {
    id: reasonCatalogId.openMeterUsageQueryBackfill,
    displayLabel: "OpenMeter usage query — backfill",
    moduleId: platformModuleId.openMeterUsageQuery,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [openMeterUsageQueryAuditAction.backfillRequested],
  },
  {
    id: reasonCatalogId.vendorHealthAggregatorRead,
    displayLabel: "Vendor health aggregator — read snapshot",
    moduleId: platformModuleId.vendorHealthAggregator,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [vendorHealthAggregatorAuditAction.snapshotComputed],
  },
  {
    id: reasonCatalogId.keycloakUserRead,
    displayLabel: "Keycloak user — read",
    moduleId: platformModuleId.keycloakUserRead,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [keycloakUserReadAuditAction.readPerformed],
  },
  {
    id: reasonCatalogId.polarCustomerRead,
    displayLabel: "Polar customer — read",
    moduleId: platformModuleId.polarCustomerRead,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [polarCustomerReadAuditAction.readPerformed],
  },
  {
    id: reasonCatalogId.openMeterMeterRead,
    displayLabel: "OpenMeter meter — read",
    moduleId: platformModuleId.openMeterMeterRead,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [openMeterMeterReadAuditAction.readPerformed],
  },
  {
    id: reasonCatalogId.novuDeliveriesRead,
    displayLabel: "Novu deliveries — read",
    moduleId: platformModuleId.novuDeliveriesRead,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [novuDeliveriesReadAuditAction.readPerformed],
  },
  {
    id: reasonCatalogId.postalMailLogRead,
    displayLabel: "Postal mail-log — read",
    moduleId: platformModuleId.postalMailLogRead,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [postalMailLogReadAuditAction.readPerformed],
  },
  {
    id: reasonCatalogId.glitchTipIssuesRead,
    displayLabel: "GlitchTip issues — read",
    moduleId: platformModuleId.glitchTipIssuesRead,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [glitchTipIssuesReadAuditAction.readPerformed],
  },
  {
    id: reasonCatalogId.openPanelEventsRead,
    displayLabel: "OpenPanel events — read",
    moduleId: platformModuleId.openPanelEventsRead,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [openPanelEventsReadAuditAction.readPerformed],
  },
  {
    id: reasonCatalogId.universalSearchRead,
    displayLabel: "Universal search — execute query",
    moduleId: platformModuleId.universalSearch,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [universalSearchAuditAction.queryExecuted],
  },
  {
    id: reasonCatalogId.universalSearchReindex,
    displayLabel: "Universal search — reindex",
    moduleId: platformModuleId.universalSearch,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [universalSearchAuditAction.reindexRequested],
  },
  {
    id: reasonCatalogId.capabilitySnapshotV2Read,
    displayLabel: "Capability snapshot v2 — derive snapshot",
    moduleId: platformModuleId.capabilitySnapshotV2,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: false,
    auditActionsGated: [
      capabilitySnapshotV2AuditAction.snapshotDerived,
      capabilitySnapshotV2AuditAction.cacheInvalidated,
    ],
  },
  {
    id: reasonCatalogId.runAsBannerStateRelease,
    displayLabel: "Run-as banner state — release grant",
    moduleId: platformModuleId.runAsBannerState,
    minimumActorClass: actorType.supportOperator,
    requiresAttachment: true,
    auditActionsGated: [runAsBannerStateAuditAction.released],
  },
  {
    id: reasonCatalogId.workflowRunsAdminReplay,
    displayLabel: "Workflow runs admin — replay run",
    moduleId: platformModuleId.workflowRunsAdmin,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [workflowRunsAdminAuditAction.replayed],
  },
  {
    id: reasonCatalogId.workflowRunsAdminCancel,
    displayLabel: "Workflow runs admin — cancel run",
    moduleId: platformModuleId.workflowRunsAdmin,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [workflowRunsAdminAuditAction.canceled],
  },
  {
    id: reasonCatalogId.notificationCenterAdminResend,
    displayLabel: "Notification center admin — resend notification",
    moduleId: platformModuleId.notificationCenterAdmin,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [notificationCenterAdminAuditAction.resent],
  },
  {
    id: reasonCatalogId.adminOperatorTestTokensIssue,
    displayLabel: "Admin operator test tokens — issue token",
    moduleId: platformModuleId.adminOperatorTestTokens,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: true,
    auditActionsGated: [adminOperatorTestTokensAuditAction.issued],
  },
  {
    id: reasonCatalogId.adminOperatorTestTokensRevoke,
    displayLabel: "Admin operator test tokens — revoke token",
    moduleId: platformModuleId.adminOperatorTestTokens,
    minimumActorClass: actorType.platformOperator,
    requiresAttachment: false,
    auditActionsGated: [adminOperatorTestTokensAuditAction.revoked],
  },
];

const reasonCatalogIndex: ReadonlyMap<ReasonCatalogId, ReasonCatalogEntry> =
  new Map(reasonCatalogRegistry.map((entry) => [entry.id, entry]));

/**
 * Returns `Option.some(entry)` when `id` is a known reason and
 * `Option.none()` otherwise. Services that already decoded against
 * `ReasonCatalogIdSchema` are guaranteed `Option.some(...)`.
 */
export const getReasonCatalogEntry = (
  id: ReasonCatalogId,
): Option.Option<ReasonCatalogEntry> => {
  const found = reasonCatalogIndex.get(id);
  return found === undefined ? Option.none() : Option.some(found);
};

/**
 * Returns `true` when the catalog entry for `reasonId` gates the
 * supplied audit `action`. Services use this AFTER decoding the
 * reason id to guarantee operators picked a reason that actually
 * authorizes the action they are performing — preventing
 * reason-shopping where, e.g., an `admin-organization.invite-member`
 * reason is misused on a break-glass issue.
 */
export const validateReasonForAction = (
  reasonId: ReasonCatalogId,
  action: AuditAction,
): boolean => {
  const entry = reasonCatalogIndex.get(reasonId);
  if (entry === undefined) {
    return false;
  }
  return entry.auditActionsGated.some((gated) => gated === action);
};
