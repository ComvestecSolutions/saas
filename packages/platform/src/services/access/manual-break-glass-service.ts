/**
 * Manual break-glass platform service (admin-app implementation
 * plan §9 item 5; `specs/02-apps/admin-app/spec.md` Break-glass +
 * RunAsBanner).
 *
 * Composes the {@link ManualBreakGlassRepository} (typed Postgres
 * persistence) with the {@link AuditLogModule} to expose the
 * canonical issue/release/list/lookup surface for manually issued,
 * short-lived elevated grants.
 *
 * Owner-locked cross-cutting invariants enforced here (NOT in the
 * repository):
 *
 *   - **Reason-catalog typed check**: `reasonCatalogId` on every
 *     mutation MUST decode against the central
 *     `ReasonCatalogIdSchema` literal union (typed, not a string
 *     compare). Failures surface as {@link BreakGlassReasonNotInCatalog}.
 *   - **TTL ceiling**: `expiresAt` MUST be strictly greater than
 *     `now` AND less than or equal to `now + maxTtlMinutes * 60_000`.
 *     Failures surface as {@link BreakGlassTtlExceeded}.
 *   - **Active-cap per support-operator**: a grant cannot be issued
 *     when the grantee already holds `>= maxActiveGrantsPerSupportOperator`
 *     active grants. Failures surface as
 *     {@link BreakGlassActiveLimitExceeded}.
 *   - **Actor authorization on issue**: only an actor whose
 *     `requestContext.actorType` is `platform-operator` may issue.
 *   - **Actor authorization on release**: either a `platform-operator`
 *     OR the original `grantedTo` subject may release a grant at any
 *     moment. Anyone else is rejected with
 *     {@link BreakGlassUnauthorized}.
 *   - **Audit emission**: every issue/release/autoExpire flushes one
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.manualBreakGlass`.
 *   - **Bounded in-memory cache**: `currentBreakGlassContextForActor`
 *     keeps a per-actor cache bounded by `cacheMaxSize` with
 *     insertion-order eviction. Cached entries are reconciled against
 *     `computeStatusForNow` so an expired cache hit is invalidated
 *     instead of returned.
 *
 * Runtime config: `runManualBreakGlassFromEnvironment` decodes
 * `POSTGRES_URL`, `MANUAL_BREAK_GLASS_MAX_TTL_MINUTES`,
 * `MANUAL_BREAK_GLASS_MAX_ACTIVE_GRANTS_PER_SUPPORT_OPERATOR`, and
 * `MANUAL_BREAK_GLASS_CACHE_MAX_SIZE` at the boundary with no local
 * fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  getReasonCatalogEntry,
  manualBreakGlassAuditAction,
  ManualBreakGlassGrantInputSchema,
  ManualBreakGlassReleaseInputSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type ManualBreakGlassGrant,
  type RequestContext,
} from "@comvestec/contracts";
import {
  type ManualBreakGlassRepositoryError,
  ManualBreakGlassRepository,
  type ManualBreakGlassRepositoryService,
  computeStatusForNow,
  manualBreakGlassGrantStatus,
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  makeManualBreakGlassRepositoryLayer,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "issue" | "release" | "list" | "get" | "lookup";

export class BreakGlassGrantNotFound {
  readonly _tag = "BreakGlassGrantNotFound" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export class BreakGlassGrantAlreadyReleased {
  readonly _tag = "BreakGlassGrantAlreadyReleased" as const;
  constructor(
    readonly args: { readonly id: string; readonly currentStatus: string },
  ) {}
}

export class BreakGlassGrantExpired {
  readonly _tag = "BreakGlassGrantExpired" as const;
  constructor(
    readonly args: { readonly id: string; readonly expiresAt: string },
  ) {}
}

export class BreakGlassTtlExceeded {
  readonly _tag = "BreakGlassTtlExceeded" as const;
  constructor(
    readonly args: {
      readonly expiresAt: string;
      readonly maxTtlMinutes: number;
      readonly nowIso: string;
    },
  ) {}
}

export class BreakGlassActiveLimitExceeded {
  readonly _tag = "BreakGlassActiveLimitExceeded" as const;
  constructor(
    readonly args: {
      readonly grantedTo: string;
      readonly activeCount: number;
      readonly maxActiveGrantsPerSupportOperator: number;
    },
  ) {}
}

export class BreakGlassReasonNotInCatalog {
  readonly _tag = "BreakGlassReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: "issue" | "release";
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class BreakGlassReasonActionMismatch {
  readonly _tag = "BreakGlassReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: "issue" | "release";
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class BreakGlassReasonAttachmentRequired {
  readonly _tag = "BreakGlassReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: "issue" | "release";
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class BreakGlassUnauthorized {
  readonly _tag = "BreakGlassUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class ManualBreakGlassMissingActorIdentity {
  readonly _tag = "ManualBreakGlassMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export type ManualBreakGlassServiceError =
  | ParseResult.ParseError
  | ManualBreakGlassRepositoryError
  | AuditLogModuleError
  | BreakGlassGrantNotFound
  | BreakGlassGrantAlreadyReleased
  | BreakGlassGrantExpired
  | BreakGlassTtlExceeded
  | BreakGlassActiveLimitExceeded
  | BreakGlassReasonNotInCatalog
  | BreakGlassReasonActionMismatch
  | BreakGlassReasonAttachmentRequired
  | BreakGlassUnauthorized
  | ManualBreakGlassMissingActorIdentity;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const IssueManualBreakGlassInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  grant: ManualBreakGlassGrantInputSchema,
});

export type IssueManualBreakGlassInput = Schema.Schema.Type<
  typeof IssueManualBreakGlassInputSchema
>;

export const ReleaseManualBreakGlassInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  release: ManualBreakGlassReleaseInputSchema,
});

export type ReleaseManualBreakGlassInput = Schema.Schema.Type<
  typeof ReleaseManualBreakGlassInputSchema
>;

export const ListActiveGrantsInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  subjectId: Schema.NonEmptyString,
});

export type ListActiveGrantsInput = Schema.Schema.Type<
  typeof ListActiveGrantsInputSchema
>;

export const LookupGrantInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  id: Schema.NonEmptyString,
});

export type LookupGrantInput = Schema.Schema.Type<
  typeof LookupGrantInputSchema
>;

export const CurrentContextInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  subjectId: Schema.NonEmptyString,
});

export type CurrentContextInput = Schema.Schema.Type<
  typeof CurrentContextInputSchema
>;

// ---------------------------------------------------------------------------
// Runtime options
// ---------------------------------------------------------------------------

export type ManualBreakGlassRuntimeBounds = {
  readonly maxTtlMinutes: number;
  readonly maxActiveGrantsPerSupportOperator: number;
  readonly cacheMaxSize: number;
};

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type ManualBreakGlassServiceImpl = {
  readonly issueGrant: (
    input: IssueManualBreakGlassInput,
  ) => Effect.Effect<ManualBreakGlassGrant, ManualBreakGlassServiceError>;
  readonly releaseGrant: (
    input: ReleaseManualBreakGlassInput,
  ) => Effect.Effect<ManualBreakGlassGrant, ManualBreakGlassServiceError>;
  readonly listActiveGrantsForSubject: (
    input: ListActiveGrantsInput,
  ) => Effect.Effect<
    ReadonlyArray<ManualBreakGlassGrant>,
    ManualBreakGlassServiceError
  >;
  readonly lookupGrant: (
    input: LookupGrantInput,
  ) => Effect.Effect<
    Option.Option<ManualBreakGlassGrant>,
    ManualBreakGlassServiceError
  >;
  readonly currentBreakGlassContextForActor: (
    input: CurrentContextInput,
  ) => Effect.Effect<
    Option.Option<ManualBreakGlassGrant>,
    ManualBreakGlassServiceError
  >;
  readonly autoExpireStaleGrants: (input: {
    readonly requestContext: RequestContext;
    readonly now?: Date;
  }) => Effect.Effect<ReadonlyArray<string>, ManualBreakGlassServiceError>;
};

export class ManualBreakGlassService extends Context.Tag(
  "ManualBreakGlassService",
)<ManualBreakGlassService, ManualBreakGlassServiceImpl>() {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const decodeIssueInput = Schema.decodeUnknown(IssueManualBreakGlassInputSchema);
const decodeReleaseInput = Schema.decodeUnknown(
  ReleaseManualBreakGlassInputSchema,
);
const decodeListInput = Schema.decodeUnknown(ListActiveGrantsInputSchema);
const decodeLookupInput = Schema.decodeUnknown(LookupGrantInputSchema);
const decodeCurrentContextInput = Schema.decodeUnknown(
  CurrentContextInputSchema,
);
const decodeReasonCatalogId = Schema.decodeUnknown(ReasonCatalogIdSchema);

const requireActorId = (
  requestContext: RequestContext,
  operation: Operation,
) => {
  if (requestContext.actorId === undefined) {
    return Effect.fail(new ManualBreakGlassMissingActorIdentity({ operation }));
  }
  return Effect.succeed(requestContext.actorId);
};

const requirePlatformOperator = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    const actorId = yield* requireActorId(requestContext, operation);
    if (requestContext.actorType !== actorType.platformOperator) {
      return yield* Effect.fail(
        new BreakGlassUnauthorized({
          operation,
          requestingActorId: actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return actorId;
  });

const validateReason = (
  operation: "issue" | "release",
  value: string,
  action: AuditAction,
): Effect.Effect<
  ReasonCatalogId,
  BreakGlassReasonNotInCatalog | BreakGlassReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new BreakGlassReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new BreakGlassReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

/**
 * Registry-driven attachment enforcement. When the reason-catalog
 * entry for `reasonId` declares `requiresAttachment: true`, the
 * service requires a non-blank `reasonAttachmentText`. The contracts
 * schema already rejects empty strings via `Schema.NonEmptyString`;
 * this helper additionally rejects whitespace-only values so the
 * audit row always carries a real runbook URL / ticket id /
 * incident reference.
 */
