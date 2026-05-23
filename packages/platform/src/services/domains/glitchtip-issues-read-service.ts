/**
 * GlitchTip issues read platform service (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #3).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link GlitchTipIssuesApiClient} port (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps the existing
 * {@link GlitchtipAdapter} via `platformAdapterServiceName.glitchtip`).
 * NO new adapter literal is introduced; the platform-adapter
 * service-name vocabulary stays sourced from
 * `packages/platform/src/adapters/service-names.ts`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: only `getById`, `listByProject`,
 *     `listByLevel` are exposed. There is NO mutation surface.
 *   - **Operator-only authz**: every read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`.
 *     Missing `actorId` surfaces as
 *     {@link GlitchTipIssuesReadMissingActorIdentity}; other actor
 *     types fall through to
 *     {@link GlitchTipIssuesReadUnauthorized}. Authz lives at the
 *     SERVICE layer (not the HTTP transport) so app helpers and
 *     any future workflow-jobs invocation inherit the same
 *     enforcement.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.glitchTipIssuesRead`.
 *     Failures surface as
 *     {@link GlitchTipIssuesReadReasonNotInCatalog}.
 *   - **Audit emission**: every successful read appends ONE
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.glitchTipIssuesRead` +
 *     `glitchTipIssuesReadAuditAction.readPerformed` +
 *     `reasonCatalogId.glitchTipIssuesRead`. Audit emission is
 *     suppressed on upstream adapter failures so the audit channel
 *     reflects only successful operator reads.
 *   - **Bounded snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}|${kind}|${key}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction. The
 *     cache fronts each read so the surface stays bounded under
 *     burst.
 *   - **Cache freshness**: cached entries are reconciled via
 *     `isGlitchTipIssueFresh(cachedAt, now,
 *     snapshotCacheTtlSeconds)`; stale entries are dropped before
 *     being returned so the admin console never sees stale issue
 *     data masquerading as fresh.
 *
 * Runtime config: `runGlitchTipIssuesReadFromEnvironment` decodes
 * `ERROR_TRACKING_DSN` (single combined credential consumed by the
 * existing GlitchTip adapter) + `POSTGRES_URL` +
 * `GLITCHTIP_ISSUES_READ_CACHE_MAX_SIZE` +
 * `GLITCHTIP_ISSUES_READ_SNAPSHOT_CACHE_TTL_SECONDS` +
 * `GLITCHTIP_ISSUES_READ_DEFAULT_LIST_LIMIT` at the boundary with
 * NO local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  glitchTipIssuesReadAuditAction,
  GlitchTipIssueGetByIdInputSchema,
  GlitchTipIssueListByLevelInputSchema,
  GlitchTipIssueListByProjectInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type GlitchTipIssue,
  type GlitchTipIssueLevel,
  type GlitchTipIssuesReadTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isGlitchTipIssueFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  GlitchtipAdapter,
  makeGlitchtipAdapter,
  type GlitchtipAdapterError,
  type GlitchtipAdapterService,
} from "../../adapters/observability/glitchtip";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getById" | "listByProject" | "listByLevel";

export class GlitchTipIssuesReadUnauthorized {
  readonly _tag = "GlitchTipIssuesReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class GlitchTipIssuesReadMissingActorIdentity {
  readonly _tag = "GlitchTipIssuesReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class GlitchTipIssuesReadReasonNotInCatalog {
  readonly _tag = "GlitchTipIssuesReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class GlitchTipIssuesReadReasonActionMismatch {
  readonly _tag = "GlitchTipIssuesReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class GlitchTipIssuesReadAdapterClientError {
  readonly _tag = "GlitchTipIssuesReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: GlitchTipIssuesReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type GlitchTipIssuesReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | GlitchTipIssuesReadUnauthorized
  | GlitchTipIssuesReadMissingActorIdentity
  | GlitchTipIssuesReadReasonNotInCatalog
  | GlitchTipIssuesReadReasonActionMismatch
  | GlitchTipIssuesReadAdapterClientError;

// ---------------------------------------------------------------------------
// GlitchTipIssuesApiClient port (Context.Tag — tests inject
// directly; the env-bound default Layer wraps the existing
// GlitchTip adapter)
// ---------------------------------------------------------------------------

export type GlitchTipIssuesApiClientService = {
  readonly getById: (input: {
    readonly tenant: GlitchTipIssuesReadTargetTenant;
    readonly issueId: string;
  }) => Effect.Effect<
    Option.Option<GlitchTipIssue>,
    GlitchTipIssuesReadAdapterClientError
  >;
  readonly listByProject: (input: {
    readonly tenant: GlitchTipIssuesReadTargetTenant;
    readonly projectSlug: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<GlitchTipIssue>,
    GlitchTipIssuesReadAdapterClientError
  >;
  readonly listByLevel: (input: {
    readonly tenant: GlitchTipIssuesReadTargetTenant;
    readonly level: GlitchTipIssueLevel;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<GlitchTipIssue>,
    GlitchTipIssuesReadAdapterClientError
  >;
};

export class GlitchTipIssuesApiClient extends Context.Tag(
  "GlitchTipIssuesApiClient",
)<GlitchTipIssuesApiClient, GlitchTipIssuesApiClientService>() {}

/**
 * Default {@link GlitchTipIssuesApiClient} implementation that wraps
 * the existing {@link GlitchtipAdapter}
 * (`platformAdapterServiceName.glitchtip`). The first cut uses the
 * adapter's healthcheck as a credential probe and returns honest
 * empty results (`Option.none` / `[]`) for the issue operations
 * because the live GlitchTip `/api/0/issues/` lookups are a
 * follow-up swap that requires the upstream pagination + auth
 * strategy to be documented (GlitchTip's issue API uses bearer
 * tokens distinct from the store-endpoint DSN credential).
 * Operators see honest empty data rather than synthesized records,
 * and the cache + audit + authz invariants still exercise
 * correctly against the live adapter credentials.
 */
