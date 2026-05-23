/**
 * OpenMeter usage query module wrapper (admin-app implementation
 * plan §9 item 8 — admin-only).
 *
 * Re-exports the canonical contract surface and exposes pure
 * helpers shared by the platform service and the snapshot
 * dispatcher. Owner-locked invariants (admin-only authz on
 * backfill, audit emission, bounded snapshot cache, env-boundary
 * decoding of `OPENMETER_API_BASE_URL` + `OPENMETER_API_KEY`) live
 * in the platform service ABOVE persistence — this module owns
 * only the pure helpers both layers need to agree on.
 *
 * Naming note: distinct from the wire-level OpenMeter ingest
 * adapter at `packages/platform/src/adapters/features-billing/openmeter.ts`
 * which owns the CloudEvents ingest primitives. This module is a
 * derived analytics view over OpenMeter's usage data and does not
 * re-implement those primitives.
 */
import { platformModuleId } from "@comvestec/contracts";

export const openMeterUsageQueryModuleId = platformModuleId.openMeterUsageQuery;

export {
  OpenMeterUsageBackfillInputSchema,
  OpenMeterUsageQueryBucketSchema,
  OpenMeterUsageQueryGranularitySchema,
  OpenMeterUsageQueryInputSchema,
  OpenMeterUsageQueryListSchema,
  OpenMeterUsageQueryResultSchema,
  OpenMeterUsageQuerySchema,
  OpenMeterUsageQueryTargetTenantSchema,
  OpenMeterUsageQueryWindowSchema,
} from "@comvestec/contracts";

export type {
  OpenMeterUsageBackfillInput,
  OpenMeterUsageQuery,
  OpenMeterUsageQueryBucket,
  OpenMeterUsageQueryGranularity,
  OpenMeterUsageQueryInput,
  OpenMeterUsageQueryList,
  OpenMeterUsageQueryResult,
  OpenMeterUsageQueryTargetTenant,
  OpenMeterUsageQueryWindow,
} from "@comvestec/contracts";

/**
 * Snapshot freshness check used by the read-path cache and the
 * admin console to decide whether the latest persisted snapshot is
 * still within the operator-configured cache TTL. Older snapshots
 * are flagged stale so the console can render a degraded badge and
 * the operator can request a backfill via the only mutation surface.
 */
export const isOpenMeterUsageQuerySnapshotFresh = (
  snapshotComputedAt: string,
  nowEpochMs: number,
  cacheTtlSeconds: number,
): boolean => {
  const computedMs = new Date(snapshotComputedAt).getTime();
  if (!Number.isFinite(computedMs)) {
    return false;
  }
  if (!Number.isFinite(cacheTtlSeconds) || cacheTtlSeconds <= 0) {
    return false;
  }
  const ageMs = nowEpochMs - computedMs;
  if (ageMs < 0) {
    return false;
  }
  return ageMs <= cacheTtlSeconds * 1000;
};

/**
 * Compute the inclusive day-span of the requested usage window so
 * the platform service can refuse queries that exceed the
 * operator-configured `maxWindowDays` bound at the boundary.
 */
export const computeOpenMeterUsageWindowDays = (window: {
  readonly from: string;
  readonly to: string;
}): number => {
  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return Number.POSITIVE_INFINITY;
  }
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((toMs - fromMs) / oneDayMs);
};
