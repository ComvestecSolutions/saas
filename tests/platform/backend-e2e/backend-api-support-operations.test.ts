import {
  platformScope,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e("backend e2e support operations transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runSupportOperationsProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedListStatus: number;
      readonly unauthenticatedListBody: {
        readonly error: string;
      };
      readonly upsertStatus: number;
      readonly upsertBody: {
        readonly caseId: string;
        readonly supportAgent: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly summary: string;
        readonly status: string;
        readonly priority: string;
      };
      readonly listStatus: number;
      readonly listBody: ReadonlyArray<{
        readonly caseId: string;
        readonly supportAgent: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly summary: string;
        readonly status: string;
        readonly priority: string;
      }>;
      readonly tenantHealthStatus: number;
      readonly tenantHealthBody: {
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly cases: ReadonlyArray<{
          readonly caseId: string;
          readonly supportAgent: string;
          readonly tenantScope: string;
          readonly tenantScopeId: string;
          readonly summary: string;
          readonly status: string;
          readonly priority: string;
        }>;
        readonly repairGaps: ReadonlyArray<unknown>;
      };
    }>(
      `import { Effect } from 'effect';
import {
  actorType,
  platformScope,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
} from '@comvestec/contracts';
import {
  adminSupportOperationsApiPath,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';

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

const sessionId = 'sess_backend_e2e_support_operations';
const tenantScopeId = 'org_smoke';
const caseId = 'case_backend_e2e_support_operations_' + Date.now().toString();
const summary = 'Backend e2e support-operations case';
const requestContext = {
  actorType: actorType.supportOperator,
  actorId: 'usr_backend_e2e_support_operator',
  sessionId,
  correlationId: 'corr_backend_e2e_support_operations',
  reason: 'Validate support-operations backend route family',
  tenant: {
    scope: platformScope.organization,
    scopeId: tenantScopeId,
    enterpriseId: 'ent_smoke',
    organizationId: tenantScopeId,
  },
};

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId,
    requestContext,
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedListResponse = await runStep(
    'support operations list cases without session',
    fetch(new URL(adminSupportOperationsApiPath.listCases, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'sess_body_only_support_operations',
        status: supportOperationsCaseStatus.open,
      }),
    }),
  );
  const upsertResponse = await runStep(
    'support operations upsert case',
    fetch(new URL(adminSupportOperationsApiPath.upsertCase, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        caseId,
        tenantScope: platformScope.organization,
        tenantScopeId,
        summary,
        status: supportOperationsCaseStatus.open,
        priority: supportOperationsCasePriority.high,
        changeReason: 'Backend e2e operator case round-trip',
      }),
    }),
  );
  const listResponse = await runStep(
    'support operations list cases',
    fetch(new URL(adminSupportOperationsApiPath.listCases, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        status: supportOperationsCaseStatus.open,
      }),
    }),
  );
  const tenantHealthResponse = await runStep(
    'support operations tenant health',
    fetch(new URL(adminSupportOperationsApiPath.tenantHealth, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        tenantScope: platformScope.organization,
        tenantScopeId,
      }),
    }),
  );

  console.log(JSON.stringify({
    unauthenticatedListStatus: unauthenticatedListResponse.status,
    unauthenticatedListBody: await unauthenticatedListResponse.json(),
    upsertStatus: upsertResponse.status,
    upsertBody: await upsertResponse.json(),
    listStatus: listResponse.status,
    listBody: await listResponse.json(),
    tenantHealthStatus: tenantHealthResponse.status,
    tenantHealthBody: await tenantHealthResponse.json(),
  }));
} finally {
  server.stop(true);
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 30_000,
      },
    );

  it("round-trips support cases and tenant health through the real backend-owned HTTP routes", () => {
    const probe = runSupportOperationsProbe();

    expect(probe.unauthenticatedListStatus).toBe(401);
    expect(probe.unauthenticatedListBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.upsertStatus).toBe(200);
    expect(probe.upsertBody).toEqual(
      expect.objectContaining({
        caseId: expect.any(String),
        supportAgent: "usr_backend_e2e_support_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_smoke",
        summary: "Backend e2e support-operations case",
        status: supportOperationsCaseStatus.open,
        priority: supportOperationsCasePriority.high,
      }),
    );

    expect(probe.listStatus).toBe(200);
    expect(probe.listBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: probe.upsertBody.caseId,
          supportAgent: "usr_backend_e2e_support_operator",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_smoke",
          summary: "Backend e2e support-operations case",
          status: supportOperationsCaseStatus.open,
          priority: supportOperationsCasePriority.high,
        }),
      ]),
    );

    expect(probe.tenantHealthStatus).toBe(200);
    expect(probe.tenantHealthBody.tenantScope).toBe(platformScope.organization);
    expect(probe.tenantHealthBody.tenantScopeId).toBe("org_smoke");
    expect(probe.tenantHealthBody.cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: probe.upsertBody.caseId,
          supportAgent: "usr_backend_e2e_support_operator",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_smoke",
          summary: "Backend e2e support-operations case",
          status: supportOperationsCaseStatus.open,
          priority: supportOperationsCasePriority.high,
        }),
      ]),
    );
    expect(probe.tenantHealthBody.repairGaps).toEqual(expect.any(Array));
  });
});
