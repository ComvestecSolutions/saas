import {
  platformScope,
  workflowJobGapReason,
  workflowJobStatus,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e("backend e2e admin billing transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runAdminBillingProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedInspectStatus: number;
      readonly unauthenticatedInspectBody: {
        readonly error: string;
      };
      readonly unauthenticatedCreatePlanStatus: number;
      readonly unauthenticatedCreatePlanBody: {
        readonly error: string;
      };
      readonly listStatus: number;
      readonly listBody: {
        readonly jobs: ReadonlyArray<{
          readonly jobId: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly status: string;
          readonly attempts: number;
          readonly gapReason?: string;
          readonly lastError?: string;
        }>;
      };
      readonly cancelWithoutTokenStatus: number;
      readonly cancelWithoutTokenBody: {
        readonly error: string;
      };
      readonly cancelStatus: number;
      readonly cancelBody: {
        readonly job: {
          readonly jobId: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly status: string;
          readonly attempts: number;
          readonly scheduledAt: string;
          readonly completedAt: string;
          readonly gapReason?: string;
        };
      };
      readonly replayStatus: number;
      readonly replayBody: {
        readonly job: {
          readonly jobId: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly status: string;
          readonly attempts: number;
          readonly scheduledAt: string;
          readonly completedAt?: string;
          readonly gapReason?: string;
        };
      };
      readonly manualWithoutTokenStatus: number;
      readonly manualWithoutTokenBody: {
        readonly error: string;
      };
      readonly manualStatus: number;
      readonly manualBody: {
        readonly jobs: ReadonlyArray<{
          readonly jobId: string;
        }>;
      };
      readonly postMutationListStatus: number;
      readonly postMutationListBody: {
        readonly jobs: ReadonlyArray<{
          readonly jobId: string;
          readonly status: string;
        }>;
      };
      readonly canceledJobRow: {
        readonly status: string;
        readonly attempts: number;
        readonly completedAt: string | null;
      } | null;
      readonly replayedJobRow: {
        readonly status: string;
        readonly attempts: number;
        readonly scheduledAt: string;
      } | null;
      readonly manualAuditEventCount: number;
      readonly cancelJobId: string;
      readonly replayJobId: string;
      readonly seededReplayScheduledAt: string;
    }>(
      `import { Effect } from 'effect';
import { ensurePlatformOperatorIdentity } from './tests/platform/backend-e2e/_shared/platform-operator-identity.ts';
import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  billingAndMeteringAuditAction,
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  billingPlanVisibility,
  platformModuleId,
  platformScope,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from '@comvestec/contracts';
import {
  adminBillingApiPath,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  platformAdapterServiceName,
  subscriberJourneySessionHeaderName,
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

const requestJson = async (url, init) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const runId = Date.now().toString();
const sessionId = 'sess_backend_e2e_admin_billing_' + runId;
const correlationId = 'corr_backend_e2e_admin_billing_' + runId;
const cancelJobId = 'job_backend_e2e_admin_billing_cancel_' + runId;
const replayJobId = 'job_backend_e2e_admin_billing_replay_' + runId;
const seededReplayScheduledAt = '2026-05-13T08:05:00.000Z';
const operatorUsername = 'backend.billing.operator.' + runId;
const operatorPassword = 'Passw0rd!';
const operatorEmail = operatorUsername + '@local.test';
const tenantScopeId = 'org_backend_e2e_admin_billing_' + runId;
const inspectTenantScopeId = 'org_backend_e2e_admin_billing_inspect_' + runId;
const manualNow = '2026-05-13T09:00:00.000Z';

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
for (const tuple of [
  {
    namespace: authorizationNamespace.billingEntitlement,
    object: platformScope.platform,
    relation: authorizationRelation.viewer,
    subject: actorId,
  },
  {
    namespace: authorizationNamespace.billingEntitlement,
    object: platformScope.platform,
    relation: authorizationRelation.admin,
    subject: actorId,
  },
  {
    namespace: authorizationNamespace.module,
    object: platformModuleId.workflowJobs,
    relation: authorizationRelation.admin,
    subject: actorId,
  },
]) {
  await Effect.runPromise(oryKeto.writeTuple(tuple));
  await waitForOryKetoTuple({
    oryKeto,
    tuple,
  });
}

const postgres = await Effect.runPromise(
  makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
await postgres.database.insert(workflowJobsTable).values([
  {
    jobId: cancelJobId,
    runtime: 'convex',
    sourceModuleId: platformModuleId.billingAndMetering,
    kind: workflowJobKind.reconciliationSweep,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.blocked,
    tenantScope: platformScope.organization,
    tenantScopeId,
    attempts: 1,
    scheduledAt: new Date('2026-05-13T08:00:00.000Z'),
    gapReason: workflowJobGapReason.repairFailed,
    lastError: 'Billing reconciliation failed before cancellation.',
    payload: {
      sourceModuleId: platformModuleId.billingAndMetering,
      tenantScope: platformScope.organization,
      tenantScopeId,
      actorId,
      provider: platformAdapterServiceName.polar,
      correlationId,
      subscriptionId: 'sub_backend_e2e_admin_billing_' + runId,
      trigger: workflowJobTrigger.operatorRequested,
    },
    createdAt: new Date('2026-05-13T08:00:00.000Z'),
    updatedAt: new Date('2026-05-13T08:00:00.000Z'),
  },
  {
    jobId: replayJobId,
    runtime: 'convex',
    sourceModuleId: platformModuleId.billingAndMetering,
    kind: workflowJobKind.reconciliationSweep,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.blocked,
    tenantScope: platformScope.organization,
    tenantScopeId,
    attempts: 1,
    scheduledAt: new Date(seededReplayScheduledAt),
    gapReason: workflowJobGapReason.repairFailed,
    lastError: 'Billing reconciliation failed before replay.',
    payload: {
      sourceModuleId: platformModuleId.billingAndMetering,
      tenantScope: platformScope.organization,
      tenantScopeId,
      actorId,
      provider: platformAdapterServiceName.polar,
      correlationId,
      subscriptionId: 'sub_backend_e2e_admin_billing_replay_' + runId,
      trigger: workflowJobTrigger.operatorRequested,
    },
    createdAt: new Date('2026-05-13T08:05:00.000Z'),
    updatedAt: new Date('2026-05-13T08:05:00.000Z'),
  },
]);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedInspectResponse = await runStep(
    'inspect billing state without session',
    requestJson(new URL(adminBillingApiPath.inspectBillingState, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant: {
          scope: platformScope.organization,
          scopeId: inspectTenantScopeId,
          organizationId: inspectTenantScopeId,
        },
      }),
    }),
  );
  const unauthenticatedCreatePlanResponse = await runStep(
    'create managed billing plan without session',
    requestJson(new URL(adminBillingApiPath.createManagedPlan, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan: {
          planKey: 'backend-e2e-scale-' + runId,
          displayName: 'Backend E2E Scale',
          description: 'Backend e2e operator-managed plan request',
          visibility: billingPlanVisibility.draft,
          price: {
            interval: billingPlanInterval.month,
            currency: 'USD',
            amountMinor: 4900,
          },
          entitlements: [
            {
              moduleId: platformModuleId.tenantManagement,
              included: true,
              meteringMode: billingMeteringMode.none,
              enforcementMode: billingEnforcementMode.none,
            },
          ],
        },
      }),
    }),
  );
  const listResponse = await runStep(
    'list admin billing repair gaps',
    requestJson(
      new URL(
        adminBillingApiPath.listRepairGaps +
          '?inspectionReason=' +
          encodeURIComponent('Investigate backend e2e billing repair gaps'),
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
  const cancelWithoutTokenResponse = await runStep(
    'cancel admin billing repair gap without token',
    requestJson(new URL(adminBillingApiPath.cancelRepairGap, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        jobId: cancelJobId,
      }),
    }),
  );
  const cancelResponse = await runStep(
    'cancel admin billing repair gap',
    requestJson(new URL(adminBillingApiPath.cancelRepairGap, baseUrl), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        jobId: cancelJobId,
        inspectionReason: 'Cancel backend e2e billing repair gap',
      }),
    }),
  );
  const replayResponse = await runStep(
    'replay admin billing repair gap',
    requestJson(new URL(adminBillingApiPath.replayRepairGap, baseUrl), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        jobId: replayJobId,
        inspectionReason: 'Replay backend e2e billing repair gap',
      }),
    }),
  );
  const manualWithoutTokenResponse = await runStep(
    'run manual billing reconciliation without token',
    requestJson(
      new URL(adminBillingApiPath.runManualReconciliation, baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: sessionId,
        },
        body: JSON.stringify({
          now: manualNow,
        }),
      },
    ),
  );
  const manualResponse = await runStep(
    'run manual billing reconciliation',
    requestJson(
      new URL(adminBillingApiPath.runManualReconciliation, baseUrl),
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: sessionId,
        },
        body: JSON.stringify({
          now: manualNow,
        }),
      },
    ),
    60000,
  );
  const postMutationListResponse = await runStep(
    'list admin billing repair gaps after mutations',
    requestJson(new URL(adminBillingApiPath.listRepairGaps, baseUrl), {
      method: 'GET',
      headers: {
        [subscriberJourneySessionHeaderName]: sessionId,
      },
    }),
  );

  const canceledJobRows = await runStep(
    'read canceled admin billing repair gap row',
    postgres.sqlClient\`
      select
        status,
        attempts,
        completed_at as "completedAt"
      from workflow_jobs
      where job_id = \${cancelJobId}
      limit 1
    \`,
  );
  const replayedJobRows = await runStep(
    'read replayed admin billing repair gap row',
    postgres.sqlClient\`
      select
        status,
        attempts,
        to_char(scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "scheduledAt"
      from workflow_jobs
      where job_id = \${replayJobId}
      limit 1
    \`,
  );
  const manualAuditRows = await runStep(
    'read admin billing manual-reconciliation audit event',
    postgres.sqlClient\`
      select count(*)::int as count
      from audit_log_events
      where module_id = \${platformModuleId.billingAndMetering}
        and action = \${billingAndMeteringAuditAction.reconciliationTriggered}
        and actor_id = \${actorId}
        and correlation_id = \${correlationId}
    \`,
  );
  const [canceledJobRow] = canceledJobRows;
  const [replayedJobRow] = replayedJobRows;
  const [manualAuditRow] = manualAuditRows;

  console.log(JSON.stringify({
    unauthenticatedInspectStatus: unauthenticatedInspectResponse.status,
    unauthenticatedInspectBody: unauthenticatedInspectResponse.body,
    unauthenticatedCreatePlanStatus: unauthenticatedCreatePlanResponse.status,
    unauthenticatedCreatePlanBody: unauthenticatedCreatePlanResponse.body,
    listStatus: listResponse.status,
    listBody: listResponse.body,
    cancelWithoutTokenStatus: cancelWithoutTokenResponse.status,
    cancelWithoutTokenBody: cancelWithoutTokenResponse.body,
    cancelStatus: cancelResponse.status,
    cancelBody: cancelResponse.body,
    replayStatus: replayResponse.status,
    replayBody: replayResponse.body,
    manualWithoutTokenStatus: manualWithoutTokenResponse.status,
    manualWithoutTokenBody: manualWithoutTokenResponse.body,
    manualStatus: manualResponse.status,
    manualBody: manualResponse.body,
    postMutationListStatus: postMutationListResponse.status,
    postMutationListBody: postMutationListResponse.body,
    canceledJobRow: canceledJobRow ?? null,
    replayedJobRow: replayedJobRow ?? null,
    manualAuditEventCount: Number(manualAuditRow?.count ?? 0),
    cancelJobId,
    replayJobId,
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
        timeoutMs: 120_000,
      },
    );

  it("covers admin billing repair-gap and manual-reconciliation flows over the real backend routes", () => {
    const probe = runAdminBillingProbe();

    expect(probe.unauthenticatedInspectStatus).toBe(401);
    expect(probe.unauthenticatedInspectBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.unauthenticatedCreatePlanStatus).toBe(401);
    expect(probe.unauthenticatedCreatePlanBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.listStatus).toBe(200);
    expect(probe.listBody.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: probe.cancelJobId,
          tenantScope: platformScope.organization,
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
          lastError: "Billing reconciliation failed before cancellation.",
        }),
        expect.objectContaining({
          jobId: probe.replayJobId,
          tenantScope: platformScope.organization,
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
          lastError: "Billing reconciliation failed before replay.",
        }),
      ]),
    );

    expect(probe.cancelWithoutTokenStatus).toBe(401);
    expect(probe.cancelWithoutTokenBody).toEqual({
      error: "Keycloak bearer token is required.",
    });

    expect(probe.cancelStatus).toBe(200);
    expect(probe.cancelBody.job).toEqual(
      expect.objectContaining({
        jobId: probe.cancelJobId,
        tenantScope: platformScope.organization,
        status: workflowJobStatus.canceled,
        attempts: 1,
        gapReason: workflowJobGapReason.repairFailed,
      }),
    );

    expect(probe.replayStatus).toBe(200);
    expect(probe.replayBody.job).toEqual(
      expect.objectContaining({
        jobId: probe.replayJobId,
        tenantScope: platformScope.organization,
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

    expect(probe.manualWithoutTokenStatus).toBe(401);
    expect(probe.manualWithoutTokenBody).toEqual({
      error: "Keycloak bearer token is required.",
    });

    expect(probe.manualStatus).toBe(200);
    expect(Array.isArray(probe.manualBody.jobs)).toBe(true);
    expect(probe.manualAuditEventCount).toBe(1);

    expect(probe.postMutationListStatus).toBe(200);
    expect(probe.postMutationListBody.jobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: probe.cancelJobId,
        }),
      ]),
    );

    expect(probe.canceledJobRow).toEqual(
      expect.objectContaining({
        status: workflowJobStatus.canceled,
        attempts: 1,
      }),
    );
    expect(probe.canceledJobRow?.completedAt).not.toBeNull();
    const manualTouchedReplayedJob = probe.manualBody.jobs.some(
      (job) => job.jobId === probe.replayJobId,
    );
    expect(probe.replayedJobRow).toEqual(
      expect.objectContaining({
        attempts:
          probe.replayBody.job.attempts + (manualTouchedReplayedJob ? 1 : 0),
      }),
    );
    expect([
      workflowJobStatus.scheduled,
      workflowJobStatus.running,
      workflowJobStatus.completed,
      workflowJobStatus.blocked,
    ]).toContain(probe.replayedJobRow?.status);
    expect(probe.replayedJobRow?.scheduledAt).not.toBe(
      probe.seededReplayScheduledAt,
    );
  });
});
