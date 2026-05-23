/**
 * Novu deliveries read module wrapper (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #1).
 *
 * Re-exports the canonical contract surface and exposes pure
 * helpers shared by the platform service and any future redaction
 * consumer. Owner-locked invariants (operator-only authz, audit
 * emission on every successful read, bounded in-memory snapshot
 * cache, reason-catalog decode, READ-ONLY surface) live in the
 * platform service — this module owns only the pure helpers both
 * layers need to agree on.
 *
 * No persistence: like the polar-customer-read / open-meter-meter-read
 * slices this module ships NO snapshot table. Reads always
 * recompute against the upstream Novu API and are fronted by an
 * in-memory snapshot cache bounded by `cacheMaxSize` with
 * `snapshotCacheTtlSeconds` freshness.
 *
 * The platform service reuses `platformAdapterServiceName.novu`
 * end-to-end — NO new adapter literal is introduced.
 */
import { platformModuleId } from "@comvestec/contracts";

export const novuDeliveriesReadModuleId = platformModuleId.novuDeliveriesRead;

export {
  NovuDeliveriesReadTargetTenantSchema,
  NovuDeliveryChannelSchema,
  NovuDeliveryGetByIdInputSchema,
  NovuDeliveryListByChannelInputSchema,
  NovuDeliveryListByRecipientInputSchema,
  NovuDeliverySummaryListSchema,
  NovuDeliverySummarySchema,
} from "@comvestec/contracts";

export type {
  NovuDeliveriesReadTargetTenant,
  NovuDeliveryChannel,
  NovuDeliveryGetByIdInput,
  NovuDeliveryListByChannelInput,
  NovuDeliveryListByRecipientInput,
  NovuDeliverySummary,
  NovuDeliverySummaryList,
} from "@comvestec/contracts";

/**
 * Snapshot freshness check used by the read-path cache to decide
 * whether a cached Novu delivery summary is still within the
 * operator-configured TTL. Stale entries trigger a live re-fetch
 * against the upstream Novu API so the admin console never sees
 * stale delivery data masquerading as fresh. Negative or
 * non-finite TTLs collapse to `false` so misconfiguration fails
 * closed rather than silently bypassing the TTL.
 */
export const isNovuDeliverySummaryFresh = (
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
