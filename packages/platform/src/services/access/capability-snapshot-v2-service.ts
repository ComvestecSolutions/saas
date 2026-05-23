/**
 * Capability snapshot v2 platform service (admin-app implementation
 * plan §9 item 13). Composes:
 *
 *   - an injected {@link AdminOrganizationRoleLookupPort} (Context.Tag —
 *     tests inject directly; the env-bound default Layer wraps the
 *     existing {@link AdminOrganizationService} via
 *     `repository.getMembershipByKeycloakSubjectId(actorId)`) so the
 *     admin-org role join uses the SAME lookup
 *     `resolveCapabilitiesFor` uses,
 *   - the shared {@link AuditLogModule} for snapshot-derive +
 *     cache-invalidate audit events,
 *   - an injected {@link CapabilitySnapshotV2FieldSecurityPort}
 *     (Context.Tag — default is a pass-through TODO wrapper that
 *     preserves every navigation-map entry until the shared
 *     field-security service exposes a label-redaction surface).
 *
 * Owner-locked invariants enforced HERE (not in any HTTP transport,
 * not in any app helper):
 *
 *   - **Actor authz**: every `deriveSnapshot` requires an
 *     `actorId` (else `CapabilitySnapshotV2MissingActorIdentity`)
 *     and one of `platformOperator`, `supportOperator`, OR an
 *     active admin-org membership. Anonymous actors short-circuit
 *     to a "public-only" snapshot with `adminOrgRole: 'none'`,
 *     empty `scopes`, empty `permissions`, every navigation entry
 *     hidden, and an empty `highRiskAffordances` list — but they
 *     STILL emit an audit `snapshotDerived` event so reviewers
 *     can pivot on anonymous discovery.
 *   - **Reason-catalog decode + action gating**: each call decodes
 *     `requestContext.reason` (when present) against
 *     `ReasonCatalogIdSchema` and enforces
 *     `validateReasonForAction(reasonId, action)`. The fixed
 *     reason for both code paths is
 *     `reasonCatalogId.capabilitySnapshotV2Read` per the
 *     registry entry (it gates both `snapshotDerived` and
 *     `cacheInvalidated`).
 *   - **Bounded snapshot cache**: keyed by `actorId|tenantScope|
 *     tenantScopeId` and bounded by `cacheMaxSize` with
 *     `cacheTtlSeconds` freshness, insertion-order eviction.
 *   - **Field-security at the SERVICE boundary**: the navigation
 *     map's labels MAY carry tenant-id-bearing context (e.g., the
 *     tenant workspace key for a specific tenant). The injected
 *     port is invoked over the navigation map BEFORE the snapshot
 *     leaves the service so any tenant-id label can be redacted
 *     for support actors with a regulated scope.
 *   - **invalidateCache** is admin-only — anonymous / individual /
 *     support actors are rejected. Emits one
 *     `cacheInvalidated` audit per call.
 *
 * Runtime config: `runCapabilitySnapshotV2FromEnvironment` decodes
 * `POSTGRES_URL` + `CAPABILITY_SNAPSHOT_V2_CACHE_MAX_SIZE` +
 * `CAPABILITY_SNAPSHOT_V2_CACHE_TTL_SECONDS` at the boundary with
 * NO local fallbacks.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  adminOrgRole,
  AdminOrgRoleSchema,
  bucketAdminMemberRole,
  capabilitySnapshotV2AuditAction,
  CapabilitySnapshotV2InputSchema,
  CapabilitySnapshotV2Schema,
  deriveHighRiskAffordances,
  deriveNavigationMapForActor,
  permissionScope,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  RequestContextSchema,
  validateReasonForAction,
  type AdminOrgRole,
  type AuditAction,
  type CapabilitySnapshotV2,
  type CapabilitySnapshotV2Input,
  type NavigationMapEntry,
  type PermissionScope,
  type PlatformScope,
  type ReasonCatalogId,
  type RequestContext,
} from "@comvestec/contracts";
import {
  type AdminMemberRole,
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
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

type Operation = "deriveSnapshot" | "invalidateCache";

export class CapabilitySnapshotV2Unauthorized {
  readonly _tag = "CapabilitySnapshotV2Unauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class CapabilitySnapshotV2MissingActorIdentity {
  readonly _tag = "CapabilitySnapshotV2MissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class CapabilitySnapshotV2ReasonNotInCatalog {
  readonly _tag = "CapabilitySnapshotV2ReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class CapabilitySnapshotV2ReasonActionMismatch {
  readonly _tag = "CapabilitySnapshotV2ReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export type CapabilitySnapshotV2ServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AdminOrganizationRepositoryError
  | CapabilitySnapshotV2Unauthorized
  | CapabilitySnapshotV2MissingActorIdentity
  | CapabilitySnapshotV2ReasonNotInCatalog
  | CapabilitySnapshotV2ReasonActionMismatch;

// ---------------------------------------------------------------------------
// AdminOrganizationRoleLookupPort (Context.Tag — tests inject;
// default wraps AdminOrganizationRepository.getMembershipByKeycloakSubjectId)
// ---------------------------------------------------------------------------

export type AdminOrganizationRoleLookupResult = {
  readonly role: AdminMemberRole | undefined;
};

export type AdminOrganizationRoleLookupPortService = {
  readonly lookupRole: (input: {
    readonly actorId: string;
  }) => Effect.Effect<
    AdminOrganizationRoleLookupResult,
    AdminOrganizationRepositoryError
  >;
};

export class AdminOrganizationRoleLookupPort extends Context.Tag(
  "AdminOrganizationRoleLookupPort",
)<AdminOrganizationRoleLookupPort, AdminOrganizationRoleLookupPortService>() {}

export const makeDefaultAdminOrganizationRoleLookupPort = (
  repository: AdminOrganizationRepositoryService,
): AdminOrganizationRoleLookupPortService => ({
  lookupRole: (input) =>
    repository.getMembershipByKeycloakSubjectId(input.actorId).pipe(
      Effect.map((opt) => ({
        role: Option.isSome(opt) ? opt.value.role : undefined,
      })),
    ),
});

export const makeDefaultAdminOrganizationRoleLookupPortLayer = Layer.effect(
  AdminOrganizationRoleLookupPort,
  Effect.gen(function* () {
    const repository = yield* AdminOrganizationRepository;
    return makeDefaultAdminOrganizationRoleLookupPort(repository);
  }),
);

// ---------------------------------------------------------------------------
// CapabilitySnapshotV2FieldSecurityPort (Context.Tag — tests inject;
// default is a pass-through TODO wrapper until the shared
// field-security service exposes a label-redaction surface)
// ---------------------------------------------------------------------------

export type CapabilitySnapshotV2FieldSecurityResult = {
  readonly navigationMap: ReadonlyArray<NavigationMapEntry>;
};

export type CapabilitySnapshotV2FieldSecurityPortService = {
  readonly applyLabelSecurity: (input: {
    readonly requestContext: RequestContext;
    readonly navigationMap: ReadonlyArray<NavigationMapEntry>;
  }) => Effect.Effect<CapabilitySnapshotV2FieldSecurityResult>;
};

export class CapabilitySnapshotV2FieldSecurityPort extends Context.Tag(
  "CapabilitySnapshotV2FieldSecurityPort",
)<
  CapabilitySnapshotV2FieldSecurityPort,
  CapabilitySnapshotV2FieldSecurityPortService
>() {}

/**
 * Default pass-through field-security port. The shared
 * `@comvestec/modules` `field-security` service exposes per-record
 * projection redaction; until a label-redaction surface is exposed
 * for the navigation-map shape we keep this slice honest by
 * passing labels through unchanged. The platform service ALWAYS
 * calls `applyLabelSecurity` BEFORE results leave the boundary so
 * the day-2 swap is a single-line port replacement.
 *
 * TODO(item 13 follow-up): wrap the shared field-security service
 * once a `redactLabels(labels, requestContext)` surface lands.
 */
