import {
  authorizationRelation,
  authorizationNamespace,
  platformScope,
  tenantInvitationStatus,
} from "@comvestec/contracts";
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

describeLocalBackendE2e("backend e2e tenant management transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runTenantManagementProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedIssueStatus: number;
      readonly unauthenticatedIssueBody: {
        readonly error: string;
      };
      readonly issueInvitationStatus: number;
      readonly issueInvitationBody: {
        readonly tenant: {
          readonly scope: string;
          readonly scopeId: string;
          readonly organizationId?: string;
        };
        readonly invitation: {
          readonly invitationId: string;
          readonly recipientEmail: string;
          readonly relation: string;
          readonly status: string;
        };
        readonly handoff: {
          readonly invitationToken: string;
          readonly expiresAt: string;
        };
        readonly delivery: {
          readonly status: string;
          readonly template: string;
          readonly messageId?: string;
        };
      };
      readonly listInvitationsStatus: number;
      readonly listInvitationsBody: {
        readonly tenant: {
          readonly scope: string;
          readonly scopeId: string;
          readonly organizationId?: string;
        };
        readonly invitations: ReadonlyArray<{
          readonly invitationId: string;
          readonly recipientEmail: string;
          readonly relation: string;
          readonly status: string;
        }>;
      };
      readonly revokeInvitationStatus: number;
      readonly revokeInvitationBody: {
        readonly invitationId: string;
        readonly changed: boolean;
        readonly invitation: {
          readonly invitationId: string;
          readonly recipientEmail: string;
          readonly relation: string;
          readonly status: string;
          readonly revokedBy?: string;
        };
      };
      readonly secondIssueInvitationStatus: number;
      readonly secondIssueInvitationBody: {
        readonly invitation: {
          readonly invitationId: string;
          readonly recipientEmail: string;
          readonly relation: string;
          readonly status: string;
        };
        readonly handoff: {
          readonly invitationToken: string;
        };
      };
      readonly unauthenticatedRedeemStatus: number;
      readonly unauthenticatedRedeemBody: {
        readonly error: string;
      };
      readonly memberActorId: string;
      readonly redeemInvitationStatus: number;
      readonly redeemInvitationBody: {
        readonly tenant: {
          readonly scope: string;
          readonly scopeId: string;
          readonly organizationId?: string;
        };
        readonly invitationId: string;
        readonly relation: string;
        readonly membershipChanged: boolean;
        readonly membership: {
          readonly subject: string;
          readonly relations: ReadonlyArray<string>;
        };
        readonly branding: {
          readonly companyName: string;
          readonly themeTokens: {
            readonly primary: string;
            readonly secondary: string;
            readonly accent: string;
          };
          readonly effectiveScope: string;
          readonly entitled: boolean;
        };
      };
      readonly queryMembershipsStatus: number;
      readonly queryMembershipsBody: {
        readonly tenant: {
          readonly scope: string;
          readonly scopeId: string;
          readonly organizationId?: string;
        };
        readonly memberships: ReadonlyArray<{
          readonly subject: string;
          readonly relations: ReadonlyArray<string>;
        }>;
      };
      readonly finalListInvitationsStatus: number;
      readonly finalListInvitationsBody: {
        readonly tenant: {
          readonly scope: string;
          readonly scopeId: string;
          readonly organizationId?: string;
        };
        readonly invitations: ReadonlyArray<{
          readonly invitationId: string;
          readonly recipientEmail: string;
          readonly relation: string;
          readonly status: string;
          readonly redeemedBy?: string;
          readonly revokedBy?: string;
        }>;
      };
    }>(
      `import { Effect } from 'effect';
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  platformScope,
} from '@comvestec/contracts';
import {
  adminTenantManagementApiPath,
  makeOryKetoAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
  tenantInvitationRedemptionApiPath,
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

const tenant = {
  scope: platformScope.organization,
  scopeId: 'org_smoke',
  organizationId: 'org_smoke',
};
const operatorSessionId = 'sess_backend_e2e_tenant_management_operator';
const operatorActorId = 'usr_backend_e2e_platform_tenant_operator';
const runId = Date.now().toString();
const memberSessionId = 'sess_backend_e2e_tenant_management_member_' + runId;
const memberActorId = 'usr_backend_e2e_redeemed_member_' + runId;
const firstRecipientEmail = 'backend-e2e-revoked-' + runId + '@example.com';
const secondRecipientEmail = 'backend-e2e-redeemed-' + runId + '@example.com';

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: operatorSessionId,
    requestContext: {
      actorType: actorType.platformOperator,
      actorId: operatorActorId,
      sessionId: operatorSessionId,
      correlationId: 'corr_backend_e2e_tenant_management_operator',
      reason: 'Validate tenant-management backend route family',
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    },
  }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: memberSessionId,
    requestContext: {
      actorType: actorType.organizationMember,
      actorId: memberActorId,
      sessionId: memberSessionId,
      correlationId: 'corr_backend_e2e_tenant_management_member',
      reason: 'Redeem tenant invitation through backend route family',
      tenant: {
        scope: platformScope.organization,
        scopeId: 'org_member_home',
        organizationId: 'org_member_home',
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
    namespace: authorizationNamespace.tenant,
    object: tenant.scopeId,
    relation: authorizationRelation.admin,
    subject: operatorActorId,
  }),
);
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.tenant,
    object: tenant.scopeId,
    relation: authorizationRelation.viewer,
    subject: operatorActorId,
  }),
);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedIssueResponse = await runStep(
    'tenant management issue invitation without session',
    fetch(new URL(adminTenantManagementApiPath.issueInvitation, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'sess_body_only_tenant_management',
        tenant,
        recipientEmail: firstRecipientEmail,
        relation: authorizationRelation.admin,
        issueReason: 'Backend e2e should ignore caller supplied session ids',
      }),
    }),
  );
  const issueInvitationResponse = await runStep(
    'tenant management issue first invitation',
    fetch(new URL(adminTenantManagementApiPath.issueInvitation, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: operatorSessionId,
      },
      body: JSON.stringify({
        tenant,
        recipientEmail: firstRecipientEmail,
        relation: authorizationRelation.admin,
        issueReason: 'Backend e2e revoked invitation',
      }),
    }),
  );
  const issueInvitationBody = await issueInvitationResponse.json();
  const listInvitationsResponse = await runStep(
    'tenant management list invitations after first issue',
    fetch(new URL(adminTenantManagementApiPath.queryInvitations, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: operatorSessionId,
      },
      body: JSON.stringify({
        tenant,
        inspectionReason: 'Backend e2e list tenant invitations',
      }),
    }),
  );
  const revokeInvitationResponse = await runStep(
    'tenant management revoke first invitation',
    fetch(new URL(adminTenantManagementApiPath.revokeInvitation, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: operatorSessionId,
      },
      body: JSON.stringify({
        tenant,
        invitationId: issueInvitationBody.invitation.invitationId,
        revocationReason: 'Backend e2e revoke pending invitation',
      }),
    }),
  );
  const secondIssueInvitationResponse = await runStep(
    'tenant management issue second invitation',
    fetch(new URL(adminTenantManagementApiPath.issueInvitation, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: operatorSessionId,
      },
      body: JSON.stringify({
        tenant,
        recipientEmail: secondRecipientEmail,
        relation: authorizationRelation.admin,
        issueReason: 'Backend e2e redeemed invitation',
      }),
    }),
  );
  const secondIssueInvitationBody = await secondIssueInvitationResponse.json();
  const unauthenticatedRedeemResponse = await runStep(
    'tenant management redeem invitation without session',
    fetch(new URL(tenantInvitationRedemptionApiPath.redeem, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invitationToken: secondIssueInvitationBody.handoff.invitationToken,
      }),
    }),
  );
  const redeemInvitationResponse = await runStep(
    'tenant management redeem invitation',
    fetch(new URL(tenantInvitationRedemptionApiPath.redeem, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: memberSessionId,
      },
      body: JSON.stringify({
        invitationToken: secondIssueInvitationBody.handoff.invitationToken,
      }),
    }),
  );
  const queryMembershipsResponse = await runStep(
    'tenant management query memberships after redemption',
    fetch(new URL(adminTenantManagementApiPath.queryMemberships, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: operatorSessionId,
      },
      body: JSON.stringify({
        tenant,
        inspectionReason: 'Backend e2e inspect memberships after redemption',
      }),
    }),
  );
  const finalListInvitationsResponse = await runStep(
    'tenant management list invitations after revoke and redeem',
    fetch(new URL(adminTenantManagementApiPath.queryInvitations, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: operatorSessionId,
      },
      body: JSON.stringify({
        tenant,
      }),
    }),
  );

  console.log(JSON.stringify({
    unauthenticatedIssueStatus: unauthenticatedIssueResponse.status,
    unauthenticatedIssueBody: await unauthenticatedIssueResponse.json(),
    issueInvitationStatus: issueInvitationResponse.status,
    issueInvitationBody,
    listInvitationsStatus: listInvitationsResponse.status,
    listInvitationsBody: await listInvitationsResponse.json(),
    revokeInvitationStatus: revokeInvitationResponse.status,
    revokeInvitationBody: await revokeInvitationResponse.json(),
    secondIssueInvitationStatus: secondIssueInvitationResponse.status,
    secondIssueInvitationBody,
    unauthenticatedRedeemStatus: unauthenticatedRedeemResponse.status,
    unauthenticatedRedeemBody: await unauthenticatedRedeemResponse.json(),
    memberActorId,
    redeemInvitationStatus: redeemInvitationResponse.status,
    redeemInvitationBody: await redeemInvitationResponse.json(),
    queryMembershipsStatus: queryMembershipsResponse.status,
    queryMembershipsBody: await queryMembershipsResponse.json(),
    finalListInvitationsStatus: finalListInvitationsResponse.status,
    finalListInvitationsBody: await finalListInvitationsResponse.json(),
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

  it("round-trips tenant invitations and membership inspection through the real backend-owned HTTP routes", () => {
    const probe = runTenantManagementProbe();

    expect(probe.unauthenticatedIssueStatus).toBe(401);
    expect(probe.unauthenticatedIssueBody).toEqual({
      error:
        "Admin tenant management requests require a valid authenticated session.",
    });

    expect(probe.issueInvitationStatus).toBe(200);
    expect(probe.issueInvitationBody).toEqual(
      expect.objectContaining({
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_smoke",
          organizationId: "org_smoke",
        },
        invitation: expect.objectContaining({
          invitationId: expect.any(String),
          recipientEmail: expect.stringContaining("backend-e2e-revoked-"),
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.pending,
        }),
        handoff: expect.objectContaining({
          invitationToken: expect.any(String),
          expiresAt: expect.any(String),
        }),
        delivery: expect.objectContaining({
          status: expect.any(String),
          template: expect.any(String),
        }),
      }),
    );

    expect(probe.listInvitationsStatus).toBe(200);
    expect(probe.listInvitationsBody.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: "org_smoke",
      organizationId: "org_smoke",
    });
    expect(probe.listInvitationsBody.invitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invitationId: probe.issueInvitationBody.invitation.invitationId,
          recipientEmail: probe.issueInvitationBody.invitation.recipientEmail,
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.pending,
        }),
      ]),
    );

    expect(probe.revokeInvitationStatus).toBe(200);
    expect(probe.revokeInvitationBody).toEqual(
      expect.objectContaining({
        invitationId: probe.issueInvitationBody.invitation.invitationId,
        changed: true,
        invitation: expect.objectContaining({
          invitationId: probe.issueInvitationBody.invitation.invitationId,
          recipientEmail: probe.issueInvitationBody.invitation.recipientEmail,
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.revoked,
          revokedBy: "usr_backend_e2e_platform_tenant_operator",
        }),
      }),
    );

    expect(probe.secondIssueInvitationStatus).toBe(200);
    expect(probe.secondIssueInvitationBody).toEqual(
      expect.objectContaining({
        invitation: expect.objectContaining({
          invitationId: expect.any(String),
          recipientEmail: expect.stringContaining("backend-e2e-redeemed-"),
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.pending,
        }),
        handoff: expect.objectContaining({
          invitationToken: expect.any(String),
        }),
      }),
    );

    expect(probe.unauthenticatedRedeemStatus).toBe(401);
    expect(probe.unauthenticatedRedeemBody).toEqual({
      error:
        "Tenant invitation redemption requires a valid authenticated session.",
    });

    expect(probe.redeemInvitationStatus).toBe(200);
    expect(probe.redeemInvitationBody).toEqual(
      expect.objectContaining({
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_smoke",
          organizationId: "org_smoke",
        },
        invitationId: probe.secondIssueInvitationBody.invitation.invitationId,
        relation: authorizationRelation.admin,
        membershipChanged: true,
        membership: {
          subject: probe.memberActorId,
          relations: expect.arrayContaining([authorizationRelation.admin]),
        },
        branding: expect.objectContaining({
          companyName: expect.any(String),
          themeTokens: expect.objectContaining({
            primary: expect.any(String),
            secondary: expect.any(String),
            accent: expect.any(String),
          }),
          effectiveScope: expect.any(String),
          entitled: expect.any(Boolean),
        }),
      }),
    );

    expect(probe.queryMembershipsStatus).toBe(200);
    expect(probe.queryMembershipsBody.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: "org_smoke",
      organizationId: "org_smoke",
    });
    expect(probe.queryMembershipsBody.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: probe.memberActorId,
          relations: expect.arrayContaining([authorizationRelation.admin]),
        }),
      ]),
    );

    expect(probe.finalListInvitationsStatus).toBe(200);
    expect(probe.finalListInvitationsBody.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: "org_smoke",
      organizationId: "org_smoke",
    });
    expect(probe.finalListInvitationsBody.invitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invitationId: probe.issueInvitationBody.invitation.invitationId,
          recipientEmail: probe.issueInvitationBody.invitation.recipientEmail,
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.revoked,
          revokedBy: "usr_backend_e2e_platform_tenant_operator",
        }),
        expect.objectContaining({
          invitationId: probe.secondIssueInvitationBody.invitation.invitationId,
          recipientEmail:
            probe.secondIssueInvitationBody.invitation.recipientEmail,
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.redeemed,
          redeemedBy: probe.memberActorId,
        }),
      ]),
    );
  }, 60_000);
});
