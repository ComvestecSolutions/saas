import { and, desc, eq } from "drizzle-orm";
import { Cause, Effect, ParseResult, Schema } from "effect";
import {
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
} from "@comvestec/config";
import {
  AbsoluteRedirectUriSchema,
  type AdminTenantInvitationIssueResult,
  AdminTenantInvitationIssueRequestSchema,
  AdminTenantInvitationIssueResultSchema,
  type AdminTenantInvitationQueryResult,
  AdminTenantInvitationQueryRequestSchema,
  AdminTenantInvitationQueryResultSchema,
  type AdminTenantInvitationRevokeResult,
  AdminTenantInvitationRevokeRequestSchema,
  AdminTenantInvitationRevokeResultSchema,
  type AdminTenantMembershipMutationResult,
  AdminTenantMembershipMutationRequestSchema,
  AdminTenantMembershipMutationResultSchema,
  type AdminTenantMembershipQueryResult,
  AdminTenantMembershipQueryRequestSchema,
  AdminTenantMembershipQueryResultSchema,
  type AdminTenantOnboardingReviewResult,
  AdminTenantOnboardingReviewResultSchema,
  AdminTenantOnboardingReviewRequestSchema,
  type AuditEvent,
  actorType,
  authorizationNamespace,
  authorizationRelation,
  permissionScope,
  platformModuleId,
  platformScope,
  tenantInvitationEmailDeliveryStatus,
  tenantInvitationStatus,
  tenantMembershipMutationAction,
  tenantManagementConfigKey,
  type TenantMembershipRelation,
  TenantInvitationEmailDeliveryOutcomeSchema,
  tenantMembershipRelations,
  TenantMembershipViewSchema,
  TenantMembershipViewListSchema,
  tenantManagementAuditAction,
  type RequestContext,
  type WorkflowJobSummary,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogPostgresQueryable,
  type AuthorizationDelegatedCheckError,
  type AuthorizationModuleService,
  buildAuditEvent,
  type BuildAuditEventInput,
  IdentitySessionModule,
  type IdentitySessionModuleError,
  IdentitySessionPostgresRepository,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makeAuthorizationModule,
  makeIdentitySessionModule,
  makeRuntimeConfigModule,
  makeRuntimeConfigPostgresRepository,
  makeIdentitySessionPostgresRepository,
  makeTenantManagementModule,
  makeTenantInvitationPostgresRepository,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  type PersistTenantInvitationRecord,
  type PostgresDatabase,
  buildTenantInvitationExpiryNotificationWorkflowJobId,
  buildTenantInvitationReminderWorkflowJobId,
  buildWorkflowJobSummary,
  buildWorkflowJobsPostgresQueryable,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  type RuntimeConfigModulePersistenceError,
  RuntimeConfigModule,
  TenantInvitationExpiryNotificationWorkflowJobRecordSchema,
  type TenantInvitationNotificationWorkflowJobRecord,
  TenantInvitationNotificationWorkflowJobRecordSchema,
  TenantInvitationReminderWorkflowJobRecordSchema,
  type RuntimeConfigPostgresQueryable,
  type TenantInvitationPostgresRepositoryError,
  TenantInvitationPostgresRepository,
  type TenantOnboardingPostgresRepositoryError,
  TenantManagementModule,
  tenantMembershipInvitationsTable,
  tenantInvitationPersistedStatus,
  TenantOnboardingPostgresRepository,
  TenantProvisioningPostgresRepository,
  type UnknownConfigKeyError,
  type WorkflowJobsPostgresRepositoryError,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  workflowJobRuntime,
} from "@comvestec/modules";
import {
  type AuthenticatedConvexWorkflowClient,
  type ConvexScheduledWorkflowDispatch,
  type ConvexWorkflowExecutionError,
  KeycloakAdapter,
  makeAuthenticatedConvexWorkflowClient,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  OryKetoAdapter,
  type OryKetoAdapterRequestError,
  type PostgresAdapterConnectionError,
  ValkeyAdapter,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import {
  type EmailDeliveryServiceError,
  type EmailDeliveryService,
  EmailDeliveryRuntimeOptionsSchema,
  makeEmailDeliveryRuntime,
} from "../communication/email-delivery";
import {
  renderTenantInvitationExpiryNotificationEmailTemplate,
  renderTenantInvitationEmailTemplate,
  renderTenantInvitationReminderEmailTemplate,
  tenantInvitationEmailTemplateTrackingId,
} from "../communication/email-delivery-templates";
import { buildWriteDatabase } from "../postgres-write-database";
import {
  buildTenantInvitationView,
  buildTenantInvitationViewList,
  createTenantInvitationToken,
  hashTenantInvitationToken,
} from "./tenant-management-invitations";
import { executeWorkflowJobRecord } from "./workflow-jobs";

const AdminTenantManagementConvexUrlSchema = Schema.NonEmptyString;
const AdminTenantManagementConvexSiteUrlSchema = Schema.NonEmptyString;
const AdminTenantManagementConvexServiceActorUsernameSchema =
  Schema.NonEmptyString;
const AdminTenantManagementConvexServiceActorPasswordSchema =
  Schema.NonEmptyString;

export const AdminTenantOnboardingReviewBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  tenant: AdminTenantOnboardingReviewRequestSchema.fields.tenant,
  inspectionReason:
    AdminTenantOnboardingReviewRequestSchema.fields.inspectionReason,
});

export type AdminTenantOnboardingReviewBySessionRequest = Schema.Schema.Type<
  typeof AdminTenantOnboardingReviewBySessionRequestSchema
>;

export const AdminTenantMembershipQueryBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  tenant: AdminTenantMembershipQueryRequestSchema.fields.tenant,
  inspectionReason:
    AdminTenantMembershipQueryRequestSchema.fields.inspectionReason,
});

export type AdminTenantMembershipQueryBySessionRequest = Schema.Schema.Type<
  typeof AdminTenantMembershipQueryBySessionRequestSchema
>;

export const AdminTenantMembershipMutationBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    tenant: AdminTenantMembershipMutationRequestSchema.fields.tenant,
    subject: AdminTenantMembershipMutationRequestSchema.fields.subject,
    relation: AdminTenantMembershipMutationRequestSchema.fields.relation,
    action: AdminTenantMembershipMutationRequestSchema.fields.action,
    mutationReason:
      AdminTenantMembershipMutationRequestSchema.fields.mutationReason,
  });

export type AdminTenantMembershipMutationBySessionRequest = Schema.Schema.Type<
  typeof AdminTenantMembershipMutationBySessionRequestSchema
>;

export const AdminTenantInvitationIssueBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  tenant: AdminTenantInvitationIssueRequestSchema.fields.tenant,
  recipientEmail: AdminTenantInvitationIssueRequestSchema.fields.recipientEmail,
  relation: AdminTenantInvitationIssueRequestSchema.fields.relation,
  issueReason: AdminTenantInvitationIssueRequestSchema.fields.issueReason,
});

export type AdminTenantInvitationIssueBySessionRequest = Schema.Schema.Type<
  typeof AdminTenantInvitationIssueBySessionRequestSchema
>;

export const AdminTenantInvitationQueryBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  tenant: AdminTenantInvitationQueryRequestSchema.fields.tenant,
  inspectionReason:
    AdminTenantInvitationQueryRequestSchema.fields.inspectionReason,
});

export type AdminTenantInvitationQueryBySessionRequest = Schema.Schema.Type<
  typeof AdminTenantInvitationQueryBySessionRequestSchema
>;

export const AdminTenantInvitationRevokeBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  tenant: AdminTenantInvitationRevokeRequestSchema.fields.tenant,
  invitationId: AdminTenantInvitationRevokeRequestSchema.fields.invitationId,
  revocationReason:
    AdminTenantInvitationRevokeRequestSchema.fields.revocationReason,
});

export type AdminTenantInvitationRevokeBySessionRequest = Schema.Schema.Type<
  typeof AdminTenantInvitationRevokeBySessionRequestSchema
>;

export const RunTenantInvitationReminderWorkflowJobRequestSchema =
  Schema.Struct({
    jobId: Schema.NonEmptyString,
  });

export type RunTenantInvitationReminderWorkflowJobRequest = Schema.Schema.Type<
  typeof RunTenantInvitationReminderWorkflowJobRequestSchema
>;

export const RunTenantInvitationExpiryNotificationWorkflowJobRequestSchema =
  Schema.Struct({
    jobId: Schema.NonEmptyString,
  });

export type RunTenantInvitationExpiryNotificationWorkflowJobRequest =
  Schema.Schema.Type<
    typeof RunTenantInvitationExpiryNotificationWorkflowJobRequestSchema
  >;

const AdminTenantManagementInvitationEmailRuntimeOptionsSchema = Schema.Struct({
  appBaseUrl: AbsoluteRedirectUriSchema,
  postalApiUrl: Schema.NonEmptyString,
  postalApiKey: Schema.NonEmptyString,
  platformSender: EmailDeliveryRuntimeOptionsSchema.fields.platformSender,
});

export const AdminTenantManagementRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  convexUrl: AdminTenantManagementConvexUrlSchema,
  convexSiteUrl: AdminTenantManagementConvexSiteUrlSchema,
  convexAdminKey: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername:
    AdminTenantManagementConvexServiceActorUsernameSchema,
  keycloakConvexServiceActorPassword:
    AdminTenantManagementConvexServiceActorPasswordSchema,
  valkeyUrl: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
  emailDelivery: Schema.optional(
    AdminTenantManagementInvitationEmailRuntimeOptionsSchema,
  ),
});

export type AdminTenantManagementRuntimeOptions = Schema.Schema.Type<
  typeof AdminTenantManagementRuntimeOptionsSchema
>;

const AdminTenantManagementProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

const AdminTenantManagementWorkflowProcessEnvironmentSchema = Schema.Struct({
  CONVEX_SELF_HOSTED_URL: AdminTenantManagementConvexUrlSchema,
  CONVEX_SELF_HOSTED_SITE_URL: AdminTenantManagementConvexSiteUrlSchema,
  CONVEX_SELF_HOSTED_ADMIN_KEY: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME:
    AdminTenantManagementConvexServiceActorUsernameSchema,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD:
    AdminTenantManagementConvexServiceActorPasswordSchema,
});

