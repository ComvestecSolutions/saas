/**
 * Keycloak user read platform service (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch A vendor #1).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link KeycloakAdminApiClient} port (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps the existing Keycloak
 * adapter via `platformAdapterServiceName.keycloak`). NO new
 * adapter literal is introduced; the platform-adapter service-name
 * vocabulary stays sourced from
 * `packages/platform/src/adapters/service-names.ts`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: only `getById`, `listByEmail`,
 *     `listByUsername` are exposed. There is NO mutation surface.
 *   - **Operator-only authz**: every read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`.
 *     Missing `actorId` surfaces as
 *     {@link KeycloakUserReadMissingActorIdentity}; other actor
 *     types fall through to {@link KeycloakUserReadUnauthorized}.
 *     Authz lives at the SERVICE layer (not the HTTP transport)
 *     so app helpers and any future workflow-jobs invocation
 *     inherit the same enforcement.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.keycloakUserRead`.
 *     Failures surface as
 *     {@link KeycloakUserReadReasonNotInCatalog}.
 *   - **Audit emission**: every successful read appends ONE
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.keycloakUserRead` +
 *     `keycloakUserReadAuditAction.readPerformed` +
 *     `reasonCatalogId.keycloakUserRead`. Audit emission is
 *     suppressed on upstream adapter failures so the audit channel
 *     reflects only successful operator reads.
 *   - **Bounded snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}|${kind}|${key}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction. The
 *     cache fronts each read so the surface stays bounded under
 *     burst.
 *   - **Cache freshness**: cached summaries are reconciled via
 *     `isKeycloakUserSummaryFresh(cachedAt, now,
 *     snapshotCacheTtlSeconds)`; stale entries are dropped before
 *     being returned so the admin console never sees stale
 *     identity data masquerading as fresh.
 *
 * Runtime config: `runKeycloakUserReadFromEnvironment` decodes
 * `KEYCLOAK_BASE_URL` + `KEYCLOAK_REALM` + `KEYCLOAK_CLIENT_ID` +
 * `KEYCLOAK_CLIENT_SECRET` + `POSTGRES_URL` +
 * `KEYCLOAK_USER_READ_CACHE_MAX_SIZE` +
 * `KEYCLOAK_USER_READ_SNAPSHOT_CACHE_TTL_SECONDS` +
 * `KEYCLOAK_USER_READ_DEFAULT_LIST_LIMIT` at the boundary with NO
 * local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  keycloakUserReadAuditAction,
  KeycloakUserGetByIdInputSchema,
  KeycloakUserListByEmailInputSchema,
  KeycloakUserListByUsernameInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type KeycloakUserReadTargetTenant,
  type KeycloakUserSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isKeycloakUserSummaryFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  makeKeycloakAdapter,
  type KeycloakAdapterError,
  type KeycloakAdapterService,
} from "../../adapters/identity/keycloak";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getById" | "listByEmail" | "listByUsername";

export class KeycloakUserReadUnauthorized {
  readonly _tag = "KeycloakUserReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class KeycloakUserReadMissingActorIdentity {
  readonly _tag = "KeycloakUserReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class KeycloakUserReadReasonNotInCatalog {
  readonly _tag = "KeycloakUserReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class KeycloakUserReadReasonActionMismatch {
  readonly _tag = "KeycloakUserReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class KeycloakUserReadAdapterClientError {
  readonly _tag = "KeycloakUserReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: KeycloakUserReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type KeycloakUserReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | KeycloakUserReadUnauthorized
  | KeycloakUserReadMissingActorIdentity
  | KeycloakUserReadReasonNotInCatalog
  | KeycloakUserReadReasonActionMismatch
  | KeycloakUserReadAdapterClientError;

// ---------------------------------------------------------------------------
// KeycloakAdminApiClient port (Context.Tag — tests inject directly;
// the env-bound default Layer wraps the existing Keycloak adapter)
// ---------------------------------------------------------------------------

export type KeycloakAdminApiClientService = {
  readonly getById: (input: {
    readonly tenant: KeycloakUserReadTargetTenant;
    readonly userId: string;
  }) => Effect.Effect<
    Option.Option<KeycloakUserSummary>,
    KeycloakUserReadAdapterClientError
  >;
  readonly listByEmail: (input: {
    readonly tenant: KeycloakUserReadTargetTenant;
    readonly email: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<KeycloakUserSummary>,
    KeycloakUserReadAdapterClientError
  >;
  readonly listByUsername: (input: {
    readonly tenant: KeycloakUserReadTargetTenant;
    readonly username: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<KeycloakUserSummary>,
    KeycloakUserReadAdapterClientError
  >;
};

export class KeycloakAdminApiClient extends Context.Tag(
  "KeycloakAdminApiClient",
)<KeycloakAdminApiClient, KeycloakAdminApiClientService>() {}

/**
 * Default {@link KeycloakAdminApiClient} implementation that wraps
 * the existing {@link KeycloakAdapter}
 * (`platformAdapterServiceName.keycloak`). The first cut uses the
 * adapter's healthcheck as a credential probe and returns honest
 * empty results (`Option.none` / `[]`) for the admin user
 * operations because the live admin user search is a follow-up
 * swap that requires the upstream admin-token exchange and
 * pagination strategy to be documented. Operators see honest empty
 * data rather than synthesized records, and the cache + audit +
 * authz invariants still exercise correctly against the live
 * adapter credentials.
 */
