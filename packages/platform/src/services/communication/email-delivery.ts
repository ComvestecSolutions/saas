import { configDefaultValue, findModuleManifest } from "@comvestec/config";
import {
  emailDeliveryFeatureFlag,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import { and, desc, eq, or } from "drizzle-orm";
import {
  billingSubscriptionStatus,
  type EmailDeliveryProviderEvent,
  EmailDeliveryProviderEventSchema,
  type EmailDeliveryTrackingRecord,
  type Entitlement,
  type RequestContext,
  RequestContextSchema,
  platformModuleId,
} from "@comvestec/contracts";
import {
  billingEntitlementsTable,
  billingPaymentEventsTable,
  type BillingStatePostgresRepositoryError,
  BillingStatePostgresRepository,
  type BillingStatePostgresQueryable,
  billingSubscriptionsTable,
  buildEmailDeliveryPostgresQueryable,
  EmailDeliveryPostgresRepository,
  type EmailDeliveryModuleError,
  makeBillingStatePostgresRepository,
  makeEmailDeliveryModule,
  makeEmailDeliveryPostgresRepository,
  makeTenantBrandingModule,
  makeRuntimeConfigModule,
  makeRuntimeConfigPostgresRepository,
  type RuntimeConfigModulePersistenceError,
  RuntimeConfigModule,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  type RuntimeConfigPostgresQueryable,
  runtimeConfigSyncArtifactsTable,
  type UnknownConfigKeyError,
} from "@comvestec/modules";
import { Effect, ParseResult, Schema } from "effect";
import {
  makePostalAdapter,
  makePostgresAdapter,
  PostalAdapter,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";
import type {
  EmailDeliveryModuleService,
  EmailSenderIdentity,
} from "@comvestec/modules";

export const SendTenantTransactionalEmailRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  recipient: Schema.NonEmptyString,
  template: Schema.optional(Schema.NonEmptyString),
  subject: Schema.NonEmptyString,
  html: Schema.NonEmptyString,
  text: Schema.optional(Schema.NonEmptyString),
});

export type SendTenantTransactionalEmailRequest = Schema.Schema.Type<
  typeof SendTenantTransactionalEmailRequestSchema
>;

const PlatformSenderSchema = Schema.Struct({
  displayName: Schema.NonEmptyString,
  fromEmail: Schema.NonEmptyString,
  replyToEmail: Schema.NonEmptyString,
});

const PlatformSenderIdentitySchema = Schema.Struct({
  platformSender: PlatformSenderSchema,
});

export type EmailDeliveryServiceOptions = {
  readonly platformSender: EmailSenderIdentity;
  readonly emailDelivery: Pick<
    EmailDeliveryModuleService,
    "recordProviderDeliveryEvent" | "sendTransactionalEmail"
  >;
};

export type EmailDeliveryModuleDisabledError = {
  readonly _tag: "EmailDeliveryModuleDisabledError";
  readonly scope: RequestContext["tenant"]["scope"];
  readonly scopeId: RequestContext["tenant"]["scopeId"];
};

export type EmailDeliveryDeclarationMissingError = {
  readonly _tag: "EmailDeliveryDeclarationMissingError";
  readonly moduleId:
    | typeof platformModuleId.emailDelivery
    | typeof platformModuleId.tenantBranding;
  readonly key: string;
};

export type EmailDeliveryServiceError =
  | ParseResult.ParseError
  | RuntimeConfigModulePersistenceError
  | BillingStatePostgresRepositoryError
  | UnknownConfigKeyError
  | EmailDeliveryModuleError
  | EmailDeliveryDeclarationMissingError
  | EmailDeliveryModuleDisabledError;

export type EmailDeliveryService = {
  readonly sendTransactionalEmail: (
    input: SendTenantTransactionalEmailRequest,
  ) => Effect.Effect<
    ReturnType<
      EmailDeliveryModuleService["sendTransactionalEmail"]
    > extends Effect.Effect<infer Success, infer _Error, infer _Requirements>
      ? Success
      : never,
    EmailDeliveryServiceError
  >;
  readonly recordProviderDeliveryEvent: (
    input: EmailDeliveryProviderEvent,
  ) => Effect.Effect<EmailDeliveryTrackingRecord, EmailDeliveryServiceError>;
};

export const EmailDeliveryRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  postalApiUrl: Schema.NonEmptyString,
  postalApiKey: Schema.NonEmptyString,
  platformSender: PlatformSenderSchema,
});

