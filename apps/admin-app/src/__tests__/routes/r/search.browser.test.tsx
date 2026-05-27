import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

const READY_PATH = "/r/search?q=operator";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/search search route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready federated search surface", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      READY_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-search-ready']",
        ) !== null,
      "Expected admin search ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='admin-search-results-table']",
      ),
    ).not.toBeNull();
    expect(rendered.container.textContent).toContain(
      'Omnibar tenant match for "operator"',
    );
    expect(
      rendered.container
        .querySelector("[data-testid='admin-search-result-link']")
        ?.getAttribute("href"),
    ).toBe("/r/tenant/ten_omnibar_fixture");
  }, 30_000);

  it("renders the empty search state before a query is submitted", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/r/search",
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-search-empty']",
        ) !== null,
      "Expected admin search empty state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Search the operator catalog",
    );
  });

  it("surfaces a denied state when federated search is blocked", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadUniversalSearch: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot run federated omnibar search.",
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, READY_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected admin search denied state to render.",
    );
  });

  it("surfaces an error state when the federated search service fails", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadUniversalSearch: async () => ({
          kind: "error",
          title: "Search unavailable",
          description: "Universal search facets are currently unavailable.",
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, READY_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Search unavailable") ??
        false,
      "Expected admin search error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Universal search facets are currently unavailable.",
    );
  });
});
