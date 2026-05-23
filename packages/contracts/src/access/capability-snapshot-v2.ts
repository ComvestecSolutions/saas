/**
 * Capability snapshot v2 contracts (admin-app implementation
 * plan §9 item 13). The Operator Desk consumes ONE
 * snapshot envelope per authenticated request: who the actor is,
 * what platform scopes + permissions they hold, what bucketed
 * admin-org role they sit on, the derived per-key Operator Desk
 * navigation visibility map, and the list of high-risk reason
 * affordances pulled directly from the shared reason-catalog
 * registry. Replaces the per-key role math the admin app used to
 * perform client-side (ADR-022 §Capability resolution +
 * ADR-023 §Operator Desk capability join).
 *
 * Owner-locked design (enforced in the platform service at
 * `packages/platform/src/services/access/capability-snapshot-v2-service.ts`):
 *
 *   - **Bucketed admin-org role**: the 7 canonical ADR-023
 *     `AdminMemberRole` values fold into a 4-bucket high-level
 *     `adminOrgRole` (`owner | admin | viewer | none`) so the
 *     navigation map stays stable across role-tier renames and
 *     the admin app never has to spread role conditionals on
 *     its own. `none` = no admin-org membership for the actor.
 *   - **Pure helpers**: `deriveNavigationMapForActor(role, scopes,
 *     permissions)` and `deriveHighRiskAffordances()` are
 *     side-effect-free; the service composes them above the
 *     `AdminOrganizationService` join.
 *   - **No localhost / synthesized defaults**: snapshot inputs
 *     decode at the service boundary; the env-bound runtime
 *     loader decodes its bounded-cache config keys with NO local
 *     fallbacks.
 *
 * Naming: every `adminNavigationKey.*` constant maps 1:1 to one
 * Operator Desk surface listed in
 * `specs/02-apps/admin-app/spec.md`. New surfaces MUST land here
 * first so the navigation map stays the single source of truth.
 */
import { Schema } from "effect";
import { ActorTypeSchema } from "./actor-types";
import {
  AdminMemberRoleSchema,
  adminMemberRole,
  type AdminMemberRole,
} from "./admin-organization";
import { PermissionScopeSchema } from "./permission-scopes";
import { PlatformScopeSchema } from "./platform-scopes";
import {
  reasonCatalogRegistry,
  type ReasonCatalogEntry,
  ReasonCatalogIdSchema,
} from "./reason-catalog";
import { IsoTimestampSchema } from "../runtime/timestamps";

// ---------------------------------------------------------------------------
// Admin-org role bucket (ADR-023 7-role -> 4-bucket fold)
// ---------------------------------------------------------------------------

const AdminOrgRoleConstantSchema = Schema.Struct({
  owner: Schema.Literal("owner"),
  admin: Schema.Literal("admin"),
  viewer: Schema.Literal("viewer"),
  none: Schema.Literal("none"),
});

export const adminOrgRole = Schema.validateSync(AdminOrgRoleConstantSchema)({
  owner: "owner",
  admin: "admin",
  viewer: "viewer",
  none: "none",
} satisfies Schema.Schema.Type<typeof AdminOrgRoleConstantSchema>);

export const adminOrgRoles = [
  adminOrgRole.owner,
  adminOrgRole.admin,
  adminOrgRole.viewer,
  adminOrgRole.none,
] as const;

export const AdminOrgRoleSchema = Schema.Literal(...adminOrgRoles);

export type AdminOrgRole = Schema.Schema.Type<typeof AdminOrgRoleSchema>;

/**
 * Pure projection of the 7 ADR-023 admin-member roles into the
 * 4-bucket high-level navigation envelope. Reviewer invariants
 * pinned by `tests/contracts/capability-snapshot-v2.test.ts`:
 *
 *   - `admin-owner`              -> `owner`
 *   - `admin-admin`              -> `admin`
 *   - `admin-operator`           -> `admin`
 *   - `support-reviewer`         -> `viewer`
 *   - `billing-only`             -> `viewer`
 *   - `compliance`               -> `viewer`
 *   - `viewer`                   -> `viewer`
 *   - `undefined` (no membership)-> `none`
 */
export const bucketAdminMemberRole = (
  role: AdminMemberRole | undefined,
): AdminOrgRole => {
  if (role === undefined) {
    return adminOrgRole.none;
  }
  switch (role) {
    case adminMemberRole.adminOwner:
      return adminOrgRole.owner;
    case adminMemberRole.adminAdmin:
    case adminMemberRole.adminOperator:
      return adminOrgRole.admin;
    case adminMemberRole.supportReviewer:
    case adminMemberRole.billingOnly:
    case adminMemberRole.compliance:
    case adminMemberRole.viewer:
      return adminOrgRole.viewer;
  }
};

