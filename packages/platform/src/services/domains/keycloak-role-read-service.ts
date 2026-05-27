import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  keycloakRoleReadAuditAction,
  KeycloakRoleGetByIdInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  RequestContextSchema,
  type AuditAction,
  type KeycloakRoleDetail,
  type KeycloakRoleReadTargetTenant,
  type RequestContext,
  validateReasonForAction,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isKeycloakRoleDetailFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";

import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import {
  KeycloakAdapter,
  makeKeycloakAdapter,
  type KeycloakAdapterError,
  type KeycloakAdapterService,
} from "../../adapters/identity/keycloak";
import { buildWriteDatabase } from "../postgres-write-database";

type Operation = "getById";

export class KeycloakRoleReadUnauthorized {
  readonly _tag = "KeycloakRoleReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class KeycloakRoleReadMissingActorIdentity {
  readonly _tag = "KeycloakRoleReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class KeycloakRoleReadReasonNotInCatalog {
  readonly _tag = "KeycloakRoleReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class KeycloakRoleReadReasonActionMismatch {
  readonly _tag = "KeycloakRoleReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class KeycloakRoleReadAdapterClientError {
  readonly _tag = "KeycloakRoleReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: KeycloakRoleReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export class KeycloakRoleReadRuntimeEnvironmentError {
  readonly _tag = "KeycloakRoleReadRuntimeEnvironmentError" as const;
  constructor(readonly args: { readonly cause: ParseResult.ParseError }) {}
}

export type KeycloakRoleReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | KeycloakRoleReadUnauthorized
  | KeycloakRoleReadMissingActorIdentity
  | KeycloakRoleReadReasonNotInCatalog
  | KeycloakRoleReadReasonActionMismatch
  | KeycloakRoleReadAdapterClientError;

export type KeycloakRoleAdminApiClientService = {
  readonly getById: (input: {
    readonly tenant: KeycloakRoleReadTargetTenant;
    readonly roleId: string;
  }) => Effect.Effect<
    Option.Option<KeycloakRoleDetail>,
    KeycloakRoleReadAdapterClientError
  >;
};

export class KeycloakRoleAdminApiClient extends Context.Tag(
  "KeycloakRoleAdminApiClient",
)<KeycloakRoleAdminApiClient, KeycloakRoleAdminApiClientService>() {}

export const makeDefaultKeycloakRoleAdminApiClient = (
  adapter: KeycloakAdapterService,
): KeycloakRoleAdminApiClientService => ({
  getById: (input) =>
    adapter
      .readRealmRoleById({
        roleId: input.roleId,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new KeycloakRoleReadAdapterClientError({
              operation: "getById",
              tenant: input.tenant,
              cause,
            }),
        ),
      ),
});

export const makeDefaultKeycloakRoleAdminApiClientLayer = Layer.effect(
  KeycloakRoleAdminApiClient,
  KeycloakAdapter.pipe(Effect.map(makeDefaultKeycloakRoleAdminApiClient)),
);

export const GetKeycloakRoleByIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: KeycloakRoleGetByIdInputSchema,
});

export type GetKeycloakRoleByIdInput = Schema.Schema.Type<
  typeof GetKeycloakRoleByIdInputSchema
>;

const decodeGetByIdInput = Schema.decodeUnknown(GetKeycloakRoleByIdInputSchema);
const decodeReasonCatalogId = Schema.decodeUnknown(ReasonCatalogIdSchema);

const allowedReaderActorTypes: ReadonlySet<string> = new Set([
  actorType.platformOperator,
  actorType.supportOperator,
]);

const requireOperatorActor = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    if (requestContext.actorId === undefined) {
      return yield* Effect.fail(
        new KeycloakRoleReadMissingActorIdentity({ operation }),
      );
    }

    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new KeycloakRoleReadUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }

    return requestContext.actorId;
  });

const validateReadReason = (
  operation: Operation,
  value: string,
  action: AuditAction,
) =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new KeycloakRoleReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new KeycloakRoleReadReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }

      return Effect.succeed(decoded);
    }),
  );

type CacheEntry<A> = {
  readonly value: A;
  readonly cachedAtIso: string;
};

type ReadCache<A> = {
  readonly store: Map<string, CacheEntry<A>>;
  readonly get: (key: string) => CacheEntry<A> | undefined;
  readonly set: (key: string, entry: CacheEntry<A>) => void;
  readonly delete: (key: string) => void;
  readonly deleteWhere: (predicate: (entry: CacheEntry<A>) => boolean) => void;
};

export const pruneExpiredKeycloakRoleReadCacheEntries = <A>(input: {
  readonly store: Map<string, CacheEntry<A>>;
  readonly nowEpochMs: number;
  readonly snapshotCacheTtlSeconds: number;
}) => {
  for (const [key, entry] of input.store.entries()) {
    if (
      !isKeycloakRoleDetailFresh(
        entry.cachedAtIso,
        input.nowEpochMs,
        input.snapshotCacheTtlSeconds,
      )
    ) {
      input.store.delete(key);
    }
  }
};

const createReadCache = <A>(maxSize: number): ReadCache<A> => {
  const store = new Map<string, CacheEntry<A>>();

  return {
    store,
    get: (key) => store.get(key),
    set: (key, entry) => {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }

      store.set(key, entry);
    },
    delete: (key) => {
      store.delete(key);
    },
    deleteWhere: (predicate) => {
      for (const [key, entry] of store.entries()) {
        if (predicate(entry)) {
          store.delete(key);
        }
      }
    },
  };
};

