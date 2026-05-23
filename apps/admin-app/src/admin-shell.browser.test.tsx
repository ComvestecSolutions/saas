import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminShell } from "@comvestec/ui";
import { adminRoutePath } from "@comvestec/contracts";
import { buildAdminShellRedirectPath } from "./lib/admin-shell-loader";
import {
  AdminAuthRedirectState,
  buildAdminAuthRedirectInlineScript,
  resolveAdminShellCurrentLocation,
} from "./routes/__root";

type AdminBrowserHarnessGlobals = typeof globalThis & {
  __ADMIN_BROWSER_HARNESS__?: boolean;
};

const adminBrowserHarnessGlobals = globalThis as AdminBrowserHarnessGlobals;

const baseNavGroups = [
  {
    href: "/",
    label: "Operations Home",
    icon: "O",
    isActive: true,
    allowed: true,
  },
  {
    label: "Governance",
    items: [
      {
        href: "/governance/runtime-config",
        label: "Runtime Config",
        icon: "R",
        isActive: false,
        allowed: true,
      },
      {
        href: "/governance/audit-log",
        label: "Audit Log",
        icon: "A",
        isActive: false,
        allowed: true,
      },
    ],
  },
] as const;

const setWindowWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
};

const parseRouteLocation = (path: string) => {
  const url = new URL(path, "https://admin.local");

  return {
    pathname: url.pathname,
    searchStr: url.search,
  };
};

const restoreAdminBrowserHarnessFlag = (
  previousHarnessFlag: boolean | undefined,
): void => {
  if (previousHarnessFlag === undefined) {
    delete adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;
    return;
  }

  adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__ = previousHarnessFlag;
};

describe("admin shell browser surface", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setWindowWidth(1280);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders navigation groups, context chips, and page content on desktop", async () => {
    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/"
          contextChips={[
            { label: "Env", value: "platform" },
            { label: "Session", value: "sess_admin_shell", mono: true },
          ]}
        >
          <section>Admin dashboard content</section>
        </AdminShell>,
      );
    });

    expect(container.textContent).toContain("Operations Home");
    expect(container.textContent).toContain("Runtime Config");
    expect(container.textContent).toContain("Env");
    expect(container.textContent).toContain("sess_admin_shell");
    expect(container.textContent).toContain("Admin dashboard content");
  });

  it("opens the mobile navigation drawer on small viewports", async () => {
    setWindowWidth(390);

    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/"
          contextChips={[{ label: "Env", value: "platform" }]}
        >
          <section>Mobile shell</section>
        </AdminShell>,
      );
    });

    const toggle = container.querySelector(
      'button[aria-label="Open navigation"]',
    );

    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Runtime Config");
    expect(
      container.querySelector(
        '[role="dialog"][aria-label="Navigation drawer"]',
      ),
    ).not.toBeNull();
  });

  it("closes the mobile navigation drawer when the active route changes", async () => {
    setWindowWidth(390);

    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/"
          contextChips={[{ label: "Env", value: "platform" }]}
        >
          <section>Mobile shell</section>
        </AdminShell>,
      );
    });

    const toggle = container.querySelector(
      'button[aria-label="Open navigation"]',
    );

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector(
        '[role="dialog"][aria-label="Navigation drawer"]',
      ),
    ).not.toBeNull();

    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/governance/runtime-config"
          contextChips={[{ label: "Env", value: "platform" }]}
        >
          <section>Runtime config</section>
        </AdminShell>,
      );
    });

    expect(
      container.querySelector(
        '[role="dialog"][aria-label="Navigation drawer"]',
      ),
    ).toBeNull();
  });

  it("renders the sign-in redirect state for missing root sessions", async () => {
    const previousHarnessFlag =
      adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;
    adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__ = true;

    try {
      const redirectPath = buildAdminShellRedirectPath(
        parseRouteLocation(adminRoutePath.operationsHome),
        { kind: "shell" },
      );

      await act(async () => {
        root.render(<AdminAuthRedirectState redirectPath={redirectPath} />);
      });

      expect(container.textContent).toContain("Redirecting to sign in…");
      expect(container.textContent).toContain(
        "Secure access is required before the admin workspace can load.",
      );
      expect(
        container.querySelector<HTMLElement>(".ops-auth-redirect-state")
          ?.dataset.redirectPath,
      ).toBe(redirectPath);
      expect(container.textContent).toContain(
        "If nothing happens automatically, continue to sign in.",
      );
      expect(
        container
          .querySelector<HTMLAnchorElement>(".ops-auth-redirect-fallback a")
          ?.getAttribute("href"),
      ).toBe(redirectPath);
    } finally {
      restoreAdminBrowserHarnessFlag(previousHarnessFlag);
    }
  });

  it("renders the stale-session recovery redirect state for root routes with search params", async () => {
    const previousHarnessFlag =
      adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;
    adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__ = true;

    try {
      const redirectPath = buildAdminShellRedirectPath(
        parseRouteLocation(
          `${adminRoutePath.branding}?scope=organization&scopeId=org_demo`,
        ),
        { kind: "stale-session" },
      );

      await act(async () => {
        root.render(<AdminAuthRedirectState redirectPath={redirectPath} />);
      });

      expect(container.textContent).toContain("Redirecting to sign in…");
      expect(container.textContent).toContain(
        "Secure access is required before the admin workspace can load.",
      );
      expect(
        container.querySelector<HTMLElement>(".ops-auth-redirect-state")
          ?.dataset.redirectPath,
      ).toBe(redirectPath);
      expect(
        container
          .querySelector<HTMLAnchorElement>(".ops-auth-redirect-fallback a")
          ?.getAttribute("href"),
      ).toBe(redirectPath);
    } finally {
      restoreAdminBrowserHarnessFlag(previousHarnessFlag);
    }
  });

  it("renders an HTML-first redirect fallback for non-hydrated root requests", () => {
    const previousHarnessFlag =
      adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;
    delete adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;

    try {
      const redirectPath = buildAdminShellRedirectPath(
        parseRouteLocation(adminRoutePath.operationsHome),
        { kind: "shell" },
      );
      const markup = renderToStaticMarkup(
        <AdminAuthRedirectState redirectPath={redirectPath} />,
      );

      expect(markup).toContain('data-auth-redirect-script="true"');
      expect(markup).toContain(
        buildAdminAuthRedirectInlineScript(redirectPath),
      );
      expect(markup).toContain(`href="${redirectPath}"`);
    } finally {
      restoreAdminBrowserHarnessFlag(previousHarnessFlag);
    }
  });

  it("prefers the browser auth URL when hydration starts from a stale router location", () => {
    expect(
      resolveAdminShellCurrentLocation(
        {
          pathname: adminRoutePath.operationsHome,
          searchStr: "",
        },
        {
          pathname: "/auth/sign-in",
          search: "?returnTo=%2F",
        },
      ),
    ).toEqual({
      pathname: "/auth/sign-in",
      searchStr: "?returnTo=%2F",
    });
  });
});
