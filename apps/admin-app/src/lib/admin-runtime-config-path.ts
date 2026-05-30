import { adminRoutePath, type PlatformModuleId } from "@comvestec/contracts";

/**
 * Canonical builder for `/desk/config` Runtime Config v2 surfaces
 * (admin-app implementation plan §8.5 + §11 — Phase 3 Governance
 * & access commit 2). Mirrors `buildAdminTenantWorkspacePath`:
 * the route detail variant is
 * `/desk/config/{moduleId}/{configKey}` and the list variant is
 * the bare `adminRoutePath.runtimeConfig` literal. Keeps URL
 * construction next to the spec-canonical constant so the
 * admin-app never reaches for an ad hoc template literal.
 */
export type BuildAdminRuntimeConfigPathInput = {
  readonly moduleId?: PlatformModuleId;
  readonly configKey?: string;
};

export const buildAdminRuntimeConfigPath = (
  input: BuildAdminRuntimeConfigPathInput = {},
): string => {
  const { moduleId, configKey } = input;
  if (
    moduleId !== undefined &&
    configKey !== undefined &&
    configKey.length > 0
  ) {
    return `${adminRoutePath.runtimeConfig}/${encodeURIComponent(moduleId)}/${encodeURIComponent(configKey)}`;
  }
  return adminRoutePath.runtimeConfig;
};
