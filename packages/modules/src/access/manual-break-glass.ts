/**
 * Manual break-glass module surface (admin-app implementation
 * plan §9 item 5). Re-exports the canonical contract types and
 * exposes one pure helper used by both the platform service and
 * the future auto-expiry scheduler.
 *
 * Naming note: the canonical contract uses the `Manual…` prefix to
 * avoid colliding with the ephemeral support-operations
 * `BreakGlassGrant` value object.
 */
import {
  manualBreakGlassGrantStatus,
  type ManualBreakGlassGrant,
  type ManualBreakGlassGrantStatus,
} from "@comvestec/contracts";

export {
  manualBreakGlassGrantStatus,
  manualBreakGlassGrantStatuses,
  ManualBreakGlassGrantInputSchema,
  ManualBreakGlassGrantSchema,
  ManualBreakGlassGrantStatusSchema,
  ManualBreakGlassReleaseInputSchema,
  ManualBreakGlassTargetTenantSchema,
} from "@comvestec/contracts";

export type {
  ManualBreakGlassGrant,
  ManualBreakGlassGrantInput,
  ManualBreakGlassGrantStatus,
  ManualBreakGlassReleaseInput,
  ManualBreakGlassTargetTenant,
} from "@comvestec/contracts";

/**
 * Pure status decoder used both by the platform service (cache
 * invalidation + list filtering) and by the auto-expiry sweep
 * (deciding which persisted active rows must be flipped to
 * `expired`). Released grants are returned as-is; active grants
 * whose `expiresAt` has passed are returned as `expired`. Already
 * `expired` rows are returned unchanged.
 */
export const computeStatusForNow = (
  grant: Pick<ManualBreakGlassGrant, "status" | "expiresAt">,
  now: number,
): ManualBreakGlassGrantStatus => {
  if (grant.status === manualBreakGlassGrantStatus.released) {
    return manualBreakGlassGrantStatus.released;
  }
  if (grant.status === manualBreakGlassGrantStatus.expired) {
    return manualBreakGlassGrantStatus.expired;
  }
  const expiresAtMs = new Date(grant.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    return manualBreakGlassGrantStatus.expired;
  }
  return manualBreakGlassGrantStatus.active;
};
