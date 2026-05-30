/**
 * Polar customer read platform service (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch A vendor #2).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link PolarCustomerApiClient} port (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps the existing Polar
 * adapter via `platformAdapterServiceName.polar`). NO new adapter
 * literal is introduced; the platform-adapter service-name
 * vocabulary stays sourced from
 * `packages/platform/src/adapters/service-names.ts`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: only `getById`, `listByEmail`,
 *     `listByExternalId` are exposed. There is NO mutation surface.
 *   - **Operator-only authz**: every read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`.
 *     Missing `actorId` surfaces as
 *     {@link PolarCustomerReadMissingActorIdentity}; other actor
 *     types fall through to {@link PolarCustomerReadUnauthorized}.
 *     Authz lives at the SERVICE layer (not the HTTP transport)
 *     so app helpers and any future workflow-jobs invocation
 *     inherit the same enforcement.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.polarCustomerRead`.
 *     Failures surface as
 *     {@link PolarCustomerReadReasonNotInCatalog}.
 *   - **Audit emission**: every successful read appends ONE
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.polarCustomerRead` +
 *     `polarCustomerReadAuditAction.readPerformed` +
 *     `reasonCatalogId.polarCustomerRead`. Audit emission is
 *     suppressed on upstream adapter failures so the audit channel
 *     reflects only successful operator reads.
 *   - **Bounded snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}|${kind}|${key}` and
 *     bounded by `cacheMaxSize` with insertion-order eviction. The
 *     cache fronts each read so the surface stays bounded under
 *     burst.
 *   - **Cache freshness**: cached summaries are reconciled via
 *     `isPolarCustomerSummaryFresh(cachedAt, now,
 *     snapshotCacheTtlSeconds)`; stale entries are dropped before
 *     being returned so the admin console never sees stale
 *     customer data masquerading as fresh.
 *
 * Runtime config: `runPolarCustomerReadFromEnvironment` decodes
 * `POLAR_API_BASE_URL` + `POLAR_ACCESS_TOKEN` + `POSTGRES_URL` +
 * `POLAR_CUSTOMER_READ_CACHE_MAX_SIZE` +
 * `POLAR_CUSTOMER_READ_SNAPSHOT_CACHE_TTL_SECONDS` +
 * `POLAR_CUSTOMER_READ_DEFAULT_LIST_LIMIT` at the boundary with NO
 * local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  platformModuleId,
  polarCustomerReadAuditAction,
  PolarCustomerGetByIdInputSchema,
  PolarCustomerListByEmailInputSchema,
  PolarCustomerListByExternalIdInputSchema,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type PolarCustomerReadTargetTenant,
  type PolarCustomerSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isPolarCustomerSummaryFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makePolarAdapter,
  PolarAdapter,
  type PolarAdapterError,
  type PolarAdapterService,
} from "../../adapters/features-billing/polar";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getById" | "listByEmail" | "listByExternalId";

export class PolarCustomerReadUnauthorized {
  readonly _tag = "PolarCustomerReadUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class PolarCustomerReadMissingActorIdentity {
  readonly _tag = "PolarCustomerReadMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class PolarCustomerReadReasonNotInCatalog {
  readonly _tag = "PolarCustomerReadReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class PolarCustomerReadReasonActionMismatch {
  readonly _tag = "PolarCustomerReadReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class PolarCustomerReadAdapterClientError {
  readonly _tag = "PolarCustomerReadAdapterClientError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly tenant: PolarCustomerReadTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type PolarCustomerReadServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | PolarCustomerReadUnauthorized
  | PolarCustomerReadMissingActorIdentity
  | PolarCustomerReadReasonNotInCatalog
  | PolarCustomerReadReasonActionMismatch
  | PolarCustomerReadAdapterClientError;

// ---------------------------------------------------------------------------
// PolarCustomerApiClient port (Context.Tag — tests inject directly;
// the env-bound default Layer wraps the existing Polar adapter)
// ---------------------------------------------------------------------------

export type PolarCustomerApiClientService = {
  readonly getById: (input: {
    readonly tenant: PolarCustomerReadTargetTenant;
    readonly customerId: string;
  }) => Effect.Effect<
    Option.Option<PolarCustomerSummary>,
    PolarCustomerReadAdapterClientError
  >;
  readonly listByEmail: (input: {
    readonly tenant: PolarCustomerReadTargetTenant;
    readonly email: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<PolarCustomerSummary>,
    PolarCustomerReadAdapterClientError
  >;
  readonly listByExternalId: (input: {
    readonly tenant: PolarCustomerReadTargetTenant;
    readonly externalId: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<PolarCustomerSummary>,
    PolarCustomerReadAdapterClientError
  >;
};

export class PolarCustomerApiClient extends Context.Tag(
  "PolarCustomerApiClient",
)<PolarCustomerApiClient, PolarCustomerApiClientService>() {}

/**
 * Default {@link PolarCustomerApiClient} implementation that wraps
 * the existing {@link PolarAdapter}
 * (`platformAdapterServiceName.polar`). The first cut uses the
 * adapter's healthcheck as a credential probe and returns honest
 * empty results (`Option.none` / `[]`) for the customer
 * operations because the live customer search is a follow-up swap
 * that requires the upstream customer-list pagination strategy to
 * be documented. Operators see honest empty data rather than
 * synthesized records, and the cache + audit + authz invariants
 * still exercise correctly against the live adapter credentials.
 */
