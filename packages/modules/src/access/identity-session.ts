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
  themeHint: Schema.optional(Schema.NonEmptyString),
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

const PlatformOperatorTenantContextSchema = Schema.Struct({
  scope: Schema.Literal(platformScope.platform),
  scopeId: Schema.Literal(platformScope.platform),
});

export const IdentitySessionInvalidationReasonSchema = Schema.Literal(
  "logout",
  "stale-session",
);

export type IdentitySessionInvalidationReason = Schema.Schema.Type<
  typeof IdentitySessionInvalidationReasonSchema
>;

const IdentitySessionInvalidationInputSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
  reason: IdentitySessionInvalidationReasonSchema,
});

export type IdentitySessionInvalidationInput = Schema.Schema.Type<
  typeof IdentitySessionInvalidationInputSchema
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

export const IdentitySessionPlatformOperatorCompletionResultSchema =
  Schema.Struct({
    requestContext: RequestContextSchema,
    session: KeycloakSessionSchema,
    lifecycleEvent: IdentitySessionLifecycleEventSchema,
  });

export type IdentitySessionPlatformOperatorCompletionResult =
  Schema.Schema.Type<
    typeof IdentitySessionPlatformOperatorCompletionResultSchema
  >;

export const IdentitySessionInvalidationResultSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
  reason: IdentitySessionInvalidationReasonSchema,
  invalidated: Schema.Boolean,
  requestContext: Schema.optional(RequestContextSchema),
  lifecycleEvent: Schema.optional(IdentitySessionLifecycleEventSchema),
});

export type IdentitySessionInvalidationResult = Schema.Schema.Type<
  typeof IdentitySessionInvalidationResultSchema
>;

export type PlatformOperatorAuthenticationActorTypeNotAllowedError = {
  readonly _tag: "PlatformOperatorAuthenticationActorTypeNotAllowedError";
  readonly actorId: string;
  readonly expectedActorTypes: readonly [
    typeof actorType.platformOperator,
    typeof actorType.supportOperator,
  ];
  readonly actorType?: string;
};

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
  | PlatformOperatorAuthenticationActorTypeNotAllowedError
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

export const resolveIdentitySessionRequestContext = (
  valkey: ValkeyAdapter["Type"],
  input: IdentitySessionRequestContextLookup,
) =>
  Schema.decodeUnknown(IdentitySessionRequestContextLookupSchema)(input).pipe(
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
  );

const IdentitySessionLifecycleEventTypeConstantSchema = Schema.Struct({
  authCallbackCompleted: Schema.Literal("auth.callback.completed"),
  logoutCompleted: Schema.Literal("auth.logout.completed"),
  staleSessionInvalidated: Schema.Literal("auth.stale-session.invalidated"),
});