export const makeDefaultGlitchTipIssuesApiClient = (
  adapter: GlitchtipAdapterService,
): GlitchTipIssuesApiClientService => {
  const probe = (
    operation: Operation,
    tenant: GlitchTipIssuesReadTargetTenant,
  ) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): GlitchTipIssuesReadAdapterClientError =>
          new GlitchTipIssuesReadAdapterClientError({
            operation,
            tenant,
            cause,
          }),
      ),
    );

  return {
    getById: (input) =>
      probe("getById", input.tenant).pipe(
        Effect.map(() => Option.none<GlitchTipIssue>()),
      ),
    listByProject: (input) =>
      probe("listByProject", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<GlitchTipIssue>),
      ),
    listByLevel: (input) =>
      probe("listByLevel", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<GlitchTipIssue>),
      ),
  };
};

export const makeDefaultGlitchTipIssuesApiClientLayer = Layer.effect(
  GlitchTipIssuesApiClient,
  GlitchtipAdapter.pipe(Effect.map(makeDefaultGlitchTipIssuesApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetGlitchTipIssueByIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: GlitchTipIssueGetByIdInputSchema,
});

export type GetGlitchTipIssueByIdInput = Schema.Schema.Type<
  typeof GetGlitchTipIssueByIdInputSchema
>;

export const ListGlitchTipIssuesByProjectInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: GlitchTipIssueListByProjectInputSchema,
});

export type ListGlitchTipIssuesByProjectInput = Schema.Schema.Type<
  typeof ListGlitchTipIssuesByProjectInputSchema
>;

export const ListGlitchTipIssuesByLevelInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: GlitchTipIssueListByLevelInputSchema,
});

export type ListGlitchTipIssuesByLevelInput = Schema.Schema.Type<
  typeof ListGlitchTipIssuesByLevelInputSchema
>;

