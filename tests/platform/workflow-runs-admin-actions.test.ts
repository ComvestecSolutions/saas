/**
 * Workflow-runs admin envelope app-helper smoke tests (admin-app
 * implementation plan §9 item 15). Mirrors
 * `run-as-banner-state-actions.test.ts` exactly: confirms the four
 * canonical `*FromEnvironment` helpers reach the env-bound boundary
 * decoder through the shared `loadRuntimeModuleOrDie` seam and that
 * the helper source contains no `Request` / `Response` shaping or
 * per-helper `Effect.tryPromise` duplication.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  type RequestContext,
} from "@comvestec/contracts";
import {
  cancelWorkflowRunFromEnvironment,
  getWorkflowRunsAdminDetailFromEnvironment,
  listWorkflowRunsAdminFromEnvironment,
  replayWorkflowRunFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_workflow_runs_admin_helpers_test",
  sessionId: "sess_workflow_runs_admin_helpers_test",
  correlationId: "corr_workflow_runs_admin_helpers_test",
  reason: "workflow-runs admin app helpers smoke",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const expectEnvParseFailure = async (
  effect: Effect.Effect<unknown, unknown>,
) => {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
    expect(failure).toBeDefined();
    expect(
      typeof failure === "object" &&
        failure !== null &&
        "_tag" in failure &&
        (failure as { readonly _tag: string })._tag === "ParseError",
    ).toBe(true);
  }
};

describe("workflow-runs-admin app helpers", () => {
  it("exposes the four canonical *FromEnvironment helpers as functions", () => {
    expect(typeof listWorkflowRunsAdminFromEnvironment).toBe("function");
    expect(listWorkflowRunsAdminFromEnvironment.length).toBe(2);
    expect(typeof getWorkflowRunsAdminDetailFromEnvironment).toBe("function");
    expect(getWorkflowRunsAdminDetailFromEnvironment.length).toBe(2);
    expect(typeof replayWorkflowRunFromEnvironment).toBe("function");
    expect(replayWorkflowRunFromEnvironment.length).toBe(2);
    expect(typeof cancelWorkflowRunFromEnvironment).toBe("function");
    expect(cancelWorkflowRunFromEnvironment.length).toBe(2);
  });

  it("listWorkflowRunsAdminFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listWorkflowRunsAdminFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          filters: {},
          pageSize: 25,
        },
      ),
    );
  });

  it("getWorkflowRunsAdminDetailFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getWorkflowRunsAdminDetailFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          runId: "wfr_target_detail",
        },
      ),
    );
  });

  it("replayWorkflowRunFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      replayWorkflowRunFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          runId: "wfr_target_replay",
          reason: "workflow-runs-admin.replay",
          reasonAttachmentText: "ticket-link-or-evidence",
        },
      ),
    );
  });

  it("cancelWorkflowRunFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      cancelWorkflowRunFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          runId: "wfr_target_cancel",
          reason: "workflow-runs-admin.cancel",
          reasonAttachmentText: "ticket-link-or-evidence",
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/workflow-runs-admin-actions.ts",
      ),
      "utf8",
    );
    const sourceWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[\t ]*\/\/.*$/gm, "");
    const loadRuntimeModuleOrDieMatches = sourceWithoutComments.match(
      /loadRuntimeModuleOrDie\(/g,
    );
    expect(loadRuntimeModuleOrDieMatches).not.toBeNull();
    expect(loadRuntimeModuleOrDieMatches?.length).toBe(1);
    expect(sourceWithoutComments.includes("Effect.tryPromise")).toBe(false);
    expect(sourceWithoutComments.includes("new Request(")).toBe(false);
    expect(sourceWithoutComments.includes("new Response(")).toBe(false);
    expect(/\bResponse\.json\b/.test(sourceWithoutComments)).toBe(false);
  });
});
