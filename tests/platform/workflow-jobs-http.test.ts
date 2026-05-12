import { Effect } from "effect";
import {
  actorType,
  identityClaimKey,
  platformModuleId,
  platformScope,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import { subscriberJourneySessionHeaderName } from "@comvestec/platform";
import {
  createWorkflowJobsHttpHandler,
  workflowJobsApiPath,
} from "../../packages/platform/src/services/domains/workflow-jobs-http";
import type { WorkflowJobsServiceApi } from "../../packages/platform/src/services/domains/workflow-jobs";

const unexpectedWorkflowJobsHttpEffect = <A>() =>
  Effect.die(new Error("Unexpected workflow-jobs HTTP service call."));

const createWorkflowJobsServiceDouble = (
  overrides: Partial<WorkflowJobsServiceApi>,
): WorkflowJobsServiceApi => ({
  listRepairGaps:
    overrides.listRepairGaps ?? (() => unexpectedWorkflowJobsHttpEffect()),
  replayRepairGap:
    overrides.replayRepairGap ?? (() => unexpectedWorkflowJobsHttpEffect()),
  cancelRepairGap:
    overrides.cancelRepairGap ?? (() => unexpectedWorkflowJobsHttpEffect()),
});

const createTestHandler = (service: Partial<WorkflowJobsServiceApi>) =>
  createWorkflowJobsHttpHandler((use) =>
    use(createWorkflowJobsServiceDouble(service)),
  );

const createConvexAuthToken = (subject: string) => {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      [identityClaimKey.actorType]: actorType.platformOperator,
    }),
  ).toString("base64url");

  return `${header}.${payload}.signature`;
};