const AdminTenantManagementOptionalEmailDeliveryEnvironmentSchema =
  Schema.Struct({
    APP_BASE_URL: Schema.optional(Schema.String),
    POSTAL_API_URL: Schema.optional(Schema.NonEmptyString),
    POSTAL_API_KEY: Schema.optional(Schema.NonEmptyString),
    PLATFORM_EMAIL_SENDER_DISPLAY_NAME: Schema.optional(Schema.NonEmptyString),
    PLATFORM_EMAIL_SENDER_FROM_EMAIL: Schema.optional(Schema.NonEmptyString),
    PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL: Schema.optional(
      Schema.NonEmptyString,
    ),
  });

export type AdminTenantManagementAccessDeniedError = {
  readonly _tag: "AdminTenantManagementAccessDeniedError";
  readonly reason: string;
  readonly auditRequired: boolean;
};

export type AdminTenantManagementInvitationNotFoundError = {
  readonly _tag: "AdminTenantManagementInvitationNotFoundError";
  readonly invitationId: string;
};

export type AdminTenantManagementWorkflowUnavailableError = {
  readonly _tag: "AdminTenantManagementWorkflowUnavailableError";
  readonly dependency:
    | "workflowJobs"
    | "convexWorkflowClient"
    | "emailDelivery"
    | "appBaseUrl";
  readonly reason: string;
};

export type AdminTenantManagementServiceError =
  | AdminTenantManagementAccessDeniedError
  | AdminTenantManagementInvitationNotFoundError
  | AdminTenantManagementWorkflowUnavailableError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | IdentitySessionModuleError
  | OryKetoAdapterRequestError
  | ParseResult.ParseError
  | RuntimeConfigModulePersistenceError
  | TenantInvitationPostgresRepositoryError
  | TenantOnboardingPostgresRepositoryError
  | UnknownConfigKeyError
  | WorkflowJobsPostgresRepositoryError;

export type AdminTenantManagementRuntimeError =
  | AdminTenantManagementServiceError
  | ConvexWorkflowExecutionError
  | WorkflowJobsPostgresRepositoryError
  | PostgresAdapterConnectionError;

export type AdminTenantManagementService = {
  readonly reviewTenantOnboarding: (
    input: AdminTenantOnboardingReviewBySessionRequest,
  ) => Effect.Effect<
    AdminTenantOnboardingReviewResult,
    AdminTenantManagementServiceError
  >;
  readonly listTenantMemberships: (
    input: AdminTenantMembershipQueryBySessionRequest,
  ) => Effect.Effect<
    AdminTenantMembershipQueryResult,
    AdminTenantManagementServiceError
  >;
  readonly mutateTenantMembership: (
    input: AdminTenantMembershipMutationBySessionRequest,
  ) => Effect.Effect<
    AdminTenantMembershipMutationResult,
    AdminTenantManagementServiceError
  >;
  readonly issueTenantInvitation: (
    input: AdminTenantInvitationIssueBySessionRequest,
  ) => Effect.Effect<
    AdminTenantInvitationIssueResult,
    AdminTenantManagementServiceError
  >;
  readonly listTenantInvitations: (
    input: AdminTenantInvitationQueryBySessionRequest,
  ) => Effect.Effect<
    AdminTenantInvitationQueryResult,
    AdminTenantManagementServiceError
  >;
  readonly revokeTenantInvitation: (
    input: AdminTenantInvitationRevokeBySessionRequest,
  ) => Effect.Effect<
    AdminTenantInvitationRevokeResult,
    AdminTenantManagementServiceError
  >;
  readonly runTenantInvitationReminderWorkflowJob: (
    input: RunTenantInvitationReminderWorkflowJobRequest,
  ) => Effect.Effect<
    WorkflowJobSummary | undefined,
    AdminTenantManagementServiceError
  >;
  readonly runTenantInvitationExpiryNotificationWorkflowJob: (
    input: RunTenantInvitationExpiryNotificationWorkflowJobRequest,
  ) => Effect.Effect<
    WorkflowJobSummary | undefined,
    AdminTenantManagementServiceError
  >;
};

type TenantInvitationWorkflowJobsRepository =
  WorkflowJobsPostgresRepositoryServiceForRecord<TenantInvitationNotificationWorkflowJobRecord>;

type TenantInvitationWorkflowSchedulerClient = Pick<
  AuthenticatedConvexWorkflowClient,
  | "scheduleTenantInvitationReminderWorkflowJob"
  | "scheduleTenantInvitationExpiryNotificationWorkflowJob"
>;

type AdminTenantManagementServiceOptions = {
  readonly authorization?: AuthorizationModuleService;
  readonly appBaseUrl?: string;
  readonly convexWorkflowClient?: TenantInvitationWorkflowSchedulerClient;
  readonly emailDelivery?: Pick<EmailDeliveryService, "sendTransactionalEmail">;
  readonly invitationRepository?: TenantInvitationPostgresRepository["Type"];
  readonly persistIssuedInvitation?: PersistIssuedTenantInvitation;
  readonly persistRevokedInvitation?: PersistRevokedTenantInvitation;
  readonly runtimeConfig?: RuntimeConfigModule["Type"];
  readonly workflowJobs?: TenantInvitationWorkflowJobsRepository;
};

type PersistIssuedTenantInvitationInput = {
  readonly invitation: PersistTenantInvitationRecord;
  readonly auditInput: BuildAuditEventInput;
};

type PersistIssuedTenantInvitation = (
  input: PersistIssuedTenantInvitationInput,
) => Effect.Effect<
  void,
  AuditLogModuleError | TenantInvitationPostgresRepositoryError
>;

type PersistRevokedTenantInvitationInput = {
  readonly invitation: PersistTenantInvitationRecord;
  readonly revokedBy: string;
  readonly revokedAt: string;
  readonly auditInput: BuildAuditEventInput;
};

type PersistRevokedTenantInvitation = (
  input: PersistRevokedTenantInvitationInput,
) => Effect.Effect<
  PersistTenantInvitationRecord | undefined,
  AuditLogModuleError | TenantInvitationPostgresRepositoryError
>;

const decodeAdminTenantManagementProcessEnvironment = Schema.decodeUnknown(
  AdminTenantManagementProcessEnvironmentSchema,
);

const decodeAdminTenantManagementWorkflowProcessEnvironment =
  Schema.decodeUnknown(AdminTenantManagementWorkflowProcessEnvironmentSchema);

const decodeAdminTenantManagementOptionalEmailDeliveryEnvironment =
  Schema.decodeUnknown(
    AdminTenantManagementOptionalEmailDeliveryEnvironmentSchema,
  );

const decodeAdminTenantManagementRuntimeOptions = Schema.decodeUnknown(
  AdminTenantManagementRuntimeOptionsSchema,
);

const decodeAdminTenantManagementInvitationEmailRuntimeOptions =
  Schema.decodeUnknown(
    AdminTenantManagementInvitationEmailRuntimeOptionsSchema,
  );

const normalizeInspectionReason = (inspectionReason: string | undefined) => {
  const trimmedInspectionReason = inspectionReason?.trim();

  return trimmedInspectionReason !== undefined &&
    trimmedInspectionReason.length > 0
    ? trimmedInspectionReason
    : undefined;
};

const normalizeRequiredReason = (reason: string) =>
  Schema.decodeUnknown(Schema.NonEmptyString)(reason.trim());

const notQueuedInvitationDeliveryOutcome = Schema.validateSync(
  TenantInvitationEmailDeliveryOutcomeSchema,
)({
  status: tenantInvitationEmailDeliveryStatus.notQueued,
  template: tenantInvitationEmailTemplateTrackingId,
});

const buildQueuedInvitationDeliveryOutcome = (input: {
  readonly messageId: string;
  readonly template: string;
}) =>
  Schema.decodeUnknown(TenantInvitationEmailDeliveryOutcomeSchema)({
    status: tenantInvitationEmailDeliveryStatus.queued,
    template: input.template,
    messageId: input.messageId,
  });

const resolveOptionalAdminTenantManagementInvitationEmailRuntimeOptions = (
  environment: unknown,
) =>
  decodeAdminTenantManagementOptionalEmailDeliveryEnvironment(environment).pipe(
    Effect.flatMap((resolvedEnvironment) => {
      const hasAnyInvitationEmailProviderConfiguration =
        resolvedEnvironment.POSTAL_API_URL !== undefined ||
        resolvedEnvironment.POSTAL_API_KEY !== undefined ||
        resolvedEnvironment.PLATFORM_EMAIL_SENDER_DISPLAY_NAME !== undefined ||
        resolvedEnvironment.PLATFORM_EMAIL_SENDER_FROM_EMAIL !== undefined ||
        resolvedEnvironment.PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL !== undefined;

      return hasAnyInvitationEmailProviderConfiguration
        ? decodeAdminTenantManagementInvitationEmailRuntimeOptions({
            appBaseUrl: resolvedEnvironment.APP_BASE_URL,
            postalApiUrl: resolvedEnvironment.POSTAL_API_URL,
            postalApiKey: resolvedEnvironment.POSTAL_API_KEY,
            platformSender: {
              displayName:
                resolvedEnvironment.PLATFORM_EMAIL_SENDER_DISPLAY_NAME,
              fromEmail: resolvedEnvironment.PLATFORM_EMAIL_SENDER_FROM_EMAIL,
              replyToEmail:
                resolvedEnvironment.PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL,
            },
          })
        : Effect.succeed(undefined);
    }),
  );

const denyAdminTenantManagementAccess = (input: {
  readonly reason: string;
  readonly auditRequired: boolean;
}) =>
  Effect.fail({
    _tag: "AdminTenantManagementAccessDeniedError",
    reason: input.reason,
    auditRequired: input.auditRequired,
  } satisfies AdminTenantManagementAccessDeniedError);

const validatePlatformOperatorContext = (input: {
  readonly requestContext: RequestContext;
}) =>
  input.requestContext.actorType === actorType.platformOperator &&
  input.requestContext.tenant.scope === platformScope.platform &&
  input.requestContext.tenant.scopeId === platformScope.platform
    ? Effect.void
    : denyAdminTenantManagementAccess({
        reason:
          "Admin tenant management operations require a platform-operator session scoped to the platform tenant.",
        auditRequired: false,
      });

type AdminTenantManagementTargetTenant =
  | AdminTenantOnboardingReviewBySessionRequest["tenant"]
  | AdminTenantInvitationIssueBySessionRequest["tenant"]
  | AdminTenantInvitationQueryBySessionRequest["tenant"]
  | AdminTenantInvitationRevokeBySessionRequest["tenant"]
  | AdminTenantMembershipQueryBySessionRequest["tenant"]
  | AdminTenantMembershipMutationBySessionRequest["tenant"];

