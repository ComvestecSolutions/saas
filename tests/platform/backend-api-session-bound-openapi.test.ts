import { spawnSync } from "child_process";

const runSessionBoundOpenApiProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import { subscriberJourneySessionHeaderName } from './packages/platform/src/services/access/request-context-transport.ts';
    import { adminEmailDeliveryApiPath } from './packages/platform/src/services/communication/admin-email-delivery-http.ts';
      import { adminNotificationCenterApiPath } from './packages/platform/src/services/communication/admin-notification-center-http.ts';
import { adminWebhooksApiAccessApiPath } from './packages/platform/src/services/communication/admin-webhooks-api-access-http.ts';
import { importExportApiPath } from './packages/platform/src/services/domains/import-export-http.ts';
import { searchApiPath, searchTenantApiPath } from './packages/platform/src/services/domains/search-http.ts';
import { adminTenantBrandingApiPath } from './packages/platform/src/services/domains/tenant-branding-http.ts';
import { adminRetentionLegalHoldApiPath } from './packages/platform/src/services/governance/admin-retention-legal-hold-http.ts';
import { adminGovernanceApiPath } from './packages/platform/src/services/governance/admin-governance-http.ts';
import { adminSupportOperationsApiPath } from './packages/platform/src/services/governance/support-operations-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');

const getPostParameterNames = (path) =>
  (document.paths[path]?.post?.parameters ?? []).map((parameter) => parameter.name);

const getSchemaPropertyNames = (schemaName) =>
  Object.keys(document.components.schemas[schemaName]?.properties ?? {});

const sessionBoundPostPaths = {
  governanceListRuntimeConfigOverrides: adminGovernanceApiPath.listRuntimeConfigOverrides,
  governanceListFeatureFlags: adminGovernanceApiPath.listFeatureFlags,
  governanceInspectAuthorization: adminGovernanceApiPath.inspectAuthorization,
  governanceWriteAuthorizationTuple: adminGovernanceApiPath.writeAuthorizationTuple,
  governanceSubmitRuntimeConfigOverrideProposal: adminGovernanceApiPath.submitRuntimeConfigOverrideProposal,
  governancePersistRuntimeConfigProposals: adminGovernanceApiPath.persistRuntimeConfigProposals,
  governanceReviewRuntimeConfigProposal: adminGovernanceApiPath.reviewRuntimeConfigProposal,
  governanceListRuntimeConfigProposals: adminGovernanceApiPath.listRuntimeConfigProposals,
  governanceQueryAuditEventsByModule: adminGovernanceApiPath.queryAuditEventsByModule,
  governanceQueryAuditEventsByActor: adminGovernanceApiPath.queryAuditEventsByActor,
  governanceQueryAuditEventsByTenant: adminGovernanceApiPath.queryAuditEventsByTenant,
  governanceQueryAuditEventsByTarget: adminGovernanceApiPath.queryAuditEventsByTarget,
  governanceExportAuditEvents: adminGovernanceApiPath.exportAuditEvents,
  retentionUpsertPolicy: adminRetentionLegalHoldApiPath.upsertPolicy,
  retentionListPolicies: adminRetentionLegalHoldApiPath.listPolicies,
  retentionPlaceLegalHold: adminRetentionLegalHoldApiPath.placeLegalHold,
  retentionListLegalHolds: adminRetentionLegalHoldApiPath.listLegalHolds,
  retentionReleaseLegalHold: adminRetentionLegalHoldApiPath.releaseLegalHold,
  supportStartImpersonation: adminSupportOperationsApiPath.startImpersonation,
  supportGrantBreakGlass: adminSupportOperationsApiPath.grantBreakGlass,
  supportListBreakGlassIncidents: adminSupportOperationsApiPath.listBreakGlassIncidents,
  supportReviewBreakGlassIncident: adminSupportOperationsApiPath.reviewBreakGlassIncident,
  tenantBrandingPublishAssetReference: adminTenantBrandingApiPath.publishAssetReference,
  tenantBrandingRequestCustomDomainVerification: adminTenantBrandingApiPath.requestCustomDomainVerification,
  tenantBrandingTransitionCustomDomainVerification: adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification,
  emailDeliveryInspectTracking: adminEmailDeliveryApiPath.inspectTracking,
  emailDeliveryInspectSuppression: adminEmailDeliveryApiPath.inspectRecipientSuppression,
  notificationCenterInspectEmailReceipt: adminNotificationCenterApiPath.inspectEmailReceipt,
  notificationCenterInspectInAppNotification: adminNotificationCenterApiPath.inspectInAppNotification,
  notificationCenterInspectEmailPreference: adminNotificationCenterApiPath.inspectEmailPreference,
  notificationCenterUpsertEmailPreference: adminNotificationCenterApiPath.upsertEmailPreference,
  importExportRequestManagedFileSummaryExport: importExportApiPath.requestManagedFileSummaryExport,
  importExportGetJob: importExportApiPath.getImportExportJob,
  searchQueryManagedFiles: searchApiPath.queryManagedFiles,
  searchQuerySupportCases: searchApiPath.querySupportCases,
  searchRequestTenantIndexEnsureWorkflowJob: searchApiPath.requestTenantIndexEnsureWorkflowJob,
  searchRequestTenantIndexReindexWorkflowJob: searchApiPath.requestTenantIndexReindexWorkflowJob,
  searchQueryCurrentTenantManagedFiles: searchTenantApiPath.queryManagedFiles,
  webhooksCreateApiKey: adminWebhooksApiAccessApiPath.createApiKey,
  webhooksCreateSubscription: adminWebhooksApiAccessApiPath.createSubscription,
  webhooksListApiKeys: adminWebhooksApiAccessApiPath.listApiKeys,
  webhooksListSubscriptions: adminWebhooksApiAccessApiPath.listSubscriptions,
  webhooksRotateApiKey: adminWebhooksApiAccessApiPath.rotateApiKey,
  webhooksRevokeApiKey: adminWebhooksApiAccessApiPath.revokeApiKey,
};

