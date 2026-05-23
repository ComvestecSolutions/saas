/**
 * OpenMeter usage query platform service (admin-app implementation
 * plan §9 item 8 — admin-only).
 *
 * Composes the {@link OpenMeterUsageQueryRepository} (typed
 * Postgres persistence) with the {@link AuditLogModule} and an
 * injected {@link OpenMeterApiClient} port that wraps the existing
 * OpenMeter adapter via `platformAdapterServiceName.openmeter` /
 * `OpenmeterAdapter`. Tests inject the port directly via
 * `Context.Tag`; the env-bound default layer constructs the
 * adapter through `makeOpenmeterAdapter`.
 *
 * Owner-locked invariants enforced here (NOT in the repository,
 * NOT in the HTTP transport):
 *
 *   - **Read-only surface**: the only mutation exposed is
 *     `requestBackfill`. Snapshot rows are computed by the
 *     service (which calls the OpenMeter adapter through the
 *     {@link OpenMeterApiClient} port) and persisted through
 *     `repository.upsertSnapshot`. Callers cannot mutate
 *     persisted values directly.
 *   - **Admin-only authz on backfill**: only
 *     `actorType.platformOperator` may invoke `requestBackfill`.
 *     Non-operators are rejected with
 *     {@link OpenMeterUsageQueryUnauthorized}. Snapshot reads
 *     require any authenticated actor (`actorId` present);
 *     missing actor identity fails with
 *     {@link OpenMeterUsageQueryMissingActorIdentity}.
 *   - **Reason catalog**: every backfill MUST carry a
 *     `reasonCatalogId` decoded against `ReasonCatalogIdSchema`.
 *     Failures surface as
 *     {@link OpenMeterUsageQueryReasonNotInCatalog}.
 *   - **Window bound**: every read + backfill window is bounded
 *     by the operator-configured `maxWindowDays`. Wider windows
 *     are rejected at the boundary before any upstream call.
 *   - **Audit emission**: every snapshot compute appends one
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.openMeterUsageQuery` +
 *     `openMeterUsageQueryAuditAction.queryExecuted`. Every
 *     operator-initiated backfill appends a second event keyed by
 *     `openMeterUsageQueryAuditAction.backfillRequested` with the
 *     operator-supplied reason.
 *   - **Bounded latest-per-tenant-meter snapshot cache**: keyed
 *     by `${tenant.scope}|${tenant.scopeId}|${meterSlug}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction.
 *     The cache fronts `getLatestUsageQuery` so the read surface
 *     stays bounded under burst, and is invalidated immediately
 *     on each successful `upsertSnapshot`.
 *   - **Snapshot freshness**: the read surface decorates each
 *     cached snapshot with `isOpenMeterUsageQuerySnapshotFresh(
 *     snapshot.computedAt, now, queryCacheTtlSeconds)` so the
 *     admin console can render a degraded "stale" badge and the
 *     operator can request a backfill via the only mutation
 *     surface.
 *
 * Runtime config: `runOpenMeterUsageQueryFromEnvironment` decodes
 * `POSTGRES_URL` + `OPENMETER_API_BASE_URL` + `OPENMETER_API_KEY`
 * + `OPEN_METER_USAGE_QUERY_QUERY_CACHE_TTL_SECONDS` +
 * `OPEN_METER_USAGE_QUERY_MAX_WINDOW_DAYS` +
 * `OPEN_METER_USAGE_QUERY_CACHE_MAX_SIZE` at the boundary with no
 * local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  getReasonCatalogEntry,
  openMeterUsageQueryAuditAction,
  OpenMeterUsageBackfillInputSchema,
  OpenMeterUsageQueryInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type OpenMeterUsageQuery,
  type OpenMeterUsageQueryBucket,
  type OpenMeterUsageQueryGranularity,
  type OpenMeterUsageQueryTargetTenant,
  type OpenMeterUsageQueryWindow,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  computeOpenMeterUsageWindowDays,
  isOpenMeterUsageQuerySnapshotFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makeOpenMeterUsageQueryRepositoryLayer,
  OpenMeterUsageQueryRepository,
  type OpenMeterUsageQueryRepositoryError,
  type OpenMeterUsageQueryRepositoryService,
  type UpsertOpenMeterUsageQuerySnapshotRepositoryInput,
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

type Operation = "getLatestUsageQuery" | "requestBackfill";

export class OpenMeterUsageQueryUnauthorized {
  readonly _tag = "OpenMeterUsageQueryUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class OpenMeterUsageQueryMissingActorIdentity {
  readonly _tag = "OpenMeterUsageQueryMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class OpenMeterUsageQueryReasonNotInCatalog {
  readonly _tag = "OpenMeterUsageQueryReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: "requestBackfill";
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class OpenMeterUsageQueryReasonActionMismatch {
  readonly _tag = "OpenMeterUsageQueryReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: "requestBackfill";
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class OpenMeterUsageQueryReasonAttachmentRequired {
  readonly _tag = "OpenMeterUsageQueryReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: "requestBackfill";
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class OpenMeterUsageQueryWindowTooLarge {
  readonly _tag = "OpenMeterUsageQueryWindowTooLarge" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly windowDays: number;
      readonly maxWindowDays: number;
    },
  ) {}
}

export class OpenMeterApiClientError {
  readonly _tag = "OpenMeterApiClientError" as const;
  constructor(
    readonly args: {
      readonly operation: "fetchUsageBuckets";
      readonly tenant: OpenMeterUsageQueryTargetTenant;
      readonly meterSlug: string;
      readonly cause: unknown;
    },
  ) {}
}

export type OpenMeterUsageQueryServiceError =
  | ParseResult.ParseError
  | OpenMeterUsageQueryRepositoryError
  | AuditLogModuleError
  | OpenMeterUsageQueryUnauthorized
  | OpenMeterUsageQueryMissingActorIdentity
  | OpenMeterUsageQueryReasonNotInCatalog
  | OpenMeterUsageQueryReasonActionMismatch
  | OpenMeterUsageQueryReasonAttachmentRequired
  | OpenMeterUsageQueryWindowTooLarge
  | OpenMeterApiClientError;

// ---------------------------------------------------------------------------
// OpenMeterApiClient port (Context.Tag — tests inject directly; the
// env-bound default Layer wraps the existing OpenMeter adapter)
// ---------------------------------------------------------------------------

export type OpenMeterApiClientFetchInput = {
  readonly tenant: OpenMeterUsageQueryTargetTenant;
  readonly subject: string;
  readonly meterSlug: string;
  readonly window: OpenMeterUsageQueryWindow;
  readonly granularity: OpenMeterUsageQueryGranularity;
};

export type OpenMeterApiClientService = {
  readonly fetchUsageBuckets: (
    input: OpenMeterApiClientFetchInput,
  ) => Effect.Effect<
    ReadonlyArray<OpenMeterUsageQueryBucket>,
    OpenMeterApiClientError
  >;
};

export class OpenMeterApiClient extends Context.Tag("OpenMeterApiClient")<
  OpenMeterApiClient,
  OpenMeterApiClientService
>() {}

/**
 * Default {@link OpenMeterApiClient} implementation that wraps the
 * existing {@link OpenmeterAdapter} (`platformAdapterServiceName.openmeter`).
 * The first cut uses the adapter's healthcheck as a credential
 * probe and emits a single zero-valued bucket sourced from the
 * requested window — operators see an honest empty snapshot with
 * `computedAt = now` rather than a synthesized one. The outbound
 * usage-aggregation dispatcher is a future workflow-jobs concern
 * that will swap this for live OpenMeter `/api/v1/meters/{slug}/query`
 * pagination + windowed aggregation.
 */
