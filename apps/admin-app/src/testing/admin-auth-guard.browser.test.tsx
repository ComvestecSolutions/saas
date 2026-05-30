import { afterEach, describe, expect, it } from "vitest";
import { adminRoutePath } from "@comvestec/contracts";
import {
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "./admin-browser-harness";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "./admin-browser-fixtures";
import type { AdminShellRouteData } from "../lib/admin-shell-route-data";

const missionControlLabel = "Mission Control";

const createShellFixture = (
  shellData: AdminShellRouteData,
): AdminBrowserFixtureState => {
  const fixture = createAdminBrowserFixtureState();

  return {
    ...fixture,
    loadShell: async () => shellData,
  };
};

const expectProtectedContentHidden = (container: HTMLElement) => {
  expect(container.textContent).not.toContain(missionControlLabel);
  expect(
    container.querySelector("[data-testid='context-spine-actor-card']"),
  ).toBeNull();
};

const expectRouterDevtoolsHidden = (container: HTMLElement) => {
  expect(
    container.querySelector("[data-testid='router-devtools-sentinel']"),
  ).toBeNull();
};

describe("admin auth guard browser flow", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("blocks protected routes behind the governed sign-in redirect when no trusted session is available", async () => {
    rendered = await renderAdminApp(
      createShellFixture({ kind: "shell" }),
      adminRoutePath.operationsHome,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(".ops-auth-redirect-state") !== null,
      "Expected the root auth redirect state to render for anonymous access.",
    );

    expect(rendered.container.textContent).toContain("Redirecting to sign in…");
    expectProtectedContentHidden(rendered.container);
    expectRouterDevtoolsHidden(rendered.container);
  });

  it("keeps protected route content hidden while a stale session is being recovered", async () => {
    rendered = await renderAdminApp(
      createShellFixture({ kind: "stale-session" }),
      adminRoutePath.operationsHome,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(".ops-auth-redirect-state") !== null,
      "Expected the stale-session redirect state to render at the root shell.",
    );

    expect(rendered.container.textContent).toContain("Redirecting to sign in…");
    expectProtectedContentHidden(rendered.container);
    expectRouterDevtoolsHidden(rendered.container);
  });

  it("shows an access-blocked state instead of looping back through sign-in when the session is authenticated but unauthorized", async () => {
    rendered = await renderAdminApp(
      createShellFixture({
        kind: "denied",
        reason:
          "The current session is authenticated, but only platform and support operators can open the admin workspace.",
      }),
      adminRoutePath.operationsHome,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-pattern='state-screen'][data-variant='denied']",
        ) !== null,
      "Expected the root denied state to render for unauthorized sessions.",
    );

    expect(rendered.container.textContent).toContain("Access denied");
    expect(rendered.container.textContent).toContain(
      "The current session is authenticated, but only platform and support operators can open the admin workspace.",
    );
    expect(
      rendered.container.querySelector(".ops-auth-redirect-state"),
    ).toBeNull();
    expectProtectedContentHidden(rendered.container);
    expectRouterDevtoolsHidden(rendered.container);
  });

  it("shows a non-redirect failure state when shell bootstrap fails after authentication", async () => {
    rendered = await renderAdminApp(
      createShellFixture({
        kind: "error",
        title: "Admin workspace unavailable",
        description: "Admin operator directory is unavailable.",
      }),
      adminRoutePath.operationsHome,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-pattern='state-screen'][data-variant='5xx']",
        ) !== null,
      "Expected the root error state to render when shell bootstrap fails.",
    );

    expect(rendered.container.textContent).toContain(
      "Admin workspace unavailable",
    );
    expect(rendered.container.textContent).toContain(
      "Admin operator directory is unavailable.",
    );
    expect(
      rendered.container.querySelector(".ops-auth-redirect-state"),
    ).toBeNull();
    expectProtectedContentHidden(rendered.container);
    expectRouterDevtoolsHidden(rendered.container);
  });
});