const sessionBoundRequestSchemas = {
  AdminGovernanceReadBySessionRequest: getSchemaPropertyNames('AdminGovernanceReadBySessionRequest'),
  AdminGovernanceQueryAuditEventsByActorRequest: getSchemaPropertyNames('AdminGovernanceQueryAuditEventsByActorRequest'),
  AdminGovernanceQueryAuditEventsByTenantRequest: getSchemaPropertyNames('AdminGovernanceQueryAuditEventsByTenantRequest'),
  AdminGovernanceQueryAuditEventsByTargetRequest: getSchemaPropertyNames('AdminGovernanceQueryAuditEventsByTargetRequest'),
  AdminGovernanceExportAuditEventsRequest: getSchemaPropertyNames('AdminGovernanceExportAuditEventsRequest'),
  AdminGovernanceInspectAuthorizationRequest: getSchemaPropertyNames('AdminGovernanceInspectAuthorizationRequest'),
  AdminGovernanceWriteAuthorizationTupleRequest: getSchemaPropertyNames('AdminGovernanceWriteAuthorizationTupleRequest'),
  PersistRuntimeConfigProposalsRequest: getSchemaPropertyNames('PersistRuntimeConfigProposalsRequest'),
  SubmitRuntimeConfigOverrideProposalRequest: getSchemaPropertyNames('SubmitRuntimeConfigOverrideProposalRequest'),
  ReviewRuntimeConfigProposalRequest: getSchemaPropertyNames('ReviewRuntimeConfigProposalRequest'),
  UpsertRetentionPolicyBySessionRequest: getSchemaPropertyNames('UpsertRetentionPolicyBySessionRequest'),
  ListRetentionPoliciesBySessionRequest: getSchemaPropertyNames('ListRetentionPoliciesBySessionRequest'),
  PlaceRetentionLegalHoldBySessionRequest: getSchemaPropertyNames('PlaceRetentionLegalHoldBySessionRequest'),
  ReleaseRetentionLegalHoldBySessionRequest: getSchemaPropertyNames('ReleaseRetentionLegalHoldBySessionRequest'),
  ListRetentionLegalHoldsBySessionRequest: getSchemaPropertyNames('ListRetentionLegalHoldsBySessionRequest'),
  SupportOperationsStartImpersonationRequest: getSchemaPropertyNames('SupportOperationsStartImpersonationRequest'),
  SupportOperationsGrantBreakGlassRequest: getSchemaPropertyNames('SupportOperationsGrantBreakGlassRequest'),
  SupportOperationsListBreakGlassIncidentsRequest: getSchemaPropertyNames('SupportOperationsListBreakGlassIncidentsRequest'),
  SupportOperationsReviewBreakGlassIncidentRequest: getSchemaPropertyNames('SupportOperationsReviewBreakGlassIncidentRequest'),
  PublishTenantBrandingAssetHttpRequest: getSchemaPropertyNames('PublishTenantBrandingAssetHttpRequest'),
  RequestCustomDomainVerificationHttpRequest: getSchemaPropertyNames('RequestCustomDomainVerificationHttpRequest'),
  TransitionCustomDomainVerificationHttpRequest: getSchemaPropertyNames('TransitionCustomDomainVerificationHttpRequest'),
  InspectEmailDeliveryTrackingBySessionRequest: getSchemaPropertyNames('InspectEmailDeliveryTrackingBySessionRequest'),
  InspectEmailRecipientSuppressionBySessionRequest: getSchemaPropertyNames('InspectEmailRecipientSuppressionBySessionRequest'),
  InspectNotificationCenterEmailReceiptBySessionRequest: getSchemaPropertyNames('InspectNotificationCenterEmailReceiptBySessionRequest'),
  InspectNotificationCenterInAppNotificationBySessionRequest: getSchemaPropertyNames('InspectNotificationCenterInAppNotificationBySessionRequest'),
  InspectNotificationCenterEmailPreferenceBySessionRequest: getSchemaPropertyNames('InspectNotificationCenterEmailPreferenceBySessionRequest'),
  UpsertNotificationCenterEmailPreferenceBySessionRequest: getSchemaPropertyNames('UpsertNotificationCenterEmailPreferenceBySessionRequest'),
  RequestManagedFileSummaryExportHttpRequest: getSchemaPropertyNames('RequestManagedFileSummaryExportHttpRequest'),
  GetImportExportJobHttpRequest: getSchemaPropertyNames('GetImportExportJobHttpRequest'),
  QuerySearchManagedFilesHttpRequest: getSchemaPropertyNames('QuerySearchManagedFilesHttpRequest'),
  QuerySearchSupportCasesHttpRequest: getSchemaPropertyNames('QuerySearchSupportCasesHttpRequest'),
  RequestSearchTenantIndexEnsureWorkflowJobHttpRequest: getSchemaPropertyNames('RequestSearchTenantIndexEnsureWorkflowJobHttpRequest'),
  RequestSearchTenantIndexReindexWorkflowJobHttpRequest: getSchemaPropertyNames('RequestSearchTenantIndexReindexWorkflowJobHttpRequest'),
  QueryCurrentTenantSearchManagedFilesHttpRequest: getSchemaPropertyNames('QueryCurrentTenantSearchManagedFilesHttpRequest'),
  CreateWebhookApiKeyBySessionRequest: getSchemaPropertyNames('CreateWebhookApiKeyBySessionRequest'),
  CreateWebhookSubscriptionBySessionRequest: getSchemaPropertyNames('CreateWebhookSubscriptionBySessionRequest'),
  ListWebhookApiKeysBySessionRequest: getSchemaPropertyNames('ListWebhookApiKeysBySessionRequest'),
  ListWebhookSubscriptionsBySessionRequest: getSchemaPropertyNames('ListWebhookSubscriptionsBySessionRequest'),
  RotateWebhookApiKeyBySessionRequest: getSchemaPropertyNames('RotateWebhookApiKeyBySessionRequest'),
  RevokeWebhookApiKeyBySessionRequest: getSchemaPropertyNames('RevokeWebhookApiKeyBySessionRequest'),
};

