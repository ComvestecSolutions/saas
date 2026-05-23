/**
 * Tenant workspace aggregate v2 platform service (admin-app
 * implementation plan §9 item 4; Desk Center Workbench
 * `/r/tenant/<id>` Tenant workspace section of
 * `specs/02-apps/admin-app/spec.md`).
 *
 * Produces the single payload the admin-app desk loads on
 * `/r/tenant/<id>` by fanning out to multiple tenant-scoped
 * sources concurrently (overview, members, recent activity,
 * open incidents, usage spotlights, pending approvals). Each
 * source is invoked through a typed source-port Context.Tag so
 * tests can inject deterministic fakes; per-section failures
 * degrade to an empty section + a typed `partialFailures` entry
 * rather than failing the whole snapshot. Only when every
 * source fails does the service fail with
 * `TenantWorkspaceUnavailable`.
 *
 * Tenant-isolation invariant (NEW vs Operations Home aggregate):
 *   - Every getSnapshot call must target a tenant. The trusted
 *     `requestContext.tenant` must equal the input `tenant` OR
 *     the actor must be a `platform-operator` (whose session is
 *     scoped to the platform tenant by construction and is
 *     allowed to inspect any tenant).
 *   - Mismatches fail with
 *     `TenantWorkspaceCrossTenantAccessDenied` BEFORE any source
 *     is invoked and BEFORE any audit event is emitted, so a
 *     cross-tenant probe cannot be observed via the desk pivot
 *     trail.
 *
 * Each successful read emits a single
 * `reasonCatalogId.tenantWorkspaceRead` audit event keyed by
 * `platformModuleId.tenantWorkspace` + `tenantWorkspaceAuditAction.read`
 * targeting the inspected `tenant.scopeId` so reviewers can
 * pivot on tenant-workspace inspections without re-deriving
 * cross-module audit trails.
 *
 * VENDOR-SOURCE STATUS (Phase 1 item 4):
 *   - Tenant-overview source → **stubbed** via
 *     {@link TenantWorkspaceOverviewSource}. // TODO(phase1-item-4):
 *     wire to tenant-management (displayName, planTier, support
 *     tier), tenant-branding (brandingState), billing-and-metering
 *     (openInvoiceCount, currentMau), and retention-legal-hold
 *     (legalHoldActive) once those tenant-scoped projections ship.
 *   - Members source → **stubbed** via
 *     {@link TenantWorkspaceMembersSource}. // TODO(phase1-item-4):
 *     wire to tenant-management memberships projection + identity-
 *     session lastSeenAt projection.
 *   - Recent activity source → **stubbed** via
 *     {@link TenantWorkspaceRecentActivitySource}. // TODO(phase1-
 *     item-4): wire to `AuditLogModule.queryByTenant` with a
 *     bounded limit once the audit-log module exposes a recent-
 *     ordered tenant-scoped query (currently returns
 *     newest-first via `desc(recordedAt)`, but the service-level
 *     limit needs a typed surface).
 *   - Open incidents source → **stubbed** via
 *     {@link TenantWorkspaceOpenIncidentsSource}. // TODO(phase1-
 *     item-4): wire to per-vendor incident adapters (GlitchTip,
 *     Polar disputes, etc.) reusing
 *     `platformAdapterServiceName.*` once vendor incident lists
 *     expose tenant-scoped filters.
 *   - Usage spotlights source → **stubbed** via
 *     {@link TenantWorkspaceUsageSpotlightsSource}. // TODO
 *     (phase1-item-4): wire to OpenMeter usage queries scoped
 *     to the tenant + billing-and-metering quotas.
 *   - Pending tenant-approvals source → **stubbed** via
 *     {@link TenantWorkspacePendingApprovalsSource}. // TODO
 *     (phase1-item-4): wire to the approval-workflow service
 *     once it ships (also blocks Operations Home aggregate v2).
 */
