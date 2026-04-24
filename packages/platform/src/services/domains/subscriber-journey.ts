import { Cause, Effect, ParseResult, Schema } from "effect";
import { and, asc, desc, eq, isNotNull, lte, or, sql } from "drizzle-orm";
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
  billingSubscriptionsTable,
  billingCustomerAccountsTable,
  identitySessionLifecycleEventType,
  identitySessionAuditTable,
  webhookReceiptsTable,
  workflowJobRuntime,
  WorkflowJobsPostgresRepository,
  type WorkflowJobsPostgresQueryable,
  type WorkflowJobsPostgresRepositoryError,
  makeWorkflowJobsPostgresRepository,
  workflowJobsTable,
  type BillingWebhookProcessingResult,
  type BillingWebhookReplayPostgresQueryable,
  type BillingStatePostgresRepositoryError,
  type BillingStatePostgresQueryable,
  type BillingWebhookProcessingError,
  type IdentitySessionCompletionInput,
  type IdentitySessionCompletionResult,
  type IdentitySessionModuleError,
  type IdentitySessionRequestContextLookup,
  identitySessionRunIdPrefix,
  type IdentitySessionStartInput,
  type IdentitySessionStartResult,
  IdentitySessionModule,
  IdentitySessionPostgresRepository,
  makeBillingMeteringModule,
  makeBillingWebhookReplayPostgresRepository,
  makeBillingStatePostgresRepository,
  makeBillingWebhookPostgresRepository,
  makeBillingWebhookService,
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
  type TenantOnboardingPostgresRepositoryError,
  TenantOnboardingPostgresRepository,
  tenantOnboardingRunStatus,
  tenantOnboardingRunsTable,
  type TenantOwnerProvisioningActorMissingError,
  TenantProvisioningPostgresRepository,
  TenantManagementModule,
  tenantProvisioningReceiptsTable,
  tenantProvisioningStatus,
  type WebhooksApiAccessModuleError,
  WebhooksApiAccessModule,
  type AuthorizationDecision,
  type BillingEntitlementRecord,
  type BillingWebhookPersistenceProjection,
  type TenantProvisioningPostgresRepositoryError,
} from "@comvestec/modules";
import {
  makeConvexAdapter,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  ConvexAdapter,
  type ConvexAdapterService,
  type ConvexWorkflowExecutionError,
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
} from "../../adapters";
import { createOryKetoAuthorizationDelegatedCheck } from "../access";
import {
  type MissingModuleManifestError,
  type ProductAppSnapshot,
  getProductAppSnapshotForRequest,
} from "../apps/app-snapshots";
import { buildWriteDatabase } from "../postgres-write-database";

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
});

export type PublicAuthStartPreparation = Schema.Schema.Type<
  typeof PublicAuthStartPreparationSchema
>;

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
  valkeyUrl: Schema.NonEmptyString,
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
  VALKEY_URL: Schema.NonEmptyString,
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
  KETO_READ_URL_INTERNAL: Schema.NonEmptyString,
  KETO_WRITE_URL_INTERNAL: Schema.NonEmptyString,
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
  | WorkflowJobsPostgresRepositoryError
  | BillingWebhookProcessingError
  | KeycloakAdapterRequestError
  | KeycloakSessionInactiveError
  | KeycloakSessionIdentifierMissingError
  | PolarAdapterRequestError
  | PolarCatalogMetadataError
  | PolarPlanNotFoundError
  | PolarPriceNotFoundError
  | PolarWebhookSignatureError
  | OryKetoAdapterRequestError
  | TenantOnboardingPostgresRepositoryError
  | TenantOwnerProvisioningActorMissingError
  | TenantProvisioningPostgresRepositoryError;

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

