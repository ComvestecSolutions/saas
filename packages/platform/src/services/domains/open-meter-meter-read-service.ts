/**
 * OpenMeter meter read platform service (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch A vendor #3).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link OpenMeterMeterApiClient} port (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps the existing
 * {@link OpenmeterAdapter} via `platformAdapterServiceName.openmeter`).
 * NO new adapter literal is introduced; the platform-adapter
 * service-name vocabulary stays sourced from
 * `packages/platform/src/adapters/service-names.ts`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: only `getBySlug`, `listAll`,
 *     `listByEventType` are exposed. There is NO mutation surface.
 *   - **Operator-only authz**: every read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`.
 *     Missing `actorId` surfaces as
 *     {@link OpenMeterMeterReadMissingActorIdentity}; other actor
 *     types fall through to {@link OpenMeterMeterReadUnauthorized}.
 *     Authz lives at the SERVICE layer (not the HTTP transport)
 *     so app helpers and any future workflow-jobs invocation
 *     inherit the same enforcement.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.openMeterMeterRead`.
 *     Failures surface as
 *     {@link OpenMeterMeterReadReasonNotInCatalog}.
 *   - **Audit emission**: every successful read appends ONE
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.openMeterMeterRead` +
 *     `openMeterMeterReadAuditAction.readPerformed` +
 *     `reasonCatalogId.openMeterMeterRead`. Audit emission is
 *     suppressed on upstream adapter failures so the audit channel
 *     reflects only successful operator reads.
 *   - **Bounded snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}|${kind}|${key}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction. The
 *     cache fronts each read so the surface stays bounded under
 *     burst.
 *   - **Cache freshness**: cached summaries are reconciled via
 *     `isOpenMeterMeterSummaryFresh(cachedAt, now,
 *     snapshotCacheTtlSeconds)`; stale entries are dropped before
 *     being returned so the admin console never sees stale meter
 *     definitions masquerading as fresh.
 *
 * Runtime config: `runOpenMeterMeterReadFromEnvironment` decodes
 * `OPENMETER_API_BASE_URL` + `OPENMETER_API_KEY` + `POSTGRES_URL` +
 * `OPEN_METER_METER_READ_CACHE_MAX_SIZE` +
 * `OPEN_METER_METER_READ_SNAPSHOT_CACHE_TTL_SECONDS` +
 * `OPEN_METER_METER_READ_DEFAULT_LIST_LIMIT` at the boundary with
 * NO local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  openMeterMeterReadAuditAction,
  OpenMeterMeterGetBySlugInputSchema,
  OpenMeterMeterListAllInputSchema,
  OpenMeterMeterListByEventTypeInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type OpenMeterMeterReadTargetTenant,
  type OpenMeterMeterSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isOpenMeterMeterSummaryFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makeOpenmeterAdapter,
  OpenmeterAdapter,
  type OpenmeterAdapterError,
  type OpenmeterAdapterService,
} from "../../adapters/features-billing/openmeter";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getBySlug" | "listAll" | "listByEventType";

export class OpenMeterMeterReadUnauthorized {
  readonly _tag = "OpenMeterMeterReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class OpenMeterMeterReadMissingActorIdentity {
  readonly _tag = "OpenMeterMeterReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class OpenMeterMeterReadReasonNotInCatalog {
  readonly _tag = "OpenMeterMeterReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class OpenMeterMeterReadReasonActionMismatch {
  readonly _tag = "OpenMeterMeterReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class OpenMeterMeterReadAdapterClientError {
  readonly _tag = "OpenMeterMeterReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: OpenMeterMeterReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type OpenMeterMeterReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | OpenMeterMeterReadUnauthorized
  | OpenMeterMeterReadMissingActorIdentity
  | OpenMeterMeterReadReasonNotInCatalog
  | OpenMeterMeterReadReasonActionMismatch
  | OpenMeterMeterReadAdapterClientError;

// ---------------------------------------------------------------------------
// OpenMeterMeterApiClient port (Context.Tag — tests inject directly;
// the env-bound default Layer wraps the existing Openmeter adapter)
// ---------------------------------------------------------------------------

export type OpenMeterMeterApiClientService = {
  readonly getBySlug: (input: {
    readonly tenant: OpenMeterMeterReadTargetTenant;
    readonly meterSlug: string;
  }) => Effect.Effect<
    Option.Option<OpenMeterMeterSummary>,
    OpenMeterMeterReadAdapterClientError
  >;
  readonly listAll: (input: {
    readonly tenant: OpenMeterMeterReadTargetTenant;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<OpenMeterMeterSummary>,
    OpenMeterMeterReadAdapterClientError
  >;
  readonly listByEventType: (input: {
    readonly tenant: OpenMeterMeterReadTargetTenant;
    readonly eventType: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<OpenMeterMeterSummary>,
    OpenMeterMeterReadAdapterClientError
  >;
};

export class OpenMeterMeterApiClient extends Context.Tag(
  "OpenMeterMeterApiClient",
)<OpenMeterMeterApiClient, OpenMeterMeterApiClientService>() {}

/**
 * Default {@link OpenMeterMeterApiClient} implementation that wraps
 * the existing {@link OpenmeterAdapter}
 * (`platformAdapterServiceName.openmeter`). The first cut uses the
 * adapter's healthcheck as a credential probe and returns honest
 * empty results (`Option.none` / `[]`) for the meter-definition
 * operations because the live `/meters` lookups are a follow-up
 * swap that requires the upstream pagination + filter strategy to
 * be documented. Operators see honest empty data rather than
 * synthesized records, and the cache + audit + authz invariants
 * still exercise correctly against the live adapter credentials.
 */