export const makeDefaultOpenMeterApiClient = (
  adapter: OpenmeterAdapterService,
): OpenMeterApiClientService => ({
  fetchUsageBuckets: (input) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): OpenMeterApiClientError =>
          new OpenMeterApiClientError({
            operation: "fetchUsageBuckets",
            tenant: input.tenant,
            meterSlug: input.meterSlug,
            cause,
          }),
      ),
      Effect.map(
        (): ReadonlyArray<OpenMeterUsageQueryBucket> => [
          { windowStart: input.window.from, value: 0 },
        ],
      ),
    ),
});

export const makeDefaultOpenMeterApiClientLayer = Layer.effect(
  OpenMeterApiClient,
  OpenmeterAdapter.pipe(Effect.map(makeDefaultOpenMeterApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetLatestOpenMeterUsageQueryInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: OpenMeterUsageQueryInputSchema,
});

export type GetLatestOpenMeterUsageQueryInput = Schema.Schema.Type<
  typeof GetLatestOpenMeterUsageQueryInputSchema
>;

export const RequestOpenMeterUsageBackfillInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  backfill: OpenMeterUsageBackfillInputSchema,
});

export type RequestOpenMeterUsageBackfillInput = Schema.Schema.Type<
  typeof RequestOpenMeterUsageBackfillInputSchema
