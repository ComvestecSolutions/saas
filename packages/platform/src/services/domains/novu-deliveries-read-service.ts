/**
 * Novu deliveries read platform service (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #1).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link NovuDeliveriesApiClient} port (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps the existing
 * {@link NovuAdapter} via `platformAdapterServiceName.novu`). NO
 * new adapter literal is introduced; the platform-adapter
 * service-name vocabulary stays sourced from
 * `packages/platform/src/adapters/service-names.ts`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: only `getById`, `listByRecipient`,
 *     `listByChannel` are exposed. There is NO mutation surface.
 *   - **Operator-only authz**: every read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`.
 *     Missing `actorId` surfaces as
 *     {@link NovuDeliveriesReadMissingActorIdentity}; other actor
 *     types fall through to {@link NovuDeliveriesReadUnauthorized}.
 *     Authz lives at the SERVICE layer (not the HTTP transport)
 *     so app helpers and any future workflow-jobs invocation
 *     inherit the same enforcement.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.novuDeliveriesRead`.
 *     Failures surface as
 *     {@link NovuDeliveriesReadReasonNotInCatalog}.
 *   - **Audit emission**: every successful read appends ONE
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.novuDeliveriesRead` +
 *     `novuDeliveriesReadAuditAction.readPerformed` +
 *     `reasonCatalogId.novuDeliveriesRead`. Audit emission is
 *     suppressed on upstream adapter failures so the audit channel
 *     reflects only successful operator reads.
 *   - **Bounded snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}|${kind}|${key}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction. The
 *     cache fronts each read so the surface stays bounded under
 *     burst.
 *   - **Cache freshness**: cached summaries are reconciled via
 *     `isNovuDeliverySummaryFresh(cachedAt, now,
 *     snapshotCacheTtlSeconds)`; stale entries are dropped before
 *     being returned so the admin console never sees stale
 *     delivery data masquerading as fresh.
 *
 * Runtime config: `runNovuDeliveriesReadFromEnvironment` decodes
 * `NOVU_API_URL` + `NOVU_API_KEY` + `POSTGRES_URL` +
 * `NOVU_DELIVERIES_READ_CACHE_MAX_SIZE` +
 * `NOVU_DELIVERIES_READ_SNAPSHOT_CACHE_TTL_SECONDS` +
 * `NOVU_DELIVERIES_READ_DEFAULT_LIST_LIMIT` at the boundary with
 * NO local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  novuDeliveriesReadAuditAction,
  NovuDeliveryGetByIdInputSchema,
  NovuDeliveryListByChannelInputSchema,
  NovuDeliveryListByRecipientInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type NovuDeliveriesReadTargetTenant,
  type NovuDeliveryChannel,
  type NovuDeliverySummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isNovuDeliverySummaryFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makeNovuAdapter,
  NovuAdapter,
  type NovuAdapterError,
  type NovuAdapterService,
} from "../../adapters/messaging/novu";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getById" | "listByRecipient" | "listByChannel";

export class NovuDeliveriesReadUnauthorized {
  readonly _tag = "NovuDeliveriesReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class NovuDeliveriesReadMissingActorIdentity {
  readonly _tag = "NovuDeliveriesReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class NovuDeliveriesReadReasonNotInCatalog {
  readonly _tag = "NovuDeliveriesReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class NovuDeliveriesReadReasonActionMismatch {
  readonly _tag = "NovuDeliveriesReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class NovuDeliveriesReadAdapterClientError {
  readonly _tag = "NovuDeliveriesReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: NovuDeliveriesReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type NovuDeliveriesReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | NovuDeliveriesReadUnauthorized
  | NovuDeliveriesReadMissingActorIdentity
  | NovuDeliveriesReadReasonNotInCatalog
  | NovuDeliveriesReadReasonActionMismatch
  | NovuDeliveriesReadAdapterClientError;

// ---------------------------------------------------------------------------
// NovuDeliveriesApiClient port (Context.Tag — tests inject directly;
// the env-bound default Layer wraps the existing Novu adapter)
// ---------------------------------------------------------------------------

export type NovuDeliveriesApiClientService = {
  readonly getById: (input: {
    readonly tenant: NovuDeliveriesReadTargetTenant;
    readonly deliveryId: string;
  }) => Effect.Effect<
    Option.Option<NovuDeliverySummary>,
    NovuDeliveriesReadAdapterClientError
  >;
  readonly listByRecipient: (input: {
    readonly tenant: NovuDeliveriesReadTargetTenant;
    readonly subscriberId: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<NovuDeliverySummary>,
    NovuDeliveriesReadAdapterClientError
  >;
  readonly listByChannel: (input: {
    readonly tenant: NovuDeliveriesReadTargetTenant;
    readonly channel: NovuDeliveryChannel;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<NovuDeliverySummary>,
    NovuDeliveriesReadAdapterClientError
  >;
};

export class NovuDeliveriesApiClient extends Context.Tag(
  "NovuDeliveriesApiClient",
)<NovuDeliveriesApiClient, NovuDeliveriesApiClientService>() {}

/**
 * Default {@link NovuDeliveriesApiClient} implementation that wraps
 * the existing {@link NovuAdapter}
 * (`platformAdapterServiceName.novu`). The first cut uses the
 * adapter's healthcheck as a credential probe and returns honest
 * empty results (`Option.none` / `[]`) for the delivery operations
 * because the live `/v1/notifications` lookups are a follow-up
 * swap that requires the upstream pagination + filter strategy to
 * be documented. Operators see honest empty data rather than
 * synthesized records, and the cache + audit + authz invariants
 * still exercise correctly against the live adapter credentials.
 */
