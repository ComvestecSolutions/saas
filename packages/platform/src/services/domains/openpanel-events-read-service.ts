/**
 * OpenPanel events read platform service (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #4).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link OpenPanelEventsApiClient} port (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps the existing
 * {@link OpenPanelAdapter} via `platformAdapterServiceName.openpanel`).
 * NO new adapter literal is introduced; the platform-adapter
 * service-name vocabulary stays sourced from
 * `packages/platform/src/adapters/service-names.ts`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: only `getById`, `listByProject`,
 *     `listByEventName` are exposed. There is NO mutation surface.
 *   - **Operator-only authz**: every read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`.
 *     Missing `actorId` surfaces as
 *     {@link OpenPanelEventsReadMissingActorIdentity}; other actor
 *     types fall through to
 *     {@link OpenPanelEventsReadUnauthorized}. Authz lives at the
 *     SERVICE layer (not the HTTP transport) so app helpers and
 *     any future workflow-jobs invocation inherit the same
 *     enforcement.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.openPanelEventsRead`.
 *     Failures surface as
 *     {@link OpenPanelEventsReadReasonNotInCatalog}.
 *   - **Audit emission**: every successful read appends ONE
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.openPanelEventsRead` +
 *     `openPanelEventsReadAuditAction.readPerformed` +
 *     `reasonCatalogId.openPanelEventsRead`. Audit emission is
 *     suppressed on upstream adapter failures so the audit channel
 *     reflects only successful operator reads.
 *   - **Bounded snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}|${kind}|${key}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction. The
 *     cache fronts each read so the surface stays bounded under
 *     burst.
 *   - **Cache freshness**: cached entries are reconciled via
 *     `isOpenPanelEventFresh(cachedAt, now,
 *     snapshotCacheTtlSeconds)`; stale entries are dropped before
 *     being returned so the admin console never sees stale event
 *     data masquerading as fresh.
 *
 * Runtime config: `runOpenPanelEventsReadFromEnvironment` decodes
 * `OPENPANEL_API_URL` + `OPENPANEL_CLIENT_ID` +
 * `OPENPANEL_CLIENT_SECRET` (the existing adapter credentials) +
 * `POSTGRES_URL` +
 * `OPENPANEL_EVENTS_READ_CACHE_MAX_SIZE` +
 * `OPENPANEL_EVENTS_READ_SNAPSHOT_CACHE_TTL_SECONDS` +
 * `OPENPANEL_EVENTS_READ_DEFAULT_LIST_LIMIT` at the boundary with
 * NO local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  openPanelEventsReadAuditAction,
  OpenPanelEventGetByIdInputSchema,
  OpenPanelEventListByEventNameInputSchema,
  OpenPanelEventListByProjectInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type OpenPanelEvent,
  type OpenPanelEventsReadTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isOpenPanelEventFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makeOpenPanelAdapter,
  OpenPanelAdapter,
  type OpenPanelAdapterError,
  type OpenPanelAdapterService,
} from "../../adapters/observability/openpanel";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getById" | "listByProject" | "listByEventName";

export class OpenPanelEventsReadUnauthorized {
  readonly _tag = "OpenPanelEventsReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class OpenPanelEventsReadMissingActorIdentity {
  readonly _tag = "OpenPanelEventsReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class OpenPanelEventsReadReasonNotInCatalog {
  readonly _tag = "OpenPanelEventsReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class OpenPanelEventsReadReasonActionMismatch {
  readonly _tag = "OpenPanelEventsReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class OpenPanelEventsReadAdapterClientError {
  readonly _tag = "OpenPanelEventsReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: OpenPanelEventsReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type OpenPanelEventsReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | OpenPanelEventsReadUnauthorized
  | OpenPanelEventsReadMissingActorIdentity
  | OpenPanelEventsReadReasonNotInCatalog
  | OpenPanelEventsReadReasonActionMismatch
  | OpenPanelEventsReadAdapterClientError;

// ---------------------------------------------------------------------------
// OpenPanelEventsApiClient port (Context.Tag — tests inject
// directly; the env-bound default Layer wraps the existing
// OpenPanel adapter)
// ---------------------------------------------------------------------------

export type OpenPanelEventsApiClientService = {
  readonly getById: (input: {
    readonly tenant: OpenPanelEventsReadTargetTenant;
    readonly eventId: string;
  }) => Effect.Effect<
    Option.Option<OpenPanelEvent>,
    OpenPanelEventsReadAdapterClientError
  >;
  readonly listByProject: (input: {
    readonly tenant: OpenPanelEventsReadTargetTenant;
    readonly projectId: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<OpenPanelEvent>,
    OpenPanelEventsReadAdapterClientError
  >;
  readonly listByEventName: (input: {
    readonly tenant: OpenPanelEventsReadTargetTenant;
    readonly eventName: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<OpenPanelEvent>,
    OpenPanelEventsReadAdapterClientError
  >;
};

export class OpenPanelEventsApiClient extends Context.Tag(
  "OpenPanelEventsApiClient",
)<OpenPanelEventsApiClient, OpenPanelEventsApiClientService>() {}

/**
 * Default {@link OpenPanelEventsApiClient} implementation that wraps
 * the existing {@link OpenPanelAdapter}
 * (`platformAdapterServiceName.openpanel`). The first cut uses the
 * adapter's healthcheck as a credential probe and returns honest
 * empty results (`Option.none` / `[]`) for the event operations
 * because the live OpenPanel event-lookup endpoints are a follow-up
 * swap that requires the upstream pagination + filter strategy to
 * be documented (OpenPanel's analytics surface is event-ingest
 * oriented; the read-side query API still needs an authoritative
 * shape contract). Operators see honest empty data rather than
 * synthesized records, and the cache + audit + authz invariants
 * still exercise correctly against the live adapter credentials.
 */