console.log(JSON.stringify({
  subscriberJourneySessionHeaderName,
  parameterNamesByPath: Object.fromEntries(
    Object.entries(sessionBoundPostPaths).map(([key, path]) => [
      key,
      getPostParameterNames(path),
    ]),
  ),
  requestPropertiesBySchema: sessionBoundRequestSchemas,
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
    readonly subscriberJourneySessionHeaderName: string;
    readonly parameterNamesByPath: Readonly<Record<string, readonly string[]>>;
    readonly requestPropertiesBySchema: Readonly<
      Record<string, readonly string[]>
    >;
  };
};

describe("platform backend api session-bound openapi contract", () => {
  it("documents trusted session headers and omits body session identifiers", () => {
    const probe = runSessionBoundOpenApiProbe();

    Object.values(probe.parameterNamesByPath).forEach((parameterNames) => {
      expect(parameterNames).toEqual([
        probe.subscriberJourneySessionHeaderName,
      ]);
    });

    Object.values(probe.requestPropertiesBySchema).forEach((propertyNames) => {
      expect(propertyNames).not.toContain("sessionId");
    });

    expect(
      probe.requestPropertiesBySchema
        .RequestSearchTenantIndexEnsureWorkflowJobHttpRequest,
    ).toEqual(["scope", "scopeId", "settings", "scheduledAt"]);
    expect(
      probe.requestPropertiesBySchema
        .RequestManagedFileSummaryExportHttpRequest,
    ).toEqual(["scope", "scopeId", "format"]);
    expect(
      probe.requestPropertiesBySchema.QuerySearchSupportCasesHttpRequest,
    ).toEqual([
      "scope",
      "scopeId",
      "query",
      "limit",
      "status",
      "priority",
      "sort",
    ]);
    expect(
      probe.requestPropertiesBySchema
        .QueryCurrentTenantSearchManagedFilesHttpRequest,
    ).toEqual(["query", "limit"]);
    expect(
      probe.requestPropertiesBySchema
        .RequestSearchTenantIndexReindexWorkflowJobHttpRequest,
    ).toEqual(["scope", "scopeId", "scheduledAt"]);
  }, 30_000);
});