export const makeDefaultKeycloakAdminApiClient = (
  adapter: KeycloakAdapterService,
): KeycloakAdminApiClientService => {
  const probe = (operation: Operation, tenant: KeycloakUserReadTargetTenant) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): KeycloakUserReadAdapterClientError =>
          new KeycloakUserReadAdapterClientError({
            operation,
            tenant,
            cause,
          }),
      ),
    );

  return {
    getById: (input) =>
      probe("getById", input.tenant).pipe(
        Effect.map(() => Option.none<KeycloakUserSummary>()),
      ),
    listByEmail: (input) =>
      probe("listByEmail", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<KeycloakUserSummary>),
      ),
    listByUsername: (input) =>
      probe("listByUsername", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<KeycloakUserSummary>),
      ),
  };
};

export const makeDefaultKeycloakAdminApiClientLayer = Layer.effect(
  KeycloakAdminApiClient,
  KeycloakAdapter.pipe(Effect.map(makeDefaultKeycloakAdminApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetKeycloakUserByIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: KeycloakUserGetByIdInputSchema,
});

export type GetKeycloakUserByIdInput = Schema.Schema.Type<
  typeof GetKeycloakUserByIdInputSchema
>;

export const ListKeycloakUsersByEmailInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: KeycloakUserListByEmailInputSchema,
});

export type ListKeycloakUsersByEmailInput = Schema.Schema.Type<
  typeof ListKeycloakUsersByEmailInputSchema
>;

export const ListKeycloakUsersByUsernameInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: KeycloakUserListByUsernameInputSchema,
});

export type ListKeycloakUsersByUsernameInput = Schema.Schema.Type<
  typeof ListKeycloakUsersByUsernameInputSchema
>;

const decodeGetByIdInput = Schema.decodeUnknown(GetKeycloakUserByIdInputSchema);
const decodeListByEmailInput = Schema.decodeUnknown(
  ListKeycloakUsersByEmailInputSchema,
);
const decodeListByUsernameInput = Schema.decodeUnknown(
  ListKeycloakUsersByUsernameInputSchema,
);
const decodeReasonCatalogId = Schema.decodeUnknown(ReasonCatalogIdSchema);

// ---------------------------------------------------------------------------
// Authz + reason-catalog helpers
// ---------------------------------------------------------------------------

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
        new KeycloakUserReadMissingActorIdentity({ operation }),
      );
    }
    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new KeycloakUserReadUnauthorized({
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
): Effect.Effect<
  ReasonCatalogId,
  KeycloakUserReadReasonNotInCatalog | KeycloakUserReadReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new KeycloakUserReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new KeycloakUserReadReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

// ---------------------------------------------------------------------------
// Bounded snapshot cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type CacheEntry<A> = {
  readonly value: A;
  readonly cachedAtIso: string;
};