import { Context, Effect, Either, Layer, ParseResult, Schema } from "effect";
import {
  actorType,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  TenantContextSchema,
  TenantWorkspaceSnapshotSchema,
  tenantWorkspaceAuditAction,
  tenantWorkspaceSnapshotSection,
  type RequestContext,
  type TenantContext,
  type TenantWorkspaceMember,
  type TenantWorkspaceOpenIncident,
  type TenantWorkspaceOverview,
  type TenantWorkspacePartialFailure,
  type TenantWorkspacePendingApproval,
  type TenantWorkspaceRecentActivityEntry,
  type TenantWorkspaceSnapshot,
  type TenantWorkspaceSnapshotSection,
  type TenantWorkspaceUsageSpotlight,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import { and, desc, eq } from "drizzle-orm";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class TenantWorkspaceSourceUnavailable {
  readonly _tag = "TenantWorkspaceSourceUnavailable" as const;
  constructor(
    readonly args: {
      readonly section: TenantWorkspaceSnapshotSection;
      readonly reason: string;
    },
  ) {}
}

export class TenantWorkspaceUnavailable {
  readonly _tag = "TenantWorkspaceUnavailable" as const;
  constructor(
    readonly args: {
      readonly failures: ReadonlyArray<TenantWorkspacePartialFailure>;
    },
  ) {}
}

export class TenantWorkspaceMissingActorIdentity {
  readonly _tag = "TenantWorkspaceMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: "getSnapshot" }) {}
}

export class TenantWorkspaceCrossTenantAccessDenied {
  readonly _tag = "TenantWorkspaceCrossTenantAccessDenied" as const;
  constructor(
    readonly args: {
      readonly requestContextTenant: TenantContext;
      readonly inputTenant: TenantContext;
    },
  ) {}
}

export type TenantWorkspaceServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | TenantWorkspaceUnavailable
  | TenantWorkspaceMissingActorIdentity
  | TenantWorkspaceCrossTenantAccessDenied;

// ---------------------------------------------------------------------------
// Source ports
// ---------------------------------------------------------------------------

export type TenantWorkspaceSourceContext = {
  readonly windowMinutes: number;
  readonly requestContext: RequestContext;
  readonly tenant: TenantContext;
};

export type TenantWorkspaceOverviewSourceService = {
  readonly fetch: (
    context: TenantWorkspaceSourceContext,
  ) => Effect.Effect<TenantWorkspaceOverview, TenantWorkspaceSourceUnavailable>;
};

export class TenantWorkspaceOverviewSource extends Context.Tag(
  "TenantWorkspaceOverviewSource",
)<TenantWorkspaceOverviewSource, TenantWorkspaceOverviewSourceService>() {}

export type TenantWorkspaceMembersSourceContext =
  TenantWorkspaceSourceContext & {
    readonly limit: number;
  };

export type TenantWorkspaceMembersSourceService = {
  readonly fetch: (
    context: TenantWorkspaceMembersSourceContext,
  ) => Effect.Effect<
    readonly TenantWorkspaceMember[],
    TenantWorkspaceSourceUnavailable
  >;
};

export class TenantWorkspaceMembersSource extends Context.Tag(
  "TenantWorkspaceMembersSource",
)<TenantWorkspaceMembersSource, TenantWorkspaceMembersSourceService>() {}

export type TenantWorkspaceRecentActivitySourceContext =
  TenantWorkspaceSourceContext & {
    readonly limit: number;
  };

export type TenantWorkspaceRecentActivitySourceService = {
  readonly fetch: (
    context: TenantWorkspaceRecentActivitySourceContext,
  ) => Effect.Effect<
    readonly TenantWorkspaceRecentActivityEntry[],
    TenantWorkspaceSourceUnavailable
  >;
};

export class TenantWorkspaceRecentActivitySource extends Context.Tag(
  "TenantWorkspaceRecentActivitySource",
)<
  TenantWorkspaceRecentActivitySource,
  TenantWorkspaceRecentActivitySourceService
>() {}

export type TenantWorkspaceOpenIncidentsSourceService = {
  readonly fetch: (
    context: TenantWorkspaceSourceContext,
  ) => Effect.Effect<
    readonly TenantWorkspaceOpenIncident[],
    TenantWorkspaceSourceUnavailable
  >;
};

export class TenantWorkspaceOpenIncidentsSource extends Context.Tag(
  "TenantWorkspaceOpenIncidentsSource",
)<
  TenantWorkspaceOpenIncidentsSource,
  TenantWorkspaceOpenIncidentsSourceService
>() {}

export type TenantWorkspaceUsageSpotlightsSourceService = {
  readonly fetch: (
    context: TenantWorkspaceSourceContext,
  ) => Effect.Effect<
    readonly TenantWorkspaceUsageSpotlight[],
    TenantWorkspaceSourceUnavailable
  >;
};

export class TenantWorkspaceUsageSpotlightsSource extends Context.Tag(
  "TenantWorkspaceUsageSpotlightsSource",
)<
  TenantWorkspaceUsageSpotlightsSource,
  TenantWorkspaceUsageSpotlightsSourceService
>() {}

export type TenantWorkspacePendingApprovalsSourceService = {
  readonly fetch: (
    context: TenantWorkspaceSourceContext,
  ) => Effect.Effect<
    readonly TenantWorkspacePendingApproval[],
    TenantWorkspaceSourceUnavailable
  >;
};

export class TenantWorkspacePendingApprovalsSource extends Context.Tag(
  "TenantWorkspacePendingApprovalsSource",
)<
  TenantWorkspacePendingApprovalsSource,
  TenantWorkspacePendingApprovalsSourceService
>() {}

// ---------------------------------------------------------------------------
// Service input
// ---------------------------------------------------------------------------

export const GetTenantWorkspaceSnapshotInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  tenant: TenantContextSchema,
  windowMinutes: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
  membersLimit: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
  recentActivityLimit: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
});