export const makeDefaultOpenPanelEventsApiClient = (
  adapter: OpenPanelAdapterService,
): OpenPanelEventsApiClientService => {
  const probe = (
    operation: Operation,
    tenant: OpenPanelEventsReadTargetTenant,
  ) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): OpenPanelEventsReadAdapterClientError =>
          new OpenPanelEventsReadAdapterClientError({
            operation,
            tenant,
            cause,
          }),
      ),
    );

  return {
    getById: (input) =>
      probe("getById", input.tenant).pipe(
        Effect.map(() => Option.none<OpenPanelEvent>()),
      ),
    listByProject: (input) =>
      probe("listByProject", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<OpenPanelEvent>),
      ),
    listByEventName: (input) =>
      probe("listByEventName", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<OpenPanelEvent>),
      ),
  };
};

export const makeDefaultOpenPanelEventsApiClientLayer = Layer.effect(
  OpenPanelEventsApiClient,
  OpenPanelAdapter.pipe(Effect.map(makeDefaultOpenPanelEventsApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetOpenPanelEventByIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: OpenPanelEventGetByIdInputSchema,
});

export type GetOpenPanelEventByIdInput = Schema.Schema.Type<
  typeof GetOpenPanelEventByIdInputSchema
>;

export const ListOpenPanelEventsByProjectInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: OpenPanelEventListByProjectInputSchema,
});

export type ListOpenPanelEventsByProjectInput = Schema.Schema.Type<
  typeof ListOpenPanelEventsByProjectInputSchema
>;

export const ListOpenPanelEventsByEventNameInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: OpenPanelEventListByEventNameInputSchema,
});

export type ListOpenPanelEventsByEventNameInput = Schema.Schema.Type<
  typeof ListOpenPanelEventsByEventNameInputSchema
>;

