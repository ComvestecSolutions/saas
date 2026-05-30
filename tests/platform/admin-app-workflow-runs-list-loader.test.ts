/**
 * Admin-app workflow-runs-list loader tests (admin-app
 * implementation plan §8.14 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6b). Covers the discriminated-union
 * mapping of the `/desk/runs` loader trio backed live by
 * `listWorkflowRunsAdminFromEnvironment`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `WorkflowRunsAdminUnauthorized` → `denied`
 *   - `WorkflowRunsAdminMissingActorIdentity` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying filters + result envelope
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { platformModuleId, workflowRunStatus } from "@comvestec/contracts";
import {
  loadAdminWorkflowRunsListRouteDataFromRequest,
  type AdminWorkflowRunsListDependencies,
  type AdminWorkflowRunsListInput,
} from "../../apps/admin-app/src/lib/workflow-runs-list-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseInput: AdminWorkflowRunsListInput = {
  filters: {},
  pageSize: 50,
};

const sampleResult = {
  runs: [
    {
      runId: "wfr_1",
      moduleId: platformModuleId.workflowJobs,
      workflowKey: "platform.audit-log.sweep",
      status: workflowRunStatus.succeeded,
      queuedAt: new Date(0).toISOString(),
      attempt: 1,
    },
  ],
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listWorkflowRunsAdmin: () =>
    Effect.succeed({ result: sampleResult, fromCache: false }),
} as unknown as AdminWorkflowRunsListDependencies;

const failingResolveContext = (
  tag: string,
): AdminWorkflowRunsListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listWorkflowRunsAdmin: () =>
      Effect.succeed({ result: sampleResult, fromCache: false }),
  }) as unknown as AdminWorkflowRunsListDependencies;

const failingList = (tag: string): AdminWorkflowRunsListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listWorkflowRunsAdmin: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminWorkflowRunsListDependencies;

const throwingDependencies = (
  error: unknown,
): AdminWorkflowRunsListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listWorkflowRunsAdmin: () => Effect.fail(error),
  }) as unknown as AdminWorkflowRunsListDependencies;

describe("admin-app workflow-runs-list loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunsListRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the listed runs", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunsListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.result.runs[0]?.runId).toBe("wfr_1");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunsListRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the workflow-runs helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunsListRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingList("WorkflowRunsAdminUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the helper raises missing-actor-identity", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunsListRouteDataFromRequest(
        buildRequest("sess-noactor"),
        {},
        baseInput,
        failingList("WorkflowRunsAdminMissingActorIdentity"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunsListRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Upstream workflow-jobs port down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Workflow runs unavailable");
    expect(result.description).toBe("Upstream workflow-jobs port down.");
  });
});