export type EmailDeliveryRuntimeOptions = Schema.Schema.Type<
  typeof EmailDeliveryRuntimeOptionsSchema
>;

const EmailDeliveryProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  POSTAL_API_URL: Schema.NonEmptyString,
  POSTAL_API_KEY: Schema.NonEmptyString,
  PLATFORM_EMAIL_SENDER_DISPLAY_NAME: Schema.NonEmptyString,
  PLATFORM_EMAIL_SENDER_FROM_EMAIL: Schema.NonEmptyString,
  PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL: Schema.NonEmptyString,
});

const tenantBrandingEmailProjectionConfigKeys = [
  tenantBrandingConfigKey.companyName,
  tenantBrandingConfigKey.replyToEmail,
] as const;

const isMaterializedBrandingValue = (value: unknown) =>
  value !== undefined && value !== null && value !== configDefaultValue.inherit;

const requireDeclaredFeatureFlag = (
  moduleId:
    | typeof platformModuleId.emailDelivery
    | typeof platformModuleId.tenantBranding,
  key: string,
) =>
  Effect.fromNullable(
    findModuleManifest(moduleId)?.featureFlags.find(
      (candidate) => candidate.key === key,
    ),
  ).pipe(
    Effect.orElseFail(
      () =>
        ({
          _tag: "EmailDeliveryDeclarationMissingError",
          moduleId,
          key,
        }) satisfies EmailDeliveryDeclarationMissingError,
    ),
  );

const resolveTenantBrandingProjection = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly entitlements: readonly Entitlement[];
}) =>
  Effect.gen(function* () {
    const tenantBranding = yield* makeTenantBrandingModule();
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.tenantBranding,
    );
    const resolutions = yield* Effect.forEach(
      tenantBrandingEmailProjectionConfigKeys,
      (key) =>
        input.runtimeConfig
          .resolveConfigValue({
            requestContext: input.requestContext,
            moduleId: platformModuleId.tenantBranding,
            key,
            overrides,
            entitlements: input.entitlements,
          })
          .pipe(Effect.map((resolution) => [key, resolution] as const)),
      { concurrency: 1 },
    );

    const materializedValues = Object.fromEntries(
      resolutions.flatMap(([key, resolution]) =>
        isMaterializedBrandingValue(resolution.effectiveValue)
          ? [[key, resolution.effectiveValue] as const]
          : [],
      ),
    );

    return yield* tenantBranding.resolveBranding({
      requestContext: input.requestContext,
      entitled: resolutions.some(([, resolution]) => resolution.entitled),
      values: materializedValues,
    });
  });

const resolveFeatureFlagState = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly moduleId:
    | typeof platformModuleId.emailDelivery
    | typeof platformModuleId.tenantBranding;
  readonly key: string;
  readonly entitlements: readonly Entitlement[];
}) =>
  Effect.gen(function* () {
    const flag = yield* requireDeclaredFeatureFlag(input.moduleId, input.key);
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      input.moduleId,
    );

    return yield* input.runtimeConfig.resolveFeatureFlag({
      requestContext: input.requestContext,
      moduleId: input.moduleId,
      flag,
      overrides,
      entitlements: input.entitlements,
    });
  });