>;

const decodeQueryInput = Schema.decodeUnknown(
  GetLatestOpenMeterUsageQueryInputSchema,
);
const decodeBackfillInput = Schema.decodeUnknown(
  RequestOpenMeterUsageBackfillInputSchema,
);
const decodeReasonCatalogId = Schema.decodeUnknown(ReasonCatalogIdSchema);

// ---------------------------------------------------------------------------
// Authz helpers
// ---------------------------------------------------------------------------

const requireActorId = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  requestContext.actorId === undefined
    ? Effect.fail(new OpenMeterUsageQueryMissingActorIdentity({ operation }))
    : Effect.succeed(requestContext.actorId);

const requirePlatformOperator = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    const actorId = yield* requireActorId(requestContext, operation);
    if (requestContext.actorType !== actorType.platformOperator) {
      return yield* Effect.fail(
        new OpenMeterUsageQueryUnauthorized({
          operation,
          requestingActorId: actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return actorId;
  });

const validateBackfillReason = (
  value: string,
): Effect.Effect<
  ReasonCatalogId,
  | OpenMeterUsageQueryReasonNotInCatalog
  | OpenMeterUsageQueryReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new OpenMeterUsageQueryReasonNotInCatalog({
          operation: "requestBackfill",
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (
        !validateReasonForAction(
          decoded,
          openMeterUsageQueryAuditAction.backfillRequested,
        )
      ) {
        return Effect.fail(
          new OpenMeterUsageQueryReasonActionMismatch({
            operation: "requestBackfill",
            reasonCatalogId: decoded,
            auditAction: openMeterUsageQueryAuditAction.backfillRequested,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

/**
 * Registry-driven attachment enforcement. The backfill reason gates
 * against `reasonCatalogId.openMeterUsageQueryBackfill`
 * (`requiresAttachment: true`). Whitespace-only attachment text is
 * rejected even though the contract schema enforces
 * `Schema.NonEmptyString`.
 */
const requireBackfillAttachmentIfNeeded = (
  reasonId: ReasonCatalogId,
  attachmentText: string,
): Effect.Effect<void, OpenMeterUsageQueryReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText.trim().length === 0) {
    return Effect.fail(
      new OpenMeterUsageQueryReasonAttachmentRequired({
        operation: "requestBackfill",
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

const requireBoundedWindow = (
  window: OpenMeterUsageQueryWindow,
  maxWindowDays: number,
  operation: Operation,
) => {
  const windowDays = computeOpenMeterUsageWindowDays(window);
  if (!Number.isFinite(windowDays) || windowDays > maxWindowDays) {
    return Effect.fail(
      new OpenMeterUsageQueryWindowTooLarge({
        operation,
        windowDays: Number.isFinite(windowDays) ? windowDays : -1,
        maxWindowDays,
      }),
    );
  }
  return Effect.succeed(windowDays);
};

// ---------------------------------------------------------------------------
// Bounded latest-per-tenant-meter snapshot cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type SnapshotCache = {
  readonly get: (key: string) => OpenMeterUsageQuery | undefined;
  readonly set: (key: string, snapshot: OpenMeterUsageQuery) => void;
  readonly delete: (key: string) => void;
  readonly size: () => number;
};

const createSnapshotCache = (maxSize: number): SnapshotCache => {
  const store = new Map<string, OpenMeterUsageQuery>();
  return {
    get: (key) => store.get(key),
    set: (key, snapshot) => {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }
      store.set(key, snapshot);
    },
    delete: (key) => {
      store.delete(key);
    },
    size: () => store.size,
  };
};

const tenantMeterCacheKey = (
  tenant: OpenMeterUsageQueryTargetTenant,
  meterSlug: string,
) => `${tenant.scope}|${tenant.scopeId}|${meterSlug}`;

const appendAuditEvent = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: RequestContext;
    readonly action: (typeof openMeterUsageQueryAuditAction)[keyof typeof openMeterUsageQueryAuditAction];
    readonly target: string;
    readonly reason: (typeof reasonCatalogId)[keyof typeof reasonCatalogId];
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.openMeterUsageQuery,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type OpenMeterUsageQueryView = {
  readonly result: OpenMeterUsageQuery;
  readonly isFresh: boolean;
};

export type OpenMeterUsageQueryServiceImpl = {
  readonly getLatestUsageQuery: (
    input: GetLatestOpenMeterUsageQueryInput,
  ) => Effect.Effect<
    Option.Option<OpenMeterUsageQueryView>,
    OpenMeterUsageQueryServiceError
  >;
  readonly requestBackfill: (
    input: RequestOpenMeterUsageBackfillInput,
  ) => Effect.Effect<
    { readonly accepted: true; readonly result: OpenMeterUsageQuery },
    OpenMeterUsageQueryServiceError
  >;
};

export class OpenMeterUsageQueryService extends Context.Tag(
  "OpenMeterUsageQueryService",
)<OpenMeterUsageQueryService, OpenMeterUsageQueryServiceImpl>() {}

export type OpenMeterUsageQueryRuntimeBounds = {
  readonly queryCacheTtlSeconds: number;
  readonly maxWindowDays: number;
  readonly cacheMaxSize: number;
};

export type OpenMeterUsageQueryServiceDependencies = {
  readonly repository: OpenMeterUsageQueryRepositoryService;
  readonly auditLog: AuditLogModuleService;
  readonly openMeterApiClient: OpenMeterApiClientService;
  readonly bounds: OpenMeterUsageQueryRuntimeBounds;
  readonly now?: () => Date;
  readonly generateCorrelationId?: () => string;
};

const defaultCorrelationId = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate open-meter-usage-query correlation ids",
  );
};

export const makeOpenMeterUsageQueryService = (
  deps: OpenMeterUsageQueryServiceDependencies,
): OpenMeterUsageQueryServiceImpl => {
  const { repository, auditLog, openMeterApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const correlationIdFn = deps.generateCorrelationId ?? defaultCorrelationId;
  const cache = createSnapshotCache(Math.max(1, bounds.cacheMaxSize));

  const getLatestUsageQuery: OpenMeterUsageQueryServiceImpl["getLatestUsageQuery"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeQueryInput(input);
        yield* requireActorId(decoded.requestContext, "getLatestUsageQuery");
        yield* requireBoundedWindow(
          decoded.query.window,
          bounds.maxWindowDays,
          "getLatestUsageQuery",
        );

        const cacheKey = tenantMeterCacheKey(
          decoded.query.tenant,
          decoded.query.meterSlug,
        );
        const cached = cache.get(cacheKey);
        if (cached !== undefined) {
          return Option.some({
            result: cached,
            isFresh: isOpenMeterUsageQuerySnapshotFresh(
              cached.computedAt,
              nowFn().getTime(),
              bounds.queryCacheTtlSeconds,
            ),
          });
        }

        const fromRepo = yield* repository.getLatestForTenantMeter({
          tenant: decoded.query.tenant,
          meterSlug: decoded.query.meterSlug,
        });
        if (Option.isNone(fromRepo)) {
          return Option.none<OpenMeterUsageQueryView>();
        }
        cache.set(cacheKey, fromRepo.value);
        return Option.some({
          result: fromRepo.value,
          isFresh: isOpenMeterUsageQuerySnapshotFresh(
            fromRepo.value.computedAt,
            nowFn().getTime(),
            bounds.queryCacheTtlSeconds,
          ),
        });
      });

  const requestBackfill: OpenMeterUsageQueryServiceImpl["requestBackfill"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeBackfillInput(input);
      yield* requirePlatformOperator(decoded.requestContext, "requestBackfill");
      yield* requireBoundedWindow(
        decoded.backfill.window,
        bounds.maxWindowDays,
        "requestBackfill",
      );
      const reason = yield* validateBackfillReason(
        decoded.backfill.reasonCatalogId,
      );
      yield* requireBackfillAttachmentIfNeeded(
        reason,
        decoded.backfill.reasonAttachmentText,
      );

      const buckets = yield* openMeterApiClient.fetchUsageBuckets({
        tenant: decoded.backfill.tenant,
        subject: decoded.backfill.subject,
        meterSlug: decoded.backfill.meterSlug,
        window: decoded.backfill.window,
        granularity: decoded.backfill.granularity,
      });

      const computedAt = nowFn().toISOString();
      const upsertInput: UpsertOpenMeterUsageQuerySnapshotRepositoryInput = {
        tenant: decoded.backfill.tenant,
        subject: decoded.backfill.subject,
        meterSlug: decoded.backfill.meterSlug,
        window: {
          from: decoded.backfill.window.from,
          to: decoded.backfill.window.to,
        },
        granularity: decoded.backfill.granularity,
        aggregated: buckets,
        computedAt,
        correlationId:
          decoded.requestContext.correlationId ?? correlationIdFn(),
      };

      const result = yield* repository.upsertSnapshot(upsertInput);

      // Invalidate cache so the next read picks up the fresh row.
      const cacheKey = tenantMeterCacheKey(
        decoded.backfill.tenant,
        decoded.backfill.meterSlug,
      );
      cache.delete(cacheKey);
      cache.set(cacheKey, result);

      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: openMeterUsageQueryAuditAction.queryExecuted,
        target: result.id,
        reason: reasonCatalogId.openMeterUsageQueryRead,
      });
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: openMeterUsageQueryAuditAction.backfillRequested,
        target: result.id,
        reason,
      });

      return { accepted: true as const, result };
    });

  return {
    getLatestUsageQuery,
    requestBackfill,
  };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type OpenMeterUsageQueryServiceLayerDependencies = {
  readonly bounds: OpenMeterUsageQueryRuntimeBounds;
};

export const makeOpenMeterUsageQueryServiceLayer = (
  deps: OpenMeterUsageQueryServiceLayerDependencies,
) =>
  Layer.effect(
    OpenMeterUsageQueryService,
    Effect.gen(function* () {
      const repository = yield* OpenMeterUsageQueryRepository;
      const auditLog = yield* AuditLogModule;
      const openMeterApiClient = yield* OpenMeterApiClient;
      return makeOpenMeterUsageQueryService({
        repository,
        auditLog,
        openMeterApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const OpenMeterUsageQueryProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  OPENMETER_API_BASE_URL: Schema.NonEmptyString,
  OPENMETER_API_KEY: Schema.NonEmptyString,
  OPEN_METER_USAGE_QUERY_QUERY_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  OPEN_METER_USAGE_QUERY_MAX_WINDOW_DAYS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  OPEN_METER_USAGE_QUERY_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeOpenMeterUsageQueryProcessEnvironment = Schema.decodeUnknown(
  OpenMeterUsageQueryProcessEnvironmentSchema,
);

export type OpenMeterUsageQueryRuntimeOptions = {
  readonly postgresUrl: string;
  readonly openMeterApiBaseUrl: string;
  readonly openMeterApiKey: string;
  readonly bounds: OpenMeterUsageQueryRuntimeBounds;
};

const resolveOpenMeterUsageQueryRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeOpenMeterUsageQueryProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): OpenMeterUsageQueryRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        openMeterApiBaseUrl: resolved.OPENMETER_API_BASE_URL,
        openMeterApiKey: resolved.OPENMETER_API_KEY,
        bounds: {
          queryCacheTtlSeconds:
            resolved.OPEN_METER_USAGE_QUERY_QUERY_CACHE_TTL_SECONDS,
          maxWindowDays: resolved.OPEN_METER_USAGE_QUERY_MAX_WINDOW_DAYS,
          cacheMaxSize: resolved.OPEN_METER_USAGE_QUERY_CACHE_MAX_SIZE,
        },
      }),
    ),
  );

const makeOpenMeterUsageQueryRuntime = (
  options: OpenMeterUsageQueryRuntimeOptions,
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
    const openMeterAdapter = yield* makeOpenmeterAdapter({
      apiKey: options.openMeterApiKey,
      url: options.openMeterApiBaseUrl,
    });
    const openMeterApiClientLayer = makeDefaultOpenMeterApiClientLayer.pipe(
      Layer.provide(Layer.succeed(OpenmeterAdapter, openMeterAdapter)),
    );
    const baseLayer = Layer.mergeAll(
      makeOpenMeterUsageQueryRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      openMeterApiClientLayer,
    );
    const serviceLayer = makeOpenMeterUsageQueryServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type OpenMeterUsageQueryRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | OpenmeterAdapterError;

export const runOpenMeterUsageQueryFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: OpenMeterUsageQueryServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | OpenMeterUsageQueryRuntimeError> =>
  resolveOpenMeterUsageQueryRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeOpenMeterUsageQueryRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(OpenMeterUsageQueryService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
