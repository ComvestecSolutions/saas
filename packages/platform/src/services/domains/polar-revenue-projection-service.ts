/**
 * Polar revenue projection platform service (admin-app
 * implementation plan §9 item 7 — read-only, admin-only).
 *
 * Composes the {@link PolarRevenueProjectionRepository} (typed
 * Postgres persistence) with the {@link AuditLogModule} and an
 * injected {@link PolarApiClient} port that wraps the existing
 * Polar adapter via `platformAdapterServiceName.polar` /
 * `PolarAdapter`. Tests inject the port directly via
 * `Context.Tag`; the env-bound default layer constructs the
 * adapter through `makePolarAdapter`.
 *
 * Owner-locked invariants enforced here (NOT in the repository,
 * NOT in the HTTP transport):
 *
 *   - **Read-only surface**: the only mutation exposed is
 *     `requestBackfill`. Snapshot rows are computed by the
 *     service (which calls the Polar adapter through the
 *     {@link PolarApiClient} port) and persisted through
 *     `repository.upsertSnapshot`. Callers cannot mutate
 *     persisted values directly.
 *   - **Admin-only authz on backfill**: only
 *     `actorType.platformOperator` may invoke
 *     `requestBackfill`. Non-operators are rejected with
 *     {@link PolarRevenueProjectionUnauthorized}. Snapshot reads
 *     require any authenticated actor (`actorId` present);
 *     missing actor identity fails with
 *     {@link PolarRevenueProjectionMissingActorIdentity}.
 *   - **Reason catalog**: every backfill MUST carry a
 *     `reasonCatalogId` decoded against `ReasonCatalogIdSchema`.
 *     Failures surface as
 *     {@link PolarRevenueProjectionReasonNotInCatalog}.
 *   - **Audit emission**: every snapshot compute appends one
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.polarRevenueProjection` +
 *     `polarRevenueProjectionAuditAction.snapshotComputed`.
 *     Every operator-initiated backfill appends a second event
 *     keyed by `polarRevenueProjectionAuditAction.backfillRequested`
 *     with the operator-supplied reason. The reason on the
 *     `snapshotComputed` audit defaults to
 *     `reasonCatalogId.polarRevenueProjectionRead` so the
 *     scheduled-snapshot path is auditable too.
 *   - **Bounded latest-per-tenant snapshot cache**: keyed by
 *     `${tenant.scope}|${tenant.scopeId}` and bounded by
 *     `cacheMaxSize` with insertion-order eviction. The cache
 *     fronts `getLatestSnapshot` so the read surface stays bounded
 *     under burst, and is invalidated immediately on each
 *     successful `upsertSnapshot`.
 *   - **Snapshot freshness**: the read surface decorates each
 *     cached snapshot with `isSnapshotFresh(snapshot.computedAt,
 *     now, snapshotIntervalMinutes)` so the admin console can
 *     render a degraded "stale" badge and the operator can
 *     request a backfill via the only mutation surface.
 *
 * Runtime config: `runPolarRevenueProjectionFromEnvironment`
 * decodes `POSTGRES_URL` + `POLAR_API_BASE_URL` + `POLAR_ACCESS_TOKEN`
 * + `POLAR_REVENUE_PROJECTION_SNAPSHOT_INTERVAL_MINUTES` +
 * `POLAR_REVENUE_PROJECTION_HISTORY_RETENTION_DAYS` +
 * `POLAR_REVENUE_PROJECTION_CACHE_MAX_SIZE` at the boundary with
 * no local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  getReasonCatalogEntry,
  platformModuleId,
  polarRevenueProjectionAuditAction,
  PolarRevenueProjectionBackfillInputSchema,
  PolarRevenueProjectionQueryInputSchema,
  PolarRevenueProjectionTargetTenantSchema,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type PolarRevenueProjection,
  type PolarRevenueProjectionMoney,
  type PolarRevenueProjectionTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  isSnapshotFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makePolarRevenueProjectionRepositoryLayer,
  PolarRevenueProjectionRepository,
  type PolarRevenueProjectionRepositoryError,
  type PolarRevenueProjectionRepositoryService,
  type UpsertPolarRevenueProjectionSnapshotRepositoryInput,
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

type Operation = "getLatestSnapshot" | "requestBackfill";

export class PolarRevenueProjectionUnauthorized {
  readonly _tag = "PolarRevenueProjectionUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class PolarRevenueProjectionMissingActorIdentity {
  readonly _tag = "PolarRevenueProjectionMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class PolarRevenueProjectionReasonNotInCatalog {
  readonly _tag = "PolarRevenueProjectionReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: "requestBackfill";
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class PolarRevenueProjectionReasonActionMismatch {
  readonly _tag = "PolarRevenueProjectionReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: "requestBackfill";
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class PolarRevenueProjectionReasonAttachmentRequired {
  readonly _tag = "PolarRevenueProjectionReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: "requestBackfill";
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class PolarApiClientError {
  readonly _tag = "PolarApiClientError" as const;
  constructor(
    readonly args: {
      readonly operation: "fetchRevenueSnapshotSource";
      readonly tenant: PolarRevenueProjectionTargetTenant;
      readonly cause: unknown;
    },
  ) {}
}

export type PolarRevenueProjectionServiceError =
  | ParseResult.ParseError
  | PolarRevenueProjectionRepositoryError
  | AuditLogModuleError
  | PolarRevenueProjectionUnauthorized
  | PolarRevenueProjectionMissingActorIdentity
  | PolarRevenueProjectionReasonNotInCatalog
  | PolarRevenueProjectionReasonActionMismatch
  | PolarRevenueProjectionReasonAttachmentRequired
  | PolarApiClientError;

// ---------------------------------------------------------------------------
// PolarApiClient port (Context.Tag — tests inject directly; the env-bound
// default Layer wraps the existing Polar adapter)
// ---------------------------------------------------------------------------

/**
 * Raw snapshot source the Polar adapter resolves for a tenant +
 * billing period. The service converts this into the persisted
 * `UpsertPolarRevenueProjectionSnapshotRepositoryInput` envelope.
 */
