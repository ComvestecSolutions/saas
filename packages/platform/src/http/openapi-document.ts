import { Effect, JSONSchema, Schema } from "effect";
import {
  AdminTenantInvitationIssueResultSchema,
  AdminTenantInvitationQueryResultSchema,
  AdminTenantInvitationRevokeResultSchema,
  AdminTenantMembershipMutationResultSchema,
  AdminTenantMembershipQueryResultSchema,
  AdminTenantOnboardingReviewResultSchema,
  AdminBillingExplanationResultSchema,
  BillingPlanCreateInputSchema,
  BillingCheckoutSessionInputSchema,
  BillingCheckoutSessionSchema,
  BillingRepairGapCancelResultSchema,
  BillingReconciliationManualRunResultSchema,
  BillingRepairGapReplayResultSchema,
  BillingRepairGapListResultSchema,
  BillingPlanCreateResultSchema,
  CustomDomainVerificationAdminViewSchema,
  EmailDeliveryTrackingAdminViewSchema,
  EmailRecipientSuppressionAdminViewSchema,
  ImportExportJobAdminViewSchema,
  ManagedFileDownloadDescriptorSchema,
  ManagedFileSummaryViewListSchema,
  ManagedFileSummaryViewSchema,
  ManagedFileUploadUrlSchema,
  NotificationCenterInAppNotificationAdminViewSchema,
  NotificationCenterEmailPreferenceAdminViewSchema,
  NotificationCenterEmailReceiptAdminViewSchema,
  PlatformModuleIdSchema,
  PublicBillingPlanCatalogSchema,
  RedeemTenantInvitationResultSchema,
  RequestWebhookOutboundDeliveryInputSchema,
  RequestContextSchema,
  RetentionLegalHoldComplianceViewListSchema,
  RetentionLegalHoldComplianceViewSchema,
  RetentionPolicyAdminViewListSchema,
  RetentionPolicyAdminViewSchema,
  SearchManagedFileQueryResultSchema,
  SearchSupportCaseQueryResultSchema,
  SearchTenantIndexDeletionReceiptSchema,
  SearchTenantIndexRecordListSchema,
  SearchTenantIndexRecordSchema,
  SearchTenantIndexSummaryViewSchema,
  SupportOperationsBreakGlassIncidentSupportViewListSchema,
  SupportOperationsBreakGlassIncidentSupportViewSchema,
  SupportOperationsCaseSupportViewListSchema,
  SupportOperationsCaseSupportViewSchema,
  SupportOperationsImpersonationSessionSupportViewListSchema,
  SupportOperationsImpersonationSessionSupportViewSchema,
  SupportOperationsTenantHealthViewSchema,
  TenantBrandingPublishedAssetReferenceViewSchema,
  TenantBrandingSupportSafeViewSchema,
  WebhookApiKeyAdminViewListSchema,
  WebhookApiKeyAdminViewSchema,
  WebhookApiKeyOneTimeSecretResultSchema,
  WebhookSubscriptionAdminViewListSchema,
  WebhookSubscriptionAdminViewSchema,
  WorkflowJobRepairGapCancelResultSchema,
  WorkflowJobRepairGapListResultSchema,
  WorkflowJobRepairGapReplayResultSchema,
  WorkflowJobSummarySchema,
} from "@comvestec/contracts";
import {
  AuthorizationDecisionSchema,
  BillingEntitlementRecordSchema,
  BillingWebhookProcessingResultSchema,
  BreakGlassGrantSchema,
  IdentitySessionCompletionResultSchema,
  IdentitySessionStartResultSchema,
  SupportImpersonationGrantSchema,
} from "@comvestec/modules";
import { ProductAppSnapshotSchema } from "../services/apps/app-snapshots";
import {
  InspectEmailDeliveryTrackingBySessionRequestSchema,
  InspectEmailRecipientSuppressionBySessionRequestSchema,
} from "../services/communication/admin-email-delivery";
import { adminEmailDeliveryApiPath } from "../services/communication/admin-email-delivery-http";
import {
  InspectNotificationCenterEmailPreferenceBySessionRequestSchema,
  InspectNotificationCenterEmailReceiptBySessionRequestSchema,
  InspectNotificationCenterInAppNotificationBySessionRequestSchema,
  UpsertNotificationCenterEmailPreferenceBySessionRequestSchema,
} from "../services/communication/admin-notification-center";
import { adminNotificationCenterApiPath } from "../services/communication/admin-notification-center-http";
import { adminWebhooksApiAccessApiPath } from "../services/communication/admin-webhooks-api-access-http";
import { emailDeliveryApiPath } from "../services/communication/email-delivery-http";
import {
  CreateWebhookApiKeyBySessionRequestSchema,
  CreateWebhookSubscriptionBySessionRequestSchema,
  ListWebhookApiKeysBySessionRequestSchema,
  ListWebhookSubscriptionsBySessionRequestSchema,
  RevokeWebhookApiKeyBySessionRequestSchema,
  RotateWebhookApiKeyBySessionRequestSchema,
} from "../services/communication/webhooks-api-access";
import {
  BillingWebhookReplayRequestSchema,
  WebhookIgnoredResponseSchema,
  webhooksApiPath,
} from "../services/communication/webhooks-api-access-http";
import {
  CancelBillingRepairGapHttpRequestSchema,
  CreateManagedBillingPlanHttpRequestSchema,
  InspectBillingStateHttpRequestSchema,
  ReplayBillingRepairGapHttpRequestSchema,
  RunManualBillingReconciliationHttpRequestSchema,
} from "../services/domains/admin-billing-http";
import { adminBillingApiPath } from "../services/domains/admin-billing-http";
import {
  adminTenantBrandingApiPath,
  GetTenantBrandingSupportSafeViewHttpRequestSchema,
  PublishTenantBrandingAssetHttpRequestSchema,
  RequestCustomDomainVerificationHttpRequestSchema,
  TransitionCustomDomainVerificationHttpRequestSchema,
} from "../services/domains/tenant-branding-http";
import {
  adminTenantManagementApiPath,
  IssueTenantInvitationHttpRequestSchema,
  MutateTenantMembershipHttpRequestSchema,
  QueryTenantInvitationsHttpRequestSchema,
  QueryTenantMembershipsHttpRequestSchema,
  RevokeTenantInvitationHttpRequestSchema,
  ReviewTenantOnboardingHttpRequestSchema,
} from "../services/domains/admin-tenant-management-http";
import {
  CancelWorkflowJobRepairGapHttpRequestSchema,
  ReplayWorkflowJobRepairGapHttpRequestSchema,
  workflowJobsApiPath,
} from "../services/domains/workflow-jobs-http";
import {
  RedeemTenantInvitationHttpRequestSchema,
  tenantInvitationRedemptionApiPath,
} from "../services/domains/tenant-invitation-redemption-http";
import {
  fileStorageApiPath,
  ListManagedFilesHttpRequestSchema,
  ManagedFileLookupHttpRequestSchema,
  RegisterManagedFileHttpRequestSchema,
  RequestManagedFileUploadUrlHttpRequestSchema,
} from "../services/domains/file-storage-http";
import {
  GetImportExportJobHttpRequestSchema,
  importExportApiPath,
  RequestManagedFileSummaryExportHttpRequestSchema,
  RequestSupportCaseSummaryExportHttpRequestSchema,
} from "../services/domains/import-export-http";
import {
  EnsureSearchTenantIndexHttpRequestSchema,
  QueryCurrentTenantSearchManagedFilesHttpRequestSchema,
  QuerySearchManagedFilesHttpRequestSchema,
  QuerySearchSupportCasesHttpRequestSchema,
  RequestSearchTenantIndexEnsureWorkflowJobHttpRequestSchema,
  RequestSearchTenantIndexReindexWorkflowJobHttpRequestSchema,
  searchApiPath,
  searchTenantApiPath,
  SearchTenantIndexLookupHttpRequestSchema,
} from "../services/domains/search-http";
import {
  CompleteAuthenticationRequestSchema,
  StartAuthenticationRequestSchema,
  subscriberJourneyApiPath,
} from "../services/domains/subscriber-journey-http";
import { ProductBootstrapBillingStatusSchema } from "../services/domains/subscriber-journey";
import { subscriberJourneySessionHeaderName } from "../services/access/request-context-transport";
import {
  AdminGovernanceAuditEventViewListSchema,
  AdminGovernanceAuditExportViewSchema,
  AdminGovernanceExportAuditEventsRequestSchema,
  AdminGovernanceFeatureFlagViewListSchema,
  AdminGovernanceAuthorizationInspectionViewSchema,
  AdminGovernanceInspectAuthorizationRequestSchema,
  AdminGovernanceQueryAuditEventsByActorRequestSchema,
  AdminGovernanceQueryAuditEventsByTenantRequestSchema,
  AdminGovernanceQueryAuditEventsByTargetRequestSchema,
  AdminGovernanceReadBySessionRequestSchema,
  AdminGovernanceReviewRuntimeConfigProposalResponseSchema,
  AdminGovernanceRuntimeConfigOverrideViewListSchema,
  AdminGovernanceRuntimeConfigProposalViewListSchema,
  AdminGovernanceWriteAuthorizationTupleRequestSchema,
  AdminGovernanceWriteAuthorizationTupleResponseSchema,
  ReviewRuntimeConfigProposalRequestSchema,
  AdminGovernanceSubmitRuntimeConfigOverrideProposalResponseSchema,
  PersistRuntimeConfigProposalsRequestSchema,
  SubmitRuntimeConfigOverrideProposalRequestSchema,
} from "../services/governance/admin-governance";
import { adminGovernanceApiPath } from "../services/governance/admin-governance-http";
import { adminRetentionLegalHoldApiPath } from "../services/governance/admin-retention-legal-hold-http";
import {
  ListRetentionLegalHoldsBySessionRequestSchema,
  ListRetentionPoliciesBySessionRequestSchema,
  PlaceRetentionLegalHoldBySessionRequestSchema,
  ReleaseRetentionLegalHoldBySessionRequestSchema,
  UpsertRetentionPolicyBySessionRequestSchema,
} from "../services/governance/retention-legal-hold";
import { adminSupportOperationsApiPath } from "../services/governance/support-operations-http";
import {
  SupportOperationsGetTenantHealthRequestSchema,
  SupportOperationsGrantBreakGlassRequestSchema,
  SupportOperationsListCasesRequestSchema,
  SupportOperationsListBreakGlassIncidentsRequestSchema,
  SupportOperationsListImpersonationSessionsRequestSchema,
  SupportOperationsRevokeImpersonationSessionRequestSchema,
  SupportOperationsReviewBreakGlassIncidentRequestSchema,
  SupportOperationsStartImpersonationRequestSchema,
  SupportOperationsUpsertCaseRequestSchema,
} from "../services/governance/support-operations";
import {
  backendApiHealthPath,
  BackendApiLivenessResponseSchema,
  BackendApiReadinessCheckSchema,
  BackendApiReadinessResponseSchema,
} from "./health";

type OpenApiSchema = Readonly<Record<string, unknown>>;

type OpenApiMediaType = {
  readonly schema: OpenApiSchema;
};

type OpenApiResponse = {
  readonly description: string;
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
};

type OpenApiParameter = {
  readonly name: string;
  readonly in: "header" | "path" | "query";
  readonly required?: boolean;
  readonly description?: string;
  readonly schema: OpenApiSchema;
};

type OpenApiOperation = {
  readonly tags?: readonly string[];
  readonly summary: string;
  readonly description?: string;
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly required?: boolean;
    readonly description?: string;
    readonly content: Readonly<Record<string, OpenApiMediaType>>;
  };
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
};

type OpenApiPathItem = {
  readonly get?: OpenApiOperation;
  readonly post?: OpenApiOperation;
};

export type BackendApiOpenApiDocument = {
  readonly openapi: "3.1.0";
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description: string;
  };
  readonly servers: readonly {
    readonly url: string;
    readonly description?: string;
  }[];
  readonly tags: readonly {
    readonly name: string;
    readonly description: string;
  }[];
  readonly paths: Readonly<Record<string, OpenApiPathItem>>;
  readonly components: {
    readonly schemas: Readonly<Record<string, OpenApiSchema>>;
  };
};

type DocumentSchemaSource = {
  readonly name: string;
  readonly schema: Schema.Schema.AnyNoContext;
};

const isJsonSchemaRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const makeJsonSchema = (
  schema: Schema.Schema.AnyNoContext,
): Record<string, unknown> => {
  const jsonSchema = JSONSchema.make(schema, {
    target: "openApi3.1",
  });

  if (!isJsonSchemaRecord(jsonSchema)) {
    throw new TypeError(
      "JSONSchema.make must return an object when generating the OpenAPI document.",
    );
  }

  return jsonSchema;
};