const decodeGetByIdInput = Schema.decodeUnknown(
  GetGlitchTipIssueByIdInputSchema,
);
const decodeListByProjectInput = Schema.decodeUnknown(
  ListGlitchTipIssuesByProjectInputSchema,
);
const decodeListByLevelInput = Schema.decodeUnknown(
  ListGlitchTipIssuesByLevelInputSchema,
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
        new GlitchTipIssuesReadMissingActorIdentity({ operation }),
      );
    }
    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new GlitchTipIssuesReadUnauthorized({
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
  | GlitchTipIssuesReadReasonNotInCatalog
  | GlitchTipIssuesReadReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new GlitchTipIssuesReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new GlitchTipIssuesReadReasonActionMismatch({
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
  tenant: GlitchTipIssuesReadTargetTenant,
  kind: "id" | "project" | "level",
  key: string,
  limit?: number,
): string => `${tenant.scope}|${tenant.scopeId}|${kind}|${key}|${limit ?? "-"}`;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type GlitchTipIssuesReadView = {
  readonly issue: GlitchTipIssue;
  readonly isFresh: boolean;
};

export type GlitchTipIssuesReadListView = {
  readonly issues: ReadonlyArray<GlitchTipIssue>;
  readonly isFresh: boolean;
};

export type GlitchTipIssuesReadServiceImpl = {
  readonly getById: (
    input: GetGlitchTipIssueByIdInput,
  ) => Effect.Effect<
    Option.Option<GlitchTipIssuesReadView>,
    GlitchTipIssuesReadServiceError
  >;
  readonly listByProject: (
    input: ListGlitchTipIssuesByProjectInput,
  ) => Effect.Effect<
    GlitchTipIssuesReadListView,
    GlitchTipIssuesReadServiceError
  >;
  readonly listByLevel: (
    input: ListGlitchTipIssuesByLevelInput,
  ) => Effect.Effect<
    GlitchTipIssuesReadListView,
    GlitchTipIssuesReadServiceError
  >;
};

export class GlitchTipIssuesReadService extends Context.Tag(
  "GlitchTipIssuesReadService",
)<GlitchTipIssuesReadService, GlitchTipIssuesReadServiceImpl>() {}

export type GlitchTipIssuesReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
  readonly defaultListLimit: number;
};

export type GlitchTipIssuesReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly glitchTipIssuesApiClient: GlitchTipIssuesApiClientService;
  readonly bounds: GlitchTipIssuesReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.glitchTipIssuesRead,
    action: glitchTipIssuesReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.glitchTipIssuesRead,
  });

export const makeGlitchTipIssuesReadService = (
  deps: GlitchTipIssuesReadServiceDependencies,
): GlitchTipIssuesReadServiceImpl => {
  const { auditLog, glitchTipIssuesApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const issueCache = createReadCache<GlitchTipIssue>(
    Math.max(1, bounds.cacheMaxSize),
  );
  const listCache = createReadCache<ReadonlyArray<GlitchTipIssue>>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const resolveLimit = (explicit: number | undefined): number => {
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(200, Math.trunc(explicit));
    }
    return Math.max(1, Math.min(200, Math.trunc(bounds.defaultListLimit)));
  };

  const getById: GlitchTipIssuesReadServiceImpl["getById"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetByIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getById");
      yield* validateReadReason(
        "getById",
        decoded.query.reasonCatalogId,
        glitchTipIssuesReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "id",
        decoded.query.issueId,
      );
      const nowMs = nowFn().getTime();
      const cached = issueCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isGlitchTipIssueFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.issueId,
          );
          return Option.some({ issue: cached.value, isFresh: true });
        }
        issueCache.delete(cacheKey);
      }

      const fetched = yield* glitchTipIssuesApiClient.getById({
        tenant: decoded.query.tenant,
        issueId: decoded.query.issueId,
      });

      if (Option.isNone(fetched)) {
        return Option.none<GlitchTipIssuesReadView>();
      }

      issueCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.issueId,
      );
      return Option.some({ issue: fetched.value, isFresh: true });
    });

  const runListRead = (
    operation: "listByProject" | "listByLevel",
    requestContext: RequestContext,
    tenant: GlitchTipIssuesReadTargetTenant,
    cacheKey: string,
    fetch: () => Effect.Effect<
      ReadonlyArray<GlitchTipIssue>,
      GlitchTipIssuesReadAdapterClientError
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
          isGlitchTipIssueFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(auditLog, requestContext, auditTarget);
          return { issues: cached.value, isFresh: true } as const;
        }
        listCache.delete(cacheKey);
      }

      const fetched = yield* fetch();
      listCache.set(cacheKey, {
        value: fetched,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(auditLog, requestContext, auditTarget);
      return { issues: fetched, isFresh: true } as const;
    });

  const listByProject: GlitchTipIssuesReadServiceImpl["listByProject"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByProjectInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByProject");
      yield* validateReadReason(
        "listByProject",
        decoded.query.reasonCatalogId,
        glitchTipIssuesReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "project",
        decoded.query.projectSlug,
        limit,
      );
      return yield* runListRead(
        "listByProject",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          glitchTipIssuesApiClient.listByProject({
            tenant: decoded.query.tenant,
            projectSlug: decoded.query.projectSlug,
            limit,
          }),
        `project:${decoded.query.projectSlug}`,
      );
    });

  const listByLevel: GlitchTipIssuesReadServiceImpl["listByLevel"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByLevelInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByLevel");
      yield* validateReadReason(
        "listByLevel",
        decoded.query.reasonCatalogId,
        glitchTipIssuesReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "level",
        decoded.query.level,
        limit,
      );
      return yield* runListRead(
        "listByLevel",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          glitchTipIssuesApiClient.listByLevel({
            tenant: decoded.query.tenant,
            level: decoded.query.level,
            limit,
          }),
        `level:${decoded.query.level}`,
      );
    });

  return { getById, listByProject, listByLevel };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type GlitchTipIssuesReadServiceLayerDependencies = {
  readonly bounds: GlitchTipIssuesReadRuntimeBounds;
};

