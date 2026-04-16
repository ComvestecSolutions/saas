import { Effect, ParseResult, Schema } from "effect";
import { and, desc, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { findModuleManifest } from "@comvestec/config";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  BillingEntitlementQuotaSnapshotSchema,
  type BillingPlanCreateRequest,
  BillingPlanCreateRequestSchema,
  type BillingPlanCreateResult,
  type BillingCheckoutSessionInput,
  type BillingCheckoutSession,
  type BillingProviderWebhookInput,
  GovernanceEntitlementFeatureKeySchema,
  type PublicBillingPlanCatalog,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
  type RequestContext,
} from "@comvestec/contracts";
import {
  makeAuthorizationModule,
  BillingStatePostgresRepository,
  BillingWebhookReplayPostgresRepository,
  BillingWebhookService,
  billingEntitlementsTable,
  billingSubscriptionsTable,
  webhookReceiptsTable,
  type BillingWebhookProcessingResult,
  type BillingWebhookReplayPostgresQueryable,
  type BillingWebhookReplayPostgresRepositoryError,
  type BillingStatePostgresRepositoryError,
  type BillingStatePostgresQueryable,
  type BillingWebhookProcessingError,
  type IdentitySessionCompletionInput,
  type IdentitySessionCompletionResult,
  type IdentitySessionModuleError,
  type IdentitySessionRequestContextLookup,
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
  BillingMeteringModule,
  BillingWebhookPostgresRepository,
  type PostgresDatabase,
  type PostgresInsertBuilder,
  type PostgresTransaction,
  TenantOnboardingPostgresRepository,
  TenantProvisioningPostgresRepository,
  TenantManagementModule,
  type AuthorizationDecision,
  type BillingEntitlementRecord,
  type TenantProvisioningPostgresRepositoryError,
} from "@comvestec/modules";
import {
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  PolarAdapter,
  type PolarManagedBillingPlanError,
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
  PlatformAdapterServiceNameSchema,
  type PostgresRuntimeDatabase,
  ValkeyAdapter,
} from "../adapters";
import {
  type MissingModuleManifestError,
  type ProductAppSnapshot,
  getProductAppSnapshotForRequest,
} from "./app-snapshots";

const SubscriberJourneyBootstrapInputSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type SubscriberJourneyBootstrapInput = Schema.Schema.Type<
  typeof SubscriberJourneyBootstrapInputSchema
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
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  polarAccessToken: Schema.NonEmptyString,
  polarApiUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
});

export type SubscriberJourneyRuntimeOptions = Schema.Schema.Type<
  typeof SubscriberJourneyRuntimeOptionsSchema
>;

const SubscriberJourneyProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