export const backendApiOpenApiPath = "/api/openapi.json";

const ErrorResponseSchema = Schema.Struct({
  error: Schema.NonEmptyString,
});

const AdminGovernanceReadRequestBodySchema = Schema.Struct({
  moduleId: AdminGovernanceReadBySessionRequestSchema.fields.moduleId,
});

const AdminGovernanceQueryAuditEventsByTargetRequestBodySchema = Schema.Struct({
  moduleId:
    AdminGovernanceQueryAuditEventsByTargetRequestSchema.fields.moduleId,
  target: AdminGovernanceQueryAuditEventsByTargetRequestSchema.fields.target,
});

const AdminGovernanceQueryAuditEventsByActorRequestBodySchema = Schema.Struct({
  actorId: AdminGovernanceQueryAuditEventsByActorRequestSchema.fields.actorId,
});

const AdminGovernanceQueryAuditEventsByTenantRequestBodySchema = Schema.Struct({
  tenantScope:
    AdminGovernanceQueryAuditEventsByTenantRequestSchema.fields.tenantScope,
  tenantScopeId:
    AdminGovernanceQueryAuditEventsByTenantRequestSchema.fields.tenantScopeId,
});

const AdminGovernanceExportAuditEventsRequestBodySchema = Schema.Struct({
  filter: AdminGovernanceExportAuditEventsRequestSchema.fields.filter,
});

const AdminGovernanceInspectAuthorizationRequestBodySchema = Schema.Struct({
  checkInput:
    AdminGovernanceInspectAuthorizationRequestSchema.fields.checkInput,
});

const AdminGovernanceWriteAuthorizationTupleRequestBodySchema = Schema.Struct({
  tuple: AdminGovernanceWriteAuthorizationTupleRequestSchema.fields.tuple,
  reason: AdminGovernanceWriteAuthorizationTupleRequestSchema.fields.reason,
});

const PersistRuntimeConfigProposalsRequestBodySchema = Schema.Struct({
  moduleId: PersistRuntimeConfigProposalsRequestSchema.fields.moduleId,
  renameMap: PersistRuntimeConfigProposalsRequestSchema.fields.renameMap,
});

const SubmitRuntimeConfigOverrideProposalRequestBodySchema = Schema.Struct({
  moduleId: SubmitRuntimeConfigOverrideProposalRequestSchema.fields.moduleId,
  key: SubmitRuntimeConfigOverrideProposalRequestSchema.fields.key,
  scope: SubmitRuntimeConfigOverrideProposalRequestSchema.fields.scope,
  scopeId: SubmitRuntimeConfigOverrideProposalRequestSchema.fields.scopeId,
  value: SubmitRuntimeConfigOverrideProposalRequestSchema.fields.value,
  approvalReason:
    SubmitRuntimeConfigOverrideProposalRequestSchema.fields.approvalReason,
});

const ReviewRuntimeConfigProposalRequestBodySchema = Schema.Struct({
  proposalId: ReviewRuntimeConfigProposalRequestSchema.fields.proposalId,
  status: ReviewRuntimeConfigProposalRequestSchema.fields.status,
  decisionReason:
    ReviewRuntimeConfigProposalRequestSchema.fields.decisionReason,
});

const UpsertRetentionPolicyBySessionRequestBodySchema = Schema.Struct({
  scope: UpsertRetentionPolicyBySessionRequestSchema.fields.scope,
  scopeId: UpsertRetentionPolicyBySessionRequestSchema.fields.scopeId,
  dataType: UpsertRetentionPolicyBySessionRequestSchema.fields.dataType,
  retentionDays:
    UpsertRetentionPolicyBySessionRequestSchema.fields.retentionDays,
});

const ListRetentionPoliciesBySessionRequestBodySchema = Schema.Struct({
  scope: ListRetentionPoliciesBySessionRequestSchema.fields.scope,
  scopeId: ListRetentionPoliciesBySessionRequestSchema.fields.scopeId,
});

const PlaceRetentionLegalHoldBySessionRequestBodySchema = Schema.Struct({
  scope: PlaceRetentionLegalHoldBySessionRequestSchema.fields.scope,
  scopeId: PlaceRetentionLegalHoldBySessionRequestSchema.fields.scopeId,
  dataType: PlaceRetentionLegalHoldBySessionRequestSchema.fields.dataType,
  targetId: PlaceRetentionLegalHoldBySessionRequestSchema.fields.targetId,
  reason: PlaceRetentionLegalHoldBySessionRequestSchema.fields.reason,
  evidence: PlaceRetentionLegalHoldBySessionRequestSchema.fields.evidence,
});

const ReleaseRetentionLegalHoldBySessionRequestBodySchema = Schema.Struct({
  legalHoldId:
    ReleaseRetentionLegalHoldBySessionRequestSchema.fields.legalHoldId,
});

const ListRetentionLegalHoldsBySessionRequestBodySchema = Schema.Struct({
  scope: ListRetentionLegalHoldsBySessionRequestSchema.fields.scope,
  scopeId: ListRetentionLegalHoldsBySessionRequestSchema.fields.scopeId,
});

const SupportOperationsStartImpersonationRequestBodySchema = Schema.Struct({
  impersonatedActorId:
    SupportOperationsStartImpersonationRequestSchema.fields.impersonatedActorId,
  reason: SupportOperationsStartImpersonationRequestSchema.fields.reason,
  requestedDurationMinutes:
    SupportOperationsStartImpersonationRequestSchema.fields
      .requestedDurationMinutes,
});

const SupportOperationsUpsertCaseRequestBodySchema = Schema.Struct({
  caseId: SupportOperationsUpsertCaseRequestSchema.fields.caseId,
  tenantScope: SupportOperationsUpsertCaseRequestSchema.fields.tenantScope,
  tenantScopeId: SupportOperationsUpsertCaseRequestSchema.fields.tenantScopeId,
  summary: SupportOperationsUpsertCaseRequestSchema.fields.summary,
  status: SupportOperationsUpsertCaseRequestSchema.fields.status,
  priority: SupportOperationsUpsertCaseRequestSchema.fields.priority,
  changeReason: SupportOperationsUpsertCaseRequestSchema.fields.changeReason,
});

const SupportOperationsListCasesRequestBodySchema = Schema.Struct({
  status: SupportOperationsListCasesRequestSchema.fields.status,
});

const SupportOperationsGetTenantHealthRequestBodySchema = Schema.Struct({
  tenantScope: SupportOperationsGetTenantHealthRequestSchema.fields.tenantScope,
  tenantScopeId:
    SupportOperationsGetTenantHealthRequestSchema.fields.tenantScopeId,
});

const SupportOperationsListImpersonationSessionsRequestBodySchema =
  Schema.Struct({
    status:
      SupportOperationsListImpersonationSessionsRequestSchema.fields.status,
  });

const SupportOperationsRevokeImpersonationSessionRequestBodySchema =
  Schema.Struct({
    caseId:
      SupportOperationsRevokeImpersonationSessionRequestSchema.fields.caseId,
    revocationReason:
      SupportOperationsRevokeImpersonationSessionRequestSchema.fields
        .revocationReason,
  });

const SupportOperationsGrantBreakGlassRequestBodySchema = Schema.Struct({
  reason: SupportOperationsGrantBreakGlassRequestSchema.fields.reason,
  expiresAt: SupportOperationsGrantBreakGlassRequestSchema.fields.expiresAt,
});

const SupportOperationsListBreakGlassIncidentsRequestBodySchema = Schema.Struct(
  {
    status: SupportOperationsListBreakGlassIncidentsRequestSchema.fields.status,
  },
);

const SupportOperationsReviewBreakGlassIncidentRequestBodySchema =
  Schema.Struct({
    caseId:
      SupportOperationsReviewBreakGlassIncidentRequestSchema.fields.caseId,
    reviewReason:
      SupportOperationsReviewBreakGlassIncidentRequestSchema.fields
        .reviewReason,
  });

const CreateWebhookSubscriptionBySessionRequestBodySchema = Schema.Struct({
  scope: CreateWebhookSubscriptionBySessionRequestSchema.fields.scope,
  scopeId: CreateWebhookSubscriptionBySessionRequestSchema.fields.scopeId,
  url: CreateWebhookSubscriptionBySessionRequestSchema.fields.url,
  events: CreateWebhookSubscriptionBySessionRequestSchema.fields.events,
});

const CreateWebhookApiKeyBySessionRequestBodySchema = Schema.Struct({
  scope: CreateWebhookApiKeyBySessionRequestSchema.fields.scope,
  scopeId: CreateWebhookApiKeyBySessionRequestSchema.fields.scopeId,
  label: CreateWebhookApiKeyBySessionRequestSchema.fields.label,
});

const ListWebhookSubscriptionsBySessionRequestBodySchema = Schema.Struct({
  scope: ListWebhookSubscriptionsBySessionRequestSchema.fields.scope,
  scopeId: ListWebhookSubscriptionsBySessionRequestSchema.fields.scopeId,
});

const ListWebhookApiKeysBySessionRequestBodySchema = Schema.Struct({
  scope: ListWebhookApiKeysBySessionRequestSchema.fields.scope,
  scopeId: ListWebhookApiKeysBySessionRequestSchema.fields.scopeId,
});

const RequestWebhookOutboundDeliveryBySessionRequestBodySchema = Schema.Struct({
  scope: RequestWebhookOutboundDeliveryInputSchema.fields.scope,
  scopeId: RequestWebhookOutboundDeliveryInputSchema.fields.scopeId,
  subscriptionId:
    RequestWebhookOutboundDeliveryInputSchema.fields.subscriptionId,
  eventType: RequestWebhookOutboundDeliveryInputSchema.fields.eventType,
  payload: RequestWebhookOutboundDeliveryInputSchema.fields.payload,
  scheduledAt: RequestWebhookOutboundDeliveryInputSchema.fields.scheduledAt,
});

const RotateWebhookApiKeyBySessionRequestBodySchema = Schema.Struct({
  scope: RotateWebhookApiKeyBySessionRequestSchema.fields.scope,
  scopeId: RotateWebhookApiKeyBySessionRequestSchema.fields.scopeId,
  apiKeyId: RotateWebhookApiKeyBySessionRequestSchema.fields.apiKeyId,
});

const RevokeWebhookApiKeyBySessionRequestBodySchema = Schema.Struct({
  scope: RevokeWebhookApiKeyBySessionRequestSchema.fields.scope,
  scopeId: RevokeWebhookApiKeyBySessionRequestSchema.fields.scopeId,
  apiKeyId: RevokeWebhookApiKeyBySessionRequestSchema.fields.apiKeyId,
});

const InspectEmailDeliveryTrackingBySessionRequestBodySchema = Schema.Struct({
  messageId:
    InspectEmailDeliveryTrackingBySessionRequestSchema.fields.messageId,
});

const InspectEmailRecipientSuppressionBySessionRequestBodySchema =
  Schema.Struct({
    recipient:
      InspectEmailRecipientSuppressionBySessionRequestSchema.fields.recipient,
  });

const InspectNotificationCenterEmailReceiptBySessionRequestBodySchema =
  Schema.Struct({
    notificationId:
      InspectNotificationCenterEmailReceiptBySessionRequestSchema.fields
        .notificationId,
  });

const InspectNotificationCenterInAppNotificationBySessionRequestBodySchema =
  Schema.Struct({
    notificationId:
      InspectNotificationCenterInAppNotificationBySessionRequestSchema.fields
        .notificationId,
  });

const InspectNotificationCenterEmailPreferenceBySessionRequestBodySchema =
  Schema.Struct({
    tenantScope:
      InspectNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .tenantScope,
    tenantScopeId:
      InspectNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .tenantScopeId,
    recipient:
      InspectNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .recipient,
    template:
      InspectNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .template,
  });

const UpsertNotificationCenterEmailPreferenceBySessionRequestBodySchema =
  Schema.Struct({
    tenantScope:
      UpsertNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .tenantScope,
    tenantScopeId:
      UpsertNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .tenantScopeId,
    recipient:
      UpsertNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .recipient,
    template:
      UpsertNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .template,
    enabled:
      UpsertNotificationCenterEmailPreferenceBySessionRequestSchema.fields
        .enabled,
  });

const RequestCustomDomainVerificationHttpRequestBodySchema = Schema.Struct({
  scope: RequestCustomDomainVerificationHttpRequestSchema.fields.scope,
  scopeId: RequestCustomDomainVerificationHttpRequestSchema.fields.scopeId,
  requestedHost:
    RequestCustomDomainVerificationHttpRequestSchema.fields.requestedHost,
});

