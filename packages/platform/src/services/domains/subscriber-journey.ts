import { Cause, Effect, ParseResult, Schema } from "effect";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  findModuleManifest,
  resolveDefaultTenantOnboardingEnabledModules,
  workflowJobsReconciliationDeadlineSeconds,
  workflowJobsReconciliationSweepIntervalMinutes,
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  type PlatformModuleId,
} from "@comvestec/config";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  billingAndMeteringFeatureFlag,
  billingMeteringMode,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  billingPaymentEventStatus,
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  billingWebhookReceiptProcessingState,
  BillingEntitlementQuotaSnapshotSchema,
  BillingCheckoutSessionInputSchema,
  IsoTimestampSchema,
  type BillingCheckoutSessionInput,
  type BillingCheckoutSession,
  type BillingProviderWebhookInput,
  GovernanceEntitlementFeatureKeySchema,
  onboardingStepStatus,
  type PublicBillingPlanCatalog,
  permissionScope,
  platformModuleId,
  PlatformModuleIdSchema,
  platformScope,
  projectionProfile,
  retentionLegalHoldStatus,
  RequestContextSchema,
  TenantContextSchema,
  type RequestContext,
  type WorkflowJobSummary,
} from "@comvestec/contracts";
import {
  billingCustomerAccountLinkageSource,
  buildBillingReconciliationWorkflowJobId,
  buildWorkflowJobSummary,
  type BillingCustomerAccountRecord,
  BillingCustomerAccountRecordSchema,
  type BillingCustomerAccountResolverApi,
  type BillingCustomerAccountResolutionError,
  BillingCustomerAccountResolver,
  type BillingReconciliationWorkflowJobRecord,
  BillingReconciliationWorkflowJobRecordSchema,
  BillingStatePostgresRepository,
  BillingWebhookReplayPostgresRepository,
  BillingWebhookService,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
  billingCustomerAccountsTable,
  auditLogEventsTable,
  identitySessionLifecycleEventType,
  identitySessionAuditTable,
  retentionLegalHoldsTable,
  retentionPoliciesTable,
  webhookReceiptsTable,
  webhookApiKeysTable,
  webhookOutboundDeliveriesTable,
  webhookSubscriptionsTable,
  workflowJobRuntime,
  type AuditLogPostgresQueryable,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  WorkflowJobsPostgresRepository,
  type WorkflowJobsPostgresRepositoryError,
  buildWorkflowJobsPostgresQueryable,
  makeWorkflowJobsPostgresRepository,
  type BillingWebhookProcessingResult,
  type BillingWebhookReplayPostgresQueryable,
  type BillingStatePostgresRepositoryError,
  type BillingStatePostgresQueryable,
  type RetentionLegalHoldPostgresQueryable,
  RetentionLegalHoldPostgresRepository,
  type RetentionLegalHoldPostgresRepositoryError,
  type WebhookApiKeyPostgresQueryable,
  WebhookApiKeyPostgresRepository,
  type WebhookOutboundDeliveryPostgresQueryable,
  WebhookOutboundDeliveryPostgresRepository,
  type WebhookSubscriptionPostgresQueryable,
  WebhookSubscriptionPostgresRepository,
  type BillingWebhookProcessingError,
  type IdentitySessionCompletionInput,
  type IdentitySessionCompletionResult,
  type IdentitySessionInvalidationInput,
  type IdentitySessionInvalidationResult,
  type IdentitySessionModuleError,
  type IdentitySessionPostgresRepositoryError,
  type IdentitySessionRequestContextLookup,
  identitySessionRunIdPrefix,
  type IdentitySessionStartInput,
  type IdentitySessionStartResult,
  IdentitySessionModule,
  IdentitySessionPostgresRepository,
  makeBillingMeteringModule,
  makeBillingWebhookReplayPostgresRepository,
  makeBillingStatePostgresRepository,
  buildEmailDeliveryPostgresQueryable,
  makeBillingWebhookPostgresRepository,
  makeEmailDeliveryPostgresRepository,
  makeWebhookApiKeyPostgresRepository,
  makeWebhookOutboundDeliveryPostgresRepository,
  makeWebhookSubscriptionPostgresRepository,
  makeBillingWebhookService,
  makeRetentionLegalHoldModule,
  makeRetentionLegalHoldPostgresRepository,
  makeRuntimeConfigModule,
  makeRuntimeConfigPostgresRepository,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeFieldSecurityModule,
  makeTenantManagementModule,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  type AuthorizationDelegatedCheckError,
  BillingMeteringModule,
  BillingWebhookPostgresRepository,
  createProvisioningTenantContext,
  makeAuthorizationModule,
  makeWebhooksApiAccessModule,
  actorSupportsPrivilegedSupportEscalation,
  hasPrivilegedBreakGlassAccess,
  type TenantOnboardingPostgresRepositoryError,
  TenantOnboardingPostgresRepository,
  tenantOnboardingRunStatus,
  tenantOnboardingRunsTable,
  type TenantOwnerProvisioningActorMissingError,
  TenantProvisioningPostgresRepository,
  TenantManagementModule,
  tenantProvisioningReceiptsTable,
  tenantProvisioningStatus,
  type RetentionLegalHoldModuleError,
  type WebhooksApiAccessModuleError,
  WebhooksApiAccessModule,
  type AuthorizationDecision,
  type BillingEntitlementRecord,
  type BillingWebhookPersistenceProjection,
  type RuntimeConfigModulePersistenceError,
  type RuntimeConfigModuleService,
  type RuntimeConfigPostgresQueryable,
  type TenantProvisioningPostgresRepositoryError,
  type UnknownConfigKeyError,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
} from "@comvestec/modules";
import {
  makeConvexAdapter,
  makeKeycloakAdapter,
  makeOpenmeterAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostgresAdapter,
  makeUnleashAdapter,
  makeValkeyAdapter,
  ConvexAdapter,
  type ConvexAdapterService,
  type ConvexWorkflowExecutionError,
  type OpenmeterAdapterError,
  type OpenmeterAdapterService,
  PolarAdapter,
  type PolarAdapterRequestError,
  type PolarCatalogMetadataError,
  type PolarPlanNotFoundError,
  type PolarPriceNotFoundError,
  type PolarWebhookSignatureError,
  KeycloakAdapter,
  type KeycloakAdapterRequestError,
  type KeycloakSessionIdentifierMissingError,
  type KeycloakSessionInactiveError,
  OryKetoAdapter,
  type OryKetoAdapterRequestError,
  platformAdapterServiceName,
  PlatformAdapterServiceNameSchema,
  ValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import {
  type AppSnapshotBrandingResolutionError,
  type MissingModuleManifestError,
  PublicWebSnapshotSchema,
  getPublicWebSnapshotForRequestContextWithRuntimeConfig,
  type ProductAppSnapshot,
  getProductAppSnapshotForRequestContextWithRuntimeConfig,
} from "../apps/app-snapshots";
import { makeRuntimeFeatureFlagRollout } from "../governance/runtime-feature-flag-rollout";
import { buildWriteDatabase } from "../postgres-write-database";
import { executeWorkflowJobRecord } from "./workflow-jobs";

export const SubscriberJourneyBootstrapInputSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type SubscriberJourneyBootstrapInput = Schema.Schema.Type<
  typeof SubscriberJourneyBootstrapInputSchema
>;

const PublicAuthStartTenantScopeHintSchema = Schema.Literal(
  platformScope.organization,
  platformScope.individual,
);

export const PublicAuthStartPreparationInputSchema = Schema.Struct({
  correlationId: Schema.optional(Schema.NonEmptyString),
  host: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  tenantScopeHint: Schema.optional(PublicAuthStartTenantScopeHintSchema),
});

export type PublicAuthStartPreparationInput = Schema.Schema.Type<
  typeof PublicAuthStartPreparationInputSchema
>;

export const PublicAuthStartPreparationSchema = Schema.Struct({
  correlationId: Schema.NonEmptyString,
  requestContext: RequestContextSchema,
  tenant: TenantContextSchema,
  enabledModules: Schema.Array(PlatformModuleIdSchema),
  snapshot: PublicWebSnapshotSchema,
});

export type PublicAuthStartPreparation = Schema.Schema.Type<
  typeof PublicAuthStartPreparationSchema
>;

export type PublicAuthStartPreparationError =
  | MissingModuleManifestError
  | AppSnapshotBrandingResolutionError
  | BillingStatePostgresRepositoryError;

const SubscriberJourneyWebhookReplayInputSchema = Schema.Struct({
  provider: PlatformAdapterServiceNameSchema,
  deliveryId: Schema.NonEmptyString,
});

export type SubscriberJourneyWebhookReplayInput = Schema.Schema.Type<
  typeof SubscriberJourneyWebhookReplayInputSchema
>;

export const SubscriberJourneyRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  convexUrl: Schema.NonEmptyString,
  convexSiteUrl: Schema.NonEmptyString,
  convexAdminKey: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
  polarAccessToken: Schema.NonEmptyString,
  polarApiUrl: Schema.NonEmptyString,
  openmeterUrl: Schema.optional(Schema.NonEmptyString),
  openmeterApiKey: Schema.optional(Schema.NonEmptyString),
  valkeyUrl: Schema.NonEmptyString,
  unleashUrl: Schema.NonEmptyString,
  unleashApiKey: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
});

export type SubscriberJourneyRuntimeOptions = Schema.Schema.Type<
  typeof SubscriberJourneyRuntimeOptionsSchema
>;

type SubscriberJourneyRuntimeCoreOptions = Omit<
  SubscriberJourneyRuntimeOptions,
  "convexUrl" | "convexSiteUrl" | "convexAdminKey"
>;

type MakeSubscriberJourneyRuntimeOptions =
  | (SubscriberJourneyRuntimeOptions & {
      readonly convexAdapter?: undefined;
    })
  | (SubscriberJourneyRuntimeCoreOptions & {
      readonly convexAdapter: ConvexAdapterService;
    });

const SubscriberJourneyProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_SITE_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_ADMIN_KEY: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
  OPENMETER_URL: Schema.optional(Schema.NonEmptyString),
  OPENMETER_API_KEY: Schema.optional(Schema.NonEmptyString),
  VALKEY_URL: Schema.NonEmptyString,
  UNLEASH_URL: Schema.NonEmptyString,
  UNLEASH_API_KEY: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

const SubscriberJourneyConvexProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL_INTERNAL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL_INTERNAL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
  VALKEY_URL_INTERNAL: Schema.NonEmptyString,
  UNLEASH_URL_INTERNAL: Schema.NonEmptyString,
  UNLEASH_API_KEY: Schema.NonEmptyString,
  KETO_READ_URL_INTERNAL: Schema.NonEmptyString,
  KETO_WRITE_URL_INTERNAL: Schema.NonEmptyString,
});

const SubscriberJourneyOpenmeterRuntimeOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

export const ProductBootstrapBillingStatusSchema = Schema.Struct({
  plan: Schema.optional(Schema.NonEmptyString),
  billingInterval: Schema.optional(Schema.NonEmptyString),
  status: Schema.optional(Schema.NonEmptyString),
  currentPeriodEnd: Schema.optional(Schema.NonEmptyString),
  usage: Schema.optional(
    Schema.Array(
      Schema.Struct({
        featureKey: GovernanceEntitlementFeatureKeySchema,
        quotaSnapshot: BillingEntitlementQuotaSnapshotSchema,
      }),
    ),
  ),
});

export type ProductBootstrapBillingStatus = Schema.Schema.Type<
  typeof ProductBootstrapBillingStatusSchema
>;

export type ProductBootstrapResult = {
  readonly requestContext: RequestContext;
  readonly authorization: AuthorizationDecision;
  readonly snapshot?: ProductAppSnapshot;
  readonly billingStatus?: ProductBootstrapBillingStatus;
  readonly enabledModules?: readonly PlatformModuleId[];
};

export type SubscriberJourneyServiceError =
  | ParseResult.ParseError
  | MissingModuleManifestError
  | AuthorizationDelegatedCheckError
  | IdentitySessionModuleError
  | BillingStatePostgresRepositoryError
  | SubscriberJourneyRepairQueryError
  | RuntimeConfigModulePersistenceError
  | WorkflowJobsPostgresRepositoryError
  | BillingWebhookProcessingError
  | RetentionLegalHoldPostgresRepositoryError
  | KeycloakAdapterRequestError
  | KeycloakSessionInactiveError
  | KeycloakSessionIdentifierMissingError
  | OpenmeterAdapterError
  | PolarAdapterRequestError
  | PolarCatalogMetadataError
  | PolarPlanNotFoundError
  | PolarPriceNotFoundError
  | PolarWebhookSignatureError
  | OryKetoAdapterRequestError
  | TenantOnboardingPostgresRepositoryError
  | TenantOwnerProvisioningActorMissingError
  | UnknownConfigKeyError
  | TenantProvisioningPostgresRepositoryError
  | RetentionLegalHoldModuleError;

