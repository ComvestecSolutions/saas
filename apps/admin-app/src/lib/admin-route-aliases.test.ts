import { describe, expect, it } from "vitest";
import { adminRoutePath } from "@comvestec/contracts";
import {
  adminPathMatchesRoute,
  canonicalizeAdminAppPathname,
} from "./admin-route-aliases";

describe("admin route aliases", () => {
  it("canonicalizes legacy /r/* resource paths onto /desk/*", () => {
    expect(canonicalizeAdminAppPathname("/r/vendors")).toBe("/desk/vendors");
    expect(canonicalizeAdminAppPathname("/r/run/wfr_123")).toBe(
      "/desk/run/wfr_123",
    );
    expect(canonicalizeAdminAppPathname("/r")).toBe(
      adminRoutePath.operationsHome,
    );
  });

  it("keeps friendly legacy entrypoints aligned with the canonical desk routes", () => {
    expect(canonicalizeAdminAppPathname("/tenants")).toBe(
      adminRoutePath.tenantWorkspaceDiscovery,
    );
    expect(canonicalizeAdminAppPathname("/governance/runtime-config")).toBe(
      adminRoutePath.runtimeConfig,
    );
  });

  it("treats legacy and canonical routes as the same active lane", () => {
    expect(
      adminPathMatchesRoute("/r/support", adminRoutePath.supportOperations),
    ).toBe(true);
    expect(
      adminPathMatchesRoute("/desk/support", adminRoutePath.supportOperations),
    ).toBe(true);
  });
});