const ProductBootstrapBillingStatusSchema = Schema.Struct({
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
  readonly snapshot: ProductAppSnapshot;
  readonly authorization: AuthorizationDecision;
  readonly billingStatus: ProductBootstrapBillingStatus;
  readonly entitlements: readonly BillingEntitlementRecord[];
};

export type ManagedBillingPlanAccessDeniedError = {
  readonly _tag: "ManagedBillingPlanAccessDeniedError";
  readonly reason: string;
  readonly auditRequired: boolean;
};

export type SubscriberJourneyServiceError =
  | ParseResult.ParseError
  | MissingModuleManifestError
  | IdentitySessionModuleError
  | BillingStatePostgresRepositoryError
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
  | ManagedBillingPlanAccessDeniedError
  | TenantProvisioningPostgresRepositoryError;

export type SubscriberJourneyWebhookReplayError =
  | BillingWebhookProcessingError
  | BillingWebhookReplayPostgresRepositoryError
  | PolarAdapterRequestError
  | PolarCatalogMetadataError;

const decodeBootstrapBillingStatus = Schema.decodeUnknown(
  ProductBootstrapBillingStatusSchema,
);

const decodeSubscriberJourneyProcessEnvironment = Schema.decodeUnknown(
  SubscriberJourneyProcessEnvironmentSchema,
);

const decodeSubscriberJourneyRuntimeOptions = Schema.decodeUnknown(
  SubscriberJourneyRuntimeOptionsSchema,
);

const buildBootstrapAuthorizationDecision = (input: {
  readonly requestContext: RequestContext;
  readonly allowed: boolean;
  readonly reason: string;
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
  auditRequired: false,
  ...(input.allowed && input.requestContext.actorId !== undefined
    ? {
        matchedTuple: {
          namespace: authorizationNamespace.tenant,
          object: input.requestContext.tenant.scopeId,
          relation: authorizationRelation.viewer,
          subject: input.requestContext.actorId,
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
        },
      }
    : {}),
});

const buildActorTypeAuthorizationSubject = (
  actorTypeValue: RequestContext["actorType"],
) => `actor-type:${actorTypeValue}`;

const authorizeManagedBillingPlanWrite = (requestContext: RequestContext) =>
  makeAuthorizationModule({
    tuples: [
      {
        namespace: authorizationNamespace.billingEntitlement,
        object: platformScope.platform,
        relation: authorizationRelation.admin,
        subject: buildActorTypeAuthorizationSubject(actorType.platformOperator),
        tenantScope: platformScope.platform,
        tenantScopeId: platformScope.platform,
      },
    ],
    cacheTtlSeconds: 60,
    maxCacheSize: 128,
  }).pipe(
    Effect.flatMap((authorization) =>
      authorization.check({
        requestContext,
        namespace: authorizationNamespace.billingEntitlement,
        object: platformScope.platform,
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.billingWrite,
      }),
    ),
    Effect.flatMap((decision) =>
      decision.allowed
        ? Effect.succeed(decision)
        : Effect.fail({
            _tag: "ManagedBillingPlanAccessDeniedError",
            reason: decision.reason,
            auditRequired: decision.auditRequired,
          } satisfies ManagedBillingPlanAccessDeniedError),
    ),
  );

export type SubscriberJourneyService = {
  readonly listPublicPlans: Effect.Effect<
    PublicBillingPlanCatalog,
    | PolarAdapterRequestError
    | PolarCatalogMetadataError
    | ParseResult.ParseError
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
  readonly createCheckoutSession: (
    input: BillingCheckoutSessionInput,
  ) => Effect.Effect<
    BillingCheckoutSession,
    | ParseResult.ParseError
    | PolarAdapterRequestError
    | PolarCatalogMetadataError
    | PolarPlanNotFoundError
    | PolarPriceNotFoundError
  >;
  readonly createManagedBillingPlan: (
    input: BillingPlanCreateRequest,
  ) => Effect.Effect<
    BillingPlanCreateResult,
    | ParseResult.ParseError
    | IdentitySessionModuleError
    | PolarManagedBillingPlanError
    | ManagedBillingPlanAccessDeniedError
  >;
  readonly processBillingWebhook: (
    input: BillingProviderWebhookInput,
  ) => Effect.Effect<
    BillingWebhookProcessingResult,
    BillingWebhookProcessingError
  >;
  readonly replayBillingWebhook: (
    input: SubscriberJourneyWebhookReplayInput,
  ) => Effect.Effect<
    BillingWebhookProcessingResult,
    SubscriberJourneyWebhookReplayError
  >;
  readonly buildProductBootstrap: (
    input: SubscriberJourneyBootstrapInput,
  ) => Effect.Effect<ProductBootstrapResult, SubscriberJourneyServiceError>;
};

export const makeSubscriberJourneyService = () =>
  Effect.gen(function* () {
    const polar = yield* PolarAdapter;
    const oryKeto = yield* OryKetoAdapter;
    const identitySession = yield* IdentitySessionModule;
    const billingWebhook = yield* BillingWebhookService;
    const billingWebhookReplay = yield* BillingWebhookReplayPostgresRepository;
    const billingState = yield* BillingStatePostgresRepository;

    return {
      listPublicPlans: polar.listPlans,
      resolveRequestContext: identitySession.resolveRequestContext,
      startAuthentication: identitySession.startAuthentication,
      completeAuthentication: identitySession.completeAuthentication,
      createManagedBillingPlan: (input: BillingPlanCreateRequest) =>
        Schema.decodeUnknown(BillingPlanCreateRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });

              yield* authorizeManagedBillingPlanWrite(requestContext);

              return yield* polar.createManagedBillingPlan(request.plan);
            }),
          ),
        ),
      createCheckoutSession: polar.createCheckoutSession,
      processBillingWebhook: billingWebhook.processPolarWebhook,
      replayBillingWebhook: (input: SubscriberJourneyWebhookReplayInput) =>
        Schema.decodeUnknown(SubscriberJourneyWebhookReplayInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            billingWebhookReplay.getWebhookReceipt(request).pipe(
              Effect.flatMap((receipt) =>
                billingWebhook.processPolarWebhook({
                  provider: receipt.provider,
                  deliveryId: receipt.deliveryId,
                  eventId: receipt.payload.eventId,
                  eventType: receipt.eventType,
                  occurredAt: receipt.payload.occurredAt,
                  verifiedSignature: receipt.verifiedSignature,
                  subscriptionId: receipt.payload.subscriptionId,
                  tenantScope: receipt.scope,
                  tenantScopeId: receipt.scopeId,
                  planId: receipt.payload.planId,
                  priceId: receipt.payload.priceId,
                  ...(receipt.payload.customerId !== undefined
                    ? { customerId: receipt.payload.customerId }
                    : {}),
                  ...(receipt.payload.currentPeriodEnd !== undefined
                    ? {
                        currentPeriodEnd: receipt.payload.currentPeriodEnd,
                      }
                    : {}),
                  ...(receipt.payload.cancelAt !== undefined
                    ? { cancelAt: receipt.payload.cancelAt }
                    : {}),
                }),
              ),
            ),
          ),
        ),
      buildProductBootstrap: (input: SubscriberJourneyBootstrapInput) =>
        Schema.decodeUnknown(SubscriberJourneyBootstrapInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });
              const tenantAccessState =
                yield* billingState.getTenantAccessState({
                  scope: requestContext.tenant.scope,
                  scopeId: requestContext.tenant.scopeId,
                });
              const snapshot =
                yield* getProductAppSnapshotForRequest(requestContext);
              const authorization =
                requestContext.actorId === undefined
                  ? buildBootstrapAuthorizationDecision({
                      requestContext,
                      allowed: false,
                      reason: "Request context is missing an actor id.",
                    })
                  : yield* oryKeto
                      .check({
                        namespace: authorizationNamespace.tenant,
                        object: requestContext.tenant.scopeId,
                        relation: authorizationRelation.viewer,
                        subject: requestContext.actorId,
                      })
                      .pipe(
                        Effect.map((result) =>
                          buildBootstrapAuthorizationDecision({
                            requestContext,
                            allowed: result.allowed,
                            reason: result.allowed
                              ? "Matched persisted tenant viewer relation."
                              : "Missing persisted tenant viewer relation.",
                          }),
                        ),
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

              return {
                requestContext,
                snapshot,
                authorization,
                billingStatus,
                entitlements: tenantAccessState.entitlements,
              };
            }),
          ),
        ),
    } satisfies SubscriberJourneyService;
  });