export const identitySessionLifecycleEventType = Schema.validateSync(
  IdentitySessionLifecycleEventTypeConstantSchema,
)({
  authCallbackCompleted: "auth.callback.completed",
  logoutCompleted: "auth.logout.completed",
  staleSessionInvalidated: "auth.stale-session.invalidated",
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

const decodeIdentitySessionPlatformOperatorCompletionResult =
  Schema.decodeUnknown(IdentitySessionPlatformOperatorCompletionResultSchema);

const decodeIdentitySessionInvalidationResult = Schema.decodeUnknown(
  IdentitySessionInvalidationResultSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

const decodeActorId = Schema.decodeUnknown(Schema.NonEmptyString);

const adminOperatorActorTypes = [
  actorType.platformOperator,
  actorType.supportOperator,
] as const;

type AdminOperatorActorType = (typeof adminOperatorActorTypes)[number];

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

const resolveInvalidationEventType = (
  reason: IdentitySessionInvalidationReason,
) =>
  reason === "logout"
    ? identitySessionLifecycleEventType.logoutCompleted
    : identitySessionLifecycleEventType.staleSessionInvalidated;

const requirePlatformOperatorSessionActorType = (
  session: Schema.Schema.Type<typeof KeycloakSessionSchema>,
): Effect.Effect<
  AdminOperatorActorType,
  PlatformOperatorAuthenticationActorTypeNotAllowedError
> =>
  adminOperatorActorTypes.includes(session.actorType as AdminOperatorActorType)
    ? Effect.succeed(session.actorType as AdminOperatorActorType)
    : Effect.fail({
        _tag: "PlatformOperatorAuthenticationActorTypeNotAllowedError",
        actorId: session.actorId,
        expectedActorTypes: adminOperatorActorTypes,
        ...(session.actorType !== undefined
          ? { actorType: session.actorType }
          : {}),
      } satisfies PlatformOperatorAuthenticationActorTypeNotAllowedError);

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
  readonly completePlatformOperatorAuthentication: (
    input: IdentitySessionCompletionInput,
  ) => Effect.Effect<
    IdentitySessionPlatformOperatorCompletionResult,
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

    const validateCompletionInput = (input: IdentitySessionCompletionInput) =>
      Schema.decodeUnknown(IdentitySessionCompletionInputSchema)(input).pipe(
        Effect.flatMap((request) =>
          keycloak.validateSession(request.session).pipe(
            Effect.map((session) => ({
              request,
              session,
            })),
          ),
        ),
      );

    const resolveCompletionContext = (input: IdentitySessionCompletionInput) =>
      validateCompletionInput(input).pipe(
        Effect.flatMap(({ request, session }) =>
          decodeRequestContext({
            actorType: resolveAuthenticatedActorType(request.tenant),
            actorId: session.actorId,
            sessionId: session.sessionId,
            correlationId: request.correlationId,
            ...(request.host !== undefined ? { host: request.host } : {}),
            tenant: request.tenant,
          }).pipe(
            Effect.map((requestContext) => ({
              request,
              session,
              requestContext,
            })),
          ),
        ),
      );

    const resolvePlatformOperatorCompletionContext = (
      input: IdentitySessionCompletionInput,
    ) =>
      validateCompletionInput(input).pipe(
        Effect.flatMap(({ request, session }) =>
          Schema.decodeUnknown(PlatformOperatorTenantContextSchema)(
            request.tenant,
          ).pipe(
            Effect.flatMap(() =>
              requirePlatformOperatorSessionActorType(session),
            ),
            Effect.flatMap((validatedActorType) =>
              decodeRequestContext({
                actorType: validatedActorType,
                actorId: session.actorId,
                sessionId: session.sessionId,
                correlationId: request.correlationId,
                ...(request.host !== undefined ? { host: request.host } : {}),
                tenant: request.tenant,
              }).pipe(
                Effect.map((requestContext) => ({
                  request,
                  session,
                  requestContext,
                })),
              ),
            ),
          ),
        ),
      );

    const persistAuthCallbackCompletedLifecycleEvent = (input: {
      readonly request: Schema.Schema.Type<
        typeof IdentitySessionCompletionInputSchema
      >;
      readonly session: Schema.Schema.Type<typeof KeycloakSessionSchema>;
      readonly provisioningId?: string;
    }) =>
      identitySessionRepository.persistLifecycleEvent({
        eventId: [
          keycloak.serviceName,
          input.session.sessionId,
          input.request.correlationId,
          identitySessionLifecycleEventType.authCallbackCompleted,
        ].join(":"),
        sessionId: input.session.sessionId,
        actorId: input.session.actorId,
        tenantScope: input.request.tenant.scope,
        tenantScopeId: input.request.tenant.scopeId,
        eventType: identitySessionLifecycleEventType.authCallbackCompleted,
        provider: keycloak.serviceName,
        metadata: {
          correlationId: input.request.correlationId,
          realm: input.session.realm,
          tenantHint: input.session.tenantHint ?? input.request.tenant.scopeId,
          ...(input.provisioningId !== undefined
            ? { provisioningId: input.provisioningId }
            : {}),
        },
      });

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
                themeHint: request.themeHint,
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
        resolveCompletionContext(input).pipe(
          Effect.flatMap(({ request, session, requestContext }) =>
            Effect.gen(function* () {
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
                yield* persistAuthCallbackCompletedLifecycleEvent({
                  request,
                  session,
                  provisioningId: pendingProvisioning.provisioningId,
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
      completePlatformOperatorAuthentication: (
        input: IdentitySessionCompletionInput,
      ) =>
        resolvePlatformOperatorCompletionContext(input).pipe(
          Effect.flatMap(({ request, session, requestContext }) =>
            Effect.gen(function* () {
              const lifecycleEvent =
                yield* persistAuthCallbackCompletedLifecycleEvent({
                  request,
                  session,
                });

              yield* valkey.writeSession({
                sessionId: session.sessionId,
                requestContext,
              });

              return yield* decodeIdentitySessionPlatformOperatorCompletionResult(
                {
                  requestContext,
                  session,
                  lifecycleEvent,
                },
              );
            }),
          ),
        ),
      invalidateSession: (input: IdentitySessionInvalidationInput) =>
        Schema.decodeUnknown(IdentitySessionInvalidationInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            valkey.readSession({ sessionId: request.sessionId }).pipe(
              Effect.flatMap((sessionEntry) => {
                if (sessionEntry === undefined) {
                  return decodeIdentitySessionInvalidationResult({
                    sessionId: request.sessionId,
                    correlationId: request.correlationId,
                    reason: request.reason,
                    invalidated: false,
                  });
                }

                return Effect.gen(function* () {
                  const actorId = yield* decodeActorId(
                    sessionEntry.requestContext.actorId,
                  );
                  const eventType = resolveInvalidationEventType(
                    request.reason,
                  );
                  yield* valkey.deleteSession({ sessionId: request.sessionId });

                  const lifecycleEvent =
                    yield* identitySessionRepository.persistLifecycleEvent({
                      eventId: [
                        keycloak.serviceName,
                        request.sessionId,
                        request.correlationId,
                        eventType,
                      ].join(":"),
                      sessionId: request.sessionId,
                      actorId,
                      tenantScope: sessionEntry.requestContext.tenant.scope,
                      tenantScopeId: sessionEntry.requestContext.tenant.scopeId,
                      eventType,
                      provider: keycloak.serviceName,
                      metadata: {
                        correlationId: request.correlationId,
                        reason: request.reason,
                      },
                    });

                  return yield* decodeIdentitySessionInvalidationResult({
                    sessionId: request.sessionId,
                    correlationId: request.correlationId,
                    reason: request.reason,
                    invalidated: true,
                    requestContext: sessionEntry.requestContext,
                    lifecycleEvent,
                  });
                });
              }),
            ),
          ),
        ),
      resolveRequestContext: (input: IdentitySessionRequestContextLookup) =>
        resolveIdentitySessionRequestContext(valkey, input),
    } satisfies IdentitySessionModuleService;
  });

export const IdentitySessionModuleLive = Layer.effect(
  IdentitySessionModule,
  makeIdentitySessionModule(),
);
