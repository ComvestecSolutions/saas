/**
 * Run-as / acting-as banner state platform service (admin-app
 * implementation plan §9 item 14). Composes the existing manual
 * break-glass Postgres repository to derive a per-request banner
 * envelope for the current actor and emits one audit event per
 * `queryBanner` / `releaseGrant` call.
 *
 * Owner-locked invariants enforced HERE (not in any HTTP transport,
 * not in any app helper):
 *
 *   - **Anonymous actors short-circuit** to `{ active: false,
 *     releasable: false }` and emit NO audit (the banner simply
 *     does not render).
 *   - **Active-grant derivation** is read-only: the service calls
 *     `ManualBreakGlassRepository.listActiveForSubject(actorId)`,
 *     filters to grants that are still `active` under
 *     `computeStatusForNow(now)`, and returns the highest-priority
 *     match (latest issued). `secondsRemaining` is computed against
 *     the injected `Clock` so the shell does not have to clock-skew-
 *     compensate.
 *   - **`releasable` decision**: `true` iff the requesting actor is
 *     the `grantedTo` operator OR holds the `admin-owner`
 *     admin-org role (looked up via the same
 *     {@link AdminOrganizationRoleLookupPort} pattern used by the
 *     capability snapshot v2 service).
 *   - **Reason-catalog decode + action gating + attachment**: every
 *     `releaseGrant` call decodes the supplied `reason` against
 *     `ReasonCatalogIdSchema`, enforces
 *     `validateReasonForAction(reasonId, runAsBannerStateAuditAction.released)`,
 *     and rejects empty/whitespace `reasonAttachmentText` whenever
 *     the catalog entry declares `requiresAttachment: true` (the
 *     canonical run-as-banner-state.release entry does).
 *   - **Bounded short-TTL cache**: keyed by `actorId|tenantScope|
 *     tenantScopeId` and bounded by `cacheMaxSize` with the
 *     `cacheTtlSeconds` freshness window (≈ 5s by default).
 *     Cache is evicted on release.
 *
 * Runtime config: `runRunAsBannerStateFromEnvironment` decodes
 * `POSTGRES_URL` + `RUN_AS_BANNER_STATE_CACHE_MAX_SIZE` +
 * `RUN_AS_BANNER_STATE_CACHE_TTL_SECONDS` at the boundary with NO
 * local fallbacks.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  getReasonCatalogEntry,
  permissionScope,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  RunAsBannerStateInputSchema,
  RunAsBannerStateSchema,
  runAsBannerStateAuditAction,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  type RequestContext,
  type RunAsBannerState,
  type RunAsBannerStateInput,
} from "@comvestec/contracts";
import {
  adminMemberRole,
  type AdminMemberRole,
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  computeStatusForNow,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  manualBreakGlassGrantStatus,
  type ManualBreakGlassGrant,
  ManualBreakGlassRepository,
  type ManualBreakGlassRepositoryError,
  type ManualBreakGlassRepositoryService,
  makeManualBreakGlassRepositoryLayer,
  AdminOrganizationRepository,
  type AdminOrganizationRepositoryError,
  type AdminOrganizationRepositoryService,
  makeAdminOrganizationRepositoryLayer,
} from "@comvestec/modules";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "queryBanner" | "releaseGrant";

export class RunAsBannerStateUnauthorized {
  readonly _tag = "RunAsBannerStateUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class RunAsBannerStateMissingActorIdentity {
  readonly _tag = "RunAsBannerStateMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class RunAsBannerStateReasonNotInCatalog {
  readonly _tag = "RunAsBannerStateReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class RunAsBannerStateReasonActionMismatch {
  readonly _tag = "RunAsBannerStateReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class RunAsBannerStateReasonAttachmentRequired {
  readonly _tag = "RunAsBannerStateReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class RunAsBannerStateGrantNotFound {
  readonly _tag = "RunAsBannerStateGrantNotFound" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export class RunAsBannerStateGrantAlreadyReleased {
  readonly _tag = "RunAsBannerStateGrantAlreadyReleased" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export type RunAsBannerStateServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | ManualBreakGlassRepositoryError
  | AdminOrganizationRepositoryError
  | RunAsBannerStateUnauthorized
  | RunAsBannerStateMissingActorIdentity
  | RunAsBannerStateReasonNotInCatalog
  | RunAsBannerStateReasonActionMismatch
  | RunAsBannerStateReasonAttachmentRequired
  | RunAsBannerStateGrantNotFound
  | RunAsBannerStateGrantAlreadyReleased;

// ---------------------------------------------------------------------------
// AdminOrganizationRoleLookupPort
// (mirrors the capability snapshot v2 pattern — same surface name
// kept distinct here so the two services can swap injected ports
// independently)
// ---------------------------------------------------------------------------

export type RunAsBannerStateRoleLookupResult = {
  readonly role: AdminMemberRole | undefined;
};

export type RunAsBannerStateRoleLookupPortService = {
  readonly lookupRole: (input: {
    readonly actorId: string;
  }) => Effect.Effect<
    RunAsBannerStateRoleLookupResult,
    AdminOrganizationRepositoryError
  >;
};

export class RunAsBannerStateRoleLookupPort extends Context.Tag(
  "RunAsBannerStateRoleLookupPort",
)<RunAsBannerStateRoleLookupPort, RunAsBannerStateRoleLookupPortService>() {}

export const makeDefaultRunAsBannerStateRoleLookupPort = (
  repository: AdminOrganizationRepositoryService,
): RunAsBannerStateRoleLookupPortService => ({
  lookupRole: (input) =>
    repository.getMembershipByKeycloakSubjectId(input.actorId).pipe(
      Effect.map((opt) => ({
        role: Option.isSome(opt) ? opt.value.role : undefined,
      })),
    ),
});

export const makeDefaultRunAsBannerStateRoleLookupPortLayer = Layer.effect(
  RunAsBannerStateRoleLookupPort,
  Effect.gen(function* () {
    const repository = yield* AdminOrganizationRepository;
    return makeDefaultRunAsBannerStateRoleLookupPort(repository);
  }),
);

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

const decodeServiceInput = Schema.decodeUnknown(RunAsBannerStateInputSchema);
const decodeReasonCatalogIdValue = Schema.decodeUnknown(ReasonCatalogIdSchema);
const decodeBanner = Schema.decodeUnknown(RunAsBannerStateSchema);

// ---------------------------------------------------------------------------
// Reason helpers
// ---------------------------------------------------------------------------

const validateReason = (
  operation: Operation,
  value: string,
  action: AuditAction,
): Effect.Effect<
  ReasonCatalogId,
  RunAsBannerStateReasonNotInCatalog | RunAsBannerStateReasonActionMismatch
> =>
  decodeReasonCatalogIdValue(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new RunAsBannerStateReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new RunAsBannerStateReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

const requireAttachmentIfNeeded = (
  operation: Operation,
  reasonId: ReasonCatalogId,
  attachmentText: string | undefined,
): Effect.Effect<void, RunAsBannerStateReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText === undefined || attachmentText.trim().length === 0) {
    return Effect.fail(
      new RunAsBannerStateReasonAttachmentRequired({
        operation,
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

// ---------------------------------------------------------------------------
// Bounded cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type CacheEntry = {
  readonly value: RunAsBannerState;
  readonly cachedAtMs: number;
};

type BannerCache = {
  readonly get: (key: string) => CacheEntry | undefined;
  readonly set: (key: string, entry: CacheEntry) => void;
  readonly delete: (key: string) => void;
  readonly deleteByActor: (actorId: string) => number;
  readonly size: () => number;
};

const createBannerCache = (maxSize: number): BannerCache => {
  const store = new Map<string, CacheEntry>();
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
    deleteByActor: (actorId) => {
      const prefix = `${actorId}|`;
      let removed = 0;
      for (const key of [...store.keys()]) {
        if (key.startsWith(prefix)) {
          store.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    size: () => store.size,
  };
};

const buildCacheKey = (input: {
  readonly actorId: string;
  readonly requestContext: RequestContext;
}): string =>
  [
    input.actorId,
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
  ].join("|");

const isFresh = (cachedAtMs: number, nowMs: number, ttlSeconds: number) =>
  nowMs - cachedAtMs < ttlSeconds * 1000;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type RunAsBannerStateView = {
  readonly banner: RunAsBannerState;
  readonly fromCache: boolean;
};

export type RunAsBannerStateReleaseInput = {
  readonly requestContext: RequestContext;
  readonly grantId: string;
  readonly reason: string;
  readonly reasonAttachmentText?: string;
};

export type RunAsBannerStateReleaseResult = {
  readonly accepted: true;
  readonly grantId: string;
};

export type RunAsBannerStateServiceImpl = {
  readonly queryBanner: (
    input: RunAsBannerStateInput,
  ) => Effect.Effect<RunAsBannerStateView, RunAsBannerStateServiceError>;
  readonly releaseGrant: (
    input: RunAsBannerStateReleaseInput,
  ) => Effect.Effect<
    RunAsBannerStateReleaseResult,
    RunAsBannerStateServiceError
  >;
};

export class RunAsBannerStateService extends Context.Tag(
  "RunAsBannerStateService",
)<RunAsBannerStateService, RunAsBannerStateServiceImpl>() {}

export type RunAsBannerStateRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly cacheTtlSeconds: number;
};

export type RunAsBannerStateServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly breakGlassRepository: ManualBreakGlassRepositoryService;
  readonly roleLookupPort: RunAsBannerStateRoleLookupPortService;
  readonly bounds: RunAsBannerStateRuntimeBounds;
  readonly now?: () => Date;
};

const INACTIVE_BANNER: RunAsBannerState = { active: false, releasable: false };

export const makeRunAsBannerStateService = (
  deps: RunAsBannerStateServiceDependencies,
): RunAsBannerStateServiceImpl => {
  const { auditLog, breakGlassRepository, roleLookupPort, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const cache = createBannerCache(Math.max(1, bounds.cacheMaxSize));

  const buildActiveBanner = (
    grant: ManualBreakGlassGrant,
    releasable: boolean,
    nowMs: number,
  ): RunAsBannerState => {
    const expiresMs = new Date(grant.expiresAt).getTime();
    const secondsRemaining = Number.isFinite(expiresMs)
      ? Math.max(0, Math.floor((expiresMs - nowMs) / 1000))
      : 0;
    return {
      active: true,
      grantId: grant.id,
      actingAsActorId: grant.grantedTo,
      actingAsActorType: actorType.supportOperator,
      reasonId: grant.reasonCatalogId,
      reasonText: grant.reasonNarrative,
      grantedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
      secondsRemaining,
      releasable,
    };
  };

  const queryBanner: RunAsBannerStateServiceImpl["queryBanner"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeServiceInput(input);
      const { requestContext } = decoded;

      // Anonymous → inactive banner, NO audit.
      if (
        requestContext.actorType === actorType.anonymous ||
        requestContext.actorId === undefined
      ) {
        const banner = yield* decodeBanner(INACTIVE_BANNER);
        return { banner, fromCache: false } as const;
      }

      const actorId = requestContext.actorId;
      const cacheKey = buildCacheKey({ actorId, requestContext });
      const nowMs = nowFn().getTime();

      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        if (isFresh(cached.cachedAtMs, nowMs, bounds.cacheTtlSeconds)) {
          yield* auditLog.append({
            requestContext,
            moduleId: platformModuleId.runAsBannerState,
            action: runAsBannerStateAuditAction.queried,
            target: cached.value.grantId ?? actorId,
            reason: reasonCatalogId.runAsBannerStateRelease,
          });
          return { banner: cached.value, fromCache: true } as const;
        }
        cache.delete(cacheKey);
      }

      const rows = yield* breakGlassRepository.listActiveForSubject(actorId);
      const activeRows = rows
        .filter(
          (grant) =>
            computeStatusForNow(grant, nowMs) ===
            manualBreakGlassGrantStatus.active,
        )
        .slice()
        .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
      const candidate = activeRows[0];

      if (candidate === undefined) {
        const banner = yield* decodeBanner(INACTIVE_BANNER);
        cache.set(cacheKey, { value: banner, cachedAtMs: nowMs });
        yield* auditLog.append({
          requestContext,
          moduleId: platformModuleId.runAsBannerState,
          action: runAsBannerStateAuditAction.queried,
          target: actorId,
          reason: reasonCatalogId.runAsBannerStateRelease,
        });
        return { banner, fromCache: false } as const;
      }

      const isGrantee = candidate.grantedTo === actorId;
      let isAdminOwner = false;
      if (!isGrantee) {
        const lookup = yield* roleLookupPort.lookupRole({ actorId });
        isAdminOwner = lookup.role === adminMemberRole.adminOwner;
      }
      const releasable = isGrantee || isAdminOwner;

      const banner = yield* decodeBanner(
        buildActiveBanner(candidate, releasable, nowMs),
      );
      cache.set(cacheKey, { value: banner, cachedAtMs: nowMs });
      yield* auditLog.append({
        requestContext,
        moduleId: platformModuleId.runAsBannerState,
        action: runAsBannerStateAuditAction.queried,
        target: candidate.id,
        reason: reasonCatalogId.runAsBannerStateRelease,
      });
      return { banner, fromCache: false } as const;
    });

  const releaseGrant: RunAsBannerStateServiceImpl["releaseGrant"] = (input) =>
    Effect.gen(function* () {
      const { requestContext } = input;
      if (requestContext.actorId === undefined) {
        return yield* Effect.fail(
          new RunAsBannerStateMissingActorIdentity({
            operation: "releaseGrant",
          }),
        );
      }
      const actorId = requestContext.actorId;

      const validatedReason = yield* validateReason(
        "releaseGrant",
        input.reason,
        runAsBannerStateAuditAction.released,
      );
      yield* requireAttachmentIfNeeded(
        "releaseGrant",
        validatedReason,
        input.reasonAttachmentText,
      );

      const existingOption = yield* breakGlassRepository.getGrant(
        input.grantId,
      );
      if (Option.isNone(existingOption)) {
        return yield* Effect.fail(
          new RunAsBannerStateGrantNotFound({ id: input.grantId }),
        );
      }
      const existing = existingOption.value;

      const isGrantee = existing.grantedTo === actorId;
      let isAdminOwner = false;
      if (!isGrantee) {
        const lookup = yield* roleLookupPort.lookupRole({ actorId });
        isAdminOwner = lookup.role === adminMemberRole.adminOwner;
      }
      if (!isGrantee && !isAdminOwner) {
        return yield* Effect.fail(
          new RunAsBannerStateUnauthorized({
            operation: "releaseGrant",
            requestingActorId: actorId,
            requestingActorType: requestContext.actorType,
          }),
        );
      }

      const now = nowFn();
      const released = yield* breakGlassRepository
        .releaseGrant({
          id: input.grantId,
          releasedBy: actorId,
          releaseReasonCatalogId: validatedReason,
          releasedAt: now.toISOString(),
        })
        .pipe(
          Effect.catchTag("ManualBreakGlassGrantNotFoundError", (error) =>
            Effect.fail(
              new RunAsBannerStateGrantNotFound({ id: error.args.id }),
            ),
          ),
          Effect.catchTag(
            "ManualBreakGlassGrantAlreadyReleasedError",
            (error) =>
              Effect.fail(
                new RunAsBannerStateGrantAlreadyReleased({ id: error.args.id }),
              ),
          ),
        );

      cache.deleteByActor(existing.grantedTo);
      yield* auditLog.append({
        requestContext: { ...requestContext, reason: validatedReason },
        moduleId: platformModuleId.runAsBannerState,
        action: runAsBannerStateAuditAction.released,
        target: released.id,
        reason: validatedReason,
      });

      // `permissionScope.runAsBannerStateRead` is referenced so the
      // typed import stays load-bearing for downstream authorization
      // layers that may attach scope checks ahead of this service.
      void permissionScope.runAsBannerStateRead;

      return { accepted: true as const, grantId: released.id };
    });

  return { queryBanner, releaseGrant };
};

// Re-export schema-derived types so test files use the same view.
export type { RunAsBannerState, RunAsBannerStateInput };
export { RunAsBannerStateSchema };

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeRunAsBannerStateServiceLayer = (deps: {
  readonly bounds: RunAsBannerStateRuntimeBounds;
}) =>
  Layer.effect(
    RunAsBannerStateService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const breakGlassRepository = yield* ManualBreakGlassRepository;
      const roleLookupPort = yield* RunAsBannerStateRoleLookupPort;
      return makeRunAsBannerStateService({
        auditLog,
        breakGlassRepository,
        roleLookupPort,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const RunAsBannerStateProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  RUN_AS_BANNER_STATE_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  RUN_AS_BANNER_STATE_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeRunAsBannerStateProcessEnvironment = Schema.decodeUnknown(
  RunAsBannerStateProcessEnvironmentSchema,
);

export type RunAsBannerStateRuntimeOptions = {
  readonly postgresUrl: string;
  readonly bounds: RunAsBannerStateRuntimeBounds;
};

const resolveRunAsBannerStateRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeRunAsBannerStateProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): RunAsBannerStateRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        bounds: {
          cacheMaxSize: resolved.RUN_AS_BANNER_STATE_CACHE_MAX_SIZE,
          cacheTtlSeconds: resolved.RUN_AS_BANNER_STATE_CACHE_TTL_SECONDS,
        },
      }),
    ),
  );

const makeRunAsBannerStateRuntime = (options: RunAsBannerStateRuntimeOptions) =>
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
    const adminOrgRepositoryLayer =
      makeAdminOrganizationRepositoryLayer(writeDatabase);
    const baseLayer = Layer.mergeAll(
      makeManualBreakGlassRepositoryLayer(writeDatabase),
      adminOrgRepositoryLayer,
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      makeDefaultRunAsBannerStateRoleLookupPortLayer.pipe(
        Layer.provide(adminOrgRepositoryLayer),
      ),
    );
    const serviceLayer = makeRunAsBannerStateServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type RunAsBannerStateRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runRunAsBannerStateFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: RunAsBannerStateServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | RunAsBannerStateRuntimeError> =>
  resolveRunAsBannerStateRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeRunAsBannerStateRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(RunAsBannerStateService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | RunAsBannerStateRuntimeError>;