export const makeDefaultPolarCustomerApiClient = (
  adapter: PolarAdapterService,
): PolarCustomerApiClientService => {
  const probe = (operation: Operation, tenant: PolarCustomerReadTargetTenant) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): PolarCustomerReadAdapterClientError =>
          new PolarCustomerReadAdapterClientError({
            operation,
            tenant,
            cause,
          }),
      ),
    );

  return {
    getById: (input) =>
      probe("getById", input.tenant).pipe(
        Effect.map(() => Option.none<PolarCustomerSummary>()),
      ),
    listByEmail: (input) =>
      probe("listByEmail", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<PolarCustomerSummary>),
      ),
    listByExternalId: (input) =>
      probe("listByExternalId", input.tenant).pipe(
        Effect.map(() => [] as ReadonlyArray<PolarCustomerSummary>),
      ),
  };
};

export const makeDefaultPolarCustomerApiClientLayer = Layer.effect(
  PolarCustomerApiClient,
  PolarAdapter.pipe(Effect.map(makeDefaultPolarCustomerApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetPolarCustomerByIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: PolarCustomerGetByIdInputSchema,
});

export type GetPolarCustomerByIdInput = Schema.Schema.Type<
  typeof GetPolarCustomerByIdInputSchema
>;

export const ListPolarCustomersByEmailInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: PolarCustomerListByEmailInputSchema,
});

export type ListPolarCustomersByEmailInput = Schema.Schema.Type<
  typeof ListPolarCustomersByEmailInputSchema
>;

export const ListPolarCustomersByExternalIdInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: PolarCustomerListByExternalIdInputSchema,
});

export type ListPolarCustomersByExternalIdInput = Schema.Schema.Type<
  typeof ListPolarCustomersByExternalIdInputSchema
>;

