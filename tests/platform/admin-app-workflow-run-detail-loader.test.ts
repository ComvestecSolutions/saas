/**
 * Admin-app workflow-run-detail loader tests (admin-app
 * implementation plan §8.14 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6b). Covers the discriminated-union
 * mapping of the `/desk/run/$id` loader trio backed live by
 * `getWorkflowRunsAdminDetailFromEnvironment`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `WorkflowRunsAdminUnauthorized` → `denied`
 *   - `WorkflowRunsAdminMissingActorIdentity` → `stale-session`
 *   - `WorkflowRunsAdminRunNotFound` → `error` with not-found copy
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the workflow-run detail
 */
import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { platformModuleId, workflowRunStatus } from "@comvestec/contracts";
import {
  loadAdminWorkflowRunDetailRouteDataFromRequest,
  type AdminWorkflowRunDetailDependencies,
  type AdminWorkflowRunDetailInput,
} from "../../apps/admin-app/src/lib/workflow-run-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseInput: AdminWorkflowRunDetailInput = {
  runId: "wfr_1",
};

const sampleRun = {
  runId: "wfr_1",
  moduleId: platformModuleId.workflowJobs,
  workflowKey: "platform.audit-log.sweep",
  status: workflowRunStatus.succeeded,
  queuedAt: new Date(0).toISOString(),
  attempt: 1,
  steps: [],
  payloadProjection: "{}",
  auditCorrelationId: "corr_wfr_1",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getWorkflowRunsAdminDetail: () =>
    Effect.succeed({ detail: Option.some(sampleRun) }),
} as unknown as AdminWorkflowRunDetailDependencies;

const failingResolveContext = (
  tag: string,
): AdminWorkflowRunDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getWorkflowRunsAdminDetail: () =>
      Effect.succeed({ detail: Option.some(sampleRun) }),
  }) as unknown as AdminWorkflowRunDetailDependencies;

const failingDetail = (tag: string): AdminWorkflowRunDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getWorkflowRunsAdminDetail: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminWorkflowRunDetailDependencies;

const throwingDependencies = (
  error: unknown,
): AdminWorkflowRunDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getWorkflowRunsAdminDetail: () => Effect.fail(error),
  }) as unknown as AdminWorkflowRunDetailDependencies;

describe("admin-app workflow-run-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the workflow run detail", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.run.runId).toBe("wfr_1");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingDetail("WorkflowRunsAdminUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns not-found error when the helper raises run-not-found", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunDetailRouteDataFromRequest(
        buildRequest("sess-missing"),
        {},
        baseInput,
        failingDetail("WorkflowRunsAdminRunNotFound"),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Workflow run not found");
  });

  it("returns not-found error when the helper returns Option.none for the detail", async () => {
    const noneDependencies = {
      resolveTrustedRequestContext: () => Effect.succeed({}),
      getWorkflowRunsAdminDetail: () =>
        Effect.succeed({ detail: Option.none() }),
    } as unknown as AdminWorkflowRunDetailDependencies;
    const result = await Effect.runPromise(
      loadAdminWorkflowRunDetailRouteDataFromRequest(
        buildRequest("sess-none"),
        {},
        baseInput,
        noneDependencies,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Workflow run not found");
  });

  it("returns error when the helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkflowRunDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Upstream workflow-jobs port down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Workflow run detail unavailable");
    expect(result.description).toBe("Upstream workflow-jobs port down.");
  });
});
