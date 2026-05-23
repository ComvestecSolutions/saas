/**
 * Keycloak user read module wrapper (admin-app implementation plan
 * §9 item 10 — per-vendor read helpers, batch A vendor #1).
 *
 * Re-exports the canonical contract surface and exposes pure
 * helpers shared by the platform service and any future redaction
 * consumer. Owner-locked invariants (operator-only authz, audit
 * emission on every successful read, bounded in-memory snapshot
 * cache, reason-catalog decode, READ-ONLY surface) live in the
 * platform service — this module owns only the pure helpers both
 * layers need to agree on.
 *
 * No persistence: unlike the polar-revenue-projection and
 * open-meter-usage-query slices this module ships NO snapshot
 * table. Reads always recompute against the upstream Keycloak
 * admin API and are fronted by an in-memory snapshot cache bounded
 * by `cacheMaxSize` with `snapshotCacheTtlSeconds` freshness.
 *
 * Naming note: distinct from the existing Keycloak adapter
 * (`packages/platform/src/adapters/identity/keycloak.ts`) which
 * owns wire-level login / session / impersonation primitives. The
 * platform service reuses `platformAdapterServiceName.keycloak`
 * end-to-end — NO new adapter literal is introduced.
 */
import { platformModuleId } from "@comvestec/contracts";

export const keycloakUserReadModuleId = platformModuleId.keycloakUserRead;

export {
  KeycloakUserGetByIdInputSchema,
  KeycloakUserListByEmailInputSchema,
  KeycloakUserListByUsernameInputSchema,
  KeycloakUserReadTargetTenantSchema,
  KeycloakUserSummaryListSchema,
  KeycloakUserSummarySchema,
} from "@comvestec/contracts";

export type {
  KeycloakUserGetByIdInput,
  KeycloakUserListByEmailInput,
  KeycloakUserListByUsernameInput,
  KeycloakUserReadTargetTenant,
  KeycloakUserSummary,
  KeycloakUserSummaryList,
} from "@comvestec/contracts";

/**
 * Snapshot freshness check used by the read-path cache to decide
 * whether a cached Keycloak user summary is still within the
 * operator-configured TTL. Stale entries trigger a live re-fetch
 * against the upstream admin API so the admin console never sees
 * stale identity data masquerading as fresh. Negative or
 * non-finite TTLs collapse to `false` so misconfiguration fails
 * closed rather than silently bypassing the TTL.
 */
export const isKeycloakUserSummaryFresh = (
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