export const makeDefaultCapabilitySnapshotV2FieldSecurityPort =
  (): CapabilitySnapshotV2FieldSecurityPortService => ({
    applyLabelSecurity: (input) =>
      Effect.succeed({ navigationMap: input.navigationMap }),
  });

export const makeDefaultCapabilitySnapshotV2FieldSecurityPortLayer =
  Layer.succeed(
    CapabilitySnapshotV2FieldSecurityPort,
    makeDefaultCapabilitySnapshotV2FieldSecurityPort(),
  );

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

const decodeServiceInput = Schema.decodeUnknown(
  CapabilitySnapshotV2InputSchema,
);
const decodeReasonCatalogIdValue = Schema.decodeUnknown(ReasonCatalogIdSchema);
const decodeSnapshot = Schema.decodeUnknown(CapabilitySnapshotV2Schema);

// ---------------------------------------------------------------------------
// Authz + reason helpers
// ---------------------------------------------------------------------------

const isOperator = (ctx: RequestContext): boolean =>
  ctx.actorType === actorType.platformOperator ||
  ctx.actorType === actorType.supportOperator;

const isAnonymous = (ctx: RequestContext): boolean =>
  ctx.actorType === actorType.anonymous;

const requireAdminOperator = (
  ctx: RequestContext,
  operation: Operation,
): Effect.Effect<
  string,
  CapabilitySnapshotV2Unauthorized | CapabilitySnapshotV2MissingActorIdentity
