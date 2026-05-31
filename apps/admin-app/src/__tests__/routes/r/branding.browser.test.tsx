import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  click,
  getButtonByText,
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

/**
 * Browser coverage for the spec-canonical `/desk/branding` Branding
 * & Domains v2 surface shipped by Phase 4 Domain operator
 * screens commit 2 (admin-app implementation plan §8.10 + §11).
 * Exercises the `branding-list-{loader,route-data,route-server}`
 * trio end to end through the admin browser harness mock state.
 *
 * Covers: names-first target management, ready posture board,
 * empty-state pivot, denied StateScreen, stale-session
 * StateScreen, error StateScreen.
 */
const PATH_EMPTY = "/desk/branding";
const PATH_WITH_TENANTS = `/desk/branding?tenants=${encodeURIComponent(
  JSON.stringify(
    JSON.stringify([
      { scope: "organization", scopeId: "org_demo" },
      { scope: "enterprise", scopeId: "ent_atlas" },
    ]),
  ),
)}`;
const PATH_WITH_LEGACY_SELECTED_TENANT = `${PATH_WITH_TENANTS}&selectedTenantId=org_demo`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

const selectTenantTargetOption = async (
  container: ParentNode,
  label: string,
) => {
  await waitFor(
    () => container.textContent?.includes(label) ?? false,
    `Expected tenant target option ${label} to render.`,
  );
  await click(getButtonByText(container, label));
};

describe("/desk/branding Branding & Domains v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("builds the branding posture board from named targets and supports search + focused-tenant review", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_EMPTY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='branding-list-ready']",
        ) !== null,
      "Expected branding ready surface to render.",
    );

    await selectTenantTargetOption(rendered.container, "Acme Co.");
    await click(getButtonByText(rendered.container, "Add branding target"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='branding-list-row']",
        ).length === 1,
      "Expected the first branding target to load.",
    );

    await selectTenantTargetOption(rendered.container, "Globex");
    await click(getButtonByText(rendered.container, "Add branding target"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='branding-list-row']",
        ).length === 2,
      "Expected both branding targets to load.",
    );

    expect(
      rendered.container.querySelector("[data-testid='branding-list-posture']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='branding-list-table']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll("[data-testid='branding-list-row']")
        .length,
    ).toBe(2);
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='branding-list-domain-status']",
      ).length,
    ).toBe(2);
    expect(rendered.container.textContent).toContain("Fixture ent_atlas");

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search target, company, or domain status…",
      ),
      "Fixture ent_atlas",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='branding-list-row']",
        ).length === 1,
      "Expected branding search to narrow the posture board to the requested tenant.",
    );
  });

  it("renders the empty-state pivot when no tenants are supplied", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_EMPTY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='branding-list-ready']",
        ) !== null,
      "Expected branding ready surface to render in empty-state.",
    );

    expect(
      rendered.container.querySelector("[data-testid='branding-list-empty']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='branding-list-pivot-tenants']",
      ),
    ).not.toBeNull();
  });

  it("keeps legacy selectedTenantId scope ids focused after hydration", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_WITH_LEGACY_SELECTED_TENANT,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='branding-list-focus-panel']",
        ) !== null,
      "Expected the branding focus panel to render for the legacy selected tenant id.",
    );

    const selectedChip = rendered.container.querySelector<HTMLElement>(
      "[data-testid='branding-list-target-chip'][data-selected='true']",
    );

    expect(selectedChip).not.toBeNull();
    expect(selectedChip?.textContent).toContain("Org Demo");
    expect(
      rendered.container.querySelector(
        "[data-testid='branding-list-focus-panel']",
      )?.textContent,
    ).toContain("Org Demo");
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadBrandingList: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot review branding posture.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH_WITH_TENANTS);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected branding denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot review branding posture.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadBrandingList: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH_WITH_TENANTS);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access branding posture.",
        ) ?? false,
      "Expected branding stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadBrandingList: async () => ({
          kind: "error",
          title: "Branding posture unavailable",
          description: "Upstream tenant-branding adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH_WITH_TENANTS);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Branding posture unavailable",
        ) ?? false,
      "Expected branding error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream tenant-branding adapter unreachable.",
    );
  });
});