const TransitionCustomDomainVerificationHttpRequestBodySchema = Schema.Struct({
  scope: TransitionCustomDomainVerificationHttpRequestSchema.fields.scope,
  scopeId: TransitionCustomDomainVerificationHttpRequestSchema.fields.scopeId,
  lifecycleState:
    TransitionCustomDomainVerificationHttpRequestSchema.fields.lifecycleState,
  approvalNotes:
    TransitionCustomDomainVerificationHttpRequestSchema.fields.approvalNotes,
});

const PublishTenantBrandingAssetHttpRequestBodySchema = Schema.Struct({
  scope: PublishTenantBrandingAssetHttpRequestSchema.fields.scope,
  scopeId: PublishTenantBrandingAssetHttpRequestSchema.fields.scopeId,
  assetKind: PublishTenantBrandingAssetHttpRequestSchema.fields.assetKind,
  fileId: PublishTenantBrandingAssetHttpRequestSchema.fields.fileId,
});

const tenantBrandingScopeQueryParameter: OpenApiParameter = {
  name: "scope",
  in: "query",
  required: true,
  description: "Tenant scope for the tenant-branding projection request.",
  schema: makeJsonSchema(
    GetTenantBrandingSupportSafeViewHttpRequestSchema.fields.scope,
  ),
};

const tenantBrandingScopeIdQueryParameter: OpenApiParameter = {
  name: "scopeId",
  in: "query",
  required: true,
  description:
    "Tenant scope identifier for the tenant-branding projection request.",
  schema: makeJsonSchema(
    GetTenantBrandingSupportSafeViewHttpRequestSchema.fields.scopeId,
  ),
};

const PublicBillingPlanCatalogResponseSchema = Schema.Struct({
  plans: PublicBillingPlanCatalogSchema,
});

const ResolveRequestContextResponseSchema = Schema.Struct({
  requestContext: RequestContextSchema,
});

const RawWebhookPayloadSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

const backendApiDocumentSchemas = [
  {
    name: "BackendApiLivenessResponse",
    schema: BackendApiLivenessResponseSchema,
  },
  {
    name: "BackendApiReadinessCheck",
    schema: BackendApiReadinessCheckSchema,
  },
  {
    name: "BackendApiReadinessResponse",
    schema: BackendApiReadinessResponseSchema,
  },
  {
    name: "ErrorResponse",
    schema: ErrorResponseSchema,
  },
  {
    name: "PublicBillingPlanCatalogResponse",
    schema: PublicBillingPlanCatalogResponseSchema,
  },
  {
    name: "StartAuthenticationRequest",
    schema: StartAuthenticationRequestSchema,
  },
  {
    name: "StartAuthenticationResponse",
    schema: IdentitySessionStartResultSchema,
  },
  {
    name: "CompleteAuthenticationRequest",
    schema: CompleteAuthenticationRequestSchema,
  },
  {
    name: "CompleteAuthenticationResponse",
    schema: IdentitySessionCompletionResultSchema,
  },
  {
    name: "RequestContext",
    schema: RequestContextSchema,
  },
  {
    name: "ResolveRequestContextResponse",
    schema: ResolveRequestContextResponseSchema,
  },
  {
    name: "BillingCheckoutSessionInput",
    schema: BillingCheckoutSessionInputSchema,
  },
  {
    name: "BillingCheckoutSession",
    schema: BillingCheckoutSessionSchema,
  },
  {
    name: "PlatformModuleId",
    schema: PlatformModuleIdSchema,
  },
  {
    name: "ProductBootstrapBillingStatus",
    schema: ProductBootstrapBillingStatusSchema,
  },
  {
    name: "ProductAppSnapshot",
    schema: ProductAppSnapshotSchema,
  },
  {
    name: "AuthorizationDecision",
    schema: AuthorizationDecisionSchema,
  },
  {
    name: "BillingEntitlementRecord",
    schema: BillingEntitlementRecordSchema,
  },
  {
    name: "BillingPlanCreateInput",
    schema: BillingPlanCreateInputSchema,
  },
  {
    name: "BillingPlanCreateResponse",
    schema: BillingPlanCreateResultSchema,
  },
  {
    name: "CreateManagedBillingPlanRequest",
    schema: CreateManagedBillingPlanHttpRequestSchema,
  },
  {
    name: "AdminBillingExplanationRequest",
    schema: InspectBillingStateHttpRequestSchema,
  },
  {
    name: "AdminBillingExplanationResponse",
    schema: AdminBillingExplanationResultSchema,
  },
  {
    name: "BillingRepairGapListResponse",
    schema: BillingRepairGapListResultSchema,
  },
  {
    name: "WorkflowJobRepairGapListResponse",
    schema: WorkflowJobRepairGapListResultSchema,
  },
  {
    name: "CancelWorkflowJobRepairGapRequest",
    schema: CancelWorkflowJobRepairGapHttpRequestSchema,
  },
  {
    name: "ReplayWorkflowJobRepairGapRequest",
    schema: ReplayWorkflowJobRepairGapHttpRequestSchema,
  },
  {
    name: "WorkflowJobRepairGapReplayResponse",
    schema: WorkflowJobRepairGapReplayResultSchema,
  },
  {
    name: "WorkflowJobRepairGapCancelResponse",
    schema: WorkflowJobRepairGapCancelResultSchema,
  },
  {
    name: "CancelBillingRepairGapRequest",
    schema: CancelBillingRepairGapHttpRequestSchema,
  },
  {
    name: "BillingRepairGapCancelResponse",
    schema: BillingRepairGapCancelResultSchema,
  },
  {
    name: "ReplayBillingRepairGapRequest",
    schema: ReplayBillingRepairGapHttpRequestSchema,
  },
  {
    name: "BillingRepairGapReplayResponse",
    schema: BillingRepairGapReplayResultSchema,
  },
  {
    name: "RunManualBillingReconciliationRequest",
    schema: RunManualBillingReconciliationHttpRequestSchema,
  },
  {
    name: "BillingReconciliationManualRunResponse",
    schema: BillingReconciliationManualRunResultSchema,
  },
  {
    name: "IssueTenantInvitationRequest",
    schema: IssueTenantInvitationHttpRequestSchema,
  },
  {
    name: "AdminTenantInvitationIssueResponse",
    schema: AdminTenantInvitationIssueResultSchema,
  },
  {
    name: "QueryTenantInvitationsRequest",
    schema: QueryTenantInvitationsHttpRequestSchema,
  },
  {
    name: "AdminTenantInvitationQueryResponse",
    schema: AdminTenantInvitationQueryResultSchema,
  },
  {
    name: "RevokeTenantInvitationRequest",
    schema: RevokeTenantInvitationHttpRequestSchema,
  },
  {
    name: "AdminTenantInvitationRevokeResponse",
    schema: AdminTenantInvitationRevokeResultSchema,
  },
  {
    name: "RedeemTenantInvitationRequest",
    schema: RedeemTenantInvitationHttpRequestSchema,
  },
  {
    name: "RedeemTenantInvitationResponse",
    schema: RedeemTenantInvitationResultSchema,
  },
  {
    name: "MutateTenantMembershipRequest",
    schema: MutateTenantMembershipHttpRequestSchema,
  },
  {
    name: "AdminTenantMembershipMutationResponse",
    schema: AdminTenantMembershipMutationResultSchema,
  },
  {
    name: "QueryTenantMembershipsRequest",
    schema: QueryTenantMembershipsHttpRequestSchema,
  },
  {
    name: "AdminTenantMembershipQueryResponse",
    schema: AdminTenantMembershipQueryResultSchema,
  },
  {
    name: "ReviewTenantOnboardingRequest",
    schema: ReviewTenantOnboardingHttpRequestSchema,
  },
  {
    name: "AdminTenantOnboardingReviewResponse",
    schema: AdminTenantOnboardingReviewResultSchema,
  },
  {
    name: "AdminGovernanceReadBySessionRequest",
    schema: AdminGovernanceReadRequestBodySchema,
  },
  {
    name: "AdminGovernanceQueryAuditEventsByTargetRequest",
    schema: AdminGovernanceQueryAuditEventsByTargetRequestBodySchema,
  },
  {
    name: "AdminGovernanceQueryAuditEventsByActorRequest",
    schema: AdminGovernanceQueryAuditEventsByActorRequestBodySchema,
  },
  {
    name: "AdminGovernanceQueryAuditEventsByTenantRequest",
    schema: AdminGovernanceQueryAuditEventsByTenantRequestBodySchema,
  },
  {
    name: "AdminGovernanceExportAuditEventsRequest",
    schema: AdminGovernanceExportAuditEventsRequestBodySchema,
  },
  {
    name: "AdminGovernanceInspectAuthorizationRequest",
    schema: AdminGovernanceInspectAuthorizationRequestBodySchema,
  },
  {
    name: "AdminGovernanceWriteAuthorizationTupleRequest",
    schema: AdminGovernanceWriteAuthorizationTupleRequestBodySchema,
  },
  {
    name: "SubmitRuntimeConfigOverrideProposalRequest",
    schema: SubmitRuntimeConfigOverrideProposalRequestBodySchema,
  },
  {
    name: "PersistRuntimeConfigProposalsRequest",
    schema: PersistRuntimeConfigProposalsRequestBodySchema,
  },
  {
    name: "ReviewRuntimeConfigProposalRequest",
    schema: ReviewRuntimeConfigProposalRequestBodySchema,
  },
  {
    name: "AdminGovernanceRuntimeConfigOverrideViewList",
    schema: AdminGovernanceRuntimeConfigOverrideViewListSchema,
  },
  {
    name: "AdminGovernanceFeatureFlagViewList",
    schema: AdminGovernanceFeatureFlagViewListSchema,
  },
  {
    name: "AdminGovernanceRuntimeConfigProposalViewList",
    schema: AdminGovernanceRuntimeConfigProposalViewListSchema,
  },
  {
    name: "AdminGovernanceAuditEventViewList",
    schema: AdminGovernanceAuditEventViewListSchema,
  },
  {
    name: "AdminGovernanceAuditExportView",
    schema: AdminGovernanceAuditExportViewSchema,
  },
  {
    name: "AdminGovernanceAuthorizationInspectionView",
    schema: AdminGovernanceAuthorizationInspectionViewSchema,
  },
  {
    name: "AdminGovernanceWriteAuthorizationTupleResponse",
    schema: AdminGovernanceWriteAuthorizationTupleResponseSchema,
  },
  {
    name: "SubmitRuntimeConfigOverrideProposalResponse",
    schema: AdminGovernanceSubmitRuntimeConfigOverrideProposalResponseSchema,
  },
  {
    name: "ReviewRuntimeConfigProposalResponse",
    schema: AdminGovernanceReviewRuntimeConfigProposalResponseSchema,
  },
  {
    name: "UpsertRetentionPolicyBySessionRequest",
    schema: UpsertRetentionPolicyBySessionRequestBodySchema,
  },
  {
    name: "ListRetentionPoliciesBySessionRequest",
    schema: ListRetentionPoliciesBySessionRequestBodySchema,
  },
  {
    name: "PlaceRetentionLegalHoldBySessionRequest",
    schema: PlaceRetentionLegalHoldBySessionRequestBodySchema,
  },
  {
    name: "ReleaseRetentionLegalHoldBySessionRequest",
    schema: ReleaseRetentionLegalHoldBySessionRequestBodySchema,
  },
  {
    name: "ListRetentionLegalHoldsBySessionRequest",
    schema: ListRetentionLegalHoldsBySessionRequestBodySchema,
  },
  {
    name: "RetentionPolicyAdminView",
    schema: RetentionPolicyAdminViewSchema,
  },
  {
    name: "RetentionPolicyAdminViewList",
    schema: RetentionPolicyAdminViewListSchema,
  },
  {
    name: "RetentionLegalHoldComplianceView",
    schema: RetentionLegalHoldComplianceViewSchema,
  },
  {
    name: "RetentionLegalHoldComplianceViewList",
    schema: RetentionLegalHoldComplianceViewListSchema,
  },
  {
    name: "SupportOperationsStartImpersonationRequest",
    schema: SupportOperationsStartImpersonationRequestBodySchema,
  },
  {
    name: "SupportOperationsUpsertCaseRequest",
    schema: SupportOperationsUpsertCaseRequestBodySchema,
  },
  {
    name: "SupportOperationsCaseSupportView",
    schema: SupportOperationsCaseSupportViewSchema,
  },
  {
    name: "SupportOperationsCaseSupportViewList",
    schema: SupportOperationsCaseSupportViewListSchema,
  },
  {
    name: "SupportOperationsTenantHealthView",
    schema: SupportOperationsTenantHealthViewSchema,
  },
  {
    name: "SupportOperationsListCasesRequest",
    schema: SupportOperationsListCasesRequestBodySchema,
  },
  {
    name: "SupportOperationsGetTenantHealthRequest",
    schema: SupportOperationsGetTenantHealthRequestBodySchema,
  },
  {
    name: "SupportImpersonationGrant",
    schema: SupportImpersonationGrantSchema,
  },
  {
    name: "SupportOperationsListImpersonationSessionsRequest",
    schema: SupportOperationsListImpersonationSessionsRequestBodySchema,
  },
  {
    name: "SupportOperationsRevokeImpersonationSessionRequest",
    schema: SupportOperationsRevokeImpersonationSessionRequestBodySchema,
  },
  {
    name: "SupportOperationsImpersonationSessionSupportView",
    schema: SupportOperationsImpersonationSessionSupportViewSchema,
  },
  {
    name: "SupportOperationsImpersonationSessionSupportViewList",
    schema: SupportOperationsImpersonationSessionSupportViewListSchema,
  },
  {
    name: "SupportOperationsGrantBreakGlassRequest",
    schema: SupportOperationsGrantBreakGlassRequestBodySchema,
  },
  {
    name: "BreakGlassGrant",
    schema: BreakGlassGrantSchema,
  },
  {
    name: "SupportOperationsListBreakGlassIncidentsRequest",
    schema: SupportOperationsListBreakGlassIncidentsRequestBodySchema,
  },
  {
    name: "SupportOperationsReviewBreakGlassIncidentRequest",
    schema: SupportOperationsReviewBreakGlassIncidentRequestBodySchema,
  },
  {
    name: "SupportOperationsBreakGlassIncidentSupportView",
    schema: SupportOperationsBreakGlassIncidentSupportViewSchema,
  },
  {
    name: "SupportOperationsBreakGlassIncidentSupportViewList",
    schema: SupportOperationsBreakGlassIncidentSupportViewListSchema,
  },
  {
    name: "RequestManagedFileUploadUrlHttpRequest",
    schema: RequestManagedFileUploadUrlHttpRequestSchema,
  },
  {
    name: "RegisterManagedFileHttpRequest",
    schema: RegisterManagedFileHttpRequestSchema,
  },
  {
    name: "ListManagedFilesHttpRequest",
    schema: ListManagedFilesHttpRequestSchema,
  },
  {
    name: "ManagedFileLookupHttpRequest",
    schema: ManagedFileLookupHttpRequestSchema,
  },
  {
    name: "ManagedFileUploadUrl",
    schema: ManagedFileUploadUrlSchema,
  },
  {
    name: "ManagedFileSummaryView",
    schema: ManagedFileSummaryViewSchema,
  },
  {
    name: "ManagedFileSummaryViewList",
    schema: ManagedFileSummaryViewListSchema,
  },
  {
    name: "ManagedFileDownloadDescriptor",
    schema: ManagedFileDownloadDescriptorSchema,
  },
  {
    name: "RequestManagedFileSummaryExportHttpRequest",
    schema: RequestManagedFileSummaryExportHttpRequestSchema,
  },
  {
    name: "GetImportExportJobHttpRequest",
    schema: GetImportExportJobHttpRequestSchema,
  },
  {
    name: "RequestSupportCaseSummaryExportHttpRequest",
    schema: RequestSupportCaseSummaryExportHttpRequestSchema,
  },
  {
    name: "ImportExportJobAdminView",
    schema: ImportExportJobAdminViewSchema,
  },
  {
    name: "EnsureSearchTenantIndexHttpRequest",
    schema: EnsureSearchTenantIndexHttpRequestSchema,
  },
  {
    name: "RequestSearchTenantIndexEnsureWorkflowJobHttpRequest",
    schema: RequestSearchTenantIndexEnsureWorkflowJobHttpRequestSchema,
  },
  {
    name: "RequestSearchTenantIndexReindexWorkflowJobHttpRequest",
    schema: RequestSearchTenantIndexReindexWorkflowJobHttpRequestSchema,
  },
  {
    name: "SearchTenantIndexLookupHttpRequest",
    schema: SearchTenantIndexLookupHttpRequestSchema,
  },
  {
    name: "SearchTenantIndexSummaryView",
    schema: SearchTenantIndexSummaryViewSchema,
  },
  {
    name: "SearchTenantIndexRecord",
    schema: SearchTenantIndexRecordSchema,
  },
  {
    name: "SearchTenantIndexRecordList",
    schema: SearchTenantIndexRecordListSchema,
  },
  {
    name: "SearchTenantIndexDeletionReceipt",
    schema: SearchTenantIndexDeletionReceiptSchema,
  },
  {
    name: "QuerySearchManagedFilesHttpRequest",
    schema: QuerySearchManagedFilesHttpRequestSchema,
  },
  {
    name: "QuerySearchSupportCasesHttpRequest",
    schema: QuerySearchSupportCasesHttpRequestSchema,
  },
  {
    name: "QueryCurrentTenantSearchManagedFilesHttpRequest",
    schema: QueryCurrentTenantSearchManagedFilesHttpRequestSchema,
  },
  {
    name: "SearchManagedFileQueryResult",
    schema: SearchManagedFileQueryResultSchema,
  },
  {
    name: "SearchSupportCaseQueryResult",
    schema: SearchSupportCaseQueryResultSchema,
  },
  {
    name: "WorkflowJobSummary",
    schema: WorkflowJobSummarySchema,
  },
  {
    name: "RequestCustomDomainVerificationHttpRequest",
    schema: RequestCustomDomainVerificationHttpRequestBodySchema,
  },
  {
    name: "TransitionCustomDomainVerificationHttpRequest",
    schema: TransitionCustomDomainVerificationHttpRequestBodySchema,
  },
  {
    name: "PublishTenantBrandingAssetHttpRequest",
    schema: PublishTenantBrandingAssetHttpRequestBodySchema,
  },
  {
    name: "CustomDomainVerificationAdminView",
    schema: CustomDomainVerificationAdminViewSchema,
  },
  {
    name: "TenantBrandingPublishedAssetReferenceView",
    schema: TenantBrandingPublishedAssetReferenceViewSchema,
  },
  {
    name: "TenantBrandingSupportSafeView",
    schema: TenantBrandingSupportSafeViewSchema,
  },
  {
    name: "BillingWebhookReplayRequest",
    schema: BillingWebhookReplayRequestSchema,
  },
  {
    name: "InspectEmailDeliveryTrackingBySessionRequest",
    schema: InspectEmailDeliveryTrackingBySessionRequestBodySchema,
  },
  {
    name: "InspectEmailRecipientSuppressionBySessionRequest",
    schema: InspectEmailRecipientSuppressionBySessionRequestBodySchema,
  },
  {
    name: "InspectNotificationCenterEmailReceiptBySessionRequest",
    schema: InspectNotificationCenterEmailReceiptBySessionRequestBodySchema,
  },
  {
    name: "InspectNotificationCenterInAppNotificationBySessionRequest",
    schema:
      InspectNotificationCenterInAppNotificationBySessionRequestBodySchema,
  },
  {
    name: "InspectNotificationCenterEmailPreferenceBySessionRequest",
    schema: InspectNotificationCenterEmailPreferenceBySessionRequestBodySchema,
  },
  {
    name: "UpsertNotificationCenterEmailPreferenceBySessionRequest",
    schema: UpsertNotificationCenterEmailPreferenceBySessionRequestBodySchema,
  },
  {
    name: "EmailDeliveryTrackingAdminView",
    schema: EmailDeliveryTrackingAdminViewSchema,
  },
  {
    name: "EmailRecipientSuppressionAdminView",
    schema: EmailRecipientSuppressionAdminViewSchema,
  },
  {
    name: "NotificationCenterEmailReceiptAdminView",
    schema: NotificationCenterEmailReceiptAdminViewSchema,
  },
  {
    name: "NotificationCenterInAppNotificationAdminView",
    schema: NotificationCenterInAppNotificationAdminViewSchema,
  },
  {
    name: "NotificationCenterEmailPreferenceAdminView",
    schema: NotificationCenterEmailPreferenceAdminViewSchema,
  },
  {
    name: "CreateWebhookSubscriptionBySessionRequest",
    schema: CreateWebhookSubscriptionBySessionRequestBodySchema,
  },
  {
    name: "CreateWebhookApiKeyBySessionRequest",
    schema: CreateWebhookApiKeyBySessionRequestBodySchema,
  },
  {
    name: "ListWebhookSubscriptionsBySessionRequest",
    schema: ListWebhookSubscriptionsBySessionRequestBodySchema,
  },
  {
    name: "ListWebhookApiKeysBySessionRequest",
    schema: ListWebhookApiKeysBySessionRequestBodySchema,
  },
  {
    name: "RequestWebhookOutboundDeliveryBySessionRequest",
    schema: RequestWebhookOutboundDeliveryBySessionRequestBodySchema,
  },
  {
    name: "RotateWebhookApiKeyBySessionRequest",
    schema: RotateWebhookApiKeyBySessionRequestBodySchema,
  },
  {
    name: "RevokeWebhookApiKeyBySessionRequest",
    schema: RevokeWebhookApiKeyBySessionRequestBodySchema,
  },
  {
    name: "WebhookApiKeyAdminView",
    schema: WebhookApiKeyAdminViewSchema,
  },
  {
    name: "WebhookApiKeyAdminViewList",
    schema: WebhookApiKeyAdminViewListSchema,
  },
  {
    name: "WebhookApiKeyOneTimeSecretResult",
    schema: WebhookApiKeyOneTimeSecretResultSchema,
  },
  {
    name: "WebhookSubscriptionAdminView",
    schema: WebhookSubscriptionAdminViewSchema,
  },
  {
    name: "WebhookSubscriptionAdminViewList",
    schema: WebhookSubscriptionAdminViewListSchema,
  },
  {
    name: "WebhookIgnoredResponse",
    schema: WebhookIgnoredResponseSchema,
  },
  {
    name: "WebhookProcessingResponse",
    schema: BillingWebhookProcessingResultSchema,
  },
  {
    name: "RawWebhookPayload",
    schema: RawWebhookPayloadSchema,
  },
] satisfies readonly DocumentSchemaSource[];

