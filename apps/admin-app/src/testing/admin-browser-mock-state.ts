import { vi } from "vitest";
import type { AdminBrowserFixtureState } from "./admin-browser-fixtures";

let currentFixtureState: AdminBrowserFixtureState | undefined;

const requireFixtureState = (): AdminBrowserFixtureState => {
  if (currentFixtureState === undefined) {
    throw new Error("Admin browser fixture state has not been registered.");
  }

  return currentFixtureState;
};

export const mockedLoaders = {
  shell: vi.fn((location) => requireFixtureState().loadShell(location)),
  operationsHome: vi.fn(() => requireFixtureState().loadOperationsHome()),
  capabilitySnapshotV2: vi.fn(() =>
    requireFixtureState().loadCapabilitySnapshotV2(),
  ),
  tenantsDirectory: vi.fn(() => requireFixtureState().loadTenantsDirectory()),
  repair: vi.fn((input) => requireFixtureState().loadRepair(input)),
  support: vi.fn(() => requireFixtureState().loadSupport()),
  supportCases: vi.fn((input) => requireFixtureState().loadSupportCases(input)),
  incidentDetail: vi.fn((input) =>
    requireFixtureState().loadIncidentDetail(input),
  ),
  retentionList: vi.fn((input) =>
    requireFixtureState().loadRetentionList(input),
  ),
  legalHoldDetail: vi.fn((input) =>
    requireFixtureState().loadLegalHoldDetail(input),
  ),
  webhookList: vi.fn((input) => requireFixtureState().loadWebhookList(input)),
  deliveryDetail: vi.fn((input) =>
    requireFixtureState().loadDeliveryDetail(input),
  ),
  apiKeyDetail: vi.fn((input) => requireFixtureState().loadApiKeyDetail(input)),
  vendorList: vi.fn(() => requireFixtureState().loadVendorList()),
  vendorDetail: vi.fn((input) => requireFixtureState().loadVendorDetail(input)),
  notifyList: vi.fn((input) => requireFixtureState().loadNotifyList(input)),
  notifyDetail: vi.fn((input) => requireFixtureState().loadNotifyDetail(input)),
  adminProfile: vi.fn(() => requireFixtureState().loadAdminProfile({})),
  adminMembers: vi.fn((input) => requireFixtureState().loadAdminMembers(input)),
  adminMemberDetail: vi.fn((input) =>
    requireFixtureState().loadAdminMemberDetail(input),
  ),
  adminTokens: vi.fn((input) => requireFixtureState().loadAdminTokens(input)),
  adminWorkspaces: vi.fn(() => requireFixtureState().loadAdminWorkspaces({})),
  adminAudit: vi.fn(() => requireFixtureState().loadAdminAudit({})),
  workflowRunsList: vi.fn((input) =>
    requireFixtureState().loadWorkflowRunsList(input),
  ),
  workflowRunDetail: vi.fn((input) =>
    requireFixtureState().loadWorkflowRunDetail(input),
  ),
  billing: vi.fn(() => requireFixtureState().loadBilling()),
  billingList: vi.fn((input) => requireFixtureState().loadBillingList(input)),
  invoiceDetail: vi.fn((input) =>
    requireFixtureState().loadInvoiceDetail(input),
  ),
  meterDetail: vi.fn((input) => requireFixtureState().loadMeterDetail(input)),
  keycloakUserDetail: vi.fn((input) =>
    requireFixtureState().loadKeycloakUserDetail(input),
  ),
  keycloakRoleDetail: vi.fn((input) =>
    requireFixtureState().loadKeycloakRoleDetail(input),
  ),
  brandingList: vi.fn((input) => requireFixtureState().loadBrandingList(input)),
  domainDetail: vi.fn((input) => requireFixtureState().loadDomainDetail(input)),
  runtimeConfig: vi.fn(() => requireFixtureState().loadRuntimeConfig()),
  featureFlags: vi.fn(() => requireFixtureState().loadFeatureFlags()),
  accessControl: vi.fn((input) =>
    requireFixtureState().loadAccessControl(input),
  ),
  auditLog: vi.fn((moduleId) => requireFixtureState().loadAuditLog(moduleId)),
  auditLogV2: vi.fn((rawSearch) =>
    requireFixtureState().loadAuditLogV2(rawSearch),
  ),
  governanceConfigV2: vi.fn((input) =>
    requireFixtureState().loadGovernanceConfigV2(input),
  ),
  governanceFlagV2: vi.fn((input) =>
    requireFixtureState().loadGovernanceFlagV2(input),
  ),
  governanceAccessV2: vi.fn((input) =>
    requireFixtureState().loadGovernanceAccessV2(input),
  ),
  tenantWorkspaceIndex: vi.fn(() =>
    requireFixtureState().loadTenantWorkspaceIndex(),
  ),
  tenantWorkspaceV2: vi.fn((input) =>
    requireFixtureState().loadTenantWorkspaceV2(input),
  ),
  branding: vi.fn((scope, scopeId) =>
    requireFixtureState().loadBranding(scope, scopeId),
  ),
  compliance: vi.fn((scope, scopeId) =>
    requireFixtureState().loadCompliance(scope, scopeId),
  ),
  webhooks: vi.fn((scope, scopeId) =>
    requireFixtureState().loadWebhooks(scope, scopeId),
  ),
  universalSearch: vi.fn((input) =>
    requireFixtureState().loadUniversalSearch(input),
  ),
  replayWorkflowRun: vi.fn((input) =>
    requireFixtureState().replayWorkflowRun(input),
  ),
  cancelWorkflowRun: vi.fn((input) =>
    requireFixtureState().cancelWorkflowRun(input),
  ),
  resendNotification: vi.fn((input) =>
    requireFixtureState().resendNotification(input),
  ),
  releaseBreakGlassGrant: vi.fn((input) =>
    requireFixtureState().releaseBreakGlassGrant(input),
  ),
  releaseRunAsGrant: vi.fn((input) =>
    requireFixtureState().releaseRunAsGrant(input),
  ),
  releaseLegalHold: vi.fn((input) =>
    requireFixtureState().releaseLegalHold(input),
  ),
  retryWebhookDelivery: vi.fn((input) =>
    requireFixtureState().retryWebhookDelivery(input),
  ),
  rotateWebhookApiKey: vi.fn((input) =>
    requireFixtureState().rotateWebhookApiKey(input),
  ),
  revokeWebhookApiKey: vi.fn((input) =>
    requireFixtureState().revokeWebhookApiKey(input),
  ),
  verifyCustomDomain: vi.fn((input) =>
    requireFixtureState().verifyCustomDomain(input),
  ),
  inviteAdminMember: vi.fn((input) =>
    requireFixtureState().inviteAdminMember(input),
  ),
  removeAdminMember: vi.fn((input) =>
    requireFixtureState().removeAdminMember(input),
  ),
  createAdminWorkspace: vi.fn((input) =>
    requireFixtureState().createAdminWorkspace(input),
  ),
  deleteAdminWorkspace: vi.fn((input) =>
    requireFixtureState().deleteAdminWorkspace(input),
  ),
  issueAdminOperatorTestToken: vi.fn((input) =>
    requireFixtureState().issueAdminOperatorTestToken(input),
  ),
  revokeAdminOperatorTestToken: vi.fn((input) =>
    requireFixtureState().revokeAdminOperatorTestToken(input),
  ),
  replayRepairGap: vi.fn((input) =>
    requireFixtureState().replayRepairGap(input),
  ),
  cancelRepairGap: vi.fn((input) =>
    requireFixtureState().cancelRepairGap(input),
  ),
  deleteAccessTuple: vi.fn((input) =>
    requireFixtureState().deleteAccessTuple(input),
  ),
  provisionAccessOperator: vi.fn((input) =>
    requireFixtureState().provisionAccessOperator(input),
  ),
  mutateTenantMembership: vi.fn((input) =>
    requireFixtureState().mutateTenantMembership(input),
  ),
  issueTenantInvitation: vi.fn((input) =>
    requireFixtureState().issueTenantInvitation(input),
  ),
  revokeTenantInvitation: vi.fn((input) =>
    requireFixtureState().revokeTenantInvitation(input),
  ),
  submitRuntimeConfigProposal: vi.fn((input) =>
    requireFixtureState().submitRuntimeConfigProposal(input),
  ),
  reviewRuntimeConfigProposal: vi.fn((input) =>
    requireFixtureState().reviewRuntimeConfigProposal(input),
  ),
  submitFeatureFlagProposal: vi.fn((input) =>
    requireFixtureState().submitFeatureFlagProposal(input),
  ),
  reviewFeatureFlagProposal: vi.fn((input) =>
    requireFixtureState().reviewFeatureFlagProposal(input),
  ),
  revokeAuthorizationTuple: vi.fn((input) =>
    requireFixtureState().revokeAuthorizationTuple(input),
  ),
};

export const registerAdminBrowserFixtureState = (
  fixtureState: AdminBrowserFixtureState,
): void => {
  if (
    currentFixtureState !== undefined &&
    currentFixtureState !== fixtureState
  ) {
    throw new Error(
      "Concurrent admin browser harness renders are not supported.",
    );
  }

  currentFixtureState = fixtureState;
};

export const clearAdminBrowserFixtureState = (
  fixtureState: AdminBrowserFixtureState,
): void => {
  if (currentFixtureState === fixtureState) {
    currentFixtureState = undefined;
  }
};
