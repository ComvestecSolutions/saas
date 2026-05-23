/**
 * Postal mail log read platform service (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #2).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link PostalMailLogApiClient} port (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps the existing
 * {@link PostalAdapter} via `platformAdapterServiceName.postal`).
 * NO new adapter literal is introduced; the platform-adapter
 * service-name vocabulary stays sourced from
 * `packages/platform/src/adapters/service-names.ts`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: only `getById`, `listByRecipient`,
 *     `listByStatus` are exposed. There is NO mutation surface.
 *   - **Operator-only authz**: every read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`.
 *     Missing `actorId` surfaces as
 *     {@link PostalMailLogReadMissingActorIdentity}; other actor
 *     types fall through to {@link PostalMailLogReadUnauthorized}.
 *     Authz lives at the SERVICE layer (not the HTTP transport)
 *     so app helpers and any future workflow-jobs invocation
 *     inherit the same enforcement.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.postalMailLogRead`.
 *     Failures surface as
 *     {@link PostalMailLogReadReasonNotInCatalog}.
 *   - **Audit emission**: every successful read appends ONE
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.postalMailLogRead` +
 *     `postalMailLogReadAuditAction.readPerformed` +
 *     `reasonCatalogId.postalMailLogRead`. Audit emission is
 *     suppressed on upstream adapter failures so the audit channel
 *     reflects only successful operator reads.
 *   - **Bounded snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}|${kind}|${key}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction. The
 *     cache fronts each read so the surface stays bounded under
 *     burst.
 *   - **Cache freshness**: cached entries are reconciled via
 *     `isPostalMailLogEntryFresh(cachedAt, now,
 *     snapshotCacheTtlSeconds)`; stale entries are dropped before
 *     being returned so the admin console never sees stale
 *     mail-log data masquerading as fresh.
 *
 * Runtime config: `runPostalMailLogReadFromEnvironment` decodes
 * `POSTAL_API_URL` + `POSTAL_API_KEY` + `POSTGRES_URL` +
 * `POSTAL_MAIL_LOG_READ_CACHE_MAX_SIZE` +
 * `POSTAL_MAIL_LOG_READ_SNAPSHOT_CACHE_TTL_SECONDS` +
 * `POSTAL_MAIL_LOG_READ_DEFAULT_LIST_LIMIT` at the boundary with
 * NO local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  platformModuleId,
  postalMailLogReadAuditAction,
  PostalMailLogGetByIdInputSchema,
  PostalMailLogListByRecipientInputSchema,
  PostalMailLogListByStatusInputSchema,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type PostalMailLogEntry,
  type PostalMailLogReadTargetTenant,
  type PostalMailLogStatus,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isPostalMailLogEntryFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makePostalAdapter,
  PostalAdapter,
  type PostalAdapterError,
  type PostalAdapterService,
} from "../../adapters/messaging/postal";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getById" | "listByRecipient" | "listByStatus";

export class PostalMailLogReadUnauthorized {
  readonly _tag = "PostalMailLogReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class PostalMailLogReadMissingActorIdentity {
  readonly _tag = "PostalMailLogReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class PostalMailLogReadReasonNotInCatalog {
  readonly _tag = "PostalMailLogReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class PostalMailLogReadReasonActionMismatch {
  readonly _tag = "PostalMailLogReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class PostalMailLogReadAdapterClientError {
  readonly _tag = "PostalMailLogReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: PostalMailLogReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type PostalMailLogReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | PostalMailLogReadUnauthorized
  | PostalMailLogReadMissingActorIdentity
  | PostalMailLogReadReasonNotInCatalog
  | PostalMailLogReadReasonActionMismatch
  | PostalMailLogReadAdapterClientError;

// ---------------------------------------------------------------------------
// PostalMailLogApiClient port (Context.Tag — tests inject directly;
// the env-bound default Layer wraps the existing Postal adapter)
// ---------------------------------------------------------------------------

export type PostalMailLogApiClientService = {
  readonly getById: (input: {
    readonly tenant: PostalMailLogReadTargetTenant;
    readonly messageId: string;
  }) => Effect.Effect<
    Option.Option<PostalMailLogEntry>,
    PostalMailLogReadAdapterClientError
  >;
  readonly listByRecipient: (input: {
    readonly tenant: PostalMailLogReadTargetTenant;
    readonly emailAddress: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<PostalMailLogEntry>,
    PostalMailLogReadAdapterClientError
  >;
  readonly listByStatus: (input: {
    readonly tenant: PostalMailLogReadTargetTenant;
    readonly status: PostalMailLogStatus;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<PostalMailLogEntry>,
    PostalMailLogReadAdapterClientError
  >;
};

export class PostalMailLogApiClient extends Context.Tag(
  "PostalMailLogApiClient",
)<PostalMailLogApiClient, PostalMailLogApiClientService>() {}

/**
 * Default {@link PostalMailLogApiClient} implementation that wraps
 * the existing {@link PostalAdapter}
 * (`platformAdapterServiceName.postal`). The first cut uses the
 * adapter's healthcheck as a credential probe and returns honest
 * empty results (`Option.none` / `[]`) for the mail-log operations
 * because the live Postal message-log lookups are a follow-up
 * swap that requires the upstream pagination + filter strategy to
 * be documented. Operators see honest empty data rather than
 * synthesized records, and the cache + audit + authz invariants
 * still exercise correctly against the live adapter credentials.
 */