const authorizeTenantAccess = (input: {
  readonly authorization: AuthorizationModuleService;
  readonly requestContext: RequestContext;
  readonly tenant: AdminTenantManagementTargetTenant;
  readonly relation: TenantMembershipRelation;
  readonly permission:
    | typeof permissionScope.tenantRead
    | typeof permissionScope.memberManage;
}) =>
  Effect.gen(function* () {
    yield* validatePlatformOperatorContext({
      requestContext: input.requestContext,
    });

    const decision = yield* input.authorization.check({
      requestContext: input.requestContext,
      namespace: authorizationNamespace.tenant,
      object: input.tenant.scopeId,
      relation: input.relation,
      permissionScope: input.permission,
    });

    return decision.allowed
      ? decision
      : yield* denyAdminTenantManagementAccess({
          reason: decision.reason,
          auditRequired: decision.auditRequired,
        });
  });

const authorizeTenantReadAccess = (input: {
  readonly authorization: AuthorizationModuleService;
  readonly requestContext: RequestContext;
  readonly tenant: AdminTenantManagementTargetTenant;
}) =>
  authorizeTenantAccess({
    ...input,
    relation: authorizationRelation.viewer,
    permission: permissionScope.tenantRead,
  });

const authorizeTenantMembershipManageAccess = (input: {
  readonly authorization: AuthorizationModuleService;
  readonly requestContext: RequestContext;
  readonly tenant: AdminTenantManagementTargetTenant;
}) =>
  authorizeTenantAccess({
    ...input,
    relation: authorizationRelation.admin,
    permission: permissionScope.memberManage,
  });

const buildTenantOnboardingAuditTarget = (
  tenant: AdminTenantOnboardingReviewBySessionRequest["tenant"],
) => [tenant.scope, tenant.scopeId, "onboarding-state"].join(":");

const buildTenantMembershipAuditTarget = (
  tenant: AdminTenantMembershipQueryBySessionRequest["tenant"],
) => [tenant.scope, tenant.scopeId, "memberships"].join(":");

const buildTenantInvitationAuditTarget = (
  tenant: AdminTenantInvitationQueryBySessionRequest["tenant"],
) => [tenant.scope, tenant.scopeId, "invitations"].join(":");

const buildTenantInvitationMutationAuditTarget = (input: {
  readonly tenant:
    | AdminTenantInvitationIssueBySessionRequest["tenant"]
    | AdminTenantInvitationRevokeBySessionRequest["tenant"];
  readonly invitationId: string;
}) =>
  [
    input.tenant.scope,
    input.tenant.scopeId,
    "invitations",
    input.invitationId,
  ].join(":");

const buildTenantMembershipMutationAuditTarget = (input: {
  readonly tenant: AdminTenantMembershipMutationBySessionRequest["tenant"];
  readonly subject: string;
  readonly relation: TenantMembershipRelation;
}) =>
  [
    input.tenant.scope,
    input.tenant.scopeId,
    "memberships",
    input.subject,
    input.relation,
  ].join(":");

const buildTenantAuditRequestContext = (input: {
  readonly requestContext: RequestContext;
  readonly tenant: AdminTenantManagementTargetTenant;
}): RequestContext => ({
  ...input.requestContext,
  tenant: input.tenant,
});

const buildTenantInvitationAuthStartUrl = (appBaseUrl: string) =>
  Schema.decodeUnknown(AbsoluteRedirectUriSchema)(appBaseUrl).pipe(
    Effect.map((validatedBaseUrl) =>
      new URL("/auth/start", validatedBaseUrl).toString(),
    ),
    Effect.flatMap((authStartUrl) =>
      Schema.decodeUnknown(AbsoluteRedirectUriSchema)(authStartUrl),
    ),
  );

const sendIssuedTenantInvitationEmail = (input: {
  readonly appBaseUrl?: string;
  readonly emailDelivery?: Pick<EmailDeliveryService, "sendTransactionalEmail">;
  readonly requestContext: RequestContext;
  readonly tenant: AdminTenantInvitationIssueBySessionRequest["tenant"];
  readonly recipientEmail: string;
  readonly relation: TenantMembershipRelation;
  readonly invitationToken: string;
  readonly expiresAt: string;
}) => {
  const appBaseUrl = input.appBaseUrl;
  const emailDelivery = input.emailDelivery;

  return emailDelivery === undefined || appBaseUrl === undefined
    ? Effect.succeed(notQueuedInvitationDeliveryOutcome)
    : buildTenantInvitationAuthStartUrl(appBaseUrl).pipe(
        Effect.flatMap((authStartUrl) =>
          renderTenantInvitationEmailTemplate({
            tenant: input.tenant,
            recipientEmail: input.recipientEmail,
            relation: input.relation,
            invitationToken: input.invitationToken,
            expiresAt: input.expiresAt,
            signInUrl: authStartUrl,
          }),
        ),
        Effect.flatMap((renderedTemplate) =>
          emailDelivery
            .sendTransactionalEmail({
              requestContext: input.requestContext,
              recipient: input.recipientEmail,
              template: renderedTemplate.template,
              subject: renderedTemplate.subject,
              html: renderedTemplate.html,
              text: renderedTemplate.text,
            })
            .pipe(
              Effect.flatMap((receipt) =>
                buildQueuedInvitationDeliveryOutcome({
                  messageId: receipt.messageId,
                  template: renderedTemplate.template,
                }),
              ),
              Effect.catchAll(() =>
                Effect.succeed(notQueuedInvitationDeliveryOutcome),
              ),
            ),
        ),
        Effect.catchAll(() =>
          Effect.succeed(notQueuedInvitationDeliveryOutcome),
        ),
      );
};

const sendTenantInvitationReminderEmail = (input: {
  readonly appBaseUrl?: string;
  readonly emailDelivery?: Pick<EmailDeliveryService, "sendTransactionalEmail">;
  readonly requestContext: RequestContext;
  readonly tenant: AdminTenantInvitationIssueBySessionRequest["tenant"];
  readonly recipientEmail: string;
  readonly relation: TenantMembershipRelation;
  readonly expiresAt: string;
}) => {
  if (input.emailDelivery === undefined) {
    return Effect.fail({
      _tag: "AdminTenantManagementWorkflowUnavailableError",
      dependency: "emailDelivery",
      reason:
        "Invitation reminder workflow execution requires email delivery runtime support.",
    } satisfies AdminTenantManagementWorkflowUnavailableError);
  }

  if (input.appBaseUrl === undefined) {
    return Effect.fail({
      _tag: "AdminTenantManagementWorkflowUnavailableError",
      dependency: "appBaseUrl",
      reason:
        "Invitation reminder workflow execution requires the application base URL.",
    } satisfies AdminTenantManagementWorkflowUnavailableError);
  }

  const emailDelivery = input.emailDelivery;

  return buildTenantInvitationAuthStartUrl(input.appBaseUrl).pipe(
    Effect.flatMap((authStartUrl) =>
      renderTenantInvitationReminderEmailTemplate({
        tenant: input.tenant,
        recipientEmail: input.recipientEmail,
        relation: input.relation,
        expiresAt: input.expiresAt,
        signInUrl: authStartUrl,
      }),
    ),
    Effect.flatMap((renderedTemplate) =>
      emailDelivery
        .sendTransactionalEmail({
          requestContext: input.requestContext,
          recipient: input.recipientEmail,
          template: renderedTemplate.template,
          subject: renderedTemplate.subject,
          html: renderedTemplate.html,
          text: renderedTemplate.text,
        })
        .pipe(
          Effect.flatMap((receipt) =>
            buildQueuedInvitationDeliveryOutcome({
              messageId: receipt.messageId,
              template: renderedTemplate.template,
            }),
          ),
        ),
    ),
  );
};

const sendTenantInvitationExpiryNotificationEmail = (input: {
  readonly appBaseUrl?: string;
  readonly emailDelivery?: Pick<EmailDeliveryService, "sendTransactionalEmail">;
  readonly requestContext: RequestContext;
  readonly tenant: AdminTenantInvitationIssueBySessionRequest["tenant"];
  readonly recipientEmail: string;
  readonly relation: TenantMembershipRelation;
  readonly expiresAt: string;
}) => {
  if (input.emailDelivery === undefined) {
    return Effect.fail({
      _tag: "AdminTenantManagementWorkflowUnavailableError",
      dependency: "emailDelivery",
      reason:
        "Invitation expiry-notification workflow execution requires email delivery runtime support.",
    } satisfies AdminTenantManagementWorkflowUnavailableError);
  }

  if (input.appBaseUrl === undefined) {
    return Effect.fail({
      _tag: "AdminTenantManagementWorkflowUnavailableError",
      dependency: "appBaseUrl",
      reason:
        "Invitation expiry-notification workflow execution requires the application base URL.",
    } satisfies AdminTenantManagementWorkflowUnavailableError);
  }

  const emailDelivery = input.emailDelivery;

  if (Date.now() < Date.parse(input.expiresAt)) {
    return Effect.fail({
      _tag: "AdminTenantManagementWorkflowUnavailableError",
      dependency: "workflowJobs",
      reason:
        "Invitation expiry-notification workflow execution must not queue before the invitation expires.",
    } satisfies AdminTenantManagementWorkflowUnavailableError);
  }

  return buildTenantInvitationAuthStartUrl(input.appBaseUrl).pipe(
    Effect.flatMap((authStartUrl) =>
      renderTenantInvitationExpiryNotificationEmailTemplate({
        tenant: input.tenant,
        recipientEmail: input.recipientEmail,
        relation: input.relation,
        expiresAt: input.expiresAt,
        signInUrl: authStartUrl,
      }),
    ),
    Effect.flatMap((renderedTemplate) =>
      emailDelivery
        .sendTransactionalEmail({
          requestContext: input.requestContext,
          recipient: input.recipientEmail,
          template: renderedTemplate.template,
          subject: renderedTemplate.subject,
          html: renderedTemplate.html,
          text: renderedTemplate.text,
        })
        .pipe(
          Effect.flatMap((receipt) =>
            buildQueuedInvitationDeliveryOutcome({
              messageId: receipt.messageId,
              template: renderedTemplate.template,
            }),
          ),
        ),
    ),
  );
};

