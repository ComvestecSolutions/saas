import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  adminManagedOperatorRoles,
  AdminOperatorIdentitySchema,
  AdminOperatorProvisionResultSchema,
  authorizationNamespace,
  authorizationRelation,
  platformModuleId,
  platformScope,
  type AdminManagedOperatorRole,
  type AdminOperatorIdentity,
  type AdminOperatorProvisionResult,
  type RequestContext,
} from "@comvestec/contracts";
import {
  makeIdentitySessionPostgresRepository,
  resolveIdentitySessionRequestContext,
  type IdentitySessionPostgresRepositoryError,
  type IdentitySessionRequestContextNotFoundError,
} from "@comvestec/modules";
import {
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  type KeycloakAdapterRequestError,
  type KeycloakAdminCredentialsUnavailableError,
  type OryKetoAdapterRequestError,
  type PostgresAdapterConnectionError,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

const AdminOperatorSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type AdminOperatorSessionLookup = Schema.Schema.Type<
  typeof AdminOperatorSessionLookupSchema
>;

const AdminOperatorProvisionBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  username: Schema.optional(Schema.NonEmptyString),
  actorType: Schema.Literal(...adminManagedOperatorRoles),
  reason: Schema.NonEmptyString,
});

export type AdminOperatorProvisionBySessionRequest = Schema.Schema.Type<
  typeof AdminOperatorProvisionBySessionRequestSchema
>;

const AdminOperatorManagementRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakAdminUsername: Schema.NonEmptyString,
  keycloakAdminPassword: Schema.NonEmptyString,
  adminAppBaseUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
});

export type AdminOperatorManagementRuntimeOptions = Schema.Schema.Type<
  typeof AdminOperatorManagementRuntimeOptionsSchema
>;

const AdminOperatorManagementProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_ADMIN: Schema.NonEmptyString,
  KEYCLOAK_ADMIN_PASSWORD: Schema.NonEmptyString,
  ADMIN_APP_BASE_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

export type AdminOperatorManagementAccessDeniedError = {
  readonly _tag: "AdminOperatorManagementAccessDeniedError";
  readonly reason: string;
};

export type AdminOperatorProvisionedIdentityClaimMismatchError = {
  readonly _tag: "AdminOperatorProvisionedIdentityClaimMismatchError";
  readonly actorId: string;
  readonly expectedActorType: AdminManagedOperatorRole;
  readonly actualActorType?: string;
};

export type AdminOperatorManagementServiceError =
  | AdminOperatorManagementAccessDeniedError
  | AdminOperatorProvisionedIdentityClaimMismatchError
  | ParseResult.ParseError
  | IdentitySessionPostgresRepositoryError
  | IdentitySessionRequestContextNotFoundError
  | KeycloakAdapterRequestError
  | KeycloakAdminCredentialsUnavailableError
  | OryKetoAdapterRequestError
  | ValkeyAdapterOperationError;

export type AdminOperatorManagementRuntimeError =
  | AdminOperatorManagementServiceError
  | PostgresAdapterConnectionError;

export type AdminOperatorManagementService = {
  readonly getCurrentOperatorIdentity: (
    input: AdminOperatorSessionLookup,
  ) => Effect.Effect<
    AdminOperatorIdentity,
    AdminOperatorManagementServiceError
  >;
  readonly listOperators: (
    input: AdminOperatorSessionLookup,
  ) => Effect.Effect<
    ReadonlyArray<AdminOperatorIdentity>,
    AdminOperatorManagementServiceError
  >;
  readonly provisionOperator: (
    input: AdminOperatorProvisionBySessionRequest,
  ) => Effect.Effect<
    AdminOperatorProvisionResult,
    AdminOperatorManagementServiceError
  >;
};

const decodeAdminOperatorSessionLookup = Schema.decodeUnknown(
  AdminOperatorSessionLookupSchema,
);

const decodeAdminOperatorProvisionBySessionRequest = Schema.decodeUnknown(
  AdminOperatorProvisionBySessionRequestSchema,
);

const decodeAdminOperatorIdentity = Schema.decodeUnknown(
  AdminOperatorIdentitySchema,
);

const decodeAdminOperatorProvisionResult = Schema.decodeUnknown(
  AdminOperatorProvisionResultSchema,
);

const decodeAdminOperatorManagementRuntimeOptions = Schema.decodeUnknown(
  AdminOperatorManagementRuntimeOptionsSchema,
);