export const preparePublicAuthStart = (
  input: PublicAuthStartPreparationInput,
): Effect.Effect<PublicAuthStartPreparation, ParseResult.ParseError, never> =>
  Schema.decodeUnknown(PublicAuthStartPreparationInputSchema)(input).pipe(
    Effect.flatMap((request) => {
      const correlationId =
        request.correlationId ?? buildPublicAuthStartCorrelationId();
      const enabledModules = resolveDefaultTenantOnboardingEnabledModules();

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
          Schema.decodeUnknown(PublicAuthStartPreparationSchema)({
            correlationId,
            requestContext,
            tenant,
            enabledModules,
          }),
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
};

type MakeSubscriberJourneyServiceOptions = {
  readonly repairReadModel: SubscriberJourneyRepairReadModel;
};

export type SubscriberJourneyRepairQueryError = {
  readonly _tag: "SubscriberJourneyRepairQueryError";
  readonly operation:
    | "getProvisioningReceiptByTenant"
    | "getOnboardingRunByTenant"
    | "getCustomerAccountByTenant";
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

export type SubscriberJourneyService = {
  readonly listPublicPlans: Effect.Effect<
    PublicBillingPlanCatalog,
    | PolarAdapterRequestError
    | PolarCatalogMetadataError
    | ParseResult.ParseError
  >;
  readonly preparePublicAuthStart: (
    input: PublicAuthStartPreparationInput,
  ) => Effect.Effect<PublicAuthStartPreparation, ParseResult.ParseError>;
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

    const persistAndDispatchWorkflowJobRecord = (
      record: BillingReconciliationWorkflowJobRecord,
    ) =>
      persistWorkflowJobRecord(record).pipe(
        Effect.flatMap((persistedRecord) =>
          persistedRecord.status === workflowJobStatus.scheduled
            ? dispatchWorkflowJobRecord(persistedRecord).pipe(
                Effect.flatMap((dispatchResult) =>
                  !dispatchResult.primaryScheduled ||
                  dispatchResult.scheduledRecoveryAttemptCount <
                    dispatchResult.expectedRecoveryAttemptCount
                    ? buildWorkflowJobDispatchCoverageWarningRecord({
                        job: persistedRecord,
                        now: new Date().toISOString(),
                        primaryScheduled: dispatchResult.primaryScheduled,
                        scheduledRecoveryAttemptCount:
                          dispatchResult.scheduledRecoveryAttemptCount,
                        expectedRecoveryAttemptCount:
                          dispatchResult.expectedRecoveryAttemptCount,
                      }).pipe(
                        Effect.flatMap((degradedRecord) =>
                          persistWorkflowJobRecord(degradedRecord),
                        ),
                      )
                    : Effect.succeed(persistedRecord),
                ),
                Effect.catchAllCause((cause) => {
                  const now = new Date().toISOString();

                  return buildWorkflowJobDispatchFailureRecord({
                    job: persistedRecord,
                    cause,
                    now,
                  }).pipe(
                    Effect.flatMap((failedRecord) =>
                      persistWorkflowJobRecord(failedRecord),
                    ),
                    Effect.flatMap(() => Effect.failCause(cause)),
                  );
                }),
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
      readonly scope: RequestContext["tenant"]["scope"];
      readonly scopeId: string;
      readonly correlationId: string;
    }) =>
      Effect.gen(function* () {
        const lookup = yield* polar
          .lookupActiveSubscriptionByExternalCustomerId(input.scopeId)
          .pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        if (lookup === undefined) {
          return undefined;
        }

        const plans = yield* polar.listPlans.pipe(
          Effect.catchAll(() => Effect.succeed([] as PublicBillingPlanCatalog)),
        );
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
            scope: input.scope,
            scopeId: input.scopeId,
            subscriptionStatus: lookup.status,
            subscriptionId: lookup.subscriptionId,
            action: billingWebhookReconciliationAction.activate,
          })
          .pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        if (customerAccount === undefined) {
          return undefined;
        }

        const now = new Date().toISOString();
        const syntheticDeliveryId = [
          "polar-recovery",
          input.scope,
          input.scopeId,
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
            scope: input.scope,
            scopeId: input.scopeId,
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
            scope: input.scope,
            scopeId: input.scopeId,
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
            scope: input.scope,
            scopeId: input.scopeId,
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
      });

    const repairTenantStateFromBillingContext = (input: {
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
          const onboardingPlan = yield* tenantManagement.buildOnboardingPlan({
            requestContext,
            enabledModules: yield* resolveSubscriberJourneyEnabledModules(
              input.entitlements,
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
          customerAccount,
          entitlements: result.projection.entitlements,
          provider: result.reconciliation.event.provider,
          correlationId,
          source: subscriberJourneyRepairSource,
          deliveryId: result.reconciliation.event.deliveryId,
        });

        return result;
      });

    const runBillingConvergenceJobRecord = ({
      jobId,
      now,
    }: {
      readonly jobId: string;
      readonly now: string;
    }) =>
      Effect.gen(function* () {
        const existingJob = yield* workflowJobs.getWorkflowJob({ jobId });

        if (existingJob === undefined) {
          return undefined;
        }

        if (
          shouldBlockStaleRunningWorkflowJob({
            job: existingJob,
            now,
          })
        ) {
          const blockedJob = yield* blockWorkflowJob({
            job: existingJob,
            now,
            gapReason: workflowJobGapReason.repairFailed,
            lastError:
              existingJob.lastError ??
              "Automatic billing reconciliation recovery attempts were exhausted before the job completed.",
          });
          const persistedBlockedJob =
            yield* persistWorkflowJobRecord(blockedJob);

          return yield* buildWorkflowJobSummary({
            record: persistedBlockedJob,
          });
        }

        const attemptedJob = yield* workflowJobs.claimScheduledWorkflowJob({
          jobId,
          now,
        });

        if (attemptedJob === undefined) {
          return undefined;
        }

        return yield* Effect.gen(function* () {
          const tenantAccessState = yield* billingState.getTenantAccessState({
            scope: attemptedJob.tenantScope,
            scopeId: attemptedJob.tenantScopeId,
          });

          if (tenantAccessState.subscription === undefined) {
            const recovered = yield* recoverMissingBillingStateFromPolar({
              scope: attemptedJob.tenantScope,
              scopeId: attemptedJob.tenantScopeId,
              correlationId: attemptedJob.payload.correlationId,
            }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

            if (recovered !== undefined) {
              yield* repairTenantStateFromBillingContext({
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
              const persistedJob =
                yield* persistWorkflowJobRecord(completedJob);
              return yield* buildWorkflowJobSummary({ record: persistedJob });
            }

            const rescheduledJob = yield* rescheduleWorkflowJob({
              job: attemptedJob,
              now,
              gapReason: workflowJobGapReason.missingSubscriptionState,
            });
            const persistedJob =
              yield* persistAndDispatchWorkflowJobRecord(rescheduledJob);

            return yield* buildWorkflowJobSummary({ record: persistedJob });
          }

          const customerAccount = yield* Effect.tryPromise({
            try: () =>
              options.repairReadModel.getCustomerAccountByTenant(
                attemptedJob.tenantScope,
                attemptedJob.tenantScopeId,
              ),
            catch: (cause) =>
              ({
                _tag: "SubscriberJourneyRepairQueryError",
                operation: "getCustomerAccountByTenant",
                cause,
              }) satisfies SubscriberJourneyRepairQueryError,
          });

          if (customerAccount === undefined) {
            const recovered = yield* recoverMissingBillingStateFromPolar({
              scope: attemptedJob.tenantScope,
              scopeId: attemptedJob.tenantScopeId,
              correlationId: attemptedJob.payload.correlationId,
            }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

            if (recovered !== undefined) {
              yield* repairTenantStateFromBillingContext({
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
              const persistedJob =
                yield* persistWorkflowJobRecord(completedJob);

              return yield* buildWorkflowJobSummary({ record: persistedJob });
            }

            const rescheduledJob = yield* rescheduleWorkflowJob({
              job: attemptedJob,
              now,
              gapReason: workflowJobGapReason.missingCustomerAccount,
            });
            const persistedJob =
              yield* persistAndDispatchWorkflowJobRecord(rescheduledJob);

            return yield* buildWorkflowJobSummary({ record: persistedJob });
          }

          yield* repairTenantStateFromBillingContext({
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
          const persistedJob = yield* persistWorkflowJobRecord(completedJob);

          return yield* buildWorkflowJobSummary({ record: persistedJob });
        }).pipe(
          Effect.catchAllCause((cause) =>
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
          ),
        );
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
        ParseResult.ParseError,
        never
      > => preparePublicAuthStart(input),
      resolveRequestContext: identitySession.resolveRequestContext,
      startAuthentication: identitySession.startAuthentication,
      completeAuthentication: identitySession.completeAuthentication,
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
      buildProductBootstrap: (input: SubscriberJourneyBootstrapInput) =>
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
                  scope: requestContext.tenant.scope,
                  scopeId: requestContext.tenant.scopeId,
                });
              const snapshot =
                yield* getProductAppSnapshotForRequest(requestContext);
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

              return {
                requestContext,
                snapshot,
                authorization,
                billingStatus,
                enabledModules: yield* resolveSubscriberJourneyEnabledModules(
                  tenantAccessState.entitlements,
                ),
              };
            }),
          ),
        ),
    } satisfies SubscriberJourneyService;
  });

const makeSubscriberJourneyRuntime = (
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
    const polar = yield* makePolarAdapter({
      apiKey: options.polarAccessToken,
      apiUrl: options.polarApiUrl,
    });
    const tenantManagement = yield* makeTenantManagementModule();
    const billingMetering = yield* makeBillingMeteringModule();
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
      getLatestSubscriptionByScope: async (scope, scopeId) => {
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
    const billingStateRepository = yield* makeBillingStatePostgresRepository(
      billingStateQueryable,
    );
    const billingWebhookReplayRepository =
      yield* makeBillingWebhookReplayPostgresRepository(
        billingWebhookReplayQueryable,
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
    };
    const workflowJobsQueryable: WorkflowJobsPostgresQueryable = {
      getWorkflowJobById: async (jobId) => {
        const rows = await postgres.database
          .select()
          .from(workflowJobsTable)
          .where(eq(workflowJobsTable.jobId, jobId))
          .limit(1);

        return rows[0];
      },
      claimScheduledWorkflowJob: async (jobId, now) => {
        const staleRunningBefore = subtractSecondsFromDate(
          now,
          workflowJobsRunningClaimTimeoutSeconds,
        );
        const rows = await postgres.database
          .update(workflowJobsTable)
          .set({
            status: workflowJobStatus.running,
            attempts: sql`${workflowJobsTable.attempts} + 1`,
            completedAt: null,
            gapReason: null,
            lastError: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(workflowJobsTable.jobId, jobId),
              or(
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.scheduled),
                  lte(workflowJobsTable.scheduledAt, now),
                ),
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.running),
                  lte(workflowJobsTable.updatedAt, staleRunningBefore),
                ),
              ),
            ),
          )
          .returning();

        return rows[0];
      },
      restoreWorkflowJobIfUpdatedAtMatches: async (
        jobId,
        expectedUpdatedAt,
        record,
      ) => {
        const rows = await postgres.database
          .update(workflowJobsTable)
          .set({
            runtime: record.runtime,
            sourceModuleId: record.sourceModuleId,
            kind: record.kind,
            trigger: record.trigger,
            status: record.status,
            tenantScope: record.tenantScope,
            tenantScopeId: record.tenantScopeId,
            attempts: record.attempts,
            scheduledAt: new Date(record.scheduledAt),
            completedAt:
              record.completedAt === undefined
                ? null
                : new Date(record.completedAt),
            lastError: record.lastError ?? null,
            gapReason: record.gapReason ?? null,
            payload: record.payload,
            updatedAt: new Date(record.updatedAt),
          })
          .where(
            and(
              eq(workflowJobsTable.jobId, jobId),
              eq(workflowJobsTable.status, workflowJobStatus.scheduled),
              eq(workflowJobsTable.updatedAt, expectedUpdatedAt),
            ),
          )
          .returning();

        return rows[0];
      },
      listDueWorkflowJobs: async (sourceModuleId, scheduledBefore) =>
        postgres.database
          .select()
          .from(workflowJobsTable)
          .where(
            and(
              eq(workflowJobsTable.sourceModuleId, sourceModuleId),
              or(
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.scheduled),
                  lte(workflowJobsTable.scheduledAt, scheduledBefore),
                ),
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.running),
                  lte(
                    workflowJobsTable.updatedAt,
                    subtractSecondsFromDate(
                      scheduledBefore,
                      workflowJobsRunningClaimTimeoutSeconds,
                    ),
                  ),
                ),
              ),
            ),
          )
          .orderBy(asc(workflowJobsTable.scheduledAt)),
      listRepairGapWorkflowJobs: async (sourceModuleId) =>
        postgres.database
          .select()
          .from(workflowJobsTable)
          .where(
            and(
              eq(workflowJobsTable.sourceModuleId, sourceModuleId),
              or(
                and(
                  isNotNull(workflowJobsTable.gapReason),
                  or(
                    eq(workflowJobsTable.status, workflowJobStatus.scheduled),
                    eq(workflowJobsTable.status, workflowJobStatus.blocked),
                  ),
                ),
                and(
                  eq(workflowJobsTable.status, workflowJobStatus.running),
                  lte(
                    workflowJobsTable.updatedAt,
                    subtractSecondsFromDate(
                      new Date(),
                      workflowJobsRunningClaimTimeoutSeconds,
                    ),
                  ),
                ),
              ),
            ),
          )
          .orderBy(desc(workflowJobsTable.updatedAt)),
    };
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
    );
    const subscriberJourney = yield* makeSubscriberJourneyService({
      repairReadModel,
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
      service: subscriberJourney,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
      ]).pipe(Effect.asVoid),
    };
  });

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
          valkeyUrl: resolvedEnvironment.VALKEY_URL,
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
