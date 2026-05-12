import {
  authorizationNamespace,
  authorizationRelation,
  actorType,
  platformModuleId,
  platformScope,
  retentionDataType,
  retentionLegalHoldStatus,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2eFeatureFlagsReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eRetentionDataType = retentionDataType.webhookReceipt;

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e retention legal-hold transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runRetentionLegalHoldProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedListStatus: number;
      readonly unauthenticatedListBody: {
        readonly error: string;
      };
      readonly upsertPolicyStatus: number;
      readonly upsertPolicyBody: {
        readonly policyId: string;
        readonly dataType: string;
        readonly retentionDays: number;
        readonly legalHoldActive: boolean;
      };
      readonly listPoliciesStatus: number;
      readonly listPoliciesBody: ReadonlyArray<{
        readonly policyId: string;
        readonly dataType: string;
        readonly retentionDays: number;
        readonly legalHoldActive: boolean;
      }>;
      readonly placeHoldStatus: number;
      readonly placeHoldBody: {
        readonly legalHoldId: string;
        readonly dataType: string;
        readonly targetId: string;
        readonly status: string;
        readonly placedAt: string;
        readonly evidence: string;
        readonly legalHoldActive: boolean;
      };
      readonly duplicateHoldStatus: number;
      readonly duplicateHoldBody: {
        readonly error: string;
      };
      readonly listHoldsStatus: number;
      readonly listHoldsBody: ReadonlyArray<{
        readonly legalHoldId: string;
        readonly dataType: string;
        readonly targetId: string;
        readonly status: string;
        readonly evidence: string;
        readonly legalHoldActive: boolean;
      }>;
      readonly releaseHoldStatus: number;
      readonly releaseHoldBody: {
        readonly legalHoldId: string;
        readonly dataType: string;
        readonly targetId: string;
        readonly status: string;
        readonly evidence: string;
        readonly legalHoldActive: boolean;
        readonly releasedAt?: string;
      };
      readonly finalListHoldsStatus: number;
      readonly finalListHoldsBody: ReadonlyArray<{
        readonly legalHoldId: string;
        readonly dataType: string;
        readonly targetId: string;
        readonly status: string;
        readonly evidence: string;
        readonly legalHoldActive: boolean;
        readonly releasedAt?: string;
      }>;
    }>(
      `import { Effect } from 'effect';
 import {
   actorType,
   authorizationNamespace,
   authorizationRelation,
   platformModuleId,
   platformScope,
   retentionDataType,
 } from '@comvestec/contracts';
 import {
   adminRetentionLegalHoldApiPath,
   makeOryKetoAdapter,
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

 const sessionId = 'sess_backend_e2e_retention_legal_hold';
 const tenantScopeId =
   'org_backend_e2e_retention_legal_hold_' + Date.now().toString();
 const targetId = 'webhook_receipt_backend_e2e_retention_legal_hold_' + Date.now().toString();
const evidence = 'backend-e2e-retention-hold';
const requestContext = {
  actorType: actorType.supportOperator,
  actorId: 'usr_backend_e2e_retention_operator',
  sessionId,
  correlationId: 'corr_backend_e2e_retention_legal_hold',
  reason: 'Validate retention legal-hold backend route family',
   tenant: {
     scope: platformScope.organization,
     scopeId: tenantScopeId,
     enterpriseId: 'ent_backend_e2e_retention_legal_hold',
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

const oryKeto = await Effect.runPromise(
  makeOryKetoAdapter({
    readUrl: process.env.KETO_READ_URL,
    writeUrl: process.env.KETO_WRITE_URL,
  }),
);
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.module,
    object: platformModuleId.retentionLegalHold,
    relation: authorizationRelation.admin,
    subject: 'actor-type:' + actorType.supportOperator,
    tenantScope: platformScope.organization,
    tenantScopeId,
  }),
);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedListResponse = await runStep(
    'retention list policies without session',
    fetch(new URL(adminRetentionLegalHoldApiPath.listPolicies, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'sess_body_only_retention',
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );
  const unauthenticatedListBody = await unauthenticatedListResponse.json();
  const upsertPolicyResponse = await runStep(
    'retention upsert policy',
    fetch(new URL(adminRetentionLegalHoldApiPath.upsertPolicy, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        dataType: retentionDataType.webhookReceipt,
        retentionDays: 365,
      }),
    }),
  );
  const upsertPolicyBody = await upsertPolicyResponse.json();
  const listPoliciesResponse = await runStep(
    'retention list policies',
    fetch(new URL(adminRetentionLegalHoldApiPath.listPolicies, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );
  const listPoliciesBody = await listPoliciesResponse.json();
  const placeHoldResponse = await runStep(
    'retention place legal hold',
    fetch(new URL(adminRetentionLegalHoldApiPath.placeLegalHold, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        dataType: retentionDataType.webhookReceipt,
        targetId,
        reason: 'Backend e2e retention legal-hold workflow',
        evidence,
      }),
    }),
  );
  const placeHoldBody = await placeHoldResponse.json();
  const duplicateHoldResponse = await runStep(
    'retention place duplicate legal hold',
    fetch(new URL(adminRetentionLegalHoldApiPath.placeLegalHold, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        dataType: retentionDataType.webhookReceipt,
        targetId,
        reason: 'Backend e2e retention legal-hold workflow',
        evidence,
      }),
    }),
  );
  const duplicateHoldBody = await duplicateHoldResponse.json();
  const listHoldsResponse = await runStep(
    'retention list legal holds',
    fetch(new URL(adminRetentionLegalHoldApiPath.listLegalHolds, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );
  const listHoldsBody = await listHoldsResponse.json();
  const releaseHoldResponse = await runStep(
    'retention release legal hold',
    fetch(new URL(adminRetentionLegalHoldApiPath.releaseLegalHold, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        legalHoldId: placeHoldBody.legalHoldId,
      }),
    }),
  );
  const releaseHoldBody = await releaseHoldResponse.json();
  const finalListHoldsResponse = await runStep(
    'retention list legal holds after release',
    fetch(new URL(adminRetentionLegalHoldApiPath.listLegalHolds, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );
  const finalListHoldsBody = await finalListHoldsResponse.json();

  console.log(JSON.stringify({
    unauthenticatedListStatus: unauthenticatedListResponse.status,
    unauthenticatedListBody,
    upsertPolicyStatus: upsertPolicyResponse.status,
    upsertPolicyBody,
    listPoliciesStatus: listPoliciesResponse.status,
    listPoliciesBody,
    placeHoldStatus: placeHoldResponse.status,
    placeHoldBody,
    duplicateHoldStatus: duplicateHoldResponse.status,
    duplicateHoldBody,
    listHoldsStatus: listHoldsResponse.status,
    listHoldsBody,
    releaseHoldStatus: releaseHoldResponse.status,
    releaseHoldBody,
    finalListHoldsStatus: finalListHoldsResponse.status,
    finalListHoldsBody,
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

  it("round-trips retention policies and legal holds through the real backend-owned HTTP routes", () => {
    const probe = runRetentionLegalHoldProbe();

    expect(probe.unauthenticatedListStatus).toBe(401);
    expect(probe.unauthenticatedListBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.upsertPolicyStatus).toBe(200);
    expect(probe.upsertPolicyBody).toEqual(
      expect.objectContaining({
        policyId: expect.any(String),
        dataType: localBackendE2eRetentionDataType,
        retentionDays: 365,
        legalHoldActive: expect.any(Boolean),
      }),
    );

    expect(probe.listPoliciesStatus).toBe(200);
    expect(probe.listPoliciesBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policyId: probe.upsertPolicyBody.policyId,
          dataType: localBackendE2eRetentionDataType,
          retentionDays: 365,
          legalHoldActive: expect.any(Boolean),
        }),
      ]),
    );

    expect(probe.placeHoldStatus).toBe(201);
    expect(probe.placeHoldBody).toEqual(
      expect.objectContaining({
        legalHoldId: expect.any(String),
        dataType: localBackendE2eRetentionDataType,
        targetId: expect.stringContaining(
          "webhook_receipt_backend_e2e_retention_legal_hold_",
        ),
        status: retentionLegalHoldStatus.active,
        evidence: "backend-e2e-retention-hold",
        legalHoldActive: true,
      }),
    );

    expect(probe.duplicateHoldStatus).toBe(409);
    expect(probe.duplicateHoldBody).toEqual({
      error: "Legal hold already exists for this scope, data type, and target.",
    });

    expect(probe.listHoldsStatus).toBe(200);
    expect(probe.listHoldsBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legalHoldId: probe.placeHoldBody.legalHoldId,
          dataType: localBackendE2eRetentionDataType,
          targetId: probe.placeHoldBody.targetId,
          status: retentionLegalHoldStatus.active,
          evidence: "backend-e2e-retention-hold",
          legalHoldActive: true,
        }),
      ]),
    );

    expect(probe.releaseHoldStatus).toBe(200);
    expect(probe.releaseHoldBody).toEqual(
      expect.objectContaining({
        legalHoldId: probe.placeHoldBody.legalHoldId,
        dataType: localBackendE2eRetentionDataType,
        targetId: probe.placeHoldBody.targetId,
        status: retentionLegalHoldStatus.released,
        evidence: "backend-e2e-retention-hold",
        legalHoldActive: false,
        releasedAt: expect.any(String),
      }),
    );

    expect(probe.finalListHoldsStatus).toBe(200);
    expect(probe.finalListHoldsBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legalHoldId: probe.placeHoldBody.legalHoldId,
          dataType: localBackendE2eRetentionDataType,
          targetId: probe.placeHoldBody.targetId,
          status: retentionLegalHoldStatus.released,
          evidence: "backend-e2e-retention-hold",
          legalHoldActive: false,
          releasedAt: expect.any(String),
        }),
      ]),
    );
  });
});
