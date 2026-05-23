/**
 * OpenMeter meter read module wrapper (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch A vendor #3).
 *
 * Re-exports the canonical contract surface and exposes pure
 * helpers shared by the platform service and any future redaction
 * consumer. Owner-locked invariants (operator-only authz, audit
 * emission on every successful read, bounded in-memory snapshot
 * cache, reason-catalog decode, READ-ONLY surface) live in the
 * platform service — this module owns only the pure helpers both
 * layers need to agree on.
 *
 * No persistence: like the keycloak-user-read / polar-customer-read
 * slices this module ships NO snapshot table. Reads always
 * recompute against the upstream OpenMeter API and are fronted by
 * an in-memory snapshot cache bounded by `cacheMaxSize` with
 * `snapshotCacheTtlSeconds` freshness.
 *
 * Naming note: distinct from the existing open-meter-usage-query
 * slice (which aggregates per-tenant usage). The platform service
 * reuses `platformAdapterServiceName.openmeter` end-to-end — NO
 * new adapter literal is introduced.
 */
import { platformModuleId } from "@comvestec/contracts";

export const openMeterMeterReadModuleId = platformModuleId.openMeterMeterRead;

export {
  OpenMeterMeterAggregationSchema,
  OpenMeterMeterGetBySlugInputSchema,
  OpenMeterMeterListAllInputSchema,
  OpenMeterMeterListByEventTypeInputSchema,
  OpenMeterMeterReadTargetTenantSchema,
  OpenMeterMeterSummaryListSchema,
  OpenMeterMeterSummarySchema,
} from "@comvestec/contracts";

export type {
  OpenMeterMeterAggregation,
  OpenMeterMeterGetBySlugInput,
  OpenMeterMeterListAllInput,
  OpenMeterMeterListByEventTypeInput,
  OpenMeterMeterReadTargetTenant,
  OpenMeterMeterSummary,
  OpenMeterMeterSummaryList,
} from "@comvestec/contracts";

/**
 * Snapshot freshness check used by the read-path cache to decide
 * whether a cached OpenMeter meter summary is still within the
 * operator-configured TTL. Stale entries trigger a live re-fetch
 * against the upstream OpenMeter API so the admin console never
 * sees stale meter definitions masquerading as fresh. Negative or
 * non-finite TTLs collapse to `false` so misconfiguration fails
 * closed rather than silently bypassing the TTL.
 */
export const isOpenMeterMeterSummaryFresh = (
  cachedAt: string,
  nowEpochMs: number,
  ttlSeconds: number,
): boolean => {
  const cachedMs = new Date(cachedAt).getTime();
  if (!Number.isFinite(cachedMs)) {
    return false;
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return false;
  }
  const ageMs = nowEpochMs - cachedMs;
  if (ageMs < 0) {
    return false;
  }
  return ageMs <= ttlSeconds * 1000;
};