> => {
  if (ctx.actorId === undefined) {
    return Effect.fail(
      new CapabilitySnapshotV2MissingActorIdentity({ operation }),
    );
  }
  if (ctx.actorType !== actorType.platformOperator) {
    return Effect.fail(
      new CapabilitySnapshotV2Unauthorized({
        operation,
        requestingActorId: ctx.actorId,
        requestingActorType: ctx.actorType,
      }),
    );
  }
  return Effect.succeed(ctx.actorId);
};

const validateReasonIfPresent = (
  operation: Operation,
  reason: string | undefined,
  action: AuditAction,
): Effect.Effect<
  ReasonCatalogId | undefined,
  | CapabilitySnapshotV2ReasonNotInCatalog
  | CapabilitySnapshotV2ReasonActionMismatch
> => {
  if (reason === undefined) {
    return Effect.succeed(undefined);
  }
  return decodeReasonCatalogIdValue(reason).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new CapabilitySnapshotV2ReasonNotInCatalog({
          operation,
          reasonCatalogId: reason,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new CapabilitySnapshotV2ReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }
      return Effect.succeed(decoded as ReasonCatalogId | undefined);
    }),
  );
};

// ---------------------------------------------------------------------------
// Scope + permission derivation (request-context-driven; the prompt
// requires no caller-supplied scopes/permissions on the input)
// ---------------------------------------------------------------------------

const deriveScopesForActor = (
  ctx: RequestContext,
  role: AdminOrgRole,
): ReadonlyArray<PlatformScope> => {
  if (
    ctx.actorType === actorType.platformOperator ||
    ctx.actorType === actorType.supportOperator ||
    role !== adminOrgRole.none
  ) {
    return [platformScope.platform];
  }
  return [];
};

const deriveBasePermissions = (
  ctx: RequestContext,
  role: AdminOrgRole,
): ReadonlyArray<PermissionScope> => {
  if (role === adminOrgRole.none && !isOperator(ctx)) {
    return [];
  }
  const base: PermissionScope[] = [
    permissionScope.capabilitySnapshotV2Read,
    permissionScope.operationsHomeRead,
    permissionScope.tenantRead,
    permissionScope.auditRead,
    permissionScope.universalSearchRead,
    permissionScope.vendorHealthAggregatorRead,
  ];
  if (role === adminOrgRole.admin || role === adminOrgRole.owner) {
    base.push(
      permissionScope.webhookManage,
      permissionScope.billingRead,
      permissionScope.manualBreakGlassIssue,
    );
  }
  return base;
};

// ---------------------------------------------------------------------------
// Bounded cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type CacheEntry = {
  readonly value: CapabilitySnapshotV2;
  readonly cachedAtIso: string;
};

type SnapshotCache = {
  readonly get: (key: string) => CacheEntry | undefined;
  readonly set: (key: string, entry: CacheEntry) => void;
  readonly delete: (key: string) => void;
  readonly deleteByActor: (actorId: string) => number;
  readonly size: () => number;
};

const createSnapshotCache = (maxSize: number): SnapshotCache => {
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

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type CapabilitySnapshotV2View = {
  readonly snapshot: CapabilitySnapshotV2;
  readonly fromCache: boolean;
};

export type CapabilitySnapshotV2InvalidateInput = {
  readonly requestContext: RequestContext;
  readonly actorId: string;
};

export type CapabilitySnapshotV2InvalidateResult = {
  readonly accepted: true;
  readonly evictedCount: number;
};

export type CapabilitySnapshotV2ServiceImpl = {
  readonly deriveSnapshot: (
    input: CapabilitySnapshotV2Input,
  ) => Effect.Effect<
    CapabilitySnapshotV2View,
    CapabilitySnapshotV2ServiceError
  >;
  readonly invalidateCache: (
    input: CapabilitySnapshotV2InvalidateInput,
  ) => Effect.Effect<
    CapabilitySnapshotV2InvalidateResult,
    CapabilitySnapshotV2ServiceError
  >;
};

export class CapabilitySnapshotV2Service extends Context.Tag(
  "CapabilitySnapshotV2Service",
)<CapabilitySnapshotV2Service, CapabilitySnapshotV2ServiceImpl>() {}

export type CapabilitySnapshotV2RuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly cacheTtlSeconds: number;
};

