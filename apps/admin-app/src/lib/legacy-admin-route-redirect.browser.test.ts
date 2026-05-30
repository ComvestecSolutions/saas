import { describe, expect, it } from "vitest";
import { adminRoutePath, platformScope } from "@comvestec/contracts";
import { decodeAdminRouteTenantTargets } from "./admin-route-tenant-targets";
import { buildCanonicalAdminLegacyHref } from "./legacy-admin-route-redirect";

describe("legacy admin route redirect", () => {
  it("decodes parsed tenant target arrays from TanStack search parsing", () => {
    expect(
      decodeAdminRouteTenantTargets([
        {
          scope: platformScope.organization,
          scopeId: "org_demo",
        },
      ]),
    ).toEqual([
      {
        scope: platformScope.organization,
        scopeId: "org_demo",
      },
    ]);
  });

  it("translates legacy branding scope search onto canonical branding targets", () => {
    const href = buildCanonicalAdminLegacyHref({
      pathname: "/branding",
      searchStr: `?scope=${platformScope.organization}&scopeId=org_demo`,
    });
    const redirectedUrl = new URL(`https://admin.test${href}`);

    expect(redirectedUrl.pathname).toBe(adminRoutePath.branding);
    expect(redirectedUrl.searchParams.get("selectedTenantId")).toBe("org_demo");
    expect(
      decodeAdminRouteTenantTargets(
        redirectedUrl.searchParams.get("tenants") ?? undefined,
      ),
    ).toEqual([
      {
        scope: platformScope.organization,
        scopeId: "org_demo",
      },
    ]);
  });

  it("keeps non-branding legacy routes aligned to the canonical desk path", () => {
    expect(
      buildCanonicalAdminLegacyHref({
        pathname: "/support-operations",
        searchStr: "?tab=incidents",
      }),
    ).toBe(`${adminRoutePath.supportOperations}?tab=incidents`);
  });
});