const decodeBootstrapBillingStatus = Schema.decodeUnknown(
  ProductBootstrapBillingStatusSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

const decodeSubscriberJourneyProcessEnvironment = Schema.decodeUnknown(
  SubscriberJourneyProcessEnvironmentSchema,
);

const decodeSubscriberJourneyConvexProcessEnvironment = Schema.decodeUnknown(
  SubscriberJourneyConvexProcessEnvironmentSchema,
);

const decodeSubscriberJourneyRuntimeOptions = Schema.decodeUnknown(
  SubscriberJourneyRuntimeOptionsSchema,
);

const subscriberJourneyRepairSource = "billing-webhook.repair";
const subscriberJourneyWorkflowRepairSource = "workflow-jobs.repair";
const subscriberJourneyBootstrapRepairSource = "product-bootstrap.repair";

const hasExhaustedWorkflowJobRecoveryBudget = (attempts: number) =>
  attempts > workflowJobsRetryMaxAttempts;

const parseIsoTimestampOrThrow = (value: string) => {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new RangeError(
      `Expected a valid ISO-8601 timestamp, received: ${value}`,
    );
  }

  return timestamp;
};

const addSecondsToIsoString = (value: string, seconds: number) =>
  new Date(parseIsoTimestampOrThrow(value) + seconds * 1_000).toISOString();

const addMinutesToIsoString = (value: string, minutes: number) =>
  new Date(parseIsoTimestampOrThrow(value) + minutes * 60_000).toISOString();

const subtractSecondsFromDate = (value: Date, seconds: number) =>
  new Date(value.getTime() - seconds * 1_000);

const buildSubscriberJourneyWorkflowCorrelationId = (jobId: string) =>
  ["subscriber-journey", subscriberJourneyWorkflowRepairSource, jobId].join(
    ":",
  );

const buildPublicAuthStartCorrelationId = () =>
  `public-auth-start:${crypto.randomUUID()}`;

const buildPublicAuthStartRequestContext = (input: {
  readonly host: string;
  readonly correlationId: string;
}) =>
  decodeRequestContext({
    actorType: actorType.anonymous,
    correlationId: input.correlationId,
    host: input.host,
    tenant: {
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    },
  });

const buildPublicAuthStartBrandingRequestContext = (input: {
  readonly host: string;
  readonly correlationId: string;
  readonly tenantHint: string;
  readonly tenantScopeHint?: Schema.Schema.Type<
    typeof PublicAuthStartTenantScopeHintSchema
  >;
}) =>
  decodeRequestContext({
    actorType: actorType.anonymous,
    correlationId: input.correlationId,
    host: input.host,
    tenant:
      input.tenantScopeHint === platformScope.individual
        ? {
            scope: platformScope.individual,
            scopeId: input.tenantHint,
            individualId: input.tenantHint,
          }
        : {
            scope: platformScope.organization,
            scopeId: input.tenantHint,
            organizationId: input.tenantHint,
          },
  });

const buildPublicAuthStartSnapshot = <E>(input: {
  readonly requestContext: RequestContext;
  readonly host: string;
  readonly correlationId: string;
  readonly tenantHint?: string;
  readonly tenantScopeHint?: Schema.Schema.Type<
    typeof PublicAuthStartTenantScopeHintSchema
  >;
  readonly loadSnapshot: (
    requestContext: RequestContext,
  ) => Effect.Effect<Schema.Schema.Type<typeof PublicWebSnapshotSchema>, E>;
}) =>
  input.loadSnapshot(input.requestContext).pipe(
    Effect.flatMap((snapshot) => {
      if (input.tenantHint === undefined) {
        return Effect.succeed(snapshot);
      }

      return buildPublicAuthStartBrandingRequestContext({
        host: input.host,
        correlationId: input.correlationId,
        tenantHint: input.tenantHint,
        ...(input.tenantScopeHint !== undefined
          ? { tenantScopeHint: input.tenantScopeHint }
          : {}),
      }).pipe(
        Effect.flatMap((brandingRequestContext) =>
          input.loadSnapshot(brandingRequestContext).pipe(
            Effect.flatMap((brandingSnapshot) =>
              Schema.decodeUnknown(PublicWebSnapshotSchema)({
                ...snapshot,
                branding: brandingSnapshot.branding,
              }),
            ),
          ),
        ),
      );
    }),
  );

type SubscriberJourneyProvisioningRepairState = {
  readonly ownerActorId: string;
  readonly status: string;
};

type SubscriberJourneyOnboardingRepairState = {
  readonly runId: string;
  readonly status: string;
};

type SubscriberJourneyRepairReadModel = {
  readonly getProvisioningReceiptByTenant: (
    scope: RequestContext["tenant"]["scope"],
    scopeId: string,
  ) => Promise<SubscriberJourneyProvisioningRepairState | undefined>;
  readonly getOnboardingRunByTenant: (
    scope: RequestContext["tenant"]["scope"],
    scopeId: string,
  ) => Promise<SubscriberJourneyOnboardingRepairState | undefined>;
  readonly getCustomerAccountByTenant: (
    scope: RequestContext["tenant"]["scope"],
    scopeId: string,
  ) => Promise<BillingCustomerAccountRecord | undefined>;
  readonly getCustomerAccountById: (
    accountId: string,
  ) => Promise<BillingCustomerAccountRecord | undefined>;
};

type MakeSubscriberJourneyServiceOptions = {
  readonly repairReadModel: SubscriberJourneyRepairReadModel;
  readonly runtimeConfig: Pick<
    RuntimeConfigModuleService,
    "listOverridesByModule" | "resolveConfigValue"
  >;
  readonly usageMeter: Pick<OpenmeterAdapterService, "ingestUsage"> | undefined;
};

export type SubscriberJourneyRepairQueryError = {
  readonly _tag: "SubscriberJourneyRepairQueryError";
  readonly operation:
    | "getProvisioningReceiptByTenant"
    | "getOnboardingRunByTenant"
    | "getCustomerAccountByTenant"
    | "getCustomerAccountById";
  readonly cause: unknown;
};

export type SubscriberJourneyWebhookRepairError =
  | ParseResult.ParseError
  | OryKetoAdapterRequestError
  | TenantOnboardingPostgresRepositoryError
  | TenantOwnerProvisioningActorMissingError
  | TenantProvisioningPostgresRepositoryError
  | SubscriberJourneyRepairQueryError;

export type SubscriberJourneyWebhookProcessingError =
  | BillingWebhookProcessingError
  | SubscriberJourneyWebhookRepairError;

export type SubscriberJourneyWebhookReplayError =
  | WebhooksApiAccessModuleError
  | SubscriberJourneyWebhookRepairError;

const SubscriberJourneyWorkflowJobExecutionInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  now: Schema.optional(IsoTimestampSchema),
});

const SubscriberJourneyWorkflowJobRunInputSchema = Schema.Struct({
  now: Schema.optional(IsoTimestampSchema),
});

export type SubscriberJourneyWorkflowJobExecutionInput = Schema.Schema.Type<
  typeof SubscriberJourneyWorkflowJobExecutionInputSchema
>;

export type SubscriberJourneyWorkflowJobRunInput = {
  readonly now?: string;
};

export type SubscriberJourneyWorkflowJobError =
  | ParseResult.ParseError
  | BillingStatePostgresRepositoryError
  | SubscriberJourneyWebhookRepairError
  | ConvexWorkflowExecutionError
  | WorkflowJobsPostgresRepositoryError;

const resolveSubscriberJourneyActorType = (
  scope: RequestContext["tenant"]["scope"],
) => {
  switch (scope) {
    case platformScope.organization:
      return actorType.organizationAdmin;
    case platformScope.enterprise:
      return actorType.enterpriseAdmin;
    case platformScope.individual:
      return actorType.individualUser;
    case platformScope.platform:
      return actorType.platformOperator;
  }
};

const buildSubscriberJourneyRepairCorrelationId = (input: {
  readonly provider: string;
  readonly deliveryId: string;
}) =>
  [
    "subscriber-journey",
    subscriberJourneyRepairSource,
    input.provider,
    input.deliveryId,
  ].join(":");

const buildSubscriberJourneyRepairOnboardingRunId = (
  tenant: RequestContext["tenant"],
) =>
  [
    identitySessionRunIdPrefix.tenantOnboarding,
    tenant.scope,
    tenant.scopeId,
  ].join(":");

const resolveSubscriberJourneyCurrentStepId = (plan: {
  readonly steps: readonly {
    readonly stepId: string;
    readonly status: string;
  }[];
}) =>
  plan.steps.find(
    (step) =>
      step.status === tenantOnboardingRunStatus.inProgress ||
      step.status === onboardingStepStatus.notStarted,
  )?.stepId;

const resolveSubscriberJourneyEnabledModules = (
  entitlements: readonly BillingEntitlementRecord[],
) =>
  Schema.decodeUnknown(Schema.Array(PlatformModuleIdSchema))([
    ...new Set(
      entitlements
        .filter((entitlement) => entitlement.active)
        .map((entitlement) => entitlement.moduleId),
    ),
  ]);

const resolveTenantHierarchyCandidates = (input: {
  readonly scope: RequestContext["tenant"]["scope"];
  readonly scopeId: string;
  readonly enterpriseId?: string;
  readonly organizationId?: string;
  readonly individualId?: string;
}) => {
  const candidates: Array<{
    scope: RequestContext["tenant"]["scope"];
    scopeId: string;
  }> = [];

  const addCandidate = (
    scope: RequestContext["tenant"]["scope"],
    scopeId: string,
  ) => {
    if (
      candidates.some(
        (candidate) =>
          candidate.scope === scope && candidate.scopeId === scopeId,
      )
    ) {
      return;
    }

    candidates.push({ scope, scopeId });
  };

  switch (input.scope) {
    case platformScope.individual:
      addCandidate(
        platformScope.individual,
        input.individualId ?? input.scopeId,
      );

      if (input.organizationId !== undefined) {
        addCandidate(platformScope.organization, input.organizationId);
      }

      if (input.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, input.enterpriseId);
      }

      break;
    case platformScope.organization:
      addCandidate(
        platformScope.organization,
        input.organizationId ?? input.scopeId,
      );

      if (input.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, input.enterpriseId);
      }

      break;
    case platformScope.enterprise:
      addCandidate(
        platformScope.enterprise,
        input.enterpriseId ?? input.scopeId,
      );

      break;
    case platformScope.platform:
      break;
  }

  addCandidate(platformScope.platform, platformScope.platform);

  return candidates;
};

