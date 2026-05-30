import {
  adminRoutePath,
  universalSearchFacet,
  type UniversalSearchEntry,
  type UniversalSearchFacet,
} from "@comvestec/contracts";

const facetFallbackPath: Record<UniversalSearchFacet, string> = {
  [universalSearchFacet.tenants]: adminRoutePath.tenantWorkspaceDiscovery,
  [universalSearchFacet.users]: adminRoutePath.accessControl,
  [universalSearchFacet.featureFlags]: adminRoutePath.featureFlags,
  [universalSearchFacet.configKeys]: adminRoutePath.runtimeConfig,
  [universalSearchFacet.auditEvents]: "/desk/audit",
  [universalSearchFacet.invoices]: adminRoutePath.billing,
  [universalSearchFacet.webhooks]: adminRoutePath.webhooksApiAccess,
  [universalSearchFacet.customDomains]: adminRoutePath.branding,
};

export const resolveUniversalSearchEntryPermalink = (
  entry: UniversalSearchEntry,
): string => {
  if (entry.permalink.length > 0) return entry.permalink;
  if (entry.facet === universalSearchFacet.tenants) {
    return `/desk/tenant/${entry.id}`;
  }
  const fallback = facetFallbackPath[entry.facet];
  return fallback === undefined ? `/desk/${entry.facet}/${entry.id}` : fallback;
};

export const universalSearchFacetLabel = (
  facet: UniversalSearchFacet,
): string => {
  switch (facet) {
    case universalSearchFacet.tenants:
      return "Tenant";
    case universalSearchFacet.users:
      return "User";
    case universalSearchFacet.featureFlags:
      return "Flag";
    case universalSearchFacet.configKeys:
      return "Config";
    case universalSearchFacet.auditEvents:
      return "Audit";
    case universalSearchFacet.invoices:
      return "Invoice";
    case universalSearchFacet.webhooks:
      return "Webhook";
    case universalSearchFacet.customDomains:
      return "Domain";
  }
};
