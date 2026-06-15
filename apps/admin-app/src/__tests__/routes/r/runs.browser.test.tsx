import { afterEach, describe, expect, it } from "vitest";
import { platformModuleId, workflowRunStatus } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  click,
  followLink,
  getButtonByText,
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

/**
 * Browser coverage for the spec-canonical `/desk/runs` Workflow Runs
 * v4 list surface aligned to the signal-deck redesign slice
 * (admin-app implementation plan §8.14 + §11).
 */
const PATH = "/desk/runs";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/runs Workflow Runs v4 list route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready runs workspace with focus, pivots, search, and partial-failure review", async () => {
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
              {
                runId: "wfr_browser_4",
                moduleId: platformModuleId.supportOperations,
                workflowKey: "platform.support.escalation.sync",
                status: workflowRunStatus.queued,
                queuedAt: new Date(8000).toISOString(),
                startedAt: undefined,
                finishedAt: undefined,
                durationMs: undefined,
                attempt: 1,
              },
              {
                runId: "wfr_browser_5",
                moduleId: platformModuleId.authorization,
                workflowKey: "platform.access.sync-directory",
                status: workflowRunStatus.running,
                queuedAt: new Date(9000).toISOString(),
                startedAt: new Date(10000).toISOString(),
                finishedAt: undefined,
                durationMs: 2000,
                attempt: 1,
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
    expect(rendered.container.textContent).toContain("wfr_browser_2");
    expect(rendered.container.textContent).toContain(
      "Automatically escalated because the current visible roster includes a failed workflow run that needs operator review first.",
    );

    await click(getButtonByText(rendered.container, "Active"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='workflow-runs-list-entry-row']",
        ).length === 2,
      "Expected active tab to narrow the run roster to running and queued runs.",
    );
    expect(rendered.container.textContent).toContain(
      "platform.support.escalation.sync",
    );
    expect(rendered.container.textContent).toContain(
      "platform.access.sync-directory",
    );

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
        ).length === 5,
      "Expected all tab to restore the full run roster.",
    );

    const focusRuntimeConfigButton =
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-run-id='wfr_browser_3'] [data-testid='workflow-runs-list-entry-focus']",
      );
    if (focusRuntimeConfigButton === null) {
      throw new Error("Expected the runtime-config focus button to render.");
    }
    await click(focusRuntimeConfigButton);
    await waitFor(
      () =>
        rendered?.container
          .querySelector("[data-testid='workflow-runs-list-focus-summary']")
          ?.textContent?.includes("wfr_browser_3") ?? false,
      "Expected focusing a roster row to update the focused run rail.",
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

  it("resets the workbench scroll when navigating from the list to run detail", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='workflow-runs-list-ready']",
        ) !== null,
      "Expected workflow runs ready surface to render before navigating.",
    );

    const workbench = rendered.container.querySelector<HTMLElement>(
      "[data-pattern='workbench']",
    );
    if (workbench === null) {
      throw new Error("Expected the desk workbench shell to render.");
    }

    const firstRunLink = rendered.container.querySelector<HTMLAnchorElement>(
      "[data-testid='workflow-runs-list-entry-link']",
    );
    if (firstRunLink === null) {
      throw new Error("Expected a workflow run entry link to render.");
    }

    workbench.scrollTop = 240;

    await followLink(rendered.router, firstRunLink);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='workflow-run-detail-ready']",
        ) !== null,
      "Expected workflow run detail surface to render after navigation.",
    );

    expect(workbench.scrollTop).toBe(0);
  });

  it("guides the operator when no workflow runs have succeeded yet", async () => {
    const noSuccessFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunsList: async (input) => ({
          kind: "ready",
          filters: input.filters,
          result: {
            runs: [
              {
                runId: "wfr_browser_failed",
                moduleId: platformModuleId.workflowJobs,
                workflowKey: "platform.notifications.flush",
                status: workflowRunStatus.failed,
                queuedAt: new Date(3000).toISOString(),
                startedAt: new Date(4000).toISOString(),
                finishedAt: new Date(5000).toISOString(),
                durationMs: 1000,
                attempt: 2,
              },
            ],
          },
        }),
      }),
    );

    rendered = await renderAdminApp(noSuccessFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("No successful runs yet") ??
        false,
      "Expected workflow runs readiness guidance to render.",
    );
    expect(rendered.container.textContent).toContain(
      "bun run backend:subscriber-journey:ready:local",
    );
    expect(rendered.container.textContent).toContain("Review vendor posture");
  });

  it("keeps long workflow identifiers from overflowing the focus and review cards", async () => {
    const longRunId =
      "workflow-jobs:tenant-invitation-reminder:operator-requested:organization:org_smoke:invite_f109c65b-1fa6-4796-a3b7-c0d8af47ffc";
    const longWorkflowKey =
      "platform.notifications.operator-requested.organization.invitation-reminder";
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
                runId: longRunId,
                moduleId: platformModuleId.workflowJobs,
                workflowKey: longWorkflowKey,
                status: workflowRunStatus.stale,
                queuedAt: new Date(0).toISOString(),
                startedAt: new Date(1000).toISOString(),
                finishedAt: undefined,
                durationMs: 1_000,
                attempt: 1,
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
          "[data-testid='workflow-runs-list-focus-run-id']",
        ) !== null &&
        rendered?.container.querySelector(
          "[data-testid='workflow-runs-list-slowest-run-id']",
        ) !== null,
      "Expected long workflow identifiers to render in the focus and review cards.",
    );

    const focusRunId = rendered.container.querySelector<HTMLElement>(
      "[data-testid='workflow-runs-list-focus-run-id']",
    );
    const focusWorkflowKey = rendered.container.querySelector<HTMLElement>(
      "[data-testid='workflow-runs-list-focus-workflow-key']",
    );
    const slowestRunId = rendered.container.querySelector<HTMLElement>(
      "[data-testid='workflow-runs-list-slowest-run-id']",
    );

    if (
      focusRunId === null ||
      focusWorkflowKey === null ||
      slowestRunId === null
    ) {
      throw new Error("Expected long workflow identifier fields to render.");
    }

    expect(focusRunId.scrollWidth).toBeLessThanOrEqual(focusRunId.clientWidth);
    expect(focusWorkflowKey.scrollWidth).toBeLessThanOrEqual(
      focusWorkflowKey.clientWidth,
    );
    expect(slowestRunId.scrollWidth).toBeLessThanOrEqual(
      slowestRunId.clientWidth,
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