const buildTenantInvitationReminderWorkflowJobRecord = (input: {
  readonly invitation: PersistTenantInvitationRecord;
  readonly relation: TenantMembershipRelation;
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(TenantInvitationReminderWorkflowJobRecordSchema)({
    jobId: buildTenantInvitationReminderWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: input.invitation.tenantScope,
      tenantScopeId: input.invitation.tenantScopeId,
      key: input.invitation.invitationId,
    }),
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.tenantManagement,
    kind: workflowJobKind.invitationReminder,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.scheduled,
    tenantScope: input.invitation.tenantScope,
    tenantScopeId: input.invitation.tenantScopeId,
    attempts: 0,
    scheduledAt: input.scheduledAt,
    payload: {
      sourceModuleId: platformModuleId.tenantManagement,
      tenantScope: input.invitation.tenantScope,
      tenantScopeId: input.invitation.tenantScopeId,
      invitationId: input.invitation.invitationId,
      recipientEmail: input.invitation.recipientEmail,
      relation: input.relation,
      correlationId:
        input.invitation.correlationId ?? input.invitation.invitationId,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildTenantInvitationExpiryNotificationWorkflowJobRecord = (input: {
  readonly invitation: PersistTenantInvitationRecord;
  readonly relation: TenantMembershipRelation;
  readonly scheduledAt: string;
  readonly now: string;
}) =>
  Schema.decodeUnknown(
    TenantInvitationExpiryNotificationWorkflowJobRecordSchema,
  )({
    jobId: buildTenantInvitationExpiryNotificationWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: input.invitation.tenantScope,
      tenantScopeId: input.invitation.tenantScopeId,
      key: input.invitation.invitationId,
    }),
    runtime: workflowJobRuntime.convex,
    sourceModuleId: platformModuleId.tenantManagement,
    kind: workflowJobKind.invitationExpiryNotification,
    trigger: workflowJobTrigger.operatorRequested,
    status: workflowJobStatus.scheduled,
    tenantScope: input.invitation.tenantScope,
    tenantScopeId: input.invitation.tenantScopeId,
    attempts: 0,
    scheduledAt: input.scheduledAt,
    payload: {
      sourceModuleId: platformModuleId.tenantManagement,
      tenantScope: input.invitation.tenantScope,
      tenantScopeId: input.invitation.tenantScopeId,
      invitationId: input.invitation.invitationId,
      recipientEmail: input.invitation.recipientEmail,
      relation: input.relation,
      correlationId:
        input.invitation.correlationId ?? input.invitation.invitationId,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

const buildTenantInvitationWorkflowDispatchRecord = (input: {
  readonly job: TenantInvitationNotificationWorkflowJobRecord;
  readonly now: string;
  readonly dispatch: ConvexScheduledWorkflowDispatch;
}) =>
  Schema.decodeUnknown(TenantInvitationNotificationWorkflowJobRecordSchema)({
    ...input.job,
    payload: {
      ...input.job.payload,
      dispatch: {
        scheduledAt: input.job.scheduledAt,
        scheduledFunctionId: input.dispatch.scheduledFunctionId,
        scheduledFunctionIds: input.dispatch.scheduledFunctionIds,
        primaryScheduled: input.dispatch.primaryScheduled,
        scheduledRecoveryAttemptCount:
          input.dispatch.scheduledRecoveryAttemptCount,
        expectedRecoveryAttemptCount:
          input.dispatch.expectedRecoveryAttemptCount,
      },
    },
    updatedAt: input.now,
  });

const completeTenantInvitationWorkflowJob = (input: {
  readonly job: TenantInvitationNotificationWorkflowJobRecord;
  readonly now: string;
}) =>
  Schema.decodeUnknown(TenantInvitationNotificationWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.completed,
    completedAt: input.now,
    gapReason: undefined,
    lastError: undefined,
    updatedAt: input.now,
  });

const blockTenantInvitationWorkflowJob = (input: {
  readonly job: TenantInvitationNotificationWorkflowJobRecord;
  readonly now: string;
  readonly lastError?: string;
}) =>
  Schema.decodeUnknown(TenantInvitationNotificationWorkflowJobRecordSchema)({
    ...input.job,
    status: workflowJobStatus.blocked,
    completedAt: input.now,
    ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
    gapReason: workflowJobGapReason.repairFailed,
    updatedAt: input.now,
  });

const buildPersistedInvitationInsertRow = (
  invitation: PersistTenantInvitationRecord,
) => ({
  invitationId: invitation.invitationId,
  tenantScope: invitation.tenantScope,
  tenantScopeId: invitation.tenantScopeId,
  tokenHash: invitation.tokenHash ?? null,
  recipientEmail: invitation.recipientEmail,
  relation: invitation.relation,
  status: invitation.status,
  issuedBy: invitation.issuedBy,
  correlationId: invitation.correlationId ?? null,
  issuedAt: new Date(invitation.issuedAt ?? new Date().toISOString()),
  expiresAt: new Date(invitation.expiresAt),
  redeemedAt:
    invitation.redeemedAt === undefined
      ? null
      : new Date(invitation.redeemedAt),
  redeemedBy: invitation.redeemedBy ?? null,
  revokedAt:
    invitation.revokedAt === undefined ? null : new Date(invitation.revokedAt),
  revokedBy: invitation.revokedBy ?? null,
});

const buildAuditEventInsertRow = (event: AuditEvent) => ({
  eventId: event.eventId,
  moduleId: event.moduleId,
  action: event.action,
  target: event.target,
  actorId: event.actorId,
  tenantScope: event.tenantScope,
  tenantScopeId: event.tenantScopeId,
  reason: event.reason ?? null,
  correlationId: event.correlationId ?? null,
  requestContext: {},
});

const isIssuedInvitationTransactionError = (
  cause: unknown,
): cause is
  | Extract<
      AuditLogModuleError,
      { readonly _tag: "AuditLogPostgresRepositoryPersistenceError" }
    >
  | Extract<
      TenantInvitationPostgresRepositoryError,
      { readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError" }
    > =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  (cause._tag === "AuditLogPostgresRepositoryPersistenceError" ||
    cause._tag === "TenantInvitationPostgresRepositoryPersistenceError");

const createPersistIssuedTenantInvitation =
  (writeDatabase: PostgresDatabase): PersistIssuedTenantInvitation =>
  (input) =>
    buildAuditEvent(input.auditInput).pipe(
      Effect.flatMap((auditEvent) =>
        Effect.tryPromise({
          try: async () => {
            const invitationRow = buildPersistedInvitationInsertRow(
              input.invitation,
            );
            const auditRow = buildAuditEventInsertRow(auditEvent);

            await writeDatabase.transaction(async (tx) => {
              try {
                await tx
                  .insert(tenantMembershipInvitationsTable)
                  .values(invitationRow)
                  .onConflictDoUpdate({
                    target: [tenantMembershipInvitationsTable.invitationId],
                    set: {
                      ...invitationRow,
                    },
                  })
                  .execute();
              } catch (cause) {
                throw {
                  _tag: "TenantInvitationPostgresRepositoryPersistenceError",
                  operation: "createInvitation",
                  cause,
                } satisfies Extract<
                  TenantInvitationPostgresRepositoryError,
                  {
                    readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError";
                  }
                >;
              }

              try {
                await tx.insert(auditLogEventsTable).values(auditRow).execute();
              } catch (cause) {
                throw {
                  _tag: "AuditLogPostgresRepositoryPersistenceError",
                  operation: "insertAuditEvent",
                  cause,
                } satisfies Extract<
                  AuditLogModuleError,
                  {
                    readonly _tag: "AuditLogPostgresRepositoryPersistenceError";
                  }
                >;
              }
            });
          },
          catch: (cause) =>
            isIssuedInvitationTransactionError(cause)
              ? cause
              : ({
                  _tag: "TenantInvitationPostgresRepositoryPersistenceError",
                  operation: "createInvitation",
                  cause,
                } satisfies Extract<
                  TenantInvitationPostgresRepositoryError,
                  {
                    readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError";
                  }
                >),
        }),
      ),
      Effect.asVoid,
    );

const createPersistRevokedTenantInvitation =
  (writeDatabase: PostgresDatabase): PersistRevokedTenantInvitation =>
  (input) =>
    buildAuditEvent(input.auditInput).pipe(
      Effect.flatMap((auditEvent) =>
        Effect.tryPromise({
          try: async () => {
            const auditRow = buildAuditEventInsertRow(auditEvent);

            return await writeDatabase.transaction(async (tx) => {
              let updatedRows: Array<{ invitationId: string }> = [];

              try {
                updatedRows = await tx
                  .update(tenantMembershipInvitationsTable)
                  .set({
                    status: tenantInvitationPersistedStatus.revoked,
                    revokedBy: input.revokedBy,
                    revokedAt: new Date(input.revokedAt),
                  })
                  .where(
                    and(
                      eq(
                        tenantMembershipInvitationsTable.tenantScope,
                        input.invitation.tenantScope,
                      ),
                      eq(
                        tenantMembershipInvitationsTable.tenantScopeId,
                        input.invitation.tenantScopeId,
                      ),
                      eq(
                        tenantMembershipInvitationsTable.invitationId,
                        input.invitation.invitationId,
                      ),
                      eq(
                        tenantMembershipInvitationsTable.status,
                        tenantInvitationPersistedStatus.pending,
                      ),
                    ),
                  )
                  .returning();
              } catch (cause) {
                throw {
                  _tag: "TenantInvitationPostgresRepositoryPersistenceError",
                  operation: "revokeInvitation",
                  cause,
                } satisfies Extract<
                  TenantInvitationPostgresRepositoryError,
                  {
                    readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError";
                  }
                >;
              }

              if (updatedRows.length === 0) {
                return undefined;
              }

              try {
                await tx.insert(auditLogEventsTable).values(auditRow).execute();
              } catch (cause) {
                throw {
                  _tag: "AuditLogPostgresRepositoryPersistenceError",
                  operation: "insertAuditEvent",
                  cause,
                } satisfies Extract<
                  AuditLogModuleError,
                  {
                    readonly _tag: "AuditLogPostgresRepositoryPersistenceError";
                  }
                >;
              }

              return {
                ...input.invitation,
                status: tenantInvitationPersistedStatus.revoked,
                revokedBy: input.revokedBy,
                revokedAt: input.revokedAt,
              } satisfies PersistTenantInvitationRecord;
            });
          },
          catch: (cause) =>
            isIssuedInvitationTransactionError(cause)
              ? cause
              : ({
                  _tag: "TenantInvitationPostgresRepositoryPersistenceError",
                  operation: "revokeInvitation",
                  cause,
                } satisfies Extract<
                  TenantInvitationPostgresRepositoryError,
                  {
                    readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError";
                  }
                >),
        }),
      ),
    );

const tenantMembershipRelationSortOrder = new Map<
  TenantMembershipRelation,
  number
>(tenantMembershipRelations.map((relation, index) => [relation, index]));

const sortTenantMembershipRelations = (relations: TenantMembershipRelation[]) =>
  relations.sort(
    (left, right) =>
      (tenantMembershipRelationSortOrder.get(left) ?? 0) -
      (tenantMembershipRelationSortOrder.get(right) ?? 0),
  );

const decodeTenantMembershipViewList = Schema.decodeUnknown(
  TenantMembershipViewListSchema,
);

const decodeTenantMembershipView = Schema.decodeUnknown(
  TenantMembershipViewSchema,
);

const decodeTenantInvitationExpiryHours = Schema.decodeUnknown(Schema.Number);

const decodeTenantInvitationReminderHours = Schema.decodeUnknown(Schema.Number);

const createTenantInvitationNotFoundError = (invitationId: string) =>
  ({
    _tag: "AdminTenantManagementInvitationNotFoundError",
    invitationId,
  }) satisfies AdminTenantManagementInvitationNotFoundError;

const resolveTenantInvitationExpiryHours = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
}) =>
  input.runtimeConfig
    .resolveStoredConfigValue({
      requestContext: input.requestContext,
      moduleId: platformModuleId.tenantManagement,
      key: tenantManagementConfigKey.membershipInviteExpiryHours,
      entitlements: [],
    })
    .pipe(
      Effect.flatMap((resolution) =>
        decodeTenantInvitationExpiryHours(resolution.effectiveValue),
      ),
    );

const resolveTenantInvitationReminderHours = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
}) =>
  input.runtimeConfig
    .resolveStoredConfigValue({
      requestContext: input.requestContext,
      moduleId: platformModuleId.tenantManagement,
      key: tenantManagementConfigKey.membershipInviteReminderHoursBeforeExpiry,
      entitlements: [],
    })
    .pipe(
      Effect.flatMap((resolution) =>
        decodeTenantInvitationReminderHours(resolution.effectiveValue),
      ),
    );

