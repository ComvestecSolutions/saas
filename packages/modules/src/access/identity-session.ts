import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  AbsoluteRedirectUriSchema,
  actorType,
  onboardingStepStatus,
  PlatformModuleIdSchema,
  platformScope,
  RequestContextSchema,
  TenantContextSchema,
  type RequestContext,
  type TenantContext,
} from "@comvestec/contracts";
import {
  KeycloakAdapter,
  KeycloakLoginRedirectSchema,
  OryKetoAdapter,
  KeycloakSessionInputSchema,
  KeycloakSessionSchema,
  type KeycloakAdapterRequestError,
  type KeycloakSessionIdentifierMissingError,
  type KeycloakSessionInactiveError,
  type OryKetoAdapterRequestError,
  ValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "@comvestec/platform";
import {
  TenantManagementModule,
  TenantOwnerProvisioningSchema,
  TenantOnboardingPlanSchema,
  type TenantOnboardingPlan,
  tenantProvisioningStatus,
  type TenantOwnerProvisioningActorMissingError,
} from "../domains";
import {
  IdentitySessionLifecycleEventSchema,
  IdentitySessionPostgresRepository,
  TenantProvisioningPostgresRepository,
  tenantOnboardingRunStatus,
  type IdentitySessionPostgresRepositoryError,
  TenantOnboardingPersistenceProjectionSchema,
  type TenantProvisioningPostgresRepositoryError,
  TenantOnboardingPostgresRepository,
  type TenantOnboardingPostgresRepositoryError,
} from "../persistence";

const IdentitySessionStartInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  displayNameHint: Schema.optional(Schema.NonEmptyString),
  redirectUri: AbsoluteRedirectUriSchema,
  state: Schema.optional(Schema.NonEmptyString),
});

export type IdentitySessionStartInput = Schema.Schema.Type<
  typeof IdentitySessionStartInputSchema
>;

const IdentitySessionCompletionInputSchema = Schema.Struct({
  session: KeycloakSessionInputSchema,
  correlationId: Schema.NonEmptyString,
  host: Schema.optional(Schema.NonEmptyString),
  tenant: TenantContextSchema,
  enabledModules: Schema.Array(PlatformModuleIdSchema),
});

export type IdentitySessionCompletionInput = Schema.Schema.Type<
  typeof IdentitySessionCompletionInputSchema
>;

export const IdentitySessionStartResultSchema = Schema.Struct({
  correlationId: Schema.NonEmptyString,
  redirect: KeycloakLoginRedirectSchema,
});

export type IdentitySessionStartResult = Schema.Schema.Type<
  typeof IdentitySessionStartResultSchema
>;

export const IdentitySessionCompletionResultSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  session: KeycloakSessionSchema,
  provisioning: TenantOwnerProvisioningSchema,
  onboardingPlan: TenantOnboardingPlanSchema,
  lifecycleEvent: IdentitySessionLifecycleEventSchema,
  onboarding: TenantOnboardingPersistenceProjectionSchema,
});

export type IdentitySessionCompletionResult = Schema.Schema.Type<
  typeof IdentitySessionCompletionResultSchema
>;

export type IdentitySessionModuleError =
  | ParseResult.ParseError
  | IdentitySessionPostgresRepositoryError
  | TenantOnboardingPostgresRepositoryError
  | TenantProvisioningPostgresRepositoryError
  | KeycloakAdapterRequestError
  | KeycloakSessionInactiveError
  | KeycloakSessionIdentifierMissingError
  | OryKetoAdapterRequestError
  | ValkeyAdapterOperationError
  | TenantOwnerProvisioningActorMissingError
  | IdentitySessionRequestContextNotFoundError;

const IdentitySessionRequestContextLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type IdentitySessionRequestContextLookup = Schema.Schema.Type<
  typeof IdentitySessionRequestContextLookupSchema
>;

export type IdentitySessionRequestContextNotFoundError = {
  readonly _tag: "IdentitySessionRequestContextNotFoundError";
  readonly sessionId: RequestContext["sessionId"];
};

const IdentitySessionLifecycleEventTypeConstantSchema = Schema.Struct({
  authCallbackCompleted: Schema.Literal("auth.callback.completed"),
});

export const identitySessionLifecycleEventType = Schema.validateSync(
  IdentitySessionLifecycleEventTypeConstantSchema,
)({
  authCallbackCompleted: "auth.callback.completed",
} satisfies Schema.Schema.Type<
  typeof IdentitySessionLifecycleEventTypeConstantSchema
>);

const IdentitySessionRunIdPrefixConstantSchema = Schema.Struct({
  tenantOnboarding: Schema.Literal("tenant-onboarding"),
});

export const identitySessionRunIdPrefix = Schema.validateSync(
  IdentitySessionRunIdPrefixConstantSchema,
)({
  tenantOnboarding: "tenant-onboarding",
} satisfies Schema.Schema.Type<
  typeof IdentitySessionRunIdPrefixConstantSchema
>);

const decodeIdentitySessionStartResult = Schema.decodeUnknown(
  IdentitySessionStartResultSchema,
);