const resolveRepairEntitlementsForCustomerAccount = (input: {
  readonly tenant: {
    readonly scope: RequestContext["tenant"]["scope"];
    readonly scopeId: string;
    readonly enterpriseId?: string;
    readonly organizationId?: string;
    readonly individualId?: string;
  };
  readonly customerAccount: BillingCustomerAccountRecord;
  readonly entitlements: readonly BillingEntitlementRecord[];
}) => {
  const hierarchyCandidates = resolveTenantHierarchyCandidates(input.tenant);
  const matchedCandidateIndex = hierarchyCandidates.findIndex(
    (candidate) =>
      candidate.scope === input.customerAccount.scope &&
      candidate.scopeId === input.customerAccount.scopeId,
  );
  const alignedCandidates =
    matchedCandidateIndex === -1
      ? [
          {
            scope: input.customerAccount.scope,
            scopeId: input.customerAccount.scopeId,
          },
          {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        ]
      : hierarchyCandidates.slice(matchedCandidateIndex);

  return input.entitlements.filter((entitlement) =>
    alignedCandidates.some(
      (candidate) =>
        candidate.scope === entitlement.scope &&
        candidate.scopeId === entitlement.scopeId,
    ),
  );
};

const buildSubscriberJourneyRepairRequestContext = (input: {
  readonly customerAccount: BillingCustomerAccountRecord;
  readonly correlationId: string;
}) =>
  decodeRequestContext({
    actorType: resolveSubscriberJourneyActorType(input.customerAccount.scope),
    actorId: input.customerAccount.actorId,
    correlationId: input.correlationId,
    tenant: {
      scope: input.customerAccount.scope,
      scopeId: input.customerAccount.scopeId,
    },
    reason: "Repair missing tenant state from verified billing linkage.",
  });

const buildBootstrapAuthorizationDecision = (input: {
  readonly requestContext: RequestContext;
  readonly allowed: boolean;
  readonly reason: string;
  readonly auditRequired: boolean;
  readonly matchedTuple?: AuthorizationDecision["matchedTuple"];
}): AuthorizationDecision => ({
  allowed: input.allowed,
  cacheKey: [
    "subscriber-journey",
    input.requestContext.correlationId,
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
    input.requestContext.actorId ?? "anonymous",
    permissionScope.tenantRead,
  ].join(":"),
  reason: input.reason,
  auditRequired: input.auditRequired,
  ...(input.matchedTuple !== undefined
    ? {
        matchedTuple: input.matchedTuple,
      }
    : {}),
});

const emitProductBootstrapUsage = (input: {
  readonly usageMeter: Pick<OpenmeterAdapterService, "ingestUsage"> | undefined;
  readonly requestContext: RequestContext;
  readonly entitlements: readonly BillingEntitlementRecord[];
  readonly capturedAt: string;
}) => {
  const meteredApiRequestsEntitlement = input.entitlements.find(
    (entitlement) =>
      entitlement.featureKey === billingAndMeteringFeatureFlag.apiRequests &&
      entitlement.quotaSnapshot !== undefined &&
      entitlement.quotaSnapshot.meteringMode !== billingMeteringMode.none,
  );

  if (
    input.usageMeter === undefined ||
    meteredApiRequestsEntitlement?.quotaSnapshot === undefined
  ) {
    return Effect.void;
  }

  return input.usageMeter
    .ingestUsage({
      subject: [
        input.requestContext.tenant.scope,
        input.requestContext.tenant.scopeId,
      ].join(":"),
      eventName:
        meteredApiRequestsEntitlement.quotaSnapshot.meterKey ??
        meteredApiRequestsEntitlement.featureKey,
      quantity: 1,
      capturedAt: input.capturedAt,
    })
    .pipe(Effect.asVoid);
};

export type SubscriberJourneyService = {
  readonly listPublicPlans: Effect.Effect<
    PublicBillingPlanCatalog,
    | PolarAdapterRequestError
    | PolarCatalogMetadataError
    | ParseResult.ParseError
  >;
  readonly preparePublicAuthStart: (
    input: PublicAuthStartPreparationInput,
  ) => Effect.Effect<
    PublicAuthStartPreparation,
    PublicAuthStartPreparationError
  >;
  readonly resolveRequestContext: (
    input: IdentitySessionRequestContextLookup,
  ) => Effect.Effect<RequestContext, IdentitySessionModuleError>;
  readonly startAuthentication: (
    input: IdentitySessionStartInput,
  ) => Effect.Effect<IdentitySessionStartResult, ParseResult.ParseError>;
  readonly completeAuthentication: (
    input: IdentitySessionCompletionInput,
  ) => Effect.Effect<
    IdentitySessionCompletionResult,
    IdentitySessionModuleError
  >;
  readonly invalidateSession: (
    input: IdentitySessionInvalidationInput,
  ) => Effect.Effect<
    IdentitySessionInvalidationResult,
    | ParseResult.ParseError
    | IdentitySessionPostgresRepositoryError
    | ValkeyAdapterOperationError
  >;
  readonly createCheckoutSession: (
    input: BillingCheckoutSessionInput,
  ) => Effect.Effect<
    BillingCheckoutSession,
    | ParseResult.ParseError
    | WorkflowJobsPostgresRepositoryError
    | ConvexWorkflowExecutionError
    | PolarAdapterRequestError
    | PolarCatalogMetadataError
    | PolarPlanNotFoundError
    | PolarPriceNotFoundError
  >;
  readonly processBillingWebhook: (
    input: BillingProviderWebhookInput,
  ) => Effect.Effect<
    BillingWebhookProcessingResult,
    SubscriberJourneyWebhookProcessingError
  >;
  readonly replayBillingWebhook: (
    input: SubscriberJourneyWebhookReplayInput,
  ) => Effect.Effect<
    BillingWebhookProcessingResult,
    SubscriberJourneyWebhookReplayError
  >;
  readonly runBillingConvergenceJob: (
    input: SubscriberJourneyWorkflowJobExecutionInput,
  ) => Effect.Effect<
    WorkflowJobSummary | undefined,
    SubscriberJourneyWorkflowJobError
  >;
  readonly runDueBillingConvergenceJobs: (
    input?: SubscriberJourneyWorkflowJobRunInput,
  ) => Effect.Effect<
    readonly WorkflowJobSummary[],
    SubscriberJourneyWorkflowJobError
  >;
  readonly buildProductBootstrap: (
    input: SubscriberJourneyBootstrapInput,
  ) => Effect.Effect<ProductBootstrapResult, SubscriberJourneyServiceError>;
};

export const makeSubscriberJourneyService = (
  options: MakeSubscriberJourneyServiceOptions,
) =>
  Effect.gen(function* () {
    const convex = yield* ConvexAdapter;
    const polar = yield* PolarAdapter;
    const oryKeto = yield* OryKetoAdapter;
    const authorizationModule = yield* makeAuthorizationModule({
      tuples: [],
      cacheTtlSeconds: 60,
      maxCacheSize: 256,
      delegatedCheck: createOryKetoAuthorizationDelegatedCheck(oryKeto),
      delegatedTupleLookup:
        createOryKetoAuthorizationDelegatedTupleLookup(oryKeto),
    });
    const identitySession = yield* IdentitySessionModule;
    const tenantManagement = yield* TenantManagementModule;
    const tenantOnboardingRepository =
      yield* TenantOnboardingPostgresRepository;
    const tenantProvisioningRepository =
      yield* TenantProvisioningPostgresRepository;
    const webhooksApiAccess = yield* WebhooksApiAccessModule;
    const billingState = yield* BillingStatePostgresRepository;
    const workflowJobs = yield* WorkflowJobsPostgresRepository;
    const billingWebhookRepository = yield* BillingWebhookPostgresRepository;
    const customerAccountResolver = yield* BillingCustomerAccountResolver;
    const runtimeConfig = options.runtimeConfig;

    const buildWorkflowJobTenantLookup = (
      job: BillingReconciliationWorkflowJobRecord,
    ) => ({
      scope: job.tenantScope,
      scopeId: job.tenantScopeId,
      ...(job.payload.enterpriseId !== undefined
        ? { enterpriseId: job.payload.enterpriseId }
        : {}),
      ...(job.payload.organizationId !== undefined
        ? { organizationId: job.payload.organizationId }
        : {}),
      ...(job.payload.individualId !== undefined
        ? { individualId: job.payload.individualId }
        : {}),
    });

    const getCustomerAccountByTenantHierarchy = (input: {
      readonly tenant: {
        readonly scope: RequestContext["tenant"]["scope"];
        readonly scopeId: string;
        readonly enterpriseId?: string;
        readonly organizationId?: string;
        readonly individualId?: string;
      };
      readonly expectedAccountId?: string;
    }) =>
      Effect.tryPromise({
        try: async () => {
          const hierarchyCandidates = resolveTenantHierarchyCandidates(
            input.tenant,
          );
          const matchesHierarchy = (
            customerAccount: BillingCustomerAccountRecord,
          ) =>
            hierarchyCandidates.some(
              (candidate) =>
                candidate.scope === customerAccount.scope &&
                candidate.scopeId === customerAccount.scopeId,
            );

          if (input.expectedAccountId !== undefined) {
            const customerAccount =
              await options.repairReadModel.getCustomerAccountById(
                input.expectedAccountId,
              );

            return customerAccount !== undefined &&
              matchesHierarchy(customerAccount)
              ? customerAccount
              : undefined;
          }

          for (const candidate of hierarchyCandidates) {
            const customerAccount =
              await options.repairReadModel.getCustomerAccountByTenant(
                candidate.scope,
                candidate.scopeId,
              );

            if (customerAccount !== undefined) {
              return customerAccount;
            }
          }

          return undefined;
        },
        catch: (cause) =>
          ({
            _tag: "SubscriberJourneyRepairQueryError",
            operation:
              input.expectedAccountId !== undefined
                ? "getCustomerAccountById"
                : "getCustomerAccountByTenant",
            cause,
          }) satisfies SubscriberJourneyRepairQueryError,
      });

    const getCustomerAccountByWorkflowTenant = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly expectedAccountId?: string;
    }) =>
      getCustomerAccountByTenantHierarchy({
        tenant: buildWorkflowJobTenantLookup(input.job),
        ...(input.expectedAccountId !== undefined
          ? { expectedAccountId: input.expectedAccountId }
          : {}),
      });

    const persistWorkflowJobRecord = (
      record: BillingReconciliationWorkflowJobRecord,
    ) => workflowJobs.persistWorkflowJob(record);

    const buildWorkflowJobDispatchFailureRecord = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly cause: Cause.Cause<unknown>;
      readonly now: string;
    }) =>
      Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)({
        ...input.job,
        status: workflowJobStatus.blocked,
        completedAt: input.now,
        gapReason: workflowJobGapReason.repairFailed,
        lastError: Cause.pretty(input.cause),
        updatedAt: input.now,
      });

    const buildWorkflowJobDispatchCoverageWarningRecord = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly now: string;
      readonly primaryScheduled: boolean;
      readonly scheduledRecoveryAttemptCount: number;
      readonly expectedRecoveryAttemptCount: number;
    }) => {
      const warningSegments = [
        ...(input.primaryScheduled
          ? []
          : ["the primary reconciliation deadline could not be enqueued"]),
        ...(input.scheduledRecoveryAttemptCount <
        input.expectedRecoveryAttemptCount
          ? [
              `scheduled ${input.scheduledRecoveryAttemptCount} of ${input.expectedRecoveryAttemptCount} targeted follow-up attempts`,
            ]
          : []),
      ];

      return Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)(
        {
          ...input.job,
          gapReason: workflowJobGapReason.repairFailed,
          lastError: `Billing reconciliation recovery coverage is degraded: ${warningSegments.join("; ")}.`,
          updatedAt: input.now,
        },
      );
    };

    const buildWorkflowJobDispatchedRecord = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly now: string;
      readonly scheduledFunctionId: string;
      readonly scheduledFunctionIds: readonly string[];
      readonly primaryScheduled: boolean;
      readonly scheduledRecoveryAttemptCount: number;
      readonly expectedRecoveryAttemptCount: number;
    }) =>
      Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)({
        ...input.job,
        payload: {
          ...input.job.payload,
          dispatch: {
            scheduledAt: input.job.scheduledAt,
            scheduledFunctionId: input.scheduledFunctionId,
            scheduledFunctionIds: input.scheduledFunctionIds,
            primaryScheduled: input.primaryScheduled,
            scheduledRecoveryAttemptCount: input.scheduledRecoveryAttemptCount,
            expectedRecoveryAttemptCount: input.expectedRecoveryAttemptCount,
          },
        },
        updatedAt: input.now,
      });

    const dispatchWorkflowJobRecord = (
      record: BillingReconciliationWorkflowJobRecord,
    ) =>
      convex.scheduleBillingReconciliationWorkflowJob({
        jobId: record.jobId,
        scheduledAt: record.scheduledAt,
      });

    const getBlockedDispatchFailureWorkflowJobRecord = (input: {
      readonly jobId: string;
    }) =>
      workflowJobs
        .getWorkflowJob({ jobId: input.jobId })
        .pipe(
          Effect.map((record) =>
            record?.status === workflowJobStatus.blocked &&
            record.gapReason === workflowJobGapReason.repairFailed
              ? record
              : undefined,
          ),
        );

    const persistWorkflowJobDispatchFailureRecord = <Failure>(input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly cause: Cause.Cause<Failure>;
    }) => {
      const now = new Date().toISOString();

      return buildWorkflowJobDispatchFailureRecord({
        job: input.job,
        cause: input.cause,
        now,
      }).pipe(
        Effect.flatMap((failedRecord) =>
          persistWorkflowJobRecord(failedRecord),
        ),
        Effect.flatMap(() => Effect.failCause(input.cause)),
      );
    };

    const persistAndDispatchWorkflowJobRecord = (
      record: BillingReconciliationWorkflowJobRecord,
    ) =>
      persistWorkflowJobRecord(record).pipe(
        Effect.flatMap((persistedRecord) =>
          persistedRecord.status === workflowJobStatus.scheduled
            ? dispatchWorkflowJobRecord(persistedRecord).pipe(
                Effect.catchAllCause((cause) =>
                  persistWorkflowJobDispatchFailureRecord({
                    job: persistedRecord,
                    cause,
                  }),
                ),
                Effect.flatMap((dispatchResult) =>
                  buildWorkflowJobDispatchedRecord({
                    job: persistedRecord,
                    now: new Date().toISOString(),
                    scheduledFunctionId: dispatchResult.scheduledFunctionId,
                    scheduledFunctionIds: dispatchResult.scheduledFunctionIds,
                    primaryScheduled: dispatchResult.primaryScheduled,
                    scheduledRecoveryAttemptCount:
                      dispatchResult.scheduledRecoveryAttemptCount,
                    expectedRecoveryAttemptCount:
                      dispatchResult.expectedRecoveryAttemptCount,
                  }).pipe(
                    Effect.catchAllCause((cause) =>
                      persistWorkflowJobDispatchFailureRecord({
                        job: persistedRecord,
                        cause,
                      }),
                    ),
                    Effect.flatMap((dispatchedRecord) =>
                      persistWorkflowJobRecord(dispatchedRecord).pipe(
                        Effect.catchAllCause((cause) =>
                          persistWorkflowJobDispatchFailureRecord({
                            job: dispatchedRecord,
                            cause,
                          }),
                        ),
                        Effect.flatMap((scheduledRecord) =>
                          !dispatchResult.primaryScheduled ||
                          dispatchResult.scheduledRecoveryAttemptCount <
                            dispatchResult.expectedRecoveryAttemptCount
                            ? buildWorkflowJobDispatchCoverageWarningRecord({
                                job: scheduledRecord,
                                now: new Date().toISOString(),
                                primaryScheduled:
                                  dispatchResult.primaryScheduled,
                                scheduledRecoveryAttemptCount:
                                  dispatchResult.scheduledRecoveryAttemptCount,
                                expectedRecoveryAttemptCount:
                                  dispatchResult.expectedRecoveryAttemptCount,
                              }).pipe(
                                Effect.flatMap((degradedRecord) =>
                                  persistWorkflowJobRecord(degradedRecord),
                                ),
                                Effect.catchAllCause((cause) =>
                                  persistWorkflowJobDispatchFailureRecord({
                                    job: scheduledRecord,
                                    cause,
                                  }),
                                ),
                              )
                            : Effect.succeed(scheduledRecord),
                        ),
                      ),
                    ),
                  ),
                ),
              )
            : Effect.succeed(persistedRecord),
        ),
      );

    const buildWorkflowJobRecord = (input: {
      readonly jobId: string;
      readonly tenantScope: RequestContext["tenant"]["scope"];
      readonly tenantScopeId: string;
      readonly kind:
        | typeof workflowJobKind.reconciliationDeadline
        | typeof workflowJobKind.reconciliationSweep;
      readonly trigger:
        | typeof workflowJobTrigger.checkoutCreated
        | typeof workflowJobTrigger.periodicSweep;
      readonly status:
        | typeof workflowJobStatus.scheduled
        | typeof workflowJobStatus.running
        | typeof workflowJobStatus.completed
        | typeof workflowJobStatus.blocked;
      readonly attempts: number;
      readonly scheduledAt: string;
      readonly completedAt?: string;
      readonly lastError?: string;
      readonly gapReason?:
        | typeof workflowJobGapReason.missingCustomerAccount
        | typeof workflowJobGapReason.missingSubscriptionState
        | typeof workflowJobGapReason.repairFailed;
      readonly payload: BillingReconciliationWorkflowJobRecord["payload"];
      readonly now: string;
    }) =>
      Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)({
        jobId: input.jobId,
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.billingAndMetering,
        kind: input.kind,
        trigger: input.trigger,
        status: input.status,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        attempts: input.attempts,
        scheduledAt: input.scheduledAt,
        ...(input.completedAt !== undefined
          ? { completedAt: input.completedAt }
          : {}),
        ...(input.lastError !== undefined
          ? { lastError: input.lastError }
          : {}),
        ...(input.gapReason !== undefined
          ? { gapReason: input.gapReason }
          : {}),
        payload: input.payload,
        createdAt: input.now,
        updatedAt: input.now,
      });

    const rescheduleWorkflowJob = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly now: string;
      readonly gapReason:
        | typeof workflowJobGapReason.missingCustomerAccount
        | typeof workflowJobGapReason.missingSubscriptionState
        | typeof workflowJobGapReason.repairFailed;
      readonly lastError?: string;
    }) =>
      Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)({
        ...input.job,
        kind: workflowJobKind.reconciliationSweep,
        trigger: workflowJobTrigger.periodicSweep,
        status: hasExhaustedWorkflowJobRecoveryBudget(input.job.attempts)
          ? workflowJobStatus.blocked
          : workflowJobStatus.scheduled,
        scheduledAt: hasExhaustedWorkflowJobRecoveryBudget(input.job.attempts)
          ? input.now
          : addMinutesToIsoString(
              input.now,
              workflowJobsReconciliationSweepIntervalMinutes,
            ),
        ...(hasExhaustedWorkflowJobRecoveryBudget(input.job.attempts)
          ? { completedAt: input.now }
          : {}),
        ...(input.lastError !== undefined
          ? { lastError: input.lastError }
          : {}),
        gapReason: input.gapReason,
        payload: {
          ...input.job.payload,
          trigger: workflowJobTrigger.periodicSweep,
          correlationId: buildSubscriberJourneyWorkflowCorrelationId(
            input.job.jobId,
          ),
        },
        updatedAt: input.now,
      });

    const completeWorkflowJob = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly now: string;
    }) =>
      Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)({
        ...input.job,
        status: workflowJobStatus.completed,
        completedAt: input.now,
        gapReason: undefined,
        lastError: undefined,
        updatedAt: input.now,
      });

    const blockWorkflowJob = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly now: string;
      readonly gapReason:
        | typeof workflowJobGapReason.missingCustomerAccount
        | typeof workflowJobGapReason.missingSubscriptionState
        | typeof workflowJobGapReason.repairFailed;
      readonly lastError?: string;
    }) =>
      Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)({
        ...input.job,
        status: workflowJobStatus.blocked,
        completedAt: input.now,
        ...(input.lastError !== undefined
          ? { lastError: input.lastError }
          : {}),
        gapReason: input.gapReason,
        updatedAt: input.now,
      });

    const shouldBlockStaleRunningWorkflowJob = (input: {
      readonly job: BillingReconciliationWorkflowJobRecord;
      readonly now: string;
    }) =>
      input.job.status === workflowJobStatus.running &&
      hasExhaustedWorkflowJobRecoveryBudget(input.job.attempts) &&
      Date.parse(input.job.updatedAt) <=
        subtractSecondsFromDate(
          new Date(input.now),
          workflowJobsRunningClaimTimeoutSeconds,
        ).getTime();

    const recoverMissingBillingStateFromPolar = (input: {
      readonly tenant: {
        readonly scope: RequestContext["tenant"]["scope"];
        readonly scopeId: string;
        readonly enterpriseId?: string;
        readonly organizationId?: string;
        readonly individualId?: string;
      };
      readonly correlationId: string;
    }) =>
      Effect.gen(function* () {
        const plans = yield* polar.listPlans.pipe(
          Effect.catchAll(() => Effect.succeed([] as PublicBillingPlanCatalog)),
        );

        for (const candidate of resolveTenantHierarchyCandidates(
          input.tenant,
        )) {
          const lookup = yield* polar
            .lookupActiveSubscriptionByExternalCustomerId(candidate.scopeId)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)));

          if (lookup === undefined) {
            continue;
          }

          const matchingPlan = plans.find(
            (plan) => plan.planId === lookup.planId,
          );
          const matchingPrice = matchingPlan?.prices.find(
            (price) => price.priceId === lookup.priceId,
          );

          const customerAccount = yield* customerAccountResolver
            .resolveCustomerAccount({
              provider: platformAdapterServiceName.polar,
              customerId: lookup.customerId,
              scope: candidate.scope,
              scopeId: candidate.scopeId,
              subscriptionStatus: lookup.status,
              subscriptionId: lookup.subscriptionId,
              action: billingWebhookReconciliationAction.activate,
            })
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)));

          if (customerAccount === undefined) {
            continue;
          }

          const now = new Date().toISOString();
          const syntheticDeliveryId = [
            "polar-recovery",
            candidate.scope,
            candidate.scopeId,
            lookup.subscriptionId,
          ].join(":");

          const projection: BillingWebhookPersistenceProjection = {
            webhookReceipt: {
              receiptId: syntheticDeliveryId,
              provider: platformAdapterServiceName.polar,
              deliveryId: syntheticDeliveryId,
              eventType: billingWebhookEventType.checkoutCompleted,
              processingState: billingWebhookReceiptProcessingState.processed,
              verifiedSignature: true,
              scope: candidate.scope,
              scopeId: candidate.scopeId,
              payload: {
                eventId: syntheticDeliveryId,
                subscriptionId: lookup.subscriptionId,
                planId: lookup.planId,
                priceId: lookup.priceId,
                occurredAt: now,
                action: billingWebhookReconciliationAction.activate,
                customerId: lookup.customerId,
                entitlementsActive:
                  lookup.status === billingSubscriptionStatus.active,
                ...(lookup.currentPeriodEnd !== undefined
                  ? { currentPeriodEnd: lookup.currentPeriodEnd }
                  : {}),
              },
              receivedAt: now,
              processedAt: now,
            },
            subscription: {
              subscriptionId: lookup.subscriptionId,
              provider: platformAdapterServiceName.polar,
              providerSubscriptionId: lookup.subscriptionId,
              scope: candidate.scope,
              scopeId: candidate.scopeId,
              planId: lookup.planId,
              priceId: lookup.priceId,
              status: lookup.status,
              ...(lookup.currentPeriodEnd !== undefined
                ? { currentPeriodEnd: lookup.currentPeriodEnd }
                : {}),
              metadata: {
                action: billingWebhookReconciliationAction.activate,
                interval: matchingPrice?.interval ?? billingPlanInterval.month,
                entitlementsActive:
                  lookup.status === billingSubscriptionStatus.active,
                customerId: lookup.customerId,
              },
            },
            paymentEvent: {
              eventId: syntheticDeliveryId,
              provider: platformAdapterServiceName.polar,
              providerEventId: syntheticDeliveryId,
              subscriptionId: lookup.subscriptionId,
              scope: candidate.scope,
              scopeId: candidate.scopeId,
              eventType: billingWebhookEventType.checkoutCompleted,
              status: billingPaymentEventStatus.synced,
              effectiveAt: now,
              payload: {
                planId: lookup.planId,
                priceId: lookup.priceId,
                action: billingWebhookReconciliationAction.activate,
                customerId: lookup.customerId,
              },
            },
            entitlements: [],
            customerAccount,
          };

          yield* billingWebhookRepository
            .persistWebhookProjection(projection)
            .pipe(Effect.ignore);

          return {
            customerAccount,
            entitlements: [] as readonly BillingEntitlementRecord[],
          };
        }

        return undefined;
      });

    const repairTenantStateFromBillingContext = (input: {
      readonly tenant: {
        readonly scope: RequestContext["tenant"]["scope"];
        readonly scopeId: string;
        readonly enterpriseId?: string;
        readonly organizationId?: string;
        readonly individualId?: string;
      };
      readonly customerAccount: BillingCustomerAccountRecord;
      readonly entitlements: readonly BillingEntitlementRecord[];
      readonly provider: string;
      readonly correlationId: string;
      readonly source: string;
      readonly deliveryId?: string;
    }) =>
      Effect.gen(function* () {
        const existingProvisioning = yield* Effect.tryPromise({
          try: () =>
            options.repairReadModel.getProvisioningReceiptByTenant(
              input.customerAccount.scope,
              input.customerAccount.scopeId,
            ),
          catch: (cause) =>
            ({
              _tag: "SubscriberJourneyRepairQueryError",
              operation: "getProvisioningReceiptByTenant",
              cause,
            }) satisfies SubscriberJourneyRepairQueryError,
        });
        const existingOnboarding = yield* Effect.tryPromise({
          try: () =>
            options.repairReadModel.getOnboardingRunByTenant(
              input.customerAccount.scope,
              input.customerAccount.scopeId,
            ),
          catch: (cause) =>
            ({
              _tag: "SubscriberJourneyRepairQueryError",
              operation: "getOnboardingRunByTenant",
              cause,
            }) satisfies SubscriberJourneyRepairQueryError,
        });
        const needsProvisioningRepair =
          existingProvisioning === undefined ||
          existingProvisioning.status !== tenantProvisioningStatus.provisioned;
        const needsOnboardingRepair =
          existingOnboarding === undefined ||
          existingOnboarding.status === tenantOnboardingRunStatus.failed;

        if (!needsProvisioningRepair && !needsOnboardingRepair) {
          return {
            needsProvisioningRepair,
            needsOnboardingRepair,
          } as const;
        }

        const requestContext =
          yield* buildSubscriberJourneyRepairRequestContext({
            customerAccount: input.customerAccount,
            correlationId: input.correlationId,
          });

        if (needsProvisioningRepair) {
          const pendingProvisioning = yield* tenantManagement
            .provisionTenantOwner({ requestContext })
            .pipe(
              Effect.map((provisioning) => ({
                ...provisioning,
                metadata: {
                  ...provisioning.metadata,
                  source: input.source,
                  provider: input.provider,
                  ...(input.deliveryId !== undefined
                    ? { deliveryId: input.deliveryId }
                    : {}),
                  linkageSource: input.customerAccount.metadata.linkageSource,
                  subscriptionId: input.customerAccount.metadata.subscriptionId,
                },
              })),
            );
          yield* tenantProvisioningRepository.persistProvisioningReceipt(
            pendingProvisioning,
          );

          const tupleWriteExit = yield* Effect.exit(
            Effect.forEach(pendingProvisioning.authorizationTuples, (tuple) =>
              oryKeto.writeTuple({
                namespace: tuple.namespace,
                object: tuple.object,
                relation: tuple.relation,
                subject: tuple.subject,
              }),
            ),
          );

          if (tupleWriteExit._tag === "Failure") {
            yield* tenantProvisioningRepository
              .persistProvisioningReceipt({
                ...pendingProvisioning,
                status: tenantProvisioningStatus.failed,
              })
              .pipe(Effect.ignore);

            return yield* Effect.failCause(tupleWriteExit.cause);
          }

          yield* tenantProvisioningRepository.persistProvisioningReceipt({
            ...pendingProvisioning,
            status: tenantProvisioningStatus.provisioned,
          });
        }

        if (needsOnboardingRepair) {
          const alignedEntitlements =
            resolveRepairEntitlementsForCustomerAccount({
              tenant: input.tenant,
              customerAccount: input.customerAccount,
              entitlements: input.entitlements,
            });
          const onboardingPlan = yield* tenantManagement.buildOnboardingPlan({
            requestContext,
            enabledModules:
              yield* resolveSubscriberJourneyEnabledModules(
                alignedEntitlements,
              ),
          });

          yield* tenantOnboardingRepository.persistOnboardingRun({
            runId: buildSubscriberJourneyRepairOnboardingRunId(
              requestContext.tenant,
            ),
            triggeredBy: input.customerAccount.actorId,
            correlationId: input.correlationId,
            status: tenantOnboardingRunStatus.inProgress,
            currentStepId:
              resolveSubscriberJourneyCurrentStepId(onboardingPlan),
            plan: onboardingPlan,
            metadata: {
              source: input.source,
              provider: input.provider,
              ...(input.deliveryId !== undefined
                ? { deliveryId: input.deliveryId }
                : {}),
              linkageSource: input.customerAccount.metadata.linkageSource,
              subscriptionId: input.customerAccount.metadata.subscriptionId,
            },
          });
        }

        return {
          needsProvisioningRepair,
          needsOnboardingRepair,
        } as const;
      });

    const repairTenantStateFromBillingResult = (
      result: BillingWebhookProcessingResult,
    ) =>
      Effect.gen(function* () {
        const customerAccount = result.projection.customerAccount;

        if (customerAccount === undefined) {
          return result;
        }

        const correlationId = buildSubscriberJourneyRepairCorrelationId({
          provider: result.reconciliation.event.provider,
          deliveryId: result.reconciliation.event.deliveryId,
        });

        yield* repairTenantStateFromBillingContext({
          tenant: {
            scope: result.reconciliation.event.tenantScope,
            scopeId: result.reconciliation.event.tenantScopeId,
          },
          customerAccount,
          entitlements: result.projection.entitlements,
          provider: result.reconciliation.event.provider,
          correlationId,
          source: subscriberJourneyRepairSource,
          deliveryId: result.reconciliation.event.deliveryId,
        });

        return result;
      });

    const repairTenantStateFromBootstrap = (input: {
      readonly requestContext: RequestContext;
      readonly entitlements: readonly BillingEntitlementRecord[];
      readonly provider?: string;
      readonly subscriptionAccountId?: string;
    }) =>
      Effect.gen(function* () {
        if (hasPrivilegedBreakGlassAccess(input.requestContext)) {
          return;
        }

        const customerAccount = yield* getCustomerAccountByTenantHierarchy({
          tenant: {
            scope: input.requestContext.tenant.scope,
            scopeId: input.requestContext.tenant.scopeId,
            ...(input.requestContext.tenant.enterpriseId !== undefined
              ? { enterpriseId: input.requestContext.tenant.enterpriseId }
              : {}),
            ...(input.requestContext.tenant.organizationId !== undefined
              ? { organizationId: input.requestContext.tenant.organizationId }
              : {}),
            ...(input.requestContext.tenant.individualId !== undefined
              ? { individualId: input.requestContext.tenant.individualId }
              : {}),
          },
          ...(input.subscriptionAccountId !== undefined
            ? { expectedAccountId: input.subscriptionAccountId }
            : {}),
        });

        if (customerAccount === undefined) {
          return;
        }

        if (
          (customerAccount.scope !== input.requestContext.tenant.scope ||
            customerAccount.scopeId !== input.requestContext.tenant.scopeId) &&
          input.requestContext.actorId !== customerAccount.actorId
        ) {
          return;
        }

        yield* repairTenantStateFromBillingContext({
          tenant: {
            scope: input.requestContext.tenant.scope,
            scopeId: input.requestContext.tenant.scopeId,
            ...(input.requestContext.tenant.enterpriseId !== undefined
              ? { enterpriseId: input.requestContext.tenant.enterpriseId }
              : {}),
            ...(input.requestContext.tenant.organizationId !== undefined
              ? { organizationId: input.requestContext.tenant.organizationId }
              : {}),
            ...(input.requestContext.tenant.individualId !== undefined
              ? { individualId: input.requestContext.tenant.individualId }
              : {}),
          },
          customerAccount,
          entitlements: input.entitlements,
          provider: input.provider ?? customerAccount.provider,
          correlationId: input.requestContext.correlationId,
          source: subscriberJourneyBootstrapRepairSource,
        });
      });

    const runBillingConvergenceJobRecord = ({
      jobId,
      now,
    }: {
      readonly jobId: string;
      readonly now: string;
    }) =>
      executeWorkflowJobRecord({
        jobId,
        loadJob: ({ jobId: workflowJobId }) =>
          workflowJobs.getWorkflowJob({ jobId: workflowJobId }),
        shouldBlockStaleRunningJob: ({ job }) =>
          shouldBlockStaleRunningWorkflowJob({
            job,
            now,
          }),
        blockStaleRunningJob: ({ job }) =>
          blockWorkflowJob({
            job,
            now,
            gapReason: workflowJobGapReason.repairFailed,
            lastError:
              job.lastError ??
              "Automatic billing reconciliation recovery attempts were exhausted before the job completed.",
          }).pipe(
            Effect.flatMap((blockedJob) =>
              persistWorkflowJobRecord(blockedJob),
            ),
          ),
        claimScheduledJob: ({ jobId: workflowJobId }) =>
          workflowJobs.claimScheduledWorkflowJob({
            jobId: workflowJobId,
            now,
          }),
        runClaimedJob: ({ job: attemptedJob }) =>
          Effect.gen(function* () {
            const tenantLookup = buildWorkflowJobTenantLookup(attemptedJob);
            const tenantAccessState =
              yield* billingState.getTenantAccessState(tenantLookup);

            if (tenantAccessState.subscription === undefined) {
              const recovered = yield* recoverMissingBillingStateFromPolar({
                tenant: tenantLookup,
                correlationId: attemptedJob.payload.correlationId,
              }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

              if (recovered !== undefined) {
                yield* repairTenantStateFromBillingContext({
                  tenant: tenantLookup,
                  customerAccount: recovered.customerAccount,
                  entitlements: recovered.entitlements,
                  provider: platformAdapterServiceName.polar,
                  correlationId: attemptedJob.payload.correlationId,
                  source: subscriberJourneyWorkflowRepairSource,
                  ...(attemptedJob.payload.deliveryId !== undefined
                    ? { deliveryId: attemptedJob.payload.deliveryId }
                    : {}),
                });
                const completedJob = yield* completeWorkflowJob({
                  job: attemptedJob,
                  now,
                });

                return yield* persistWorkflowJobRecord(completedJob);
              }

              const rescheduledJob = yield* rescheduleWorkflowJob({
                job: attemptedJob,
                now,
                gapReason: workflowJobGapReason.missingSubscriptionState,
              });

              return yield* persistAndDispatchWorkflowJobRecord(rescheduledJob);
            }

            const customerAccount = yield* getCustomerAccountByWorkflowTenant({
              job: attemptedJob,
              ...(tenantAccessState.subscription.accountId !== undefined
                ? {
                    expectedAccountId: tenantAccessState.subscription.accountId,
                  }
                : {}),
            });

            if (customerAccount === undefined) {
              const recovered = yield* recoverMissingBillingStateFromPolar({
                tenant: tenantLookup,
                correlationId: attemptedJob.payload.correlationId,
              }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

              if (recovered !== undefined) {
                yield* repairTenantStateFromBillingContext({
                  tenant: tenantLookup,
                  customerAccount: recovered.customerAccount,
                  entitlements:
                    tenantAccessState.entitlements.length > 0
                      ? tenantAccessState.entitlements
                      : recovered.entitlements,
                  provider: tenantAccessState.subscription.provider,
                  correlationId: attemptedJob.payload.correlationId,
                  source: subscriberJourneyWorkflowRepairSource,
                  ...(attemptedJob.payload.deliveryId !== undefined
                    ? { deliveryId: attemptedJob.payload.deliveryId }
                    : {}),
                });
                const completedJob = yield* completeWorkflowJob({
                  job: attemptedJob,
                  now,
                });

                return yield* persistWorkflowJobRecord(completedJob);
              }

              const rescheduledJob = yield* rescheduleWorkflowJob({
                job: attemptedJob,
                now,
                gapReason: workflowJobGapReason.missingCustomerAccount,
              });

              return yield* persistAndDispatchWorkflowJobRecord(rescheduledJob);
            }

            yield* repairTenantStateFromBillingContext({
              tenant: tenantLookup,
              customerAccount,
              entitlements: tenantAccessState.entitlements,
              provider: tenantAccessState.subscription.provider,
              correlationId: attemptedJob.payload.correlationId,
              source: subscriberJourneyWorkflowRepairSource,
              ...(attemptedJob.payload.deliveryId !== undefined
                ? { deliveryId: attemptedJob.payload.deliveryId }
                : {}),
            });

            const completedJob = yield* completeWorkflowJob({
              job: {
                ...attemptedJob,
                payload: {
                  ...attemptedJob.payload,
                  providerCustomerId: customerAccount.providerCustomerId,
                  subscriptionId:
                    customerAccount.metadata.subscriptionId ??
                    attemptedJob.payload.subscriptionId,
                },
              },
              now,
            });

            return yield* persistWorkflowJobRecord(completedJob);
          }),
        recoverClaimedJobFailure: ({ job: attemptedJob, cause }) =>
          getBlockedDispatchFailureWorkflowJobRecord({
            jobId: attemptedJob.jobId,
          }).pipe(
            Effect.flatMap((blockedDispatchFailureJob) =>
              blockedDispatchFailureJob !== undefined
                ? buildWorkflowJobSummary({
                    record: blockedDispatchFailureJob,
                  })
                : rescheduleWorkflowJob({
                    job: attemptedJob,
                    now,
                    gapReason: workflowJobGapReason.repairFailed,
                    lastError: Cause.pretty(cause),
                  }).pipe(
                    Effect.flatMap((rescheduledJob) =>
                      persistAndDispatchWorkflowJobRecord(rescheduledJob),
                    ),
                    Effect.flatMap((persistedJob) =>
                      buildWorkflowJobSummary({ record: persistedJob }),
                    ),
                  ),
            ),
          ),
        summarize: ({ record }) => buildWorkflowJobSummary({ record }),
      });

    const runBillingConvergenceJob = (
      input: SubscriberJourneyWorkflowJobExecutionInput,
    ) =>
      Schema.decodeUnknown(SubscriberJourneyWorkflowJobExecutionInputSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          runBillingConvergenceJobRecord({
            jobId: request.jobId,
            now: request.now ?? new Date().toISOString(),
          }),
        ),
      );

    const runDueBillingConvergenceJobs = (
      input?: SubscriberJourneyWorkflowJobRunInput,
    ) =>
      Schema.decodeUnknown(SubscriberJourneyWorkflowJobRunInputSchema)(
        input ?? {},
      ).pipe(
        Effect.flatMap((request) =>
          Effect.gen(function* () {
            const now = request.now ?? new Date().toISOString();
            const dueJobs = yield* workflowJobs.listDueWorkflowJobs({
              sourceModuleId: platformModuleId.billingAndMetering,
              scheduledBefore: now,
            });

            const results = yield* Effect.forEach(dueJobs, (job) =>
              runBillingConvergenceJobRecord({
                jobId: job.jobId,
                now,
              }),
            );

            return results.filter(
              (job): job is WorkflowJobSummary => job !== undefined,
            );
          }),
        ),
      );

    return {
      listPublicPlans: polar.listPlans,
      preparePublicAuthStart: (
        input: PublicAuthStartPreparationInput,
      ): Effect.Effect<
        PublicAuthStartPreparation,
        PublicAuthStartPreparationError,
        never
      > =>
        Schema.decodeUnknown(PublicAuthStartPreparationInputSchema)(input).pipe(
          Effect.flatMap((request) => {
            const correlationId =
              request.correlationId ?? buildPublicAuthStartCorrelationId();
            const enabledModules =
              resolveDefaultTenantOnboardingEnabledModules();

            return Effect.all({
              requestContext: buildPublicAuthStartRequestContext({
                host: request.host,
                correlationId,
              }),
              tenant: createProvisioningTenantContext({
                scope: request.tenantScopeHint ?? platformScope.organization,
              }),
            }).pipe(
              Effect.flatMap(({ requestContext, tenant }) =>
                buildPublicAuthStartSnapshot({
                  requestContext,
                  host: request.host,
                  correlationId,
                  ...(request.tenantHint !== undefined
                    ? { tenantHint: request.tenantHint }
                    : {}),
                  ...(request.tenantScopeHint !== undefined
                    ? { tenantScopeHint: request.tenantScopeHint }
                    : {}),
                  loadSnapshot: (snapshotRequestContext) =>
                    billingState
                      .getTenantAccessState({
                        ...snapshotRequestContext.tenant,
                      })
                      .pipe(
                        Effect.map(
                          (tenantAccessState) => tenantAccessState.entitlements,
                        ),
                      )
                      .pipe(
                        Effect.flatMap((entitlements) =>
                          getPublicWebSnapshotForRequestContextWithRuntimeConfig(
                            snapshotRequestContext,
                            runtimeConfig,
                            entitlements,
                          ),
                        ),
                      ),
                }).pipe(
                  Effect.flatMap((snapshot) =>
                    Schema.decodeUnknown(PublicAuthStartPreparationSchema)({
                      correlationId,
                      requestContext,
                      tenant,
                      enabledModules,
                      snapshot,
                    }),
                  ),
                ),
              ),
            );
          }),
        ),
      resolveRequestContext: identitySession.resolveRequestContext,
      startAuthentication: identitySession.startAuthentication,
      completeAuthentication: identitySession.completeAuthentication,
      invalidateSession: identitySession.invalidateSession,
      createCheckoutSession: (input: BillingCheckoutSessionInput) =>
        Effect.gen(function* () {
          const request = yield* Schema.decodeUnknown(
            BillingCheckoutSessionInputSchema,
          )(input);
          const checkoutSession = yield* polar.createCheckoutSession(request);
          const now = new Date().toISOString();
          const jobId = buildBillingReconciliationWorkflowJobId({
            trigger: workflowJobTrigger.checkoutCreated,
            tenantScope: request.tenantScope,
            tenantScopeId: request.tenantScopeId,
            key: checkoutSession.checkoutSessionId,
          });
          const workflowJob = yield* buildWorkflowJobRecord({
            jobId,
            tenantScope: request.tenantScope,
            tenantScopeId: request.tenantScopeId,
            kind: workflowJobKind.reconciliationDeadline,
            trigger: workflowJobTrigger.checkoutCreated,
            status: workflowJobStatus.scheduled,
            attempts: 0,
            scheduledAt: addSecondsToIsoString(
              now,
              workflowJobsReconciliationDeadlineSeconds,
            ),
            payload: {
              sourceModuleId: platformModuleId.billingAndMetering,
              tenantScope: request.tenantScope,
              tenantScopeId: request.tenantScopeId,
              ...(request.enterpriseId !== undefined
                ? { enterpriseId: request.enterpriseId }
                : {}),
              ...(request.organizationId !== undefined
                ? { organizationId: request.organizationId }
                : {}),
              ...(request.individualId !== undefined
                ? { individualId: request.individualId }
                : {}),
              provider: platformAdapterServiceName.polar,
              correlationId: buildSubscriberJourneyWorkflowCorrelationId(jobId),
              checkoutSessionId: checkoutSession.checkoutSessionId,
              trigger: workflowJobTrigger.checkoutCreated,
            },
            now,
          });

          yield* persistAndDispatchWorkflowJobRecord(workflowJob);

          return checkoutSession;
        }),
      processBillingWebhook: (input: BillingProviderWebhookInput) =>
        webhooksApiAccess
          .processVerifiedProviderWebhook(input)
          .pipe(
            Effect.flatMap((result) =>
              repairTenantStateFromBillingResult(result),
            ),
          ),
      replayBillingWebhook: (input: SubscriberJourneyWebhookReplayInput) =>
        Schema.decodeUnknown(SubscriberJourneyWebhookReplayInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            webhooksApiAccess.replayProviderWebhook(request),
          ),
          Effect.flatMap((result) =>
            repairTenantStateFromBillingResult(result),
          ),
        ),
      runBillingConvergenceJob,
      runDueBillingConvergenceJobs,
      buildProductBootstrap: (
        input: SubscriberJourneyBootstrapInput,
      ): Effect.Effect<ProductBootstrapResult, SubscriberJourneyServiceError> =>
        Schema.decodeUnknown(SubscriberJourneyBootstrapInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const privilegedAuditRequired =
                actorSupportsPrivilegedSupportEscalation(
                  requestContext.actorType,
                );
              let authorization: AuthorizationDecision;

              if (requestContext.actorId === undefined) {
                authorization = buildBootstrapAuthorizationDecision({
                  requestContext,
                  allowed: false,
                  reason: "Request context is missing an actor id.",
                  auditRequired: privilegedAuditRequired,
                });
              } else {
                authorization = yield* authorizationModule.check({
                  requestContext,
                  namespace: authorizationNamespace.tenant,
                  object: requestContext.tenant.scopeId,
                  relation: authorizationRelation.viewer,
                  permissionScope: permissionScope.tenantRead,
                });
              }

              if (!authorization.allowed) {
                return {
                  requestContext,
                  authorization,
                } satisfies ProductBootstrapResult;
              }

              const tenantAccessState =
                yield* billingState.getTenantAccessState({
                  ...requestContext.tenant,
                });
              yield* repairTenantStateFromBootstrap({
                requestContext,
                entitlements: tenantAccessState.entitlements,
                ...(tenantAccessState.subscription?.accountId !== undefined
                  ? {
                      subscriptionAccountId:
                        tenantAccessState.subscription.accountId,
                    }
                  : {}),
                ...(tenantAccessState.subscription?.provider !== undefined
                  ? { provider: tenantAccessState.subscription.provider }
                  : {}),
              });
              const snapshot =
                yield* getProductAppSnapshotForRequestContextWithRuntimeConfig(
                  requestContext,
                  runtimeConfig,
                  tenantAccessState.entitlements,
                );
              const fieldSecurity = yield* makeFieldSecurityModule();
              const billingProjection = findModuleManifest(
                platformModuleId.billingAndMetering,
              )?.projectionProfiles.find(
                (projection) =>
                  projection.profile === projectionProfile.billing,
              );
              const rawBillingStatus = {
                plan: tenantAccessState.subscription?.planId,
                billingInterval:
                  tenantAccessState.subscription?.billingInterval,
                status: tenantAccessState.subscription?.status,
                currentPeriodEnd:
                  tenantAccessState.subscription?.currentPeriodEnd,
                usage: tenantAccessState.entitlements
                  .filter(
                    (entitlement) => entitlement.quotaSnapshot !== undefined,
                  )
                  .map((entitlement) => ({
                    featureKey: entitlement.featureKey,
                    quotaSnapshot: entitlement.quotaSnapshot,
                  })),
              };
              const projectedBilling =
                billingProjection === undefined
                  ? rawBillingStatus
                  : (yield* fieldSecurity.applyProjection({
                      moduleId: platformModuleId.billingAndMetering,
                      requestContext,
                      projection: billingProjection,
                      record: rawBillingStatus,
                    })).projectedRecord;
              const billingStatus =
                yield* decodeBootstrapBillingStatus(projectedBilling);
              yield* emitProductBootstrapUsage({
                usageMeter: options.usageMeter,
                requestContext,
                entitlements: tenantAccessState.entitlements,
                capturedAt: new Date().toISOString(),
              });

              return {
                requestContext,
                snapshot,
                authorization,
                billingStatus,
                enabledModules: yield* resolveSubscriberJourneyEnabledModules(
                  tenantAccessState.entitlements,
                ),
              } satisfies ProductBootstrapResult;
            }),
          ),
        ),
    } satisfies SubscriberJourneyService;
  });