describe("platform workflow-jobs http", () => {
  it("returns 400 when the workflow-jobs source module query is missing", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.listRepairGaps}`, {
          method: "GET",
          headers: {
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
          },
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("lists workflow repair gaps through the backend HTTP surface", async () => {
    const listRepairGaps = vi.fn(() =>
      Effect.succeed({
        jobs: [
          {
            jobId: "job_search_gap_1",
            sourceModuleId: platformModuleId.search,
            kind: workflowJobKind.searchIndexEnsure,
            trigger: workflowJobTrigger.operatorRequested,
            status: workflowJobStatus.blocked,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            attempts: 2,
            scheduledAt: "2026-05-03T18:00:00.000Z",
            gapReason: workflowJobGapReason.repairFailed,
          },
        ],
      }),
    );
    const handler = createTestHandler({ listRepairGaps });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${workflowJobsApiPath.listRepairGaps}?sourceModuleId=${platformModuleId.search}`,
          {
            method: "GET",
            headers: {
              [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        jobs: [
          expect.objectContaining({
            sourceModuleId: platformModuleId.search,
            kind: workflowJobKind.searchIndexEnsure,
          }),
        ],
      }),
    );
    expect(listRepairGaps).toHaveBeenCalledWith({
      sessionId: "sess_platform_operator_1",
      sourceModuleId: platformModuleId.search,
    });
  });

  it("returns 403 when workflow repair-gap inspection is not authorized", async () => {
    const handler = createTestHandler({
      listRepairGaps: () =>
        Effect.fail({
          _tag: "WorkflowJobsAccessDeniedError",
          reason: "denied",
          auditRequired: false,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${workflowJobsApiPath.listRepairGaps}?sourceModuleId=${platformModuleId.search}`,
          {
            method: "GET",
            headers: {
              [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error:
        "Workflow job repair-gap inspection is not allowed for this session.",
    });
  });

  it("replays workflow repair gaps through the backend HTTP surface", async () => {
    const replayRepairGap = vi.fn(() =>
      Effect.succeed({
        job: {
          jobId: "job_search_gap_1",
          sourceModuleId: platformModuleId.search,
          kind: workflowJobKind.searchIndexEnsure,
          trigger: workflowJobTrigger.operatorRequested,
          status: workflowJobStatus.blocked,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          attempts: 2,
          scheduledAt: "2026-05-03T18:12:00.000Z",
          gapReason: workflowJobGapReason.repairFailed,
        },
      }),
    );
    const handler = createTestHandler({ replayRepairGap });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          status: workflowJobStatus.blocked,
          sourceModuleId: platformModuleId.search,
        }),
      }),
    );
    expect(replayRepairGap).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_platform_operator_1",
        jobId: "job_search_gap_1",
      }),
    );
  });

  it("returns 401 when workflow repair-gap replay is missing the Keycloak bearer token", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak bearer token is required.",
    });
  });

  it("returns 403 when workflow repair-gap replay is not authorized", async () => {
    const handler = createTestHandler({
      replayRepairGap: () =>
        Effect.fail({
          _tag: "WorkflowJobsAccessDeniedError",
          reason: "denied",
          auditRequired: false,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Workflow job repair-gap replay is not allowed for this session.",
    });
  });

  it("returns 403 when workflow repair-gap replay token provenance does not match", async () => {
    const handler = createTestHandler({
      replayRepairGap: () =>
        Effect.fail({
          _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
          reason:
            "Authenticated workflow execution requires a valid platform-operator Keycloak identity token.",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Operator identity and Convex token provenance did not match.",
    });
  });

  it("returns 409 when workflow repair-gap replay is no longer eligible", async () => {
    const handler = createTestHandler({
      replayRepairGap: () =>
        Effect.fail({
          _tag: "WorkflowJobsRepairGapReplayUnavailableError",
          jobId: "job_search_gap_1",
          status: workflowJobStatus.completed,
          reason: "replay unavailable",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Workflow repair gap is no longer eligible for replay.",
    });
  });

  it("returns 502 when workflow repair-gap replay token validation fails against Keycloak", async () => {
    const handler = createTestHandler({
      replayRepairGap: () =>
        Effect.fail({
          _tag: "KeycloakAdapterRequestError",
          operation: "tokenVerification",
          cause: new Error("Keycloak unavailable"),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 404 when workflow repair-gap replay cannot resolve the operator session", async () => {
    const handler = createTestHandler({
      replayRepairGap: () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError",
          sessionId: "sess_platform_operator_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("cancels workflow repair gaps through the backend HTTP surface", async () => {
    const cancelRepairGap = vi.fn(() =>
      Effect.succeed({
        job: {
          jobId: "job_search_gap_1",
          sourceModuleId: platformModuleId.search,
          kind: workflowJobKind.searchIndexEnsure,
          trigger: workflowJobTrigger.operatorRequested,
          status: workflowJobStatus.canceled,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          attempts: 2,
          scheduledAt: "2026-05-03T18:00:00.000Z",
          completedAt: "2026-05-03T18:10:00.000Z",
          gapReason: workflowJobGapReason.repairFailed,
        },
      }),
    );
    const handler = createTestHandler({ cancelRepairGap });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          status: workflowJobStatus.canceled,
          sourceModuleId: platformModuleId.search,
        }),
      }),
    );
    expect(cancelRepairGap).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_platform_operator_1",
        jobId: "job_search_gap_1",
      }),
    );
  });

  it("returns 401 when workflow repair-gap cancellation is missing the Keycloak bearer token", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak bearer token is required.",
    });
  });

  it("returns 403 when workflow repair-gap cancellation is not authorized", async () => {
    const handler = createTestHandler({
      cancelRepairGap: () =>
        Effect.fail({
          _tag: "WorkflowJobsAccessDeniedError",
          reason: "denied",
          auditRequired: false,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error:
        "Workflow job repair-gap cancellation is not allowed for this session.",
    });
  });

  it("returns 403 when workflow repair-gap cancellation token provenance does not match", async () => {
    const handler = createTestHandler({
      cancelRepairGap: () =>
        Effect.fail({
          _tag: "WorkflowJobsWorkflowExecutionIdentityMismatchError",
          reason:
            "Authenticated workflow execution requires a valid platform-operator Keycloak identity token.",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Operator identity and Convex token provenance did not match.",
    });
  });

  it("returns 502 when workflow repair-gap cancellation token validation fails against Keycloak", async () => {
    const handler = createTestHandler({
      cancelRepairGap: () =>
        Effect.fail({
          _tag: "KeycloakAdapterRequestError",
          operation: "tokenVerification",
          cause: new Error("Keycloak unavailable"),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 404 when workflow repair-gap cancellation cannot resolve the operator session", async () => {
    const handler = createTestHandler({
      cancelRepairGap: () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError",
          sessionId: "sess_platform_operator_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${workflowJobsApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_platform_operator_1",
            Authorization: `Bearer ${createConvexAuthToken("usr_platform_operator_1")}`,
          },
          body: JSON.stringify({
            jobId: "job_search_gap_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });
});
