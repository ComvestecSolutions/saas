import { afterEach, describe, expect, it } from "vitest";
import { platformModuleId, workflowRunStatus } from "@comvestec/contracts";
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
 * Browser coverage for the spec-canonical `/r/runs` Workflow Runs
 * v2 list surface shipped by Phase 6 commit 6b
 * (admin-app implementation plan §8.14 + §11).
 */
const PATH = "/r/runs";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/runs Workflow Runs v2 list route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready runs workspace with pivots, search, and partial-failure review", async () => {
    const readyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunsList: async (input) => ({
          kind: "ready",
          filters: input.filters,
          result: {
            runs: [
              {
                runId: "wfr_browser_1",
                moduleId: platformModuleId.workflowJobs,
                workflowKey: "platform.audit-log.sweep",
                status: workflowRunStatus.succeeded,
                queuedAt: new Date(0).toISOString(),
                startedAt: new Date(1000).toISOString(),
                finishedAt: new Date(2000).toISOString(),
                durationMs: 1000,
                attempt: 1,
              },
              {
                runId: "wfr_browser_2",
                moduleId: platformModuleId.workflowJobs,
                workflowKey: "platform.notifications.flush",
                status: workflowRunStatus.failed,
                queuedAt: new Date(3000).toISOString(),
                startedAt: new Date(4000).toISOString(),
                finishedAt: new Date(5000).toISOString(),
                durationMs: 1000,
                attempt: 2,
              },
              {
                runId: "wfr_browser_3",
                moduleId: platformModuleId.runtimeConfig,
                workflowKey: "platform.runtime-config.reconcile",
                status: workflowRunStatus.stale,
                queuedAt: new Date(6000).toISOString(),
                startedAt: new Date(7000).toISOString(),
                finishedAt: undefined,
                durationMs: undefined,
                attempt: 3,
              },
            ],
            partialFailures: [
              {
                bucket: "workflow-history",
                reason: "Run timeline snapshots timed out.",
              },
            ],
          },
        }),
      }),
    );

    rendered = await renderAdminApp(readyFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='workflow-runs-list-ready']",
        ) !== null,
      "Expected workflow runs v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='workflow-runs-list-posture']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='workflow-runs-list-entries-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='workflow-runs-list-partial-failures']",
      ),
    ).not.toBeNull();

    await click(getButtonByText(rendered.container, "Failed"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='workflow-runs-list-entry-row']",
        ).length === 1,
      "Expected failed tab to narrow the run roster.",
    );
    expect(rendered.container.textContent).toContain(
      "platform.notifications.flush",
    );

    await click(getButtonByText(rendered.container, "All"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='workflow-runs-list-entry-row']",
        ).length === 3,
      "Expected all tab to restore the full run roster.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search runs, workflow keys, or modules…",
      ),
      "runtime-config",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='workflow-runs-list-entry-row']",
        ).length === 1,
      "Expected run search to narrow the roster to the requested module.",
    );
    expect(rendered.container.textContent).toContain(
      "platform.runtime-config.reconcile",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunsList: async () => ({
          kind: "denied",
          reason: "The current operator session cannot inspect workflow runs.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected runs denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect workflow runs.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunsList: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access workflow runs.",
        ) ?? false,
      "Expected runs stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunsList: async () => ({
          kind: "error",
          title: "Workflow runs unavailable",
          description: "Upstream workflow-jobs port unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Workflow runs unavailable",
        ) ?? false,
      "Expected runs error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream workflow-jobs port unreachable.",
    );
  });
});
