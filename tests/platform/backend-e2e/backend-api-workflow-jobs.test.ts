import {
  platformModuleId,
  platformScope,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e("backend e2e workflow-jobs transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runWorkflowJobsProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedListStatus: number;
      readonly unauthenticatedListBody: {
        readonly error: string;
      };
      readonly listStatus: number;
      readonly listBody: {
        readonly jobs: ReadonlyArray<{
          readonly jobId: string;
          readonly sourceModuleId: string;
          readonly kind: string;
          readonly trigger: string;
          readonly status: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly attempts: number;
          readonly scheduledAt: string;
          readonly gapReason: string;
        }>;
      };
      readonly cancelStatus: number;
      readonly cancelBody: {
        readonly job: {
          readonly jobId: string;
          readonly sourceModuleId: string;
          readonly kind: string;
          readonly trigger: string;
          readonly status: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly attempts: number;
          readonly scheduledAt: string;
          readonly completedAt: string;
          readonly gapReason: string;
        };
      };
      readonly replayStatus: number;
      readonly replayBody: {
        readonly job: {
          readonly jobId: string;
          readonly sourceModuleId: string;
          readonly kind: string;
          readonly trigger: string;
          readonly status: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly attempts: number;
          readonly scheduledAt: string;
          readonly gapReason?: string;
          readonly completedAt?: string;
        };
      };
      readonly postCancelListStatus: number;
      readonly postCancelListBody: {
        readonly jobs: ReadonlyArray<{
          readonly jobId: string;
          readonly status: string;
        }>;
      };
      readonly seededReplayScheduledAt: string;
      readonly cancelJobId: string;
      readonly replayJobId: string;
    }>(
      `import { Effect } from 'effect';
import { ensurePlatformOperatorIdentity } from './tests/platform/backend-e2e/_shared/platform-operator-identity.ts';
import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  platformModuleId,
  platformScope,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from '@comvestec/contracts';
 import {
   makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
  workflowJobsApiPath,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';
import { workflowJobsTable } from './packages/modules/src/persistence/postgres/domains/workflow-jobs.ts';

const runStep = async (label, operation, timeoutMs = 30000) => {
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
const sessionId = 'sess_backend_e2e_workflow_jobs_' + runId;
const cancelJobId = 'job_backend_e2e_workflow_cancel_' + runId;
const replayJobId = 'job_backend_e2e_workflow_replay_' + runId;
const seededReplayScheduledAt = '2026-05-12T06:05:00.000Z';
const operatorUsername = 'backend.workflow.operator.' + runId;
const operatorPassword = 'Passw0rd!';
const operatorEmail = operatorUsername + '@local.test';
const correlationId = 'corr_backend_e2e_workflow_jobs_' + runId;
const tenantScopeId = 'org_smoke';
const searchSettings = {
  filterableAttributes: ['status', 'moduleId'],
  sortableAttributes: ['updatedAt'],
  searchableAttributes: ['title', 'content'],
  rankingRules: ['words', 'typo', 'sort'],
  synonyms: {
    invoice: ['bill', 'statement'],
  },
};

const { actorId, token } = await ensurePlatformOperatorIdentity({
  baseUrl: process.env.KEYCLOAK_BASE_URL,
  realm: process.env.KEYCLOAK_REALM,
  clientId: process.env.KEYCLOAK_CLIENT_ID,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  adminUsername: process.env.KEYCLOAK_ADMIN,
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,
  username: operatorUsername,
  password: operatorPassword,
  email: operatorEmail,
});

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
      reason: 'Validate workflow-jobs backend route family',
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    },
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const oryKeto = await Effect.runPromise(
  makeOryKetoAdapter({
    readUrl: process.env.KETO_READ_URL,
    writeUrl: process.env.KETO_WRITE_URL,
  }),
);
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.module,
    object: platformModuleId.workflowJobs,
    relation: authorizationRelation.admin,
    subject: actorId,
  }),
);
await waitForOryKetoTuple({
  oryKeto,
  tuple: {
    namespace: authorizationNamespace.module,
    object: platformModuleId.workflowJobs,
    relation: authorizationRelation.admin,
    subject: actorId,
  },
});

const postgres = await Effect.runPromise(
  makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
const seededRequestContext = {
  actorType: actorType.platformOperator,
  actorId,
  sessionId,
  correlationId,
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};
await postgres.database.insert(workflowJobsTable).values([
  {
    jobId: cancelJobId,
    runtime: 'convex',
    sourceModuleId: platformModuleId.search,
    kind: workflowJobKind.searchIndexEnsure,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.blocked,
    tenantScope: platformScope.organization,
    tenantScopeId,
    attempts: 1,
    scheduledAt: new Date('2026-05-12T06:00:00.000Z'),
    gapReason: workflowJobGapReason.repairFailed,
    lastError: 'Search ensure failed before cancellation.',
    payload: {
      sourceModuleId: platformModuleId.search,
      tenantScope: platformScope.organization,
      tenantScopeId,
      requestContext: seededRequestContext,
      actorId,
      correlationId,
      settings: searchSettings,
    },
    createdAt: new Date('2026-05-12T06:00:00.000Z'),
    updatedAt: new Date('2026-05-12T06:00:00.000Z'),
  },
  {
    jobId: replayJobId,
    runtime: 'convex',
    sourceModuleId: platformModuleId.search,
    kind: workflowJobKind.searchIndexEnsure,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.blocked,
    tenantScope: platformScope.organization,
    tenantScopeId,
    attempts: 1,
    scheduledAt: new Date(seededReplayScheduledAt),
    gapReason: workflowJobGapReason.repairFailed,
    lastError: 'Search ensure failed before replay.',
    payload: {
      sourceModuleId: platformModuleId.search,
      tenantScope: platformScope.organization,
      tenantScopeId,
      requestContext: seededRequestContext,
      actorId,
      correlationId,
      settings: searchSettings,
    },
    createdAt: new Date('2026-05-12T06:05:00.000Z'),
    updatedAt: new Date('2026-05-12T06:05:00.000Z'),
  },
]);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedListResponse = await runStep(
    'list workflow repair gaps without session',
    fetch(
      new URL(
        workflowJobsApiPath.listRepairGaps +
          '?sourceModuleId=' +
          platformModuleId.search,
        baseUrl,
      ),
      {
        method: 'GET',
      },
    ),
  );
  const listResponse = await runStep(
    'list workflow repair gaps',
    fetch(
      new URL(
        workflowJobsApiPath.listRepairGaps +
          '?sourceModuleId=' +
          platformModuleId.search,
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
  const cancelResponse = await runStep(
    'cancel workflow repair gap',
    fetch(new URL(workflowJobsApiPath.cancelRepairGap, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        jobId: cancelJobId,
      }),
    }),
  );
  const replayResponse = await runStep(
    'replay workflow repair gap',
    fetch(new URL(workflowJobsApiPath.replayRepairGap, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        jobId: replayJobId,
      }),
    }),
  );

  const postCancelListResponse = await runStep(
    'list workflow repair gaps after cancellation and replay',
    fetch(
      new URL(
        workflowJobsApiPath.listRepairGaps +
          '?sourceModuleId=' +
          platformModuleId.search,
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

  console.log(JSON.stringify({
    unauthenticatedListStatus: unauthenticatedListResponse.status,
    unauthenticatedListBody: await unauthenticatedListResponse.json(),
    listStatus: listResponse.status,
    listBody: await listResponse.json(),
    cancelStatus: cancelResponse.status,
    cancelBody: await cancelResponse.json(),
    replayStatus: replayResponse.status,
    replayBody: await replayResponse.json(),
    postCancelListStatus: postCancelListResponse.status,
    postCancelListBody: await postCancelListResponse.json(),
    seededReplayScheduledAt,
    cancelJobId,
    replayJobId,
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
        timeoutMs: 90_000,
      },
    );

  it("lists, cancels, and replays repair gaps through the real workflow-jobs backend routes", () => {
    const probe = runWorkflowJobsProbe();

    expect(probe.unauthenticatedListStatus).toBe(401);
    expect(probe.unauthenticatedListBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.listStatus).toBe(200);
    expect(probe.listBody.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: probe.cancelJobId,
          sourceModuleId: platformModuleId.search,
          kind: workflowJobKind.searchIndexEnsure,
          trigger: workflowJobTrigger.operatorRequested,
          status: workflowJobStatus.blocked,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_smoke",
          gapReason: workflowJobGapReason.repairFailed,
        }),
        expect.objectContaining({
          jobId: probe.replayJobId,
          sourceModuleId: platformModuleId.search,
          kind: workflowJobKind.searchIndexEnsure,
          trigger: workflowJobTrigger.operatorRequested,
          status: workflowJobStatus.blocked,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_smoke",
          gapReason: workflowJobGapReason.repairFailed,
        }),
      ]),
    );

    expect(probe.cancelStatus).toBe(200);
    expect(probe.cancelBody.job).toEqual({
      jobId: probe.cancelJobId,
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.canceled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_smoke",
      attempts: 1,
      scheduledAt: "2026-05-12T06:00:00.000Z",
      completedAt: probe.cancelBody.job.completedAt,
      gapReason: workflowJobGapReason.repairFailed,
    });
    expect(probe.postCancelListStatus).toBe(200);
    expect(probe.postCancelListBody.jobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: probe.cancelJobId,
        }),
      ]),
    );

    expect(probe.replayStatus).toBe(200);
    expect(probe.replayBody.job).toEqual(
      expect.objectContaining({
        jobId: probe.replayJobId,
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_smoke",
        attempts: 2,
      }),
    );
    expect([
      workflowJobStatus.scheduled,
      workflowJobStatus.running,
      workflowJobStatus.completed,
      workflowJobStatus.blocked,
    ]).toContain(probe.replayBody.job.status);
    expect(probe.replayBody.job.scheduledAt).not.toBe(
      probe.seededReplayScheduledAt,
    );
  });
});