export const makeDefaultNovuDeliveriesApiClient = (
  adapter: NovuAdapterService,
): NovuDeliveriesApiClientService => {
  const probe = (
    operation: Operation,
    tenant: NovuDeliveriesReadTargetTenant,
  ) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): NovuDeliveriesReadAdapterClientError =>
          new NovuDeliveriesReadAdapterClientError({
            operation,
            tenant,
            cause,
          }),
      ),
    );

  return {
    getById: (input) =>
      probe("getById", input.tenant).pipe(
        Effect.map(() => Option.none<NovuDeliverySummary>()),
      ),
    listByRecipient: (input) =>
      probe("listByRecipient", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<NovuDeliverySummary>),
      ),
    listByChannel: (input) =>
      probe("listByChannel", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<NovuDeliverySummary>),
      ),
  };
};

export const makeDefaultNovuDeliveriesApiClientLayer = Layer.effect(
  NovuDeliveriesApiClient,
  NovuAdapter.pipe(Effect.map(makeDefaultNovuDeliveriesApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetNovuDeliveryByIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: NovuDeliveryGetByIdInputSchema,
});

export type GetNovuDeliveryByIdInput = Schema.Schema.Type<
  typeof GetNovuDeliveryByIdInputSchema
>;

export const ListNovuDeliveriesByRecipientInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: NovuDeliveryListByRecipientInputSchema,
});

export type ListNovuDeliveriesByRecipientInput = Schema.Schema.Type<
  typeof ListNovuDeliveriesByRecipientInputSchema
>;

export const ListNovuDeliveriesByChannelInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: NovuDeliveryListByChannelInputSchema,
});

export type ListNovuDeliveriesByChannelInput = Schema.Schema.Type<
  typeof ListNovuDeliveriesByChannelInputSchema
>;

