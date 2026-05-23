import { afterEach, describe, expect, it } from "vitest";
import { adminRoutePath } from "@comvestec/contracts";
import { mockedLoaders } from "./admin-browser-mock-state";
import { renderAdminApp, type RenderedAdminApp } from "./admin-browser-harness";
import { createAdminBrowserFixtureState } from "./admin-browser-fixtures";

type AdminBrowserHarnessGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  __ADMIN_BROWSER_HARNESS__?: boolean;
};

const adminBrowserHarnessGlobals = globalThis as AdminBrowserHarnessGlobals;

const shellLocation = {
  pathname: adminRoutePath.operationsHome,
  searchStr: "",
};

describe("admin browser harness", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("rejects concurrent renders and restores globals after cleanup", async () => {
    const previousActEnvironment =
      adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT;
    const previousHarnessFlag =
      adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;

    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.operationsHome,
    );

    await expect(
      renderAdminApp(
        createAdminBrowserFixtureState(),
        adminRoutePath.operationsHome,
      ),
    ).rejects.toThrow(
      "Concurrent admin browser harness renders are not supported.",
    );

    expect(adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT).toBe(true);
    expect(adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__).toBe(true);

    await rendered.cleanup();
    rendered = null;

    expect(adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT).toBe(
      previousActEnvironment,
    );
    expect(adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__).toBe(
      previousHarnessFlag,
    );
    expect(() => mockedLoaders.shell(shellLocation)).toThrow(
      "Admin browser fixture state has not been registered.",
    );
  });

  it("restores globals and fixture state when setup fails", async () => {
    const previousActEnvironment =
      adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT;
    const previousHarnessFlag =
      adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__;
    const originalReplaceState = window.history.replaceState.bind(
      window.history,
    );

    window.history.replaceState = (() => {
      throw new Error("history.replaceState failure");
    }) as typeof window.history.replaceState;

    try {
      await expect(
        renderAdminApp(
          createAdminBrowserFixtureState(),
          adminRoutePath.operationsHome,
        ),
      ).rejects.toThrow("history.replaceState failure");
    } finally {
      window.history.replaceState = originalReplaceState;
    }

    expect(adminBrowserHarnessGlobals.IS_REACT_ACT_ENVIRONMENT).toBe(
      previousActEnvironment,
    );
    expect(adminBrowserHarnessGlobals.__ADMIN_BROWSER_HARNESS__).toBe(
      previousHarnessFlag,
    );
    expect(() => mockedLoaders.shell(shellLocation)).toThrow(
      "Admin browser fixture state has not been registered.",
    );
  });
});
