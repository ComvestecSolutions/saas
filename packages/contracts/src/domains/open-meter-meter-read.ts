/**
 * OpenMeter meter read contracts per admin-app implementation plan
 * §9 item 10 (per-vendor read helpers — batch A vendor #3).
 *
 * Read-only operator console surface that gives the admin app a
 * typed, audited view over the OpenMeter meter definition record
 * without giving operators a mutation surface against the upstream
 * metering control-plane. The slice mirrors the canonical
 * keycloak-user-read + polar-customer-read template EXACTLY: there
 * is NO persistence — the read path always recomputes against the
 * live OpenMeter API and is fronted by an in-memory snapshot cache
 * bounded by `cacheMaxSize` with `snapshotCacheTtlSeconds`
 * freshness.
 *
 * Naming note: distinct from the existing `open-meter-usage-query`
 * slice (which owns the aggregated per-tenant usage snapshot). This
 * module is a read-only operator-console projection over the meter
 * DEFINITION record (slug, aggregation, event-type, value-property,
 * createdAt) and reuses `platformAdapterServiceName.openmeter`
 * end-to-end — NO new adapter literal is introduced.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service):
 *
 *   - **Read-only surface**: only `getBySlug`, `listAll`,
 *     `listByEventType` are exposed. There is no mutation surface.
 *   - **Operator-only authz**: read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     `OpenMeterMeterReadUnauthorized`.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.openMeterMeterRead`.
 *   - **Audit emission**: every successful read appends ONE
 *     `openMeterMeterReadAuditAction.readPerformed` event keyed by
 *     `platformModuleId.openMeterMeterRead`.
 *   - **Field classification**: ALL fields (`meterSlug`,
 *     `displayName`, `aggregation`, `eventType`, `valueProperty`,
 *     `createdAt`) → `internal`. Meter definitions are operator
 *     vocabulary, not tenant PII.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant (mirrors the rest of the platform tenant addressing)
// ---------------------------------------------------------------------------

export const OpenMeterMeterReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type OpenMeterMeterReadTargetTenant = Schema.Schema.Type<
  typeof OpenMeterMeterReadTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Per-meter summary projection
// ---------------------------------------------------------------------------

export const OpenMeterMeterAggregationSchema = Schema.Literal(
  "SUM",
  "COUNT",
  "AVG",
  "MIN",
  "MAX",
  "UNIQUE_COUNT",
);

export type OpenMeterMeterAggregation = Schema.Schema.Type<
  typeof OpenMeterMeterAggregationSchema
>;

export const OpenMeterMeterSummarySchema = Schema.Struct({
  meterSlug: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  aggregation: OpenMeterMeterAggregationSchema,
  eventType: Schema.NonEmptyString,
  valueProperty: Schema.optional(Schema.NonEmptyString),
  createdAt: IsoTimestampSchema,
});

export type OpenMeterMeterSummary = Schema.Schema.Type<
  typeof OpenMeterMeterSummarySchema
>;

export const OpenMeterMeterSummaryListSchema = Schema.Array(
  OpenMeterMeterSummarySchema,
);

export type OpenMeterMeterSummaryList = Schema.Schema.Type<
  typeof OpenMeterMeterSummaryListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const OpenMeterMeterReadLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(200),
);

export const OpenMeterMeterGetBySlugInputSchema = Schema.Struct({
  tenant: OpenMeterMeterReadTargetTenantSchema,
  meterSlug: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type OpenMeterMeterGetBySlugInput = Schema.Schema.Type<
  typeof OpenMeterMeterGetBySlugInputSchema
>;

export const OpenMeterMeterListAllInputSchema = Schema.Struct({
  tenant: OpenMeterMeterReadTargetTenantSchema,
  limit: Schema.optional(OpenMeterMeterReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type OpenMeterMeterListAllInput = Schema.Schema.Type<
  typeof OpenMeterMeterListAllInputSchema
>;

export const OpenMeterMeterListByEventTypeInputSchema = Schema.Struct({
  tenant: OpenMeterMeterReadTargetTenantSchema,
  eventType: Schema.NonEmptyString,
  limit: Schema.optional(OpenMeterMeterReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type OpenMeterMeterListByEventTypeInput = Schema.Schema.Type<
  typeof OpenMeterMeterListByEventTypeInputSchema
>;
