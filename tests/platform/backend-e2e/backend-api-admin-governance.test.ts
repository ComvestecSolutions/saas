import {
  platformModuleId,
  platformScope,
  tenantBrandingFeatureFlag,
} from "@comvestec/contracts";
import {
  runtimeConfigProposalDecisionStatus,
  runtimeConfigSyncArtifactStatus,
} from "@comvestec/modules";
import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2eFeatureFlagsReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e admin governance transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runAdminGovernanceProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedFeatureFlagsStatus: number;
      readonly unauthenticatedFeatureFlagsBody: {
        readonly error: string;
      };
      readonly listFeatureFlagsStatus: number;
      readonly listFeatureFlagsBody: ReadonlyArray<{
        readonly key: string;
        readonly owner: string;
        readonly effectiveState: boolean;
      }>;
      readonly submitProposalStatus: number;
      readonly submitProposalBody: {
        readonly proposal: {
          readonly proposalId: string;
          readonly moduleId: string;
          readonly key: string;
          readonly scope: string;
          readonly scopeId: string;
          readonly value: boolean;
          readonly status: string;
          readonly approvalReason?: string;
        };
        readonly auditEvent: {
          readonly actorId: string;
          readonly moduleId: string;
          readonly action: string;
          readonly reason?: string;
        };
      };
      readonly listProposalsStatus: number;
      readonly listProposalsBody: ReadonlyArray<{
        readonly proposalId: string;
        readonly moduleId: string;
        readonly key: string;
        readonly scope?: string;
        readonly scopeId?: string;
        readonly value?: boolean;
        readonly status: string;
        readonly approvalReason?: string;
      }>;
      readonly reviewProposalStatus: number;
      readonly reviewProposalBody: {
        readonly proposal: {
          readonly proposalId: string;
          readonly moduleId: string;
          readonly key: string;
          readonly scope?: string;
          readonly scopeId?: string;
          readonly value?: boolean;
          readonly status: string;
          readonly approvalReason?: string;
          readonly decidedBy?: string;
          readonly decisionReason?: string;
        };
        readonly auditEvent: {
          readonly actorId: string;
          readonly moduleId: string;
          readonly action: string;
          readonly reason?: string;
        };
      };
      readonly finalListProposalsStatus: number;
      readonly finalListProposalsBody: ReadonlyArray<{
        readonly proposalId: string;
        readonly moduleId: string;
        readonly key: string;
        readonly scope?: string;
        readonly scopeId?: string;
        readonly value?: boolean;
        readonly status: string;
        readonly approvalReason?: string;
        readonly decidedBy?: string;
        readonly decisionReason?: string;
      }>;
      readonly queryAuditByActorStatus: number;
      readonly queryAuditByActorBody: ReadonlyArray<{
        readonly actorId: string;
        readonly moduleId: string;
        readonly action: string;
        readonly reason?: string;
      }>;
      readonly exportAuditEventsStatus: number;
      readonly exportAuditEventsBody: {
        readonly recordCount: number;
        readonly filter: {
          readonly actorId?: string;
          readonly moduleId?: string;
        };
        readonly events: ReadonlyArray<{
          readonly actorId: string;
          readonly moduleId: string;
          readonly action: string;
          readonly reason?: string;
        }>;
      };
    }>(
      `import { Effect } from 'effect';
import {
  actorType,
  platformModuleId,
  platformScope,
  tenantBrandingFeatureFlag,
} from '@comvestec/contracts';
import { runtimeConfigProposalDecisionStatus } from '@comvestec/modules';
import {
  adminGovernanceApiPath,
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

const sessionId = 'sess_backend_e2e_admin_governance';
const actorId = 'usr_backend_e2e_governance_operator';
const scopeId = 'org_smoke';
const runId = Date.now().toString();
const approvalReason = 'Backend e2e tenant-branding feature-flag override ' + runId;
const decisionReason = 'Backend e2e approve tenant-branding feature-flag override ' + runId;
const requestContext = {
  actorType: actorType.supportOperator,
  actorId,
  sessionId,
  correlationId: 'corr_backend_e2e_admin_governance',
  reason: 'Validate admin-governance backend route family',
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
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
  const unauthenticatedFeatureFlagsResponse = await runStep(
    'governance list feature flags without session',
    fetch(new URL(adminGovernanceApiPath.listFeatureFlags, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'sess_body_only_admin_governance',
        moduleId: platformModuleId.tenantBranding,
      }),
    }),
  );
  const listFeatureFlagsResponse = await runStep(
    'governance list feature flags',
    fetch(new URL(adminGovernanceApiPath.listFeatureFlags, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        moduleId: platformModuleId.tenantBranding,
      }),
    }),
  );
  const submitProposalResponse = await runStep(
    'governance submit runtime-config override proposal',
    fetch(
      new URL(adminGovernanceApiPath.submitRuntimeConfigOverrideProposal, baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]: sessionId,
        },
        body: JSON.stringify({
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId,
          value: true,
          approvalReason,
        }),
      },
    ),
  );
  const submitProposalBody = await submitProposalResponse.json();
  const listProposalsResponse = await runStep(
    'governance list runtime-config proposals',
    fetch(new URL(adminGovernanceApiPath.listRuntimeConfigProposals, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        moduleId: platformModuleId.tenantBranding,
      }),
    }),
  );
  const reviewProposalResponse = await runStep(
    'governance review runtime-config proposal',
    fetch(new URL(adminGovernanceApiPath.reviewRuntimeConfigProposal, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        proposalId: submitProposalBody.proposal.proposalId,
        status: runtimeConfigProposalDecisionStatus.approved,
        decisionReason,
      }),
    }),
  );
  const finalListProposalsResponse = await runStep(
    'governance list runtime-config proposals after review',
    fetch(new URL(adminGovernanceApiPath.listRuntimeConfigProposals, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        moduleId: platformModuleId.tenantBranding,
      }),
    }),
  );
  const queryAuditByActorResponse = await runStep(
    'governance query audit events by actor',
    fetch(new URL(adminGovernanceApiPath.queryAuditEventsByActor, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        actorId,
      }),
    }),
  );
  const exportAuditEventsResponse = await runStep(
    'governance export audit events',
    fetch(new URL(adminGovernanceApiPath.exportAuditEvents, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        filter: {
          actorId,
          moduleId: platformModuleId.tenantBranding,
        },
      }),
    }),
  );

  console.log(JSON.stringify({
    unauthenticatedFeatureFlagsStatus: unauthenticatedFeatureFlagsResponse.status,
    unauthenticatedFeatureFlagsBody: await unauthenticatedFeatureFlagsResponse.json(),
    listFeatureFlagsStatus: listFeatureFlagsResponse.status,
    listFeatureFlagsBody: await listFeatureFlagsResponse.json(),
    submitProposalStatus: submitProposalResponse.status,
    submitProposalBody,
    listProposalsStatus: listProposalsResponse.status,
    listProposalsBody: await listProposalsResponse.json(),
    reviewProposalStatus: reviewProposalResponse.status,
    reviewProposalBody: await reviewProposalResponse.json(),
    finalListProposalsStatus: finalListProposalsResponse.status,
    finalListProposalsBody: await finalListProposalsResponse.json(),
    queryAuditByActorStatus: queryAuditByActorResponse.status,
    queryAuditByActorBody: await queryAuditByActorResponse.json(),
    exportAuditEventsStatus: exportAuditEventsResponse.status,
    exportAuditEventsBody: await exportAuditEventsResponse.json(),
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

  it("round-trips admin governance reads, proposal review, and audit export through the real backend-owned HTTP routes", () => {
    const probe = runAdminGovernanceProbe();

    expect(probe.unauthenticatedFeatureFlagsStatus).toBe(401);
    expect(probe.unauthenticatedFeatureFlagsBody).toEqual({
      error: "Admin governance requests require a valid authenticated session.",
    });

    expect(probe.listFeatureFlagsStatus).toBe(200);
    expect(probe.listFeatureFlagsBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.enabled,
          owner: platformModuleId.tenantBranding,
          effectiveState: expect.any(Boolean),
        }),
      ]),
    );

    expect(probe.submitProposalStatus).toBe(202);
    expect(probe.submitProposalBody).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          proposalId: expect.any(String),
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId: "org_smoke",
          value: true,
          status: expect.any(String),
          approvalReason: expect.stringContaining(
            "Backend e2e tenant-branding feature-flag override ",
          ),
        }),
        auditEvent: expect.objectContaining({
          actorId: "usr_backend_e2e_governance_operator",
          moduleId: platformModuleId.tenantBranding,
          action: expect.any(String),
          reason: expect.stringContaining(
            "Backend e2e tenant-branding feature-flag override ",
          ),
        }),
      }),
    );

    expect(probe.listProposalsStatus).toBe(200);
    expect(probe.listProposalsBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: probe.submitProposalBody.proposal.proposalId,
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId: "org_smoke",
          value: true,
          approvalReason: probe.submitProposalBody.proposal.approvalReason,
        }),
      ]),
    );

    expect(probe.reviewProposalStatus).toBe(202);
    expect(probe.reviewProposalBody).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          proposalId: probe.submitProposalBody.proposal.proposalId,
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId: "org_smoke",
          value: true,
          status: runtimeConfigSyncArtifactStatus.applied,
          decidedBy: "usr_backend_e2e_governance_operator",
          decisionReason: expect.stringContaining(
            "Backend e2e approve tenant-branding feature-flag override ",
          ),
        }),
        auditEvent: expect.objectContaining({
          actorId: "usr_backend_e2e_governance_operator",
          moduleId: platformModuleId.tenantBranding,
          action: expect.any(String),
          reason: expect.stringContaining(
            "Backend e2e approve tenant-branding feature-flag override ",
          ),
        }),
      }),
    );

    expect(probe.finalListProposalsStatus).toBe(200);
    expect(probe.finalListProposalsBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: probe.submitProposalBody.proposal.proposalId,
          status: runtimeConfigSyncArtifactStatus.applied,
          decidedBy: "usr_backend_e2e_governance_operator",
          decisionReason: expect.stringContaining(
            "Backend e2e approve tenant-branding feature-flag override ",
          ),
        }),
      ]),
    );

    expect(probe.queryAuditByActorStatus).toBe(200);
    expect(probe.queryAuditByActorBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "usr_backend_e2e_governance_operator",
          moduleId: platformModuleId.tenantBranding,
          reason: expect.stringContaining(
            "Backend e2e tenant-branding feature-flag override ",
          ),
        }),
        expect.objectContaining({
          actorId: "usr_backend_e2e_governance_operator",
          moduleId: platformModuleId.tenantBranding,
          reason: expect.stringContaining(
            "Backend e2e approve tenant-branding feature-flag override ",
          ),
        }),
      ]),
    );

    expect(probe.exportAuditEventsStatus).toBe(200);
    expect(probe.exportAuditEventsBody.filter).toEqual({
      actorId: "usr_backend_e2e_governance_operator",
      moduleId: platformModuleId.tenantBranding,
    });
    expect(probe.exportAuditEventsBody.recordCount).toBeGreaterThanOrEqual(2);
    expect(probe.exportAuditEventsBody.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "usr_backend_e2e_governance_operator",
          moduleId: platformModuleId.tenantBranding,
          reason: expect.stringContaining(
            "Backend e2e tenant-branding feature-flag override ",
          ),
        }),
        expect.objectContaining({
          actorId: "usr_backend_e2e_governance_operator",
          moduleId: platformModuleId.tenantBranding,
          reason: expect.stringContaining(
            "Backend e2e approve tenant-branding feature-flag override ",
          ),
        }),
      ]),
    );
  });
});