const tenantCacheKey = (
  tenant: KeycloakRoleReadTargetTenant,
  roleId: string,
): string => `${tenant.scope}|${tenant.scopeId}|id|${roleId}`;

export type KeycloakRoleReadView = {
  readonly detail: KeycloakRoleDetail;
  readonly isFresh: boolean;
};

export type KeycloakRoleReadServiceImpl = {
  readonly getById: (
    input: GetKeycloakRoleByIdInput,
  ) => Effect.Effect<
    Option.Option<KeycloakRoleReadView>,
    KeycloakRoleReadServiceError
  >;
};

export class KeycloakRoleReadService extends Context.Tag(
  "KeycloakRoleReadService",
)<KeycloakRoleReadService, KeycloakRoleReadServiceImpl>() {}

export type KeycloakRoleReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
};

export type KeycloakRoleReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly keycloakRoleAdminApiClient: KeycloakRoleAdminApiClientService;
  readonly bounds: KeycloakRoleReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.keycloakRoleRead,
    action: keycloakRoleReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.keycloakRoleRead,
  });

export const makeKeycloakRoleReadService = (
  deps: KeycloakRoleReadServiceDependencies,
): KeycloakRoleReadServiceImpl => {
  const { auditLog, keycloakRoleAdminApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const detailCache = createReadCache<KeycloakRoleDetail>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const getById: KeycloakRoleReadServiceImpl["getById"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetByIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getById");
      yield* validateReadReason(
        "getById",
        decoded.query.reasonCatalogId,
        keycloakRoleReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        decoded.query.roleId,
      );
      const nowMs = nowFn().getTime();
      const cached = detailCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isKeycloakRoleDetailFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.roleId,
          );
          return Option.some({ detail: cached.value, isFresh: true });
        }

        detailCache.delete(cacheKey);
      }

      const fetched = yield* keycloakRoleAdminApiClient.getById({
        tenant: decoded.query.tenant,
        roleId: decoded.query.roleId,
      });

      if (Option.isNone(fetched)) {
        return Option.none<KeycloakRoleReadView>();
      }

      pruneExpiredKeycloakRoleReadCacheEntries({
        store: detailCache.store,
        nowEpochMs: nowMs,
        snapshotCacheTtlSeconds: bounds.snapshotCacheTtlSeconds,
      });
      detailCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: new Date(nowMs).toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.roleId,
      );
      return Option.some({ detail: fetched.value, isFresh: true });
    });

  return { getById };
};

export type KeycloakRoleReadServiceLayerDependencies = {
  readonly bounds: KeycloakRoleReadRuntimeBounds;
};

export const makeKeycloakRoleReadServiceLayer = (
  deps: KeycloakRoleReadServiceLayerDependencies,
) =>
  Layer.effect(
    KeycloakRoleReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const keycloakRoleAdminApiClient = yield* KeycloakRoleAdminApiClient;

      return makeKeycloakRoleReadService({
        auditLog,
        keycloakRoleAdminApiClient,
        bounds: deps.bounds,
      });
    }),
  );

const KeycloakRoleReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_ADMIN: Schema.NonEmptyString,
  KEYCLOAK_ADMIN_PASSWORD: Schema.NonEmptyString,
  KEYCLOAK_ROLE_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  KEYCLOAK_ROLE_READ_SNAPSHOT_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeKeycloakRoleReadProcessEnvironment = Schema.decodeUnknown(
  KeycloakRoleReadProcessEnvironmentSchema,
);

export type KeycloakRoleReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly keycloak: {
    readonly baseUrl: string;
    readonly realm: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly adminUsername: string;
    readonly adminPassword: string;
  };
  readonly bounds: KeycloakRoleReadRuntimeBounds;
};

const resolveKeycloakRoleReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeKeycloakRoleReadProcessEnvironment(environment).pipe(
    Effect.mapError(
      (cause) => new KeycloakRoleReadRuntimeEnvironmentError({ cause }),
    ),
    Effect.map(
      (resolved): KeycloakRoleReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        keycloak: {
          baseUrl: resolved.KEYCLOAK_BASE_URL,
          realm: resolved.KEYCLOAK_REALM,
          clientId: resolved.KEYCLOAK_CLIENT_ID,
          clientSecret: resolved.KEYCLOAK_CLIENT_SECRET,
          adminUsername: resolved.KEYCLOAK_ADMIN,
          adminPassword: resolved.KEYCLOAK_ADMIN_PASSWORD,
        },
        bounds: {
          cacheMaxSize: resolved.KEYCLOAK_ROLE_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.KEYCLOAK_ROLE_READ_SNAPSHOT_CACHE_TTL_SECONDS,
        },
      }),
    ),
  );

const makeKeycloakRoleReadRuntime = (options: KeycloakRoleReadRuntimeOptions) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
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
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const keycloakAdapter = yield* makeKeycloakAdapter(options.keycloak);
    const keycloakRoleAdminApiClientLayer =
      makeDefaultKeycloakRoleAdminApiClientLayer.pipe(
        Layer.provide(Layer.succeed(KeycloakAdapter, keycloakAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      keycloakRoleAdminApiClientLayer,
    );
    const serviceLayer = makeKeycloakRoleReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));

    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type KeycloakRoleReadRuntimeError =
  | KeycloakRoleReadRuntimeEnvironmentError
  | PostgresAdapterConnectionError
  | KeycloakAdapterError;

export const runKeycloakRoleReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: KeycloakRoleReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | KeycloakRoleReadRuntimeError> =>
  resolveKeycloakRoleReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeKeycloakRoleReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(KeycloakRoleReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | KeycloakRoleReadRuntimeError>;