const hasExhaustedTenantInvitationWorkflowRecoveryBudget = (attempts: number) =>
  attempts >= workflowJobsRetryMaxAttempts;

const readTenantInvitationWorkflowFailureMessage = (error: unknown) => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    if ("reason" in error && typeof error.reason === "string") {
      return error.reason;
    }

    if ("_tag" in error && typeof error._tag === "string") {
      return error._tag;
    }

    if ("cause" in error && error.cause instanceof Error) {
      return error.cause.message;
    }
  }

  return "Tenant invitation workflow job failed.";
};

const shouldBlockStaleRunningTenantInvitationWorkflowJob = (
  job: TenantInvitationNotificationWorkflowJobRecord,
) =>
  job.status === workflowJobStatus.running &&
  hasExhaustedTenantInvitationWorkflowRecoveryBudget(job.attempts) &&
  Date.parse(job.updatedAt) <=
    Date.now() - workflowJobsRunningClaimTimeoutSeconds * 1_000;

const loadTenantMembershipTuples = (input: {
  readonly oryKeto: Pick<OryKetoAdapter["Type"], "listTuples">;
  readonly tenant:
    | AdminTenantMembershipQueryBySessionRequest["tenant"]
    | AdminTenantMembershipMutationBySessionRequest["tenant"];
  readonly subject?: string;
}) =>
  Effect.forEach(
    tenantMembershipRelations,
    (relation) =>
      input.oryKeto
        .listTuples({
          namespace: authorizationNamespace.tenant,
          object: input.tenant.scopeId,
          relation,
          ...(input.subject === undefined ? {} : { subject: input.subject }),
        })
        .pipe(
          Effect.map((relationTuples) =>
            relationTuples.map((tuple) => ({
              subject: tuple.subject,
              relation,
            })),
          ),
        ),
    { concurrency: 1 },
  ).pipe(Effect.map((tupleGroups) => tupleGroups.flat()));

const buildTenantMembershipViewList = (input: {
  readonly tuples: ReadonlyArray<{
    readonly subject: string;
    readonly relation: TenantMembershipRelation;
  }>;
}) => {
  const relationsBySubject = new Map<string, Set<TenantMembershipRelation>>();

  for (const tuple of input.tuples) {
    const existingRelations = relationsBySubject.get(tuple.subject);

    if (existingRelations === undefined) {
      relationsBySubject.set(tuple.subject, new Set([tuple.relation]));
      continue;
    }

    existingRelations.add(tuple.relation);
  }

  return decodeTenantMembershipViewList(
    [...relationsBySubject.entries()]
      .map(([subject, relations]) => ({
        subject,
        relations: sortTenantMembershipRelations([...relations]),
      }))
      .sort((left, right) => left.subject.localeCompare(right.subject)),
  );
};

const readTenantMembershipView = (input: {
  readonly oryKeto: Pick<OryKetoAdapter["Type"], "listTuples">;
  readonly tenant: AdminTenantMembershipMutationBySessionRequest["tenant"];
  readonly subject: string;
}) =>
  loadTenantMembershipTuples({
    oryKeto: input.oryKeto,
    tenant: input.tenant,
    subject: input.subject,
  }).pipe(
    Effect.flatMap((tuples) => buildTenantMembershipViewList({ tuples })),
    Effect.flatMap((memberships) =>
      decodeTenantMembershipView(
        memberships.find(
          (membership) => membership.subject === input.subject,
        ) ?? {
          subject: input.subject,
          relations: [],
        },
      ),
    ),
  );

const missingTenantInvitationRepository = {
  createInvitation: () =>
    Effect.die(
      new Error(
        "Tenant invitation persistence is required before invitation workflows can run.",
      ),
    ),
  getInvitationById: () =>
    Effect.die(
      new Error(
        "Tenant invitation persistence is required before invitation workflows can run.",
      ),
    ),
  listInvitationsByTenant: () =>
    Effect.die(
      new Error(
        "Tenant invitation persistence is required before invitation workflows can run.",
      ),
    ),
  revokeInvitation: () =>
    Effect.die(
      new Error(
        "Tenant invitation persistence is required before invitation workflows can run.",
      ),
    ),
} as unknown as TenantInvitationPostgresRepository["Type"];

const missingRuntimeConfig = {
  resolveStoredConfigValue: () =>
    Effect.die(
      new Error(
        "Runtime config is required before tenant invitation workflows can resolve expiry.",
      ),
    ),
} as unknown as RuntimeConfigModule["Type"];

const missingIssuedInvitationPersistence: PersistIssuedTenantInvitation = () =>
  Effect.die(
    new Error(
      "Transactional tenant invitation persistence is required before invitation issue workflows can run.",
    ),
  );

const missingRevokedInvitationPersistence: PersistRevokedTenantInvitation =
  () =>
    Effect.die(
      new Error(
        "Transactional tenant invitation persistence is required before invitation revoke workflows can run.",
      ),
    );