const decodeAdminOperatorManagementProcessEnvironment = Schema.decodeUnknown(
  AdminOperatorManagementProcessEnvironmentSchema,
);

const adminOperatorManagementLifecycleEventType = Schema.validateSync(
  Schema.Struct({
    provisioned: Schema.Literal("admin.operator.provisioned"),
  }),
)({
  provisioned: "admin.operator.provisioned",
});

const platformOperatorAuthorizationSubject = `actor-type:${actorType.platformOperator}`;

const buildAdminOperatorBaselineTuples = () =>
  [
    {
      namespace: authorizationNamespace.billingEntitlement,
      object: platformScope.platform,
      relation: authorizationRelation.viewer,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.billingEntitlement,
      object: platformScope.platform,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.workflowJobs,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.retentionLegalHold,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.webhooksApiAccess,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.notificationCenter,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.emailDelivery,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.brandingProfile,
      object: [
        platformModuleId.tenantBranding,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
  ] as const;

const generateTemporaryPassword = () =>
  `Adm_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}!aA1`;

const resolveUsername = (input: {
  readonly email: string;
  readonly username: string | undefined;
}) => input.username ?? input.email;

const requireCurrentActorId = (requestContext: RequestContext) =>
  Schema.decodeUnknown(Schema.NonEmptyString)(requestContext.actorId);

const requireManagedAdminOperatorActor = (requestContext: RequestContext) =>
  adminManagedOperatorRoles.includes(
    requestContext.actorType as AdminManagedOperatorRole,
  )
    ? Effect.succeed(requestContext.actorType as AdminManagedOperatorRole)
    : Effect.fail({
        _tag: "AdminOperatorManagementAccessDeniedError",
        reason:
          "Only supported admin operators may access admin operator identity surfaces.",
      } satisfies AdminOperatorManagementAccessDeniedError);

const requirePlatformOperatorActor = (requestContext: RequestContext) =>
  requestContext.actorType === actorType.platformOperator
    ? Effect.succeed(requestContext)
    : Effect.fail({
        _tag: "AdminOperatorManagementAccessDeniedError",
        reason: "Only platform operators may manage admin staff.",
      } satisfies AdminOperatorManagementAccessDeniedError);

const makeAdminOperatorManagementRuntime = (
  options: AdminOperatorManagementRuntimeOptions,
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
      adminUsername: options.keycloakAdminUsername,
      adminPassword: options.keycloakAdminPassword,
    });
    const oryKeto = yield* makeOryKetoAdapter({
      readUrl: options.ketoReadUrl,
      writeUrl: options.ketoWriteUrl,
    });
    const valkey = yield* makeValkeyAdapter({
      url: options.valkeyUrl,
    });
    const identitySessionRepository =
      yield* makeIdentitySessionPostgresRepository(writeDatabase);
    const adminSignInUrl = new URL(
      "/sign-in",
      options.adminAppBaseUrl,
    ).toString();

    const resolveCurrentRequestContext = (input: AdminOperatorSessionLookup) =>
      decodeAdminOperatorSessionLookup(input).pipe(
        Effect.flatMap((request) =>
          resolveIdentitySessionRequestContext(valkey, request),
        ),
      );

    const getCurrentOperatorIdentity = (input: AdminOperatorSessionLookup) =>
      resolveCurrentRequestContext(input).pipe(
        Effect.flatMap((requestContext) =>
          requireManagedAdminOperatorActor(requestContext).pipe(
            Effect.zipRight(requireCurrentActorId(requestContext)),
          ),
        ),
        Effect.flatMap((actorId) => keycloak.readAdminOperator({ actorId })),
        Effect.flatMap((identity) => decodeAdminOperatorIdentity(identity)),
      );

    const listOperators = (input: AdminOperatorSessionLookup) =>
      resolveCurrentRequestContext(input).pipe(
        Effect.flatMap(requirePlatformOperatorActor),
        Effect.flatMap(() => keycloak.listAdminOperators()),
      );

    const seedPlatformOperatorBaseline = (role: AdminManagedOperatorRole) =>
      role === actorType.platformOperator
        ? Effect.forEach(
            buildAdminOperatorBaselineTuples(),
            (tuple) => oryKeto.writeTuple(tuple),
            {
              concurrency: 1,
            },
          ).pipe(Effect.asVoid)
        : Effect.void;

    const verifyProvisionedIdentityClaim = (input: {
      readonly actorId: string;
      readonly expectedActorType: AdminManagedOperatorRole;
    }) =>
      keycloak.readAdminOperator({ actorId: input.actorId }).pipe(
        Effect.flatMap((identity) => decodeAdminOperatorIdentity(identity)),
        Effect.flatMap((identity) =>
          identity.actorType === input.expectedActorType
            ? Effect.succeed(undefined)
            : Effect.fail({
                _tag: "AdminOperatorProvisionedIdentityClaimMismatchError",
                actorId: input.actorId,
                expectedActorType: input.expectedActorType,
                actualActorType: identity.actorType,
              } satisfies AdminOperatorProvisionedIdentityClaimMismatchError),
        ),
      );

    const provisionOperator = (input: AdminOperatorProvisionBySessionRequest) =>
      Effect.gen(function* () {
        const request =
          yield* decodeAdminOperatorProvisionBySessionRequest(input);
        const requestContext = yield* resolveCurrentRequestContext({
          sessionId: request.sessionId,
        });

        if (requestContext.actorType !== actorType.platformOperator) {
          return yield* Effect.fail({
            _tag: "AdminOperatorManagementAccessDeniedError",
            reason: "Only platform operators may manage admin staff.",
          } satisfies AdminOperatorManagementAccessDeniedError);
        }

        const temporaryPassword = generateTemporaryPassword();
        const username = resolveUsername({
          email: request.email,
          username: request.username,
        });
        const provisionedOperator = yield* keycloak.provisionAdminOperator({
          displayName: request.displayName,
          email: request.email,
          username,
          actorType: request.actorType,
          temporaryPassword,
        });

        yield* verifyProvisionedIdentityClaim({
          actorId: provisionedOperator.operator.actorId,
          expectedActorType: request.actorType,
        });
        yield* seedPlatformOperatorBaseline(request.actorType);

        const currentActorId = yield* requireCurrentActorId(requestContext);
        yield* identitySessionRepository.persistLifecycleEvent({
          eventId: [
            "admin-operator-management",
            request.sessionId,
            requestContext.correlationId,
            provisionedOperator.operator.actorId,
            adminOperatorManagementLifecycleEventType.provisioned,
          ].join(":"),
          sessionId: request.sessionId,
          actorId: currentActorId,
          tenantScope: platformScope.platform,
          tenantScopeId: platformScope.platform,
          eventType: adminOperatorManagementLifecycleEventType.provisioned,
          provider: keycloak.serviceName,
          metadata: {
            targetActorId: provisionedOperator.operator.actorId,
            targetEmail: provisionedOperator.operator.email,
            targetActorType: provisionedOperator.operator.actorType,
            updatedExisting: provisionedOperator.updatedExisting,
            reason: request.reason,
          },
        });

        return yield* decodeAdminOperatorProvisionResult({
          operator: provisionedOperator.operator,
          updatedExisting: provisionedOperator.updatedExisting,
          credentialHandoff: {
            signInUrl: adminSignInUrl,
            temporaryPassword,
          },
        });
      });

    return {
      service: {
        getCurrentOperatorIdentity,
        listOperators,
        provisionOperator,
      } satisfies AdminOperatorManagementService,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
      ]).pipe(Effect.asVoid),
    };
  });