const decodeGetByIdInput = Schema.decodeUnknown(
  GetOpenPanelEventByIdInputSchema,
);
const decodeListByProjectInput = Schema.decodeUnknown(
  ListOpenPanelEventsByProjectInputSchema,
);
const decodeListByEventNameInput = Schema.decodeUnknown(
  ListOpenPanelEventsByEventNameInputSchema,
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
        new OpenPanelEventsReadMissingActorIdentity({ operation }),
      );
    }
    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new OpenPanelEventsReadUnauthorized({
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
  | OpenPanelEventsReadReasonNotInCatalog
  | OpenPanelEventsReadReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new OpenPanelEventsReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new OpenPanelEventsReadReasonActionMismatch({
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
  tenant: OpenPanelEventsReadTargetTenant,
  kind: "id" | "project" | "eventName",
  key: string,
  limit?: number,
): string => `${tenant.scope}|${tenant.scopeId}|${kind}|${key}|${limit ?? "-"}`;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type OpenPanelEventsReadView = {
  readonly event: OpenPanelEvent;
  readonly isFresh: boolean;
};

export type OpenPanelEventsReadListView = {
  readonly events: ReadonlyArray<OpenPanelEvent>;
  readonly isFresh: boolean;
};

export type OpenPanelEventsReadServiceImpl = {
  readonly getById: (
    input: GetOpenPanelEventByIdInput,
  ) => Effect.Effect<
    Option.Option<OpenPanelEventsReadView>,
    OpenPanelEventsReadServiceError
  >;
  readonly listByProject: (
    input: ListOpenPanelEventsByProjectInput,
  ) => Effect.Effect<
    OpenPanelEventsReadListView,
    OpenPanelEventsReadServiceError
  >;
  readonly listByEventName: (
    input: ListOpenPanelEventsByEventNameInput,
  ) => Effect.Effect<
    OpenPanelEventsReadListView,
    OpenPanelEventsReadServiceError
  >;
};

export class OpenPanelEventsReadService extends Context.Tag(
  "OpenPanelEventsReadService",
)<OpenPanelEventsReadService, OpenPanelEventsReadServiceImpl>() {}

export type OpenPanelEventsReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
  readonly defaultListLimit: number;
};

export type OpenPanelEventsReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly openPanelEventsApiClient: OpenPanelEventsApiClientService;
  readonly bounds: OpenPanelEventsReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.openPanelEventsRead,
    action: openPanelEventsReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.openPanelEventsRead,
  });

export const makeOpenPanelEventsReadService = (
  deps: OpenPanelEventsReadServiceDependencies,
): OpenPanelEventsReadServiceImpl => {
  const { auditLog, openPanelEventsApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const eventCache = createReadCache<OpenPanelEvent>(
    Math.max(1, bounds.cacheMaxSize),
  );
  const listCache = createReadCache<ReadonlyArray<OpenPanelEvent>>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const resolveLimit = (explicit: number | undefined): number => {
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(200, Math.trunc(explicit));
    }
    return Math.max(1, Math.min(200, Math.trunc(bounds.defaultListLimit)));
  };

  const getById: OpenPanelEventsReadServiceImpl["getById"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetByIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getById");
      yield* validateReadReason(
        "getById",
        decoded.query.reasonCatalogId,
        openPanelEventsReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "id",
        decoded.query.eventId,
      );
      const nowMs = nowFn().getTime();
      const cached = eventCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isOpenPanelEventFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.eventId,
          );
          return Option.some({ event: cached.value, isFresh: true });
        }
        eventCache.delete(cacheKey);
      }

      const fetched = yield* openPanelEventsApiClient.getById({
        tenant: decoded.query.tenant,
        eventId: decoded.query.eventId,
      });

      if (Option.isNone(fetched)) {
        return Option.none<OpenPanelEventsReadView>();
      }

      eventCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.eventId,
      );
      return Option.some({ event: fetched.value, isFresh: true });
    });

  const runListRead = (
    operation: "listByProject" | "listByEventName",
    requestContext: RequestContext,
    tenant: OpenPanelEventsReadTargetTenant,
    cacheKey: string,
    fetch: () => Effect.Effect<
      ReadonlyArray<OpenPanelEvent>,
      OpenPanelEventsReadAdapterClientError
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
          isOpenPanelEventFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(auditLog, requestContext, auditTarget);
          return { events: cached.value, isFresh: true } as const;
        }
        listCache.delete(cacheKey);
      }

      const fetched = yield* fetch();
      listCache.set(cacheKey, {
        value: fetched,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(auditLog, requestContext, auditTarget);
      return { events: fetched, isFresh: true } as const;
    });

  const listByProject: OpenPanelEventsReadServiceImpl["listByProject"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByProjectInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByProject");
      yield* validateReadReason(
        "listByProject",
        decoded.query.reasonCatalogId,
        openPanelEventsReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "project",
        decoded.query.projectId,
        limit,
      );
      return yield* runListRead(
        "listByProject",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          openPanelEventsApiClient.listByProject({
            tenant: decoded.query.tenant,
            projectId: decoded.query.projectId,
            limit,
          }),
        `project:${decoded.query.projectId}`,
      );
    });

  const listByEventName: OpenPanelEventsReadServiceImpl["listByEventName"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByEventNameInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByEventName");
      yield* validateReadReason(
        "listByEventName",
        decoded.query.reasonCatalogId,
        openPanelEventsReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "eventName",
        decoded.query.eventName,
        limit,
      );
      return yield* runListRead(
        "listByEventName",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          openPanelEventsApiClient.listByEventName({
            tenant: decoded.query.tenant,
            eventName: decoded.query.eventName,
            limit,
          }),
        `eventName:${decoded.query.eventName}`,
      );
    });

  return { getById, listByProject, listByEventName };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type OpenPanelEventsReadServiceLayerDependencies = {
  readonly bounds: OpenPanelEventsReadRuntimeBounds;
};