export const makeAdminTenantManagementService = (
  options: AdminTenantManagementServiceOptions = {},
) =>
  Effect.gen(function* () {
    const auditLog = yield* AuditLogModule;
    const identitySession = yield* IdentitySessionModule;
    const onboardingRepository = yield* TenantOnboardingPostgresRepository;
    const oryKeto = yield* OryKetoAdapter;
    const authorization =
      options.authorization ??
      (yield* Effect.gen(function* () {
        const delegatedOryKeto = yield* OryKetoAdapter;

        return yield* makeAuthorizationModule({
          tuples: [],
          cacheTtlSeconds: 60,
          maxCacheSize: 128,
          delegatedCheck:
            createOryKetoAuthorizationDelegatedCheck(delegatedOryKeto),
          delegatedTupleLookup:
            createOryKetoAuthorizationDelegatedTupleLookup(delegatedOryKeto),
        });
      }));
    const invitationRepository =
      options.invitationRepository ?? missingTenantInvitationRepository;
    const persistIssuedInvitation =
      options.persistIssuedInvitation ?? missingIssuedInvitationPersistence;
    const persistRevokedInvitation =
      options.persistRevokedInvitation ?? missingRevokedInvitationPersistence;
    const runtimeConfig = options.runtimeConfig ?? missingRuntimeConfig;
    const workflowJobs = options.workflowJobs;
    const convexWorkflowClient = options.convexWorkflowClient;
    const emailDelivery = options.emailDelivery;
    const appBaseUrl = options.appBaseUrl;

    const requireWorkflowJobs = () =>
      workflowJobs === undefined
        ? Effect.fail({
            _tag: "AdminTenantManagementWorkflowUnavailableError",
            dependency: "workflowJobs",
            reason:
              "Tenant invitation workflow execution requires workflow-job persistence.",
          } satisfies AdminTenantManagementWorkflowUnavailableError)
        : Effect.succeed(workflowJobs);

    const buildTenantInvitationWorkflowRequestContext = (input: {
      readonly invitation: PersistTenantInvitationRecord;
      readonly reason: string;
    }): RequestContext => ({
      actorType: actorType.serviceActor,
      actorId: `${platformModuleId.tenantManagement}:invitation-workflow`,
      correlationId:
        input.invitation.correlationId ?? input.invitation.invitationId,
      tenant: {
        scope: input.invitation.tenantScope,
        scopeId: input.invitation.tenantScopeId,
      },
      reason: input.reason,
    });

    const persistTenantInvitationWorkflowDispatchFailure = (input: {
      readonly workflowJobs: TenantInvitationWorkflowJobsRepository;
      readonly job: TenantInvitationNotificationWorkflowJobRecord;
      readonly cause: Cause.Cause<
        | AdminTenantManagementWorkflowUnavailableError
        | ConvexWorkflowExecutionError
        | ParseResult.ParseError
        | WorkflowJobsPostgresRepositoryError
      >;
    }) => {
      const now = new Date().toISOString();

      return blockTenantInvitationWorkflowJob({
        job: input.job,
        now,
        lastError: Cause.pretty(input.cause),
      }).pipe(
        Effect.flatMap((blockedJob) =>
          input.workflowJobs.persistWorkflowJob(blockedJob),
        ),
        Effect.flatMap(() => Effect.failCause(input.cause)),
      );
    };

    const scheduleTenantInvitationWorkflowJob = (input: {
      readonly workflowJobs: TenantInvitationWorkflowJobsRepository;
      readonly job: TenantInvitationNotificationWorkflowJobRecord;
      readonly schedule: (input: {
        readonly jobId: string;
        readonly scheduledAt: string;
      }) => Effect.Effect<
        ConvexScheduledWorkflowDispatch,
        ConvexWorkflowExecutionError
      >;
    }) =>
      input.workflowJobs.persistWorkflowJob(input.job).pipe(
        Effect.flatMap((persistedJob) =>
          input
            .schedule({
              jobId: persistedJob.jobId,
              scheduledAt: persistedJob.scheduledAt,
            })
            .pipe(
              Effect.catchAllCause((cause) =>
                persistTenantInvitationWorkflowDispatchFailure({
                  workflowJobs: input.workflowJobs,
                  job: persistedJob,
                  cause,
                }),
              ),
              Effect.flatMap((dispatch) =>
                buildTenantInvitationWorkflowDispatchRecord({
                  job: persistedJob,
                  now: new Date().toISOString(),
                  dispatch,
                }).pipe(
                  Effect.catchAllCause((cause) =>
                    persistTenantInvitationWorkflowDispatchFailure({
                      workflowJobs: input.workflowJobs,
                      job: persistedJob,
                      cause,
                    }),
                  ),
                ),
              ),
              Effect.flatMap((dispatchedJob) =>
                input.workflowJobs.persistWorkflowJob(dispatchedJob).pipe(
                  Effect.catchAllCause((cause) =>
                    persistTenantInvitationWorkflowDispatchFailure({
                      workflowJobs: input.workflowJobs,
                      job: dispatchedJob,
                      cause,
                    }),
                  ),
                ),
              ),
            ),
        ),
      );

    const scheduleIssuedTenantInvitationFollowUpWorkflows = (input: {
      readonly invitation: PersistTenantInvitationRecord;
      readonly relation: TenantMembershipRelation;
      readonly requestContext: RequestContext;
    }) => {
      if (workflowJobs === undefined || convexWorkflowClient === undefined) {
        return Effect.void;
      }

      const issuedAtMs = Date.parse(
        input.invitation.issuedAt ?? input.invitation.expiresAt,
      );
      const expiresAtMs = Date.parse(input.invitation.expiresAt);

      return resolveTenantInvitationReminderHours({
        runtimeConfig,
        requestContext: input.requestContext,
      }).pipe(
        Effect.flatMap((reminderHoursBeforeExpiry) => {
          const reminderScheduledAtMs =
            expiresAtMs - reminderHoursBeforeExpiry * 60 * 60 * 1_000;
          const now = new Date().toISOString();
          const scheduleEffects: Array<Effect.Effect<unknown, unknown>> = [];

          if (
            Number.isFinite(reminderScheduledAtMs) &&
            reminderScheduledAtMs > issuedAtMs &&
            reminderScheduledAtMs < expiresAtMs
          ) {
            scheduleEffects.push(
              buildTenantInvitationReminderWorkflowJobRecord({
                invitation: input.invitation,
                relation: input.relation,
                scheduledAt: new Date(reminderScheduledAtMs).toISOString(),
                now,
              }).pipe(
                Effect.flatMap((job) =>
                  scheduleTenantInvitationWorkflowJob({
                    workflowJobs,
                    job,
                    schedule: ({ jobId, scheduledAt }) =>
                      convexWorkflowClient.scheduleTenantInvitationReminderWorkflowJob(
                        { jobId, scheduledAt },
                      ),
                  }),
                ),
              ),
            );
          }

          scheduleEffects.push(
            buildTenantInvitationExpiryNotificationWorkflowJobRecord({
              invitation: input.invitation,
              relation: input.relation,
              scheduledAt: input.invitation.expiresAt,
              now,
            }).pipe(
              Effect.flatMap((job) =>
                scheduleTenantInvitationWorkflowJob({
                  workflowJobs,
                  job,
                  schedule: ({ jobId, scheduledAt }) =>
                    convexWorkflowClient.scheduleTenantInvitationExpiryNotificationWorkflowJob(
                      { jobId, scheduledAt },
                    ),
                }),
              ),
            ),
          );

          return Effect.all(scheduleEffects, { concurrency: 1 }).pipe(
            Effect.asVoid,
          );
        }),
        Effect.catchAllCause(() => Effect.void),
      );
    };

    const runTenantInvitationWorkflowJob = (input: {
      readonly jobId: string;
      readonly expectedKind:
        | typeof workflowJobKind.invitationReminder
        | typeof workflowJobKind.invitationExpiryNotification;
      readonly alreadyQueuedAt: (
        invitation: PersistTenantInvitationRecord,
      ) => string | undefined;
      readonly shouldSkipSend: (input: {
        readonly invitation: PersistTenantInvitationRecord;
        readonly now: string;
      }) => boolean;
      readonly markQueued: (input: {
        readonly invitation: PersistTenantInvitationRecord;
        readonly now: string;
      }) => PersistTenantInvitationRecord;
      readonly send: (input: {
        readonly requestContext: RequestContext;
        readonly tenant: AdminTenantInvitationIssueBySessionRequest["tenant"];
        readonly recipientEmail: string;
        readonly relation: TenantMembershipRelation;
        readonly expiresAt: string;
      }) => Effect.Effect<
        ReturnType<
          typeof buildQueuedInvitationDeliveryOutcome
        > extends Effect.Effect<
          infer Success,
          infer _Error,
          infer _Requirements
        >
          ? Success
          : never,
        | AdminTenantManagementWorkflowUnavailableError
        | EmailDeliveryServiceError
        | ParseResult.ParseError
      >;
    }) =>
      Effect.gen(function* () {
        const workflowJobs = yield* requireWorkflowJobs();

        return yield* executeWorkflowJobRecord({
          jobId: input.jobId,
          loadJob: ({ jobId }) => workflowJobs.getWorkflowJob({ jobId }),
          shouldBlockStaleRunningJob: ({ job }) =>
            shouldBlockStaleRunningTenantInvitationWorkflowJob(job),
          blockStaleRunningJob: ({ job }) => {
            const now = new Date().toISOString();

            return blockTenantInvitationWorkflowJob({
              job,
              now,
              lastError:
                "Tenant invitation workflow job exceeded the recovery budget.",
            }).pipe(
              Effect.flatMap((blockedJob) =>
                workflowJobs.persistWorkflowJob(blockedJob),
              ),
            );
          },
          claimScheduledJob: ({ jobId }) =>
            workflowJobs.claimScheduledWorkflowJob({
              jobId,
              now: new Date().toISOString(),
            }),
          runClaimedJob: ({ job }) => {
            const now = new Date().toISOString();

            if (job.kind !== input.expectedKind) {
              return blockTenantInvitationWorkflowJob({
                job,
                now,
                lastError: `Expected workflow kind ${input.expectedKind}.`,
              }).pipe(
                Effect.flatMap((blockedJob) =>
                  workflowJobs.persistWorkflowJob(blockedJob),
                ),
              );
            }

            return invitationRepository
              .getInvitationById({
                tenantScope: job.payload.tenantScope,
                tenantScopeId: job.payload.tenantScopeId,
                invitationId: job.payload.invitationId,
              })
              .pipe(
                Effect.flatMap((invitation) =>
                  invitation === undefined
                    ? Effect.fail(
                        createTenantInvitationNotFoundError(
                          job.payload.invitationId,
                        ),
                      )
                    : Effect.succeed(invitation),
                ),
                Effect.flatMap((invitation) => {
                  if (
                    invitation.status !==
                      tenantInvitationPersistedStatus.pending ||
                    input.alreadyQueuedAt(invitation) !== undefined ||
                    input.shouldSkipSend({ invitation, now })
                  ) {
                    return completeTenantInvitationWorkflowJob({
                      job,
                      now,
                    });
                  }

                  const requestContext =
                    buildTenantInvitationWorkflowRequestContext({
                      invitation,
                      reason:
                        input.expectedKind ===
                        workflowJobKind.invitationReminder
                          ? "Queue tenant invitation reminder email."
                          : "Queue tenant invitation expiry notification email.",
                    });

                  return input
                    .send({
                      requestContext,
                      tenant: requestContext.tenant,
                      recipientEmail: invitation.recipientEmail,
                      relation: invitation.relation,
                      expiresAt: invitation.expiresAt,
                    })
                    .pipe(
                      Effect.flatMap(() =>
                        invitationRepository.createInvitation(
                          input.markQueued({ invitation, now }),
                        ),
                      ),
                      Effect.flatMap(() =>
                        completeTenantInvitationWorkflowJob({ job, now }),
                      ),
                    );
                }),
                Effect.catchAll((error) =>
                  blockTenantInvitationWorkflowJob({
                    job,
                    now,
                    lastError:
                      readTenantInvitationWorkflowFailureMessage(error),
                  }),
                ),
                Effect.flatMap((record) =>
                  workflowJobs.persistWorkflowJob(record),
                ),
              );
          },
          recoverClaimedJobFailure: ({ job, cause }) => {
            const now = new Date().toISOString();

            return blockTenantInvitationWorkflowJob({
              job,
              now,
              lastError: Cause.pretty(cause),
            }).pipe(
              Effect.flatMap((blockedJob) =>
                workflowJobs.persistWorkflowJob(blockedJob),
              ),
              Effect.flatMap((blockedJob) =>
                buildWorkflowJobSummary({ record: blockedJob }),
              ),
            );
          },
          summarize: ({ record }) => buildWorkflowJobSummary({ record }),
        });
      });

    return {
      reviewTenantOnboarding: (
        input: AdminTenantOnboardingReviewBySessionRequest,
      ) =>
        Schema.decodeUnknown(AdminTenantOnboardingReviewBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const inspectionReason = normalizeInspectionReason(
                request.inspectionReason,
              );
              const auditRequestContext = buildTenantAuditRequestContext({
                requestContext,
                tenant: request.tenant,
              });

              yield* authorizeTenantReadAccess({
                authorization,
                requestContext,
                tenant: request.tenant,
              });

              const run = yield* onboardingRepository.getOnboardingRunByTenant({
                tenantScope: request.tenant.scope,
                tenantScopeId: request.tenant.scopeId,
              });

              yield* auditLog.append({
                requestContext: auditRequestContext,
                moduleId: platformModuleId.tenantManagement,
                action: tenantManagementAuditAction.onboardingInspected,
                target: buildTenantOnboardingAuditTarget(request.tenant),
                ...(inspectionReason === undefined
                  ? {}
                  : { reason: inspectionReason }),
              });

              return yield* Schema.decodeUnknown(
                AdminTenantOnboardingReviewResultSchema,
              )({
                tenant: request.tenant,
                ...(run === undefined ? {} : { run }),
              });
            }),
          ),
        ),
      listTenantInvitations: (
        input: AdminTenantInvitationQueryBySessionRequest,
      ) =>
        Schema.decodeUnknown(AdminTenantInvitationQueryBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const inspectionReason = normalizeInspectionReason(
                request.inspectionReason,
              );
              const auditRequestContext = buildTenantAuditRequestContext({
                requestContext,
                tenant: request.tenant,
              });

              yield* authorizeTenantReadAccess({
                authorization,
                requestContext,
                tenant: request.tenant,
              });

              const records =
                yield* invitationRepository.listInvitationsByTenant({
                  tenantScope: request.tenant.scope,
                  tenantScopeId: request.tenant.scopeId,
                });
              const invitations = yield* buildTenantInvitationViewList({
                records,
                now: new Date(),
              });

              yield* auditLog.append({
                requestContext: auditRequestContext,
                moduleId: platformModuleId.tenantManagement,
                action: tenantManagementAuditAction.invitationsInspected,
                target: buildTenantInvitationAuditTarget(request.tenant),
                ...(inspectionReason === undefined
                  ? {}
                  : { reason: inspectionReason }),
              });

              return yield* Schema.decodeUnknown(
                AdminTenantInvitationQueryResultSchema,
              )({
                tenant: request.tenant,
                invitations,
              });
            }),
          ),
        ),
      listTenantMemberships: (
        input: AdminTenantMembershipQueryBySessionRequest,
      ) =>
        Schema.decodeUnknown(AdminTenantMembershipQueryBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const inspectionReason = normalizeInspectionReason(
                request.inspectionReason,
              );
              const auditRequestContext = buildTenantAuditRequestContext({
                requestContext,
                tenant: request.tenant,
              });

              yield* authorizeTenantReadAccess({
                authorization,
                requestContext,
                tenant: request.tenant,
              });

              const tuples = yield* loadTenantMembershipTuples({
                oryKeto,
                tenant: request.tenant,
              });
              const memberships = yield* buildTenantMembershipViewList({
                tuples,
              });

              yield* auditLog.append({
                requestContext: auditRequestContext,
                moduleId: platformModuleId.tenantManagement,
                action: tenantManagementAuditAction.membershipsInspected,
                target: buildTenantMembershipAuditTarget(request.tenant),
                ...(inspectionReason === undefined
                  ? {}
                  : { reason: inspectionReason }),
              });

              return yield* Schema.decodeUnknown(
                AdminTenantMembershipQueryResultSchema,
              )({
                tenant: request.tenant,
                memberships,
              });
            }),
          ),
        ),
      mutateTenantMembership: (
        input: AdminTenantMembershipMutationBySessionRequest,
      ) =>
        Schema.decodeUnknown(
          AdminTenantMembershipMutationBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const mutationReason = yield* normalizeRequiredReason(
                request.mutationReason,
              );
              const auditRequestContext = buildTenantAuditRequestContext({
                requestContext,
                tenant: request.tenant,
              });

              yield* authorizeTenantMembershipManageAccess({
                authorization,
                requestContext,
                tenant: request.tenant,
              });

              const currentMembership = yield* readTenantMembershipView({
                oryKeto,
                tenant: request.tenant,
                subject: request.subject,
              });
              const relationPresent = currentMembership.relations.includes(
                request.relation,
              );
              const changed =
                request.action === tenantMembershipMutationAction.grant
                  ? !relationPresent
                  : relationPresent;

              let membership = currentMembership;

              if (changed) {
                const tuple = {
                  namespace: authorizationNamespace.tenant,
                  object: request.tenant.scopeId,
                  relation: request.relation,
                  subject: request.subject,
                };

                if (request.action === tenantMembershipMutationAction.grant) {
                  yield* oryKeto.writeTuple(tuple);
                } else {
                  yield* oryKeto.deleteTuple(tuple);
                }

                membership = yield* readTenantMembershipView({
                  oryKeto,
                  tenant: request.tenant,
                  subject: request.subject,
                });

                yield* auditLog.append({
                  requestContext: auditRequestContext,
                  moduleId: platformModuleId.tenantManagement,
                  action:
                    request.action === tenantMembershipMutationAction.grant
                      ? tenantManagementAuditAction.membershipGranted
                      : tenantManagementAuditAction.membershipRevoked,
                  target: buildTenantMembershipMutationAuditTarget({
                    tenant: request.tenant,
                    subject: request.subject,
                    relation: request.relation,
                  }),
                  reason: mutationReason,
                });
              }

              return yield* Schema.decodeUnknown(
                AdminTenantMembershipMutationResultSchema,
              )({
                tenant: request.tenant,
                subject: request.subject,
                relation: request.relation,
                action: request.action,
                changed,
                membership,
              });
            }),
          ),
        ),
      issueTenantInvitation: (
        input: AdminTenantInvitationIssueBySessionRequest,
      ) =>
        Schema.decodeUnknown(AdminTenantInvitationIssueBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const issueReason = yield* normalizeRequiredReason(
                request.issueReason,
              );
              const recipientEmail = yield* Schema.decodeUnknown(
                Schema.NonEmptyString,
              )(request.recipientEmail.trim());
              const auditRequestContext = buildTenantAuditRequestContext({
                requestContext,
                tenant: request.tenant,
              });

              yield* authorizeTenantMembershipManageAccess({
                authorization,
                requestContext,
                tenant: request.tenant,
              });

              const inviteExpiryHours =
                yield* resolveTenantInvitationExpiryHours({
                  runtimeConfig,
                  requestContext: auditRequestContext,
                });
              const issuedAt = new Date();
              const issuedBy =
                requestContext.actorId ??
                `${requestContext.actorType}:anonymous`;
              const invitationToken = createTenantInvitationToken();
              const tokenHash =
                yield* hashTenantInvitationToken(invitationToken);
              const invitationRecord = {
                invitationId: `invite_${crypto.randomUUID()}`,
                tenantScope: request.tenant.scope,
                tenantScopeId: request.tenant.scopeId,
                tokenHash,
                recipientEmail,
                relation: request.relation,
                status: "pending",
                issuedBy,
                correlationId: requestContext.correlationId,
                issuedAt: issuedAt.toISOString(),
                expiresAt: new Date(
                  issuedAt.getTime() + inviteExpiryHours * 60 * 60 * 1000,
                ).toISOString(),
              } satisfies PersistTenantInvitationRecord;

              yield* persistIssuedInvitation({
                invitation: invitationRecord,
                auditInput: {
                  requestContext: auditRequestContext,
                  moduleId: platformModuleId.tenantManagement,
                  action: tenantManagementAuditAction.invitationIssued,
                  target: buildTenantInvitationMutationAuditTarget({
                    tenant: request.tenant,
                    invitationId: invitationRecord.invitationId,
                  }),
                  reason: issueReason,
                },
              });

              const invitation = yield* buildTenantInvitationView({
                record: invitationRecord,
                now: issuedAt,
              });
              const delivery = yield* sendIssuedTenantInvitationEmail({
                requestContext: auditRequestContext,
                tenant: request.tenant,
                recipientEmail,
                relation: request.relation,
                invitationToken,
                expiresAt: invitation.expiresAt,
                ...(options.appBaseUrl !== undefined
                  ? { appBaseUrl: options.appBaseUrl }
                  : {}),
                ...(options.emailDelivery !== undefined
                  ? { emailDelivery: options.emailDelivery }
                  : {}),
              });

              if (
                delivery.status === tenantInvitationEmailDeliveryStatus.queued
              ) {
                yield* scheduleIssuedTenantInvitationFollowUpWorkflows({
                  invitation: invitationRecord,
                  relation: request.relation,
                  requestContext: auditRequestContext,
                });
              }

              return yield* Schema.decodeUnknown(
                AdminTenantInvitationIssueResultSchema,
              )({
                tenant: request.tenant,
                invitation,
                handoff: {
                  invitationToken,
                  expiresAt: invitation.expiresAt,
                },
                delivery,
              });
            }),
          ),
        ),
      runTenantInvitationReminderWorkflowJob: (
        input: RunTenantInvitationReminderWorkflowJobRequest,
      ) =>
        Schema.decodeUnknown(
          RunTenantInvitationReminderWorkflowJobRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            runTenantInvitationWorkflowJob({
              jobId: request.jobId,
              expectedKind: workflowJobKind.invitationReminder,
              alreadyQueuedAt: (invitation) => invitation.reminderQueuedAt,
              shouldSkipSend: ({ invitation, now }) =>
                Date.parse(now) >= Date.parse(invitation.expiresAt),
              markQueued: ({ invitation, now }) => ({
                ...invitation,
                reminderQueuedAt: now,
              }),
              send: ({
                requestContext,
                tenant,
                recipientEmail,
                relation,
                expiresAt,
              }) =>
                sendTenantInvitationReminderEmail({
                  requestContext,
                  tenant,
                  recipientEmail,
                  relation,
                  expiresAt,
                  ...(appBaseUrl !== undefined ? { appBaseUrl } : {}),
                  ...(emailDelivery !== undefined ? { emailDelivery } : {}),
                }),
            }),
          ),
        ),
      runTenantInvitationExpiryNotificationWorkflowJob: (
        input: RunTenantInvitationExpiryNotificationWorkflowJobRequest,
      ) =>
        Schema.decodeUnknown(
          RunTenantInvitationExpiryNotificationWorkflowJobRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            runTenantInvitationWorkflowJob({
              jobId: request.jobId,
              expectedKind: workflowJobKind.invitationExpiryNotification,
              alreadyQueuedAt: (invitation) =>
                invitation.expiryNotificationQueuedAt,
              shouldSkipSend: () => false,
              markQueued: ({ invitation, now }) => ({
                ...invitation,
                expiryNotificationQueuedAt: now,
              }),
              send: ({
                requestContext,
                tenant,
                recipientEmail,
                relation,
                expiresAt,
              }) =>
                sendTenantInvitationExpiryNotificationEmail({
                  requestContext,
                  tenant,
                  recipientEmail,
                  relation,
                  expiresAt,
                  ...(appBaseUrl !== undefined ? { appBaseUrl } : {}),
                  ...(emailDelivery !== undefined ? { emailDelivery } : {}),
                }),
            }),
          ),
        ),
      revokeTenantInvitation: (
        input: AdminTenantInvitationRevokeBySessionRequest,
      ) =>
        Schema.decodeUnknown(AdminTenantInvitationRevokeBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const revocationReason = yield* normalizeRequiredReason(
                request.revocationReason,
              );
              const auditRequestContext = buildTenantAuditRequestContext({
                requestContext,
                tenant: request.tenant,
              });

              yield* authorizeTenantMembershipManageAccess({
                authorization,
                requestContext,
                tenant: request.tenant,
              });

              const existingRecord =
                yield* invitationRepository.getInvitationById({
                  tenantScope: request.tenant.scope,
                  tenantScopeId: request.tenant.scopeId,
                  invitationId: request.invitationId,
                });
              const ensuredExistingRecord =
                existingRecord ??
                (yield* Effect.fail(
                  createTenantInvitationNotFoundError(request.invitationId),
                ));

              const now = new Date();
              const currentInvitation = yield* buildTenantInvitationView({
                record: ensuredExistingRecord,
                now,
              });
              let changed = false;
              let invitation = currentInvitation;

              if (currentInvitation.status === tenantInvitationStatus.pending) {
                const revokedBy =
                  requestContext.actorId ??
                  `${requestContext.actorType}:anonymous`;
                const revokedAt = now.toISOString();
                const revokedRecord = yield* persistRevokedInvitation({
                  invitation: ensuredExistingRecord,
                  revokedBy,
                  revokedAt,
                  auditInput: {
                    requestContext: auditRequestContext,
                    moduleId: platformModuleId.tenantManagement,
                    action: tenantManagementAuditAction.invitationRevoked,
                    target: buildTenantInvitationMutationAuditTarget({
                      tenant: request.tenant,
                      invitationId: request.invitationId,
                    }),
                    reason: revocationReason,
                  },
                });

                if (revokedRecord === undefined) {
                  const currentRecord =
                    yield* invitationRepository.getInvitationById({
                      tenantScope: request.tenant.scope,
                      tenantScopeId: request.tenant.scopeId,
                      invitationId: request.invitationId,
                    });
                  const ensuredCurrentRecord =
                    currentRecord ??
                    (yield* Effect.fail(
                      createTenantInvitationNotFoundError(request.invitationId),
                    ));

                  invitation = yield* buildTenantInvitationView({
                    record: ensuredCurrentRecord,
                    now,
                  });
                } else {
                  changed = true;
                  invitation = yield* buildTenantInvitationView({
                    record: revokedRecord,
                    now,
                  });
                }
              }

              return yield* Schema.decodeUnknown(
                AdminTenantInvitationRevokeResultSchema,
              )({
                tenant: request.tenant,
                invitationId: request.invitationId,
                changed,
                invitation,
              });
            }),
          ),
        ),
    } satisfies AdminTenantManagementService;
  });

