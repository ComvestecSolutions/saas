import { adminRoutePath } from "@comvestec/contracts";
import { redirect } from "@tanstack/react-router";
import { canonicalizeAdminAppPathname } from "./admin-route-aliases";
import { buildAdminTenantTarget } from "./admin-tenant-target";
import { encodeAdminRouteTenantTargets } from "./admin-route-tenant-targets";

type AdminLegacyRouteLocation = {
  readonly pathname?: string;
  readonly searchStr?: string;
  readonly hash?: string;
};

type AdminLegacyRoutePathLocation = AdminLegacyRouteLocation & {
  readonly pathname: string;
};

export const buildAdminLegacyRouteRedirectHref = (
  canonicalPath: string,
  location: Readonly<AdminLegacyRouteLocation>,
): string =>
  `${canonicalPath}${location.searchStr ?? ""}${location.hash ?? ""}`;

const buildBrandingLegacyRouteRedirectHref = (
  location: Readonly<AdminLegacyRouteLocation>,
): string => {
  const legacySearch = new URLSearchParams(location.searchStr ?? "");
  const redirectedSearchParts: string[] = [];
  const tenantTarget = buildAdminTenantTarget({
    scope: legacySearch.get("scope"),
    scopeId: legacySearch.get("scopeId") ?? "",
  });

  if (tenantTarget !== undefined) {
    const encodedTargets = encodeAdminRouteTenantTargets([tenantTarget]);

    if (encodedTargets !== undefined) {
      redirectedSearchParts.push(
        `tenants=${encodeURIComponent(encodedTargets)}`,
      );
    }

    redirectedSearchParts.push(
      `selectedTenantId=${encodeURIComponent(tenantTarget.scopeId)}`,
    );
  }

  const searchStr =
    redirectedSearchParts.length > 0
      ? `?${redirectedSearchParts.join("&")}`
      : "";
  return `${adminRoutePath.branding}${searchStr}${location.hash ?? ""}`;
};

export const buildCanonicalAdminLegacyHref = (
  location: Readonly<AdminLegacyRoutePathLocation>,
): string =>
  location.pathname === "/branding"
    ? buildBrandingLegacyRouteRedirectHref(location)
    : buildAdminLegacyRouteRedirectHref(
        canonicalizeAdminAppPathname(location.pathname),
        location,
      );

export const redirectAdminLegacyHref = (href: string): never => {
  throw redirect({
    href,
    replace: true,
  });
};

export const redirectAdminLegacyRoute = (
  canonicalPath: string,
  location: Readonly<AdminLegacyRouteLocation>,
): never =>
  redirectAdminLegacyHref(
    buildAdminLegacyRouteRedirectHref(canonicalPath, location),
  );