// ---------------------------------------------------------------------------
// Operator Desk navigation keys (one per surface in admin-app spec.md)
// ---------------------------------------------------------------------------

const AdminNavigationKeyConstantSchema = Schema.Struct({
  operationsHome: Schema.Literal("operations-home"),
  tenantList: Schema.Literal("tenant-list"),
  tenantWorkspace: Schema.Literal("tenant-workspace"),
  auditLog: Schema.Literal("audit-log"),
  webhooks: Schema.Literal("webhooks"),
  billingConsole: Schema.Literal("billing-console"),
  vendorHealth: Schema.Literal("vendor-health"),
  universalSearch: Schema.Literal("universal-search"),
  breakGlassConsole: Schema.Literal("break-glass-console"),
  settings: Schema.Literal("settings"),
});

export const adminNavigationKey = Schema.validateSync(
  AdminNavigationKeyConstantSchema,
)({
  operationsHome: "operations-home",
  tenantList: "tenant-list",
  tenantWorkspace: "tenant-workspace",
  auditLog: "audit-log",
  webhooks: "webhooks",
  billingConsole: "billing-console",
  vendorHealth: "vendor-health",
  universalSearch: "universal-search",
  breakGlassConsole: "break-glass-console",
  settings: "settings",
} satisfies Schema.Schema.Type<typeof AdminNavigationKeyConstantSchema>);

export const adminNavigationKeys = [
  adminNavigationKey.operationsHome,
  adminNavigationKey.tenantList,
  adminNavigationKey.tenantWorkspace,
  adminNavigationKey.auditLog,
  adminNavigationKey.webhooks,
  adminNavigationKey.billingConsole,
  adminNavigationKey.vendorHealth,
  adminNavigationKey.universalSearch,
  adminNavigationKey.breakGlassConsole,
  adminNavigationKey.settings,
] as const;

export const AdminNavigationKeySchema = Schema.Literal(...adminNavigationKeys);

export type AdminNavigationKey = Schema.Schema.Type<
  typeof AdminNavigationKeySchema
>;

// ---------------------------------------------------------------------------
// Snapshot envelope
// ---------------------------------------------------------------------------

export const NavigationMapEntrySchema = Schema.Struct({
  key: AdminNavigationKeySchema,
  visible: Schema.Boolean,
  requiresStepUp: Schema.Boolean,
});

export type NavigationMapEntry = Schema.Schema.Type<
  typeof NavigationMapEntrySchema
>;

export const HighRiskAffordanceSchema = Schema.Struct({
  reasonId: ReasonCatalogIdSchema,
  requiresAttachment: Schema.Boolean,
  requiresStepUp: Schema.Boolean,
});

export type HighRiskAffordance = Schema.Schema.Type<
  typeof HighRiskAffordanceSchema
>;

export const CapabilitySnapshotV2Schema = Schema.Struct({
  actorId: Schema.optional(Schema.NonEmptyString),
  actorType: ActorTypeSchema,
  scopes: Schema.Array(PlatformScopeSchema),
  permissions: Schema.Array(PermissionScopeSchema),
  adminOrgRole: AdminOrgRoleSchema,
  navigationMap: Schema.Array(NavigationMapEntrySchema),
  highRiskAffordances: Schema.Array(HighRiskAffordanceSchema),
  derivedAt: IsoTimestampSchema,
  correlationId: Schema.NonEmptyString,
});

export type CapabilitySnapshotV2 = Schema.Schema.Type<
  typeof CapabilitySnapshotV2Schema
>;

// ---------------------------------------------------------------------------
// Service input (request-context-only — actor and scopes are derived
// at the service boundary, not supplied by the caller)
// ---------------------------------------------------------------------------

import { RequestContextSchema } from "./request-context";

export const CapabilitySnapshotV2InputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
});

export type CapabilitySnapshotV2Input = Schema.Schema.Type<
  typeof CapabilitySnapshotV2InputSchema
>;

// ---------------------------------------------------------------------------
// Pure derivation helpers (exported so the platform service composes
// them above the AdminOrganizationService role join, and so the unit
// matrix in `tests/contracts/capability-snapshot-v2.test.ts` can pin
// the per-role x scope visibility table)
// ---------------------------------------------------------------------------

