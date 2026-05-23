/**
 * Postal mail log read contracts per admin-app implementation plan
 * §9 item 10 (per-vendor read helpers — batch B vendor #2).
 *
 * Read-only operator console surface that gives the admin app a
 * typed, audited, redaction-aware view over Postal's per-message
 * mail-log record without giving operators a mutation surface
 * against the upstream transactional-email provider. The slice
 * mirrors the canonical novu-deliveries-read /
 * open-meter-meter-read / polar-customer-read template EXACTLY:
 * there is NO persistence — the read path always recomputes
 * against the live Postal API and is fronted by an in-memory
 * snapshot cache bounded by `cacheMaxSize` with
 * `snapshotCacheTtlSeconds` freshness.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service):
 *
 *   - **Read-only surface**: only `getById`, `listByRecipient`,
 *     `listByStatus` are exposed. There is no mutation surface.
 *   - **Operator-only authz**: read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     `PostalMailLogReadUnauthorized`.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.postalMailLogRead`.
 *   - **Audit emission**: every successful read appends ONE
 *     `postalMailLogReadAuditAction.readPerformed` event keyed by
 *     `platformModuleId.postalMailLogRead`.
 *   - **Field classification**: `fromAddress`, `toAddress`,
 *     `subject`, `bounceReason` → `tenant-confidential`;
 *     `messageId`, `status`, `sentAt`, `deliveredAt`,
 *     `lastEventAt` → `internal`.
 *
 * Naming note: this module is a read-only operator-console
 * projection over the Postal mail-log record and reuses
 * `platformAdapterServiceName.postal` end-to-end — NO new adapter
 * literal is introduced.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant
// ---------------------------------------------------------------------------

export const PostalMailLogReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type PostalMailLogReadTargetTenant = Schema.Schema.Type<
  typeof PostalMailLogReadTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Per-message log entry projection
// ---------------------------------------------------------------------------

export const PostalMailLogStatusSchema = Schema.Literal(
  "sent",
  "bounced",
  "complained",
  "rejected",
  "delivered",
);

export type PostalMailLogStatus = Schema.Schema.Type<
  typeof PostalMailLogStatusSchema
>;

export const PostalMailLogEntrySchema = Schema.Struct({
  messageId: Schema.NonEmptyString,
  fromAddress: Schema.NonEmptyString,
  toAddress: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
  status: PostalMailLogStatusSchema,
  sentAt: IsoTimestampSchema,
  deliveredAt: Schema.optional(IsoTimestampSchema),
  bounceReason: Schema.optional(Schema.NonEmptyString),
  lastEventAt: IsoTimestampSchema,
});

export type PostalMailLogEntry = Schema.Schema.Type<
  typeof PostalMailLogEntrySchema
>;

export const PostalMailLogEntryListSchema = Schema.Array(
  PostalMailLogEntrySchema,
);

export type PostalMailLogEntryList = Schema.Schema.Type<
  typeof PostalMailLogEntryListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const PostalMailLogReadLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(200),
);

export const PostalMailLogGetByIdInputSchema = Schema.Struct({
  tenant: PostalMailLogReadTargetTenantSchema,
  messageId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type PostalMailLogGetByIdInput = Schema.Schema.Type<
  typeof PostalMailLogGetByIdInputSchema
>;

export const PostalMailLogListByRecipientInputSchema = Schema.Struct({
  tenant: PostalMailLogReadTargetTenantSchema,
  emailAddress: Schema.NonEmptyString,
  limit: Schema.optional(PostalMailLogReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type PostalMailLogListByRecipientInput = Schema.Schema.Type<
  typeof PostalMailLogListByRecipientInputSchema
>;

export const PostalMailLogListByStatusInputSchema = Schema.Struct({
  tenant: PostalMailLogReadTargetTenantSchema,
  status: PostalMailLogStatusSchema,
  limit: Schema.optional(PostalMailLogReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type PostalMailLogListByStatusInput = Schema.Schema.Type<
  typeof PostalMailLogListByStatusInputSchema
>;