export const makeDefaultPostalMailLogApiClient = (
  adapter: PostalAdapterService,
): PostalMailLogApiClientService => {
  const probe = (operation: Operation, tenant: PostalMailLogReadTargetTenant) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): PostalMailLogReadAdapterClientError =>
          new PostalMailLogReadAdapterClientError({
            operation,
            tenant,
            cause,
          }),
      ),
    );

  return {
    getById: (input) =>
      probe("getById", input.tenant).pipe(
        Effect.map(() => Option.none<PostalMailLogEntry>()),
      ),
    listByRecipient: (input) =>
      probe("listByRecipient", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<PostalMailLogEntry>),
      ),
    listByStatus: (input) =>
      probe("listByStatus", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<PostalMailLogEntry>),
      ),
  };
};

export const makeDefaultPostalMailLogApiClientLayer = Layer.effect(
  PostalMailLogApiClient,
  PostalAdapter.pipe(Effect.map(makeDefaultPostalMailLogApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetPostalMailLogByIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: PostalMailLogGetByIdInputSchema,
});

export type GetPostalMailLogByIdInput = Schema.Schema.Type<
  typeof GetPostalMailLogByIdInputSchema
>;

export const ListPostalMailLogByRecipientInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: PostalMailLogListByRecipientInputSchema,
});

export type ListPostalMailLogByRecipientInput = Schema.Schema.Type<
  typeof ListPostalMailLogByRecipientInputSchema
>;

export const ListPostalMailLogByStatusInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: PostalMailLogListByStatusInputSchema,
});

export type ListPostalMailLogByStatusInput = Schema.Schema.Type<
  typeof ListPostalMailLogByStatusInputSchema
>;

const decodeGetByIdInput = Schema.decodeUnknown(
  GetPostalMailLogByIdInputSchema,
);
const decodeListByRecipientInput = Schema.decodeUnknown(
  ListPostalMailLogByRecipientInputSchema,
);
const decodeListByStatusInput = Schema.decodeUnknown(
  ListPostalMailLogByStatusInputSchema,
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
        new PostalMailLogReadMissingActorIdentity({ operation }),
      );
    }
    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new PostalMailLogReadUnauthorized({
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
  PostalMailLogReadReasonNotInCatalog | PostalMailLogReadReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new PostalMailLogReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new PostalMailLogReadReasonActionMismatch({
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
  tenant: PostalMailLogReadTargetTenant,
  kind: "id" | "recipient" | "status",
  key: string,
  limit?: number,
): string => `${tenant.scope}|${tenant.scopeId}|${kind}|${key}|${limit ?? "-"}`;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type PostalMailLogReadView = {
  readonly entry: PostalMailLogEntry;
  readonly isFresh: boolean;
};

export type PostalMailLogReadListView = {
  readonly entries: ReadonlyArray<PostalMailLogEntry>;
  readonly isFresh: boolean;
};

export type PostalMailLogReadServiceImpl = {
  readonly getById: (
    input: GetPostalMailLogByIdInput,
  ) => Effect.Effect<
    Option.Option<PostalMailLogReadView>,
    PostalMailLogReadServiceError
  >;
  readonly listByRecipient: (
    input: ListPostalMailLogByRecipientInput,
  ) => Effect.Effect<PostalMailLogReadListView, PostalMailLogReadServiceError>;
  readonly listByStatus: (
    input: ListPostalMailLogByStatusInput,
  ) => Effect.Effect<PostalMailLogReadListView, PostalMailLogReadServiceError>;
};

export class PostalMailLogReadService extends Context.Tag(
  "PostalMailLogReadService",
)<PostalMailLogReadService, PostalMailLogReadServiceImpl>() {}

export type PostalMailLogReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
  readonly defaultListLimit: number;
};

export type PostalMailLogReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly postalMailLogApiClient: PostalMailLogApiClientService;
  readonly bounds: PostalMailLogReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.postalMailLogRead,
    action: postalMailLogReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.postalMailLogRead,
  });

