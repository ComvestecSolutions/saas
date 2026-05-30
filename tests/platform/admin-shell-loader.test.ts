import {
  actorType,
  adminOperatorCapability,
  adminRoutePath,
} from "@comvestec/contracts";
import {
  adminAuthRoutePath,
  buildAdminSignInPath,
  buildAdminStaleSessionPath,
} from "../../apps/admin-app/src/auth/paths";
import {
  buildAdminShellRedirectPath,
  loadAdminShellRouteDataForCurrentRuntime,
  loadAdminShellLoaderData,
} from "../../apps/admin-app/src/lib/admin-shell-loader";
import type { AdminShellRouteData } from "../../apps/admin-app/src/lib/admin-shell-route-data";
import { buildAdminTenantTarget } from "../../apps/admin-app/src/lib/admin-tenant-target";
import { encodeAdminRouteTenantTargets } from "../../apps/admin-app/src/lib/admin-route-tenant-targets";
import { vi } from "vitest";

const capabilitySnapshot = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess_admin_shell",
  capabilities: [
    {
      capability: adminOperatorCapability.operationsHome,
      routePath: adminRoutePath.operationsHome,
      visible: true,
      allowed: true,
      label: "Operations Home",
      actionPolicyIds: [],
    },
  ],
} as const;

const operatorProfile = {
  identity: {
    actorId: capabilitySnapshot.actorId,
    username: "operator@comvestec.com",
    email: "operator@comvestec.com",
    displayName: "Comvestec Platform Operator",
    actorType: actorType.platformOperator,
    enabled: true,
  },
  sessionId: capabilitySnapshot.sessionId,
  capabilities: capabilitySnapshot.capabilities,
} as const;

const readyShellData = {
  kind: "ready",
  profile: operatorProfile,
  workspaces: [],
  savedViews: [],
  runAsBanner: {
    active: false,
    releasable: false,
  },
} as const satisfies AdminShellRouteData;

