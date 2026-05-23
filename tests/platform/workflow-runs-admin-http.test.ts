/**
 * Workflow-runs admin envelope HTTP transport tests (admin-app
 * implementation plan §9 item 15). Mirrors
 * `run-as-banner-state-http.test.ts`: exercises
 * `createWorkflowRunsAdminHttpHandlerWithDependencies` with an
 * injected request-context resolver + service double so we cover
 * routing, body decoding, error-tag → status mapping, 405
 * method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  workflowRunStatus,
  workflowRunsAdminAuditAction,
  type RequestContext,
  type WorkflowRunDetail,
  type WorkflowRunsListResult,
} from "@comvestec/contracts";
import {
  createWorkflowRunsAdminHttpHandlerWithDependencies,
  workflowRunsAdminApiBasePath,
  workflowRunsAdminApiPath,
  WorkflowRunsAdminMissingActorIdentity,
  WorkflowRunsAdminPageSizeTooLarge,
  WorkflowRunsAdminReasonActionMismatch,
  WorkflowRunsAdminReasonAttachmentRequired,
  WorkflowRunsAdminReasonNotInCatalog,
  WorkflowRunsAdminRunNotFound,
  WorkflowRunsAdminUnauthorized,
  type WorkflowRunsAdminServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_workflow_runs_admin_http_operator",
  sessionId: "sess_workflow_runs_admin_http",
  correlationId: "corr_workflow_runs_admin_http",
  reason: reasonCatalogId.workflowRunsAdminReplay,
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const emptyListResult = (): WorkflowRunsListResult => ({
  runs: [],
});

const sampleDetail = (): WorkflowRunDetail => ({
  runId: "wfr_target_detail",
  moduleId: platformModuleId.workflowRunsAdmin,
  workflowKey: "workflow.example",
  status: workflowRunStatus.succeeded,
  queuedAt: "2026-02-01T00:00:00.000Z",
  attempt: 1,
  steps: [],
  payloadProjection: "<redacted>",
  auditCorrelationId: "corr_workflow_runs_admin_http",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(new Error(`unexpected workflow-runs-admin call: ${method}`));

const createServiceDouble = (
  overrides: Partial<WorkflowRunsAdminServiceImpl> = {},
): WorkflowRunsAdminServiceImpl => ({
  listRuns: overrides.listRuns ?? (() => unexpectedServiceCall("listRuns")),
  getRunDetail:
    overrides.getRunDetail ?? (() => unexpectedServiceCall("getRunDetail")),
  replayRun: overrides.replayRun ?? (() => unexpectedServiceCall("replayRun")),
  cancelRun: overrides.cancelRun ?? (() => unexpectedServiceCall("cancelRun")),
});

const createTestHandler = (
  service: Partial<WorkflowRunsAdminServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createWorkflowRunsAdminHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const replayBody = (overrides: Record<string, unknown> = {}) => ({
  runId: "wfr_target_replay",
  reason: reasonCatalogId.workflowRunsAdminReplay,
  reasonAttachmentText: "runbook://workflow-runs/replay",
  ...overrides,
});

const cancelBody = (overrides: Record<string, unknown> = {}) => ({
  runId: "wfr_target_cancel",
  reason: reasonCatalogId.workflowRunsAdminCancel,
  reasonAttachmentText: "runbook://workflow-runs/cancel",
  ...overrides,
});

const postJson = (path: string, body: unknown) =>
  new Request(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const getRequest = (path: string) => new Request(url(path), { method: "GET" });

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("workflow-runs-admin HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(workflowRunsAdminApiBasePath).toBe("/api/workflow-runs-admin");
    expect(workflowRunsAdminApiPath).toEqual({
      list: "/api/workflow-runs-admin/list",
      detail: "/api/workflow-runs-admin/detail",
      replay: "/api/workflow-runs-admin/replay",
      cancel: "/api/workflow-runs-admin/cancel",
    });
  });

  it("is registered against the canonical backend API router via workflowRunsAdminApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("workflowRunsAdminApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("workflowRunsAdminHandler")).toBe(true);
    expect(
      backendApiSource.includes("handleWorkflowRunsAdminHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /list
// ---------------------------------------------------------------------------

describe("workflow-runs-admin HTTP — /list", () => {
  it("returns 200 { result, fromCache } on happy path", async () => {
    const result = emptyListResult();
    const handler = createTestHandler({
      listRuns: () => Effect.succeed({ result, fromCache: false }),
    });
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.list)),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result,
      fromCache: false,
    });
  });

  it("returns 400 when filters fail to decode (invalid status)", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${workflowRunsAdminApiPath.list}?status=not-a-status`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminUnauthorized to 401", async () => {
    const handler = createTestHandler({
      listRuns: () =>
        Effect.fail(
          new WorkflowRunsAdminUnauthorized({
            operation: "listRuns",
            requestingActorId: "usr_test_actor",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.list)),
    );
    expect(response.status).toBe(401);
  });

  it("maps WorkflowRunsAdminMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      listRuns: () =>
        Effect.fail(
          new WorkflowRunsAdminMissingActorIdentity({ operation: "listRuns" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.list)),
    );
    expect(response.status).toBe(401);
  });

  it("maps WorkflowRunsAdminPageSizeTooLarge to 400", async () => {
    const handler = createTestHandler({
      listRuns: () =>
        Effect.fail(
          new WorkflowRunsAdminPageSizeTooLarge({
            requested: 9999,
            maximum: 500,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.list)),
    );
    expect(response.status).toBe(400);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      listRuns: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.list)),
    );
    expect(response.status).toBe(500);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({ _tag: "SubscriberJourneySessionIdMissingError" } as const),
    );
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.list)),
    );
    expect(response.status).toBe(401);
  });

  it("maps IdentitySessionRequestContextNotFoundError to 404 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "IdentitySessionRequestContextNotFoundError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.list)),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /detail
// ---------------------------------------------------------------------------

describe("workflow-runs-admin HTTP — /detail", () => {
  it("returns 200 { detail } on happy path (Option.some)", async () => {
    const detail = sampleDetail();
    const handler = createTestHandler({
      getRunDetail: () => Effect.succeed({ detail: Option.some(detail) }),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${workflowRunsAdminApiPath.detail}?runId=wfr_target_detail`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ detail });
  });

  it("returns 200 { detail: null } when service returns Option.none", async () => {
    const handler = createTestHandler({
      getRunDetail: () => Effect.succeed({ detail: Option.none() }),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${workflowRunsAdminApiPath.detail}?runId=wfr_target_detail`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ detail: null });
  });

  it("returns 400 when runId query parameter is missing", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(getRequest(workflowRunsAdminApiPath.detail)),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminRunNotFound to 404", async () => {
    const handler = createTestHandler({
      getRunDetail: () =>
        Effect.fail(
          new WorkflowRunsAdminRunNotFound({
            operation: "getRunDetail",
            runId: "wfr_missing",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${workflowRunsAdminApiPath.detail}?runId=wfr_missing`),
          {
            method: "GET",
          },
        ),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps WorkflowRunsAdminUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getRunDetail: () =>
        Effect.fail(
          new WorkflowRunsAdminUnauthorized({
            operation: "getRunDetail",
            requestingActorId: "usr_test_actor",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${workflowRunsAdminApiPath.detail}?runId=wfr_target_detail`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /replay
// ---------------------------------------------------------------------------

describe("workflow-runs-admin HTTP — /replay", () => {
  it("returns 202 { accepted, runId } on happy path", async () => {
    const handler = createTestHandler({
      replayRun: () =>
        Effect.succeed({
          accepted: true as const,
          runId: "wfr_target_replay",
        }),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.replay, replayBody())),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      runId: "wfr_target_replay",
    });
  });

  it("returns 400 when the body schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.replay, {})),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(workflowRunsAdminApiPath.replay), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      replayRun: () =>
        Effect.fail(
          new WorkflowRunsAdminReasonNotInCatalog({
            operation: "replayRun",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.replay, replayBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminReasonActionMismatch to 400", async () => {
    const handler = createTestHandler({
      replayRun: () =>
        Effect.fail(
          new WorkflowRunsAdminReasonActionMismatch({
            operation: "replayRun",
            reasonCatalogId: reasonCatalogId.workflowRunsAdminCancel,
            auditAction: workflowRunsAdminAuditAction.replayed,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.replay, replayBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminReasonAttachmentRequired to 400", async () => {
    const handler = createTestHandler({
      replayRun: () =>
        Effect.fail(
          new WorkflowRunsAdminReasonAttachmentRequired({
            operation: "replayRun",
            reasonCatalogId: reasonCatalogId.workflowRunsAdminReplay,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.replay, replayBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminRunNotFound to 404", async () => {
    const handler = createTestHandler({
      replayRun: () =>
        Effect.fail(
          new WorkflowRunsAdminRunNotFound({
            operation: "replayRun",
            runId: "wfr_missing",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.replay, replayBody())),
    );
    expect(response.status).toBe(404);
  });

  it("maps WorkflowRunsAdminUnauthorized to 401", async () => {
    const handler = createTestHandler({
      replayRun: () =>
        Effect.fail(
          new WorkflowRunsAdminUnauthorized({
            operation: "replayRun",
            requestingActorId: "usr_test_actor",
            requestingActorType: actorType.supportOperator,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.replay, replayBody())),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /cancel
// ---------------------------------------------------------------------------

describe("workflow-runs-admin HTTP — /cancel", () => {
  it("returns 202 { accepted, runId } on happy path", async () => {
    const handler = createTestHandler({
      cancelRun: () =>
        Effect.succeed({
          accepted: true as const,
          runId: "wfr_target_cancel",
        }),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.cancel, cancelBody())),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      runId: "wfr_target_cancel",
    });
  });

  it("returns 400 when the body schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.cancel, {})),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(workflowRunsAdminApiPath.cancel), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminReasonActionMismatch to 400", async () => {
    const handler = createTestHandler({
      cancelRun: () =>
        Effect.fail(
          new WorkflowRunsAdminReasonActionMismatch({
            operation: "cancelRun",
            reasonCatalogId: reasonCatalogId.workflowRunsAdminReplay,
            auditAction: workflowRunsAdminAuditAction.canceled,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.cancel, cancelBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps WorkflowRunsAdminRunNotFound to 404", async () => {
    const handler = createTestHandler({
      cancelRun: () =>
        Effect.fail(
          new WorkflowRunsAdminRunNotFound({
            operation: "cancelRun",
            runId: "wfr_missing",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.cancel, cancelBody())),
    );
    expect(response.status).toBe(404);
  });

  it("maps WorkflowRunsAdminUnauthorized to 401", async () => {
    const handler = createTestHandler({
      cancelRun: () =>
        Effect.fail(
          new WorkflowRunsAdminUnauthorized({
            operation: "cancelRun",
            requestingActorId: "usr_test_actor",
            requestingActorType: actorType.supportOperator,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(workflowRunsAdminApiPath.cancel, cancelBody())),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("workflow-runs-admin HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /list with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(workflowRunsAdminApiPath.list), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /detail with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(workflowRunsAdminApiPath.detail), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects GET on /replay with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(workflowRunsAdminApiPath.replay), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("rejects GET on /cancel with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(workflowRunsAdminApiPath.cancel), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/workflow-runs-admin/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
