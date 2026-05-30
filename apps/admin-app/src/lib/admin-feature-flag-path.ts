import { adminRoutePath, type PlatformModuleId } from "@comvestec/contracts";

/**
 * Canonical builder for `/desk/flag` Feature Flags v2 surfaces
 * (admin-app implementation plan §8.6 + §11 — Phase 3 Governance
 * & access commit 3). Mirrors `buildAdminRuntimeConfigPath`: the
 * route detail variant is `/desk/flag/{flagKey}` and the list
 * variant is the bare `adminRoutePath.featureFlags` literal.
 * Keeps URL construction next to the spec-canonical constant so
 * the admin-app never reaches for an ad hoc template literal.
 *
 * The optional `moduleId` filter is round-tripped via the URL
 * search params at the call sites (route validator) rather than
 * baked into the path here; the path builder owns only the
 * path-shape contract.
 */
export type BuildAdminFeatureFlagPathInput = {
  readonly flagKey?: string;
  readonly moduleId?: PlatformModuleId;
};

export const buildAdminFeatureFlagPath = (
  input: BuildAdminFeatureFlagPathInput = {},
): string => {
  const { flagKey } = input;
  if (flagKey !== undefined && flagKey.length > 0) {
    return `${adminRoutePath.featureFlags}/${encodeURIComponent(flagKey)}`;
  }
  return adminRoutePath.featureFlags;
};