describe("admin shell loader", () => {
  it("keeps auth routes public so the sign-in flow can load without a session", async () => {
    const loadRouteData = vi.fn(async () => ({ kind: "shell" }) as const);

    await expect(
      loadAdminShellLoaderData(
        {
          pathname: adminAuthRoutePath.signIn,
          searchStr: "?returnTo=%2Fr%2Fconfig",
        },
        loadRouteData,
      ),
    ).resolves.toEqual({ kind: "shell" });
    expect(loadRouteData).not.toHaveBeenCalled();
  });

  it("returns the trusted operator shell data for protected routes", async () => {
    await expect(
      loadAdminShellLoaderData(
        { pathname: "/", searchStr: "" },
        async () => readyShellData,
      ),
    ).resolves.toEqual(readyShellData);
  });

  it("passes anonymous access through so the root shell can render the governed redirect state", async () => {
    await expect(
      loadAdminShellLoaderData(
        {
          pathname: "/governance/runtime-config",
          searchStr: "?tab=audit",
        },
        async () => ({ kind: "shell" }),
      ),
    ).resolves.toEqual({ kind: "shell" });
  });

  it("passes stale sessions through so the root shell can render the recovery redirect state", async () => {
    await expect(
      loadAdminShellLoaderData(
        {
          pathname: "/billing",
          searchStr: "?view=entitlements",
        },
        async () => ({ kind: "stale-session" }),
      ),
    ).resolves.toEqual({ kind: "stale-session" });
  });

  it("passes denied sessions through so the root shell can render an access-blocked state", async () => {
    await expect(
      loadAdminShellLoaderData(
        {
          pathname: "/",
          searchStr: "",
        },
        async () => ({
          kind: "denied",
          reason:
            "The current session is authenticated, but only platform and support operators can open the admin workspace.",
        }),
      ),
    ).resolves.toEqual({
      kind: "denied",
      reason:
        "The current session is authenticated, but only platform and support operators can open the admin workspace.",
    });
  });

  it("passes shell bootstrap failures through so the root shell can render a non-redirect error state", async () => {
    await expect(
      loadAdminShellLoaderData(
        {
          pathname: adminRoutePath.operationsHome,
          searchStr: "",
        },
        async () => ({
          kind: "error",
          title: "Admin workspace unavailable",
          description: "Admin operator directory is unavailable.",
        }),
      ),
    ).resolves.toEqual({
      kind: "error",
      title: "Admin workspace unavailable",
      description: "Admin operator directory is unavailable.",
    });
  });

  it("reads the current server request when resolving protected shell data during SSR", async () => {
    const serverRequest = new Request("http://localhost:3004/");
    const getCurrentServerRequest = vi.fn(() => serverRequest);
    const loadServerRouteDataFromRequest = vi.fn(async () => readyShellData);
    const loadClientRouteData = vi.fn(async () => ({ kind: "shell" }) as const);

    await expect(
      loadAdminShellRouteDataForCurrentRuntime({
        isBrowserRuntime: false,
        getCurrentServerRequest,
        loadServerRouteDataFromRequest,
        loadClientRouteData,
      }),
    ).resolves.toEqual(readyShellData);
    expect(getCurrentServerRequest).toHaveBeenCalledTimes(1);
    expect(loadServerRouteDataFromRequest).toHaveBeenCalledWith(serverRequest);
    expect(loadClientRouteData).not.toHaveBeenCalled();
  });

  it("falls back to the server-fn loader during SSR when the direct request path resolves to shell", async () => {
    const serverRequest = new Request("http://localhost:3004/");
    const getCurrentServerRequest = vi.fn(() => serverRequest);
    const loadServerRouteDataFromRequest = vi.fn(
      async (): Promise<AdminShellRouteData> => ({
        kind: "shell",
      }),
    );
    const loadClientRouteData = vi.fn(async () => readyShellData);

    await expect(
      loadAdminShellRouteDataForCurrentRuntime({
        isBrowserRuntime: false,
        getCurrentServerRequest,
        loadServerRouteDataFromRequest,
        loadClientRouteData,
      }),
    ).resolves.toEqual(readyShellData);
    expect(getCurrentServerRequest).toHaveBeenCalledTimes(1);
    expect(loadServerRouteDataFromRequest).toHaveBeenCalledWith(serverRequest);
    expect(loadClientRouteData).toHaveBeenCalledTimes(1);
  });

  it("uses the client server-fn loader after hydration instead of the SSR request reader", async () => {
    const getCurrentServerRequest = vi.fn(
      () => new Request("http://localhost:3004/"),
    );
    const loadServerRouteDataFromRequest = vi.fn(async () => readyShellData);
    const loadClientRouteData = vi.fn(async () => readyShellData);

    await expect(
      loadAdminShellRouteDataForCurrentRuntime({
        isBrowserRuntime: true,
        getCurrentServerRequest,
        loadServerRouteDataFromRequest,
        loadClientRouteData,
      }),
    ).resolves.toEqual(readyShellData);
    expect(loadClientRouteData).toHaveBeenCalledTimes(1);
    expect(getCurrentServerRequest).not.toHaveBeenCalled();
    expect(loadServerRouteDataFromRequest).not.toHaveBeenCalled();
  });

  it("builds the governed sign-in redirect path with the full return path", () => {
    expect(
      buildAdminShellRedirectPath(
        {
          pathname: "/governance/runtime-config",
          searchStr: "?tab=audit",
        },
        { kind: "shell" },
      ),
    ).toBe(
      buildAdminSignInPath({
        returnTo: "/desk/config?tab=audit",
      }),
    );
  });

  it("builds the stale-session recovery redirect path before returning to sign-in", () => {
    expect(
      buildAdminShellRedirectPath(
        {
          pathname: "/billing",
          searchStr: "?view=entitlements",
        },
        { kind: "stale-session" },
      ),
    ).toBe(
      buildAdminStaleSessionPath({
        returnTo: "/desk/billing?view=entitlements",
      }),
    );
  });

  it("canonicalizes legacy branding return-to paths before auth redirects", () => {
    const tenantTarget = buildAdminTenantTarget({
      scope: "organization",
      scopeId: "org_demo",
    });

    if (tenantTarget === undefined) {
      throw new TypeError(
        "Expected branding tenant target fixture to be valid.",
      );
    }

    const encodedTargets = encodeAdminRouteTenantTargets([tenantTarget]);

    if (encodedTargets === undefined) {
      throw new TypeError("Expected branding tenant targets to encode.");
    }

    expect(
      buildAdminShellRedirectPath(
        {
          pathname: "/branding",
          searchStr: "?scope=organization&scopeId=org_demo",
        },
        { kind: "shell" },
      ),
    ).toBe(
      buildAdminSignInPath({
        returnTo: `/desk/branding?tenants=${encodeURIComponent(
          encodedTargets,
        )}&selectedTenantId=org_demo`,
      }),
    );
  });

  it("builds the redirect path without exposing the protected shell", () => {
    expect(
      buildAdminShellRedirectPath(
        {
          pathname: "/support-operations",
          searchStr: "?queue=open",
        },
        { kind: "shell" },
      ),
    ).toBe(
      buildAdminSignInPath({
        returnTo: "/desk/support?queue=open",
      }),
    );
  });
});
