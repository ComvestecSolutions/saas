/**
 * Admin saved-view contracts per admin-app implementation plan §9
 * item 2 and `specs/02-apps/admin-app/spec.md` (Per-user workspaces +
 * saved views).
 *
 * A saved view is a per-user, per-resource bookmark of the filter,
 * sort, column-set, and density that the operator wants to return to
 * on the matching list surface. The current slice is owner-locked to
 * per-user storage with no cross-user sharing; the
 * `ownerSubjectId` is the canonical isolation key and is enforced by
 * the platform service (see `CrossUserAccessDenied`).
 *
 * `serializedView` is a JSON-encoded representation of
 * `{ filters, sort, columns, density }`. The platform persists this
 * opaquely; per-resource shapes are validated downstream in the
 * admin app where the view is rehydrated.
 */
import { Schema } from "effect";

const AdminSavedViewResourceKindConstantSchema = Schema.Struct({
  tenants: Schema.Literal("tenants"),
  auditEvents: Schema.Literal("audit-events"),
  users: Schema.Literal("users"),
  keycloakEvents: Schema.Literal("keycloak-events"),
  billingInvoices: Schema.Literal("billing-invoices"),
  openmeterUsage: Schema.Literal("openmeter-usage"),
  featureFlags: Schema.Literal("feature-flags"),
  runtimeConfig: Schema.Literal("runtime-config"),
  webhookDeliveries: Schema.Literal("webhook-deliveries"),
  workflowRuns: Schema.Literal("workflow-runs"),
  notifications: Schema.Literal("notifications"),
  adminMembers: Schema.Literal("admin-members"),
});

export const adminSavedViewResourceKind = Schema.validateSync(
  AdminSavedViewResourceKindConstantSchema,
)({
  tenants: "tenants",
  auditEvents: "audit-events",
  users: "users",
  keycloakEvents: "keycloak-events",
  billingInvoices: "billing-invoices",
  openmeterUsage: "openmeter-usage",
  featureFlags: "feature-flags",
  runtimeConfig: "runtime-config",
  webhookDeliveries: "webhook-deliveries",
  workflowRuns: "workflow-runs",
  notifications: "notifications",
  adminMembers: "admin-members",
} satisfies Schema.Schema.Type<
  typeof AdminSavedViewResourceKindConstantSchema
>);

export const adminSavedViewResourceKinds = [
  adminSavedViewResourceKind.tenants,
  adminSavedViewResourceKind.auditEvents,
  adminSavedViewResourceKind.users,
  adminSavedViewResourceKind.keycloakEvents,
  adminSavedViewResourceKind.billingInvoices,
  adminSavedViewResourceKind.openmeterUsage,
  adminSavedViewResourceKind.featureFlags,
  adminSavedViewResourceKind.runtimeConfig,
  adminSavedViewResourceKind.webhookDeliveries,
  adminSavedViewResourceKind.workflowRuns,
  adminSavedViewResourceKind.notifications,
  adminSavedViewResourceKind.adminMembers,
] as const;

export const AdminSavedViewResourceKindSchema = Schema.Literal(
  ...adminSavedViewResourceKinds,
);

export type AdminSavedViewResourceKind = Schema.Schema.Type<
  typeof AdminSavedViewResourceKindSchema
>;

export const AdminSavedViewSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  resourceKind: AdminSavedViewResourceKindSchema,
  /**
   * JSON-encoded representation of `{ filters, sort, columns,
   * density }`. The platform treats this as an opaque blob; the
   * admin app owns rehydration.
   */
  serializedView: Schema.NonEmptyString,
  pinned: Schema.Boolean,
  createdAt: Schema.NonEmptyString,
  updatedAt: Schema.NonEmptyString,
  lastUsedAt: Schema.optional(Schema.NonEmptyString),
});

export type AdminSavedView = Schema.Schema.Type<typeof AdminSavedViewSchema>;
