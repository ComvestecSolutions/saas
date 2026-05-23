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
 * Browser coverage for the spec-canonical `/r/webhook` Webhook
 * Endpoints v2 surface shipped by Phase 5 Support / compliance
 * / integrations operator screens commit 3 (admin-app
 * implementation plan §8.12 + §11). Exercises the
 * `webhook-list-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state.
 *
 * Covers: ready posture board with endpoints + deliveries
 * rosters, denied StateScreen, stale-session StateScreen, error
 * StateScreen.
 */
const PATH = `/r/webhook?scope=${platformScope.organization}&scopeId=org_demo`;
const EMPTY_PATH = "/r/webhook";

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

describe("/r/webhook Webhook Endpoints v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready webhook posture with endpoints + deliveries rosters", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='webhook-list-ready']",
        ) !== null,
      "Expected webhook v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='webhook-list-posture']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='webhook-list-endpoints-table']",
      ),
    ).not.toBeNull();

    await click(getButtonByText(rendered.container, "Deliveries"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='webhook-list-deliveries-table']",
        ) !== null,
      "Expected the deliveries roster to render after the tab pivot.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='webhook-list-deliveries-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='webhook-list-delivery-row']",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      rendered.container.querySelector(
        "[data-testid='webhook-list-delivery-link']",
      ),
    ).not.toBeNull();
  });

  it("starts with the names-first tenant target workflow and supports roster search", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      EMPTY_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Choose a tenant target") ??
        false,
      "Expected webhook route to start in the tenant-target empty state.",
    );

    await selectTenantTargetOption(rendered.container, "Acme Co.");
    await click(getButtonByText(rendered.container, "Load webhook view"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='webhook-list-ready']",
        ) !== null,
      "Expected webhook route to load after selecting a named tenant target.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search subscriptions, URL, or event…",
      ),
      "sub_org_27",
    );
    await waitFor(
      () => rendered?.container.textContent?.includes("sub_org_27") ?? false,
      "Expected subscription search to reveal the requested endpoint.",
    );

    await click(getButtonByText(rendered.container, "Deliveries"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='webhook-list-deliveries-table']",
        ) !== null,
      "Expected deliveries tab to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search deliveries, subscription, or event…",
      ),
      "dlv_org_demo_03",
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("dlv_org_demo_03") ?? false,
      "Expected delivery search to reveal the requested delivery.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWebhookList: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect webhook posture.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected webhook denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect webhook posture.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWebhookList: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access webhook posture.",
        ) ?? false,
      "Expected webhook stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWebhookList: async () => ({
          kind: "error",
          title: "Webhook posture unavailable",
          description: "Upstream webhook adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Webhook posture unavailable",
        ) ?? false,
      "Expected webhook error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream webhook adapter unreachable.",
    );
  });
});
