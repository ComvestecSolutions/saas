import { afterEach, describe, expect, it } from "vitest";
import { platformScope } from "@comvestec/contracts";
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
 * Browser coverage for the spec-canonical `/desk/retention`
 * Retention & Legal-hold v2 surface shipped by Phase 5 Support
 * / compliance / integrations operator screens commit 2
 * (admin-app implementation plan §8.11 + §11). Exercises the
 * `retention-list-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state.
 *
 * Covers: ready posture board with policies + holds rosters,
 * denied StateScreen, stale-session StateScreen, error
 * StateScreen.
 */
const PATH = `/desk/retention?scope=${platformScope.organization}&scopeId=org_demo`;
const EMPTY_PATH = "/desk/retention";

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

describe("/desk/retention Retention & Legal-hold v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready retention workspace with policies + holds rosters", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='retention-list-ready']",
        ) !== null,
      "Expected retention v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='retention-list-posture']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='retention-list-policies-table']",
      ),
    ).not.toBeNull();

    await click(getButtonByText(rendered.container, "Legal holds"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='retention-list-holds-table']",
        ) !== null,
      "Expected the legal-holds roster to render after the tab pivot.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='retention-list-holds-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='retention-list-hold-row']",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      rendered.container.querySelector(
        "[data-testid='retention-list-hold-link']",
      ),
    ).not.toBeNull();
  });

  it("starts with the names-first tenant target workflow and supports policy + hold search", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      EMPTY_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Choose a tenant target") ??
        false,
      "Expected retention route to start in the tenant-target empty state.",
    );

    await selectTenantTargetOption(rendered.container, "Acme Co.");
    await click(getButtonByText(rendered.container, "Load retention view"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='retention-list-ready']",
        ) !== null,
      "Expected retention route to load after selecting a named tenant target.",
    );

    await changeInputValue(
      getInputByPlaceholder(rendered.container, "Search policies…"),
      "policy_org_28",
    );
    await waitFor(
      () => rendered?.container.textContent?.includes("policy_org_28") ?? false,
      "Expected policy search to reveal the requested policy.",
    );

    await click(getButtonByText(rendered.container, "Legal holds"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='retention-list-holds-table']",
        ) !== null,
      "Expected legal holds tab to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search holds, targets, or evidence…",
      ),
      "hold_org_03",
    );
    await waitFor(
      () => rendered?.container.textContent?.includes("hold_org_03") ?? false,
      "Expected legal-hold search to reveal the requested hold.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadRetentionList: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot review retention posture.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected retention denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot review retention posture.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadRetentionList: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access retention posture.",
        ) ?? false,
      "Expected retention stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadRetentionList: async () => ({
          kind: "error",
          title: "Retention posture unavailable",
          description: "Upstream retention adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Retention posture unavailable",
        ) ?? false,
      "Expected retention error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream retention adapter unreachable.",
    );
  });
});
