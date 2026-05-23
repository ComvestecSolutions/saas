/**
 * Vendor-health aggregator contracts per admin-app implementation
 * plan §9 item 9 (admin-app spec — vendor-health view).
 *
 * The vendor-health aggregate is a read-only, partial-failure-
 * tolerant projection over EVERY platform adapter healthcheck
 * Effect identified by `platformAdapterServiceName.*`. The
 * canonical adapter vocabulary lives in
 * `packages/platform/src/adapters/service-names.ts`; this contract
 * carries that vocabulary across the wire via
 * {@link PlatformAdapterServiceNameSchema} so NO raw service-name
 * literal leaks past the aggregator boundary.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service ABOVE persistence — there is NO snapshot table
 * for the aggregate; the read path always recomputes against the
 * live adapter healthchecks and the bounded in-memory cache):
 *
 *   - **Read-only**: the aggregator exposes a single GET surface;
 *     it never mutates anything.
 *   - **Operator-only authz**: snapshot read is allowed for either
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous + product-tenant actors are rejected.
 *   - **Aggregate v2 partial-failure semantics**: per-source
 *     failures populate `partialFailures` and degrade the matching
 *     `entries` row to `status: 'unavailable'` (with a `message`)
 *     rather than failing the whole aggregate. The aggregate only
 *     fails when EVERY upstream healthcheck fails.
 *   - **Audit emission**: every successful aggregate (even a
 *     partial one) appends one
 *     `vendorHealthAggregatorAuditAction.snapshotComputed` event
 *     keyed by `reasonCatalogId.vendorHealthAggregator.read`.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformAdapterServiceNameSchema } from "../runtime/platform-adapter-service-names";

// ---------------------------------------------------------------------------
// Per-adapter status vocabulary
// ---------------------------------------------------------------------------

/**
 * Aggregated health status reported for a single adapter:
 *
 *   - `healthy`     — the upstream `Effect` resolved cleanly.
 *   - `degraded`    — the upstream resolved but reported a non-200
 *                     state or partial outage (reserved for future
 *                     vendor-specific health degradation signals).
 *   - `unavailable` — the upstream `Effect` failed; the matching
 *                     `partialFailures` entry carries the typed
 *                     reason.
 *   - `unknown`     — the adapter does not currently expose a
 *                     healthcheck `Effect`, so the aggregator
 *                     surfaces an honest placeholder rather than
 *                     fabricating a healthy or unavailable signal.
 */
export const VendorHealthAggregateEntryStatusSchema = Schema.Literal(
  "healthy",
  "degraded",
  "unavailable",
  "unknown",
);

export type VendorHealthAggregateEntryStatus = Schema.Schema.Type<
  typeof VendorHealthAggregateEntryStatusSchema
>;

// ---------------------------------------------------------------------------
// One aggregate row (keyed by PlatformAdapterServiceNameSchema)
// ---------------------------------------------------------------------------

export const VendorHealthAggregateEntrySchema = Schema.Struct({
  /**
   * Canonical adapter service name. Sourced exclusively from the
   * shared {@link PlatformAdapterServiceNameSchema}; NO raw
   * string literal is allowed past this boundary.
   */
  serviceName: PlatformAdapterServiceNameSchema,
  status: VendorHealthAggregateEntryStatusSchema,
  /**
   * Optional adapter-reported version string (e.g. `"5.0.6"`).
   */
  version: Schema.optional(Schema.NonEmptyString),
  /**
   * Wall-clock latency of the underlying healthcheck call in
   * milliseconds; finite + non-negative.
   */
  latencyMs: Schema.Number.pipe(Schema.finite(), Schema.nonNegative()),
  lastCheckedAt: IsoTimestampSchema,
  /**
   * Optional ISO-timestamp of the most-recent observed incident for
   * this adapter. Reserved for the future per-vendor read helpers
   * slice (§9 item 10); today the aggregator does not own incident
   * history so this field is omitted.
   */
  lastIncidentAt: Schema.optional(IsoTimestampSchema),
  /**
   * Free-form human-readable message used by the admin console
   * (e.g. failure cause for `unavailable`, `"no-healthcheck-
   * implemented"` for `unknown`).
   */
  message: Schema.optional(Schema.NonEmptyString),
});

export type VendorHealthAggregateEntry = Schema.Schema.Type<
  typeof VendorHealthAggregateEntrySchema
>;

// ---------------------------------------------------------------------------
// Per-source partial failure (aggregate v2 contract)
// ---------------------------------------------------------------------------

export const VendorHealthAggregatePartialFailureSchema = Schema.Struct({
  serviceName: PlatformAdapterServiceNameSchema,
  reason: Schema.NonEmptyString,
});

export type VendorHealthAggregatePartialFailure = Schema.Schema.Type<
  typeof VendorHealthAggregatePartialFailureSchema
>;

// ---------------------------------------------------------------------------
// Top-level projection
// ---------------------------------------------------------------------------

export const VendorHealthAggregateProjectionSchema = Schema.Struct({
  entries: Schema.Array(VendorHealthAggregateEntrySchema),
  partialFailures: Schema.Array(VendorHealthAggregatePartialFailureSchema),
  generatedAt: IsoTimestampSchema,
  correlationId: Schema.NonEmptyString,
});

export type VendorHealthAggregateProjection = Schema.Schema.Type<
  typeof VendorHealthAggregateProjectionSchema
>;