const decodeGetByIdInput = Schema.decodeUnknown(GetNovuDeliveryByIdInputSchema);
const decodeListByRecipientInput = Schema.decodeUnknown(
  ListNovuDeliveriesByRecipientInputSchema,
);
const decodeListByChannelInput = Schema.decodeUnknown(
  ListNovuDeliveriesByChannelInputSchema,
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
        new NovuDeliveriesReadMissingActorIdentity({ operation }),
      );
    }
    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new NovuDeliveriesReadUnauthorized({
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
  NovuDeliveriesReadReasonNotInCatalog | NovuDeliveriesReadReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new NovuDeliveriesReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new NovuDeliveriesReadReasonActionMismatch({
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
  tenant: NovuDeliveriesReadTargetTenant,
  kind: "id" | "recipient" | "channel",
  key: string,
  limit?: number,
): string => `${tenant.scope}|${tenant.scopeId}|${kind}|${key}|${limit ?? "-"}`;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type NovuDeliveriesReadView = {
  readonly summary: NovuDeliverySummary;
  readonly isFresh: boolean;
};

export type NovuDeliveriesReadListView = {
  readonly summaries: ReadonlyArray<NovuDeliverySummary>;
  readonly isFresh: boolean;
};

export type NovuDeliveriesReadServiceImpl = {
  readonly getById: (
    input: GetNovuDeliveryByIdInput,
  ) => Effect.Effect<
    Option.Option<NovuDeliveriesReadView>,
    NovuDeliveriesReadServiceError
  >;
  readonly listByRecipient: (
    input: ListNovuDeliveriesByRecipientInput,
  ) => Effect.Effect<
    NovuDeliveriesReadListView,
    NovuDeliveriesReadServiceError
  >;
  readonly listByChannel: (
    input: ListNovuDeliveriesByChannelInput,
  ) => Effect.Effect<
    NovuDeliveriesReadListView,
    NovuDeliveriesReadServiceError
  >;
};

export class NovuDeliveriesReadService extends Context.Tag(
  "NovuDeliveriesReadService",
)<NovuDeliveriesReadService, NovuDeliveriesReadServiceImpl>() {}

export type NovuDeliveriesReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
  readonly defaultListLimit: number;
};

export type NovuDeliveriesReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly novuDeliveriesApiClient: NovuDeliveriesApiClientService;
  readonly bounds: NovuDeliveriesReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.novuDeliveriesRead,
    action: novuDeliveriesReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.novuDeliveriesRead,
  });

export const makeNovuDeliveriesReadService = (
  deps: NovuDeliveriesReadServiceDependencies,
): NovuDeliveriesReadServiceImpl => {
  const { auditLog, novuDeliveriesApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const summaryCache = createReadCache<NovuDeliverySummary>(
    Math.max(1, bounds.cacheMaxSize),
  );
  const listCache = createReadCache<ReadonlyArray<NovuDeliverySummary>>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const resolveLimit = (explicit: number | undefined): number => {
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(200, Math.trunc(explicit));
    }
    return Math.max(1, Math.min(200, Math.trunc(bounds.defaultListLimit)));
  };

  const getById: NovuDeliveriesReadServiceImpl["getById"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetByIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getById");
      yield* validateReadReason(
        "getById",
        decoded.query.reasonCatalogId,
        novuDeliveriesReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "id",
        decoded.query.deliveryId,
      );
      const nowMs = nowFn().getTime();
      const cached = summaryCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isNovuDeliverySummaryFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.deliveryId,
          );
          return Option.some({ summary: cached.value, isFresh: true });
        }
        summaryCache.delete(cacheKey);
      }

      const fetched = yield* novuDeliveriesApiClient.getById({
        tenant: decoded.query.tenant,
        deliveryId: decoded.query.deliveryId,
      });

      if (Option.isNone(fetched)) {
        return Option.none<NovuDeliveriesReadView>();
      }

      summaryCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.deliveryId,
      );
      return Option.some({ summary: fetched.value, isFresh: true });
    });

  const runListRead = (
    operation: "listByRecipient" | "listByChannel",
    requestContext: RequestContext,
    tenant: NovuDeliveriesReadTargetTenant,
    cacheKey: string,
    fetch: () => Effect.Effect<
      ReadonlyArray<NovuDeliverySummary>,
      NovuDeliveriesReadAdapterClientError
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
          isNovuDeliverySummaryFresh(
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

  const listByRecipient: NovuDeliveriesReadServiceImpl["listByRecipient"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByRecipientInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByRecipient");
      yield* validateReadReason(
        "listByRecipient",
        decoded.query.reasonCatalogId,
        novuDeliveriesReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "recipient",
        decoded.query.subscriberId,
        limit,
      );
      return yield* runListRead(
        "listByRecipient",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          novuDeliveriesApiClient.listByRecipient({
            tenant: decoded.query.tenant,
            subscriberId: decoded.query.subscriberId,
            limit,
          }),
        `recipient:${decoded.query.subscriberId}`,
      );
    });

  const listByChannel: NovuDeliveriesReadServiceImpl["listByChannel"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByChannelInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByChannel");
      yield* validateReadReason(
        "listByChannel",
        decoded.query.reasonCatalogId,
        novuDeliveriesReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "channel",
        decoded.query.channel,
        limit,
      );
      return yield* runListRead(
        "listByChannel",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          novuDeliveriesApiClient.listByChannel({
            tenant: decoded.query.tenant,
            channel: decoded.query.channel,
            limit,
          }),
        `channel:${decoded.query.channel}`,
      );
    });

  return { getById, listByRecipient, listByChannel };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type NovuDeliveriesReadServiceLayerDependencies = {
  readonly bounds: NovuDeliveriesReadRuntimeBounds;
};

