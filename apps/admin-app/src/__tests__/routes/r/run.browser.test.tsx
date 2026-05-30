import { afterEach, describe, expect, it } from "vitest";
import { platformModuleId, workflowRunStatus } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  click,
  getFieldControlByLabel,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/desk/run/$id` Workflow
 * Run Detail v2 surface shipped by Phase 6 commit 6b
 * (admin-app implementation plan §8.14 + §11).
 */
const PATH = "/desk/run/wfr_browser_1";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/run/$id Workflow Run Detail v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.replayWorkflowRun.mockClear();
    mockedLoaders.cancelWorkflowRun.mockClear();
  });

  it("renders the ready run detail surface with summary + steps + CTAs", async () => {
    const readyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunDetail: async (input) => ({
          kind: "ready",
          run: {
            runId: input.runId,
            moduleId: platformModuleId.workflowJobs,
            workflowKey: "platform.audit-log.sweep",
            status: workflowRunStatus.failed,
            queuedAt: new Date(0).toISOString(),
            startedAt: new Date(1000).toISOString(),
            finishedAt: new Date(2000).toISOString(),
            durationMs: 1000,
            attempt: 2,
            lastError: "Upstream provider timed out.",
            steps: [
              {
                stepKey: "drain",
                status: workflowRunStatus.succeeded,
                startedAt: new Date(1000).toISOString(),
                finishedAt: new Date(1500).toISOString(),
              },
            ],
            payloadProjection: '{ "sweep": "daily" }',
            auditCorrelationId: "corr_wfr_browser_1",
          },
        }),
      }),
    );

    rendered = await renderAdminApp(readyFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='workflow-run-detail-ready']",
        ) !== null,
      "Expected workflow run detail v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='workflow-run-detail-summary']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='workflow-run-detail-replay-cta']",
      ),
    ).not.toBeNull();
  });

  it("invokes the replay mutations-server flow through the high-risk guard", async () => {
    const readyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunDetail: async (input) => ({
          kind: "ready",
          run: {
            runId: input.runId,
            moduleId: platformModuleId.workflowJobs,
            workflowKey: "platform.audit-log.sweep",
            status: workflowRunStatus.failed,
            queuedAt: new Date(0).toISOString(),
            startedAt: new Date(1000).toISOString(),
            finishedAt: new Date(2000).toISOString(),
            durationMs: 1000,
            attempt: 2,
            lastError: "Upstream provider timed out.",
            steps: [],
            payloadProjection: '{ "sweep": "daily" }',
            auditCorrelationId: "corr_wfr_browser_replay",
          },
        }),
      }),
    );

    rendered = await renderAdminApp(readyFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='workflow-run-detail-replay-cta']",
        ) !== null,
      "Expected replay CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='workflow-run-detail-replay-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected replay high-risk guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Transient vendor failure — replay run",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Evidence ticket 42",
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
      () =>
        mockedLoaders.replayWorkflowRun.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Replay accepted for") ===
          true,
      "Expected replay mutations-server flow to complete.",
    );

    expect(mockedLoaders.replayWorkflowRun).toHaveBeenCalledWith({
      data: {
        runId: "wfr_browser_1",
        reason: "workflow-run.replay.transient-vendor-failure",
        reasonAttachmentText: "Evidence ticket 42",
      },
    });
  });

  it("invokes the cancel mutations-server flow through the high-risk guard", async () => {
    const cancelFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunDetail: async (input) => ({
          kind: "ready",
          run: {
            runId: input.runId,
            moduleId: platformModuleId.workflowJobs,
            workflowKey: "platform.audit-log.sweep",
            status: workflowRunStatus.running,
            queuedAt: new Date(0).toISOString(),
            startedAt: new Date(1000).toISOString(),
            attempt: 1,
            steps: [],
            payloadProjection: '{ "sweep": "daily" }',
            auditCorrelationId: "corr_wfr_browser_cancel",
          },
        }),
      }),
    );

    rendered = await renderAdminApp(cancelFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='workflow-run-detail-cancel-cta']",
        ) !== null,
      "Expected cancel CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='workflow-run-detail-cancel-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected cancel high-risk guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Stuck run — cancel run",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Operator intervention required",
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
      () =>
        mockedLoaders.cancelWorkflowRun.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Cancel accepted for") ===
          true,
      "Expected cancel mutations-server flow to complete.",
    );

    expect(mockedLoaders.cancelWorkflowRun).toHaveBeenCalledWith({
      data: {
        runId: "wfr_browser_1",
        reason: "workflow-run.cancel.stuck-run",
        reasonAttachmentText: "Operator intervention required",
      },
    });
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect this workflow run.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected run detail denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect this workflow run.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access workflow run detail.",
        ) ?? false,
      "Expected run detail stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadWorkflowRunDetail: async () => ({
          kind: "error",
          title: "Workflow run detail unavailable",
          description: "Upstream workflow-jobs port unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Workflow run detail unavailable",
        ) ?? false,
      "Expected run detail error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream workflow-jobs port unreachable.",
    );
  });
});