import { permissionScope, type PermissionScope } from "./permission-scopes";
import { platformScope, type PlatformScope } from "./platform-scopes";

/**
 * Derives the per-key Operator Desk navigation map for an actor.
 *
 * Owner-locked rules:
 *
 *   - `adminOrgRole === "none"` -> EVERY key `visible: false` (the
 *     actor has no admin-org membership; the operator desk shell
 *     hides itself entirely).
 *   - `adminOrgRole === "viewer"` -> read-surfaces visible
 *     (`operationsHome`, `tenantList`, `tenantWorkspace`, `auditLog`,
 *     `vendorHealth`, `universalSearch`, `settings`); mutate /
 *     high-risk surfaces hidden (`webhooks`, `billingConsole`,
 *     `breakGlassConsole`).
 *   - `adminOrgRole === "admin"` -> everything visible except
 *     `breakGlassConsole`, which still requires step-up.
 *   - `adminOrgRole === "owner"` -> everything visible.
 *   - `breakGlassConsole` ALWAYS carries `requiresStepUp: true` so
 *     the shell forces the step-up gate even if the actor is owner.
 *   - `billingConsole` carries `requiresStepUp: true` for `admin`
 *     and `false` for `owner`.
 *
 * Scopes / permissions are accepted to keep the helper future-proof:
 * a key MAY also be hidden if the actor lacks the matching
 * permission scope even when the role would normally allow it.
 */
export const deriveNavigationMapForActor = (
  role: AdminOrgRole,
  scopes: ReadonlyArray<PlatformScope>,
  permissions: ReadonlyArray<PermissionScope>,
): ReadonlyArray<NavigationMapEntry> => {
  if (role === adminOrgRole.none) {
    return adminNavigationKeys.map((key) => ({
      key,
      visible: false,
      requiresStepUp: false,
    }));
  }

  const hasPlatformScope = scopes.includes(platformScope.platform);
  const has = (p: PermissionScope) => permissions.includes(p);

  const isOwner = role === adminOrgRole.owner;
  const isAdmin = isOwner || role === adminOrgRole.admin;

  return adminNavigationKeys.map((key): NavigationMapEntry => {
    switch (key) {
      case adminNavigationKey.operationsHome:
        return {
          key,
          visible: hasPlatformScope && has(permissionScope.operationsHomeRead),
          requiresStepUp: false,
        };
      case adminNavigationKey.tenantList:
      case adminNavigationKey.tenantWorkspace:
        return {
          key,
          visible: hasPlatformScope && has(permissionScope.tenantRead),
          requiresStepUp: false,
        };
      case adminNavigationKey.auditLog:
        return {
          key,
          visible: hasPlatformScope && has(permissionScope.auditRead),
          requiresStepUp: false,
        };
      case adminNavigationKey.webhooks:
        return {
          key,
          visible: isAdmin && has(permissionScope.webhookManage),
          requiresStepUp: false,
        };
      case adminNavigationKey.billingConsole:
        return {
          key,
          visible: isAdmin && has(permissionScope.billingRead),
          requiresStepUp: !isOwner,
        };
      case adminNavigationKey.vendorHealth:
        return {
          key,
          visible:
            hasPlatformScope && has(permissionScope.vendorHealthAggregatorRead),
          requiresStepUp: false,
        };
      case adminNavigationKey.universalSearch:
        return {
          key,
          visible: hasPlatformScope && has(permissionScope.universalSearchRead),
          requiresStepUp: false,
        };
      case adminNavigationKey.breakGlassConsole:
        return {
          key,
          visible: isAdmin && has(permissionScope.manualBreakGlassIssue),
          requiresStepUp: true,
        };
      case adminNavigationKey.settings:
        return {
          key,
          visible: true,
          requiresStepUp: false,
        };
    }
  });
};

/**
 * Derives the list of high-risk affordances directly from the
 * shared {@link reasonCatalogRegistry}. Every entry with
 * `requiresAttachment: true` is treated as high-risk and
 * additionally flagged `requiresStepUp: true` so the operator
 * shell renders both gates consistently. The full registry stays
 * authoritative; this helper is a pure projection.
 */
export const deriveHighRiskAffordances = (
  registry: ReadonlyArray<ReasonCatalogEntry> = reasonCatalogRegistry,
): ReadonlyArray<HighRiskAffordance> =>
  registry
    .filter((entry) => entry.requiresAttachment)
    .map((entry) => ({
      reasonId: entry.id,
      requiresAttachment: true,
      requiresStepUp: true,
    }));
