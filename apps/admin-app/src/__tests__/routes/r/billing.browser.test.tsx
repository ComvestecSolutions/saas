import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  click,
  getButtonByText,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

/**
 * Browser coverage for the spec-canonical `/desk/billing` Billing
 * Operations v2 surface shipped by Phase 4 Domain operator
 * screens commit 1 (admin-app implementation plan §8.10 + §11).
 * Exercises the `billing-list-{loader,route-data,route-server}`
 * trio end to end through the admin browser harness mock state.
 *
 * Covers: ready (with rows + posture KPIs), empty (no tenants
 * supplied), denied StateScreen, stale-session StateScreen,
 * error StateScreen.
 */
const PATH_EMPTY = "/desk/billing";
const PATH_WITH_TENANTS = `/desk/billing?tenants=${encodeURIComponent(
  JSON.stringify(
    JSON.stringify([
      { scope: "organization", scopeId: "org_demo" },
      { scope: "enterprise", scopeId: "ent_atlas" },
    ]),
  ),
)}`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/billing Billing Operations v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready posture board with per-tenant rows when tenants are supplied", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_WITH_TENANTS,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='billing-list-ready']",
        ) !== null,
      "Expected billing v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='billing-list-posture']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='billing-list-table']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll("[data-testid='billing-list-row']")
        .length,
    ).toBe(2);
    expect(rendered.container.textContent).toContain("Acme Co.");
    expect(rendered.container.textContent).toContain("Globex");
  });

  it("renders the empty-state pivot when no tenants are supplied", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_EMPTY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='billing-list-ready']",
        ) !== null,
      "Expected billing v2 ready surface to render in empty-state.",
    );

    expect(
      rendered.container.querySelector("[data-testid='billing-list-empty']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='billing-list-pivot-tenants']",
      ),
    ).not.toBeNull();
  });

  it("adds a named tenant target from inside the billing route", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_EMPTY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='billing-list-target-manager']",
        ) !== null,
      "Expected billing target manager to render.",
    );
    await waitFor(
      () => rendered?.container.textContent?.includes("Acme Co.") ?? false,
      "Expected named billing targets to load.",
    );

    await click(getButtonByText(rendered.container, "Acme Co."));
    await click(getButtonByText(rendered.container, "Add billing target"));

    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='billing-list-row']")
          .length === 1,
      "Expected billing route to reload with one selected tenant target.",
    );
    expect(rendered.container.textContent).toContain("Acme Co.");
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='billing-list-target-chip']",
      ),
    ).toHaveLength(1);
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadBillingList: async () => ({
          kind: "denied",
          reason: "The current operator session cannot review billing posture.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH_WITH_TENANTS);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected billing denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot review billing posture.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadBillingList: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH_WITH_TENANTS);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access billing posture.",
        ) ?? false,
      "Expected billing stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadBillingList: async () => ({
          kind: "error",
          title: "Billing posture unavailable",
          description: "Upstream Polar adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH_WITH_TENANTS);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Billing posture unavailable",
        ) ?? false,
      "Expected billing error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream Polar adapter unreachable.",
    );
  });
});
