/**
 * Novu deliveries read contracts per admin-app implementation plan
 * §9 item 10 (per-vendor read helpers — batch B vendor #1).
 *
 * Read-only operator console surface that gives the admin app a
 * typed, audited, redaction-aware view over Novu's per-delivery
 * record without giving operators a mutation surface against the
 * upstream notification provider. The slice mirrors the canonical
 * keycloak-user-read + polar-customer-read + open-meter-meter-read
 * template EXACTLY: there is NO persistence — the read path always
 * recomputes against the live Novu API and is fronted by an
 * in-memory snapshot cache bounded by `cacheMaxSize` with
 * `snapshotCacheTtlSeconds` freshness.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service):
 *
 *   - **Read-only surface**: only `getById`, `listByRecipient`,
 *     `listByChannel` are exposed. There is no mutation surface.
 *   - **Operator-only authz**: read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     `NovuDeliveriesReadUnauthorized`.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.novuDeliveriesRead`.
 *   - **Audit emission**: every successful read appends ONE
 *     `novuDeliveriesReadAuditAction.readPerformed` event keyed by
 *     `platformModuleId.novuDeliveriesRead`.
 *   - **Field classification**: `subscriberId`, `payloadDigest` →
 *     `tenant-confidential`; `deliveryId`, `channel`, `status`,
 *     `sentAt`, `deliveredAt`, `openedAt`, `templateId`,
 *     `templateName`, `errorMessage` → `internal`.
 *
 * Naming note: this module is a read-only operator-console
 * projection over the Novu delivery record and reuses
 * `platformAdapterServiceName.novu` end-to-end — NO new adapter
 * literal is introduced.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant
// ---------------------------------------------------------------------------

export const NovuDeliveriesReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type NovuDeliveriesReadTargetTenant = Schema.Schema.Type<
  typeof NovuDeliveriesReadTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Per-delivery summary projection
// ---------------------------------------------------------------------------

export const NovuDeliveryChannelSchema = Schema.Literal(
  "email",
  "sms",
  "push",
  "inApp",
  "chat",
);

export type NovuDeliveryChannel = Schema.Schema.Type<
  typeof NovuDeliveryChannelSchema
>;

export const NovuDeliverySummarySchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
  subscriberId: Schema.NonEmptyString,
  channel: NovuDeliveryChannelSchema,
  status: Schema.NonEmptyString,
  sentAt: IsoTimestampSchema,
  deliveredAt: Schema.optional(IsoTimestampSchema),
  openedAt: Schema.optional(IsoTimestampSchema),
  templateId: Schema.NonEmptyString,
  templateName: Schema.NonEmptyString,
  payloadDigest: Schema.NonEmptyString,
  errorMessage: Schema.optional(Schema.NonEmptyString),
});

export type NovuDeliverySummary = Schema.Schema.Type<
  typeof NovuDeliverySummarySchema
>;

export const NovuDeliverySummaryListSchema = Schema.Array(
  NovuDeliverySummarySchema,
);

export type NovuDeliverySummaryList = Schema.Schema.Type<
  typeof NovuDeliverySummaryListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const NovuDeliveriesReadLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(200),
);

export const NovuDeliveryGetByIdInputSchema = Schema.Struct({
  tenant: NovuDeliveriesReadTargetTenantSchema,
  deliveryId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type NovuDeliveryGetByIdInput = Schema.Schema.Type<
  typeof NovuDeliveryGetByIdInputSchema
>;

export const NovuDeliveryListByRecipientInputSchema = Schema.Struct({
  tenant: NovuDeliveriesReadTargetTenantSchema,
  subscriberId: Schema.NonEmptyString,
  limit: Schema.optional(NovuDeliveriesReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type NovuDeliveryListByRecipientInput = Schema.Schema.Type<
  typeof NovuDeliveryListByRecipientInputSchema
>;

export const NovuDeliveryListByChannelInputSchema = Schema.Struct({
  tenant: NovuDeliveriesReadTargetTenantSchema,
  channel: NovuDeliveryChannelSchema,
  limit: Schema.optional(NovuDeliveriesReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type NovuDeliveryListByChannelInput = Schema.Schema.Type<
  typeof NovuDeliveryListByChannelInputSchema
>;