export const makeNovuDeliveriesReadServiceLayer = (
  deps: NovuDeliveriesReadServiceLayerDependencies,
) =>
  Layer.effect(
    NovuDeliveriesReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const novuDeliveriesApiClient = yield* NovuDeliveriesApiClient;
      return makeNovuDeliveriesReadService({
        auditLog,
        novuDeliveriesApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const NovuDeliveriesReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  NOVU_API_URL: Schema.NonEmptyString,
  NOVU_API_KEY: Schema.NonEmptyString,
  NOVU_DELIVERIES_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  NOVU_DELIVERIES_READ_SNAPSHOT_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  NOVU_DELIVERIES_READ_DEFAULT_LIST_LIMIT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeNovuDeliveriesReadProcessEnvironment = Schema.decodeUnknown(
  NovuDeliveriesReadProcessEnvironmentSchema,
);

export type NovuDeliveriesReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly novu: {
    readonly apiUrl: string;
    readonly apiKey: string;
  };
  readonly bounds: NovuDeliveriesReadRuntimeBounds;
};

const resolveNovuDeliveriesReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeNovuDeliveriesReadProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): NovuDeliveriesReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        novu: {
          apiUrl: resolved.NOVU_API_URL,
          apiKey: resolved.NOVU_API_KEY,
        },
        bounds: {
          cacheMaxSize: resolved.NOVU_DELIVERIES_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.NOVU_DELIVERIES_READ_SNAPSHOT_CACHE_TTL_SECONDS,
          defaultListLimit: resolved.NOVU_DELIVERIES_READ_DEFAULT_LIST_LIMIT,
        },
      }),
    ),
  );

const makeNovuDeliveriesReadRuntime = (
  options: NovuDeliveriesReadRuntimeOptions,
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
    const novuAdapter = yield* makeNovuAdapter({
      apiUrl: options.novu.apiUrl,
      apiKey: options.novu.apiKey,
    });
    const novuDeliveriesApiClientLayer =
      makeDefaultNovuDeliveriesApiClientLayer.pipe(
        Layer.provide(Layer.succeed(NovuAdapter, novuAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      novuDeliveriesApiClientLayer,
    );
    const serviceLayer = makeNovuDeliveriesReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type NovuDeliveriesReadRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | NovuAdapterError;

export const runNovuDeliveriesReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: NovuDeliveriesReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | NovuDeliveriesReadRuntimeError> =>
  resolveNovuDeliveriesReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeNovuDeliveriesReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(NovuDeliveriesReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | NovuDeliveriesReadRuntimeError>;