export const makeOpenPanelEventsReadServiceLayer = (
  deps: OpenPanelEventsReadServiceLayerDependencies,
) =>
  Layer.effect(
    OpenPanelEventsReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const openPanelEventsApiClient = yield* OpenPanelEventsApiClient;
      return makeOpenPanelEventsReadService({
        auditLog,
        openPanelEventsApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const OpenPanelEventsReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  OPENPANEL_API_URL: Schema.NonEmptyString,
  OPENPANEL_CLIENT_ID: Schema.NonEmptyString,
  OPENPANEL_CLIENT_SECRET: Schema.NonEmptyString,
  OPENPANEL_EVENTS_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  OPENPANEL_EVENTS_READ_SNAPSHOT_CACHE_TTL_SECONDS:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  OPENPANEL_EVENTS_READ_DEFAULT_LIST_LIMIT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeOpenPanelEventsReadProcessEnvironment = Schema.decodeUnknown(
  OpenPanelEventsReadProcessEnvironmentSchema,
);

export type OpenPanelEventsReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly openpanel: {
    readonly apiUrl: string;
    readonly clientId: string;
    readonly clientSecret: string;
  };
  readonly bounds: OpenPanelEventsReadRuntimeBounds;
};

const resolveOpenPanelEventsReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeOpenPanelEventsReadProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): OpenPanelEventsReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        openpanel: {
          apiUrl: resolved.OPENPANEL_API_URL,
          clientId: resolved.OPENPANEL_CLIENT_ID,
          clientSecret: resolved.OPENPANEL_CLIENT_SECRET,
        },
        bounds: {
          cacheMaxSize: resolved.OPENPANEL_EVENTS_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.OPENPANEL_EVENTS_READ_SNAPSHOT_CACHE_TTL_SECONDS,
          defaultListLimit: resolved.OPENPANEL_EVENTS_READ_DEFAULT_LIST_LIMIT,
        },
      }),
    ),
  );

const makeOpenPanelEventsReadRuntime = (
  options: OpenPanelEventsReadRuntimeOptions,
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
    const openPanelAdapter = yield* makeOpenPanelAdapter({
      apiUrl: options.openpanel.apiUrl,
      clientId: options.openpanel.clientId,
      clientSecret: options.openpanel.clientSecret,
    });
    const openPanelEventsApiClientLayer =
      makeDefaultOpenPanelEventsApiClientLayer.pipe(
        Layer.provide(Layer.succeed(OpenPanelAdapter, openPanelAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      openPanelEventsApiClientLayer,
    );
    const serviceLayer = makeOpenPanelEventsReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type OpenPanelEventsReadRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | OpenPanelAdapterError;

export const runOpenPanelEventsReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: OpenPanelEventsReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | OpenPanelEventsReadRuntimeError> =>
  resolveOpenPanelEventsReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeOpenPanelEventsReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(OpenPanelEventsReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | OpenPanelEventsReadRuntimeError>;
