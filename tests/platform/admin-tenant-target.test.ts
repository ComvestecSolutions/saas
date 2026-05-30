import { describe, expect, it } from "vitest";
import { adminRoutePath, platformScope } from "@comvestec/contracts";
import {
  buildAdminTenantContext,
  buildAdminTenantScopedRoutePath,
  buildAdminTenantWorkspacePath,
  resolveAdminTenantTargetScope,
  serializeAdminTenantTarget,
} from "../../apps/admin-app/src/lib/admin-tenant-target";

describe("admin tenant target helpers", () => {
  it("accepts only supported tenant scopes", () => {
    expect(resolveAdminTenantTargetScope(platformScope.organization)).toBe(
      platformScope.organization,
    );
    expect(resolveAdminTenantTargetScope(platformScope.enterprise)).toBe(
      platformScope.enterprise,
    );
    expect(
      resolveAdminTenantTargetScope(platformScope.platform),
    ).toBeUndefined();
    expect(resolveAdminTenantTargetScope("")).toBeUndefined();
  });

  it("builds tenant context and operator routes from the same target", () => {
    const target = {
      scope: platformScope.individual,
      scopeId: "ind_demo",
    } as const;

    expect(buildAdminTenantContext(target)).toEqual({
      scope: platformScope.individual,
      scopeId: "ind_demo",
      individualId: "ind_demo",
    });
    expect(buildAdminTenantWorkspacePath(target)).toBe(
      "/desk/tenant/ind_demo?scope=individual",
    );
    expect(
      buildAdminTenantScopedRoutePath(adminRoutePath.branding, target),
    ).toBe("/desk/branding?scope=individual&scopeId=ind_demo");
    expect(serializeAdminTenantTarget(target)).toBe("individual:ind_demo");
  });
});