const buildWriteDatabase = (
  database: PostgresRuntimeDatabase,
): PostgresDatabase => {
  const buildInsert = <TTable extends PgTable>(
    insertable: Pick<PostgresRuntimeDatabase, "insert">,
    table: TTable,
  ): PostgresInsertBuilder<TTable> => ({
    values: (
      values: Parameters<PostgresInsertBuilder<TTable>["values"]>[0],
    ) => {
      const insertBuilder = insertable.insert(table);
      const valuesBuilder = Array.isArray(values)
        ? insertBuilder.values(values)
        : insertBuilder.values(values);

      return {
        onConflictDoUpdate: (
          options: Parameters<
            ReturnType<
              PostgresInsertBuilder<TTable>["values"]
            >["onConflictDoUpdate"]
          >[0],
        ) => valuesBuilder.onConflictDoUpdate(options),
      };
    },
  });

  return {
    insert: (table) => buildInsert(database, table),
    transaction: (callback) =>
      database.transaction(async (transaction) =>
        callback({
          insert: (table) => buildInsert(transaction, table),
        } satisfies PostgresTransaction),
      ),
  };
};

const makeSubscriberJourneyRuntime = (
  options: SubscriberJourneyRuntimeOptions,
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
        BillingWebhookPostgresRepository,
        billingWebhookRepository,
      ),
    );
    const subscriberJourney = yield* makeSubscriberJourneyService().pipe(
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(BillingWebhookService, billingWebhookService),
      Effect.provideService(
        BillingWebhookReplayPostgresRepository,
        billingWebhookReplayRepository,
      ),
      Effect.provideService(
        BillingStatePostgresRepository,
        billingStateRepository,
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
  options: SubscriberJourneyRuntimeOptions,
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
          keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
          keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
          keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
          keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
          polarAccessToken: resolvedEnvironment.POLAR_ACCESS_TOKEN,
          polarApiUrl: resolvedEnvironment.POLAR_API_URL,
          valkeyUrl: resolvedEnvironment.VALKEY_URL,
          ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
          ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
        }) satisfies SubscriberJourneyRuntimeOptions,
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