type ReadCache<A> = {
  readonly get: (key: string) => CacheEntry<A> | undefined;
  readonly set: (key: string, entry: CacheEntry<A>) => void;
  readonly delete: (key: string) => void;
  readonly size: () => number;
};

const createReadCache = <A>(maxSize: number): ReadCache<A> => {
  const store = new Map<string, CacheEntry<A>>();
  return {
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
    size: () => store.size,
  };
};

const tenantCacheKey = (
  tenant: KeycloakUserReadTargetTenant,
  kind: "id" | "email" | "username",
  key: string,
  limit?: number,
): string => `${tenant.scope}|${tenant.scopeId}|${kind}|${key}|${limit ?? "-"}`;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type KeycloakUserReadView = {
  readonly summary: KeycloakUserSummary;
  readonly isFresh: boolean;
};

export type KeycloakUserReadListView = {
  readonly summaries: ReadonlyArray<KeycloakUserSummary>;
  readonly isFresh: boolean;
};

export type KeycloakUserReadServiceImpl = {
  readonly getById: (
    input: GetKeycloakUserByIdInput,
  ) => Effect.Effect<
    Option.Option<KeycloakUserReadView>,
    KeycloakUserReadServiceError
  >;
  readonly listByEmail: (
    input: ListKeycloakUsersByEmailInput,
  ) => Effect.Effect<KeycloakUserReadListView, KeycloakUserReadServiceError>;
  readonly listByUsername: (
    input: ListKeycloakUsersByUsernameInput,
  ) => Effect.Effect<KeycloakUserReadListView, KeycloakUserReadServiceError>;
};

export class KeycloakUserReadService extends Context.Tag(
  "KeycloakUserReadService",
)<KeycloakUserReadService, KeycloakUserReadServiceImpl>() {}

export type KeycloakUserReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
  readonly defaultListLimit: number;
};

export type KeycloakUserReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly keycloakAdminApiClient: KeycloakAdminApiClientService;
  readonly bounds: KeycloakUserReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.keycloakUserRead,
    action: keycloakUserReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.keycloakUserRead,
  });

export const makeKeycloakUserReadService = (
  deps: KeycloakUserReadServiceDependencies,
): KeycloakUserReadServiceImpl => {
  const { auditLog, keycloakAdminApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const summaryCache = createReadCache<KeycloakUserSummary>(
    Math.max(1, bounds.cacheMaxSize),
  );
  const listCache = createReadCache<ReadonlyArray<KeycloakUserSummary>>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const resolveLimit = (explicit: number | undefined): number => {
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(200, Math.trunc(explicit));
    }
    return Math.max(1, Math.min(200, Math.trunc(bounds.defaultListLimit)));
  };

  const getById: KeycloakUserReadServiceImpl["getById"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetByIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getById");
      yield* validateReadReason(
        "getById",
        decoded.query.reasonCatalogId,
        keycloakUserReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "id",
        decoded.query.userId,
      );
      const nowMs = nowFn().getTime();
      const cached = summaryCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isKeycloakUserSummaryFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.userId,
          );
          return Option.some({ summary: cached.value, isFresh: true });
        }
        summaryCache.delete(cacheKey);
      }

      const fetched = yield* keycloakAdminApiClient.getById({
        tenant: decoded.query.tenant,
        userId: decoded.query.userId,
      });

      if (Option.isNone(fetched)) {
        return Option.none<KeycloakUserReadView>();
      }

      summaryCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.userId,
      );
      return Option.some({ summary: fetched.value, isFresh: true });
    });

  const runListRead = (
    operation: "listByEmail" | "listByUsername",
    requestContext: RequestContext,
    tenant: KeycloakUserReadTargetTenant,
    cacheKey: string,
    fetch: () => Effect.Effect<
      ReadonlyArray<KeycloakUserSummary>,
      KeycloakUserReadAdapterClientError
    >,
    auditTarget: string,
  ) =>
    Effect.gen(function* () {
      void tenant;
      void operation;
      const nowMs = nowFn().getTime();
      const cached = listCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isKeycloakUserSummaryFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(auditLog, requestContext, auditTarget);
          return { summaries: cached.value, isFresh: true } as const;
        }
        listCache.delete(cacheKey);
      }

      const fetched = yield* fetch();
      listCache.set(cacheKey, {
        value: fetched,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(auditLog, requestContext, auditTarget);
      return { summaries: fetched, isFresh: true } as const;
    });

  const listByEmail: KeycloakUserReadServiceImpl["listByEmail"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByEmailInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByEmail");
      yield* validateReadReason(
        "listByEmail",
        decoded.query.reasonCatalogId,
        keycloakUserReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "email",
        decoded.query.email,
        limit,
      );
      return yield* runListRead(
        "listByEmail",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          keycloakAdminApiClient.listByEmail({
            tenant: decoded.query.tenant,
            email: decoded.query.email,
            limit,
          }),
        `email:${decoded.query.email}`,
      );
    });

  const listByUsername: KeycloakUserReadServiceImpl["listByUsername"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByUsernameInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByUsername");
      yield* validateReadReason(
        "listByUsername",
        decoded.query.reasonCatalogId,
        keycloakUserReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "username",
        decoded.query.username,
        limit,
      );
      return yield* runListRead(
        "listByUsername",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          keycloakAdminApiClient.listByUsername({
            tenant: decoded.query.tenant,
            username: decoded.query.username,
            limit,
          }),
        `username:${decoded.query.username}`,
      );
    });

  return { getById, listByEmail, listByUsername };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type KeycloakUserReadServiceLayerDependencies = {
  readonly bounds: KeycloakUserReadRuntimeBounds;
};

