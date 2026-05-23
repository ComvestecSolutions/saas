/**
 * OpenPanel events read module wrapper (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #4).
 *
 * Re-exports the canonical contract surface and exposes pure
 * helpers shared by the platform service and any future redaction
 * consumer. Owner-locked invariants (operator-only authz, audit
 * emission on every successful read, bounded in-memory snapshot
 * cache, reason-catalog decode, READ-ONLY surface) live in the
 * platform service — this module owns only the pure helpers both
 * layers need to agree on.
 *
 * No persistence: like the glitchtip-issues-read / postal-mail-log-read
 * / novu-deliveries-read / open-meter-meter-read slices this module
 * ships NO snapshot table. Reads always recompute against the
 * upstream OpenPanel API and are fronted by an in-memory snapshot
 * cache bounded by `cacheMaxSize` with `snapshotCacheTtlSeconds`
 * freshness.
 *
 * The platform service reuses `platformAdapterServiceName.openpanel`
 * end-to-end — NO new adapter literal is introduced.
 */
import { platformModuleId } from "@comvestec/contracts";

export const openPanelEventsReadModuleId = platformModuleId.openPanelEventsRead;

export {
  OpenPanelEventGetByIdInputSchema,
  OpenPanelEventListByEventNameInputSchema,
  OpenPanelEventListByProjectInputSchema,
  OpenPanelEventListSchema,
  OpenPanelEventSchema,
  OpenPanelEventsReadTargetTenantSchema,
} from "@comvestec/contracts";

export type {
  OpenPanelEvent,
  OpenPanelEventGetByIdInput,
  OpenPanelEventList,
  OpenPanelEventListByEventNameInput,
  OpenPanelEventListByProjectInput,
  OpenPanelEventsReadTargetTenant,
} from "@comvestec/contracts";

/**
 * Snapshot freshness check used by the read-path cache to decide
 * whether a cached OpenPanel event is still within the
 * operator-configured TTL. Stale entries trigger a live re-fetch
 * against the upstream OpenPanel API so the admin console never
 * sees stale event data masquerading as fresh. Negative or
 * non-finite TTLs collapse to `false` so misconfiguration fails
 * closed rather than silently bypassing the TTL.
 */
export const isOpenPanelEventFresh = (
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
