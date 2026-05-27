/**
 * Keycloak role read module wrapper (admin-app implementation plan
 * §9 item 10 — per-vendor read helpers).
 *
 * Re-exports the canonical contract surface and exposes the pure
 * cache-freshness helper shared by the platform service and tests.
 * The platform service owns authz, reason-catalog enforcement,
 * audit emission, and the bounded in-memory cache.
 */
import { platformModuleId } from "@comvestec/contracts";

export const keycloakRoleReadModuleId = platformModuleId.keycloakRoleRead;

export {
  KeycloakRoleCompositeSummarySchema,
  KeycloakRoleDetailSchema,
  KeycloakRoleGetByIdInputSchema,
  KeycloakRoleMemberSummarySchema,
  KeycloakRoleReadTargetTenantSchema,
} from "@comvestec/contracts";

export type {
  KeycloakRoleCompositeSummary,
  KeycloakRoleDetail,
  KeycloakRoleGetByIdInput,
  KeycloakRoleMemberSummary,
  KeycloakRoleReadTargetTenant,
} from "@comvestec/contracts";

export const isKeycloakRoleDetailFresh = (
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