const runAdminOperatorManagementWithResolvedOptions = <A, E>(
  options: AdminOperatorManagementRuntimeOptions,
  use: (service: AdminOperatorManagementService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeAdminOperatorManagementRuntime(options);

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const resolveAdminOperatorManagementRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeAdminOperatorManagementProcessEnvironment(environment).pipe(
    Effect.map(
      (resolvedEnvironment): AdminOperatorManagementRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
        keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
        keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
        keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
        keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
        keycloakAdminUsername: resolvedEnvironment.KEYCLOAK_ADMIN,
        keycloakAdminPassword: resolvedEnvironment.KEYCLOAK_ADMIN_PASSWORD,
        adminAppBaseUrl: resolvedEnvironment.ADMIN_APP_BASE_URL,
        valkeyUrl: resolvedEnvironment.VALKEY_URL,
        ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
        ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
      }),
    ),
  );

export const runAdminOperatorManagementFromOptions = <A, E>(
  options: AdminOperatorManagementRuntimeOptions,
  use: (service: AdminOperatorManagementService) => Effect.Effect<A, E>,
) =>
  decodeAdminOperatorManagementRuntimeOptions(options).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminOperatorManagementWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runAdminOperatorManagementFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminOperatorManagementService) => Effect.Effect<A, E>,
) =>
  resolveAdminOperatorManagementRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminOperatorManagementWithResolvedOptions(resolvedOptions, use),
    ),
  );
