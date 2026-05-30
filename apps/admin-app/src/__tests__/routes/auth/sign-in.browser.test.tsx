import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  getLinkByText,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

const PATH_WITH_ACCESS_DENIED_RETURN_TO =
  "/sign-in" + "?returnTo=%2Fr%2Fconfig" + "&reason=access-denied";
const PATH_WITH_INVALID_SEARCH =
  "/sign-in?returnTo=https%3A%2F%2Fevil.example&reason=bogus";
const PATH_SIGNED_OUT = "/sign-in?reason=signed-out";

describe("/sign-in route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders governed access-denied recovery copy and preserves a validated returnTo handoff", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_WITH_ACCESS_DENIED_RETURN_TO,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Sign in to the admin workspace",
        ) ?? false,
      "Expected the admin sign-in route to render its sign-in shell.",
    );

    expect(rendered.container.textContent).toContain(
      "Operator access required",
    );
    expect(rendered.container.textContent).toContain(
      "After sign-in, you will be returned to the page you were trying to open.",
    );
    expect(rendered.container.textContent).not.toContain("/desk/config");

    const continueLink = getLinkByText(
      rendered.container,
      "Continue to sign in",
    );

    expect(continueLink.getAttribute("href")).toBe(
      "/auth/start?returnTo=%2Fdesk%2Fconfig",
    );
  });

  it("drops invalid auth search values and falls back to the default governed handoff", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_WITH_INVALID_SEARCH,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Sign in to the admin workspace",
        ) ?? false,
      "Expected the admin sign-in route to render for invalid auth search params.",
    );

    expect(
      rendered.container.querySelector(".ops-auth-reason-panel"),
    ).toBeNull();
    expect(rendered.container.textContent).toContain(
      "After sign-in, you will land in the admin workspace.",
    );

    const continueLink = getLinkByText(
      rendered.container,
      "Continue to sign in",
    );

    expect(continueLink.getAttribute("href")).toBe("/auth/start");
  });

  it("renders the signed-out recovery state with a clean governed restart action", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_SIGNED_OUT,
    );

    await waitFor(
      () => rendered?.container.textContent?.includes("Signed out") ?? false,
      "Expected the signed-out recovery copy to render on the auth route.",
    );

    expect(rendered.container.textContent).toContain(
      "Your admin session has been cleared.",
    );

    const continueLink = getLinkByText(
      rendered.container,
      "Continue to sign in",
    );

    expect(continueLink.getAttribute("href")).toBe("/auth/start");
  });
});
