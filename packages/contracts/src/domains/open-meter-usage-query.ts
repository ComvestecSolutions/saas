/**
 * OpenMeter usage query contracts per admin-app implementation
 * plan §9 item 8 (admin-only). Mirrors the polar-revenue-projection
 * shape: a derived analytics view sourced from the existing
 * OpenMeter adapter (`platformAdapterServiceName.openmeter`) —
 * distinct from the wire-level OpenMeter ingest surface owned by
 * `packages/platform/src/adapters/features-billing/openmeter.ts`.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service, NOT in the persistence layer):
 *
 *   - **Read-only operator console**: the only mutation surface
 *     exposed to callers is `backfillRequested` — an explicit
 *     operator intent to re-run the usage aggregation against
 *     OpenMeter. The persisted snapshot is computed by the service
 *     (which calls the OpenMeter adapter through the injected
 *     `OpenMeterApiClient` port) and is never directly mutated
 *     through the HTTP surface.
 *   - **One snapshot per `(tenantScopeId, meterSlug, windowStart)`**:
 *     persistence enforces the unique composite via a covering
 *     index so the latest-per-tenant-meter query is O(1).
 *   - **Authz**: snapshot read requires
 *     `permissionScope.openMeterUsageQueryRead`; backfill requires
 *     `permissionScope.openMeterUsageQueryBackfill` AND
 *     `platform-operator` actor type (admin-only).
 *   - **Audit emission**: every snapshot compute emits
 *     `openMeterUsageQueryAuditAction.queryExecuted`; every
 *     operator-initiated backfill emits a second
 *     `openMeterUsageQueryAuditAction.backfillRequested` keyed by
 *     `reasonCatalogId.openMeterUsageQueryBackfill`.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant envelope (mirrors the rest of the platform tenant addressing)
// ---------------------------------------------------------------------------

export const OpenMeterUsageQueryTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type OpenMeterUsageQueryTargetTenant = Schema.Schema.Type<
  typeof OpenMeterUsageQueryTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Aggregation primitives
// ---------------------------------------------------------------------------

/**
 * Supported aggregation granularities. Matches the OpenMeter
 * windowing vocabulary the upstream API exposes; the service
 * declines anything else at the boundary.
 */
export const OpenMeterUsageQueryGranularitySchema = Schema.Literal(
  "MINUTE",
  "HOUR",
  "DAY",
  "MONTH",
);

export type OpenMeterUsageQueryGranularity = Schema.Schema.Type<
  typeof OpenMeterUsageQueryGranularitySchema
>;

export const OpenMeterUsageQueryWindowSchema = Schema.Struct({
  from: IsoTimestampSchema,
  to: IsoTimestampSchema,
});

export type OpenMeterUsageQueryWindow = Schema.Schema.Type<
  typeof OpenMeterUsageQueryWindowSchema
>;

/**
 * One aggregated bucket of usage. `value` is reported as a finite
 * number so the admin console can render arbitrary meter units
 * (events, bytes, seconds, ...) without re-deriving them.
 */
export const OpenMeterUsageQueryBucketSchema = Schema.Struct({
  windowStart: IsoTimestampSchema,
  value: Schema.Number.pipe(Schema.finite()),
});

export type OpenMeterUsageQueryBucket = Schema.Schema.Type<
  typeof OpenMeterUsageQueryBucketSchema
>;

// ---------------------------------------------------------------------------
// Persisted usage query snapshot
// ---------------------------------------------------------------------------

export const OpenMeterUsageQuerySchema = Schema.Struct({
  id: Schema.NonEmptyString,
  tenant: OpenMeterUsageQueryTargetTenantSchema,
  subject: Schema.NonEmptyString,
  meterSlug: Schema.NonEmptyString,
  window: OpenMeterUsageQueryWindowSchema,
  granularity: OpenMeterUsageQueryGranularitySchema,
  aggregated: Schema.Array(OpenMeterUsageQueryBucketSchema),
  computedAt: IsoTimestampSchema,
  correlationId: Schema.NonEmptyString,
});

export type OpenMeterUsageQuery = Schema.Schema.Type<
  typeof OpenMeterUsageQuerySchema
>;

/**
 * Snapshot view returned by the read path — the persisted snapshot
 * plus the service-computed `isFresh` flag (based on
 * `queryCacheTtlSeconds`) so the admin console can render a
 * degraded badge and the operator can request a backfill.
 */
export const OpenMeterUsageQueryResultSchema = Schema.Struct({
  result: OpenMeterUsageQuerySchema,
  isFresh: Schema.Boolean,
});

export type OpenMeterUsageQueryResult = Schema.Schema.Type<
  typeof OpenMeterUsageQueryResultSchema
>;

export const OpenMeterUsageQueryListSchema = Schema.Array(
  OpenMeterUsageQuerySchema,
);

export type OpenMeterUsageQueryList = Schema.Schema.Type<
  typeof OpenMeterUsageQueryListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const OpenMeterUsageQueryInputSchema = Schema.Struct({
  tenant: OpenMeterUsageQueryTargetTenantSchema,
  subject: Schema.NonEmptyString,
  meterSlug: Schema.NonEmptyString,
  window: OpenMeterUsageQueryWindowSchema,
  granularity: OpenMeterUsageQueryGranularitySchema,
});

export type OpenMeterUsageQueryInput = Schema.Schema.Type<
  typeof OpenMeterUsageQueryInputSchema
>;

/**
 * Operator-initiated backfill intent. The service enqueues a
 * recomputation for the requested
 * `(tenantScopeId, meterSlug, window.from)` triple and emits a
 * backfill audit event keyed by the typed
 * `reasonCatalogId.openMeterUsageQueryBackfill`.
 */
export const OpenMeterUsageBackfillInputSchema = Schema.Struct({
  tenant: OpenMeterUsageQueryTargetTenantSchema,
  subject: Schema.NonEmptyString,
  meterSlug: Schema.NonEmptyString,
  window: OpenMeterUsageQueryWindowSchema,
  granularity: OpenMeterUsageQueryGranularitySchema,
  reasonCatalogId: Schema.NonEmptyString,
  reasonNarrative: Schema.NonEmptyString,
  /**
   * High-risk attachment text required by the reason-catalog registry
   * entry for `reasonCatalogId.openMeterUsageQueryBackfill`
   * (`requiresAttachment: true`). Operators MUST link a runbook URL,
   * ticket id, or incident reference so the audit row records the
   * originating compliance evidence. Whitespace-only values are
   * rejected at the service boundary with
   * `OpenMeterUsageQueryReasonAttachmentRequired`.
   */
  reasonAttachmentText: Schema.NonEmptyString,
});

export type OpenMeterUsageBackfillInput = Schema.Schema.Type<
  typeof OpenMeterUsageBackfillInputSchema
>;
