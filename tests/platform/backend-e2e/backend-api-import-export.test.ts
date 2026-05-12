import {
  importExportJobFormat,
  importExportJobSource,
  workflowJobStatus,
} from "@comvestec/contracts";
import { isLocalBackendE2eFeatureFlagsReady } from "./_shared/local-backend-e2e";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e import-export transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runImportExportProbe = () =>
    runBackendE2eBunProbe<{
      readonly submitProposalStatus: number;
      readonly reviewProposalStatus: number;
      readonly unauthenticatedStatus: number;
      readonly unauthenticatedBody: {
        readonly error: string;
      };
      readonly invalidScopeStatus: number;
      readonly invalidScopeBody: {
        readonly error: string;
      };
      readonly managedFileRequestStatus: number;
      readonly managedFileRequestBody: {
        readonly jobId: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly source: string;
        readonly format: string;
        readonly status: string;
        readonly createdAt: string;
      };
      readonly managedFileInspectStatus: number;
      readonly managedFileInspectBody: {
        readonly jobId: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly source: string;
        readonly format: string;
        readonly status: string;
        readonly createdAt: string;
      };
      readonly supportCaseRequestStatus: number;
      readonly supportCaseRequestBody: {
        readonly jobId: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly source: string;
        readonly format: string;
        readonly status: string;
        readonly createdAt: string;
      };
      readonly supportCaseInspectStatus: number;
      readonly supportCaseInspectBody: {
        readonly jobId: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly source: string;
        readonly format: string;
        readonly status: string;
        readonly createdAt: string;
      };
    }>(
      `import { Effect } from 'effect';
import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  importExportJobFormat,
  platformModuleId,
  platformScope,
} from '@comvestec/contracts';
import {
  adminGovernanceApiPath,
  importExportApiPath,
  makeOryKetoAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';
import { importExportFeatureFlag } from '@comvestec/config';
import { runtimeConfigProposalDecisionStatus } from '@comvestec/modules';

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
const actorId = 'usr_backend_e2e_import_export_operator_' + runId;
const sessionId = 'sess_backend_e2e_import_export_' + runId;
const governanceSessionId = 'sess_backend_e2e_import_export_governance_' + runId;
const governanceActorId = 'usr_backend_e2e_import_export_governance_' + runId;
const tenantScopeId = 'org_smoke';

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId,
      sessionId,
      correlationId: 'corr_backend_e2e_import_export_' + runId,
      reason: 'Validate import-export backend route family',
      tenant: {
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        organizationId: tenantScopeId,
        enterpriseId: 'ent_smoke',
      },
    },
  }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: governanceSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId: governanceActorId,
      sessionId: governanceSessionId,
      correlationId: 'corr_backend_e2e_import_export_governance_' + runId,
      reason: 'Enable import-export runtime flag for backend e2e',
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
    object: platformModuleId.importExport,
    relation: authorizationRelation.admin,
    subject: actorId,
  }),
);
await waitForOryKetoTuple({
  oryKeto,
  tuple: {
    namespace: authorizationNamespace.module,
    object: platformModuleId.importExport,
    relation: authorizationRelation.admin,
    subject: actorId,
  },
});

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const submitProposalResponse = await runStep(
    'submit import-export feature-flag proposal',
    fetch(
      new URL(
        adminGovernanceApiPath.submitRuntimeConfigOverrideProposal,
        baseUrl,
      ),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: governanceSessionId,
        },
        body: JSON.stringify({
          moduleId: platformModuleId.importExport,
          key: importExportFeatureFlag.enabled,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: true,
          approvalReason:
            'Enable import-export for backend e2e transport coverage ' + runId,
        }),
      },
    ),
  );
  const submitProposalBody = await submitProposalResponse.json();
  const reviewProposalResponse = await runStep(
    'approve import-export feature-flag proposal',
    fetch(
      new URL(adminGovernanceApiPath.reviewRuntimeConfigProposal, baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: governanceSessionId,
        },
        body: JSON.stringify({
          proposalId: submitProposalBody.proposal.proposalId,
          status: runtimeConfigProposalDecisionStatus.approved,
          decisionReason:
            'Apply import-export runtime flag for backend e2e transport coverage ' +
            runId,
        }),
      },
    ),
  );
  const unauthenticatedResponse = await runStep(
    'import-export request without trusted session',
    fetch(new URL(importExportApiPath.requestManagedFileSummaryExport, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'sess_body_only_import_export',
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        format: importExportJobFormat.csv,
      }),
    }),
  );
  const invalidScopeResponse = await runStep(
    'import-export request with invalid platform scope',
    fetch(new URL(importExportApiPath.requestManagedFileSummaryExport, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      }),
    }),
  );
  const managedFileRequestResponse = await runStep(
    'request managed-file summary export',
    fetch(new URL(importExportApiPath.requestManagedFileSummaryExport, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        format: importExportJobFormat.csv,
      }),
    }),
  );
  const managedFileRequestBody = await managedFileRequestResponse.json();
  const managedFileInspectResponse = await runStep(
    'inspect managed-file export job',
    fetch(new URL(importExportApiPath.getImportExportJob, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        jobId: managedFileRequestBody.jobId,
      }),
    }),
  );
  const supportCaseRequestResponse = await runStep(
    'request support-case summary export',
    fetch(new URL(importExportApiPath.requestSupportCaseSummaryExport, baseUrl), {
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
  const supportCaseRequestBody = await supportCaseRequestResponse.json();
  const supportCaseInspectResponse = await runStep(
    'inspect support-case export job',
    fetch(new URL(importExportApiPath.getImportExportJob, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        jobId: supportCaseRequestBody.jobId,
      }),
    }),
  );

  console.log(JSON.stringify({
    submitProposalStatus: submitProposalResponse.status,
    reviewProposalStatus: reviewProposalResponse.status,
    unauthenticatedStatus: unauthenticatedResponse.status,
    unauthenticatedBody: await unauthenticatedResponse.json(),
    invalidScopeStatus: invalidScopeResponse.status,
    invalidScopeBody: await invalidScopeResponse.json(),
    managedFileRequestStatus: managedFileRequestResponse.status,
    managedFileRequestBody,
    managedFileInspectStatus: managedFileInspectResponse.status,
    managedFileInspectBody: await managedFileInspectResponse.json(),
    supportCaseRequestStatus: supportCaseRequestResponse.status,
    supportCaseRequestBody,
    supportCaseInspectStatus: supportCaseInspectResponse.status,
    supportCaseInspectBody: await supportCaseInspectResponse.json(),
  }));
} finally {
  server.stop(true);
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 45_000,
      },
    );

  it("round-trips import-export request and inspection flows through the real backend-owned HTTP routes", () => {
    const probe = runImportExportProbe();

    expect(probe.unauthenticatedStatus).toBe(401);
    expect(probe.unauthenticatedBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.submitProposalStatus).toBe(202);
    expect(probe.reviewProposalStatus).toBe(202);

    expect(probe.invalidScopeStatus).toBe(400);
    expect(probe.invalidScopeBody).toEqual({
      error: "Request payload did not match the expected schema.",
    });

    expect(probe.managedFileRequestStatus).toBe(200);
    expect(probe.managedFileRequestBody).toEqual({
      jobId: probe.managedFileRequestBody.jobId,
      tenantScope: "organization",
      tenantScopeId: "org_smoke",
      source: importExportJobSource.managedFileSummaryCsv,
      format: importExportJobFormat.csv,
      status: workflowJobStatus.scheduled,
      createdAt: probe.managedFileRequestBody.createdAt,
    });
    expect(probe.managedFileInspectStatus).toBe(200);
    expect(probe.managedFileInspectBody).toEqual(probe.managedFileRequestBody);

    expect(probe.supportCaseRequestStatus).toBe(200);
    expect(probe.supportCaseRequestBody).toEqual({
      jobId: probe.supportCaseRequestBody.jobId,
      tenantScope: "organization",
      tenantScopeId: "org_smoke",
      source: importExportJobSource.supportCaseSummaryJson,
      format: importExportJobFormat.json,
      status: workflowJobStatus.scheduled,
      createdAt: probe.supportCaseRequestBody.createdAt,
    });
    expect(probe.supportCaseInspectStatus).toBe(200);
    expect(probe.supportCaseInspectBody).toEqual(probe.supportCaseRequestBody);

    expect(probe.managedFileRequestBody.jobId).not.toBe(
      probe.supportCaseRequestBody.jobId,
    );
  });
});