const typedDocumentSchemas: readonly DocumentSchemaSource[] =
  backendApiDocumentSchemas;

const ref = (schemaName: string): OpenApiSchema => ({
  $ref: `#/components/schemas/${schemaName}`,
});

const jsonResponse = (
  schema: OpenApiSchema,
  description: string,
): OpenApiResponse => ({
  description,
  content: {
    "application/json": {
      schema,
    },
  },
});

const errorResponse = (description: string): OpenApiResponse =>
  jsonResponse(ref("ErrorResponse"), description);

const jsonRequestBody = (
  schemaName: string,
  description?: string,
): NonNullable<OpenApiOperation["requestBody"]> => ({
  required: true,
  ...(description !== undefined ? { description } : {}),
  content: {
    "application/json": {
      schema: ref(schemaName),
    },
  },
});

const normalizeOpenApiSchema = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeOpenApiSchema(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "$schema" && key !== "$defs")
        .map(([key, entry]) => [
          key,
          key === "$ref" && typeof entry === "string"
            ? entry.replace("#/$defs/", "#/components/schemas/")
            : normalizeOpenApiSchema(entry),
        ]),
    );
  }

  return value;
};

type OpenApiSchemaComponentConflictError = {
  readonly _tag: "OpenApiSchemaComponentConflictError";
  readonly name: string;
};

const registerComponentSchema = (
  schemas: Record<string, OpenApiSchema>,
  name: string,
  schema: OpenApiSchema,
): Effect.Effect<void, OpenApiSchemaComponentConflictError> => {
  const existingSchema = schemas[name];

  if (existingSchema === undefined) {
    return Effect.sync(() => {
      schemas[name] = schema;
    });
  }

  return JSON.stringify(existingSchema) === JSON.stringify(schema)
    ? Effect.void
    : Effect.fail({
        _tag: "OpenApiSchemaComponentConflictError",
        name,
      } satisfies OpenApiSchemaComponentConflictError);
};

const fileSizeBytesOpenApiSchema = {
  type: "integer",
  minimum: 1,
} as const satisfies OpenApiSchema;

const isoTimestampOpenApiSchema = {
  type: "string",
  format: "date-time",
} as const satisfies OpenApiSchema;

