/**
 * Manual break-glass contracts per admin-app implementation plan
 * §9 item 5 and `specs/02-apps/admin-app/spec.md` (Break-glass +
 * RunAsBanner).
 *
 * The owner-locked invariants this surface enforces:
 *
 *   - every grant requires a `reasonCatalogId` from the central
 *     reason-catalog AND an operator-supplied `reasonNarrative`
 *   - `expiresAt` MUST be in the future at issue time AND MUST be
 *     bounded by a config-supplied `maxTtlMinutes` ceiling
 *   - release MUST be possible at any moment by the platform
 *     operator or the `grantedTo` subject themselves
 *   - every mutation MUST be audit-logged
 *
 * Naming note: the contract types are prefixed `Manual…` to keep a
 * clear separation from the in-memory `BreakGlassGrant` value
 * surfaced by `@comvestec/modules/governance/support-operations`,
 * which represents the ephemeral support-impersonation
 * break-glass-flavored grant rather than a persisted manual record.
 *
 * The persisted record powers the `RunAsBanner` desk surface and
 * the auto-expiry sweep helper. Status lifecycle:
 *
 *   active → released (manual)
 *   active → expired  (auto-sweep past `expiresAt`)
 */
import { Schema } from "effect";
import { PlatformScopeSchema } from "./platform-scopes";

const ManualBreakGlassGrantStatusConstantSchema = Schema.Struct({
  active: Schema.Literal("active"),
  released: Schema.Literal("released"),
  expired: Schema.Literal("expired"),
});

export const manualBreakGlassGrantStatus = Schema.validateSync(
  ManualBreakGlassGrantStatusConstantSchema,
)({
  active: "active",
  released: "released",
  expired: "expired",
} satisfies Schema.Schema.Type<
  typeof ManualBreakGlassGrantStatusConstantSchema
>);

export const manualBreakGlassGrantStatuses = [
  manualBreakGlassGrantStatus.active,
  manualBreakGlassGrantStatus.released,
  manualBreakGlassGrantStatus.expired,
] as const;

export const ManualBreakGlassGrantStatusSchema = Schema.Literal(
  ...manualBreakGlassGrantStatuses,
);

export type ManualBreakGlassGrantStatus = Schema.Schema.Type<
  typeof ManualBreakGlassGrantStatusSchema
>;

export const ManualBreakGlassTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type ManualBreakGlassTargetTenant = Schema.Schema.Type<
  typeof ManualBreakGlassTargetTenantSchema
>;

/**
 * Canonical persisted grant. The `reasonCatalogId` is kept as
 * `NonEmptyString` at the contract layer to avoid a circular
 * dependency with `reason-catalog.ts`; the platform service
 * validates the value against `ReasonCatalogIdSchema` before
 * accepting an issue/release call so the typed catalog check stays
 * authoritative.
 */
export const ManualBreakGlassGrantSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  grantedTo: Schema.NonEmptyString,
  grantedBy: Schema.NonEmptyString,
  targetTenant: ManualBreakGlassTargetTenantSchema,
  reasonCatalogId: Schema.NonEmptyString,
  reasonNarrative: Schema.NonEmptyString,
  issuedAt: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
  status: ManualBreakGlassGrantStatusSchema,
  releasedAt: Schema.optional(Schema.NonEmptyString),
  releasedBy: Schema.optional(Schema.NonEmptyString),
  releaseReasonCatalogId: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.NonEmptyString,
});

export type ManualBreakGlassGrant = Schema.Schema.Type<
  typeof ManualBreakGlassGrantSchema
>;

export const ManualBreakGlassGrantInputSchema = Schema.Struct({
  grantedTo: Schema.NonEmptyString,
  targetTenant: ManualBreakGlassTargetTenantSchema,
  reasonCatalogId: Schema.NonEmptyString,
  reasonNarrative: Schema.NonEmptyString,
  /**
   * High-risk attachment text required by the reason-catalog registry
   * entry for `reasonCatalogId.breakGlassIssue` (`requiresAttachment:
   * true`). Operators MUST link a runbook URL, ticket id, or
   * incident reference so the audit row records the originating
   * compliance evidence.
   */
  reasonAttachmentText: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
});

export type ManualBreakGlassGrantInput = Schema.Schema.Type<
  typeof ManualBreakGlassGrantInputSchema
>;

export const ManualBreakGlassReleaseInputSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  releaseReasonCatalogId: Schema.NonEmptyString,
});

export type ManualBreakGlassReleaseInput = Schema.Schema.Type<
  typeof ManualBreakGlassReleaseInputSchema
>;