const decodeGetByIdInput = Schema.decodeUnknown(
  GetPolarCustomerByIdInputSchema,
);
const decodeListByEmailInput = Schema.decodeUnknown(
  ListPolarCustomersByEmailInputSchema,
);
const decodeListByExternalIdInput = Schema.decodeUnknown(
  ListPolarCustomersByExternalIdInputSchema,
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
        new PolarCustomerReadMissingActorIdentity({ operation }),
      );
    }
    if (!allowedReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new PolarCustomerReadUnauthorized({
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
  PolarCustomerReadReasonNotInCatalog | PolarCustomerReadReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new PolarCustomerReadReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new PolarCustomerReadReasonActionMismatch({
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
  tenant: PolarCustomerReadTargetTenant,
  kind: "id" | "email" | "externalId",
  key: string,
  limit?: number,
): string => `${tenant.scope}|${tenant.scopeId}|${kind}|${key}|${limit ?? "-"}`;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type PolarCustomerReadView = {
  readonly summary: PolarCustomerSummary;
  readonly isFresh: boolean;
};

export type PolarCustomerReadListView = {
  readonly summaries: ReadonlyArray<PolarCustomerSummary>;
  readonly isFresh: boolean;
};

export type PolarCustomerReadServiceImpl = {
  readonly getById: (
    input: GetPolarCustomerByIdInput,
  ) => Effect.Effect<
    Option.Option<PolarCustomerReadView>,
    PolarCustomerReadServiceError
  >;
  readonly listByEmail: (
    input: ListPolarCustomersByEmailInput,
  ) => Effect.Effect<PolarCustomerReadListView, PolarCustomerReadServiceError>;
  readonly listByExternalId: (
    input: ListPolarCustomersByExternalIdInput,
  ) => Effect.Effect<PolarCustomerReadListView, PolarCustomerReadServiceError>;
};

export class PolarCustomerReadService extends Context.Tag(
  "PolarCustomerReadService",
)<PolarCustomerReadService, PolarCustomerReadServiceImpl>() {}

export type PolarCustomerReadRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly snapshotCacheTtlSeconds: number;
  readonly defaultListLimit: number;
};

export type PolarCustomerReadServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly polarCustomerApiClient: PolarCustomerApiClientService;
  readonly bounds: PolarCustomerReadRuntimeBounds;
  readonly now?: () => Date;
};

const appendReadAudit = (
  auditLog: AuditLogModuleService,
  requestContext: RequestContext,
  target: string,
) =>
  auditLog.append({
    requestContext,
    moduleId: platformModuleId.polarCustomerRead,
    action: polarCustomerReadAuditAction.readPerformed,
    target,
    reason: reasonCatalogId.polarCustomerRead,
  });

export const makePolarCustomerReadService = (
  deps: PolarCustomerReadServiceDependencies,
): PolarCustomerReadServiceImpl => {
  const { auditLog, polarCustomerApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const summaryCache = createReadCache<PolarCustomerSummary>(
    Math.max(1, bounds.cacheMaxSize),
  );
  const listCache = createReadCache<ReadonlyArray<PolarCustomerSummary>>(
    Math.max(1, bounds.cacheMaxSize),
  );

  const resolveLimit = (explicit: number | undefined): number => {
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(200, Math.trunc(explicit));
    }
    return Math.max(1, Math.min(200, Math.trunc(bounds.defaultListLimit)));
  };

  const getById: PolarCustomerReadServiceImpl["getById"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetByIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getById");
      yield* validateReadReason(
        "getById",
        decoded.query.reasonCatalogId,
        polarCustomerReadAuditAction.readPerformed,
      );

      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "id",
        decoded.query.customerId,
      );
      const nowMs = nowFn().getTime();
      const cached = summaryCache.get(cacheKey);
      if (cached !== undefined) {
        if (
          isPolarCustomerSummaryFresh(
            cached.cachedAtIso,
            nowMs,
            bounds.snapshotCacheTtlSeconds,
          )
        ) {
          yield* appendReadAudit(
            auditLog,
            decoded.requestContext,
            cached.value.customerId,
          );
          return Option.some({ summary: cached.value, isFresh: true });
        }
        summaryCache.delete(cacheKey);
      }

      const fetched = yield* polarCustomerApiClient.getById({
        tenant: decoded.query.tenant,
        customerId: decoded.query.customerId,
      });

      if (Option.isNone(fetched)) {
        return Option.none<PolarCustomerReadView>();
      }

      summaryCache.set(cacheKey, {
        value: fetched.value,
        cachedAtIso: nowFn().toISOString(),
      });
      yield* appendReadAudit(
        auditLog,
        decoded.requestContext,
        fetched.value.customerId,
      );
      return Option.some({ summary: fetched.value, isFresh: true });
    });

  const runListRead = (
    operation: "listByEmail" | "listByExternalId",
    requestContext: RequestContext,
    tenant: PolarCustomerReadTargetTenant,
    cacheKey: string,
    fetch: () => Effect.Effect<
      ReadonlyArray<PolarCustomerSummary>,
      PolarCustomerReadAdapterClientError
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
          isPolarCustomerSummaryFresh(
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

  const listByEmail: PolarCustomerReadServiceImpl["listByEmail"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByEmailInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByEmail");
      yield* validateReadReason(
        "listByEmail",
        decoded.query.reasonCatalogId,
        polarCustomerReadAuditAction.readPerformed,
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
          polarCustomerApiClient.listByEmail({
            tenant: decoded.query.tenant,
            email: decoded.query.email,
            limit,
          }),
        `email:${decoded.query.email}`,
      );
    });

  const listByExternalId: PolarCustomerReadServiceImpl["listByExternalId"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListByExternalIdInput(input);
      yield* requireOperatorActor(decoded.requestContext, "listByExternalId");
      yield* validateReadReason(
        "listByExternalId",
        decoded.query.reasonCatalogId,
        polarCustomerReadAuditAction.readPerformed,
      );
      const limit = resolveLimit(decoded.query.limit);
      const cacheKey = tenantCacheKey(
        decoded.query.tenant,
        "externalId",
        decoded.query.externalId,
        limit,
      );
      return yield* runListRead(
        "listByExternalId",
        decoded.requestContext,
        decoded.query.tenant,
        cacheKey,
        () =>
          polarCustomerApiClient.listByExternalId({
            tenant: decoded.query.tenant,
            externalId: decoded.query.externalId,
            limit,
          }),
        `externalId:${decoded.query.externalId}`,
      );
    });

  return { getById, listByEmail, listByExternalId };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type PolarCustomerReadServiceLayerDependencies = {
  readonly bounds: PolarCustomerReadRuntimeBounds;
};

export const makePolarCustomerReadServiceLayer = (
  deps: PolarCustomerReadServiceLayerDependencies,
) =>
  Layer.effect(
    PolarCustomerReadService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const polarCustomerApiClient = yield* PolarCustomerApiClient;
      return makePolarCustomerReadService({
        auditLog,
        polarCustomerApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const PolarCustomerReadProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  POLAR_API_BASE_URL: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_CUSTOMER_READ_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  POLAR_CUSTOMER_READ_SNAPSHOT_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  POLAR_CUSTOMER_READ_DEFAULT_LIST_LIMIT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodePolarCustomerReadProcessEnvironment = Schema.decodeUnknown(
  PolarCustomerReadProcessEnvironmentSchema,
);

export type PolarCustomerReadRuntimeOptions = {
  readonly postgresUrl: string;
  readonly polar: {
    readonly apiBaseUrl: string;
    readonly apiKey: string;
  };
  readonly bounds: PolarCustomerReadRuntimeBounds;
};

const resolvePolarCustomerReadRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodePolarCustomerReadProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): PolarCustomerReadRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        polar: {
          apiBaseUrl: resolved.POLAR_API_BASE_URL,
          apiKey: resolved.POLAR_ACCESS_TOKEN,
        },
        bounds: {
          cacheMaxSize: resolved.POLAR_CUSTOMER_READ_CACHE_MAX_SIZE,
          snapshotCacheTtlSeconds:
            resolved.POLAR_CUSTOMER_READ_SNAPSHOT_CACHE_TTL_SECONDS,
          defaultListLimit: resolved.POLAR_CUSTOMER_READ_DEFAULT_LIST_LIMIT,
        },
      }),
    ),
  );

const makePolarCustomerReadRuntime = (
  options: PolarCustomerReadRuntimeOptions,
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
    const polarAdapter = yield* makePolarAdapter({
      apiUrl: options.polar.apiBaseUrl,
      apiKey: options.polar.apiKey,
    });
    const polarCustomerApiClientLayer =
      makeDefaultPolarCustomerApiClientLayer.pipe(
        Layer.provide(Layer.succeed(PolarAdapter, polarAdapter)),
      );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      polarCustomerApiClientLayer,
    );
    const serviceLayer = makePolarCustomerReadServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type PolarCustomerReadRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | PolarAdapterError;

export const runPolarCustomerReadFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: PolarCustomerReadServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | PolarCustomerReadRuntimeError> =>
  resolvePolarCustomerReadRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makePolarCustomerReadRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(PolarCustomerReadService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | PolarCustomerReadRuntimeError>;