const overridePropertySchema = (
  schema: OpenApiSchema | undefined,
  propertyName: string,
  propertySchema: OpenApiSchema,
) => {
  const properties = schema?.properties;

  if (
    properties === undefined ||
    typeof properties !== "object" ||
    properties === null
  ) {
    return;
  }

  (properties as Record<string, unknown>)[propertyName] = propertySchema;
};

const applyManagedFileSummarySchemaOverrides = (
  schema: OpenApiSchema | undefined,
) => {
  overridePropertySchema(schema, "sizeBytes", fileSizeBytesOpenApiSchema);
  overridePropertySchema(schema, "deletedAt", isoTimestampOpenApiSchema);
};

const applyFileStorageByteCountSchemaOverrides = (
  schemas: Record<string, OpenApiSchema>,
) => {
  overridePropertySchema(
    schemas.RequestManagedFileUploadUrlHttpRequest,
    "sizeBytes",
    fileSizeBytesOpenApiSchema,
  );
  overridePropertySchema(
    schemas.RegisterManagedFileHttpRequest,
    "sizeBytes",
    fileSizeBytesOpenApiSchema,
  );
  applyManagedFileSummarySchemaOverrides(schemas.ManagedFileSummaryView);

  const managedFileSummaryViewListItems =
    schemas.ManagedFileSummaryViewList?.items;

  if (
    managedFileSummaryViewListItems !== undefined &&
    typeof managedFileSummaryViewListItems === "object" &&
    managedFileSummaryViewListItems !== null
  ) {
    applyManagedFileSummarySchemaOverrides(
      managedFileSummaryViewListItems as OpenApiSchema,
    );
  }

  const downloadDescriptorProperties =
    schemas.ManagedFileDownloadDescriptor?.properties;

  if (
    downloadDescriptorProperties === undefined ||
    typeof downloadDescriptorProperties !== "object" ||
    downloadDescriptorProperties === null
  ) {
    return;
  }

  const fileSchema = (downloadDescriptorProperties as Record<string, unknown>)
    .file;

  if (
    fileSchema === undefined ||
    typeof fileSchema !== "object" ||
    fileSchema === null
  ) {
    return;
  }

  applyManagedFileSummarySchemaOverrides(fileSchema as OpenApiSchema);
};

const applyAdminGovernanceSchemaOverrides = (
  schemas: Record<string, OpenApiSchema>,
) => {
  const exportRequestProperties =
    schemas.AdminGovernanceExportAuditEventsRequest?.properties;

  if (
    exportRequestProperties === undefined ||
    typeof exportRequestProperties !== "object" ||
    exportRequestProperties === null
  ) {
    return;
  }

  const filterSchema = (exportRequestProperties as Record<string, unknown>)
    .filter;

  if (
    filterSchema === undefined ||
    typeof filterSchema !== "object" ||
    filterSchema === null ||
    Array.isArray(filterSchema)
  ) {
    return;
  }

  overridePropertySchema(
    filterSchema as OpenApiSchema,
    "recordedBefore",
    isoTimestampOpenApiSchema,
  );
};

const createBackendApiSchemaComponents = (): Readonly<
  Record<string, OpenApiSchema>
> =>
  Effect.runSync(
    Effect.gen(function* () {
      const schemas: Record<string, OpenApiSchema> = {};

      for (const source of typedDocumentSchemas) {
        const jsonSchema = makeJsonSchema(source.schema);

        const definitions = jsonSchema.$defs;

        if (definitions !== undefined && definitions !== null) {
          for (const [definitionName, definitionSchema] of Object.entries(
            definitions as Record<string, unknown>,
          )) {
            yield* registerComponentSchema(
              schemas,
              definitionName,
              normalizeOpenApiSchema(definitionSchema) as OpenApiSchema,
            );
          }
        }

        yield* registerComponentSchema(
          schemas,
          source.name,
          normalizeOpenApiSchema(jsonSchema) as OpenApiSchema,
        );
      }

      // ProductBootstrapResult is a composite of separately-registered component
      // schemas. Registering it via refs avoids a circular-dependency issue between
      // @comvestec/platform and @comvestec/modules at module evaluation time.
      yield* registerComponentSchema(schemas, "ProductBootstrapResult", {
        type: "object",
        required: ["requestContext", "authorization"],
        properties: {
          requestContext: { $ref: "#/components/schemas/RequestContext" },
          snapshot: { $ref: "#/components/schemas/ProductAppSnapshot" },
          authorization: {
            $ref: "#/components/schemas/AuthorizationDecision",
          },
          billingStatus: {
            $ref: "#/components/schemas/ProductBootstrapBillingStatus",
          },
          enabledModules: {
            type: "array",
            items: { $ref: "#/components/schemas/PlatformModuleId" },
          },
        },
        additionalProperties: false,
      });

      applyFileStorageByteCountSchemaOverrides(schemas);
      applyAdminGovernanceSchemaOverrides(schemas);

      return schemas;
    }).pipe(
      Effect.mapError(
        (error: OpenApiSchemaComponentConflictError) =>
          new Error(`OpenAPI schema component conflict for ${error.name}.`),
      ),
    ),
  );

const nonEmptyHeaderSchema = {
  type: "string",
  minLength: 1,
} as const satisfies OpenApiSchema;

const nonEmptyQuerySchema = {
  type: "string",
  minLength: 1,
} as const satisfies OpenApiSchema;

const subscriberJourneySessionHeaderParameter = {
  name: subscriberJourneySessionHeaderName,
  in: "header",
  required: true,
  description: "Authenticated session identifier.",
  schema: nonEmptyHeaderSchema,
} as const satisfies OpenApiParameter;