export const makeDefaultOpenMeterMeterApiClient = (
  adapter: OpenmeterAdapterService,
): OpenMeterMeterApiClientService => {
  const probe = (
    operation: Operation,
    tenant: OpenMeterMeterReadTargetTenant,
  ) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): OpenMeterMeterReadAdapterClientError =>
          new OpenMeterMeterReadAdapterClientError({
            operation,
            tenant,
            cause,
          }),
      ),
    );

  return {
    getBySlug: (input) =>
      probe("getBySlug", input.tenant).pipe(
        Effect.map(() => Option.none<OpenMeterMeterSummary>()),
      ),
    listAll: (input) =>
      probe("listAll", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<OpenMeterMeterSummary>),
      ),
    listByEventType: (input) =>
      probe("listByEventType", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<OpenMeterMeterSummary>),
      ),
  };
};

export const makeDefaultOpenMeterMeterApiClientLayer = Layer.effect(
  OpenMeterMeterApiClient,
  OpenmeterAdapter.pipe(Effect.map(makeDefaultOpenMeterMeterApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetOpenMeterMeterBySlugInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: OpenMeterMeterGetBySlugInputSchema,
});

export type GetOpenMeterMeterBySlugInput = Schema.Schema.Type<
  typeof GetOpenMeterMeterBySlugInputSchema
>;

export const ListOpenMeterMetersAllInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: OpenMeterMeterListAllInputSchema,
});

export type ListOpenMeterMetersAllInput = Schema.Schema.Type<
  typeof ListOpenMeterMetersAllInputSchema
>;

export const ListOpenMeterMetersByEventTypeInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: OpenMeterMeterListByEventTypeInputSchema,
});

export type ListOpenMeterMetersByEventTypeInput = Schema.Schema.Type<
  typeof ListOpenMeterMetersByEventTypeInputSchema
>;