export const makeEmailDeliveryService = (
  options: EmailDeliveryServiceOptions,
) =>
  Schema.decodeUnknown(PlatformSenderIdentitySchema)({
    platformSender: options.platformSender,
  }).pipe(
    Effect.flatMap(({ platformSender }) =>
      Effect.gen(function* () {
        const runtimeConfig = yield* RuntimeConfigModule;
        const billingState = yield* BillingStatePostgresRepository;
        const emailDelivery = options.emailDelivery;

        return {
          sendTransactionalEmail: (
            input: SendTenantTransactionalEmailRequest,
          ) =>
            Schema.decodeUnknown(SendTenantTransactionalEmailRequestSchema)(
              input,
            ).pipe(
              Effect.flatMap((request) =>
                billingState
                  .getTenantAccessState({
                    ...request.requestContext.tenant,
                  })
                  .pipe(
                    Effect.flatMap((tenantAccessState) =>
                      resolveFeatureFlagState({
                        runtimeConfig,
                        requestContext: request.requestContext,
                        moduleId: platformModuleId.emailDelivery,
                        key: emailDeliveryFeatureFlag.enabled,
                        entitlements: tenantAccessState.entitlements,
                      }).pipe(
                        Effect.flatMap((emailDeliveryEnabled) =>
                          emailDeliveryEnabled.effectiveValue
                            ? Effect.succeed(tenantAccessState)
                            : Effect.fail({
                                _tag: "EmailDeliveryModuleDisabledError",
                                scope: request.requestContext.tenant.scope,
                                scopeId: request.requestContext.tenant.scopeId,
                              } satisfies EmailDeliveryModuleDisabledError),
                        ),
                      ),
                    ),
                    Effect.flatMap((tenantAccessState) =>
                      resolveTenantBrandingProjection({
                        runtimeConfig,
                        requestContext: request.requestContext,
                        entitlements: tenantAccessState.entitlements,
                      }).pipe(
                        Effect.flatMap((branding) =>
                          resolveFeatureFlagState({
                            runtimeConfig,
                            requestContext: request.requestContext,
                            moduleId: platformModuleId.tenantBranding,
                            key: tenantBrandingFeatureFlag.brandedEmails,
                            entitlements: tenantAccessState.entitlements,
                          }).pipe(
                            Effect.flatMap((brandedEmailsEnabled) =>
                              emailDelivery.sendTransactionalEmail({
                                requestContext: request.requestContext,
                                recipient: request.recipient,
                                ...(request.template !== undefined
                                  ? { template: request.template }
                                  : {}),
                                subject: request.subject,
                                html: request.html,
                                ...(request.text != null
                                  ? { text: request.text }
                                  : {}),
                                platformSender,
                                branding,
                                brandedEmailsEnabled: Boolean(
                                  brandedEmailsEnabled.effectiveValue,
                                ),
                              }),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ),
            ),
          recordProviderDeliveryEvent: (input: EmailDeliveryProviderEvent) =>
            Schema.decodeUnknown(EmailDeliveryProviderEventSchema)(input).pipe(
              Effect.flatMap((request) =>
                emailDelivery.recordProviderDeliveryEvent(request),
              ),
            ),
        } satisfies EmailDeliveryService;
      }),
    ),
  );

export const makeEmailDeliveryRuntime = (
  options: EmailDeliveryRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
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
    const runtimeConfigRepository = yield* makeRuntimeConfigPostgresRepository({
      ...writeDatabase,
      ...runtimeConfigQueryable,
    });
    const runtimeConfig = yield* makeRuntimeConfigModule(
      runtimeConfigRepository,
    );
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
    const billingState = yield* makeBillingStatePostgresRepository(
      billingStateQueryable,
    );
    const emailDeliveryRepository = yield* makeEmailDeliveryPostgresRepository(
      buildEmailDeliveryPostgresQueryable(writeDatabase),
    );
    const postal = yield* makePostalAdapter({
      apiUrl: options.postalApiUrl,
      apiKey: options.postalApiKey,
    });
    const emailDelivery = yield* makeEmailDeliveryModule().pipe(
      Effect.provideService(PostalAdapter, postal),
      Effect.provideService(
        EmailDeliveryPostgresRepository,
        emailDeliveryRepository,
      ),
    );
    const service = yield* makeEmailDeliveryService({
      platformSender: options.platformSender,
      emailDelivery,
    }).pipe(
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(BillingStatePostgresRepository, billingState),
    );

    return {
      service,
      close: postgres.close,
    };
  });

export const resolveEmailDeliveryRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(EmailDeliveryProcessEnvironmentSchema)(environment).pipe(
    Effect.map(
      (resolvedEnvironment): EmailDeliveryRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
        postalApiUrl: resolvedEnvironment.POSTAL_API_URL,
        postalApiKey: resolvedEnvironment.POSTAL_API_KEY,
        platformSender: {
          displayName: resolvedEnvironment.PLATFORM_EMAIL_SENDER_DISPLAY_NAME,
          fromEmail: resolvedEnvironment.PLATFORM_EMAIL_SENDER_FROM_EMAIL,
          replyToEmail:
            resolvedEnvironment.PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL,
        },
      }),
    ),
  );

const runEmailDeliveryWithResolvedOptions = <A, E>(
  options: EmailDeliveryRuntimeOptions,
  use: (service: EmailDeliveryService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeEmailDeliveryRuntime(options);

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const runEmailDeliveryFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: EmailDeliveryService) => Effect.Effect<A, E>,
) =>
  resolveEmailDeliveryRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runEmailDeliveryWithResolvedOptions(resolvedOptions, use),
    ),
  );