export const createBackendApiOpenApiDocument = (
  serverUrl: string,
): BackendApiOpenApiDocument => ({
  openapi: "3.1.0",
  info: {
    title: "Comvestec Backend API",
    version: "0.0.0",
    description:
      "Backend-owned HTTP surface for the Comvestec SaaS foundation. First-party apps primarily call shared backend services directly; this OpenAPI document is generated from the Effect schemas that define the standalone H3 transport boundary.",
  },
  servers: [
    {
      url: serverUrl,
      description: "Active backend API origin",
    },
  ],
  tags: [
    {
      name: "health",
      description:
        "Backend liveness and route-critical adapter readiness probes.",
    },
    {
      name: "subscriber-journey",
      description:
        "Acquisition, authentication, request-context, and product-bootstrap routes.",
    },
    {
      name: "admin-billing",
      description: "Operator billing plan management routes.",
    },
    {
      name: "admin-tenant-management",
      description:
        "Operator tenant onboarding review routes over durable tenant state.",
    },
    {
      name: "tenant-branding",
      description:
        "Operator tenant-branding routes over durable custom-domain verification state.",
    },
    {
      name: "tenant-management",
      description:
        "Authenticated tenant invitation redemption routes over durable invitation state.",
    },
    {
      name: "admin-governance",
      description:
        "Runtime-config and audit-governance routes intended for internal operator workflows.",
    },
    {
      name: "retention-legal-hold",
      description:
        "Retention policy and legal-hold operator routes for governance workflows.",
    },
    {
      name: "support-operations",
      description:
        "Support-operator impersonation, break-glass, and break-glass review routes.",
    },
    {
      name: "file-storage",
      description:
        "Managed-file upload, registration, listing, download-resolution, and deletion routes.",
    },
    {
      name: "import-export",
      description:
        "Operator-only managed-file export request and job inspection routes.",
    },
    {
      name: "search",
      description: "Tenant-scoped search lifecycle management routes.",
    },
    {
      name: "email-delivery",
      description:
        "Operator email-delivery tracking and recipient-suppression inspection routes.",
    },
    {
      name: "webhooks",
      description: "Billing provider webhook verification and replay routes.",
    },
  ],
  paths: {
    [backendApiHealthPath.live]: {
      get: {
        tags: ["health"],
        summary: "Probe backend liveness",
        description:
          "Returns a lightweight liveness response for the backend-owned HTTP surface.",
        responses: {
          "200": jsonResponse(
            ref("BackendApiLivenessResponse"),
            "Backend API process is live.",
          ),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Backend API request failed."),
        },
      },
    },
    [backendApiHealthPath.ready]: {
      get: {
        tags: ["health"],
        summary: "Probe backend readiness",
        description:
          "Runs route-critical adapter healthchecks for the backend-owned HTTP surface and returns 503 when any readiness check fails or cannot be initialized.",
        responses: {
          "200": jsonResponse(
            ref("BackendApiReadinessResponse"),
            "All backend readiness checks passed.",
          ),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Backend API request failed."),
          "503": jsonResponse(
            ref("BackendApiReadinessResponse"),
            "At least one backend readiness check failed or the readiness probes could not be initialized.",
          ),
        },
      },
    },
    [subscriberJourneyApiPath.listPublicPlans]: {
      get: {
        tags: ["subscriber-journey"],
        summary: "List public billing plans",
        description:
          "Returns the publicly visible billing plan catalog for acquisition flows.",
        responses: {
          "200": jsonResponse(
            ref("PublicBillingPlanCatalogResponse"),
            "Public billing plan catalog.",
          ),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.startAuthentication]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Start authentication",
        description:
          "Begins a first-party authentication flow and returns a Keycloak redirect payload.",
        requestBody: jsonRequestBody("StartAuthenticationRequest"),
        responses: {
          "202": jsonResponse(
            ref("StartAuthenticationResponse"),
            "Authentication redirect created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authentication failed."),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.completeAuthentication]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Complete authentication",
        description:
          "Completes the first-party auth callback flow using a signed callback state and a Keycloak session input.",
        requestBody: jsonRequestBody("CompleteAuthenticationRequest"),
        responses: {
          "202": jsonResponse(
            ref("CompleteAuthenticationResponse"),
            "Authentication completed and onboarding or provisioning state returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authentication or callback-state validation failed.",
          ),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.resolveRequestContext]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Resolve request context",
        description:
          "Looks up the effective request context for a previously established session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        responses: {
          "200": jsonResponse(
            ref("ResolveRequestContextResponse"),
            "Resolved request context.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.createCheckoutSession]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Create hosted checkout session",
        description:
          "Creates a Polar hosted checkout session for an entitled tenant scope.",
        requestBody: jsonRequestBody("BillingCheckoutSessionInput"),
        responses: {
          "202": jsonResponse(
            ref("BillingCheckoutSession"),
            "Hosted checkout session created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.buildProductBootstrap]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Build product bootstrap",
        description:
          "Builds the route-owned product bootstrap payload for an authenticated session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        responses: {
          "200": jsonResponse(
            ref("ProductBootstrapResult"),
            "Product bootstrap payload.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.createManagedPlan]: {
      post: {
        tags: ["admin-billing"],
        summary: "Create managed billing plan",
        description:
          "Creates a managed recurring plan in the billing provider for operator workflows.",
        parameters: [
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
        ],
        requestBody: jsonRequestBody("CreateManagedBillingPlanRequest"),
        responses: {
          "202": jsonResponse(
            ref("BillingPlanCreateResponse"),
            "Managed billing plan created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Billing plan management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.inspectBillingState]: {
      post: {
        tags: ["admin-billing"],
        summary: "Inspect billing state",
        description:
          "Projects the current billing summary and optional invoice history for a tenant through the billing admin profile.",
        parameters: [
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
        ],
        requestBody: jsonRequestBody("AdminBillingExplanationRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminBillingExplanationResponse"),
            "Projected billing explanation for the requested tenant.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Billing state inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.listRepairGaps]: {
      get: {
        tags: ["admin-billing"],
        summary: "List billing repair gaps",
        description:
          "Lists unresolved scheduled, blocked, and stale running billing repair gaps for platform operators.",
        parameters: [
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
          {
            name: "inspectionReason",
            in: "query",
            required: false,
            description:
              "Optional operator-supplied reason used when requesting unredacted repair-gap failure details.",
            schema: nonEmptyQuerySchema,
          },
        ],
        responses: {
          "200": jsonResponse(
            ref("BillingRepairGapListResponse"),
            "Unresolved billing repair gaps.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Billing repair gap inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [workflowJobsApiPath.listRepairGaps]: {
      get: {
        tags: ["workflow-jobs"],
        summary: "List workflow repair gaps",
        description:
          "Lists unresolved scheduled, blocked, and stale running workflow repair gaps for a requested source module.",
        parameters: [
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
          {
            name: "sourceModuleId",
            in: "query",
            required: true,
            description:
              "Module owner whose unresolved workflow repair gaps should be listed.",
            schema: ref("PlatformModuleId"),
          },
          {
            name: "inspectionReason",
            in: "query",
            required: false,
            description:
              "Optional operator-supplied reason used when requesting unredacted repair-gap failure details.",
            schema: nonEmptyQuerySchema,
          },
        ],
        responses: {
          "200": jsonResponse(
            ref("WorkflowJobRepairGapListResponse"),
            "Unresolved workflow repair gaps for the requested module.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Workflow job repair-gap inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Workflow job request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [workflowJobsApiPath.cancelRepairGap]: {
      post: {
        tags: ["workflow-jobs"],
        summary: "Cancel workflow repair gap",
        description:
          "Cancels an unresolved workflow repair gap and attempts to cancel any scheduled Convex follow-up dispatches for the current job identity.",
        parameters: [
          {
            name: "authorization",
            in: "header",
            required: true,
            description:
              "Bearer Keycloak ID token for the initiating operator. Format: Bearer <token>.",
            schema: nonEmptyHeaderSchema,
          },
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
        ],
        requestBody: jsonRequestBody("CancelWorkflowJobRepairGapRequest"),
        responses: {
          "200": jsonResponse(
            ref("WorkflowJobRepairGapCancelResponse"),
            "Canceled or already-canceled workflow repair gap.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authenticated operator session and Keycloak bearer token are required.",
          ),
          "403": errorResponse(
            "Workflow repair-gap cancellation is not allowed for this session, or operator identity and workflow token provenance did not match.",
          ),
          "404": errorResponse(
            "Requested workflow repair gap was not found, or the authenticated operator session could not be resolved.",
          ),
          "405": errorResponse("Method not allowed."),
          "409": errorResponse(
            "Workflow repair gap is no longer eligible for cancellation.",
          ),
          "500": errorResponse("Workflow job request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [workflowJobsApiPath.replayRepairGap]: {
      post: {
        tags: ["workflow-jobs"],
        summary: "Replay workflow repair gap",
        description:
          "Replays an unresolved workflow repair gap for a specific workflow job through an authenticated Convex execution.",
        parameters: [
          {
            name: "authorization",
            in: "header",
            required: true,
            description:
              "Bearer Keycloak ID token for the initiating operator. Format: Bearer <token>.",
            schema: nonEmptyHeaderSchema,
          },
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
        ],
        requestBody: jsonRequestBody("ReplayWorkflowJobRepairGapRequest"),
        responses: {
          "200": jsonResponse(
            ref("WorkflowJobRepairGapReplayResponse"),
            "Workflow repair gap replay accepted and current row state returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authenticated operator session and Keycloak bearer token are required.",
          ),
          "403": errorResponse(
            "Workflow repair-gap replay is not allowed for this session, or operator identity and workflow token provenance did not match.",
          ),
          "404": errorResponse(
            "Requested workflow repair gap was not found, or the authenticated operator session could not be resolved.",
          ),
          "405": errorResponse("Method not allowed."),
          "409": errorResponse(
            "Workflow repair gap is no longer eligible for replay.",
          ),
          "500": errorResponse("Workflow job request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.replayRepairGap]: {
      post: {
        tags: ["admin-billing"],
        summary: "Replay billing repair gap",
        description:
          "Replays an unresolved billing repair gap for a specific workflow job through an authenticated Convex execution.",
        parameters: [
          {
            name: "authorization",
            in: "header",
            required: true,
            description:
              "Bearer Keycloak ID token for the initiating operator. Format: Bearer <token>.",
            schema: nonEmptyHeaderSchema,
          },
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
        ],
        requestBody: jsonRequestBody("ReplayBillingRepairGapRequest"),
        responses: {
          "200": jsonResponse(
            ref("BillingRepairGapReplayResponse"),
            "Billing repair gap replay completed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authenticated operator session and a Keycloak bearer token accepted for Convex execution are required for repair replay execution.",
          ),
          "403": errorResponse(
            "Billing repair replay requires authorized platform-operator access and a decodable Convex token whose subject matches the operator session.",
          ),
          "404": errorResponse("Requested billing repair gap was not found."),
          "405": errorResponse("Method not allowed."),
          "409": errorResponse(
            "Billing repair gap is no longer eligible for replay.",
          ),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.cancelRepairGap]: {
      post: {
        tags: ["admin-billing"],
        summary: "Cancel billing repair gap",
        description:
          "Cancels an unresolved billing repair gap for a specific workflow job without replaying it through Convex execution.",
        parameters: [
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
        ],
        requestBody: jsonRequestBody("CancelBillingRepairGapRequest"),
        responses: {
          "200": jsonResponse(
            ref("BillingRepairGapCancelResponse"),
            "Billing repair gap canceled.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Billing repair gap cancellation is not allowed for this session.",
          ),
          "404": errorResponse("Requested billing repair gap was not found."),
          "405": errorResponse("Method not allowed."),
          "409": errorResponse(
            "Billing repair gap is no longer eligible for cancellation.",
          ),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.runManualReconciliation]: {
      post: {
        tags: ["admin-billing"],
        summary: "Run billing reconciliation now",
        description:
          "Runs the due billing reconciliation sweep immediately through an authenticated Convex action and returns the workflow jobs that were processed.",
        parameters: [
          {
            name: "authorization",
            in: "header",
            required: true,
            description:
              "Bearer Keycloak ID token for the initiating operator. Format: Bearer <token>.",
            schema: nonEmptyHeaderSchema,
          },
          {
            ...subscriberJourneySessionHeaderParameter,
            description: "Authenticated operator session identifier.",
          },
        ],
        requestBody: jsonRequestBody("RunManualBillingReconciliationRequest"),
        responses: {
          "200": jsonResponse(
            ref("BillingReconciliationManualRunResponse"),
            "Authenticated billing reconciliation run completed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authenticated operator session and Keycloak bearer token are required.",
          ),
          "403": errorResponse(
            "Manual billing reconciliation is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantManagementApiPath.queryMemberships]: {
      post: {
        tags: ["admin-tenant-management"],
        summary: "Query current tenant memberships",
        description:
          "Returns the current tenant membership relations for the requested tenant when the caller is an authorized platform operator.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("QueryTenantMembershipsRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminTenantMembershipQueryResponse"),
            "Tenant membership inspection view.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin tenant management requests require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Tenant membership inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin tenant management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantManagementApiPath.queryInvitations]: {
      post: {
        tags: ["admin-tenant-management"],
        summary: "Query tenant invitation records",
        description:
          "Returns durable tenant invitation records for the requested tenant when the caller is an authorized platform operator.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("QueryTenantInvitationsRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminTenantInvitationQueryResponse"),
            "Tenant invitation inspection view.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin tenant management requests require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Tenant invitation inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin tenant management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantManagementApiPath.mutateMembership]: {
      post: {
        tags: ["admin-tenant-management"],
        summary: "Mutate tenant membership relation",
        description:
          "Grants or revokes a direct tenant membership relation for the requested subject when the caller is an authorized platform operator.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("MutateTenantMembershipRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminTenantMembershipMutationResponse"),
            "Tenant membership mutation applied.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin tenant management requests require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Tenant membership mutation is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin tenant management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantManagementApiPath.issueInvitation]: {
      post: {
        tags: ["admin-tenant-management"],
        summary: "Issue tenant invitation record",
        description:
          "Creates a durable tenant invitation record with runtime-config-backed expiry when the caller is an authorized platform operator.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("IssueTenantInvitationRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminTenantInvitationIssueResponse"),
            "Tenant invitation record created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin tenant management requests require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Tenant invitation issuance is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin tenant management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantManagementApiPath.revokeInvitation]: {
      post: {
        tags: ["admin-tenant-management"],
        summary: "Revoke tenant invitation record",
        description:
          "Revokes a durable tenant invitation record for the requested tenant when the caller is an authorized platform operator.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("RevokeTenantInvitationRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminTenantInvitationRevokeResponse"),
            "Tenant invitation record updated.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin tenant management requests require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Tenant invitation revocation is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin tenant management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [tenantInvitationRedemptionApiPath.redeem]: {
      post: {
        tags: ["tenant-management"],
        summary: "Redeem tenant invitation token",
        description:
          "Consumes a previously issued tenant invitation token for the authenticated actor and grants the invited tenant relation once.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("RedeemTenantInvitationRequest"),
        responses: {
          "200": jsonResponse(
            ref("RedeemTenantInvitationResponse"),
            "Tenant invitation token redeemed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Tenant invitation redemption requires a valid authenticated session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Tenant invitation redemption request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantManagementApiPath.reviewOnboarding]: {
      post: {
        tags: ["admin-tenant-management"],
        summary: "Review current tenant onboarding state",
        description:
          "Returns the current durable onboarding state for the requested tenant when the caller is an authorized platform operator.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ReviewTenantOnboardingRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminTenantOnboardingReviewResponse"),
            "Tenant onboarding review state.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin tenant management requests require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Tenant onboarding review is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin tenant management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.listRuntimeConfigOverrides]: {
      post: {
        tags: ["admin-governance"],
        summary: "List runtime-config overrides",
        description:
          "Lists persisted runtime-config overrides for a module. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("AdminGovernanceReadBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceRuntimeConfigOverrideViewList"),
            "Persisted runtime-config overrides.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.listFeatureFlags]: {
      post: {
        tags: ["admin-governance"],
        summary: "List effective feature flags",
        description:
          "Lists effective feature-flag state for a module in the caller's tenant context. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("AdminGovernanceReadBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceFeatureFlagViewList"),
            "Effective feature flags for the requested module.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.inspectAuthorization]: {
      post: {
        tags: ["admin-governance"],
        summary: "Inspect authorization decision",
        description:
          "Evaluates and projects an authorization decision for an operator-supplied request context. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "AdminGovernanceInspectAuthorizationRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceAuthorizationInspectionView"),
            "Projected authorization inspection result.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.writeAuthorizationTuple]: {
      post: {
        tags: ["admin-governance"],
        summary: "Write authorization tuple",
        description:
          "Writes a delegated authorization tuple through the Ory-managed relation path and returns the projected tuple plus audit event. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "AdminGovernanceWriteAuthorizationTupleRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceWriteAuthorizationTupleResponse"),
            "Authorization tuple mutation recorded.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance mutations require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance mutations are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.submitRuntimeConfigOverrideProposal]: {
      post: {
        tags: ["admin-governance"],
        summary: "Submit runtime config override proposal",
        description:
          "Creates or updates a pending runtime-config override proposal and records the governance audit event.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "SubmitRuntimeConfigOverrideProposalRequest",
        ),
        responses: {
          "202": jsonResponse(
            ref("SubmitRuntimeConfigOverrideProposalResponse"),
            "Runtime config override proposal submission result.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance mutations require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance mutations are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.persistRuntimeConfigProposals]: {
      post: {
        tags: ["admin-governance"],
        summary: "Persist runtime-config proposals",
        description:
          "Persists code-to-runtime proposal artifacts for a module. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("PersistRuntimeConfigProposalsRequest"),
        responses: {
          "202": jsonResponse(
            ref("AdminGovernanceRuntimeConfigProposalViewList"),
            "Persisted runtime-config proposal artifacts.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance mutations require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance mutations are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.reviewRuntimeConfigProposal]: {
      post: {
        tags: ["admin-governance"],
        summary: "Review runtime-config proposal",
        description:
          "Approves or rejects a persisted runtime-config proposal and records the operator decision. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ReviewRuntimeConfigProposalRequest"),
        responses: {
          "202": jsonResponse(
            ref("ReviewRuntimeConfigProposalResponse"),
            "Runtime-config proposal review recorded.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance mutations require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance mutations are restricted to platform and support operators.",
          ),
          "409": errorResponse(
            "Runtime-config proposals can only be reviewed while pending.",
          ),
          "404": errorResponse(
            "Requested runtime-config proposal was not found.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.listRuntimeConfigProposals]: {
      post: {
        tags: ["admin-governance"],
        summary: "List runtime-config proposals",
        description:
          "Lists persisted runtime-config proposal artifacts for a module. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("AdminGovernanceReadBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceRuntimeConfigProposalViewList"),
            "Persisted runtime-config proposals.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.queryAuditEventsByModule]: {
      post: {
        tags: ["admin-governance"],
        summary: "Query audit events by module",
        description:
          "Queries audit-log events for a module. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("AdminGovernanceReadBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceAuditEventViewList"),
            "Audit events for the requested module.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.queryAuditEventsByActor]: {
      post: {
        tags: ["admin-governance"],
        summary: "Query audit events by actor",
        description:
          "Queries audit-log events for a specific actor across modules. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "AdminGovernanceQueryAuditEventsByActorRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceAuditEventViewList"),
            "Audit events for the requested actor.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.queryAuditEventsByTenant]: {
      post: {
        tags: ["admin-governance"],
        summary: "Query audit events by tenant",
        description:
          "Queries audit-log events for a tenant scope and scope id across modules. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "AdminGovernanceQueryAuditEventsByTenantRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceAuditEventViewList"),
            "Audit events for the requested tenant scope.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.queryAuditEventsByTarget]: {
      post: {
        tags: ["admin-governance"],
        summary: "Query audit events by target",
        description:
          "Queries audit-log events for a specific target inside the owning module. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "AdminGovernanceQueryAuditEventsByTargetRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceAuditEventViewList"),
            "Audit events for the requested module target.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.exportAuditEvents]: {
      post: {
        tags: ["admin-governance"],
        summary: "Export audit events",
        description:
          "Exports projected audit-log events for a filtered operator review workflow. Internal operator surface.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("AdminGovernanceExportAuditEventsRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceAuditExportView"),
            "Projected audit-log export payload.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema or failed audit-export filter validation.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminRetentionLegalHoldApiPath.upsertPolicy]: {
      post: {
        tags: ["retention-legal-hold"],
        summary: "Upsert retention policy",
        description:
          "Creates or updates the retention policy for a tenant scope and data type using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("UpsertRetentionPolicyBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("RetentionPolicyAdminView"),
            "Retention policy created or updated.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Retention management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Retention management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminRetentionLegalHoldApiPath.listPolicies]: {
      post: {
        tags: ["retention-legal-hold"],
        summary: "List retention policies",
        description:
          "Lists retention policies for a tenant scope using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ListRetentionPoliciesBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("RetentionPolicyAdminViewList"),
            "Retention policies returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Retention management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Retention management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminRetentionLegalHoldApiPath.placeLegalHold]: {
      post: {
        tags: ["retention-legal-hold"],
        summary: "Place retention legal hold",
        description:
          "Places an active legal hold for a target record using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("PlaceRetentionLegalHoldBySessionRequest"),
        responses: {
          "201": jsonResponse(
            ref("RetentionLegalHoldComplianceView"),
            "Retention legal hold created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Retention management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Legal hold already exists for this scope, data type, and target.",
          ),
          "500": errorResponse("Retention management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminRetentionLegalHoldApiPath.listLegalHolds]: {
      post: {
        tags: ["retention-legal-hold"],
        summary: "List retention legal holds",
        description:
          "Lists active and released legal holds for a tenant scope using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ListRetentionLegalHoldsBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("RetentionLegalHoldComplianceViewList"),
            "Retention legal holds returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Retention management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Retention management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminRetentionLegalHoldApiPath.releaseLegalHold]: {
      post: {
        tags: ["retention-legal-hold"],
        summary: "Release retention legal hold",
        description:
          "Releases an existing legal hold using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "ReleaseRetentionLegalHoldBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("RetentionLegalHoldComplianceView"),
            "Retention legal hold released.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Retention management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse("Legal hold is no longer eligible for release."),
          "500": errorResponse("Retention management request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.startImpersonation]: {
      post: {
        tags: ["support-operations"],
        summary: "Start support impersonation",
        description:
          "Starts a support impersonation session using an authenticated operator session. Keycloak session issuance, introspection, and compensating revocation failures surface as backend dependency errors.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "SupportOperationsStartImpersonationRequest",
        ),
        responses: {
          "201": jsonResponse(
            ref("SupportImpersonationGrant"),
            "Support impersonation session started.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.upsertCase]: {
      post: {
        tags: ["support-operations"],
        summary: "Create or update support case",
        description:
          "Creates or updates durable support-case metadata for an authenticated support operator and returns the support-safe case view.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("SupportOperationsUpsertCaseRequest"),
        responses: {
          "200": jsonResponse(
            ref("SupportOperationsCaseSupportView"),
            "Support case metadata stored.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.tenantHealth]: {
      post: {
        tags: ["support-operations"],
        summary: "Inspect tenant health",
        description:
          "Lists support-safe support-case context and unresolved billing repair-gap summaries for a requested tenant.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("SupportOperationsGetTenantHealthRequest"),
        responses: {
          "200": jsonResponse(
            ref("SupportOperationsTenantHealthView"),
            "Support-safe tenant-health summary.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.listCases]: {
      post: {
        tags: ["support-operations"],
        summary: "List support cases",
        description:
          "Lists support-safe support-case metadata for authenticated support operators. When no status is provided, only open cases are returned.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("SupportOperationsListCasesRequest"),
        responses: {
          "200": jsonResponse(
            ref("SupportOperationsCaseSupportViewList"),
            "Support-safe support-case metadata records.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.listImpersonationSessions]: {
      post: {
        tags: ["support-operations"],
        summary: "List support impersonation sessions",
        description:
          "Lists support-safe impersonation session records for authenticated support operators. Requests can filter by session status; when no status is provided, only still-active sessions are returned.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "SupportOperationsListImpersonationSessionsRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("SupportOperationsImpersonationSessionSupportViewList"),
            "Support-safe impersonation session records.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.revokeImpersonationSession]: {
      post: {
        tags: ["support-operations"],
        summary: "Revoke support impersonation session",
        description:
          "Revokes a support impersonation session, retries pending revocations against Keycloak, and returns the support-safe session view.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "SupportOperationsRevokeImpersonationSessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("SupportOperationsImpersonationSessionSupportView"),
            "Support impersonation session revoked.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Impersonation session is no longer active or has already been revoked.",
          ),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.grantBreakGlass]: {
      post: {
        tags: ["support-operations"],
        summary: "Grant support break-glass access",
        description:
          "Grants support break-glass access and creates a durable pending-review incident record.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("SupportOperationsGrantBreakGlassRequest"),
        responses: {
          "201": jsonResponse(
            ref("BreakGlassGrant"),
            "Break-glass access granted.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.listBreakGlassIncidents]: {
      post: {
        tags: ["support-operations"],
        summary: "List support break-glass incidents",
        description:
          "Lists support-safe break-glass incident records for authenticated support operators.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "SupportOperationsListBreakGlassIncidentsRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("SupportOperationsBreakGlassIncidentSupportViewList"),
            "Support-safe break-glass incident records.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminSupportOperationsApiPath.reviewBreakGlassIncident]: {
      post: {
        tags: ["support-operations"],
        summary: "Review support break-glass incident",
        description:
          "Completes post-incident review for a break-glass case and returns the support-safe incident view.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "SupportOperationsReviewBreakGlassIncidentRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("SupportOperationsBreakGlassIncidentSupportView"),
            "Break-glass incident reviewed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Support operations are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Break-glass incident has already been reviewed.",
          ),
          "500": errorResponse("Support operations request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [fileStorageApiPath.requestUploadUrl]: {
      post: {
        tags: ["file-storage"],
        summary: "Request managed-file upload URL",
        description:
          "Creates a server-issued managed-file upload reservation for an authenticated session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("RequestManagedFileUploadUrlHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("ManagedFileUploadUrl"),
            "Managed-file upload reservation created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "403": errorResponse(
            "File storage is not enabled for this scope or file access is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "413": errorResponse(
            "Requested upload exceeds the configured file-size limit.",
          ),
          "500": errorResponse("File storage request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [fileStorageApiPath.registerManagedFile]: {
      post: {
        tags: ["file-storage"],
        summary: "Register managed file",
        description:
          "Binds an uploaded blob to managed-file metadata for an authenticated session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("RegisterManagedFileHttpRequest"),
        responses: {
          "201": jsonResponse(
            ref("ManagedFileSummaryView"),
            "Managed-file metadata created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "403": errorResponse(
            "File storage is not enabled for this scope or file access is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "413": errorResponse(
            "Managed file upload exceeds the configured or reserved file-size limit.",
          ),
          "409": errorResponse(
            "Managed file upload reservation or blob state is no longer valid.",
          ),
          "500": errorResponse("File storage request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [fileStorageApiPath.listManagedFiles]: {
      post: {
        tags: ["file-storage"],
        summary: "List managed files",
        description:
          "Lists managed-file metadata for a tenant scope using an authenticated session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ListManagedFilesHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("ManagedFileSummaryViewList"),
            "Managed-file metadata returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "403": errorResponse(
            "File storage is not enabled for this scope or file access is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("File storage request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [fileStorageApiPath.resolveManagedFileDownload]: {
      post: {
        tags: ["file-storage"],
        summary: "Resolve managed-file download",
        description:
          "Resolves a managed-file download descriptor for an authenticated session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ManagedFileLookupHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("ManagedFileDownloadDescriptor"),
            "Managed-file download descriptor returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "403": errorResponse(
            "File storage is not enabled for this scope or file access is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("File storage request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [fileStorageApiPath.deleteManagedFile]: {
      post: {
        tags: ["file-storage"],
        summary: "Delete managed file",
        description:
          "Deletes a managed file when retention policy allows the operation for the authenticated session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ManagedFileLookupHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("ManagedFileSummaryView"),
            "Managed file deleted.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "403": errorResponse(
            "File storage is not enabled for this scope or file access is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Managed file deletion is blocked by retention policy.",
          ),
          "500": errorResponse("File storage request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.ensureTenantIndex]: {
      post: {
        tags: ["search"],
        summary: "Ensure tenant search index",
        description:
          "Creates or refreshes a tenant-scoped search index for an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("EnsureSearchTenantIndexHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("SearchTenantIndexSummaryView"),
            "Tenant search index ensured.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search is not enabled for this scope or search lifecycle management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.requestTenantIndexEnsureWorkflowJob]: {
      post: {
        tags: ["search"],
        summary: "Request tenant search ensure workflow job",
        description:
          "Schedules a background tenant-scoped search ensure workflow job for an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "RequestSearchTenantIndexEnsureWorkflowJobHttpRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("WorkflowJobSummary"),
            "Tenant search ensure workflow job requested.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search is not enabled for this scope or search lifecycle management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.getTenantIndexRecord]: {
      post: {
        tags: ["search"],
        summary: "Get tenant search index record",
        description:
          "Returns the durable lifecycle record for a tenant-scoped search index using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("SearchTenantIndexLookupHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("SearchTenantIndexRecord"),
            "Tenant search index lifecycle record returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search lifecycle management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.listTenantIndexRecords]: {
      post: {
        tags: ["search"],
        summary: "List tenant search index records",
        description:
          "Lists durable tenant search lifecycle records for an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("SearchTenantIndexLookupHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("SearchTenantIndexRecordList"),
            "Tenant search index lifecycle records returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search lifecycle management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.deleteTenantIndex]: {
      post: {
        tags: ["search"],
        summary: "Delete tenant search index",
        description:
          "Deletes a tenant-scoped search index for an authenticated operator session and records durable teardown evidence.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("SearchTenantIndexLookupHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("SearchTenantIndexDeletionReceipt"),
            "Tenant search index deleted.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search lifecycle management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.queryManagedFiles]: {
      post: {
        tags: ["search"],
        summary: "Preview tenant managed-file search results",
        description:
          "Runs an operator-only preview query against the tenant-scoped managed-file search projection.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("QuerySearchManagedFilesHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("SearchManagedFileQueryResult"),
            "Managed-file search preview results returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search preview queries are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.querySupportCases]: {
      post: {
        tags: ["search"],
        summary: "Preview tenant support-case search results",
        description:
          "Runs an operator-only preview query against the tenant-scoped support-case search projection with optional Meilisearch-side filters and sorting.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("QuerySearchSupportCasesHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("SearchSupportCaseQueryResult"),
            "Support-case search preview results returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search preview queries are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchApiPath.requestTenantIndexReindexWorkflowJob]: {
      post: {
        tags: ["search"],
        summary: "Request tenant search reindex workflow",
        description:
          "Schedules an operator-only tenant search reindex workflow using the durable stored index settings for the target tenant.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "RequestSearchTenantIndexReindexWorkflowJobHttpRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("WorkflowJobSummary"),
            "Tenant search reindex workflow requested.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Search is not enabled for this scope or search lifecycle management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Search tenant index settings are not available for reindex.",
          ),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [searchTenantApiPath.queryManagedFiles]: {
      post: {
        tags: ["search"],
        summary: "Query current-tenant managed-file search results",
        description:
          "Runs a tenant-session managed-file query against the current session tenant using the approved managed-file summary projection.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "QueryCurrentTenantSearchManagedFilesHttpRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("SearchManagedFileQueryResult"),
            "Managed-file search results returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated session is required."),
          "403": errorResponse(
            "Search is not enabled for this scope or tenant search queries are not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Search lifecycle request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [importExportApiPath.requestManagedFileSummaryExport]: {
      post: {
        tags: ["import-export"],
        summary: "Request managed-file summary export",
        description:
          "Schedules an operator-only tenant-scoped managed-file summary export workflow job.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "RequestManagedFileSummaryExportHttpRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("ImportExportJobAdminView"),
            "Managed-file summary export requested.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Import export is not enabled for this scope or managed-file summary export is not allowed for this session.",
          ),
          "409": errorResponse(
            "Managed-file summary export is blocked by an active retention legal hold.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Import-export request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [importExportApiPath.requestSupportCaseSummaryExport]: {
      post: {
        tags: ["import-export"],
        summary: "Request support-case summary export",
        description:
          "Schedules an operator-only tenant-scoped support-case summary export workflow job.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "RequestSupportCaseSummaryExportHttpRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("ImportExportJobAdminView"),
            "Support-case summary export requested.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Import export is not enabled for this scope or support-case summary export is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Import-export request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [importExportApiPath.getImportExportJob]: {
      post: {
        tags: ["import-export"],
        summary: "Get import-export job",
        description:
          "Returns the durable import-export job record for an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("GetImportExportJobHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("ImportExportJobAdminView"),
            "Import-export job returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Import-export inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Import-export request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [webhooksApiPath.processPolarWebhook]: {
      post: {
        tags: ["webhooks"],
        summary: "Process Polar webhook",
        description:
          "Verifies and processes an inbound Polar webhook. The raw request body and signature headers must be preserved.",
        parameters: [
          {
            name: "webhook-id",
            in: "header",
            required: true,
            description: "Provider webhook delivery identifier.",
            schema: nonEmptyHeaderSchema,
          },
          {
            name: "webhook-timestamp",
            in: "header",
            required: true,
            description:
              "Provider webhook timestamp header used for signature verification.",
            schema: nonEmptyHeaderSchema,
          },
          {
            name: "webhook-signature",
            in: "header",
            required: true,
            description:
              "Provider webhook signature header used for request verification.",
            schema: nonEmptyHeaderSchema,
          },
        ],
        requestBody: jsonRequestBody(
          "RawWebhookPayload",
          "Raw provider webhook JSON payload.",
        ),
        responses: {
          "202": jsonResponse(
            {
              oneOf: [
                ref("WebhookIgnoredResponse"),
                ref("WebhookProcessingResponse"),
              ],
            },
            "Webhook accepted for processing or intentionally ignored.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authentication or signature validation failed.",
          ),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Webhook API request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [webhooksApiPath.replayPolarWebhook]: {
      post: {
        tags: ["webhooks"],
        summary: "Replay Polar webhook",
        description:
          "Replays a previously stored Polar webhook delivery by delivery identifier.",
        requestBody: jsonRequestBody("BillingWebhookReplayRequest"),
        responses: {
          "202": jsonResponse(
            ref("WebhookProcessingResponse"),
            "Webhook replay accepted and processed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Webhook API request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [emailDeliveryApiPath.processPostalProviderEvent]: {
      post: {
        tags: ["email-delivery"],
        summary: "Process Postal provider event",
        description:
          "Verifies and processes an inbound Postal provider event. The raw request body and Postal signature headers must be preserved.",
        parameters: [
          {
            name: "X-Postal-Signature-256",
            in: "header",
            required: true,
            description:
              "Postal RSA signature header used for request verification.",
            schema: nonEmptyHeaderSchema,
          },
          {
            name: "X-Postal-Signature-KID",
            in: "header",
            required: true,
            description:
              "Postal signing-key identifier header used for request verification.",
            schema: nonEmptyHeaderSchema,
          },
        ],
        requestBody: jsonRequestBody(
          "RawWebhookPayload",
          "Raw Postal provider-event JSON payload.",
        ),
        responses: {
          "202": jsonResponse(
            ref("WebhookIgnoredResponse"),
            "Provider event accepted or intentionally ignored.",
          ),
          "401": errorResponse(
            "Authentication or signature validation failed.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Email delivery provider-event request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminEmailDeliveryApiPath.inspectTracking]: {
      post: {
        tags: ["email-delivery"],
        summary: "Inspect tracked email delivery",
        description:
          "Returns an operator-safe projected email-delivery tracking record by message id using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "InspectEmailDeliveryTrackingBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("EmailDeliveryTrackingAdminView"),
            "Tracked email-delivery record returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Email delivery inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Email delivery inspection request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminEmailDeliveryApiPath.inspectRecipientSuppression]: {
      post: {
        tags: ["email-delivery"],
        summary: "Inspect recipient suppression",
        description:
          "Returns an operator-safe projected recipient suppression record by recipient lookup using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "InspectEmailRecipientSuppressionBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("EmailRecipientSuppressionAdminView"),
            "Recipient suppression returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Email delivery inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Email delivery inspection request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminNotificationCenterApiPath.inspectEmailReceipt]: {
      post: {
        tags: ["notification-center"],
        summary: "Inspect notification-center email receipt",
        description:
          "Returns an operator-safe projected notification-center email receipt by notification id using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "InspectNotificationCenterEmailReceiptBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("NotificationCenterEmailReceiptAdminView"),
            "Notification-center email receipt returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Notification-center inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse(
            "Notification-center inspection request failed.",
          ),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminNotificationCenterApiPath.inspectInAppNotification]: {
      post: {
        tags: ["notification-center"],
        summary: "Inspect notification-center in-app notification",
        description:
          "Returns an operator-safe projected notification-center in-app notification by notification id using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "InspectNotificationCenterInAppNotificationBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("NotificationCenterInAppNotificationAdminView"),
            "Notification-center in-app notification returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Notification-center inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse(
            "Notification-center inspection request failed.",
          ),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminNotificationCenterApiPath.inspectEmailPreference]: {
      post: {
        tags: ["notification-center"],
        summary: "Inspect notification-center email preference",
        description:
          "Returns an operator-safe projected notification-center email preference by tenant context, recipient, and template using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "InspectNotificationCenterEmailPreferenceBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("NotificationCenterEmailPreferenceAdminView"),
            "Notification-center email preference returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Notification-center preference management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse(
            "Notification-center preference request failed.",
          ),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminNotificationCenterApiPath.upsertEmailPreference]: {
      post: {
        tags: ["notification-center"],
        summary: "Upsert notification-center email preference",
        description:
          "Creates or updates an exact notification-center email preference by tenant context, recipient, and template using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "UpsertNotificationCenterEmailPreferenceBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("NotificationCenterEmailPreferenceAdminView"),
            "Notification-center email preference persisted.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Notification-center preference management is not allowed for this session.",
          ),
          "500": errorResponse(
            "Notification-center preference request failed.",
          ),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminWebhooksApiAccessApiPath.createSubscription]: {
      post: {
        tags: ["webhooks"],
        summary: "Create webhook subscription",
        description:
          "Creates an outbound webhook subscription for a platform or tenant scope using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "CreateWebhookSubscriptionBySessionRequest",
        ),
        responses: {
          "201": jsonResponse(
            ref("WebhookSubscriptionAdminView"),
            "Webhook subscription created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Webhook subscription management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Webhook subscription already exists for this scope and URL.",
          ),
          "500": errorResponse("Webhook subscription request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminWebhooksApiAccessApiPath.requestDelivery]: {
      post: {
        tags: ["webhooks"],
        summary: "Request webhook delivery",
        description:
          "Queues a background outbound webhook delivery attempt for a specific subscription and event using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "RequestWebhookOutboundDeliveryBySessionRequest",
        ),
        responses: {
          "202": jsonResponse(
            ref("WorkflowJobSummary"),
            "Webhook delivery workflow accepted.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Webhook delivery management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Webhook subscription is paused or does not allow the requested event.",
          ),
          "500": errorResponse("Webhook delivery request failed."),
          "502": errorResponse("A backend dependency request failed."),
          "503": errorResponse("Webhook delivery workflow is not available."),
        },
      },
    },
    [adminWebhooksApiAccessApiPath.createApiKey]: {
      post: {
        tags: ["webhooks"],
        summary: "Create webhook API key",
        description:
          "Creates a tenant-scoped webhook API key and returns the plaintext secret exactly once using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("CreateWebhookApiKeyBySessionRequest"),
        responses: {
          "201": jsonResponse(
            ref("WebhookApiKeyOneTimeSecretResult"),
            "Webhook API key created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Webhook API key management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Webhook API key request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminWebhooksApiAccessApiPath.listApiKeys]: {
      post: {
        tags: ["webhooks"],
        summary: "List webhook API keys",
        description:
          "Lists tenant-scoped webhook API keys without returning plaintext secrets using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("ListWebhookApiKeysBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("WebhookApiKeyAdminViewList"),
            "Webhook API keys returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Webhook API key management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Webhook API key request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminWebhooksApiAccessApiPath.rotateApiKey]: {
      post: {
        tags: ["webhooks"],
        summary: "Rotate webhook API key",
        description:
          "Rotates a tenant-scoped webhook API key and returns the replacement plaintext secret exactly once using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("RotateWebhookApiKeyBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("WebhookApiKeyOneTimeSecretResult"),
            "Webhook API key rotated.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Webhook API key management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Webhook API key was revoked or changed during the request.",
          ),
          "500": errorResponse("Webhook API key request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminWebhooksApiAccessApiPath.revokeApiKey]: {
      post: {
        tags: ["webhooks"],
        summary: "Revoke webhook API key",
        description:
          "Revokes a tenant-scoped webhook API key using an authenticated operator session without returning a plaintext secret.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("RevokeWebhookApiKeyBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("WebhookApiKeyAdminView"),
            "Webhook API key revoked.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Webhook API key management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Webhook API key was revoked or changed during the request.",
          ),
          "500": errorResponse("Webhook API key request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminWebhooksApiAccessApiPath.listSubscriptions]: {
      post: {
        tags: ["webhooks"],
        summary: "List webhook subscriptions",
        description:
          "Lists outbound webhook subscriptions for a platform or tenant scope using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "ListWebhookSubscriptionsBySessionRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("WebhookSubscriptionAdminViewList"),
            "Webhook subscriptions returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Webhook subscription management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Webhook subscription request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantBrandingApiPath.requestCustomDomainVerification]: {
      post: {
        tags: ["tenant-branding"],
        summary: "Request tenant custom-domain verification",
        description:
          "Creates an unverified tenant custom-domain verification request using an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "RequestCustomDomainVerificationHttpRequest",
        ),
        responses: {
          "201": jsonResponse(
            ref("CustomDomainVerificationAdminView"),
            "Custom-domain verification request created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Tenant branding management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "409": errorResponse(
            "Custom domain verification already exists for this host.",
          ),
          "500": errorResponse("Tenant branding request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification]: {
      post: {
        tags: ["tenant-branding"],
        summary: "Transition current tenant custom-domain lifecycle",
        description:
          "Updates the current tenant custom-domain lifecycle state for an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody(
          "TransitionCustomDomainVerificationHttpRequest",
        ),
        responses: {
          "200": jsonResponse(
            ref("CustomDomainVerificationAdminView"),
            "Tenant custom-domain lifecycle updated.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Tenant branding management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Tenant branding request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantBrandingApiPath.publishAssetReference]: {
      post: {
        tags: ["tenant-branding"],
        summary: "Publish tenant-branding asset reference",
        description:
          "Publishes a validated managed branding asset reference for an authenticated operator session.",
        parameters: [subscriberJourneySessionHeaderParameter],
        requestBody: jsonRequestBody("PublishTenantBrandingAssetHttpRequest"),
        responses: {
          "200": jsonResponse(
            ref("TenantBrandingPublishedAssetReferenceView"),
            "Tenant-branding asset reference published.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Tenant branding management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Tenant branding request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminTenantBrandingApiPath.getSupportSafeView]: {
      get: {
        tags: ["tenant-branding"],
        summary: "Get tenant-branding support-safe view",
        description:
          "Resolves the current support-safe tenant-branding projection for an authenticated operator session.",
        parameters: [
          subscriberJourneySessionHeaderParameter,
          tenantBrandingScopeQueryParameter,
          tenantBrandingScopeIdQueryParameter,
        ],
        responses: {
          "200": jsonResponse(
            ref("TenantBrandingSupportSafeView"),
            "Tenant-branding support-safe view resolved.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authenticated operator session is required."),
          "403": errorResponse(
            "Tenant branding management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Tenant branding request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
  },
  components: {
    schemas: createBackendApiSchemaComponents(),
  },
});