const decodeGetBySlugInput = Schema.decodeUnknown(
  GetOpenMeterMeterBySlugInputSchema,
);
const decodeListAllInput = Schema.decodeUnknown(
  ListOpenMeterMetersAllInputSchema,
);
const decodeListByEventTypeInput = Schema.decodeUnknown(
  ListOpenMeterMetersByEventTypeInputSchema,
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
        new OpenMeterMeterReadMissingActorIdentity({ operation }),
      );
    }
    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new OpenMeterMeterReadUnauthorized({
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
  OpenMeterMeterReadReasonNotInCatalog | OpenMeterMeterReadReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new OpenMeterMeterReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new OpenMeterMeterReadReasonActionMismatch({
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
  tenant: OpenMeterMeterReadTargetTenant,
  kind: "slug" | "all" | "eventType",
  key: string,
  limit?: number,
): string => `${tenant.scope}|${tenant.scopeId}|${kind}|${key}|${limit ?? "-"}`;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type OpenMeterMeterReadView = {
  readonly summary: OpenMeterMeterSummary;
  readonly isFresh: boolean;
};

export type OpenMeterMeterReadListView = {
  readonly summaries: ReadonlyArray<OpenMeterMeterSummary>;
  readonly isFresh: boolean;
};

export type OpenMeterMeterReadServiceImpl = {
  readonly getBySlug: (
    input: GetOpenMeterMeterBySlugInput,
  ) => Effect.Effect<
    Option.Option<OpenMeterMeterReadView>,
    OpenMeterMeterReadServiceError
  >;
  readonly listAll: (
    input: ListOpenMeterMetersAllInput,
  ) => Effect.Effect<
    OpenMeterMeterReadListView,
    OpenMeterMeterReadServiceError
  >;
  readonly listByEventType: (
    input: ListOpenMeterMetersByEventTypeInput,
  ) => Effect.Effect<
    OpenMeterMeterReadListView,
    OpenMeterMeterReadServiceError
  >;
};

export class OpenMeterMeterReadService extends Context.Tag(
  "OpenMeterMeterReadService",
)<OpenMeterMeterReadService, OpenMeterMeterReadServiceImpl>() {}

export type OpenMeterMeterReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
  readonly defaultListLimit: number;
};

export type OpenMeterMeterReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly openMeterMeterApiClient: OpenMeterMeterApiClientService;
  readonly bounds: OpenMeterMeterReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.openMeterMeterRead,
    action: openMeterMeterReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.openMeterMeterRead,
  });

export const makeOpenMeterMeterReadService = (
  deps: OpenMeterMeterReadServiceDependencies,
): OpenMeterMeterReadServiceImpl => {
  const { auditLog, openMeterMeterApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const summaryCache = createReadCache<OpenMeterMeterSummary>(
    Math.max(1, bounds.cacheMaxSize),
  );
  const listCache = createReadCache<ReadonlyArray<OpenMeterMeterSummary>>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const resolveLimit = (explicit: number | undefined): number => {
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(200, Math.trunc(explicit));
    }
    return Math.max(1, Math.min(200, Math.trunc(bounds.defaultListLimit)));
  };

  const getBySlug: OpenMeterMeterReadServiceImpl["getBySlug"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetBySlugInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getBySlug");
      yield* validateReadReason(
        "getBySlug",
        decoded.query.reasonCatalogId,
        openMeterMeterReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "slug",
        decoded.query.meterSlug,
      );
      const nowMs = nowFn().getTime();
      const cached = summaryCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isOpenMeterMeterSummaryFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.meterSlug,
          );
          return Option.some({ summary: cached.value, isFresh: true });
        }
        summaryCache.delete(cacheKey);
      }

      const fetched = yield* openMeterMeterApiClient.getBySlug({
        tenant: decoded.query.tenant,
        meterSlug: decoded.query.meterSlug,
      });

      if (Option.isNone(fetched)) {
        return Option.none<OpenMeterMeterReadView>();
      }

      summaryCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.meterSlug,
      );
      return Option.some({ summary: fetched.value, isFresh: true });
    });

  const runListRead = (
    operation: "listAll" | "listByEventType",
    requestContext: RequestContext,
    tenant: OpenMeterMeterReadTargetTenant,
    cacheKey: string,
    fetch: () => Effect.Effect<
      ReadonlyArray<OpenMeterMeterSummary>,
      OpenMeterMeterReadAdapterClientError
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
          isOpenMeterMeterSummaryFresh(
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

  const listAll: OpenMeterMeterReadServiceImpl["listAll"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListAllInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listAll");
      yield* validateReadReason(
        "listAll",
        decoded.query.reasonCatalogId,
        openMeterMeterReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "all",
        "all",
        limit,
      );
      return yield* runListRead(
        "listAll",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          openMeterMeterApiClient.listAll({
            tenant: decoded.query.tenant,
            limit,
          }),
        `all`,
      );
    });

  const listByEventType: OpenMeterMeterReadServiceImpl["listByEventType"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByEventTypeInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByEventType");
      yield* validateReadReason(
        "listByEventType",
        decoded.query.reasonCatalogId,
        openMeterMeterReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "eventType",
        decoded.query.eventType,
        limit,
      );
      return yield* runListRead(
        "listByEventType",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          openMeterMeterApiClient.listByEventType({
            tenant: decoded.query.tenant,
            eventType: decoded.query.eventType,
            limit,
          }),
        `eventType:${decoded.query.eventType}`,
      );
    });

  return { getBySlug, listAll, listByEventType };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type OpenMeterMeterReadServiceLayerDependencies = {
  readonly bounds: OpenMeterMeterReadRuntimeBounds;
};