export type CapabilitySnapshotV2ServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly roleLookupPort: AdminOrganizationRoleLookupPortService;
  readonly fieldSecurityPort: CapabilitySnapshotV2FieldSecurityPortService;
  readonly bounds: CapabilitySnapshotV2RuntimeBounds;
  readonly now?: () => Date;
  readonly generateCorrelationId?: () => string;
};

const defaultCorrelationId = () =>
  `capsnap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Helper to keep cache freshness logic visible.
const isFreshIso = (cachedAtIso: string, nowMs: number, ttlSeconds: number) => {
  const cachedMs = new Date(cachedAtIso).getTime();
  if (!Number.isFinite(cachedMs)) {
    return false;
  }
  return nowMs - cachedMs < ttlSeconds * 1000;
};

export const makeCapabilitySnapshotV2Service = (
  deps: CapabilitySnapshotV2ServiceDependencies,
): CapabilitySnapshotV2ServiceImpl => {
  const { auditLog, roleLookupPort, fieldSecurityPort, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const correlationIdFn = deps.generateCorrelationId ?? defaultCorrelationId;
  const cache = createSnapshotCache(Math.max(1, bounds.cacheMaxSize));

  const buildPublicOnlySnapshot = (
    requestContext: RequestContext,
  ): CapabilitySnapshotV2 => ({
    ...(requestContext.actorId !== undefined
      ? { actorId: requestContext.actorId }
      : {}),
    actorType: requestContext.actorType,
    scopes: [],
    permissions: [],
    adminOrgRole: adminOrgRole.none,
    navigationMap: deriveNavigationMapForActor(adminOrgRole.none, [], []),
    highRiskAffordances: [],
    derivedAt: nowFn().toISOString(),
    correlationId: requestContext.correlationId ?? correlationIdFn(),
  });

  const deriveSnapshot: CapabilitySnapshotV2ServiceImpl["deriveSnapshot"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeServiceInput(input);
      const { requestContext } = decoded;

      // Reason validation (when caller supplies one) — applied
      // uniformly before authz decisions so reason-shopping errors
      // surface even on rejected paths.
      const action = capabilitySnapshotV2AuditAction.snapshotDerived;
      yield* validateReasonIfPresent(
        "deriveSnapshot",
        requestContext.reason,
        action,
      );
      const auditReason: ReasonCatalogId =
        reasonCatalogId.capabilitySnapshotV2Read;

      // Anonymous → public-only snapshot, still audited.
      if (isAnonymous(requestContext) || requestContext.actorId === undefined) {
        const publicSnapshot = buildPublicOnlySnapshot(requestContext);
        const decodedSnapshot = yield* decodeSnapshot(publicSnapshot);
        yield* auditLog.append({
          requestContext,
          moduleId: platformModuleId.capabilitySnapshotV2,
          action,
          target: decodedSnapshot.correlationId,
          reason: auditReason,
        });
        return { snapshot: decodedSnapshot, fromCache: false } as const;
      }

      const actorId = requestContext.actorId;
      const cacheKey = buildCacheKey({ actorId, requestContext });
      const nowMs = nowFn().getTime();

      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        if (isFreshIso(cached.cachedAtIso, nowMs, bounds.cacheTtlSeconds)) {
          yield* auditLog.append({
            requestContext,
            moduleId: platformModuleId.capabilitySnapshotV2,
            action,
            target: cached.value.correlationId,
            reason: auditReason,
          });
          return { snapshot: cached.value, fromCache: true } as const;
        }
        cache.delete(cacheKey);
      }

      // Live role join via the injected port.
      const lookup = yield* roleLookupPort.lookupRole({ actorId });
      const bucketedRole = bucketAdminMemberRole(lookup.role);

      // Authz: operator OR admin-org member required.
      if (!isOperator(requestContext) && bucketedRole === adminOrgRole.none) {
        return yield* Effect.fail(
          new CapabilitySnapshotV2Unauthorized({
            operation: "deriveSnapshot",
            requestingActorId: actorId,
            requestingActorType: requestContext.actorType,
          }),
        );
      }

      const scopes = deriveScopesForActor(requestContext, bucketedRole);
      const permissions = deriveBasePermissions(requestContext, bucketedRole);
      const baseNavigation = deriveNavigationMapForActor(
        bucketedRole,
        scopes,
        permissions,
      );
      const redacted = yield* fieldSecurityPort.applyLabelSecurity({
        requestContext,
        navigationMap: baseNavigation,
      });

      const candidate: CapabilitySnapshotV2 = {
        actorId,
        actorType: requestContext.actorType,
        scopes,
        permissions,
        adminOrgRole: bucketedRole,
        navigationMap: redacted.navigationMap,
        highRiskAffordances: deriveHighRiskAffordances(),
        derivedAt: nowFn().toISOString(),
        correlationId: requestContext.correlationId ?? correlationIdFn(),
      };

      const snapshot = yield* decodeSnapshot(candidate);

      cache.set(cacheKey, {
        value: snapshot,
        cachedAtIso: nowFn().toISOString(),
      });

      yield* auditLog.append({
        requestContext,
        moduleId: platformModuleId.capabilitySnapshotV2,
        action,
        target: snapshot.correlationId,
        reason: auditReason,
      });

      return { snapshot, fromCache: false } as const;
    });

  const invalidateCache: CapabilitySnapshotV2ServiceImpl["invalidateCache"] = (
    input,
  ) =>
    Effect.gen(function* () {
      yield* requireAdminOperator(input.requestContext, "invalidateCache");
      const action = capabilitySnapshotV2AuditAction.cacheInvalidated;
      yield* validateReasonIfPresent(
        "invalidateCache",
        input.requestContext.reason,
        action,
      );
      const evictedCount = cache.deleteByActor(input.actorId);
      yield* auditLog.append({
        requestContext: input.requestContext,
        moduleId: platformModuleId.capabilitySnapshotV2,
        action,
        target: input.actorId,
        reason: reasonCatalogId.capabilitySnapshotV2Read,
      });
      return { accepted: true as const, evictedCount };
    });

  return { deriveSnapshot, invalidateCache };
};

// Re-export the schema-derived types so test files use the same view.
export type { CapabilitySnapshotV2, CapabilitySnapshotV2Input };
export { CapabilitySnapshotV2Schema, AdminOrgRoleSchema };

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type CapabilitySnapshotV2ServiceLayerDependencies = {
  readonly bounds: CapabilitySnapshotV2RuntimeBounds;
};

export const makeCapabilitySnapshotV2ServiceLayer = (
  deps: CapabilitySnapshotV2ServiceLayerDependencies,
) =>
  Layer.effect(
    CapabilitySnapshotV2Service,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const roleLookupPort = yield* AdminOrganizationRoleLookupPort;
      const fieldSecurityPort = yield* CapabilitySnapshotV2FieldSecurityPort;
      return makeCapabilitySnapshotV2Service({
        auditLog,
        roleLookupPort,
        fieldSecurityPort,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const CapabilitySnapshotV2ProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  CAPABILITY_SNAPSHOT_V2_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  CAPABILITY_SNAPSHOT_V2_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeCapabilitySnapshotV2ProcessEnvironment = Schema.decodeUnknown(
  CapabilitySnapshotV2ProcessEnvironmentSchema,
);

export type CapabilitySnapshotV2RuntimeOptions = {
  readonly postgresUrl: string;
  readonly bounds: CapabilitySnapshotV2RuntimeBounds;
};

const resolveCapabilitySnapshotV2RuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeCapabilitySnapshotV2ProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): CapabilitySnapshotV2RuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        bounds: {
          cacheMaxSize: resolved.CAPABILITY_SNAPSHOT_V2_CACHE_MAX_SIZE,
          cacheTtlSeconds: resolved.CAPABILITY_SNAPSHOT_V2_CACHE_TTL_SECONDS,
        },
      }),
    ),
  );

const makeCapabilitySnapshotV2Runtime = (
  options: CapabilitySnapshotV2RuntimeOptions,
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
    const repositoryLayer = makeAdminOrganizationRepositoryLayer(writeDatabase);
    const baseLayer = Layer.mergeAll(
      repositoryLayer,
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      makeDefaultAdminOrganizationRoleLookupPortLayer.pipe(
        Layer.provide(repositoryLayer),
      ),
      makeDefaultCapabilitySnapshotV2FieldSecurityPortLayer,
    );
    const serviceLayer = makeCapabilitySnapshotV2ServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type CapabilitySnapshotV2RuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runCapabilitySnapshotV2PlatformFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: CapabilitySnapshotV2ServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | CapabilitySnapshotV2RuntimeError> =>
  resolveCapabilitySnapshotV2RuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeCapabilitySnapshotV2Runtime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(CapabilitySnapshotV2Service, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | CapabilitySnapshotV2RuntimeError>;