export const makePostalMailLogReadService = (
  deps: PostalMailLogReadServiceDependencies,
): PostalMailLogReadServiceImpl => {
  const { auditLog, postalMailLogApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const entryCache = createReadCache<PostalMailLogEntry>(
    Math.max(1, bounds.cacheMaxSize),
  );
  const listCache = createReadCache<ReadonlyArray<PostalMailLogEntry>>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const resolveLimit = (explicit: number | undefined): number => {
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(200, Math.trunc(explicit));
    }
    return Math.max(1, Math.min(200, Math.trunc(bounds.defaultListLimit)));
  };

  const getById: PostalMailLogReadServiceImpl["getById"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetByIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getById");
      yield* validateReadReason(
        "getById",
        decoded.query.reasonCatalogId,
        postalMailLogReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "id",
        decoded.query.messageId,
      );
      const nowMs = nowFn().getTime();
      const cached = entryCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isPostalMailLogEntryFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.messageId,
          );
          return Option.some({ entry: cached.value, isFresh: true });
        }
        entryCache.delete(cacheKey);
      }

      const fetched = yield* postalMailLogApiClient.getById({
        tenant: decoded.query.tenant,
        messageId: decoded.query.messageId,
      });

      if (Option.isNone(fetched)) {
        return Option.none<PostalMailLogReadView>();
      }

      entryCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.messageId,
      );
      return Option.some({ entry: fetched.value, isFresh: true });
    });

  const runListRead = (
    operation: "listByRecipient" | "listByStatus",
    requestContext: RequestContext,
    tenant: PostalMailLogReadTargetTenant,
    cacheKey: string,
    fetch: () => Effect.Effect<
      ReadonlyArray<PostalMailLogEntry>,
      PostalMailLogReadAdapterClientError
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
          isPostalMailLogEntryFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(auditLog, requestContext, auditTarget);
          return { entries: cached.value, isFresh: true } as const;
        }
        listCache.delete(cacheKey);
      }

      const fetched = yield* fetch();
      listCache.set(cacheKey, {
        value: fetched,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(auditLog, requestContext, auditTarget);
      return { entries: fetched, isFresh: true } as const;
    });

  const listByRecipient: PostalMailLogReadServiceImpl["listByRecipient"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByRecipientInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByRecipient");
      yield* validateReadReason(
        "listByRecipient",
        decoded.query.reasonCatalogId,
        postalMailLogReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "recipient",
        decoded.query.emailAddress,
        limit,
      );
      return yield* runListRead(
        "listByRecipient",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          postalMailLogApiClient.listByRecipient({
            tenant: decoded.query.tenant,
            emailAddress: decoded.query.emailAddress,
            limit,
          }),
        `recipient:${decoded.query.emailAddress}`,
      );
    });

  const listByStatus: PostalMailLogReadServiceImpl["listByStatus"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByStatusInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByStatus");
      yield* validateReadReason(
        "listByStatus",
        decoded.query.reasonCatalogId,
        postalMailLogReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "status",
        decoded.query.status,
        limit,
      );
      return yield* runListRead(
        "listByStatus",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          postalMailLogApiClient.listByStatus({
            tenant: decoded.query.tenant,
            status: decoded.query.status,
            limit,
          }),
        `status:${decoded.query.status}`,
      );
    });

  return { getById, listByRecipient, listByStatus };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type PostalMailLogReadServiceLayerDependencies = {
  readonly bounds: PostalMailLogReadRuntimeBounds;
};

export const makePostalMailLogReadServiceLayer = (
  deps: PostalMailLogReadServiceLayerDependencies,
) =>
  Layer.effect(
    PostalMailLogReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const postalMailLogApiClient = yield* PostalMailLogApiClient;
      return makePostalMailLogReadService({
        auditLog,
        postalMailLogApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const PostalMailLogReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  POSTAL_API_URL: Schema.NonEmptyString,
  POSTAL_API_KEY: Schema.NonEmptyString,
  POSTAL_MAIL_LOG_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  POSTAL_MAIL_LOG_READ_SNAPSHOT_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  POSTAL_MAIL_LOG_READ_DEFAULT_LIST_LIMIT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodePostalMailLogReadProcessEnvironment = Schema.decodeUnknown(
  PostalMailLogReadProcessEnvironmentSchema,
);

export type PostalMailLogReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly postal: {
    readonly apiUrl: string;
    readonly apiKey: string;
  };
  readonly bounds: PostalMailLogReadRuntimeBounds;
};

const resolvePostalMailLogReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodePostalMailLogReadProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): PostalMailLogReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        postal: {
          apiUrl: resolved.POSTAL_API_URL,
          apiKey: resolved.POSTAL_API_KEY,
        },
        bounds: {
          cacheMaxSize: resolved.POSTAL_MAIL_LOG_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.POSTAL_MAIL_LOG_READ_SNAPSHOT_CACHE_TTL_SECONDS,
          defaultListLimit: resolved.POSTAL_MAIL_LOG_READ_DEFAULT_LIST_LIMIT,
        },
      }),
    ),
  );

const makePostalMailLogReadRuntime = (
  options: PostalMailLogReadRuntimeOptions,
) =>
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
    const postalAdapter = yield* makePostalAdapter({
      apiUrl: options.postal.apiUrl,
      apiKey: options.postal.apiKey,
    });
    const postalMailLogApiClientLayer =
      makeDefaultPostalMailLogApiClientLayer.pipe(
        Layer.provide(Layer.succeed(PostalAdapter, postalAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      postalMailLogApiClientLayer,
    );
    const serviceLayer = makePostalMailLogReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type PostalMailLogReadRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | PostalAdapterError;

export const runPostalMailLogReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: PostalMailLogReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | PostalMailLogReadRuntimeError> =>
  resolvePostalMailLogReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makePostalMailLogReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(PostalMailLogReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | PostalMailLogReadRuntimeError>;
