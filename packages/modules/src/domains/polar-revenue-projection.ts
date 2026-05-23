/**
 * Polar revenue projection module wrapper (admin-app
 * implementation plan §9 item 7 — read-only, admin-only).
 *
 * Re-exports the canonical contract surface and exposes pure
 * helpers shared by the platform service and the snapshot
 * dispatcher. Owner-locked invariants (admin-only authz on
 * backfill, audit emission, bounded snapshot cache, env-boundary
 * decoding of `POLAR_API_BASE_URL` + `POLAR_API_KEY`) live in the
 * platform service ABOVE persistence — this module owns only the
 * pure helpers both layers need to agree on.
 *
 * Naming note: distinct from the existing Polar billing adapter
 * at `packages/platform/src/adapters/features-billing/polar.ts`
 * which owns wire-level catalog / checkout / webhook primitives.
 * This module is a derived analytics view over that data and does
 * not re-implement those primitives.
 */
import { platformModuleId } from "@comvestec/contracts";

export const polarRevenueProjectionModuleId =
  platformModuleId.polarRevenueProjection;

export {
  PolarRevenueProjectionBackfillInputSchema,
  PolarRevenueProjectionListFilterSchema,
  PolarRevenueProjectionListSchema,
  PolarRevenueProjectionMoneySchema,
  PolarRevenueProjectionQueryInputSchema,
  PolarRevenueProjectionSchema,
  PolarRevenueProjectionTargetTenantSchema,
} from "@comvestec/contracts";

export type {
  PolarRevenueProjection,
  PolarRevenueProjectionBackfillInput,
  PolarRevenueProjectionList,
  PolarRevenueProjectionListFilter,
  PolarRevenueProjectionMoney,
  PolarRevenueProjectionQueryInput,
  PolarRevenueProjectionTargetTenant,
} from "@comvestec/contracts";

/**
 * Snapshot freshness check used by the read-path cache and the
 * read-only console to decide whether the latest persisted snapshot
 * is still within the operator-configured cadence. Older snapshots
 * are flagged stale so the console can render a degraded badge and
 * the operator can request a backfill via the only mutation surface.
 */
export const isSnapshotFresh = (
  snapshotComputedAt: string,
  nowEpochMs: number,
  intervalMinutes: number,
): boolean => {
  const computedMs = new Date(snapshotComputedAt).getTime();
  if (!Number.isFinite(computedMs)) {
    return false;
  }
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return false;
  }
  const ageMs = nowEpochMs - computedMs;
  if (ageMs < 0) {
    return false;
  }
  return ageMs <= intervalMinutes * 60 * 1000;
};

/**
 * Compute the projected next-period revenue from MRR + expansion -
 * contraction (all in the same currency). Returned as integer minor
 * units so floats never cross the wire. The platform service uses
 * this when synthesizing a snapshot envelope from raw Polar inputs;
 * persistence stores the resulting value verbatim.
 */
export const computeProjectedNextPeriodRevenueAmount = (
  mrrAmountMinorUnits: number,
  expansionAmountMinorUnits: number,
  contractionAmountMinorUnits: number,
): number =>
  Math.max(
    0,
    Math.trunc(
      mrrAmountMinorUnits +
        expansionAmountMinorUnits -
        contractionAmountMinorUnits,
    ),
  );
