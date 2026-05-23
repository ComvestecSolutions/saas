/**
 * Vendor-health aggregator module wrapper (admin-app implementation
 * plan §9 item 9 — admin/support-operator read-only).
 *
 * Re-exports the canonical contract surface and exposes pure
 * helpers shared by the platform service and the future per-vendor
 * read helpers slice (§9 item 10). Owner-locked invariants
 * (operator-only authz, bounded in-memory cache, audit emission on
 * every successful aggregate, partial-failure semantics that only
 * fail when ALL upstream healthchecks fail) live in the platform
 * service ABOVE persistence — this module owns only the pure
 * helpers both layers need to agree on.
 *
 * No persistence: unlike the polar-revenue-projection and
 * open-meter-usage-query slices this module ships NO snapshot
 * table. The aggregate is recomputed live against every adapter
 * healthcheck Effect and fronted by an in-memory snapshot cache
 * bounded by `cacheMaxSize` with `snapshotCacheTtlSeconds`
 * freshness.
 */
import { platformModuleId } from "@comvestec/contracts";

export const vendorHealthAggregatorModuleId =
  platformModuleId.vendorHealthAggregator;

export {
  VendorHealthAggregateEntrySchema,
  VendorHealthAggregateEntryStatusSchema,
  VendorHealthAggregatePartialFailureSchema,
  VendorHealthAggregateProjectionSchema,
} from "@comvestec/contracts";

export type {
  VendorHealthAggregateEntry,
  VendorHealthAggregateEntryStatus,
  VendorHealthAggregatePartialFailure,
  VendorHealthAggregateProjection,
} from "@comvestec/contracts";

import type {
  VendorHealthAggregateEntry,
  VendorHealthAggregateEntryStatus,
} from "@comvestec/contracts";

/**
 * Roll-up severity ordering used by the operator desk's vendor
 * health card so the worst observed status drives the badge color:
 * `unavailable > degraded > unknown > healthy`. An empty `entries`
 * list collapses to `unknown` rather than fabricating a healthy
 * signal — the aggregator must always have something to report.
 */
export const summarizeWorstStatus = (
  entries: ReadonlyArray<VendorHealthAggregateEntry>,
): VendorHealthAggregateEntryStatus => {
  if (entries.length === 0) {
    return "unknown";
  }
  const severityRank: Record<VendorHealthAggregateEntryStatus, number> = {
    unavailable: 3,
    degraded: 2,
    unknown: 1,
    healthy: 0,
  };
  let worst: VendorHealthAggregateEntryStatus = "healthy";
  for (const entry of entries) {
    if (severityRank[entry.status] > severityRank[worst]) {
      worst = entry.status;
    }
  }
  return worst;
};

/**
 * Aggregate freshness check used by the read-path cache to decide
 * whether the latest cached aggregate is still within the
 * operator-configured cache TTL. Older aggregates trigger a live
 * recompute against every upstream healthcheck so the admin
 * console never sees stale data masquerading as fresh. Negative or
 * non-finite TTLs collapse to `false` so misconfiguration fails
 * closed rather than silently bypassing the TTL.
 */
export const isAggregateFresh = (
  generatedAt: string,
  nowEpochMs: number,
  ttlSeconds: number,
): boolean => {
  const generatedMs = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedMs)) {
    return false;
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return false;
  }
  const ageMs = nowEpochMs - generatedMs;
  if (ageMs < 0) {
    return false;
  }
  return ageMs <= ttlSeconds * 1000;
};
