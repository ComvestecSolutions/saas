/**
 * Polar customer read contracts per admin-app implementation plan
 * §9 item 10 (per-vendor read helpers — batch A vendor #2).
 *
 * Read-only operator console surface that gives the admin app a
 * typed, audited, redaction-aware view over Polar's customer
 * record without giving operators a mutation surface against the
 * upstream billing provider. The slice mirrors the canonical
 * keycloak-user-read template EXACTLY: there is NO persistence —
 * the read path always recomputes against the live Polar API and
 * is fronted by an in-memory snapshot cache bounded by
 * `cacheMaxSize` with `snapshotCacheTtlSeconds` freshness.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service):
 *
 *   - **Read-only surface**: only `getById`, `listByEmail`,
 *     `listByExternalId` are exposed. There is no mutation surface.
 *   - **Operator-only authz**: read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     `PolarCustomerReadUnauthorized`.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.polarCustomerRead`.
 *   - **Audit emission**: every successful read appends ONE
 *     `polarCustomerReadAuditAction.readPerformed` event keyed by
 *     `platformModuleId.polarCustomerRead`.
 *   - **Field classification**: `email`, `name`, `billingAddress`
 *     → `tenant-confidential`; `customerId`, `externalId`,
 *     `createdAt` → `internal`; `totalSpendCents`,
 *     `subscriptionCount` → `derived-analytics`.
 *
 * Naming note: distinct from the existing
 * `polar-revenue-projection` slice (which owns the aggregated
 * revenue projection snapshot). This module is a read-only
 * operator-console projection over the customer record and reuses
 * `platformAdapterServiceName.polar` end-to-end — NO new adapter
 * literal is introduced.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant (mirrors the rest of the platform tenant addressing)
// ---------------------------------------------------------------------------

export const PolarCustomerReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type PolarCustomerReadTargetTenant = Schema.Schema.Type<
  typeof PolarCustomerReadTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Per-customer summary projection
// ---------------------------------------------------------------------------

export const PolarCustomerBillingAddressSchema = Schema.Struct({
  line1: Schema.optional(Schema.NonEmptyString),
  line2: Schema.optional(Schema.NonEmptyString),
  city: Schema.optional(Schema.NonEmptyString),
  state: Schema.optional(Schema.NonEmptyString),
  postalCode: Schema.optional(Schema.NonEmptyString),
  country: Schema.optional(Schema.NonEmptyString),
});

export type PolarCustomerBillingAddress = Schema.Schema.Type<
  typeof PolarCustomerBillingAddressSchema
>;

export const PolarCustomerSummarySchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  externalId: Schema.optional(Schema.NonEmptyString),
  email: Schema.NonEmptyString,
  name: Schema.optional(Schema.NonEmptyString),
  billingAddress: Schema.optional(PolarCustomerBillingAddressSchema),
  createdAt: IsoTimestampSchema,
  totalSpendCents: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
  ),
  subscriptionCount: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
  ),
});

export type PolarCustomerSummary = Schema.Schema.Type<
  typeof PolarCustomerSummarySchema
>;

export const PolarCustomerSummaryListSchema = Schema.Array(
  PolarCustomerSummarySchema,
);

export type PolarCustomerSummaryList = Schema.Schema.Type<
  typeof PolarCustomerSummaryListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const PolarCustomerReadLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(200),
);

export const PolarCustomerGetByIdInputSchema = Schema.Struct({
  tenant: PolarCustomerReadTargetTenantSchema,
  customerId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type PolarCustomerGetByIdInput = Schema.Schema.Type<
  typeof PolarCustomerGetByIdInputSchema
>;

export const PolarCustomerListByEmailInputSchema = Schema.Struct({
  tenant: PolarCustomerReadTargetTenantSchema,
  email: Schema.NonEmptyString,
  limit: Schema.optional(PolarCustomerReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type PolarCustomerListByEmailInput = Schema.Schema.Type<
  typeof PolarCustomerListByEmailInputSchema
>;

export const PolarCustomerListByExternalIdInputSchema = Schema.Struct({
  tenant: PolarCustomerReadTargetTenantSchema,
  externalId: Schema.NonEmptyString,
  limit: Schema.optional(PolarCustomerReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type PolarCustomerListByExternalIdInput = Schema.Schema.Type<
  typeof PolarCustomerListByExternalIdInputSchema
>;
