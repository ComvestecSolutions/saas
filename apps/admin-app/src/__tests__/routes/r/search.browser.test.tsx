import { afterEach, describe, expect, it } from "vitest";
import { universalSearchFacet } from "@comvestec/contracts";
import { act } from "react";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

const READY_PATH = "/desk/search?q=operator";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/search search route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready federated search surface and keeps internal result navigation in the router", async () => {
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
    ).toBe("/desk/tenant/ten_omnibar_fixture");

    const resultLink = rendered.container.querySelector(
      "[data-testid='admin-search-result-link']",
    );
    await act(async () => {
      resultLink?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    await waitFor(
      () =>
        rendered?.router.state.location.pathname ===
        "/desk/tenant/ten_omnibar_fixture",
      "Expected internal search result links to navigate through the admin router.",
    );
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-ready']",
        ) !== null,
      "Expected the tenant workspace to render after opening an internal search result.",
    );
  }, 30_000);

  it("paginates larger federated result sets", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadUniversalSearch: async (input) => ({
          kind: "ready",
          fromCache: false,
          result: {
            query: input.query,
            entries: Array.from({ length: 26 }, (_, index) => ({
              facet: universalSearchFacet.tenants,
              id: `ten_search_fixture_${index + 1}`,
              label: `Search result ${String(index + 1).padStart(2, "0")}`,
              subtitle: `Fixture tenant ${String(index + 1).padStart(2, "0")}`,
              scopeTag: "tenant",
              permalink: `/desk/tenant/ten_search_fixture_${index + 1}`,
              fieldClassification: "public",
            })),
            partialFailures: [],
            indexFreshness: {
              lastReindexedAt: new Date(0).toISOString(),
              isFresh: true,
            },
            correlationId: "corr_search_fixture_paged",
            generatedAt: new Date(0).toISOString(),
          },
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, "/desk/search?q=bulk");

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-search-ready']",
        ) !== null,
      "Expected the paginated search surface to render.",
    );

    expect(
      rendered.container.querySelectorAll(
        "[data-testid='admin-search-result-row']",
      ).length,
    ).toBe(10);
    expect(rendered.container.textContent).toContain("Search result 01");

    const nextPageButton = rendered.container.querySelector(
      "[aria-label='Next page']",
    );
    await act(async () => {
      nextPageButton?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Search result 11") ?? false,
      "Expected the second page of search results to render.",
    );
    const rows = Array.from(
      rendered.container.querySelectorAll(
        "[data-testid='admin-search-result-row']",
      ),
    );
    expect(rows).toHaveLength(10);
    expect(rows[0]?.textContent).toContain("Search result 11");
    expect(rows[9]?.textContent).toContain("Search result 20");
  });

  it("renders the empty search state before a query is submitted", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/desk/search",
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