export type GetTenantWorkspaceSnapshotInput = Schema.Schema.Type<
  typeof GetTenantWorkspaceSnapshotInputSchema
>;

const DEFAULT_WINDOW_MINUTES = 1440;
const DEFAULT_MEMBERS_LIMIT = 20;
const DEFAULT_RECENT_ACTIVITY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type TenantWorkspaceServiceImpl = {
  readonly getSnapshot: (
    input: GetTenantWorkspaceSnapshotInput,
  ) => Effect.Effect<TenantWorkspaceSnapshot, TenantWorkspaceServiceError>;
};

export class TenantWorkspaceService extends Context.Tag(
  "TenantWorkspaceService",
)<TenantWorkspaceService, TenantWorkspaceServiceImpl>() {}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const decodeInput = Schema.decodeUnknown(GetTenantWorkspaceSnapshotInputSchema);
const decodeSnapshot = Schema.decodeUnknown(TenantWorkspaceSnapshotSchema);

type SectionResult<T> = {
  readonly section: TenantWorkspaceSnapshotSection;
  readonly result: Either.Either<T, TenantWorkspaceSourceUnavailable>;
};

const sectionToEither = <T>(
  section: TenantWorkspaceSnapshotSection,
  effect: Effect.Effect<T, TenantWorkspaceSourceUnavailable>,
): Effect.Effect<SectionResult<T>> =>
  Effect.either(effect).pipe(Effect.map((result) => ({ section, result })));

const collectPartialFailures = (
  results: ReadonlyArray<SectionResult<unknown>>,
): ReadonlyArray<TenantWorkspacePartialFailure> => {
  const failures: TenantWorkspacePartialFailure[] = [];
  for (const entry of results) {
    if (Either.isLeft(entry.result)) {
      failures.push({
        section: entry.section,
        reason: entry.result.left.args.reason,
      });
    }
  }
  return failures;
};