export const makeOpenMeterMeterReadServiceLayer = (
  deps: OpenMeterMeterReadServiceLayerDependencies,
) =>
  Layer.effect(
    OpenMeterMeterReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const openMeterMeterApiClient = yield* OpenMeterMeterApiClient;
      return makeOpenMeterMeterReadService({
        auditLog,
        openMeterMeterApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const OpenMeterMeterReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  OPENMETER_API_BASE_URL: Schema.NonEmptyString,
  OPENMETER_API_KEY: Schema.NonEmptyString,
  OPEN_METER_METER_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  OPEN_METER_METER_READ_SNAPSHOT_CACHE_TTL_SECONDS:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  OPEN_METER_METER_READ_DEFAULT_LIST_LIMIT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeOpenMeterMeterReadProcessEnvironment = Schema.decodeUnknown(
  OpenMeterMeterReadProcessEnvironmentSchema,
);

export type OpenMeterMeterReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly openmeter: {
    readonly url: string;
    readonly apiKey: string;
  };
  readonly bounds: OpenMeterMeterReadRuntimeBounds;
};

const resolveOpenMeterMeterReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeOpenMeterMeterReadProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): OpenMeterMeterReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        openmeter: {
          url: resolved.OPENMETER_API_BASE_URL,
          apiKey: resolved.OPENMETER_API_KEY,
        },
        bounds: {
          cacheMaxSize: resolved.OPEN_METER_METER_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.OPEN_METER_METER_READ_SNAPSHOT_CACHE_TTL_SECONDS,
          defaultListLimit: resolved.OPEN_METER_METER_READ_DEFAULT_LIST_LIMIT,
        },
      }),
    ),
  );

const makeOpenMeterMeterReadRuntime = (
  options: OpenMeterMeterReadRuntimeOptions,
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
    const openmeterAdapter = yield* makeOpenmeterAdapter({
      url: options.openmeter.url,
      apiKey: options.openmeter.apiKey,
    });
    const openMeterMeterApiClientLayer =
      makeDefaultOpenMeterMeterApiClientLayer.pipe(
        Layer.provide(Layer.succeed(OpenmeterAdapter, openmeterAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      openMeterMeterApiClientLayer,
    );
    const serviceLayer = makeOpenMeterMeterReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type OpenMeterMeterReadRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | OpenmeterAdapterError;

export const runOpenMeterMeterReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: OpenMeterMeterReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | OpenMeterMeterReadRuntimeError> =>
  resolveOpenMeterMeterReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeOpenMeterMeterReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(OpenMeterMeterReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | OpenMeterMeterReadRuntimeError>;