const requireAttachmentIfNeeded = (
  operation: "issue" | "release",
  reasonId: ReasonCatalogId,
  attachmentText: string,
): Effect.Effect<void, BreakGlassReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText.trim().length === 0) {
    return Effect.fail(
      new BreakGlassReasonAttachmentRequired({
        operation,
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

const appendAuditEvent = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: RequestContext;
    readonly action: (typeof manualBreakGlassAuditAction)[keyof typeof manualBreakGlassAuditAction];
    readonly target: string;
    readonly reason: (typeof reasonCatalogId)[keyof typeof reasonCatalogId];
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.manualBreakGlass,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

// Insertion-ordered LRU-by-insertion cache. Map preserves insertion
// order; eviction removes the oldest entry when the cache exceeds
// `maxSize`.
type GrantCache = {
  readonly get: (subjectId: string) => ManualBreakGlassGrant | undefined;
  readonly set: (subjectId: string, grant: ManualBreakGlassGrant) => void;
  readonly delete: (subjectId: string) => void;
  readonly size: () => number;
};

const createGrantCache = (maxSize: number): GrantCache => {
  const store = new Map<string, ManualBreakGlassGrant>();
  return {
    get: (subjectId) => store.get(subjectId),
    set: (subjectId, grant) => {
      if (store.has(subjectId)) {
        store.delete(subjectId);
      } else if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }
      store.set(subjectId, grant);
    },
    delete: (subjectId) => {
      store.delete(subjectId);
    },
    size: () => store.size,
  };
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeManualBreakGlassService = (
  repository: ManualBreakGlassRepositoryService,
  auditLog: AuditLogModuleService,
  bounds: ManualBreakGlassRuntimeBounds,
  options?: {
    readonly now?: () => Date;
  },
): ManualBreakGlassServiceImpl => {
  const cache = createGrantCache(Math.max(1, bounds.cacheMaxSize));
  const nowFn = options?.now ?? (() => new Date());

  const issueGrant: ManualBreakGlassServiceImpl["issueGrant"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeIssueInput(input);
      const grantingActorId = yield* requirePlatformOperator(
        decoded.requestContext,
        "issue",
      );
      const validatedReason = yield* validateReason(
        "issue",
        decoded.grant.reasonCatalogId,
        manualBreakGlassAuditAction.issue,
      );
      yield* requireAttachmentIfNeeded(
        "issue",
        validatedReason,
        decoded.grant.reasonAttachmentText,
      );
      const now = nowFn();
      const expiresAtMs = new Date(decoded.grant.expiresAt).getTime();
      const maxExpiresAtMs = now.getTime() + bounds.maxTtlMinutes * 60 * 1000;
      if (
        !Number.isFinite(expiresAtMs) ||
        expiresAtMs <= now.getTime() ||
        expiresAtMs > maxExpiresAtMs
      ) {
        return yield* Effect.fail(
          new BreakGlassTtlExceeded({
            expiresAt: decoded.grant.expiresAt,
            maxTtlMinutes: bounds.maxTtlMinutes,
            nowIso: now.toISOString(),
          }),
        );
      }

      const activeCount = yield* repository.countActiveForSubject(
        decoded.grant.grantedTo,
      );
      if (activeCount >= bounds.maxActiveGrantsPerSupportOperator) {
        return yield* Effect.fail(
          new BreakGlassActiveLimitExceeded({
            grantedTo: decoded.grant.grantedTo,
            activeCount,
            maxActiveGrantsPerSupportOperator:
              bounds.maxActiveGrantsPerSupportOperator,
          }),
        );
      }

      const created = yield* repository.issueGrant({
        grantedTo: decoded.grant.grantedTo,
        grantedBy: grantingActorId,
        targetTenant: decoded.grant.targetTenant,
        reasonCatalogId: validatedReason,
        reasonNarrative: decoded.grant.reasonNarrative,
        issuedAt: now.toISOString(),
        expiresAt: decoded.grant.expiresAt,
        correlationId: decoded.requestContext.correlationId,
      });

      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: manualBreakGlassAuditAction.issue,
        target: created.id,
        reason: reasonCatalogId.breakGlassIssue,
      });

      cache.delete(created.grantedTo);
      return created;
    });

  const releaseGrant: ManualBreakGlassServiceImpl["releaseGrant"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeReleaseInput(input);
      const actorId = yield* requireActorId(decoded.requestContext, "release");
      const validatedReason = yield* validateReason(
        "release",
        decoded.release.releaseReasonCatalogId,
        manualBreakGlassAuditAction.release,
      );

      const existingOption = yield* repository.getGrant(decoded.release.id);
      if (Option.isNone(existingOption)) {
        return yield* Effect.fail(
          new BreakGlassGrantNotFound({ id: decoded.release.id }),
        );
      }
      const existing = existingOption.value;
      const isPlatformOperator =
        decoded.requestContext.actorType === actorType.platformOperator;
      const isGrantee = actorId === existing.grantedTo;
      if (!isPlatformOperator && !isGrantee) {
        return yield* Effect.fail(
          new BreakGlassUnauthorized({
            operation: "release",
            requestingActorId: actorId,
            requestingActorType: decoded.requestContext.actorType,
          }),
        );
      }

      const now = nowFn();
      const released = yield* repository
        .releaseGrant({
          id: decoded.release.id,
          releasedBy: actorId,
          releaseReasonCatalogId: validatedReason,
          releasedAt: now.toISOString(),
        })
        .pipe(
          Effect.catchTag("ManualBreakGlassGrantNotFoundError", (error) =>
            Effect.fail(new BreakGlassGrantNotFound({ id: error.args.id })),
          ),
          Effect.catchTag(
            "ManualBreakGlassGrantAlreadyReleasedError",
            (error) =>
              Effect.fail(
                new BreakGlassGrantAlreadyReleased({
                  id: error.args.id,
                  currentStatus: error.args.currentStatus,
                }),
              ),
          ),
        );

      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: manualBreakGlassAuditAction.release,
        target: released.id,
        reason: reasonCatalogId.breakGlassRelease,
      });

      cache.delete(released.grantedTo);
      return released;
    });

  const listActiveGrantsForSubject: ManualBreakGlassServiceImpl["listActiveGrantsForSubject"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeListInput(input);
        yield* requireActorId(decoded.requestContext, "list");
        const rows = yield* repository.listActiveForSubject(decoded.subjectId);
        const now = nowFn().getTime();
        return rows.filter(
          (grant) =>
            computeStatusForNow(grant, now) ===
            manualBreakGlassGrantStatus.active,
        );
      });

  const lookupGrant: ManualBreakGlassServiceImpl["lookupGrant"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeLookupInput(input);
      yield* requireActorId(decoded.requestContext, "get");
      return yield* repository.getGrant(decoded.id);
    });

  const currentBreakGlassContextForActor: ManualBreakGlassServiceImpl["currentBreakGlassContextForActor"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeCurrentContextInput(input);
        yield* requireActorId(decoded.requestContext, "lookup");
        const nowMs = nowFn().getTime();
        const cached = cache.get(decoded.subjectId);
        if (
          cached !== undefined &&
          computeStatusForNow(cached, nowMs) ===
            manualBreakGlassGrantStatus.active
        ) {
          return Option.some(cached);
        }
        if (cached !== undefined) {
          cache.delete(decoded.subjectId);
        }
        const rows = yield* repository.listActiveForSubject(decoded.subjectId);
        const stillActive = rows.find(
          (grant) =>
            computeStatusForNow(grant, nowMs) ===
            manualBreakGlassGrantStatus.active,
        );
        if (stillActive === undefined) {
          return Option.none<ManualBreakGlassGrant>();
        }
        cache.set(decoded.subjectId, stillActive);
        return Option.some(stillActive);
      });

  const autoExpireStaleGrants: ManualBreakGlassServiceImpl["autoExpireStaleGrants"] =
    (input) =>
      Effect.gen(function* () {
        // Caller must be a platform operator — auto-expiry is a
        // governance action and must be auditable to a privileged
        // identity even when scheduled.
        yield* requirePlatformOperator(input.requestContext, "list");
        const now = input.now ?? nowFn();
        const expiredIds = yield* repository.autoExpireStaleGrants({ now });
        if (expiredIds.length === 0) {
          return expiredIds;
        }
        // Evict every cache entry that may have referenced a now-expired
        // grant. Worst-case the cache reloads on next lookup; this is
        // bounded by `cacheMaxSize`.
        // We do not know which subjects owned the expired ids without
        // re-querying, so flush by ids via target audit + leave per-
        // subject cache to its own expiry reconciliation in
        // `currentBreakGlassContextForActor`.
        yield* appendAuditEvent(auditLog, {
          requestContext: input.requestContext,
          action: manualBreakGlassAuditAction.autoExpire,
          target: expiredIds.join(","),
          reason: reasonCatalogId.breakGlassRelease,
        });
        return expiredIds;
      });

  return {
    issueGrant,
    releaseGrant,
    listActiveGrantsForSubject,
    lookupGrant,
    currentBreakGlassContextForActor,
    autoExpireStaleGrants,
  };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeManualBreakGlassServiceLayer = (
  bounds: ManualBreakGlassRuntimeBounds,
) =>
  Layer.effect(
    ManualBreakGlassService,
    Effect.gen(function* () {
      const repository = yield* ManualBreakGlassRepository;
      const auditLog = yield* AuditLogModule;
      return makeManualBreakGlassService(repository, auditLog, bounds);
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const ManualBreakGlassProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  MANUAL_BREAK_GLASS_MAX_TTL_MINUTES: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  MANUAL_BREAK_GLASS_MAX_ACTIVE_GRANTS_PER_SUPPORT_OPERATOR:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  MANUAL_BREAK_GLASS_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeManualBreakGlassProcessEnvironment = Schema.decodeUnknown(
  ManualBreakGlassProcessEnvironmentSchema,
);

export type ManualBreakGlassRuntimeOptions = {
  readonly postgresUrl: string;
  readonly bounds: ManualBreakGlassRuntimeBounds;
};

const resolveManualBreakGlassRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeManualBreakGlassProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): ManualBreakGlassRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        bounds: {
          maxTtlMinutes: resolved.MANUAL_BREAK_GLASS_MAX_TTL_MINUTES,
          maxActiveGrantsPerSupportOperator:
            resolved.MANUAL_BREAK_GLASS_MAX_ACTIVE_GRANTS_PER_SUPPORT_OPERATOR,
          cacheMaxSize: resolved.MANUAL_BREAK_GLASS_CACHE_MAX_SIZE,
        },
      }),
    ),
  );

const makeManualBreakGlassRuntime = (options: ManualBreakGlassRuntimeOptions) =>
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
    const baseLayer = Layer.mergeAll(
      makeManualBreakGlassRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
    );
    const serviceLayer = makeManualBreakGlassServiceLayer(options.bounds).pipe(
      Layer.provide(baseLayer),
    );
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type ManualBreakGlassRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runManualBreakGlassFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: ManualBreakGlassServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | ManualBreakGlassRuntimeError> =>
  resolveManualBreakGlassRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeManualBreakGlassRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(ManualBreakGlassService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
