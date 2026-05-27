import {
  platformModuleId,
  reasonCatalogId,
  workflowJobStatus,
  workflowRunStatus,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e("backend e2e workflow-runs admin transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runWorkflowRunsAdminProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedListStatus: number;
      readonly unauthenticatedListBody: {
        readonly error: string;
      };
      readonly listStatus: number;
      readonly listBody: {
        readonly result: {
          readonly runs: ReadonlyArray<{
            readonly runId: string;
            readonly moduleId: string;
            readonly workflowKey: string;
            readonly status: string;
            readonly queuedAt: string;
            readonly attempt: number;
            readonly lastError?: string;
          }>;
        };
        readonly fromCache: boolean;
      };
      readonly detailStatus: number;
      readonly detailBody: {
        readonly detail: {
          readonly runId: string;
          readonly moduleId: string;
          readonly workflowKey: string;
          readonly status: string;
          readonly payloadProjection: string;
          readonly auditCorrelationId: string;
        };
      };
      readonly replayStatus: number;
      readonly replayBody: {
        readonly accepted: boolean;
        readonly runId: string;
      };
      readonly cancelStatus: number;
      readonly cancelBody: {
        readonly accepted: boolean;
        readonly runId: string;
      };
      readonly replayedJob: {
        readonly status: string;
        readonly scheduledAt: string;
        readonly completedAt: string | null;
        readonly lastError: string | null;
        readonly gapReason: string | null;
      };
      readonly canceledJob: {
        readonly status: string;
        readonly completedAt: string | null;
      };
      readonly postActionListStatus: number;
      readonly postActionListBody: {
        readonly result: {
          readonly runs: ReadonlyArray<{
            readonly runId: string;
            readonly status: string;
          }>;
        };
        readonly fromCache: boolean;
      };
      readonly replayJobId: string;
      readonly cancelJobId: string;
      readonly seededReplayScheduledAt: string;
    }>(
      `import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import {
  actorType,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from '@comvestec/contracts';
import {
  makePostgresAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
  workflowRunsAdminApiPath,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';
import { workflowJobsTable } from './packages/modules/src/persistence/postgres/domains/workflow-jobs.ts';

const runStep = async (label, operation, timeoutMs = 15000) => {
  let timeoutHandle;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(label + ' timed out after ' + timeoutMs + 'ms.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const runId = Date.now().toString();
const actorId = 'usr_backend_e2e_workflow_runs_operator';
const sessionId = 'sess_backend_e2e_workflow_runs_' + runId;
const correlationId = 'corr_backend_e2e_workflow_runs_' + runId;
const replayJobId = 'job_backend_e2e_workflow_runs_replay_' + runId;
const cancelJobId = 'job_backend_e2e_workflow_runs_cancel_' + runId;
const seededReplayScheduledAt = '2026-05-12T06:05:00.000Z';
const now = new Date();

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId,
    requestContext: {
      actorType: actorType.platformOperator,
      actorId,
      sessionId,
      correlationId,
      reason: 'Validate workflow-runs admin backend route family',
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    },
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const postgres = await Effect.runPromise(
  makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
await postgres.database.insert(workflowJobsTable).values([
  {
    jobId: replayJobId,
    runtime: 'convex',
    sourceModuleId: platformModuleId.search,
    kind: workflowJobKind.searchIndexEnsure,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.failed,
    tenantScope: platformScope.organization,
    tenantScopeId: 'org_backend_e2e_workflow_runs',
    attempts: 2,
    scheduledAt: new Date(seededReplayScheduledAt),
    completedAt: new Date('2026-05-12T06:06:00.000Z'),
    gapReason: workflowJobGapReason.repairFailed,
    lastError: 'Search ensure failed before replay.',
    payload: {
      correlationId,
      requestContext: {
        correlationId,
      },
    },
    createdAt: new Date('2026-05-12T06:05:00.000Z'),
    updatedAt: new Date('2026-05-12T06:06:00.000Z'),
  },
  {
    jobId: cancelJobId,
    runtime: 'convex',
    sourceModuleId: platformModuleId.notificationCenter,
    kind: workflowJobKind.notificationCenterEmailDigest,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.running,
    tenantScope: platformScope.organization,
    tenantScopeId: 'org_backend_e2e_workflow_runs',
    attempts: 1,
    scheduledAt: new Date(now.getTime() - 60_000),
    completedAt: null,
    gapReason: null,
    lastError: null,
    payload: {
      correlationId: correlationId + '_cancel',
    },
    createdAt: new Date(now.getTime() - 60_000),
    updatedAt: now,
  },
]);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedListResponse = await runStep(
    'workflow-runs admin list without trusted session header',
    fetch(
      new URL(
        workflowRunsAdminApiPath.list +
          '?pageSize=10&moduleId=' +
          encodeURIComponent(platformModuleId.search),
        baseUrl,
      ),
      { method: 'GET' },
    ),
  );
  const listResponse = await runStep(
    'workflow-runs admin list',
    fetch(
      new URL(
        workflowRunsAdminApiPath.list +
          '?pageSize=10&moduleId=' +
          encodeURIComponent(platformModuleId.search),
        baseUrl,
      ),
      {
        method: 'GET',
        headers: {
          [subscriberJourneySessionHeaderName]: sessionId,
        },
      },
    ),
  );
  const detailResponse = await runStep(
    'workflow-runs admin detail',
    fetch(
      new URL(
        workflowRunsAdminApiPath.detail +
          '?runId=' +
          encodeURIComponent(replayJobId),
        baseUrl,
      ),
      {
        method: 'GET',
        headers: {
          [subscriberJourneySessionHeaderName]: sessionId,
        },
      },
    ),
  );
  const replayResponse = await runStep(
    'workflow-runs admin replay',
    fetch(new URL(workflowRunsAdminApiPath.replay, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        runId: replayJobId,
        reason: reasonCatalogId.workflowRunsAdminReplay,
        reasonAttachmentText: 'runbook://workflow-runs/replay',
      }),
    }),
  );
  const cancelResponse = await runStep(
    'workflow-runs admin cancel',
    fetch(new URL(workflowRunsAdminApiPath.cancel, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        runId: cancelJobId,
        reason: reasonCatalogId.workflowRunsAdminCancel,
        reasonAttachmentText: 'runbook://workflow-runs/cancel',
      }),
    }),
  );
  const postActionListResponse = await runStep(
    'workflow-runs admin list after replay and cancel',
    fetch(
      new URL(workflowRunsAdminApiPath.list + '?pageSize=10', baseUrl),
      {
        method: 'GET',
        headers: {
          [subscriberJourneySessionHeaderName]: sessionId,
        },
      },
    ),
  );
  const replayedJobRows = await postgres.database
    .select({
      status: workflowJobsTable.status,
      scheduledAt: workflowJobsTable.scheduledAt,
      completedAt: workflowJobsTable.completedAt,
      lastError: workflowJobsTable.lastError,
      gapReason: workflowJobsTable.gapReason,
    })
    .from(workflowJobsTable)
    .where(eq(workflowJobsTable.jobId, replayJobId));
  const canceledJobRows = await postgres.database
    .select({
      status: workflowJobsTable.status,
      completedAt: workflowJobsTable.completedAt,
    })
    .from(workflowJobsTable)
    .where(eq(workflowJobsTable.jobId, cancelJobId));

  console.log(JSON.stringify({
    unauthenticatedListStatus: unauthenticatedListResponse.status,
    unauthenticatedListBody: await unauthenticatedListResponse.json(),
    listStatus: listResponse.status,
    listBody: await listResponse.json(),
    detailStatus: detailResponse.status,
    detailBody: await detailResponse.json(),
    replayStatus: replayResponse.status,
    replayBody: await replayResponse.json(),
    cancelStatus: cancelResponse.status,
    cancelBody: await cancelResponse.json(),
    replayedJob: {
      status: replayedJobRows[0]?.status,
      scheduledAt: replayedJobRows[0]?.scheduledAt?.toISOString(),
      completedAt: replayedJobRows[0]?.completedAt?.toISOString() ?? null,
      lastError: replayedJobRows[0]?.lastError ?? null,
      gapReason: replayedJobRows[0]?.gapReason ?? null,
    },
    canceledJob: {
      status: canceledJobRows[0]?.status,
      completedAt: canceledJobRows[0]?.completedAt?.toISOString() ?? null,
    },
    postActionListStatus: postActionListResponse.status,
    postActionListBody: await postActionListResponse.json(),
    replayJobId,
    cancelJobId,
    seededReplayScheduledAt,
  }));
} finally {
  server.stop(true);
  await Effect.runPromise(Effect.ignore(postgres.close));
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 30_000,
      },
    );

  it("round-trips workflow-runs admin list/detail/replay/cancel over the real backend HTTP surface", () => {
    const probe = runWorkflowRunsAdminProbe();

    expect(probe.unauthenticatedListStatus).toBe(401);
    expect(probe.unauthenticatedListBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.listStatus).toBe(200);
    expect(probe.listBody.fromCache).toBe(false);
    expect(probe.listBody.result.runs).toEqual([
      expect.objectContaining({
        runId: probe.replayJobId,
        moduleId: platformModuleId.search,
        workflowKey: "search-index-ensure",
        status: workflowRunStatus.failed,
        queuedAt: probe.seededReplayScheduledAt,
        attempt: 2,
        lastError: "Search ensure failed before replay.",
      }),
    ]);

    expect(probe.detailStatus).toBe(200);
    expect(probe.detailBody.detail).toEqual(
      expect.objectContaining({
        runId: probe.replayJobId,
        moduleId: platformModuleId.search,
        workflowKey: "search-index-ensure",
        status: workflowRunStatus.failed,
        auditCorrelationId: expect.stringContaining(
          "corr_backend_e2e_workflow_runs_",
        ),
      }),
    );
    expect(JSON.parse(probe.detailBody.detail.payloadProjection)).toEqual(
      expect.objectContaining({
        correlationId: probe.detailBody.detail.auditCorrelationId,
      }),
    );

    expect(probe.replayStatus).toBe(202);
    expect(probe.replayBody).toEqual({
      accepted: true,
      runId: probe.replayJobId,
    });
    expect(probe.replayedJob.status).toBe(workflowJobStatus.scheduled);
    expect(probe.replayedJob.scheduledAt).not.toBe(
      probe.seededReplayScheduledAt,
    );
    expect(probe.replayedJob.completedAt).toBeNull();
    expect(probe.replayedJob.lastError).toBeNull();
    expect(probe.replayedJob.gapReason).toBeNull();

    expect(probe.cancelStatus).toBe(202);
    expect(probe.cancelBody).toEqual({
      accepted: true,
      runId: probe.cancelJobId,
    });
    expect(probe.canceledJob.status).toBe(workflowJobStatus.canceled);
    expect(probe.canceledJob.completedAt).toEqual(expect.any(String));

    expect(probe.postActionListStatus).toBe(200);
    expect(probe.postActionListBody.result.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: probe.replayJobId,
          status: workflowRunStatus.queued,
        }),
        expect.objectContaining({
          runId: probe.cancelJobId,
          status: workflowRunStatus.canceled,
        }),
      ]),
    );
  });
});
