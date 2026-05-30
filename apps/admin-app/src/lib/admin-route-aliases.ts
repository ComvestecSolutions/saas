import { adminRoutePath } from "@comvestec/contracts";

const adminLegacyRouteAliasByPath = new Map<string, string>([
  ["/", adminRoutePath.operationsHome],
  ["/profile", adminRoutePath.profile],
  ["/governance/runtime-config", adminRoutePath.runtimeConfig],
  ["/governance/feature-flags", adminRoutePath.featureFlags],
  ["/governance/access-control", adminRoutePath.accessControl],
  ["/governance/audit-log", adminRoutePath.auditLog],
  ["/support-operations", adminRoutePath.supportOperations],
  ["/branding", adminRoutePath.branding],
  ["/billing", adminRoutePath.billing],
  ["/compliance-retention", adminRoutePath.complianceRetention],
  ["/integrations/webhooks-api-access", adminRoutePath.webhooksApiAccess],
  ["/tenants", adminRoutePath.tenantWorkspaceDiscovery],
  ["/tenants/", adminRoutePath.tenantWorkspaceDiscovery],
  ["/r", adminRoutePath.operationsHome],
  ["/r/", adminRoutePath.operationsHome],
]);

export const canonicalizeAdminAppPathname = (pathname: string): string => {
  const aliasedPath = adminLegacyRouteAliasByPath.get(pathname);

  if (aliasedPath !== undefined) {
    return aliasedPath;
  }

  if (pathname.startsWith("/r/")) {
    return `/desk/${pathname.slice(3)}`;
  }

  return pathname;
};

export const adminPathMatchesRoute = (
  currentPath: string,
  routePath: string,
): boolean => {
  const canonicalCurrentPath = canonicalizeAdminAppPathname(currentPath);

  return (
    canonicalCurrentPath === routePath ||
    canonicalCurrentPath.startsWith(`${routePath}/`)
  );
};