export const makeKeycloakUserReadServiceLayer = (
  deps: KeycloakUserReadServiceLayerDependencies,
) =>
  Layer.effect(
    KeycloakUserReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const keycloakAdminApiClient = yield* KeycloakAdminApiClient;
      return makeKeycloakUserReadService({
        auditLog,
        keycloakAdminApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const KeycloakUserReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_USER_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  KEYCLOAK_USER_READ_SNAPSHOT_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  KEYCLOAK_USER_READ_DEFAULT_LIST_LIMIT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeKeycloakUserReadProcessEnvironment = Schema.decodeUnknown(
  KeycloakUserReadProcessEnvironmentSchema,
);

export type KeycloakUserReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly keycloak: {
    readonly baseUrl: string;
    readonly realm: string;
    readonly clientId: string;
    readonly clientSecret: string;
  };
  readonly bounds: KeycloakUserReadRuntimeBounds;
};

const resolveKeycloakUserReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeKeycloakUserReadProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): KeycloakUserReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        keycloak: {
          baseUrl: resolved.KEYCLOAK_BASE_URL,
          realm: resolved.KEYCLOAK_REALM,
          clientId: resolved.KEYCLOAK_CLIENT_ID,
          clientSecret: resolved.KEYCLOAK_CLIENT_SECRET,
        },
        bounds: {
          cacheMaxSize: resolved.KEYCLOAK_USER_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.KEYCLOAK_USER_READ_SNAPSHOT_CACHE_TTL_SECONDS,
          defaultListLimit: resolved.KEYCLOAK_USER_READ_DEFAULT_LIST_LIMIT,
        },
      }),
    ),
  );

const makeKeycloakUserReadRuntime = (options: KeycloakUserReadRuntimeOptions) =>
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
    const keycloakAdminApiClientLayer =
      makeDefaultKeycloakAdminApiClientLayer.pipe(
        Layer.provide(Layer.succeed(KeycloakAdapter, keycloakAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      keycloakAdminApiClientLayer,
    );
    const serviceLayer = makeKeycloakUserReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type KeycloakUserReadRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | KeycloakAdapterError;

export const runKeycloakUserReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: KeycloakUserReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | KeycloakUserReadRuntimeError> =>
  resolveKeycloakUserReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeKeycloakUserReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(KeycloakUserReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | KeycloakUserReadRuntimeError>;
