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
 * Browser coverage for the spec-canonical `/desk/support` Support &
 * Incident v2 surface shipped by Phase 5 Support / compliance /
 * integrations operator screens commit 1 (admin-app
 * implementation plan §8.8 + §11). Exercises the
 * `support-cases-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state.
 *
 * Covers: ready posture board with case + incident + impersonation
 * rosters, denied StateScreen, stale-session StateScreen, error
 * StateScreen.
 */
const PATH = "/desk/support";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/support Support & Incident v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready support workspace with rosters", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='support-cases-ready']",
        ) !== null,
      "Expected support v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='support-cases-posture']"),
    ).not.toBeNull();

    await click(getButtonByText(rendered.container, "Break-glass"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='support-cases-incidents-table']",
        ) !== null,
      "Expected the break-glass roster to render after tab pivot.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='support-cases-incidents-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='support-cases-incident-row']",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      rendered.container.querySelector(
        "[data-testid='support-cases-incident-link']",
      ),
    ).not.toBeNull();
  });

  it("supports tab pivots and targeted search within the support workspace", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='support-cases-ready']",
        ) !== null,
      "Expected support workspace to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search case id, tenant, summary, or agent…",
      ),
      "case_ent_onboarding",
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("case_ent_onboarding") ??
        false,
      "Expected case search to reveal the requested support case.",
    );

    await click(getButtonByText(rendered.container, "Break-glass"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='support-cases-incidents-table']",
        ) !== null,
      "Expected the break-glass tab to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search incident id, reviewer, or reason…",
      ),
      "incident_case_01",
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("incident_case_01") ?? false,
      "Expected incident search to narrow the roster to the selected incident.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadSupportCases: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot review support workspace.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected support denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot review support workspace.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadSupportCases: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access the support workspace.",
        ) ?? false,
      "Expected support stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadSupportCases: async () => ({
          kind: "error",
          title: "Support workspace unavailable",
          description: "Upstream support-operations adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Support workspace unavailable",
        ) ?? false,
      "Expected support error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream support-operations adapter unreachable.",
    );
  });
});