export type PolarRevenueSnapshotSource = {
  readonly billingPeriodStart: string;
  readonly billingPeriodEnd: string;
  readonly subscriptionMrr: PolarRevenueProjectionMoney;
  readonly churnRate: number;
  readonly expansion: PolarRevenueProjectionMoney;
  readonly contraction: PolarRevenueProjectionMoney;
  readonly projectedNextPeriodRevenue: PolarRevenueProjectionMoney;
  readonly activeSubscriptionCount: number;
  readonly sourcePolarAccountId: string;
};

export type PolarApiClientService = {
  readonly fetchRevenueSnapshotSource: (input: {
    readonly tenant: PolarRevenueProjectionTargetTenant;
    readonly billingPeriodStart?: string;
  }) => Effect.Effect<PolarRevenueSnapshotSource, PolarApiClientError>;
};

export class PolarApiClient extends Context.Tag("PolarApiClient")<
  PolarApiClient,
  PolarApiClientService
>() {}

/**
 * Default {@link PolarApiClient} implementation that wraps the
 * existing {@link PolarAdapter} (`platformAdapterServiceName.polar`).
 * The first cut uses the adapter's healthcheck as a credential
 * probe and emits a zero-valued snapshot envelope sourced from the
 * tenant scope; the outbound revenue-aggregation dispatcher is a
 * future workflow-jobs concern that will swap this for live MRR /
 * churn / expansion data. Operators see an honest empty snapshot
 * with `computedAt = now` rather than a synthesized one.
 */
export const makeDefaultPolarApiClient = (
  adapter: PolarAdapterService,
): PolarApiClientService => ({
  fetchRevenueSnapshotSource: (input) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): PolarApiClientError =>
          new PolarApiClientError({
            operation: "fetchRevenueSnapshotSource",
            tenant: input.tenant,
            cause,
          }),
      ),
      Effect.map((): PolarRevenueSnapshotSource => {
        const billingPeriodStart =
          input.billingPeriodStart ?? new Date().toISOString();
        const billingPeriodEnd = new Date(
          new Date(billingPeriodStart).getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const zeroMoney: PolarRevenueProjectionMoney = {
          currency: "USD",
          amountMinorUnits: 0,
        };
        return {
          billingPeriodStart,
          billingPeriodEnd,
          subscriptionMrr: zeroMoney,
          churnRate: 0,
          expansion: zeroMoney,
          contraction: zeroMoney,
          projectedNextPeriodRevenue: zeroMoney,
          activeSubscriptionCount: 0,
          sourcePolarAccountId: `${input.tenant.scope}:${input.tenant.scopeId}`,
        };
      }),
    ),
});

