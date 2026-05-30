import { afterEach, describe, expect, it } from "vitest";
import { platformModuleId } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  changeSelectValue,
  click,
  getButtonByText,
  getFieldControlByLabel,
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/desk/flag` Feature Flags
 * v2 surface shipped by Phase 3 Governance & access commit 3
 * (admin-app implementation plan §8.6 + §11). Exercises the
 * `governance-flag-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state plus the new
 * `governance-flag-mutations-server` sibling.
 *
 * Covers: ready list render, detail-route opens drawer + guard,
 * submit flow exercises the mutations-server via `useServerFn`,
 * denied / stale variants flow through `StateScreen`.
 */
const LIST_PATH = "/desk/flag";
const DETAIL_PATH = `/desk/flag/${platformModuleId.featureFlags}.operator-flag-1`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/flag Feature Flags v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.submitFeatureFlagProposal.mockClear();
    mockedLoaders.reviewFeatureFlagProposal.mockClear();
  });

  it("renders the ready list with the dense feature-flag rows", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      LIST_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='feature-flag-list-ready']",
        ) !== null,
      "Expected feature-flag v2 ready list to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='feature-flag-list-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='feature-flag-list-row']",
      ).length,
    ).toBeGreaterThan(0);
    expect(rendered.container.textContent).toContain(
      platformModuleId.featureFlags,
    );
  });

  it("opens the detail drawer + dependency pane when navigated to the deep-link path", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      DETAIL_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='feature-flag-detail-ready']",
        ) !== null,
      "Expected feature-flag detail surface to render.",
      1_500,
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='feature-flag-dependency-pane']",
      ),
    ).not.toBeNull();
    await waitFor(
      () =>
        document.body.textContent?.includes("Approve feature flag change") ??
        false,
      "Expected DiffApprovalDrawer to mount via the Radix portal.",
      1_500,
    );
  });

  it("supports search and enabled-disabled filtering on the flag watchlist", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      LIST_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='feature-flag-list-ready']",
        ) !== null,
      "Expected feature-flag list route to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search by key, owner, or description…",
      ),
      "operator-flag-30",
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("operator-flag-30") ?? false,
      "Expected flag search to reveal the requested key.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search by key, owner, or description…",
      ),
      "",
    );
    await click(getButtonByText(rendered.container, "Disabled"));
    await waitFor(
      () => rendered?.container.textContent?.includes("disabled") ?? false,
      "Expected the disabled filter to pivot the list to disabled flags.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadGovernanceFlagV2: async () => ({
          kind: "denied",
          reason:
            "Feature-flag inspection requires a trusted operator session.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, LIST_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected feature-flag denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Feature-flag inspection requires a trusted operator session.",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='feature-flag-list-ready']",
      ),
    ).toBeNull();
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadGovernanceFlagV2: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, LIST_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access feature flags.",
        ) ?? false,
      "Expected feature-flag stale-session affordance.",
    );
  });

  it("wires the mutations-server submit flow into the HighRiskActionGuard boundary", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      DETAIL_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='feature-flag-detail-ready'] [data-testid='feature-flag-list-row']",
        ) !== null,
      "Expected detail surface with rows to render.",
      2_000,
    );

    await changeSelectValue(
      rendered.container.querySelector<HTMLSelectElement>(
        "[data-testid='feature-flag-enabled-draft']",
      )!,
      "off",
    );
    await changeInputValue(
      document.body.querySelector<HTMLTextAreaElement>(
        "[data-testid='diff-approval-reason']",
      )!,
      "Detail-route browser flag proposal context.",
    );
    await click(
      document.body.querySelector<HTMLButtonElement>(
        "[data-testid='diff-approval-approve']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected feature-flag high-risk guard to open after the diff approval step.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Operator rollout tune",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Browser flag proposal submission.",
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-arm']",
      )!,
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-confirm-final']",
      )!,
    );

    await waitFor(
      () => mockedLoaders.submitFeatureFlagProposal.mock.calls.length === 1,
      "Expected feature-flag proposal submission to flow through the route guard.",
    );

    expect(mockedLoaders.submitFeatureFlagProposal).toHaveBeenCalledWith({
      data: {
        moduleId: platformModuleId.featureFlags,
        key: `${platformModuleId.featureFlags}.operator-flag-1`,
        enabled: false,
        approvalReason:
          "operator-rollout-tune: Browser flag proposal submission.",
      },
    });
  });
});
