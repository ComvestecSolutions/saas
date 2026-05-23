import { afterEach, describe, expect, it } from "vitest";
import { platformModuleId, platformScope } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
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
 * Browser coverage for the spec-canonical `/r/config` Runtime
 * Config v2 surface shipped by Phase 3 Governance & access
 * commit 2 (admin-app implementation plan §8.5 + §11). Exercises
 * the `governance-config-{loader,route-data,route-server}` trio
 * end to end through the admin browser harness mock state plus
 * the new `governance-config-mutations-server` sibling.
 *
 * Covers: ready list render, detail-route opens drawer + guard,
 * submit flow exercises the mutations-server via `useServerFn`,
 * denied / stale variants flow through `StateScreen`.
 */
const LIST_PATH = "/r/config";
const DETAIL_KEY = `${platformModuleId.runtimeConfig}.session.timeout-29`;
const DETAIL_PATH = `/r/config/${platformModuleId.runtimeConfig}/${DETAIL_KEY}`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/config Runtime Config v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.submitRuntimeConfigProposal.mockClear();
    mockedLoaders.reviewRuntimeConfigProposal.mockClear();
  });

  it("renders the ready list with the dense runtime-config rows", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      LIST_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='runtime-config-list-ready']",
        ) !== null,
      "Expected runtime-config v2 ready list to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='runtime-config-list-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='runtime-config-list-row']",
      ).length,
    ).toBeGreaterThan(0);
    expect(rendered.container.textContent).toContain(
      platformModuleId.runtimeConfig,
    );
  });

  it("opens the detail drawer when navigated to the deep-link path", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      DETAIL_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='runtime-config-detail-ready']",
        ) !== null,
      "Expected runtime-config detail surface to render.",
      1_500,
    );

    await waitFor(
      () =>
        document.body.textContent?.includes("Approve runtime config change") ??
        false,
      "Expected DiffApprovalDrawer to mount via the Radix portal.",
      1_500,
    );
  });

  it("supports override search and proposal search through the tabbed governance workspace", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      LIST_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='runtime-config-list-ready']",
        ) !== null,
      "Expected runtime-config list route to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search by module, key, scope, or value…",
      ),
      "timeout-29",
    );
    await waitFor(
      () => rendered?.container.textContent?.includes("timeout-29") ?? false,
      "Expected override search to narrow the table to the requested key.",
    );
    expect(rendered.container.textContent).not.toContain("timeout-01");

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search by module, key, scope, or value…",
      ),
      "",
    );
    await click(getButtonByText(rendered.container, "Proposals"));
    await changeInputValue(
      getInputByPlaceholder(rendered.container, "Search proposals…"),
      `${platformModuleId.featureFlags}.proposal.rollout-28`,
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("proposal.rollout-28") ??
        false,
      "Expected proposal search to reveal the requested staged change.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadGovernanceConfigV2: async () => ({
          kind: "denied",
          reason:
            "Runtime config inspection requires a trusted operator session.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, LIST_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected runtime-config denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Runtime config inspection requires a trusted operator session.",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='runtime-config-list-ready']",
      ),
    ).toBeNull();
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadGovernanceConfigV2: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, LIST_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access runtime configuration.",
        ) ?? false,
      "Expected runtime-config stale-session affordance.",
    );
  });

  it("invokes the mutations-server submit flow with the typed payload", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      DETAIL_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='runtime-config-detail-ready'] [data-testid='runtime-config-list-row']",
        ) !== null,
      "Expected detail surface with rows to render.",
      2_000,
    );

    await changeInputValue(
      rendered.container.querySelector<HTMLInputElement>(
        "[data-testid='runtime-config-value-draft']",
      )!,
      "44",
    );
    await changeInputValue(
      document.body.querySelector<HTMLTextAreaElement>(
        "[data-testid='diff-approval-reason']",
      )!,
      "Detail-route browser proposal context.",
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
      "Expected runtime-config high-risk guard to open after the diff approval step.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Operator routine tune",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Browser route proposal submission.",
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
      () => mockedLoaders.submitRuntimeConfigProposal.mock.calls.length === 1,
      "Expected runtime-config proposal submission to flow through the route guard.",
    );

    expect(mockedLoaders.submitRuntimeConfigProposal).toHaveBeenCalledWith({
      data: {
        moduleId: platformModuleId.runtimeConfig,
        key: DETAIL_KEY,
        scope: platformScope.enterprise,
        scopeId: "scope_29",
        value: "44",
        approvalReason:
          "operator-routine-tune: Browser route proposal submission.",
      },
    });
  });
});
