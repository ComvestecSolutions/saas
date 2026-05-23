/**
 * Capability snapshot v2 module surface (admin-app implementation
 * plan §9 item 13). Re-exports the canonical contract types and
 * pure helpers so downstream platform + app code can import from
 * `@comvestec/modules` without reaching across packages.
 *
 * The module has no internal logic of its own: the
 * admin-org role join, request-context-driven scope/permission
 * derivation, bounded snapshot cache, field-security pass over
 * navigation-map labels, and audit emission all live at the
 * platform service boundary in
 * `packages/platform/src/services/access/capability-snapshot-v2-service.ts`.
 */
export {
  adminNavigationKey,
  adminNavigationKeys,
  AdminNavigationKeySchema,
  adminOrgRole,
  adminOrgRoles,
  AdminOrgRoleSchema,
  bucketAdminMemberRole,
  CapabilitySnapshotV2InputSchema,
  CapabilitySnapshotV2Schema,
  deriveHighRiskAffordances,
  deriveNavigationMapForActor,
  HighRiskAffordanceSchema,
  NavigationMapEntrySchema,
} from "@comvestec/contracts";

export type {
  AdminNavigationKey,
  AdminOrgRole,
  CapabilitySnapshotV2,
  CapabilitySnapshotV2Input,
  HighRiskAffordance,
  NavigationMapEntry,
} from "@comvestec/contracts";
