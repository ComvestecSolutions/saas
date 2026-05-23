/**
 * Polar revenue projection contracts per admin-app implementation
 * plan §9 item 7 (read-only, admin-only) and
 * `specs/02-apps/admin-app/spec.md` (billing console surface).
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service, NOT in the persistence layer):
 *
 *   - **Read-only operator console**: the only mutation surface
 *     exposed to callers is `backfillRequested` — an explicit
 *     operator intent to re-run the snapshot computation against
 *     Polar. The persisted snapshot itself is computed by the
 *     service (which calls the Polar adapter) and is never
 *     directly mutated through the HTTP surface.
 *   - **One snapshot per `(tenantScopeId, billingPeriodStart)`**:
 *     the persistence layer enforces the unique composite via a
 *     covering index so the latest-per-tenant query is O(1).
 *   - **Authz**: snapshot read requires
 *     `permissionScope.polarRevenueProjectionRead`; backfill
 *     requires `permissionScope.polarRevenueProjectionBackfill`
 *     AND `platform-operator` actor type (admin-only).
 *   - **Audit emission**: every snapshot compute emits
 *     `polarRevenueProjectionAuditAction.snapshotComputed`; every
 *     operator-initiated backfill emits
 *     `polarRevenueProjectionAuditAction.backfillRequested`
 *     keyed by `reasonCatalogId.polarRevenueProjectionBackfill`.
 *
 * Naming note: the Polar adapter
 * (`packages/platform/src/adapters/features-billing/polar.ts`)
 * owns the wire-level catalog/checkout/webhook surface. This
 * module is a derived analytics view over Polar's billing data
 * and does not duplicate any of those primitives.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant (mirrors the rest of the platform tenant addressing)
// ---------------------------------------------------------------------------

export const PolarRevenueProjectionTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type PolarRevenueProjectionTargetTenant = Schema.Schema.Type<
  typeof PolarRevenueProjectionTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Monetary amount — explicit currency + integer minor units so the
// derived analytics view never carries floats across the wire.
// ---------------------------------------------------------------------------

export const PolarRevenueProjectionMoneySchema = Schema.Struct({
  currency: Schema.NonEmptyString.pipe(Schema.pattern(/^[A-Z]{3}$/)),
  amountMinorUnits: Schema.Number.pipe(Schema.int()),
});

export type PolarRevenueProjectionMoney = Schema.Schema.Type<
  typeof PolarRevenueProjectionMoneySchema
>;

// ---------------------------------------------------------------------------
// Snapshot
//
// `subscriptionMrr` is the active recurring monthly revenue at the
// end of the billing period. `churnRate` is the fraction of revenue
// lost vs the previous period and is bounded to [0, 1]. `expansion`
// vs `contraction` are reported as separate monetary amounts so the
// admin console can render both directions explicitly instead of
// inferring a signed delta. `projectedNextPeriodRevenue` is the
// service-computed projection for the next billing period derived
// from MRR + expansion - contraction.
// ---------------------------------------------------------------------------

export const PolarRevenueProjectionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  tenant: PolarRevenueProjectionTargetTenantSchema,
  billingPeriodStart: IsoTimestampSchema,
  billingPeriodEnd: IsoTimestampSchema,
  subscriptionMrr: PolarRevenueProjectionMoneySchema,
  churnRate: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1),
  ),
  expansion: PolarRevenueProjectionMoneySchema,
  contraction: PolarRevenueProjectionMoneySchema,
  projectedNextPeriodRevenue: PolarRevenueProjectionMoneySchema,
  activeSubscriptionCount: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
  ),
  sourcePolarAccountId: Schema.NonEmptyString,
  computedAt: IsoTimestampSchema,
  correlationId: Schema.NonEmptyString,
});

export type PolarRevenueProjection = Schema.Schema.Type<
  typeof PolarRevenueProjectionSchema
>;

export const PolarRevenueProjectionListSchema = Schema.Array(
  PolarRevenueProjectionSchema,
);

export type PolarRevenueProjectionList = Schema.Schema.Type<
  typeof PolarRevenueProjectionListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Operator-initiated backfill intent. The service enqueues a
 * recomputation for the requested `(tenantScopeId,
 * billingPeriodStart)` and emits a backfill audit event keyed by
 * the typed `reasonCatalogId.polarRevenueProjectionBackfill`.
 *
 * `billingPeriodStart` is optional: when omitted the service
 * backfills the current billing period for the targeted tenant.
 */
export const PolarRevenueProjectionBackfillInputSchema = Schema.Struct({
  tenant: PolarRevenueProjectionTargetTenantSchema,
  billingPeriodStart: Schema.optional(IsoTimestampSchema),
  reasonCatalogId: Schema.NonEmptyString,
  reasonNarrative: Schema.NonEmptyString,
  /**
   * High-risk attachment text required by the reason-catalog registry
   * entry for `reasonCatalogId.polarRevenueProjectionBackfill`
   * (`requiresAttachment: true`). Operators MUST link a runbook URL,
   * ticket id, or incident reference so the audit row records the
   * originating compliance evidence. Whitespace-only values are
   * rejected at the service boundary with
   * `PolarRevenueProjectionReasonAttachmentRequired`.
   */
  reasonAttachmentText: Schema.NonEmptyString,
});

export type PolarRevenueProjectionBackfillInput = Schema.Schema.Type<
  typeof PolarRevenueProjectionBackfillInputSchema
>;

export const PolarRevenueProjectionQueryInputSchema = Schema.Struct({
  tenant: PolarRevenueProjectionTargetTenantSchema,
  billingPeriodStart: Schema.optional(IsoTimestampSchema),
});

export type PolarRevenueProjectionQueryInput = Schema.Schema.Type<
  typeof PolarRevenueProjectionQueryInputSchema
>;

export const PolarRevenueProjectionListFilterSchema = Schema.Struct({
  tenant: Schema.optional(PolarRevenueProjectionTargetTenantSchema),
  limit: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThan(0),
      Schema.lessThanOrEqualTo(500),
    ),
  ),
});

export type PolarRevenueProjectionListFilter = Schema.Schema.Type<
  typeof PolarRevenueProjectionListFilterSchema
>;