const makeAdminTenantManagementRuntime = (
  options: AdminTenantManagementRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const keycloak = yield* makeKeycloakAdapter({
      baseUrl: options.keycloakBaseUrl,
      realm: options.keycloakRealm,
      clientId: options.keycloakClientId,
      clientSecret: options.keycloakClientSecret,
    });
    const oryKeto = yield* makeOryKetoAdapter({
      readUrl: options.ketoReadUrl,
      writeUrl: options.ketoWriteUrl,
    });
    const valkey = yield* makeValkeyAdapter({
      url: options.valkeyUrl,
    });
    const tenantManagement = yield* makeTenantManagementModule();
    const identityRepository =
      yield* makeIdentitySessionPostgresRepository(writeDatabase);
    const runtimeConfigQueryable: RuntimeConfigPostgresQueryable = {
      listOverridesByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigOverridesTable)
          .where(eq(runtimeConfigOverridesTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigOverridesTable.changedAt)),
      listOverrideProposalsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigOverrideProposalsTable)
          .where(eq(runtimeConfigOverrideProposalsTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigOverrideProposalsTable.changedAt)),
      listSyncArtifactsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigSyncArtifactsTable)
          .where(eq(runtimeConfigSyncArtifactsTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigSyncArtifactsTable.generatedAt)),
    };
    const runtimeConfigRepository = yield* makeRuntimeConfigPostgresRepository({
      ...writeDatabase,
      ...runtimeConfigQueryable,
    });
    const runtimeConfig = yield* makeRuntimeConfigModule(
      runtimeConfigRepository,
    );
    const workflowJobs =
      yield* makeWorkflowJobsPostgresRepositoryForRecordSchema(
        writeDatabase,
        buildWorkflowJobsPostgresQueryable<TenantInvitationNotificationWorkflowJobRecord>(
          writeDatabase,
        ),
        TenantInvitationNotificationWorkflowJobRecordSchema,
      );
    const invitationRepository =
      yield* makeTenantInvitationPostgresRepository(writeDatabase);
    const onboardingRepository =
      yield* makeTenantOnboardingPostgresRepository(writeDatabase);
    const tenantProvisioningRepository =
      yield* makeTenantProvisioningPostgresRepository(writeDatabase);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: async (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: async (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: async (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: async (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const emailDeliveryRuntime =
      options.emailDelivery === undefined
        ? undefined
        : yield* makeEmailDeliveryRuntime({
            postgresUrl: options.postgresUrl,
            postalApiUrl: options.emailDelivery.postalApiUrl,
            postalApiKey: options.emailDelivery.postalApiKey,
            platformSender: options.emailDelivery.platformSender,
          });
    const authenticatedConvexWorkflowClient =
      yield* makeAuthenticatedConvexWorkflowClient({
        deploymentUrl: options.convexUrl,
        siteUrl: options.convexSiteUrl,
        adminKey: options.convexAdminKey,
        keycloakBaseUrl: options.keycloakBaseUrl,
        keycloakRealm: options.keycloakRealm,
        keycloakClientId: options.keycloakClientId,
        keycloakClientSecret: options.keycloakClientSecret,
        keycloakConvexServiceActorUsername:
          options.keycloakConvexServiceActorUsername,
        keycloakConvexServiceActorPassword:
          options.keycloakConvexServiceActorPassword,
      });
    const identitySession = yield* makeIdentitySessionModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(ValkeyAdapter, valkey),
      Effect.provideService(
        TenantProvisioningPostgresRepository,
        tenantProvisioningRepository,
      ),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
      Effect.provideService(
        IdentitySessionPostgresRepository,
        identityRepository,
      ),
      Effect.provideService(TenantManagementModule, tenantManagement),
    );
    const service = yield* makeAdminTenantManagementService({
      invitationRepository,
      persistIssuedInvitation:
        createPersistIssuedTenantInvitation(writeDatabase),
      persistRevokedInvitation:
        createPersistRevokedTenantInvitation(writeDatabase),
      runtimeConfig,
      workflowJobs,
      convexWorkflowClient: authenticatedConvexWorkflowClient,
      ...(options.emailDelivery !== undefined &&
      emailDeliveryRuntime !== undefined
        ? {
            appBaseUrl: options.emailDelivery.appBaseUrl,
            emailDelivery: emailDeliveryRuntime.service,
          }
        : {}),
    }).pipe(
      Effect.provideService(AuditLogModule, auditLog),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(
        TenantInvitationPostgresRepository,
        invitationRepository,
      ),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
      Effect.provideService(OryKetoAdapter, oryKeto),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
        ...(emailDeliveryRuntime !== undefined
          ? [Effect.ignore(emailDeliveryRuntime.close)]
          : []),
      ]).pipe(Effect.asVoid),
    };
  });