const decodeIdentitySessionCompletionResult = Schema.decodeUnknown(
  IdentitySessionCompletionResultSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

const resolveAuthenticatedActorType = (tenant: TenantContext) => {
  switch (tenant.scope) {
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

const buildOnboardingRunId = (tenant: TenantContext) =>
  [
    identitySessionRunIdPrefix.tenantOnboarding,
    tenant.scope,
    tenant.scopeId,
  ].join(":");

const resolveCurrentStepId = (plan: TenantOnboardingPlan) =>
  plan.steps.find(
    (step) =>
      step.status === onboardingStepStatus.inProgress ||
      step.status === onboardingStepStatus.notStarted,
  )?.stepId;

export type IdentitySessionModuleService = {
  readonly startAuthentication: (
    input: IdentitySessionStartInput,
  ) => Effect.Effect<IdentitySessionStartResult, ParseResult.ParseError>;
  readonly completeAuthentication: (
    input: IdentitySessionCompletionInput,
  ) => Effect.Effect<
    IdentitySessionCompletionResult,
    IdentitySessionModuleError
  >;
  readonly resolveRequestContext: (
    input: IdentitySessionRequestContextLookup,
  ) => Effect.Effect<
    RequestContext,
    | ParseResult.ParseError
    | ValkeyAdapterOperationError
    | IdentitySessionRequestContextNotFoundError
  >;
};

export class IdentitySessionModule extends Context.Tag("IdentitySessionModule")<
  IdentitySessionModule,
  IdentitySessionModuleService
>() {}

export const makeIdentitySessionModule = () =>
  Effect.gen(function* () {
    const keycloak = yield* KeycloakAdapter;
    const oryKeto = yield* OryKetoAdapter;
    const valkey = yield* ValkeyAdapter;
    const tenantManagement = yield* TenantManagementModule;
    const identitySessionRepository = yield* IdentitySessionPostgresRepository;
    const tenantProvisioningRepository =
      yield* TenantProvisioningPostgresRepository;
    const tenantOnboardingRepository =
      yield* TenantOnboardingPostgresRepository;

    return {
      startAuthentication: (input: IdentitySessionStartInput) =>
        Schema.decodeUnknown(IdentitySessionStartInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            keycloak
              .buildLoginRedirect({
                tenantHint:
                  request.tenantHint ??
                  (request.requestContext.tenant.scope ===
                  platformScope.platform
                    ? undefined
                    : request.requestContext.tenant.scopeId),
                displayNameHint: request.displayNameHint,
                redirectUri: request.redirectUri,
                state: request.state,
              })
              .pipe(
                Effect.flatMap((redirect) =>
                  decodeIdentitySessionStartResult({
                    correlationId: request.requestContext.correlationId,
                    redirect,
                  }),
                ),
              ),
          ),
        ),
      completeAuthentication: (input: IdentitySessionCompletionInput) =>
        Schema.decodeUnknown(IdentitySessionCompletionInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const session = yield* keycloak.validateSession(request.session);
              const requestContext = yield* decodeRequestContext({
                actorType: resolveAuthenticatedActorType(request.tenant),
                actorId: session.actorId,
                sessionId: session.sessionId,
                correlationId: request.correlationId,
                ...(request.host !== undefined ? { host: request.host } : {}),
                tenant: request.tenant,
              });
              const pendingProvisioning =
                yield* tenantManagement.provisionTenantOwner({
                  requestContext,
                });
              const onboardingPlan =
                yield* tenantManagement.buildOnboardingPlan({
                  requestContext,
                  enabledModules: request.enabledModules,
                });
              yield* tenantProvisioningRepository.persistProvisioningReceipt(
                pendingProvisioning,
              );
              const lifecycleEvent =
                yield* identitySessionRepository.persistLifecycleEvent({
                  eventId: [
                    keycloak.serviceName,
                    session.sessionId,
                    request.correlationId,
                    identitySessionLifecycleEventType.authCallbackCompleted,
                  ].join(":"),
                  sessionId: session.sessionId,
                  actorId: session.actorId,
                  tenantScope: request.tenant.scope,
                  tenantScopeId: request.tenant.scopeId,
                  eventType:
                    identitySessionLifecycleEventType.authCallbackCompleted,
                  provider: keycloak.serviceName,
                  metadata: {
                    correlationId: request.correlationId,
                    realm: session.realm,
                    tenantHint: session.tenantHint ?? request.tenant.scopeId,
                    provisioningId: pendingProvisioning.provisioningId,
                  },
                });
              const onboarding =
                yield* tenantOnboardingRepository.persistOnboardingRun({
                  runId: buildOnboardingRunId(request.tenant),
                  triggeredBy: session.actorId,
                  correlationId: request.correlationId,
                  status: tenantOnboardingRunStatus.inProgress,
                  currentStepId: resolveCurrentStepId(onboardingPlan),
                  plan: onboardingPlan,
                  metadata: {
                    provider: keycloak.serviceName,
                    realm: session.realm,
                    sessionId: session.sessionId,
                  },
                });
              const tupleWriteExit = yield* Effect.exit(
                Effect.forEach(
                  pendingProvisioning.authorizationTuples,
                  (tuple) =>
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

              const provisioning =
                yield* tenantProvisioningRepository.persistProvisioningReceipt({
                  ...pendingProvisioning,
                  status: tenantProvisioningStatus.provisioned,
                });
              yield* valkey.writeSession({
                sessionId: session.sessionId,
                requestContext,
              });

              return yield* decodeIdentitySessionCompletionResult({
                requestContext,
                session,
                provisioning,
                onboardingPlan,
                lifecycleEvent,
                onboarding,
              });
            }),
          ),
        ),
      resolveRequestContext: (input: IdentitySessionRequestContextLookup) =>
        Schema.decodeUnknown(IdentitySessionRequestContextLookupSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            valkey.readSession(request).pipe(
              Effect.flatMap((sessionEntry) =>
                sessionEntry === undefined
                  ? Effect.fail({
                      _tag: "IdentitySessionRequestContextNotFoundError",
                      sessionId: request.sessionId,
                    } satisfies IdentitySessionRequestContextNotFoundError)
                  : Effect.succeed(sessionEntry.requestContext),
              ),
            ),
          ),
        ),
    } satisfies IdentitySessionModuleService;
  });

export const IdentitySessionModuleLive = Layer.effect(
  IdentitySessionModule,
  makeIdentitySessionModule(),
);
