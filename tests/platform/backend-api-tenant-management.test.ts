import { spawnSync } from "child_process";

const runBackendApiTenantManagementProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { subscriberJourneySessionHeaderName } from '@comvestec/platform';
import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import {
  adminTenantManagementApiBasePath,
  adminTenantManagementApiPath,
} from './packages/platform/src/services/domains/admin-tenant-management-http.ts';
import {
  tenantInvitationRedemptionApiBasePath,
  tenantInvitationRedemptionApiPath,
} from './packages/platform/src/services/domains/tenant-invitation-redemption-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const tenantManagementHandler = () => Response.json({ route: 'tenant-management' });
const tenantInvitationRedemptionHandler = () => Response.json({ route: 'tenant-invitation-redemption' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminTenantManagementHandler: tenantManagementHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  tenantInvitationRedemptionHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingTenantManagementApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const routeResponse = await app.request(
  new Request('http://localhost' + adminTenantManagementApiBasePath + '/onboarding/review', {
    method: 'POST',
  }),
);
const membershipsRouteResponse = await app.request(
  new Request('http://localhost' + adminTenantManagementApiBasePath + '/memberships/query', {
    method: 'POST',
  }),
);
 const invitationsRouteResponse = await app.request(
   new Request('http://localhost' + adminTenantManagementApiBasePath + '/invitations/query', {
     method: 'POST',
   }),
 );
 const issueInvitationRouteResponse = await app.request(
   new Request('http://localhost' + adminTenantManagementApiBasePath + '/invitations/issue', {
     method: 'POST',
   }),
 );
 const revokeInvitationRouteResponse = await app.request(
   new Request('http://localhost' + adminTenantManagementApiBasePath + '/invitations/revoke', {
     method: 'POST',
   }),
 );
 const redeemInvitationRouteResponse = await app.request(
   new Request('http://localhost' + tenantInvitationRedemptionApiBasePath + '/redeem', {
     method: 'POST',
   }),
 );
const mutationRouteResponse = await app.request(
  new Request('http://localhost' + adminTenantManagementApiBasePath + '/memberships/mutate', {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingTenantManagementApp.request(
  new Request('http://localhost' + adminTenantManagementApiBasePath + '/onboarding/review', {
    method: 'POST',
  }),
);
console.log(JSON.stringify({
  mutationRequestRef: document.paths[adminTenantManagementApiPath.mutateMembership]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  mutationResponseRef: document.paths[adminTenantManagementApiPath.mutateMembership]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  mutationForbiddenDescription: document.paths[adminTenantManagementApiPath.mutateMembership]?.post?.responses?.['403']?.description,
  membershipRequestRef: document.paths[adminTenantManagementApiPath.queryMemberships]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  membershipResponseRef: document.paths[adminTenantManagementApiPath.queryMemberships]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  membershipForbiddenDescription: document.paths[adminTenantManagementApiPath.queryMemberships]?.post?.responses?.['403']?.description,
  invitationIssueRequestRef: document.paths[adminTenantManagementApiPath.issueInvitation]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  invitationIssueResponseRef: document.paths[adminTenantManagementApiPath.issueInvitation]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  invitationIssueForbiddenDescription: document.paths[adminTenantManagementApiPath.issueInvitation]?.post?.responses?.['403']?.description,
  invitationQueryRequestRef: document.paths[adminTenantManagementApiPath.queryInvitations]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  invitationQueryResponseRef: document.paths[adminTenantManagementApiPath.queryInvitations]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  invitationQueryForbiddenDescription: document.paths[adminTenantManagementApiPath.queryInvitations]?.post?.responses?.['403']?.description,
  invitationRevokeRequestRef: document.paths[adminTenantManagementApiPath.revokeInvitation]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  invitationRevokeResponseRef: document.paths[adminTenantManagementApiPath.revokeInvitation]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  invitationRevokeForbiddenDescription: document.paths[adminTenantManagementApiPath.revokeInvitation]?.post?.responses?.['403']?.description,
  invitationRedeemRequestRef: document.paths[tenantInvitationRedemptionApiPath.redeem]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  invitationRedeemResponseRef: document.paths[tenantInvitationRedemptionApiPath.redeem]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  invitationRedeemHasBrandingProperty: Boolean(document.components.schemas.RedeemTenantInvitationResponse?.properties?.branding),
  invitationRedeemUnauthorizedDescription: document.paths[tenantInvitationRedemptionApiPath.redeem]?.post?.responses?.['401']?.description,
  requestRef: document.paths[adminTenantManagementApiPath.reviewOnboarding]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  responseRef: document.paths[adminTenantManagementApiPath.reviewOnboarding]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  unauthorizedDescription: document.paths[adminTenantManagementApiPath.reviewOnboarding]?.post?.responses?.['401']?.description,
  forbiddenDescription: document.paths[adminTenantManagementApiPath.reviewOnboarding]?.post?.responses?.['403']?.description,
  parameterNames: (document.paths[adminTenantManagementApiPath.reviewOnboarding]?.post?.parameters ?? []).map((parameter) => parameter.name),
  hasMutationResponseSchema: Boolean(document.components.schemas.AdminTenantMembershipMutationResponse),
  hasInvitationIssueResponseSchema: Boolean(document.components.schemas.AdminTenantInvitationIssueResponse),
  hasInvitationRedeemResponseSchema: Boolean(document.components.schemas.RedeemTenantInvitationResponse),
  hasInvitationQueryResponseSchema: Boolean(document.components.schemas.AdminTenantInvitationQueryResponse),
  hasInvitationRevokeResponseSchema: Boolean(document.components.schemas.AdminTenantInvitationRevokeResponse),
  hasMembershipResponseSchema: Boolean(document.components.schemas.AdminTenantMembershipQueryResponse),
  hasResponseSchema: Boolean(document.components.schemas.AdminTenantOnboardingReviewResponse),
  routeStatus: routeResponse.status,
  routeBody: await routeResponse.json(),
  invitationsRouteStatus: invitationsRouteResponse.status,
  invitationsRouteBody: await invitationsRouteResponse.json(),
  issueInvitationRouteStatus: issueInvitationRouteResponse.status,
  issueInvitationRouteBody: await issueInvitationRouteResponse.json(),
  revokeInvitationRouteStatus: revokeInvitationRouteResponse.status,
  revokeInvitationRouteBody: await revokeInvitationRouteResponse.json(),
  redeemInvitationRouteStatus: redeemInvitationRouteResponse.status,
  redeemInvitationRouteBody: await redeemInvitationRouteResponse.json(),
  membershipsRouteStatus: membershipsRouteResponse.status,
  membershipsRouteBody: await membershipsRouteResponse.json(),
  mutationRouteStatus: mutationRouteResponse.status,
  mutationRouteBody: await mutationRouteResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  subscriberJourneySessionHeaderName,
}));`,
    ],
    {
      cwd: process.cwd(),
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly mutationRequestRef?: string;
    readonly mutationResponseRef?: string;
    readonly mutationForbiddenDescription?: string;
    readonly membershipRequestRef?: string;
    readonly membershipResponseRef?: string;
    readonly membershipForbiddenDescription?: string;
    readonly invitationIssueRequestRef?: string;
    readonly invitationIssueResponseRef?: string;
    readonly invitationIssueForbiddenDescription?: string;
    readonly invitationQueryRequestRef?: string;
    readonly invitationQueryResponseRef?: string;
    readonly invitationQueryForbiddenDescription?: string;
    readonly invitationRevokeRequestRef?: string;
    readonly invitationRevokeResponseRef?: string;
    readonly invitationRevokeForbiddenDescription?: string;
    readonly invitationRedeemRequestRef?: string;
    readonly invitationRedeemResponseRef?: string;
    readonly invitationRedeemHasBrandingProperty: boolean;
    readonly invitationRedeemUnauthorizedDescription?: string;
    readonly requestRef?: string;
    readonly responseRef?: string;
    readonly unauthorizedDescription?: string;
    readonly forbiddenDescription?: string;
    readonly parameterNames: readonly string[];
    readonly hasMutationResponseSchema: boolean;
    readonly hasInvitationIssueResponseSchema: boolean;
    readonly hasInvitationRedeemResponseSchema: boolean;
    readonly hasInvitationQueryResponseSchema: boolean;
    readonly hasInvitationRevokeResponseSchema: boolean;
    readonly hasMembershipResponseSchema: boolean;
    readonly hasResponseSchema: boolean;
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly invitationsRouteStatus?: number;
    readonly invitationsRouteBody?: {
      readonly route: string;
    };
    readonly issueInvitationRouteStatus?: number;
    readonly issueInvitationRouteBody?: {
      readonly route: string;
    };
    readonly revokeInvitationRouteStatus?: number;
    readonly revokeInvitationRouteBody?: {
      readonly route: string;
    };
    readonly redeemInvitationRouteStatus?: number;
    readonly redeemInvitationRouteBody?: {
      readonly route: string;
    };
    readonly membershipsRouteStatus: number;
    readonly membershipsRouteBody: {
      readonly route: string;
    };
    readonly mutationRouteStatus: number;
    readonly mutationRouteBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly subscriberJourneySessionHeaderName: string;
  };
};

describe("platform backend api tenant-management transport", () => {
  it("documents and mounts the tenant-management routes", () => {
    const probe = runBackendApiTenantManagementProbe();

    expect(probe.invitationIssueRequestRef).toBe(
      "#/components/schemas/IssueTenantInvitationRequest",
    );
    expect(probe.invitationIssueResponseRef).toBe(
      "#/components/schemas/AdminTenantInvitationIssueResponse",
    );
    expect(probe.invitationIssueForbiddenDescription).toBe(
      "Tenant invitation issuance is not allowed for this session.",
    );
    expect(probe.invitationQueryRequestRef).toBe(
      "#/components/schemas/QueryTenantInvitationsRequest",
    );
    expect(probe.invitationQueryResponseRef).toBe(
      "#/components/schemas/AdminTenantInvitationQueryResponse",
    );
    expect(probe.invitationQueryForbiddenDescription).toBe(
      "Tenant invitation inspection is not allowed for this session.",
    );
    expect(probe.invitationRevokeRequestRef).toBe(
      "#/components/schemas/RevokeTenantInvitationRequest",
    );
    expect(probe.invitationRevokeResponseRef).toBe(
      "#/components/schemas/AdminTenantInvitationRevokeResponse",
    );
    expect(probe.invitationRevokeForbiddenDescription).toBe(
      "Tenant invitation revocation is not allowed for this session.",
    );
    expect(probe.invitationRedeemRequestRef).toBe(
      "#/components/schemas/RedeemTenantInvitationRequest",
    );
    expect(probe.invitationRedeemResponseRef).toBe(
      "#/components/schemas/RedeemTenantInvitationResponse",
    );
    expect(probe.invitationRedeemHasBrandingProperty).toBe(true);
    expect(probe.invitationRedeemUnauthorizedDescription).toBe(
      "Tenant invitation redemption requires a valid authenticated session.",
    );
    expect(probe.mutationRequestRef).toBe(
      "#/components/schemas/MutateTenantMembershipRequest",
    );
    expect(probe.mutationResponseRef).toBe(
      "#/components/schemas/AdminTenantMembershipMutationResponse",
    );
    expect(probe.mutationForbiddenDescription).toBe(
      "Tenant membership mutation is not allowed for this session.",
    );
    expect(probe.membershipRequestRef).toBe(
      "#/components/schemas/QueryTenantMembershipsRequest",
    );
    expect(probe.membershipResponseRef).toBe(
      "#/components/schemas/AdminTenantMembershipQueryResponse",
    );
    expect(probe.membershipForbiddenDescription).toBe(
      "Tenant membership inspection is not allowed for this session.",
    );
    expect(probe.requestRef).toBe(
      "#/components/schemas/ReviewTenantOnboardingRequest",
    );
    expect(probe.responseRef).toBe(
      "#/components/schemas/AdminTenantOnboardingReviewResponse",
    );
    expect(probe.unauthorizedDescription).toBe(
      "Admin tenant management requests require a valid authenticated session.",
    );
    expect(probe.forbiddenDescription).toBe(
      "Tenant onboarding review is not allowed for this session.",
    );
    expect(probe.parameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
    ]);
    expect(probe.hasMutationResponseSchema).toBe(true);
    expect(probe.hasInvitationIssueResponseSchema).toBe(true);
    expect(probe.hasInvitationRedeemResponseSchema).toBe(true);
    expect(probe.hasInvitationQueryResponseSchema).toBe(true);
    expect(probe.hasInvitationRevokeResponseSchema).toBe(true);
    expect(probe.hasMembershipResponseSchema).toBe(true);
    expect(probe.hasResponseSchema).toBe(true);
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "tenant-management" });
    expect(probe.membershipsRouteStatus).toBe(200);
    expect(probe.membershipsRouteBody).toEqual({ route: "tenant-management" });
    expect(probe.mutationRouteStatus).toBe(200);
    expect(probe.mutationRouteBody).toEqual({ route: "tenant-management" });
    expect(probe.invitationsRouteStatus).toBe(200);
    expect(probe.invitationsRouteBody).toEqual({ route: "tenant-management" });
    expect(probe.issueInvitationRouteStatus).toBe(200);
    expect(probe.issueInvitationRouteBody).toEqual({
      route: "tenant-management",
    });
    expect(probe.revokeInvitationRouteStatus).toBe(200);
    expect(probe.revokeInvitationRouteBody).toEqual({
      route: "tenant-management",
    });
    expect(probe.redeemInvitationRouteStatus).toBe(200);
    expect(probe.redeemInvitationRouteBody).toEqual({
      route: "tenant-invitation-redemption",
    });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Admin tenant management route not found.",
    });
  }, 30_000);
});