const runAdminTenantManagementWithResolvedOptions = <A, E>(
  options: AdminTenantManagementRuntimeOptions,
  use: (service: AdminTenantManagementService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeAdminTenantManagementRuntime(options);

    return yield* Effect.ensuring(use(runtime.service), runtime.close);
  });

export const resolveAdminTenantManagementRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Effect.all({
    resolvedEnvironment:
      decodeAdminTenantManagementProcessEnvironment(environment),
    workflowEnvironment:
      decodeAdminTenantManagementWorkflowProcessEnvironment(environment),
    emailDeliveryOptions:
      resolveOptionalAdminTenantManagementInvitationEmailRuntimeOptions(
        environment,
      ),
  }).pipe(
    Effect.flatMap(
      ({ resolvedEnvironment, workflowEnvironment, emailDeliveryOptions }) =>
        decodeAdminTenantManagementRuntimeOptions({
          postgresUrl: resolvedEnvironment.POSTGRES_URL,
          keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
          keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
          keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
          keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
          convexUrl: workflowEnvironment.CONVEX_SELF_HOSTED_URL,
          convexSiteUrl: workflowEnvironment.CONVEX_SELF_HOSTED_SITE_URL,
          convexAdminKey: workflowEnvironment.CONVEX_SELF_HOSTED_ADMIN_KEY,
          keycloakConvexServiceActorUsername:
            workflowEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME,
          keycloakConvexServiceActorPassword:
            workflowEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD,
          valkeyUrl: resolvedEnvironment.VALKEY_URL,
          ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
          ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
          ...(emailDeliveryOptions !== undefined
            ? { emailDelivery: emailDeliveryOptions }
            : {}),
        }),
    ),
  );

export const runAdminTenantManagementFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminTenantManagementService) => Effect.Effect<A, E>,
) =>
  resolveAdminTenantManagementRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      runAdminTenantManagementWithResolvedOptions(options, use),
    ),
  );

export const runAdminTenantInvitationReminderWorkflowJobFromEnvironment = (
  environment: unknown,
  input: RunTenantInvitationReminderWorkflowJobRequest,
) =>
  runAdminTenantManagementFromEnvironment(environment, (service) =>
    service.runTenantInvitationReminderWorkflowJob(input),
  );

export const runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment =
  (
    environment: unknown,
    input: RunTenantInvitationExpiryNotificationWorkflowJobRequest,
  ) =>
    runAdminTenantManagementFromEnvironment(environment, (service) =>
      service.runTenantInvitationExpiryNotificationWorkflowJob(input),
    );