export const makeDefaultPolarApiClientLayer = Layer.effect(
  PolarApiClient,
  PolarAdapter.pipe(Effect.map(makeDefaultPolarApiClient)),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const GetLatestPolarRevenueProjectionSnapshotInputSchema = Schema.Struct(
  {
    requestContext: RequestContextSchema,
    tenant: PolarRevenueProjectionTargetTenantSchema,
  },
);

export type GetLatestPolarRevenueProjectionSnapshotInput = Schema.Schema.Type<
  typeof GetLatestPolarRevenueProjectionSnapshotInputSchema
>;

export const RequestPolarRevenueProjectionBackfillInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  backfill: PolarRevenueProjectionBackfillInputSchema,
});

export type RequestPolarRevenueProjectionBackfillInput = Schema.Schema.Type<
  typeof RequestPolarRevenueProjectionBackfillInputSchema
>;

const decodeLatestInput = Schema.decodeUnknown(
  GetLatestPolarRevenueProjectionSnapshotInputSchema,
);
const decodeBackfillInput = Schema.decodeUnknown(
  RequestPolarRevenueProjectionBackfillInputSchema,
);
const decodeReasonCatalogId = Schema.decodeUnknown(ReasonCatalogIdSchema);

// Compile-time pin: confirm the contract `…QueryInputSchema` shape
// stays compatible with the read-input we accept at the service
// boundary (tenant + optional billingPeriodStart).
type _QueryInputCheck = Schema.Schema.Type<
  typeof PolarRevenueProjectionQueryInputSchema
>;

// ---------------------------------------------------------------------------
// Authz helpers
// ---------------------------------------------------------------------------

const requireActorId = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  requestContext.actorId === undefined
    ? Effect.fail(new PolarRevenueProjectionMissingActorIdentity({ operation }))
    : Effect.succeed(requestContext.actorId);

