import { spawnSync } from "child_process";

// Stable path constant – must match backendApiOpenApiPath in openapi-document.ts.
const backendApiOpenApiPath = "/api/openapi.json";

const runOpenApiRuntimeProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { backendApiDocsAssetPath, backendApiDocsPath, backendApiOpenApiPath, handleBackendApiDocumentationRequest } from './packages/platform/src/http/openapi.ts';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';

const document = createBackendApiOpenApiDocument('http://localhost');

const openApiResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiOpenApiPath));
const openApiDocument = await openApiResponse.json();
const docsResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiDocsPath));
const docsHtml = await docsResponse.text();
const cssResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiDocsAssetPath.swaggerUiCss));
const cssText = await cssResponse.text();
const methodResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiDocsPath, { method: 'POST' }));
console.log(JSON.stringify({
  backendApiDocsPath,
  backendApiDocsAssetPath,
  documentOpenApi: document.openapi,
  documentTitle: document.info.title,
  documentServers: document.servers,
  documentHasPlansPath: Boolean(document.paths['/api/subscriber-journey/billing/plans']),
  documentHasAdminBillingPath: Boolean(document.paths['/api/admin/billing/plans']),
  documentHasAdminBillingInspectionPath: Boolean(document.paths['/api/admin/billing/inspections']),
  documentHasAdminBillingRepairGapsPath: Boolean(document.paths['/api/admin/billing/repair-gaps']),
  documentAdminBillingCreateParameterNames: (document.paths['/api/admin/billing/plans']?.post?.parameters ?? []).map((parameter) => parameter.name),
  documentAdminBillingCreate401Description: document.paths['/api/admin/billing/plans']?.post?.responses?.['401']?.description,
  documentAdminBillingInspectionParameterNames: (document.paths['/api/admin/billing/inspections']?.post?.parameters ?? []).map((parameter) => parameter.name),
  documentAdminBillingInspection401Description: document.paths['/api/admin/billing/inspections']?.post?.responses?.['401']?.description,
  documentAdminBillingInspection403Description: document.paths['/api/admin/billing/inspections']?.post?.responses?.['403']?.description,
  documentAdminBillingInspectionRequestRef: document.paths['/api/admin/billing/inspections']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminBillingInspectionResponseRef: document.paths['/api/admin/billing/inspections']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentAdminBillingListParameterNames: (document.paths['/api/admin/billing/repair-gaps']?.get?.parameters ?? []).map((parameter) => parameter.name),
  documentAdminBillingList401Description: document.paths['/api/admin/billing/repair-gaps']?.get?.responses?.['401']?.description,
  documentHasAdminBillingRepairGaps405Response: Boolean(document.paths['/api/admin/billing/repair-gaps']?.get?.responses?.['405']),
  documentAdminBillingRepairGapsDescription: document.paths['/api/admin/billing/repair-gaps']?.get?.description,
  documentHasAdminBillingRepairCancelPath: Boolean(document.paths['/api/admin/billing/repair-gaps/cancellations']),
  documentAdminBillingRepairCancel401Description: document.paths['/api/admin/billing/repair-gaps/cancellations']?.post?.responses?.['401']?.description,
  documentAdminBillingRepairCancel403Description: document.paths['/api/admin/billing/repair-gaps/cancellations']?.post?.responses?.['403']?.description,
  documentHasAdminBillingRepairCancel409Response: Boolean(document.paths['/api/admin/billing/repair-gaps/cancellations']?.post?.responses?.['409']),
  documentHasAdminBillingRepairReplayPath: Boolean(document.paths['/api/admin/billing/repair-gaps/replays']),
  documentAdminBillingRepairReplay401Description: document.paths['/api/admin/billing/repair-gaps/replays']?.post?.responses?.['401']?.description,
  documentAdminBillingRepairReplay403Description: document.paths['/api/admin/billing/repair-gaps/replays']?.post?.responses?.['403']?.description,
  documentHasAdminBillingRepairReplay409Response: Boolean(document.paths['/api/admin/billing/repair-gaps/replays']?.post?.responses?.['409']),
  documentHasAdminRetentionPolicyPath: Boolean(document.paths['/api/admin/governance/retention/policies']),
  documentHasAdminRetentionPolicyListPath: Boolean(document.paths['/api/admin/governance/retention/policies/list']),
  documentHasAdminRetentionHoldPath: Boolean(document.paths['/api/admin/governance/retention/holds']),
  documentHasAdminRetentionHoldListPath: Boolean(document.paths['/api/admin/governance/retention/holds/list']),
  documentHasAdminRetentionHoldReleasePath: Boolean(document.paths['/api/admin/governance/retention/holds/releases']),
  documentAdminRetentionPolicy401Description: document.paths['/api/admin/governance/retention/policies']?.post?.responses?.['401']?.description,
  documentAdminRetentionPolicy403Description: document.paths['/api/admin/governance/retention/policies']?.post?.responses?.['403']?.description,
  documentAdminRetentionPolicyRequestRef: document.paths['/api/admin/governance/retention/policies']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminRetentionPolicyResponseRef: document.paths['/api/admin/governance/retention/policies']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentAdminRetentionHold409Description: document.paths['/api/admin/governance/retention/holds']?.post?.responses?.['409']?.description,
  documentAdminRetentionHoldRequestRef: document.paths['/api/admin/governance/retention/holds']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminRetentionHoldResponseRef: document.paths['/api/admin/governance/retention/holds']?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref,
  documentAdminRetentionHoldListRequestRef: document.paths['/api/admin/governance/retention/holds/list']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminRetentionHoldListResponseRef: document.paths['/api/admin/governance/retention/holds/list']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentAdminRetentionHoldRelease409Description: document.paths['/api/admin/governance/retention/holds/releases']?.post?.responses?.['409']?.description,
  documentAdminRetentionHoldReleaseRequestRef: document.paths['/api/admin/governance/retention/holds/releases']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminRetentionHoldReleaseResponseRef: document.paths['/api/admin/governance/retention/holds/releases']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentHasAdminEmailDeliveryTrackingPath: Boolean(document.paths['/api/admin/communication/email-delivery/tracking']),
  documentHasAdminEmailDeliverySuppressionPath: Boolean(document.paths['/api/admin/communication/email-delivery/suppressions/lookup']),
  documentAdminEmailDeliveryTracking401Description: document.paths['/api/admin/communication/email-delivery/tracking']?.post?.responses?.['401']?.description,
  documentAdminEmailDeliveryTracking403Description: document.paths['/api/admin/communication/email-delivery/tracking']?.post?.responses?.['403']?.description,
  documentAdminEmailDeliveryTrackingRequestRef: document.paths['/api/admin/communication/email-delivery/tracking']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminEmailDeliveryTrackingResponseRef: document.paths['/api/admin/communication/email-delivery/tracking']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentAdminEmailDeliverySuppression401Description: document.paths['/api/admin/communication/email-delivery/suppressions/lookup']?.post?.responses?.['401']?.description,
  documentAdminEmailDeliverySuppression403Description: document.paths['/api/admin/communication/email-delivery/suppressions/lookup']?.post?.responses?.['403']?.description,
  documentAdminEmailDeliverySuppressionRequestRef: document.paths['/api/admin/communication/email-delivery/suppressions/lookup']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminEmailDeliverySuppressionResponseRef: document.paths['/api/admin/communication/email-delivery/suppressions/lookup']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentHasAdminWebhookCreatePath: Boolean(document.paths['/api/admin/communication/webhooks/subscriptions']),
  documentHasAdminWebhookListPath: Boolean(document.paths['/api/admin/communication/webhooks/subscriptions/list']),
  documentHasAdminWebhookRequestDeliveryPath: Boolean(document.paths['/api/admin/communication/webhooks/deliveries/request']),
  documentHasAdminWebhookApiKeyCreatePath: Boolean(document.paths['/api/admin/communication/webhooks/api-keys']),
  documentHasAdminWebhookApiKeyListPath: Boolean(document.paths['/api/admin/communication/webhooks/api-keys/list']),
  documentHasAdminWebhookApiKeyRotatePath: Boolean(document.paths['/api/admin/communication/webhooks/api-keys/rotate']),
  documentHasAdminWebhookApiKeyRevokePath: Boolean(document.paths['/api/admin/communication/webhooks/api-keys/revoke']),
  documentAdminWebhookCreate401Description: document.paths['/api/admin/communication/webhooks/subscriptions']?.post?.responses?.['401']?.description,
  documentAdminWebhookCreate403Description: document.paths['/api/admin/communication/webhooks/subscriptions']?.post?.responses?.['403']?.description,
  documentAdminWebhookCreate409Description: document.paths['/api/admin/communication/webhooks/subscriptions']?.post?.responses?.['409']?.description,
  documentAdminWebhookCreateRequestRef: document.paths['/api/admin/communication/webhooks/subscriptions']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookCreateResponseRef: document.paths['/api/admin/communication/webhooks/subscriptions']?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookList401Description: document.paths['/api/admin/communication/webhooks/subscriptions/list']?.post?.responses?.['401']?.description,
  documentAdminWebhookList403Description: document.paths['/api/admin/communication/webhooks/subscriptions/list']?.post?.responses?.['403']?.description,
  documentAdminWebhookListRequestRef: document.paths['/api/admin/communication/webhooks/subscriptions/list']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookListResponseRef: document.paths['/api/admin/communication/webhooks/subscriptions/list']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookRequestDelivery409Description: document.paths['/api/admin/communication/webhooks/deliveries/request']?.post?.responses?.['409']?.description,
  documentAdminWebhookRequestDelivery503Description: document.paths['/api/admin/communication/webhooks/deliveries/request']?.post?.responses?.['503']?.description,
  documentAdminWebhookRequestDeliveryRequestRef: document.paths['/api/admin/communication/webhooks/deliveries/request']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookRequestDeliveryResponseRef: document.paths['/api/admin/communication/webhooks/deliveries/request']?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyCreate401Description: document.paths['/api/admin/communication/webhooks/api-keys']?.post?.responses?.['401']?.description,
  documentAdminWebhookApiKeyCreate403Description: document.paths['/api/admin/communication/webhooks/api-keys']?.post?.responses?.['403']?.description,
  documentAdminWebhookApiKeyCreateRequestRef: document.paths['/api/admin/communication/webhooks/api-keys']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyCreateResponseRef: document.paths['/api/admin/communication/webhooks/api-keys']?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyList401Description: document.paths['/api/admin/communication/webhooks/api-keys/list']?.post?.responses?.['401']?.description,
  documentAdminWebhookApiKeyList403Description: document.paths['/api/admin/communication/webhooks/api-keys/list']?.post?.responses?.['403']?.description,
  documentAdminWebhookApiKeyListRequestRef: document.paths['/api/admin/communication/webhooks/api-keys/list']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyListResponseRef: document.paths['/api/admin/communication/webhooks/api-keys/list']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyRotate401Description: document.paths['/api/admin/communication/webhooks/api-keys/rotate']?.post?.responses?.['401']?.description,
  documentAdminWebhookApiKeyRotate403Description: document.paths['/api/admin/communication/webhooks/api-keys/rotate']?.post?.responses?.['403']?.description,
  documentAdminWebhookApiKeyRotate409Description: document.paths['/api/admin/communication/webhooks/api-keys/rotate']?.post?.responses?.['409']?.description,
  documentAdminWebhookApiKeyRotateRequestRef: document.paths['/api/admin/communication/webhooks/api-keys/rotate']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyRotateResponseRef: document.paths['/api/admin/communication/webhooks/api-keys/rotate']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyRevoke401Description: document.paths['/api/admin/communication/webhooks/api-keys/revoke']?.post?.responses?.['401']?.description,
  documentAdminWebhookApiKeyRevoke403Description: document.paths['/api/admin/communication/webhooks/api-keys/revoke']?.post?.responses?.['403']?.description,
  documentAdminWebhookApiKeyRevoke409Description: document.paths['/api/admin/communication/webhooks/api-keys/revoke']?.post?.responses?.['409']?.description,
  documentAdminWebhookApiKeyRevokeRequestRef: document.paths['/api/admin/communication/webhooks/api-keys/revoke']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  documentAdminWebhookApiKeyRevokeResponseRef: document.paths['/api/admin/communication/webhooks/api-keys/revoke']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  documentSubscriberRequestContextParameterNames: (document.paths['/api/subscriber-journey/identity/request-context']?.post?.parameters ?? []).map((parameter) => parameter.name),
  documentSubscriberRequestContextHasRequestBody: Boolean(document.paths['/api/subscriber-journey/identity/request-context']?.post?.requestBody),
  documentSubscriberRequestContext401Description: document.paths['/api/subscriber-journey/identity/request-context']?.post?.responses?.['401']?.description,
  documentProductBootstrapParameterNames: (document.paths['/api/subscriber-journey/product/bootstrap']?.post?.parameters ?? []).map((parameter) => parameter.name),
  documentProductBootstrapHasRequestBody: Boolean(document.paths['/api/subscriber-journey/product/bootstrap']?.post?.requestBody),
  documentProductBootstrap401Description: document.paths['/api/subscriber-journey/product/bootstrap']?.post?.responses?.['401']?.description,
  documentHasWebhookPath: Boolean(document.paths['/api/subscriber-journey/billing/webhooks/polar']),
  documentHasProductBootstrapResultSchema: Boolean(document.components.schemas.ProductBootstrapResult),
  documentHasPlatformModuleIdSchema: Boolean(document.components.schemas.PlatformModuleId),
  documentHasInspectEmailDeliveryTrackingBySessionRequestSchema: Boolean(document.components.schemas.InspectEmailDeliveryTrackingBySessionRequest),
  documentHasInspectEmailRecipientSuppressionBySessionRequestSchema: Boolean(document.components.schemas.InspectEmailRecipientSuppressionBySessionRequest),
  documentHasEmailDeliveryTrackingAdminViewSchema: Boolean(document.components.schemas.EmailDeliveryTrackingAdminView),
  documentHasEmailRecipientSuppressionAdminViewSchema: Boolean(document.components.schemas.EmailRecipientSuppressionAdminView),
  documentHasCreateWebhookApiKeyBySessionRequestSchema: Boolean(document.components.schemas.CreateWebhookApiKeyBySessionRequest),
  documentHasCreateWebhookSubscriptionBySessionRequestSchema: Boolean(document.components.schemas.CreateWebhookSubscriptionBySessionRequest),
  documentHasRequestWebhookOutboundDeliveryBySessionRequestSchema: Boolean(document.components.schemas.RequestWebhookOutboundDeliveryBySessionRequest),
  documentHasListWebhookApiKeysBySessionRequestSchema: Boolean(document.components.schemas.ListWebhookApiKeysBySessionRequest),
  documentHasRotateWebhookApiKeyBySessionRequestSchema: Boolean(document.components.schemas.RotateWebhookApiKeyBySessionRequest),
  documentHasRevokeWebhookApiKeyBySessionRequestSchema: Boolean(document.components.schemas.RevokeWebhookApiKeyBySessionRequest),
  documentHasWebhookApiKeyAdminViewSchema: Boolean(document.components.schemas.WebhookApiKeyAdminView),
  documentHasWebhookApiKeyAdminViewListSchema: Boolean(document.components.schemas.WebhookApiKeyAdminViewList),
  documentHasWebhookApiKeyOneTimeSecretResultSchema: Boolean(document.components.schemas.WebhookApiKeyOneTimeSecretResult),
  documentHasWebhookSubscriptionAdminViewSchema: Boolean(document.components.schemas.WebhookSubscriptionAdminView),
  documentHasWebhookSubscriptionAdminViewListSchema: Boolean(document.components.schemas.WebhookSubscriptionAdminViewList),
  documentHasRetentionPolicyAdminViewSchema: Boolean(document.components.schemas.RetentionPolicyAdminView),
  documentHasRetentionPolicyAdminViewListSchema: Boolean(document.components.schemas.RetentionPolicyAdminViewList),
  documentHasRetentionLegalHoldComplianceViewSchema: Boolean(document.components.schemas.RetentionLegalHoldComplianceView),
  documentHasRetentionLegalHoldComplianceViewListSchema: Boolean(document.components.schemas.RetentionLegalHoldComplianceViewList),
  documentHasUpsertRetentionPolicyBySessionRequestSchema: Boolean(document.components.schemas.UpsertRetentionPolicyBySessionRequest),
  documentHasPlaceRetentionLegalHoldBySessionRequestSchema: Boolean(document.components.schemas.PlaceRetentionLegalHoldBySessionRequest),
  documentHasReleaseRetentionLegalHoldBySessionRequestSchema: Boolean(document.components.schemas.ReleaseRetentionLegalHoldBySessionRequest),
  documentProductBootstrapResultRequired: document.components.schemas.ProductBootstrapResult?.required ?? [],
  documentProductBootstrapResultProperties: Object.keys(document.components.schemas.ProductBootstrapResult?.properties ?? {}),
  documentProductBootstrapEnabledModuleItemRef: document.components.schemas.ProductBootstrapResult?.properties?.enabledModules?.items?.$ref,
  documentHasRequestContextSchema: Boolean(document.components.schemas.RequestContext),
  documentHasStartAuthSchema: Boolean(document.components.schemas.StartAuthenticationRequest),
  documentHasErrorResponseSchema: Boolean(document.components.schemas.ErrorResponse),
  documentHasAdminBillingExplanationRequestSchema: Boolean(document.components.schemas.AdminBillingExplanationRequest),
  documentHasAdminBillingExplanationResponseSchema: Boolean(document.components.schemas.AdminBillingExplanationResponse),
  documentAdminBillingCreateRequestRequired: document.components.schemas.CreateManagedBillingPlanRequest?.required ?? [],
  documentAdminBillingCreateRequestProperties: Object.keys(document.components.schemas.CreateManagedBillingPlanRequest?.properties ?? {}),
  openApiStatus: openApiResponse.status,
  openApiContentType: openApiResponse.headers.get('Content-Type'),
  hasGovernancePath: Boolean(openApiDocument.paths['/api/admin/governance/runtime-config/overrides/list']),
  hasGovernanceFeatureFlagListPath: Boolean(openApiDocument.paths['/api/admin/governance/feature-flags/list']),
  hasGovernanceAuthorizationInspectPath: Boolean(openApiDocument.paths['/api/admin/governance/authorization/inspect']),
  hasGovernanceAuthorizationTupleWritePath: Boolean(openApiDocument.paths['/api/admin/governance/authorization/tuples/write']),
  hasGovernanceAuditActorReadPath: Boolean(openApiDocument.paths['/api/admin/governance/audit-log/query-by-actor']),
  hasGovernanceAuditTenantReadPath: Boolean(openApiDocument.paths['/api/admin/governance/audit-log/query-by-tenant']),
  hasGovernanceAuditTargetReadPath: Boolean(openApiDocument.paths['/api/admin/governance/audit-log/query-by-target']),
  hasGovernanceAuditExportPath: Boolean(openApiDocument.paths['/api/admin/governance/audit-log/export']),
  governanceFeatureFlagList401Description: openApiDocument.paths['/api/admin/governance/feature-flags/list']?.post?.responses?.['401']?.description,
  governanceFeatureFlagList403Description: openApiDocument.paths['/api/admin/governance/feature-flags/list']?.post?.responses?.['403']?.description,
  governanceFeatureFlagListRequestRef: openApiDocument.paths['/api/admin/governance/feature-flags/list']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  governanceFeatureFlagListResponseRef: openApiDocument.paths['/api/admin/governance/feature-flags/list']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  governanceAuthorizationInspect401Description: openApiDocument.paths['/api/admin/governance/authorization/inspect']?.post?.responses?.['401']?.description,
  governanceAuthorizationInspect403Description: openApiDocument.paths['/api/admin/governance/authorization/inspect']?.post?.responses?.['403']?.description,
  governanceAuthorizationInspect502Description: openApiDocument.paths['/api/admin/governance/authorization/inspect']?.post?.responses?.['502']?.description,
  governanceAuthorizationInspectRequestRef: openApiDocument.paths['/api/admin/governance/authorization/inspect']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  governanceAuthorizationInspectResponseRef: openApiDocument.paths['/api/admin/governance/authorization/inspect']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  governanceAuthorizationTupleWrite401Description: openApiDocument.paths['/api/admin/governance/authorization/tuples/write']?.post?.responses?.['401']?.description,
  governanceAuthorizationTupleWrite403Description: openApiDocument.paths['/api/admin/governance/authorization/tuples/write']?.post?.responses?.['403']?.description,
  governanceAuthorizationTupleWrite502Description: openApiDocument.paths['/api/admin/governance/authorization/tuples/write']?.post?.responses?.['502']?.description,
  governanceAuthorizationTupleWriteRequestRef: openApiDocument.paths['/api/admin/governance/authorization/tuples/write']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  governanceAuthorizationTupleWriteResponseRef: openApiDocument.paths['/api/admin/governance/authorization/tuples/write']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  governanceRead401Description: openApiDocument.paths['/api/admin/governance/runtime-config/overrides/list']?.post?.responses?.['401']?.description,
  governanceRead403Description: openApiDocument.paths['/api/admin/governance/runtime-config/overrides/list']?.post?.responses?.['403']?.description,
  governanceMutation401Description: openApiDocument.paths['/api/admin/governance/runtime-config/override-proposals/submit']?.post?.responses?.['401']?.description,
  governanceMutation403Description: openApiDocument.paths['/api/admin/governance/runtime-config/override-proposals/submit']?.post?.responses?.['403']?.description,
  governanceProposalRead401Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/list']?.post?.responses?.['401']?.description,
  governanceProposalRead403Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/list']?.post?.responses?.['403']?.description,
  governanceProposalPersist401Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/persist']?.post?.responses?.['401']?.description,
  governanceProposalPersist403Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/persist']?.post?.responses?.['403']?.description,
  governanceProposalReview401Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/review']?.post?.responses?.['401']?.description,
  governanceProposalReview403Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/review']?.post?.responses?.['403']?.description,
  governanceProposalReview409Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/review']?.post?.responses?.['409']?.description,
  governanceProposalReview404Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/review']?.post?.responses?.['404']?.description,
  governanceAuditRead401Description: openApiDocument.paths['/api/admin/governance/audit-log/query-by-module']?.post?.responses?.['401']?.description,
  governanceAuditRead403Description: openApiDocument.paths['/api/admin/governance/audit-log/query-by-module']?.post?.responses?.['403']?.description,
  governanceAuditActorReadRequestRef: openApiDocument.paths['/api/admin/governance/audit-log/query-by-actor']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  governanceAuditActorReadResponseRef: openApiDocument.paths['/api/admin/governance/audit-log/query-by-actor']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  governanceAuditTenantReadRequestRef: openApiDocument.paths['/api/admin/governance/audit-log/query-by-tenant']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  governanceAuditTenantReadResponseRef: openApiDocument.paths['/api/admin/governance/audit-log/query-by-tenant']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  governanceAuditTargetRead401Description: openApiDocument.paths['/api/admin/governance/audit-log/query-by-target']?.post?.responses?.['401']?.description,
  governanceAuditTargetRead403Description: openApiDocument.paths['/api/admin/governance/audit-log/query-by-target']?.post?.responses?.['403']?.description,
  governanceAuditTargetReadRequestRef: openApiDocument.paths['/api/admin/governance/audit-log/query-by-target']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  governanceAuditTargetReadResponseRef: openApiDocument.paths['/api/admin/governance/audit-log/query-by-target']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  governanceAuditExport400Description: openApiDocument.paths['/api/admin/governance/audit-log/export']?.post?.responses?.['400']?.description,
  governanceAuditExportRequestRef: openApiDocument.paths['/api/admin/governance/audit-log/export']?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  governanceAuditExportResponseRef: openApiDocument.paths['/api/admin/governance/audit-log/export']?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  governanceAuditExportRecordedBeforeFormat: openApiDocument.components.schemas.AdminGovernanceExportAuditEventsRequest?.properties?.filter?.properties?.recordedBefore?.format,
  governanceMutationRequestRequired: openApiDocument.components.schemas.SubmitRuntimeConfigOverrideProposalRequest?.required ?? [],
  governanceMutationRequestProperties: Object.keys(openApiDocument.components.schemas.SubmitRuntimeConfigOverrideProposalRequest?.properties ?? {}),
  governanceProposalPersistRequestRequired: openApiDocument.components.schemas.PersistRuntimeConfigProposalsRequest?.required ?? [],
  governanceProposalPersistRequestProperties: Object.keys(openApiDocument.components.schemas.PersistRuntimeConfigProposalsRequest?.properties ?? {}),
  governanceProposalReviewRequestRequired: openApiDocument.components.schemas.ReviewRuntimeConfigProposalRequest?.required ?? [],
  governanceProposalReviewRequestProperties: Object.keys(openApiDocument.components.schemas.ReviewRuntimeConfigProposalRequest?.properties ?? {}),
  governanceAuthorizationInspectRequestRequired: openApiDocument.components.schemas.AdminGovernanceInspectAuthorizationRequest?.required ?? [],
  governanceAuthorizationInspectRequestProperties: Object.keys(openApiDocument.components.schemas.AdminGovernanceInspectAuthorizationRequest?.properties ?? {}),
  governanceAuthorizationTupleWriteRequestRequired: openApiDocument.components.schemas.AdminGovernanceWriteAuthorizationTupleRequest?.required ?? [],
  governanceAuthorizationTupleWriteRequestProperties: Object.keys(openApiDocument.components.schemas.AdminGovernanceWriteAuthorizationTupleRequest?.properties ?? {}),
  governanceAuditTargetRequestRequired: openApiDocument.components.schemas.AdminGovernanceQueryAuditEventsByTargetRequest?.required ?? [],
  governanceAuditTargetRequestProperties: Object.keys(openApiDocument.components.schemas.AdminGovernanceQueryAuditEventsByTargetRequest?.properties ?? {}),
  hasGovernanceAuthorizationInspectionViewSchema: Boolean(openApiDocument.components.schemas.AdminGovernanceAuthorizationInspectionView),
  hasGovernanceAuthorizationTupleWriteResponseSchema: Boolean(openApiDocument.components.schemas.AdminGovernanceWriteAuthorizationTupleResponse),
  hasGovernanceAuditTargetRequestSchema: Boolean(openApiDocument.components.schemas.AdminGovernanceQueryAuditEventsByTargetRequest),
  docsStatus: docsResponse.status,
  docsContentType: docsResponse.headers.get('Content-Type'),
  docsHtml,
  cssStatus: cssResponse.status,
  cssContentType: cssResponse.headers.get('Content-Type'),
  cssHasSwaggerUi: cssText.includes('.swagger-ui'),
  methodStatus: methodResponse.status,
  methodAllow: methodResponse.headers.get('Allow'),
  methodBody: await methodResponse.json(),
}));`,
    ],
    {
      cwd: process.cwd(),
      timeout: 90_000,
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly backendApiDocsPath: string;
    readonly backendApiDocsAssetPath: {
      readonly swaggerUiCss: string;
      readonly swaggerUiBundle: string;
    };
    readonly documentOpenApi: string;
    readonly documentTitle: string;
    readonly documentServers: readonly {
      readonly url: string;
      readonly description?: string;
    }[];
    readonly documentHasPlansPath: boolean;
    readonly documentHasAdminBillingPath: boolean;
    readonly documentHasAdminBillingInspectionPath: boolean;
    readonly documentHasAdminBillingRepairGapsPath: boolean;
    readonly documentAdminBillingCreateParameterNames: readonly string[];
    readonly documentAdminBillingCreate401Description?: string;
    readonly documentAdminBillingInspectionParameterNames: readonly string[];
    readonly documentAdminBillingInspection401Description?: string;
    readonly documentAdminBillingInspection403Description?: string;
    readonly documentAdminBillingInspectionRequestRef?: string;
    readonly documentAdminBillingInspectionResponseRef?: string;
    readonly documentAdminBillingListParameterNames: readonly string[];
    readonly documentAdminBillingList401Description?: string;
    readonly documentHasAdminBillingRepairGaps405Response: boolean;
    readonly documentAdminBillingRepairGapsDescription?: string;
    readonly documentHasAdminBillingRepairCancelPath: boolean;
    readonly documentAdminBillingRepairCancel401Description?: string;
    readonly documentAdminBillingRepairCancel403Description?: string;
    readonly documentHasAdminBillingRepairCancel409Response: boolean;
    readonly documentHasAdminBillingRepairReplayPath: boolean;
    readonly documentAdminBillingRepairReplay401Description?: string;
    readonly documentAdminBillingRepairReplay403Description?: string;
    readonly documentHasAdminBillingRepairReplay409Response: boolean;
    readonly documentHasAdminRetentionPolicyPath: boolean;
    readonly documentHasAdminRetentionPolicyListPath: boolean;
    readonly documentHasAdminRetentionHoldPath: boolean;
    readonly documentHasAdminRetentionHoldListPath: boolean;
    readonly documentHasAdminRetentionHoldReleasePath: boolean;
    readonly documentAdminRetentionPolicy401Description?: string;
    readonly documentAdminRetentionPolicy403Description?: string;
    readonly documentAdminRetentionPolicyRequestRef?: string;
    readonly documentAdminRetentionPolicyResponseRef?: string;
    readonly documentAdminRetentionHold409Description?: string;
    readonly documentAdminRetentionHoldRequestRef?: string;
    readonly documentAdminRetentionHoldResponseRef?: string;
    readonly documentAdminRetentionHoldListRequestRef?: string;
    readonly documentAdminRetentionHoldListResponseRef?: string;
    readonly documentAdminRetentionHoldRelease409Description?: string;
    readonly documentAdminRetentionHoldReleaseRequestRef?: string;
    readonly documentAdminRetentionHoldReleaseResponseRef?: string;
    readonly documentHasAdminEmailDeliveryTrackingPath: boolean;
    readonly documentHasAdminEmailDeliverySuppressionPath: boolean;
    readonly documentAdminEmailDeliveryTracking401Description?: string;
    readonly documentAdminEmailDeliveryTracking403Description?: string;
    readonly documentAdminEmailDeliveryTrackingRequestRef?: string;
    readonly documentAdminEmailDeliveryTrackingResponseRef?: string;
    readonly documentAdminEmailDeliverySuppression401Description?: string;
    readonly documentAdminEmailDeliverySuppression403Description?: string;
    readonly documentAdminEmailDeliverySuppressionRequestRef?: string;
    readonly documentAdminEmailDeliverySuppressionResponseRef?: string;
    readonly documentHasAdminWebhookCreatePath: boolean;
    readonly documentHasAdminWebhookListPath: boolean;
    readonly documentHasAdminWebhookRequestDeliveryPath: boolean;
    readonly documentHasAdminWebhookApiKeyCreatePath: boolean;
    readonly documentHasAdminWebhookApiKeyListPath: boolean;
    readonly documentHasAdminWebhookApiKeyRotatePath: boolean;
    readonly documentHasAdminWebhookApiKeyRevokePath: boolean;
    readonly documentAdminWebhookCreate401Description?: string;
    readonly documentAdminWebhookCreate403Description?: string;
    readonly documentAdminWebhookCreate409Description?: string;
    readonly documentAdminWebhookCreateRequestRef?: string;
    readonly documentAdminWebhookCreateResponseRef?: string;
    readonly documentAdminWebhookList401Description?: string;
    readonly documentAdminWebhookList403Description?: string;
    readonly documentAdminWebhookListRequestRef?: string;
    readonly documentAdminWebhookListResponseRef?: string;
    readonly documentAdminWebhookRequestDelivery409Description?: string;
    readonly documentAdminWebhookRequestDelivery503Description?: string;
    readonly documentAdminWebhookRequestDeliveryRequestRef?: string;
    readonly documentAdminWebhookRequestDeliveryResponseRef?: string;
    readonly documentAdminWebhookApiKeyCreate401Description?: string;
    readonly documentAdminWebhookApiKeyCreate403Description?: string;
    readonly documentAdminWebhookApiKeyCreateRequestRef?: string;
    readonly documentAdminWebhookApiKeyCreateResponseRef?: string;
    readonly documentAdminWebhookApiKeyList401Description?: string;
    readonly documentAdminWebhookApiKeyList403Description?: string;
    readonly documentAdminWebhookApiKeyListRequestRef?: string;
    readonly documentAdminWebhookApiKeyListResponseRef?: string;
    readonly documentAdminWebhookApiKeyRotate401Description?: string;
    readonly documentAdminWebhookApiKeyRotate403Description?: string;
    readonly documentAdminWebhookApiKeyRotate409Description?: string;
    readonly documentAdminWebhookApiKeyRotateRequestRef?: string;
    readonly documentAdminWebhookApiKeyRotateResponseRef?: string;
    readonly documentAdminWebhookApiKeyRevoke401Description?: string;
    readonly documentAdminWebhookApiKeyRevoke403Description?: string;
    readonly documentAdminWebhookApiKeyRevoke409Description?: string;
    readonly documentAdminWebhookApiKeyRevokeRequestRef?: string;
    readonly documentAdminWebhookApiKeyRevokeResponseRef?: string;
    readonly documentSubscriberRequestContextParameterNames: readonly string[];
    readonly documentSubscriberRequestContextHasRequestBody: boolean;
    readonly documentSubscriberRequestContext401Description?: string;
    readonly documentProductBootstrapParameterNames: readonly string[];
    readonly documentProductBootstrapHasRequestBody: boolean;
    readonly documentProductBootstrap401Description?: string;
    readonly documentHasWebhookPath: boolean;
    readonly documentHasProductBootstrapResultSchema: boolean;
    readonly documentHasPlatformModuleIdSchema: boolean;
    readonly documentHasInspectEmailDeliveryTrackingBySessionRequestSchema: boolean;
    readonly documentHasInspectEmailRecipientSuppressionBySessionRequestSchema: boolean;
    readonly documentHasEmailDeliveryTrackingAdminViewSchema: boolean;
    readonly documentHasEmailRecipientSuppressionAdminViewSchema: boolean;
    readonly documentHasCreateWebhookApiKeyBySessionRequestSchema: boolean;
    readonly documentHasCreateWebhookSubscriptionBySessionRequestSchema: boolean;
    readonly documentHasRequestWebhookOutboundDeliveryBySessionRequestSchema: boolean;
    readonly documentHasListWebhookApiKeysBySessionRequestSchema: boolean;
    readonly documentHasRotateWebhookApiKeyBySessionRequestSchema: boolean;
    readonly documentHasRevokeWebhookApiKeyBySessionRequestSchema: boolean;
    readonly documentHasWebhookApiKeyAdminViewSchema: boolean;
    readonly documentHasWebhookApiKeyAdminViewListSchema: boolean;
    readonly documentHasWebhookApiKeyOneTimeSecretResultSchema: boolean;
    readonly documentHasWebhookSubscriptionAdminViewSchema: boolean;
    readonly documentHasWebhookSubscriptionAdminViewListSchema: boolean;
    readonly documentHasRetentionPolicyAdminViewSchema: boolean;
    readonly documentHasRetentionPolicyAdminViewListSchema: boolean;
    readonly documentHasRetentionLegalHoldComplianceViewSchema: boolean;
    readonly documentHasRetentionLegalHoldComplianceViewListSchema: boolean;
    readonly documentHasUpsertRetentionPolicyBySessionRequestSchema: boolean;
    readonly documentHasPlaceRetentionLegalHoldBySessionRequestSchema: boolean;
    readonly documentHasReleaseRetentionLegalHoldBySessionRequestSchema: boolean;
    readonly documentProductBootstrapResultRequired: readonly string[];
    readonly documentProductBootstrapResultProperties: readonly string[];
    readonly documentProductBootstrapEnabledModuleItemRef?: string;
    readonly documentHasRequestContextSchema: boolean;
    readonly documentHasStartAuthSchema: boolean;
    readonly documentHasErrorResponseSchema: boolean;
    readonly documentHasAdminBillingExplanationRequestSchema: boolean;
    readonly documentHasAdminBillingExplanationResponseSchema: boolean;
    readonly documentAdminBillingCreateRequestRequired: readonly string[];
    readonly documentAdminBillingCreateRequestProperties: readonly string[];
    readonly openApiStatus: number;
    readonly openApiContentType: string;
    readonly hasGovernancePath: boolean;
    readonly hasGovernanceFeatureFlagListPath: boolean;
    readonly hasGovernanceAuthorizationInspectPath: boolean;
    readonly hasGovernanceAuthorizationTupleWritePath: boolean;
    readonly hasGovernanceAuditActorReadPath: boolean;
    readonly hasGovernanceAuditTenantReadPath: boolean;
    readonly hasGovernanceAuditTargetReadPath: boolean;
    readonly hasGovernanceAuditExportPath: boolean;
    readonly governanceFeatureFlagList401Description?: string;
    readonly governanceFeatureFlagList403Description?: string;
    readonly governanceFeatureFlagListRequestRef?: string;
    readonly governanceFeatureFlagListResponseRef?: string;
    readonly governanceAuthorizationInspect401Description?: string;
    readonly governanceAuthorizationInspect403Description?: string;
    readonly governanceAuthorizationInspect502Description?: string;
    readonly governanceAuthorizationInspectRequestRef?: string;
    readonly governanceAuthorizationInspectResponseRef?: string;
    readonly governanceAuthorizationTupleWrite401Description?: string;
    readonly governanceAuthorizationTupleWrite403Description?: string;
    readonly governanceAuthorizationTupleWrite502Description?: string;
    readonly governanceAuthorizationTupleWriteRequestRef?: string;
    readonly governanceAuthorizationTupleWriteResponseRef?: string;
    readonly governanceRead401Description?: string;
    readonly governanceRead403Description?: string;
    readonly governanceMutation401Description?: string;
    readonly governanceMutation403Description?: string;
    readonly governanceProposalRead401Description?: string;
    readonly governanceProposalRead403Description?: string;
    readonly governanceProposalPersist401Description?: string;
    readonly governanceProposalPersist403Description?: string;
    readonly governanceProposalReview401Description?: string;
    readonly governanceProposalReview403Description?: string;
    readonly governanceProposalReview409Description?: string;
    readonly governanceProposalReview404Description?: string;
    readonly governanceAuditRead401Description?: string;
    readonly governanceAuditRead403Description?: string;
    readonly governanceAuditActorReadRequestRef?: string;
    readonly governanceAuditActorReadResponseRef?: string;
    readonly governanceAuditTenantReadRequestRef?: string;
    readonly governanceAuditTenantReadResponseRef?: string;
    readonly governanceAuditTargetRead401Description?: string;
    readonly governanceAuditTargetRead403Description?: string;
    readonly governanceAuditTargetReadRequestRef?: string;
    readonly governanceAuditTargetReadResponseRef?: string;
    readonly governanceAuditExport400Description?: string;
    readonly governanceAuditExportRequestRef?: string;
    readonly governanceAuditExportResponseRef?: string;
    readonly governanceAuditExportRecordedBeforeFormat?: string;
    readonly governanceMutationRequestRequired: readonly string[];
    readonly governanceMutationRequestProperties: readonly string[];
    readonly governanceProposalPersistRequestRequired: readonly string[];
    readonly governanceProposalPersistRequestProperties: readonly string[];
    readonly governanceProposalReviewRequestRequired: readonly string[];
    readonly governanceProposalReviewRequestProperties: readonly string[];
    readonly governanceAuthorizationInspectRequestRequired: readonly string[];
    readonly governanceAuthorizationInspectRequestProperties: readonly string[];
    readonly governanceAuthorizationTupleWriteRequestRequired: readonly string[];
    readonly governanceAuthorizationTupleWriteRequestProperties: readonly string[];
    readonly governanceAuditTargetRequestRequired: readonly string[];
    readonly governanceAuditTargetRequestProperties: readonly string[];
    readonly hasGovernanceAuthorizationInspectionViewSchema: boolean;
    readonly hasGovernanceAuthorizationTupleWriteResponseSchema: boolean;
    readonly hasGovernanceAuditTargetRequestSchema: boolean;
    readonly docsStatus: number;
    readonly docsContentType: string;
    readonly docsHtml: string;
    readonly cssStatus: number;
    readonly cssContentType: string;
    readonly cssHasSwaggerUi: boolean;
    readonly methodStatus: number;
    readonly methodAllow: string;
    readonly methodBody: {
      readonly error: string;
    };
  };
};

describe("platform backend api", () => {
  it("builds a generated OpenAPI document and serves Swagger UI via the runtime docs handler", () => {
    const probe = runOpenApiRuntimeProbe();

    // Generated document structure
    expect(probe.documentOpenApi).toBe("3.1.0");
    expect(probe.documentTitle).toBe("Comvestec Backend API");
    expect(probe.documentServers).toEqual([
      {
        url: "http://localhost",
        description: "Active backend API origin",
      },
    ]);
    expect(probe.documentHasPlansPath).toBe(true);
    expect(probe.documentHasAdminBillingPath).toBe(true);
    expect(probe.documentHasAdminBillingInspectionPath).toBe(true);
    expect(probe.documentHasAdminBillingRepairGapsPath).toBe(true);
    expect(probe.documentAdminBillingCreateParameterNames).toEqual([
      "x-comvestec-session-id",
    ]);
    expect(probe.documentAdminBillingCreate401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminBillingInspectionParameterNames).toEqual([
      "x-comvestec-session-id",
    ]);
    expect(probe.documentAdminBillingInspection401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminBillingInspection403Description).toBe(
      "Billing state inspection is not allowed for this session.",
    );
    expect(probe.documentAdminBillingInspectionRequestRef).toBe(
      "#/components/schemas/AdminBillingExplanationRequest",
    );
    expect(probe.documentAdminBillingInspectionResponseRef).toBe(
      "#/components/schemas/AdminBillingExplanationResponse",
    );
    expect(probe.documentAdminBillingListParameterNames).toEqual([
      "x-comvestec-session-id",
      "inspectionReason",
    ]);
    expect(probe.documentAdminBillingList401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentHasAdminBillingRepairGaps405Response).toBe(true);
    expect(probe.documentAdminBillingRepairGapsDescription).toBe(
      "Lists unresolved scheduled, blocked, and stale running billing repair gaps for platform operators.",
    );
    expect(probe.documentHasAdminBillingRepairCancelPath).toBe(true);
    expect(probe.documentAdminBillingRepairCancel401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminBillingRepairCancel403Description).toBe(
      "Billing repair gap cancellation is not allowed for this session.",
    );
    expect(probe.documentHasAdminBillingRepairCancel409Response).toBe(true);
    expect(probe.documentHasAdminBillingRepairReplayPath).toBe(true);
    expect(probe.documentAdminBillingRepairReplay401Description).toBe(
      "Authenticated operator session and a Keycloak bearer token accepted for Convex execution are required for repair replay execution.",
    );
    expect(probe.documentAdminBillingRepairReplay403Description).toBe(
      "Billing repair replay requires authorized platform-operator access and a decodable Convex token whose subject matches the operator session.",
    );
    expect(probe.documentHasAdminBillingRepairReplay409Response).toBe(true);
    expect(probe.documentHasAdminRetentionPolicyPath).toBe(true);
    expect(probe.documentHasAdminRetentionPolicyListPath).toBe(true);
    expect(probe.documentHasAdminRetentionHoldPath).toBe(true);
    expect(probe.documentHasAdminRetentionHoldListPath).toBe(true);
    expect(probe.documentHasAdminRetentionHoldReleasePath).toBe(true);
    expect(probe.documentAdminRetentionPolicy401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminRetentionPolicy403Description).toBe(
      "Retention management is not allowed for this session.",
    );
    expect(probe.documentAdminRetentionPolicyRequestRef).toBe(
      "#/components/schemas/UpsertRetentionPolicyBySessionRequest",
    );
    expect(probe.documentAdminRetentionPolicyResponseRef).toBe(
      "#/components/schemas/RetentionPolicyAdminView",
    );
    expect(probe.documentAdminRetentionHold409Description).toBe(
      "Legal hold already exists for this scope, data type, and target.",
    );
    expect(probe.documentAdminRetentionHoldRequestRef).toBe(
      "#/components/schemas/PlaceRetentionLegalHoldBySessionRequest",
    );
    expect(probe.documentAdminRetentionHoldResponseRef).toBe(
      "#/components/schemas/RetentionLegalHoldComplianceView",
    );
    expect(probe.documentAdminRetentionHoldListRequestRef).toBe(
      "#/components/schemas/ListRetentionLegalHoldsBySessionRequest",
    );
    expect(probe.documentAdminRetentionHoldListResponseRef).toBe(
      "#/components/schemas/RetentionLegalHoldComplianceViewList",
    );
    expect(probe.documentAdminRetentionHoldRelease409Description).toBe(
      "Legal hold is no longer eligible for release.",
    );
    expect(probe.documentAdminRetentionHoldReleaseRequestRef).toBe(
      "#/components/schemas/ReleaseRetentionLegalHoldBySessionRequest",
    );
    expect(probe.documentAdminRetentionHoldReleaseResponseRef).toBe(
      "#/components/schemas/RetentionLegalHoldComplianceView",
    );
    expect(probe.documentHasAdminEmailDeliveryTrackingPath).toBe(true);
    expect(probe.documentHasAdminEmailDeliverySuppressionPath).toBe(true);
    expect(probe.documentAdminEmailDeliveryTracking401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminEmailDeliveryTracking403Description).toBe(
      "Email delivery inspection is not allowed for this session.",
    );
    expect(probe.documentAdminEmailDeliveryTrackingRequestRef).toBe(
      "#/components/schemas/InspectEmailDeliveryTrackingBySessionRequest",
    );
    expect(probe.documentAdminEmailDeliveryTrackingResponseRef).toBe(
      "#/components/schemas/EmailDeliveryTrackingAdminView",
    );
    expect(probe.documentAdminEmailDeliverySuppression401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminEmailDeliverySuppression403Description).toBe(
      "Email delivery inspection is not allowed for this session.",
    );
    expect(probe.documentAdminEmailDeliverySuppressionRequestRef).toBe(
      "#/components/schemas/InspectEmailRecipientSuppressionBySessionRequest",
    );
    expect(probe.documentAdminEmailDeliverySuppressionResponseRef).toBe(
      "#/components/schemas/EmailRecipientSuppressionAdminView",
    );
    expect(probe.documentHasAdminWebhookCreatePath).toBe(true);
    expect(probe.documentHasAdminWebhookListPath).toBe(true);
    expect(probe.documentHasAdminWebhookRequestDeliveryPath).toBe(true);
    expect(probe.documentHasAdminWebhookApiKeyCreatePath).toBe(true);
    expect(probe.documentHasAdminWebhookApiKeyListPath).toBe(true);
    expect(probe.documentHasAdminWebhookApiKeyRotatePath).toBe(true);
    expect(probe.documentHasAdminWebhookApiKeyRevokePath).toBe(true);
    expect(probe.documentAdminWebhookCreate401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminWebhookCreate403Description).toBe(
      "Webhook subscription management is not allowed for this session.",
    );
    expect(probe.documentAdminWebhookCreate409Description).toBe(
      "Webhook subscription already exists for this scope and URL.",
    );
    expect(probe.documentAdminWebhookCreateRequestRef).toBe(
      "#/components/schemas/CreateWebhookSubscriptionBySessionRequest",
    );
    expect(probe.documentAdminWebhookCreateResponseRef).toBe(
      "#/components/schemas/WebhookSubscriptionAdminView",
    );
    expect(probe.documentAdminWebhookList401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminWebhookList403Description).toBe(
      "Webhook subscription management is not allowed for this session.",
    );
    expect(probe.documentAdminWebhookListRequestRef).toBe(
      "#/components/schemas/ListWebhookSubscriptionsBySessionRequest",
    );
    expect(probe.documentAdminWebhookListResponseRef).toBe(
      "#/components/schemas/WebhookSubscriptionAdminViewList",
    );
    expect(probe.documentAdminWebhookRequestDelivery409Description).toBe(
      "Webhook subscription is paused or does not allow the requested event.",
    );
    expect(probe.documentAdminWebhookRequestDelivery503Description).toBe(
      "Webhook delivery workflow is not available.",
    );
    expect(probe.documentAdminWebhookRequestDeliveryRequestRef).toBe(
      "#/components/schemas/RequestWebhookOutboundDeliveryBySessionRequest",
    );
    expect(probe.documentAdminWebhookRequestDeliveryResponseRef).toBe(
      "#/components/schemas/WorkflowJobSummary",
    );
    expect(probe.documentAdminWebhookApiKeyCreate401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminWebhookApiKeyCreate403Description).toBe(
      "Webhook API key management is not allowed for this session.",
    );
    expect(probe.documentAdminWebhookApiKeyCreateRequestRef).toBe(
      "#/components/schemas/CreateWebhookApiKeyBySessionRequest",
    );
    expect(probe.documentAdminWebhookApiKeyCreateResponseRef).toBe(
      "#/components/schemas/WebhookApiKeyOneTimeSecretResult",
    );
    expect(probe.documentAdminWebhookApiKeyList401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminWebhookApiKeyList403Description).toBe(
      "Webhook API key management is not allowed for this session.",
    );
    expect(probe.documentAdminWebhookApiKeyListRequestRef).toBe(
      "#/components/schemas/ListWebhookApiKeysBySessionRequest",
    );
    expect(probe.documentAdminWebhookApiKeyListResponseRef).toBe(
      "#/components/schemas/WebhookApiKeyAdminViewList",
    );
    expect(probe.documentAdminWebhookApiKeyRotate401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminWebhookApiKeyRotate403Description).toBe(
      "Webhook API key management is not allowed for this session.",
    );
    expect(probe.documentAdminWebhookApiKeyRotate409Description).toBe(
      "Webhook API key was revoked or changed during the request.",
    );
    expect(probe.documentAdminWebhookApiKeyRotateRequestRef).toBe(
      "#/components/schemas/RotateWebhookApiKeyBySessionRequest",
    );
    expect(probe.documentAdminWebhookApiKeyRotateResponseRef).toBe(
      "#/components/schemas/WebhookApiKeyOneTimeSecretResult",
    );
    expect(probe.documentAdminWebhookApiKeyRevoke401Description).toBe(
      "Authenticated operator session is required.",
    );
    expect(probe.documentAdminWebhookApiKeyRevoke403Description).toBe(
      "Webhook API key management is not allowed for this session.",
    );
    expect(probe.documentAdminWebhookApiKeyRevoke409Description).toBe(
      "Webhook API key was revoked or changed during the request.",
    );
    expect(probe.documentAdminWebhookApiKeyRevokeRequestRef).toBe(
      "#/components/schemas/RevokeWebhookApiKeyBySessionRequest",
    );
    expect(probe.documentAdminWebhookApiKeyRevokeResponseRef).toBe(
      "#/components/schemas/WebhookApiKeyAdminView",
    );
    expect(probe.documentSubscriberRequestContextParameterNames).toEqual([
      "x-comvestec-session-id",
    ]);
    expect(probe.documentSubscriberRequestContextHasRequestBody).toBe(false);
    expect(probe.documentSubscriberRequestContext401Description).toBe(
      "Authenticated session is required.",
    );
    expect(probe.documentProductBootstrapParameterNames).toEqual([
      "x-comvestec-session-id",
    ]);
    expect(probe.documentProductBootstrapHasRequestBody).toBe(false);
    expect(probe.documentProductBootstrap401Description).toBe(
      "Authenticated session is required.",
    );
    expect(probe.documentHasWebhookPath).toBe(true);
    expect(probe.documentHasProductBootstrapResultSchema).toBe(true);
    expect(probe.documentHasPlatformModuleIdSchema).toBe(true);
    expect(
      probe.documentHasInspectEmailDeliveryTrackingBySessionRequestSchema,
    ).toBe(true);
    expect(
      probe.documentHasInspectEmailRecipientSuppressionBySessionRequestSchema,
    ).toBe(true);
    expect(probe.documentHasEmailDeliveryTrackingAdminViewSchema).toBe(true);
    expect(probe.documentHasEmailRecipientSuppressionAdminViewSchema).toBe(
      true,
    );
    expect(probe.documentHasCreateWebhookApiKeyBySessionRequestSchema).toBe(
      true,
    );
    expect(
      probe.documentHasCreateWebhookSubscriptionBySessionRequestSchema,
    ).toBe(true);
    expect(
      probe.documentHasRequestWebhookOutboundDeliveryBySessionRequestSchema,
    ).toBe(true);
    expect(probe.documentHasListWebhookApiKeysBySessionRequestSchema).toBe(
      true,
    );
    expect(probe.documentHasRotateWebhookApiKeyBySessionRequestSchema).toBe(
      true,
    );
    expect(probe.documentHasRevokeWebhookApiKeyBySessionRequestSchema).toBe(
      true,
    );
    expect(probe.documentHasWebhookApiKeyAdminViewSchema).toBe(true);
    expect(probe.documentHasWebhookApiKeyAdminViewListSchema).toBe(true);
    expect(probe.documentHasWebhookApiKeyOneTimeSecretResultSchema).toBe(true);
    expect(probe.documentHasWebhookSubscriptionAdminViewSchema).toBe(true);
    expect(probe.documentHasWebhookSubscriptionAdminViewListSchema).toBe(true);
    expect(probe.documentHasRetentionPolicyAdminViewSchema).toBe(true);
    expect(probe.documentHasRetentionPolicyAdminViewListSchema).toBe(true);
    expect(probe.documentHasRetentionLegalHoldComplianceViewSchema).toBe(true);
    expect(probe.documentHasRetentionLegalHoldComplianceViewListSchema).toBe(
      true,
    );
    expect(probe.documentHasUpsertRetentionPolicyBySessionRequestSchema).toBe(
      true,
    );
    expect(probe.documentHasPlaceRetentionLegalHoldBySessionRequestSchema).toBe(
      true,
    );
    expect(
      probe.documentHasReleaseRetentionLegalHoldBySessionRequestSchema,
    ).toBe(true);
    expect(probe.documentProductBootstrapResultRequired).toEqual([
      "requestContext",
      "authorization",
    ]);
    expect(probe.documentProductBootstrapResultProperties).toEqual(
      expect.arrayContaining([
        "requestContext",
        "authorization",
        "snapshot",
        "billingStatus",
        "enabledModules",
      ]),
    );
    expect(probe.documentProductBootstrapResultProperties).not.toContain(
      "entitlements",
    );
    expect(probe.documentProductBootstrapEnabledModuleItemRef).toBe(
      "#/components/schemas/PlatformModuleId",
    );
    expect(probe.documentHasRequestContextSchema).toBe(true);
    expect(probe.documentHasStartAuthSchema).toBe(true);
    expect(probe.documentHasErrorResponseSchema).toBe(true);
    expect(probe.documentHasAdminBillingExplanationRequestSchema).toBe(true);
    expect(probe.documentHasAdminBillingExplanationResponseSchema).toBe(true);
    expect(probe.documentAdminBillingCreateRequestRequired).toEqual(["plan"]);
    expect(probe.documentAdminBillingCreateRequestProperties).toEqual(["plan"]);

    // OpenAPI spec route
    expect(probe.openApiStatus).toBe(200);
    expect(probe.openApiContentType).toContain("application/json");
    expect(probe.hasGovernancePath).toBe(true);
    expect(probe.hasGovernanceFeatureFlagListPath).toBe(true);
    expect(probe.hasGovernanceAuthorizationInspectPath).toBe(true);
    expect(probe.hasGovernanceAuthorizationTupleWritePath).toBe(true);
    expect(probe.hasGovernanceAuditActorReadPath).toBe(true);
    expect(probe.hasGovernanceAuditTenantReadPath).toBe(true);
    expect(probe.hasGovernanceAuditTargetReadPath).toBe(true);
    expect(probe.hasGovernanceAuditExportPath).toBe(true);
    expect(probe.governanceFeatureFlagList401Description).toBe(
      "Admin governance reads require a valid authenticated session.",
    );
    expect(probe.governanceFeatureFlagList403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceFeatureFlagListRequestRef).toBe(
      "#/components/schemas/AdminGovernanceReadBySessionRequest",
    );
    expect(probe.governanceFeatureFlagListResponseRef).toBe(
      "#/components/schemas/AdminGovernanceFeatureFlagViewList",
    );
    expect(probe.governanceAuthorizationInspect401Description).toBe(
      "Admin governance reads require a valid authenticated session.",
    );
    expect(probe.governanceAuthorizationInspect403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceAuthorizationInspect502Description).toBe(
      "A backend dependency request failed.",
    );
    expect(probe.governanceAuthorizationInspectRequestRef).toBe(
      "#/components/schemas/AdminGovernanceInspectAuthorizationRequest",
    );
    expect(probe.governanceAuthorizationInspectResponseRef).toBe(
      "#/components/schemas/AdminGovernanceAuthorizationInspectionView",
    );
    expect(probe.governanceAuthorizationTupleWrite401Description).toBe(
      "Admin governance mutations require a valid authenticated session.",
    );
    expect(probe.governanceAuthorizationTupleWrite403Description).toBe(
      "Admin governance mutations are restricted to platform and support operators.",
    );
    expect(probe.governanceAuthorizationTupleWrite502Description).toBe(
      "A backend dependency request failed.",
    );
    expect(probe.governanceAuthorizationTupleWriteRequestRef).toBe(
      "#/components/schemas/AdminGovernanceWriteAuthorizationTupleRequest",
    );
    expect(probe.governanceAuthorizationTupleWriteResponseRef).toBe(
      "#/components/schemas/AdminGovernanceWriteAuthorizationTupleResponse",
    );
    expect(probe.governanceRead401Description).toBe(
      "Admin governance reads require a valid authenticated session.",
    );
    expect(probe.governanceRead403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceMutation401Description).toBe(
      "Admin governance mutations require a valid authenticated session.",
    );
    expect(probe.governanceMutation403Description).toBe(
      "Admin governance mutations are restricted to platform and support operators.",
    );
    expect(probe.governanceProposalRead401Description).toBe(
      "Admin governance reads require a valid authenticated session.",
    );
    expect(probe.governanceProposalRead403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceProposalPersist401Description).toBe(
      "Admin governance mutations require a valid authenticated session.",
    );
    expect(probe.governanceProposalPersist403Description).toBe(
      "Admin governance mutations are restricted to platform and support operators.",
    );
    expect(probe.governanceProposalReview401Description).toBe(
      "Admin governance mutations require a valid authenticated session.",
    );
    expect(probe.governanceProposalReview403Description).toBe(
      "Admin governance mutations are restricted to platform and support operators.",
    );
    expect(probe.governanceProposalReview409Description).toBe(
      "Runtime-config proposals can only be reviewed while pending.",
    );
    expect(probe.governanceProposalReview404Description).toBe(
      "Requested runtime-config proposal was not found.",
    );
    expect(probe.governanceAuditRead401Description).toBe(
      "Admin governance reads require a valid authenticated session.",
    );
    expect(probe.governanceAuditRead403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceAuditActorReadRequestRef).toBe(
      "#/components/schemas/AdminGovernanceQueryAuditEventsByActorRequest",
    );
    expect(probe.governanceAuditActorReadResponseRef).toBe(
      "#/components/schemas/AdminGovernanceAuditEventViewList",
    );
    expect(probe.governanceAuditTenantReadRequestRef).toBe(
      "#/components/schemas/AdminGovernanceQueryAuditEventsByTenantRequest",
    );
    expect(probe.governanceAuditTenantReadResponseRef).toBe(
      "#/components/schemas/AdminGovernanceAuditEventViewList",
    );
    expect(probe.governanceAuditTargetRead401Description).toBe(
      "Admin governance reads require a valid authenticated session.",
    );
    expect(probe.governanceAuditTargetRead403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceAuditTargetReadRequestRef).toBe(
      "#/components/schemas/AdminGovernanceQueryAuditEventsByTargetRequest",
    );
    expect(probe.governanceAuditTargetReadResponseRef).toBe(
      "#/components/schemas/AdminGovernanceAuditEventViewList",
    );
    expect(probe.governanceAuditExport400Description).toBe(
      "Request payload did not match the expected schema or failed audit-export filter validation.",
    );
    expect(probe.governanceAuditExportRequestRef).toBe(
      "#/components/schemas/AdminGovernanceExportAuditEventsRequest",
    );
    expect(probe.governanceAuditExportResponseRef).toBe(
      "#/components/schemas/AdminGovernanceAuditExportView",
    );
    expect(probe.governanceAuditExportRecordedBeforeFormat).toBe("date-time");
    expect(probe.governanceMutationRequestRequired).toEqual(
      expect.arrayContaining([
        "moduleId",
        "key",
        "scope",
        "scopeId",
        "value",
        "approvalReason",
      ]),
    );
    expect(probe.governanceMutationRequestProperties).not.toContain(
      "sessionId",
    );
    expect(probe.governanceMutationRequestProperties).not.toContain(
      "requestContext",
    );
    expect(probe.governanceProposalPersistRequestRequired).toEqual(
      expect.arrayContaining(["moduleId", "renameMap"]),
    );
    expect(probe.governanceProposalPersistRequestProperties).not.toContain(
      "sessionId",
    );
    expect(probe.governanceProposalPersistRequestProperties).not.toContain(
      "requestContext",
    );
    expect(probe.governanceProposalReviewRequestRequired).toEqual(
      expect.arrayContaining(["proposalId", "status", "decisionReason"]),
    );
    expect(probe.governanceProposalReviewRequestProperties).not.toContain(
      "sessionId",
    );
    expect(probe.governanceAuthorizationInspectRequestRequired).toEqual(
      expect.arrayContaining(["checkInput"]),
    );
    expect(probe.governanceAuthorizationInspectRequestProperties).toEqual(
      expect.arrayContaining(["checkInput"]),
    );
    expect(probe.governanceAuthorizationTupleWriteRequestRequired).toEqual(
      expect.arrayContaining(["tuple", "reason"]),
    );
    expect(probe.governanceAuthorizationTupleWriteRequestProperties).toEqual(
      expect.arrayContaining(["tuple", "reason"]),
    );
    expect(probe.governanceAuditTargetRequestRequired).toEqual(
      expect.arrayContaining(["moduleId", "target"]),
    );
    expect(probe.governanceAuditTargetRequestProperties).toEqual(
      expect.arrayContaining(["moduleId", "target"]),
    );
    expect(probe.hasGovernanceAuthorizationInspectionViewSchema).toBe(true);
    expect(probe.hasGovernanceAuthorizationTupleWriteResponseSchema).toBe(true);
    expect(probe.hasGovernanceAuditTargetRequestSchema).toBe(true);
    expect(probe.governanceProposalReviewRequestProperties).not.toContain(
      "requestContext",
    );
    expect(probe.governanceAuthorizationInspectRequestProperties).not.toContain(
      "sessionId",
    );
    expect(
      probe.governanceAuthorizationTupleWriteRequestProperties,
    ).not.toContain("requestContext");
    expect(
      probe.governanceAuthorizationTupleWriteRequestProperties,
    ).not.toContain("sessionId");
    expect(probe.governanceAuditTargetRequestProperties).not.toContain(
      "requestContext",
    );
    expect(probe.governanceAuditTargetRequestProperties).not.toContain(
      "sessionId",
    );

    // Swagger UI HTML route
    expect(probe.docsStatus).toBe(200);
    expect(probe.docsContentType).toContain("text/html");
    expect(probe.docsHtml).toContain(backendApiOpenApiPath);
    expect(probe.docsHtml).toContain(
      probe.backendApiDocsAssetPath.swaggerUiBundle,
    );
    expect(probe.docsHtml).toContain("SwaggerUIBundle");

    // Swagger UI CSS asset
    expect(probe.cssStatus).toBe(200);
    expect(probe.cssContentType).toContain("text/css");
    expect(probe.cssHasSwaggerUi).toBe(true);

    // Non-GET method rejection
    expect(probe.methodStatus).toBe(405);
    expect(probe.methodAllow).toBe("GET");
    expect(probe.methodBody).toEqual({
      error: "Method not allowed.",
    });
  }, 90_000);
});