export const makeGlitchTipIssuesReadServiceLayer = (
  deps: GlitchTipIssuesReadServiceLayerDependencies,
) =>
  Layer.effect(
    GlitchTipIssuesReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const glitchTipIssuesApiClient = yield* GlitchTipIssuesApiClient;
      return makeGlitchTipIssuesReadService({
        auditLog,
        glitchTipIssuesApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const GlitchTipIssuesReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  ERROR_TRACKING_DSN: Schema.NonEmptyString,
  GLITCHTIP_ISSUES_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  GLITCHTIP_ISSUES_READ_SNAPSHOT_CACHE_TTL_SECONDS:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  GLITCHTIP_ISSUES_READ_DEFAULT_LIST_LIMIT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeGlitchTipIssuesReadProcessEnvironment = Schema.decodeUnknown(
  GlitchTipIssuesReadProcessEnvironmentSchema,
);

export type GlitchTipIssuesReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly glitchtip: {
    readonly dsn: string;
  };
  readonly bounds: GlitchTipIssuesReadRuntimeBounds;
};

const resolveGlitchTipIssuesReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeGlitchTipIssuesReadProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): GlitchTipIssuesReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        glitchtip: {
          dsn: resolved.ERROR_TRACKING_DSN,
        },
        bounds: {
          cacheMaxSize: resolved.GLITCHTIP_ISSUES_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.GLITCHTIP_ISSUES_READ_SNAPSHOT_CACHE_TTL_SECONDS,
          defaultListLimit: resolved.GLITCHTIP_ISSUES_READ_DEFAULT_LIST_LIMIT,
        },
      }),
    ),
  );

const makeGlitchTipIssuesReadRuntime = (
  options: GlitchTipIssuesReadRuntimeOptions,
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
    const glitchtipAdapter = yield* makeGlitchtipAdapter({
      dsn: options.glitchtip.dsn,
    });
    const glitchTipIssuesApiClientLayer =
      makeDefaultGlitchTipIssuesApiClientLayer.pipe(
        Layer.provide(Layer.succeed(GlitchtipAdapter, glitchtipAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      glitchTipIssuesApiClientLayer,
    );
    const serviceLayer = makeGlitchTipIssuesReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type GlitchTipIssuesReadRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | GlitchtipAdapterError;

export const runGlitchTipIssuesReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: GlitchTipIssuesReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | GlitchTipIssuesReadRuntimeError> =>
  resolveGlitchTipIssuesReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeGlitchTipIssuesReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(GlitchTipIssuesReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | GlitchTipIssuesReadRuntimeError>;