export type SubscriberJourneyRuntimeError = {
  readonly _tag: "SubscriberJourneyRuntimeError";
  readonly cause: unknown;
};

export const makeSubscriberJourneyRuntime = (
  options: MakeSubscriberJourneyRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    let convex: ConvexAdapterService;

    if (options.convexAdapter !== undefined) {
      convex = options.convexAdapter;
    } else {
      convex = yield* makeConvexAdapter({
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
    }

    const writeDatabase = buildWriteDatabase(postgres.database);
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
    const unleash = yield* makeUnleashAdapter({
      url: options.unleashUrl,
      apiKey: options.unleashApiKey,
    });
    const polar = yield* makePolarAdapter({
      apiKey: options.polarAccessToken,
      apiUrl: options.polarApiUrl,
    });
    const openmeterRuntimeOptions =
      options.openmeterUrl === undefined &&
      options.openmeterApiKey === undefined
        ? undefined
        : yield* Schema.decodeUnknown(
            SubscriberJourneyOpenmeterRuntimeOptionsSchema,
          )({
            url: options.openmeterUrl,
            apiKey: options.openmeterApiKey,
          });
    const openmeter =
      openmeterRuntimeOptions === undefined
        ? undefined
        : yield* makeOpenmeterAdapter(openmeterRuntimeOptions);
    const tenantManagement = yield* makeTenantManagementModule();
    const billingMetering = yield* makeBillingMeteringModule();
    const runtimeConfigRepository = yield* makeRuntimeConfigPostgresRepository({
      ...writeDatabase,
      ...runtimeConfigQueryable,
    });
    const runtimeConfig = yield* makeRuntimeConfigModule(
      runtimeConfigRepository,
      makeRuntimeFeatureFlagRollout(unleash),
    );
    const identityRepository =
      yield* makeIdentitySessionPostgresRepository(writeDatabase);
    const onboardingRepository =
      yield* makeTenantOnboardingPostgresRepository(writeDatabase);
    const tenantProvisioningRepository =
      yield* makeTenantProvisioningPostgresRepository(writeDatabase);
    const billingWebhookRepository =
      yield* makeBillingWebhookPostgresRepository(writeDatabase);
    const billingWebhookReplayQueryable: BillingWebhookReplayPostgresQueryable =
      {
        getWebhookReceiptByProviderAndDeliveryId: async (
          provider,
          deliveryId,
        ) => {
          const rows = await postgres.database
            .select()
            .from(webhookReceiptsTable)
            .where(
              and(
                eq(webhookReceiptsTable.provider, provider),
                eq(webhookReceiptsTable.deliveryId, deliveryId),
              ),
            )
            .limit(1);

          return rows[0];
        },
      };
    const billingStateQueryable: BillingStatePostgresQueryable = {
      listEntitlementsByScope: async (scope, scopeId) =>
        postgres.database
          .select()
          .from(billingEntitlementsTable)
          .where(
            and(
              eq(billingEntitlementsTable.scope, scope),
              eq(billingEntitlementsTable.scopeId, scopeId),
              eq(billingEntitlementsTable.active, true),
            ),
          ),
      listPaymentEventsByScope: (scope, scopeId) =>
        postgres.database
          .select()
          .from(billingPaymentEventsTable)
          .where(
            and(
              eq(billingPaymentEventsTable.scope, scope),
              eq(billingPaymentEventsTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(billingPaymentEventsTable.recordedAt)),
      getLatestSubscriptionByScope: async (scope, scopeId) => {
        const liveRows = await postgres.database
          .select()
          .from(billingSubscriptionsTable)
          .where(
            and(
              eq(billingSubscriptionsTable.scope, scope),
              eq(billingSubscriptionsTable.scopeId, scopeId),
              or(
                eq(
                  billingSubscriptionsTable.status,
                  billingSubscriptionStatus.pending,
                ),
                eq(
                  billingSubscriptionsTable.status,
                  billingSubscriptionStatus.active,
                ),
                eq(
                  billingSubscriptionsTable.status,
                  billingSubscriptionStatus.pastDue,
                ),
              ),
            ),
          )
          .orderBy(desc(billingSubscriptionsTable.updatedAt))
          .limit(1);

        if (liveRows[0] !== undefined) {
          return liveRows[0];
        }

        const rows = await postgres.database
          .select()
          .from(billingSubscriptionsTable)
          .where(
            and(
              eq(billingSubscriptionsTable.scope, scope),
              eq(billingSubscriptionsTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(billingSubscriptionsTable.updatedAt))
          .limit(1);

        return rows[0];
      },
    };
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
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
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
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
    const billingStateRepository = yield* makeBillingStatePostgresRepository(
      billingStateQueryable,
    );
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const retentionLegalHoldQueryable: RetentionLegalHoldPostgresQueryable = {
      upsertRetentionPolicy: async (record) => {
        const rows = await postgres.database
          .insert(retentionPoliciesTable)
          .values(record)
          .onConflictDoUpdate({
            target: [
              retentionPoliciesTable.scope,
              retentionPoliciesTable.scopeId,
              retentionPoliciesTable.dataType,
            ],
            set: {
              policyId: record.policyId,
              retentionDays: record.retentionDays,
              changedBy: record.changedBy,
              updatedAt: record.updatedAt ?? new Date(),
            },
          })
          .returning();

        return (
          rows[0] ?? {
            policyId: record.policyId,
            scope: record.scope,
            scopeId: record.scopeId,
            dataType: record.dataType,
            retentionDays: record.retentionDays,
            changedBy: record.changedBy,
            createdAt: record.createdAt ?? new Date(),
            updatedAt: record.updatedAt ?? new Date(),
          }
        );
      },
      findRetentionPolicy: async (scope, scopeId, dataType) => {
        const rows = await postgres.database
          .select()
          .from(retentionPoliciesTable)
          .where(
            and(
              eq(retentionPoliciesTable.scope, scope),
              eq(retentionPoliciesTable.scopeId, scopeId),
              eq(retentionPoliciesTable.dataType, dataType),
            ),
          )
          .limit(1);

        return rows[0];
      },
      listRetentionPoliciesByScope: async (scope, scopeId) =>
        postgres.database
          .select()
          .from(retentionPoliciesTable)
          .where(
            and(
              eq(retentionPoliciesTable.scope, scope),
              eq(retentionPoliciesTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(retentionPoliciesTable.updatedAt)),
      createRetentionLegalHold: async (record) => {
        const rows = await postgres.database
          .insert(retentionLegalHoldsTable)
          .values(record)
          .returning();

        return (
          rows[0] ?? {
            legalHoldId: record.legalHoldId,
            scope: record.scope,
            scopeId: record.scopeId,
            dataType: record.dataType,
            targetId: record.targetId,
            reason: record.reason,
            evidence: record.evidence,
            status: record.status ?? retentionLegalHoldStatus.active,
            placedBy: record.placedBy,
            placedAt: record.placedAt ?? new Date(),
            releasedBy: record.releasedBy ?? null,
            releasedAt: record.releasedAt ?? null,
          }
        );
      },
      getRetentionLegalHoldById: async (legalHoldId) => {
        const rows = await postgres.database
          .select()
          .from(retentionLegalHoldsTable)
          .where(eq(retentionLegalHoldsTable.legalHoldId, legalHoldId))
          .limit(1);

        return rows[0];
      },
      findActiveRetentionLegalHold: async (
        scope,
        scopeId,
        dataType,
        targetId,
      ) => {
        const rows = await postgres.database
          .select()
          .from(retentionLegalHoldsTable)
          .where(
            and(
              eq(retentionLegalHoldsTable.scope, scope),
              eq(retentionLegalHoldsTable.scopeId, scopeId),
              eq(retentionLegalHoldsTable.dataType, dataType),
              eq(retentionLegalHoldsTable.targetId, targetId),
              eq(
                retentionLegalHoldsTable.status,
                retentionLegalHoldStatus.active,
              ),
            ),
          )
          .limit(1);

        return rows[0];
      },
      listRetentionLegalHoldsByScope: async (scope, scopeId) =>
        postgres.database
          .select()
          .from(retentionLegalHoldsTable)
          .where(
            and(
              eq(retentionLegalHoldsTable.scope, scope),
              eq(retentionLegalHoldsTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(retentionLegalHoldsTable.placedAt)),
      releaseRetentionLegalHold: async (
        legalHoldId,
        releasedBy,
        releasedAt,
      ) => {
        const rows = await postgres.database
          .update(retentionLegalHoldsTable)
          .set({
            status: retentionLegalHoldStatus.released,
            releasedBy,
            releasedAt,
          })
          .where(
            and(
              eq(retentionLegalHoldsTable.legalHoldId, legalHoldId),
              eq(
                retentionLegalHoldsTable.status,
                retentionLegalHoldStatus.active,
              ),
            ),
          )
          .returning();

        return rows[0];
      },
    };
    const retentionLegalHoldRepository =
      yield* makeRetentionLegalHoldPostgresRepository(
        retentionLegalHoldQueryable,
      );
    const billingWebhookReplayRepository =
      yield* makeBillingWebhookReplayPostgresRepository(
        billingWebhookReplayQueryable,
      );
    const emailDeliveryRepository = yield* makeEmailDeliveryPostgresRepository(
      buildEmailDeliveryPostgresQueryable(writeDatabase),
    );
    const webhookSubscriptionQueryable: WebhookSubscriptionPostgresQueryable = {
      createWebhookSubscription: async (record) => {
        const rows = await postgres.database
          .insert(webhookSubscriptionsTable)
          .values(record)
          .returning();

        return (
          rows[0] ?? {
            subscriptionId: record.subscriptionId,
            scope: record.scope,
            scopeId: record.scopeId,
            url: record.url,
            events: record.events ?? [],
            status: record.status ?? "active",
            lastDeliveryAt: record.lastDeliveryAt ?? null,
            createdAt: record.createdAt ?? new Date(),
            updatedAt: record.updatedAt ?? new Date(),
          }
        );
      },
      listWebhookSubscriptionsByScope: async (scope, scopeId) =>
        postgres.database
          .select()
          .from(webhookSubscriptionsTable)
          .where(
            and(
              eq(webhookSubscriptionsTable.scope, scope),
              eq(webhookSubscriptionsTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(webhookSubscriptionsTable.updatedAt)),
    };
    const webhookSubscriptionRepository =
      yield* makeWebhookSubscriptionPostgresRepository(
        webhookSubscriptionQueryable,
      );
    const webhookOutboundDeliveryQueryable: WebhookOutboundDeliveryPostgresQueryable =
      {
        createWebhookOutboundDelivery: async (record) => {
          const rows = await postgres.database
            .insert(webhookOutboundDeliveriesTable)
            .values(record)
            .returning();

          return (
            rows[0] ?? {
              deliveryId: record.deliveryId,
              subscriptionId: record.subscriptionId,
              scope: record.scope,
              scopeId: record.scopeId,
              eventType: record.eventType,
              payload: record.payload,
              status: record.status ?? "pending",
              attemptCount: record.attemptCount ?? 0,
              maxAttempts: record.maxAttempts,
              nextAttemptAt: record.nextAttemptAt ?? null,
              deliveredAt: record.deliveredAt ?? null,
              exhaustedAt: record.exhaustedAt ?? null,
              lastError: record.lastError ?? null,
              createdAt: record.createdAt ?? new Date(),
              updatedAt: record.updatedAt ?? new Date(),
            }
          );
        },
        getWebhookOutboundDelivery: async (deliveryId) => {
          const rows = await postgres.database
            .select()
            .from(webhookOutboundDeliveriesTable)
            .where(eq(webhookOutboundDeliveriesTable.deliveryId, deliveryId))
            .limit(1);

          return rows[0];
        },
        listWebhookOutboundDeliveriesByScope: async (scope, scopeId) =>
          postgres.database
            .select()
            .from(webhookOutboundDeliveriesTable)
            .where(
              and(
                eq(webhookOutboundDeliveriesTable.scope, scope),
                eq(webhookOutboundDeliveriesTable.scopeId, scopeId),
              ),
            )
            .orderBy(desc(webhookOutboundDeliveriesTable.updatedAt)),
        updateWebhookOutboundDelivery: async (input) =>
          postgres.database.transaction(async (transaction) => {
            const rows = await transaction
              .update(webhookOutboundDeliveriesTable)
              .set({
                status: input.record.status,
                attemptCount: input.record.attemptCount,
                maxAttempts: input.record.maxAttempts,
                nextAttemptAt: input.record.nextAttemptAt ?? null,
                deliveredAt: input.record.deliveredAt ?? null,
                exhaustedAt: input.record.exhaustedAt ?? null,
                lastError: input.record.lastError ?? null,
                updatedAt: input.record.updatedAt,
              })
              .where(
                and(
                  eq(
                    webhookOutboundDeliveriesTable.deliveryId,
                    input.expectedCurrentRecord.deliveryId,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.subscriptionId,
                    input.expectedCurrentRecord.subscriptionId,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.scope,
                    input.expectedCurrentRecord.scope,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.scopeId,
                    input.expectedCurrentRecord.scopeId,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.eventType,
                    input.expectedCurrentRecord.eventType,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.payload,
                    input.expectedCurrentRecord.payload,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.status,
                    input.expectedCurrentRecord.status,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.attemptCount,
                    input.expectedCurrentRecord.attemptCount,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.maxAttempts,
                    input.expectedCurrentRecord.maxAttempts,
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.createdAt,
                    new Date(input.expectedCurrentRecord.createdAt),
                  ),
                  eq(
                    webhookOutboundDeliveriesTable.updatedAt,
                    new Date(input.expectedCurrentRecord.updatedAt),
                  ),
                  input.expectedCurrentRecord.nextAttemptAt === undefined
                    ? isNull(webhookOutboundDeliveriesTable.nextAttemptAt)
                    : eq(
                        webhookOutboundDeliveriesTable.nextAttemptAt,
                        new Date(input.expectedCurrentRecord.nextAttemptAt),
                      ),
                  input.expectedCurrentRecord.deliveredAt === undefined
                    ? isNull(webhookOutboundDeliveriesTable.deliveredAt)
                    : eq(
                        webhookOutboundDeliveriesTable.deliveredAt,
                        new Date(input.expectedCurrentRecord.deliveredAt),
                      ),
                  input.expectedCurrentRecord.exhaustedAt === undefined
                    ? isNull(webhookOutboundDeliveriesTable.exhaustedAt)
                    : eq(
                        webhookOutboundDeliveriesTable.exhaustedAt,
                        new Date(input.expectedCurrentRecord.exhaustedAt),
                      ),
                  input.expectedCurrentRecord.lastError === undefined
                    ? isNull(webhookOutboundDeliveriesTable.lastError)
                    : eq(
                        webhookOutboundDeliveriesTable.lastError,
                        input.expectedCurrentRecord.lastError,
                      ),
                ),
              )
              .returning();

            const updatedRecord = rows[0];

            if (updatedRecord === undefined) {
              return undefined;
            }

            if (input.touchSubscriptionLastDeliveryAt !== undefined) {
              await transaction
                .update(webhookSubscriptionsTable)
                .set({
                  lastDeliveryAt: input.touchSubscriptionLastDeliveryAt,
                  updatedAt: input.touchSubscriptionLastDeliveryAt,
                })
                .where(
                  eq(
                    webhookSubscriptionsTable.subscriptionId,
                    updatedRecord.subscriptionId,
                  ),
                );
            }

            return updatedRecord;
          }),
      };
    const webhookOutboundDeliveryRepository =
      yield* makeWebhookOutboundDeliveryPostgresRepository(
        webhookOutboundDeliveryQueryable,
      );
    const webhookApiKeyQueryable: WebhookApiKeyPostgresQueryable = {
      createWebhookApiKey: async (record) => {
        const rows = await postgres.database
          .insert(webhookApiKeysTable)
          .values(record)
          .returning();

        return (
          rows[0] ?? {
            apiKeyId: record.apiKeyId,
            scope: record.scope,
            scopeId: record.scopeId,
            label: record.label,
            secretHash: record.secretHash,
            prefix: record.prefix,
            status: record.status ?? "active",
            createdAt: record.createdAt ?? new Date(),
            updatedAt: record.updatedAt ?? new Date(),
            rotatedAt: record.rotatedAt ?? null,
            revokedAt: record.revokedAt ?? null,
          }
        );
      },
      listWebhookApiKeysByScope: async (scope, scopeId) =>
        postgres.database
          .select()
          .from(webhookApiKeysTable)
          .where(
            and(
              eq(webhookApiKeysTable.scope, scope),
              eq(webhookApiKeysTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(webhookApiKeysTable.updatedAt)),
      getWebhookApiKey: async (scope, scopeId, apiKeyId) => {
        const rows = await postgres.database
          .select()
          .from(webhookApiKeysTable)
          .where(
            and(
              eq(webhookApiKeysTable.scope, scope),
              eq(webhookApiKeysTable.scopeId, scopeId),
              eq(webhookApiKeysTable.apiKeyId, apiKeyId),
            ),
          )
          .limit(1);

        return rows[0];
      },
      rotateWebhookApiKey: async (input) => {
        const rows = await postgres.database
          .update(webhookApiKeysTable)
          .set({
            secretHash: input.secretHash,
            prefix: input.prefix,
            rotatedAt: input.rotatedAt,
            updatedAt: input.updatedAt,
          })
          .where(
            and(
              eq(webhookApiKeysTable.scope, input.scope),
              eq(webhookApiKeysTable.scopeId, input.scopeId),
              eq(webhookApiKeysTable.apiKeyId, input.apiKeyId),
              eq(webhookApiKeysTable.updatedAt, input.expectedUpdatedAt),
              eq(webhookApiKeysTable.status, input.expectedStatus),
              isNull(webhookApiKeysTable.revokedAt),
            ),
          )
          .returning();

        return rows[0];
      },
      revokeWebhookApiKey: async (input) => {
        const rows = await postgres.database
          .update(webhookApiKeysTable)
          .set({
            status: "revoked",
            revokedAt: input.revokedAt,
            updatedAt: input.updatedAt,
          })
          .where(
            and(
              eq(webhookApiKeysTable.scope, input.scope),
              eq(webhookApiKeysTable.scopeId, input.scopeId),
              eq(webhookApiKeysTable.apiKeyId, input.apiKeyId),
              eq(webhookApiKeysTable.updatedAt, input.expectedUpdatedAt),
              eq(webhookApiKeysTable.status, input.expectedStatus),
              eq(webhookApiKeysTable.secretHash, input.expectedSecretHash),
              eq(webhookApiKeysTable.prefix, input.expectedPrefix),
              input.expectedRotatedAt === null
                ? isNull(webhookApiKeysTable.rotatedAt)
                : eq(webhookApiKeysTable.rotatedAt, input.expectedRotatedAt),
              input.expectedRevokedAt === null
                ? isNull(webhookApiKeysTable.revokedAt)
                : eq(webhookApiKeysTable.revokedAt, input.expectedRevokedAt),
            ),
          )
          .returning();

        return rows[0];
      },
      restoreWebhookApiKey: async (input) => {
        const rows = await postgres.database
          .update(webhookApiKeysTable)
          .set({
            label: input.label,
            secretHash: input.secretHash,
            prefix: input.prefix,
            status: input.status,
            updatedAt: input.updatedAt,
            rotatedAt: input.rotatedAt,
            revokedAt: input.revokedAt,
          })
          .where(
            and(
              eq(webhookApiKeysTable.scope, input.scope),
              eq(webhookApiKeysTable.scopeId, input.scopeId),
              eq(webhookApiKeysTable.apiKeyId, input.apiKeyId),
              eq(webhookApiKeysTable.updatedAt, input.expectedUpdatedAt),
              eq(webhookApiKeysTable.status, input.expectedStatus),
              eq(webhookApiKeysTable.secretHash, input.expectedSecretHash),
              eq(webhookApiKeysTable.prefix, input.expectedPrefix),
              input.expectedRotatedAt === null
                ? isNull(webhookApiKeysTable.rotatedAt)
                : eq(webhookApiKeysTable.rotatedAt, input.expectedRotatedAt),
              input.expectedRevokedAt === null
                ? isNull(webhookApiKeysTable.revokedAt)
                : eq(webhookApiKeysTable.revokedAt, input.expectedRevokedAt),
            ),
          )
          .returning();

        return rows[0];
      },
    };
    const webhookApiKeyRepository = yield* makeWebhookApiKeyPostgresRepository(
      webhookApiKeyQueryable,
    );
    const repairReadModel: SubscriberJourneyRepairReadModel = {
      getProvisioningReceiptByTenant: async (scope, scopeId) => {
        const rows = await postgres.database
          .select({
            ownerActorId: tenantProvisioningReceiptsTable.ownerActorId,
            status: tenantProvisioningReceiptsTable.status,
          })
          .from(tenantProvisioningReceiptsTable)
          .where(
            and(
              eq(tenantProvisioningReceiptsTable.tenantScope, scope),
              eq(tenantProvisioningReceiptsTable.tenantScopeId, scopeId),
            ),
          )
          .orderBy(desc(tenantProvisioningReceiptsTable.updatedAt))
          .limit(1);

        return rows[0];
      },
      getOnboardingRunByTenant: async (scope, scopeId) => {
        const rows = await postgres.database
          .select({
            runId: tenantOnboardingRunsTable.runId,
            status: tenantOnboardingRunsTable.status,
          })
          .from(tenantOnboardingRunsTable)
          .where(
            and(
              eq(tenantOnboardingRunsTable.tenantScope, scope),
              eq(tenantOnboardingRunsTable.tenantScopeId, scopeId),
            ),
          )
          .orderBy(desc(tenantOnboardingRunsTable.startedAt))
          .limit(1);

        return rows[0];
      },
      getCustomerAccountByTenant: async (scope, scopeId) => {
        const rows = await postgres.database
          .select()
          .from(billingCustomerAccountsTable)
          .where(
            and(
              eq(billingCustomerAccountsTable.scope, scope),
              eq(billingCustomerAccountsTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(billingCustomerAccountsTable.updatedAt))
          .limit(1);

        const row = rows[0];

        if (row === undefined) {
          return undefined;
        }

        return await Effect.runPromise(
          Schema.decodeUnknown(BillingCustomerAccountRecordSchema)({
            accountId: row.accountId,
            provider: row.provider,
            providerCustomerId: row.providerCustomerId,
            actorId: row.actorId,
            scope: row.scope,
            scopeId: row.scopeId,
            ...(row.email != null ? { email: row.email } : {}),
            status: row.status,
            metadata: row.metadata,
          }),
        );
      },
      getCustomerAccountById: async (accountId) => {
        const rows = await postgres.database
          .select()
          .from(billingCustomerAccountsTable)
          .where(eq(billingCustomerAccountsTable.accountId, accountId))
          .limit(1);

        const row = rows[0];

        if (row === undefined) {
          return undefined;
        }

        return await Effect.runPromise(
          Schema.decodeUnknown(BillingCustomerAccountRecordSchema)({
            accountId: row.accountId,
            provider: row.provider,
            providerCustomerId: row.providerCustomerId,
            actorId: row.actorId,
            scope: row.scope,
            scopeId: row.scopeId,
            ...(row.email != null ? { email: row.email } : {}),
            status: row.status,
            metadata: row.metadata,
          }),
        );
      },
    };
    const workflowJobsQueryable =
      buildWorkflowJobsPostgresQueryable<BillingReconciliationWorkflowJobRecord>(
        writeDatabase,
      );
    const workflowJobsRepository = yield* makeWorkflowJobsPostgresRepository(
      writeDatabase,
      workflowJobsQueryable,
    );
    const billingCustomerAccountResolver: BillingCustomerAccountResolverApi = {
      resolveCustomerAccount: (input) =>
        Effect.tryPromise({
          try: async () => {
            const [provisioningRows, lifecycleRows] = await Promise.all([
              postgres.database
                .select({
                  ownerActorId: tenantProvisioningReceiptsTable.ownerActorId,
                })
                .from(tenantProvisioningReceiptsTable)
                .where(
                  and(
                    eq(
                      tenantProvisioningReceiptsTable.tenantScope,
                      input.scope,
                    ),
                    eq(
                      tenantProvisioningReceiptsTable.tenantScopeId,
                      input.scopeId,
                    ),
                  ),
                )
                .orderBy(desc(tenantProvisioningReceiptsTable.updatedAt))
                .limit(1),
              postgres.database
                .select({ actorId: identitySessionAuditTable.actorId })
                .from(identitySessionAuditTable)
                .where(
                  and(
                    eq(identitySessionAuditTable.tenantScope, input.scope),
                    eq(identitySessionAuditTable.tenantScopeId, input.scopeId),
                    eq(
                      identitySessionAuditTable.eventType,
                      identitySessionLifecycleEventType.authCallbackCompleted,
                    ),
                  ),
                )
                .orderBy(desc(identitySessionAuditTable.recordedAt))
                .limit(1),
            ]);

            const actorId =
              provisioningRows[0]?.ownerActorId ?? lifecycleRows[0]?.actorId;

            if (actorId === undefined) {
              return undefined;
            }

            return {
              accountId: [
                platformAdapterServiceName.polar,
                input.customerId,
              ].join(":"),
              provider: platformAdapterServiceName.polar,
              providerCustomerId: input.customerId,
              actorId,
              scope: input.scope,
              scopeId: input.scopeId,
              status: input.subscriptionStatus,
              metadata: {
                linkageSource:
                  provisioningRows[0] !== undefined
                    ? billingCustomerAccountLinkageSource.tenantProvisioning
                    : billingCustomerAccountLinkageSource.identitySessionAudit,
                subscriptionId: input.subscriptionId,
                action: input.action,
              },
            } satisfies BillingCustomerAccountRecord;
          },
          catch: (cause) =>
            ({
              _tag: "BillingCustomerAccountResolutionError",
              operation: "resolveCustomerAccount",
              cause,
            }) satisfies BillingCustomerAccountResolutionError,
        }),
    };
    const identitySession = yield* makeIdentitySessionModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(ValkeyAdapter, valkey),
      Effect.provideService(TenantManagementModule, tenantManagement),
      Effect.provideService(
        IdentitySessionPostgresRepository,
        identityRepository,
      ),
      Effect.provideService(
        TenantProvisioningPostgresRepository,
        tenantProvisioningRepository,
      ),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
    );
    const billingWebhookService = yield* makeBillingWebhookService().pipe(
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(BillingMeteringModule, billingMetering),
      Effect.provideService(
        BillingCustomerAccountResolver,
        billingCustomerAccountResolver,
      ),
      Effect.provideService(
        BillingWebhookPostgresRepository,
        billingWebhookRepository,
      ),
    );
    const webhooksApiAccess = yield* makeWebhooksApiAccessModule().pipe(
      Effect.provideService(BillingWebhookService, billingWebhookService),
      Effect.provideService(
        BillingWebhookReplayPostgresRepository,
        billingWebhookReplayRepository,
      ),
      Effect.provideService(
        WebhookOutboundDeliveryPostgresRepository,
        webhookOutboundDeliveryRepository,
      ),
      Effect.provideService(
        WebhookApiKeyPostgresRepository,
        webhookApiKeyRepository,
      ),
      Effect.provideService(
        WebhookSubscriptionPostgresRepository,
        webhookSubscriptionRepository,
      ),
    );
    const retentionLegalHold = yield* makeRetentionLegalHoldModule().pipe(
      Effect.provideService(
        RetentionLegalHoldPostgresRepository,
        retentionLegalHoldRepository,
      ),
    );
    const subscriberJourney = yield* makeSubscriberJourneyService({
      repairReadModel,
      runtimeConfig,
      usageMeter: openmeter,
    }).pipe(
      Effect.provideService(ConvexAdapter, convex),
      Effect.provideService(TenantManagementModule, tenantManagement),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
      Effect.provideService(
        TenantProvisioningPostgresRepository,
        tenantProvisioningRepository,
      ),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(WebhooksApiAccessModule, webhooksApiAccess),
      Effect.provideService(
        BillingStatePostgresRepository,
        billingStateRepository,
      ),
      Effect.provideService(
        WorkflowJobsPostgresRepository,
        workflowJobsRepository,
      ),
      Effect.provideService(
        BillingWebhookPostgresRepository,
        billingWebhookRepository,
      ),
      Effect.provideService(
        BillingCustomerAccountResolver,
        billingCustomerAccountResolver,
      ),
    );

    return {
      auditLog,
      billingState: billingStateRepository,
      emailDeliveryRepository,
      identitySession,
      oryKeto,
      retentionLegalHold,
      runtimeConfig,
      service: subscriberJourney,
      webhooksApiAccess,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(unleash.close),
        Effect.ignore(valkey.close),
      ]).pipe(Effect.asVoid),
    };
  }).pipe(
    Effect.mapError(
      (cause): SubscriberJourneyRuntimeError => ({
        _tag: "SubscriberJourneyRuntimeError",
        cause,
      }),
    ),
  );

const runSubscriberJourneyWithResolvedOptions = <A, E>(
  options: MakeSubscriberJourneyRuntimeOptions,
  use: (service: SubscriberJourneyService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeSubscriberJourneyRuntime(options);

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const resolveSubscriberJourneyRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeSubscriberJourneyProcessEnvironment(environment).pipe(
    Effect.map(
      (resolvedEnvironment): SubscriberJourneyRuntimeOptions =>
        ({
          postgresUrl: resolvedEnvironment.POSTGRES_URL,
          convexUrl: resolvedEnvironment.CONVEX_SELF_HOSTED_URL,
          convexSiteUrl: resolvedEnvironment.CONVEX_SELF_HOSTED_SITE_URL,
          convexAdminKey: resolvedEnvironment.CONVEX_SELF_HOSTED_ADMIN_KEY,
          keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
          keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
          keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
          keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
          keycloakConvexServiceActorUsername:
            resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME,
          keycloakConvexServiceActorPassword:
            resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD,
          polarAccessToken: resolvedEnvironment.POLAR_ACCESS_TOKEN,
          polarApiUrl: resolvedEnvironment.POLAR_API_URL,
          ...(resolvedEnvironment.OPENMETER_URL !== undefined
            ? { openmeterUrl: resolvedEnvironment.OPENMETER_URL }
            : {}),
          ...(resolvedEnvironment.OPENMETER_API_KEY !== undefined
            ? { openmeterApiKey: resolvedEnvironment.OPENMETER_API_KEY }
            : {}),
          valkeyUrl: resolvedEnvironment.VALKEY_URL,
          unleashUrl: resolvedEnvironment.UNLEASH_URL,
          unleashApiKey: resolvedEnvironment.UNLEASH_API_KEY,
          ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
          ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
        }) satisfies SubscriberJourneyRuntimeOptions,
    ),
  );

export const resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment = (
  environment: unknown,
) =>
  decodeSubscriberJourneyConvexProcessEnvironment(environment).pipe(
    Effect.map(
      (resolvedEnvironment): SubscriberJourneyRuntimeCoreOptions =>
        ({
          postgresUrl: resolvedEnvironment.POSTGRES_URL_INTERNAL,
          keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL_INTERNAL,
          keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
          keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
          keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
          keycloakConvexServiceActorUsername:
            resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME,
          keycloakConvexServiceActorPassword:
            resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD,
          polarAccessToken: resolvedEnvironment.POLAR_ACCESS_TOKEN,
          polarApiUrl: resolvedEnvironment.POLAR_API_URL,
          valkeyUrl: resolvedEnvironment.VALKEY_URL_INTERNAL,
          unleashUrl: resolvedEnvironment.UNLEASH_URL_INTERNAL,
          unleashApiKey: resolvedEnvironment.UNLEASH_API_KEY,
          ketoReadUrl: resolvedEnvironment.KETO_READ_URL_INTERNAL,
          ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL_INTERNAL,
        }) satisfies SubscriberJourneyRuntimeCoreOptions,
    ),
  );

export const runSubscriberJourneyFromOptions = <A, E>(
  options: SubscriberJourneyRuntimeOptions,
  use: (service: SubscriberJourneyService) => Effect.Effect<A, E>,
) =>
  decodeSubscriberJourneyRuntimeOptions(options).pipe(
    Effect.flatMap((resolvedOptions) =>
      runSubscriberJourneyWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runSubscriberJourneyFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: SubscriberJourneyService) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runSubscriberJourneyWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runSubscriberJourneyFromConvexEnvironment = <A, E>(
  environment: unknown,
  convexAdapter: ConvexAdapterService,
  use: (service: SubscriberJourneyService) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runSubscriberJourneyWithResolvedOptions(
        {
          ...resolvedOptions,
          convexAdapter,
        },
        use,
      ),
    ),
  );