const unwrapArrayOrEmpty = <T>(
  result: Either.Either<readonly T[], TenantWorkspaceSourceUnavailable>,
): readonly T[] =>
  Either.match(result, {
    onLeft: () => [] as readonly T[],
    onRight: (value) => value,
  });

const unwrapOverviewOrNull = (
  result: Either.Either<
    TenantWorkspaceOverview,
    TenantWorkspaceSourceUnavailable
  >,
): TenantWorkspaceOverview | null =>
  Either.match(result, {
    onLeft: () => null,
    onRight: (value) => value,
  });

const isSameTenant = (left: TenantContext, right: TenantContext): boolean =>
  left.scope === right.scope && left.scopeId === right.scopeId;

const isPlatformOperator = (requestContext: RequestContext): boolean =>
  requestContext.actorType === actorType.platformOperator;

export const makeTenantWorkspaceService = (
  audit: AuditLogModuleService,
  sources: {
    readonly tenantOverview: TenantWorkspaceOverviewSourceService;
    readonly members: TenantWorkspaceMembersSourceService;
    readonly recentActivity: TenantWorkspaceRecentActivitySourceService;
    readonly openIncidents: TenantWorkspaceOpenIncidentsSourceService;
    readonly usageSpotlights: TenantWorkspaceUsageSpotlightsSourceService;
    readonly pendingTenantApprovals: TenantWorkspacePendingApprovalsSourceService;
  },
): TenantWorkspaceServiceImpl => {
  const getSnapshot: TenantWorkspaceServiceImpl["getSnapshot"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeInput(input);
      if (decoded.requestContext.actorId === undefined) {
        return yield* Effect.fail(
          new TenantWorkspaceMissingActorIdentity({
            operation: "getSnapshot",
          }),
        );
      }

      // Tenant-isolation invariant: only a platform-operator may
      // inspect a tenant whose context does not match the trusted
      // request-context tenant. This runs BEFORE any source is
      // invoked and BEFORE any audit event is emitted so a
      // cross-tenant probe leaves no trace on the desk pivot
      // trail.
      if (
        !isPlatformOperator(decoded.requestContext) &&
        !isSameTenant(decoded.requestContext.tenant, decoded.tenant)
      ) {
        return yield* Effect.fail(
          new TenantWorkspaceCrossTenantAccessDenied({
            requestContextTenant: decoded.requestContext.tenant,
            inputTenant: decoded.tenant,
          }),
        );
      }

      const windowMinutes = decoded.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
      const membersLimit = decoded.membersLimit ?? DEFAULT_MEMBERS_LIMIT;
      const recentActivityLimit =
        decoded.recentActivityLimit ?? DEFAULT_RECENT_ACTIVITY_LIMIT;
      const sourceContext: TenantWorkspaceSourceContext = {
        windowMinutes,
        requestContext: decoded.requestContext,
        tenant: decoded.tenant,
      };

      const results = yield* Effect.all(
        {
          tenantOverview: sectionToEither(
            tenantWorkspaceSnapshotSection.tenantOverview,
            sources.tenantOverview.fetch(sourceContext),
          ),
          members: sectionToEither(
            tenantWorkspaceSnapshotSection.members,
            sources.members.fetch({ ...sourceContext, limit: membersLimit }),
          ),
          recentActivity: sectionToEither(
            tenantWorkspaceSnapshotSection.recentActivity,
            sources.recentActivity.fetch({
              ...sourceContext,
              limit: recentActivityLimit,
            }),
          ),
          openIncidents: sectionToEither(
            tenantWorkspaceSnapshotSection.openIncidents,
            sources.openIncidents.fetch(sourceContext),
          ),
          usageSpotlights: sectionToEither(
            tenantWorkspaceSnapshotSection.usageSpotlights,
            sources.usageSpotlights.fetch(sourceContext),
          ),
          pendingTenantApprovals: sectionToEither(
            tenantWorkspaceSnapshotSection.pendingTenantApprovals,
            sources.pendingTenantApprovals.fetch(sourceContext),
          ),
        },
        { concurrency: "unbounded" },
      );

      const allResults = [
        results.tenantOverview,
        results.members,
        results.recentActivity,
        results.openIncidents,
        results.usageSpotlights,
        results.pendingTenantApprovals,
      ] satisfies ReadonlyArray<SectionResult<unknown>>;
      const partialFailures = collectPartialFailures(allResults);
      const allFailed = partialFailures.length === allResults.length;
      if (allFailed) {
        return yield* Effect.fail(
          new TenantWorkspaceUnavailable({ failures: partialFailures }),
        );
      }

      const snapshot = yield* decodeSnapshot({
        generatedAt: new Date().toISOString(),
        correlationId: decoded.requestContext.correlationId,
        tenant: decoded.tenant,
        windowMinutes,
        tenantOverview: unwrapOverviewOrNull(results.tenantOverview.result),
        members: unwrapArrayOrEmpty(results.members.result),
        recentActivity: unwrapArrayOrEmpty(results.recentActivity.result),
        openIncidents: unwrapArrayOrEmpty(results.openIncidents.result),
        usageSpotlights: unwrapArrayOrEmpty(results.usageSpotlights.result),
        pendingTenantApprovals: unwrapArrayOrEmpty(
          results.pendingTenantApprovals.result,
        ),
        partialFailures,
      });

      yield* audit.append({
        requestContext: decoded.requestContext,
        moduleId: platformModuleId.tenantWorkspace,
        action: tenantWorkspaceAuditAction.read,
        target: decoded.tenant.scopeId,
        reason: reasonCatalogId.tenantWorkspaceRead,
      });

      return snapshot;
    });

  return { getSnapshot };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeTenantWorkspaceServiceLayer = () =>
  Layer.effect(
    TenantWorkspaceService,
    Effect.gen(function* () {
      const audit = yield* AuditLogModule;
      const tenantOverview = yield* TenantWorkspaceOverviewSource;
      const members = yield* TenantWorkspaceMembersSource;
      const recentActivity = yield* TenantWorkspaceRecentActivitySource;
      const openIncidents = yield* TenantWorkspaceOpenIncidentsSource;
      const usageSpotlights = yield* TenantWorkspaceUsageSpotlightsSource;
      const pendingTenantApprovals =
        yield* TenantWorkspacePendingApprovalsSource;
      return makeTenantWorkspaceService(audit, {
        tenantOverview,
        members,
        recentActivity,
        openIncidents,
        usageSpotlights,
        pendingTenantApprovals,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Stub source layers (Phase 1 item 4 — see TODOs at file top)
// ---------------------------------------------------------------------------

const makeStubArraySource = <T>(
  section: TenantWorkspaceSnapshotSection,
  reason: string,
): {
  readonly fetch: (
    context: TenantWorkspaceSourceContext,
  ) => Effect.Effect<readonly T[], TenantWorkspaceSourceUnavailable>;
} => ({
  fetch: (_context) =>
    Effect.fail(new TenantWorkspaceSourceUnavailable({ section, reason })),
});

export const stubTenantWorkspaceOverviewSourceLayer = Layer.succeed(
  TenantWorkspaceOverviewSource,
  // TODO(phase1-item-4): wire to tenant-management,
  // tenant-branding, billing-and-metering, and
  // retention-legal-hold tenant-scoped projections.
  {
    fetch: (_context) =>
      Effect.fail(
        new TenantWorkspaceSourceUnavailable({
          section: tenantWorkspaceSnapshotSection.tenantOverview,
          reason:
            "Tenant overview source not yet wired (stubbed Phase 1 item 4).",
        }),
      ),
  },
);

export const stubTenantWorkspaceMembersSourceLayer = Layer.succeed(
  TenantWorkspaceMembersSource,
  // TODO(phase1-item-4): wire to tenant-management memberships
  // projection + identity-session lastSeenAt projection.
  {
    fetch: (_context) =>
      Effect.fail(
        new TenantWorkspaceSourceUnavailable({
          section: tenantWorkspaceSnapshotSection.members,
          reason: "Members source not yet wired (stubbed Phase 1 item 4).",
        }),
      ),
  },
);

export const stubTenantWorkspaceRecentActivitySourceLayer = Layer.succeed(
  TenantWorkspaceRecentActivitySource,
  // TODO(phase1-item-4): wire to AuditLogModule.queryByTenant
  // once it accepts a typed limit surface.
  {
    fetch: (_context) =>
      Effect.fail(
        new TenantWorkspaceSourceUnavailable({
          section: tenantWorkspaceSnapshotSection.recentActivity,
          reason:
            "Recent activity source not yet wired (stubbed Phase 1 item 4).",
        }),
      ),
  },
);

export const stubTenantWorkspaceOpenIncidentsSourceLayer = Layer.succeed(
  TenantWorkspaceOpenIncidentsSource,
  // TODO(phase1-item-4): wire to per-vendor incident adapters
  // (GlitchTip, Polar disputes, etc.) reusing
  // platformAdapterServiceName.*.
  makeStubArraySource<TenantWorkspaceOpenIncident>(
    tenantWorkspaceSnapshotSection.openIncidents,
    "Open incidents source not yet wired (stubbed Phase 1 item 4).",
  ),
);

export const stubTenantWorkspaceUsageSpotlightsSourceLayer = Layer.succeed(
  TenantWorkspaceUsageSpotlightsSource,
  // TODO(phase1-item-4): wire to OpenMeter usage queries scoped
  // to the tenant + billing-and-metering quotas.
  makeStubArraySource<TenantWorkspaceUsageSpotlight>(
    tenantWorkspaceSnapshotSection.usageSpotlights,
    "Usage spotlights source not yet wired (stubbed Phase 1 item 4).",
  ),
);

export const stubTenantWorkspacePendingApprovalsSourceLayer = Layer.succeed(
  TenantWorkspacePendingApprovalsSource,
  // TODO(phase1-item-4): wire to the approval-workflow service
  // once it ships.
  makeStubArraySource<TenantWorkspacePendingApproval>(
    tenantWorkspaceSnapshotSection.pendingTenantApprovals,
    "Pending tenant approvals source not yet wired (stubbed Phase 1 item 4).",
  ),
);

export const stubTenantWorkspaceSourcesLayer = Layer.mergeAll(
  stubTenantWorkspaceOverviewSourceLayer,
  stubTenantWorkspaceMembersSourceLayer,
  stubTenantWorkspaceRecentActivitySourceLayer,
  stubTenantWorkspaceOpenIncidentsSourceLayer,
  stubTenantWorkspaceUsageSpotlightsSourceLayer,
  stubTenantWorkspacePendingApprovalsSourceLayer,
);

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const TenantWorkspaceProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
});

const decodeTenantWorkspaceProcessEnvironment = Schema.decodeUnknown(
  TenantWorkspaceProcessEnvironmentSchema,
);

export type TenantWorkspaceRuntimeOptions = {
  readonly postgresUrl: string;
};

const resolveTenantWorkspaceRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeTenantWorkspaceProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): TenantWorkspaceRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
      }),
    ),
  );

const makeTenantWorkspaceRuntime = (options: TenantWorkspaceRuntimeOptions) =>
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
    const audit = yield* makeAuditLogModule(auditLogRepository);
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, audit),
      stubTenantWorkspaceSourcesLayer,
    );
    const serviceLayer = makeTenantWorkspaceServiceLayer().pipe(
      Layer.provide(baseLayer),
    );
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type TenantWorkspaceRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runTenantWorkspaceFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: TenantWorkspaceServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | TenantWorkspaceRuntimeError> =>
  resolveTenantWorkspaceRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeTenantWorkspaceRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(TenantWorkspaceService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