const requirePlatformOperator = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    const actorId = yield* requireActorId(requestContext, operation);
    if (requestContext.actorType !== actorType.platformOperator) {
      return yield* Effect.fail(
        new PolarRevenueProjectionUnauthorized({
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
  | PolarRevenueProjectionReasonNotInCatalog
  | PolarRevenueProjectionReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new PolarRevenueProjectionReasonNotInCatalog({
          operation: "requestBackfill",
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (
        !validateReasonForAction(
          decoded,
          polarRevenueProjectionAuditAction.backfillRequested,
        )
      ) {
        return Effect.fail(
          new PolarRevenueProjectionReasonActionMismatch({
            operation: "requestBackfill",
            reasonCatalogId: decoded,
            auditAction: polarRevenueProjectionAuditAction.backfillRequested,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

/**
 * Registry-driven attachment enforcement. The backfill reason gates
 * against `reasonCatalogId.polarRevenueProjectionBackfill`
 * (`requiresAttachment: true`). Whitespace-only attachment text is
 * rejected even though the contract schema enforces
 * `Schema.NonEmptyString`.
 */
const requireBackfillAttachmentIfNeeded = (
  reasonId: ReasonCatalogId,
  attachmentText: string,
): Effect.Effect<void, PolarRevenueProjectionReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText.trim().length === 0) {
    return Effect.fail(
      new PolarRevenueProjectionReasonAttachmentRequired({
        operation: "requestBackfill",
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

// ---------------------------------------------------------------------------
// Bounded latest-per-tenant snapshot cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type SnapshotCache = {
  readonly get: (key: string) => PolarRevenueProjection | undefined;
  readonly set: (key: string, snapshot: PolarRevenueProjection) => void;
  readonly delete: (key: string) => void;
  readonly size: () => number;
};

const createSnapshotCache = (maxSize: number): SnapshotCache => {
  const store = new Map<string, PolarRevenueProjection>();
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

const tenantCacheKey = (tenant: PolarRevenueProjectionTargetTenant) =>
  `${tenant.scope}|${tenant.scopeId}`;

const appendAuditEvent = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: RequestContext;
    readonly action: (typeof polarRevenueProjectionAuditAction)[keyof typeof polarRevenueProjectionAuditAction];
    readonly target: string;
    readonly reason: (typeof reasonCatalogId)[keyof typeof reasonCatalogId];
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.polarRevenueProjection,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type PolarRevenueProjectionSnapshotView = {
  readonly snapshot: PolarRevenueProjection;
  readonly isFresh: boolean;
};

export type PolarRevenueProjectionServiceImpl = {
  readonly getLatestSnapshot: (
    input: GetLatestPolarRevenueProjectionSnapshotInput,
  ) => Effect.Effect<
    Option.Option<PolarRevenueProjectionSnapshotView>,
    PolarRevenueProjectionServiceError
  >;
  readonly requestBackfill: (
    input: RequestPolarRevenueProjectionBackfillInput,
  ) => Effect.Effect<
    { readonly accepted: true; readonly snapshot: PolarRevenueProjection },
    PolarRevenueProjectionServiceError
  >;
};

export class PolarRevenueProjectionService extends Context.Tag(
  "PolarRevenueProjectionService",
)<PolarRevenueProjectionService, PolarRevenueProjectionServiceImpl>() {}

export type PolarRevenueProjectionRuntimeBounds = {
  readonly snapshotIntervalMinutes: number;
  readonly historyRetentionDays: number;
  readonly cacheMaxSize: number;
};

export type PolarRevenueProjectionServiceDependencies = {
  readonly repository: PolarRevenueProjectionRepositoryService;
  readonly auditLog: AuditLogModuleService;
  readonly polarApiClient: PolarApiClientService;
  readonly bounds: PolarRevenueProjectionRuntimeBounds;
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
    "globalThis.crypto.randomUUID is required to generate polar-revenue-projection correlation ids",
  );
};

export const makePolarRevenueProjectionService = (
  deps: PolarRevenueProjectionServiceDependencies,
): PolarRevenueProjectionServiceImpl => {
  const { repository, auditLog, polarApiClient, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const correlationIdFn = deps.generateCorrelationId ?? defaultCorrelationId;
  const cache = createSnapshotCache(Math.max(1, bounds.cacheMaxSize));

  const getLatestSnapshot: PolarRevenueProjectionServiceImpl["getLatestSnapshot"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeLatestInput(input);
        yield* requireActorId(decoded.requestContext, "getLatestSnapshot");

        const cacheKey = tenantCacheKey(decoded.tenant);
        const cached = cache.get(cacheKey);
        if (cached !== undefined) {
          return Option.some({
            snapshot: cached,
            isFresh: isSnapshotFresh(
              cached.computedAt,
              nowFn().getTime(),
              bounds.snapshotIntervalMinutes,
            ),
          });
        }

        const fromRepo = yield* repository.getLatestForTenant(decoded.tenant);
        if (Option.isNone(fromRepo)) {
          return Option.none<PolarRevenueProjectionSnapshotView>();
        }
        cache.set(cacheKey, fromRepo.value);
        return Option.some({
          snapshot: fromRepo.value,
          isFresh: isSnapshotFresh(
            fromRepo.value.computedAt,
            nowFn().getTime(),
            bounds.snapshotIntervalMinutes,
          ),
        });
      });

  const requestBackfill: PolarRevenueProjectionServiceImpl["requestBackfill"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeBackfillInput(input);
        yield* requirePlatformOperator(
          decoded.requestContext,
          "requestBackfill",
        );
        const reason = yield* validateBackfillReason(
          decoded.backfill.reasonCatalogId,
        );
        yield* requireBackfillAttachmentIfNeeded(
          reason,
          decoded.backfill.reasonAttachmentText,
        );

        const source = yield* polarApiClient.fetchRevenueSnapshotSource({
          tenant: decoded.backfill.tenant,
          ...(decoded.backfill.billingPeriodStart !== undefined
            ? { billingPeriodStart: decoded.backfill.billingPeriodStart }
            : {}),
        });

        const computedAt = nowFn().toISOString();
        const upsertInput: UpsertPolarRevenueProjectionSnapshotRepositoryInput =
          {
            tenant: decoded.backfill.tenant,
            billingPeriodStart: source.billingPeriodStart,
            billingPeriodEnd: source.billingPeriodEnd,
            subscriptionMrr: source.subscriptionMrr,
            churnRate: source.churnRate,
            expansion: source.expansion,
            contraction: source.contraction,
            projectedNextPeriodRevenue: source.projectedNextPeriodRevenue,
            activeSubscriptionCount: source.activeSubscriptionCount,
            sourcePolarAccountId: source.sourcePolarAccountId,
            computedAt,
            correlationId:
              decoded.requestContext.correlationId ?? correlationIdFn(),
          };

        const snapshot = yield* repository.upsertSnapshot(upsertInput);

        // Invalidate cache so the next read picks up the fresh row.
        cache.delete(tenantCacheKey(decoded.backfill.tenant));
        cache.set(tenantCacheKey(decoded.backfill.tenant), snapshot);

        yield* appendAuditEvent(auditLog, {
          requestContext: decoded.requestContext,
          action: polarRevenueProjectionAuditAction.snapshotComputed,
          target: snapshot.id,
          reason: reasonCatalogId.polarRevenueProjectionRead,
        });
        yield* appendAuditEvent(auditLog, {
          requestContext: decoded.requestContext,
          action: polarRevenueProjectionAuditAction.backfillRequested,
          target: snapshot.id,
          reason,
        });

        return { accepted: true as const, snapshot };
      });

  return {
    getLatestSnapshot,
    requestBackfill,
  };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type PolarRevenueProjectionServiceLayerDependencies = {
  readonly bounds: PolarRevenueProjectionRuntimeBounds;
};

export const makePolarRevenueProjectionServiceLayer = (
  deps: PolarRevenueProjectionServiceLayerDependencies,
) =>
  Layer.effect(
    PolarRevenueProjectionService,
    Effect.gen(function* () {
      const repository = yield* PolarRevenueProjectionRepository;
      const auditLog = yield* AuditLogModule;
      const polarApiClient = yield* PolarApiClient;
      return makePolarRevenueProjectionService({
        repository,
        auditLog,
        polarApiClient,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const PolarRevenueProjectionProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  POLAR_API_BASE_URL: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_REVENUE_PROJECTION_SNAPSHOT_INTERVAL_MINUTES:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  POLAR_REVENUE_PROJECTION_HISTORY_RETENTION_DAYS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  POLAR_REVENUE_PROJECTION_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodePolarRevenueProjectionProcessEnvironment = Schema.decodeUnknown(
  PolarRevenueProjectionProcessEnvironmentSchema,
);

export type PolarRevenueProjectionRuntimeOptions = {
  readonly postgresUrl: string;
  readonly polarApiBaseUrl: string;
  readonly polarAccessToken: string;
  readonly bounds: PolarRevenueProjectionRuntimeBounds;
};

const resolvePolarRevenueProjectionRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodePolarRevenueProjectionProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): PolarRevenueProjectionRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        polarApiBaseUrl: resolved.POLAR_API_BASE_URL,
        polarAccessToken: resolved.POLAR_ACCESS_TOKEN,
        bounds: {
          snapshotIntervalMinutes:
            resolved.POLAR_REVENUE_PROJECTION_SNAPSHOT_INTERVAL_MINUTES,
          historyRetentionDays:
            resolved.POLAR_REVENUE_PROJECTION_HISTORY_RETENTION_DAYS,
          cacheMaxSize: resolved.POLAR_REVENUE_PROJECTION_CACHE_MAX_SIZE,
        },
      }),
    ),
  );

const makePolarRevenueProjectionRuntime = (
  options: PolarRevenueProjectionRuntimeOptions,
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
      apiKey: options.polarAccessToken,
      apiUrl: options.polarApiBaseUrl,
    });
    const polarApiClientLayer = makeDefaultPolarApiClientLayer.pipe(
      Layer.provide(Layer.succeed(PolarAdapter, polarAdapter)),
    );
    const baseLayer = Layer.mergeAll(
      makePolarRevenueProjectionRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      polarApiClientLayer,
    );
    const serviceLayer = makePolarRevenueProjectionServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type PolarRevenueProjectionRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | PolarAdapterError;

export const runPolarRevenueProjectionFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: PolarRevenueProjectionServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | PolarRevenueProjectionRuntimeError> =>
  resolvePolarRevenueProjectionRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makePolarRevenueProjectionRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(PolarRevenueProjectionService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
