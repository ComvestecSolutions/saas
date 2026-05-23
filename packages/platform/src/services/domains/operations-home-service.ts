/**
 * Operations Home aggregate v2 platform service (admin-app
 * implementation plan §9 item 3; Desk Center Workbench default
 * layout section of `specs/02-apps/admin-app/spec.md`).
 *
 * Produces the single payload the admin-app desk loads on `/desk`
 * by fanning out to multiple sources concurrently (KPIs, active
 * alerts, recent audit, pending approvals, vendor posture). Each
 * source is invoked through a typed source-port Context.Tag so
 * tests can inject deterministic fakes and per-section failures
 * degrade to an empty section + a typed `partialFailures` entry
 * rather than failing the whole snapshot. Only when every source
 * fails does the service fail with `OperationsHomeUnavailable`.
 *
 * Each successful read emits a single
 * `reasonCatalogId.operationsHomeRead` audit event keyed by
 * `platformModuleId.operationsHome` so reviewers can pivot on
 * desk-load activity without re-deriving cross-module audit
 * trails.
 *
 * VENDOR-SOURCE STATUS (Phase 1 item 3):
 *   - KPI source (tenant counts, operator counts, open invoices,
 *     usage events, audit volume) → **stubbed** via
 *     {@link OperationsHomeKpiSource}. The env-bound runtime
 *     supplies a degraded stub that fails with
 *     `OperationsHomeSourceUnavailable` so the live aggregate
 *     surfaces a typed `partialFailures` entry instead of
 *     fabricated numbers. // TODO(phase1-item-3): wire to
 *     tenant-management, identity-session, Polar (billing-and-
 *     metering), OpenMeter, and audit-log services once the
 *     downstream count surfaces ship.
 *   - Active alerts source → **stubbed** via
 *     {@link OperationsHomeActiveAlertsSource}. // TODO(phase1-
 *     item-3): wire to GlitchTip via the platform adapter
 *     identified by `platformAdapterServiceName.glitchtip` once
 *     the observability adapter ships an alert-list surface.
 *   - Recent audit source → **stubbed** via
 *     {@link OperationsHomeRecentAuditSource}. The intended live
 *     dependency is `AuditLogModule.listRecent(limit)`, which
 *     does not yet exist on the module surface. // TODO(phase1-
 *     item-3): add `listRecent` to the audit-log module API and
 *     wire the live source here.
 *   - Pending approvals source → **stubbed** via
 *     {@link OperationsHomePendingApprovalsSource}. // TODO
 *     (phase1-item-3): wire to the approval-workflow service
 *     once that service is introduced; this slice does not own
 *     creating it.
 *   - Vendor posture source → **stubbed** via
 *     {@link OperationsHomeVendorPostureSource}. // TODO
 *     (phase1-item-3): wire to per-vendor healthcheck adapters
 *     using `platformAdapterServiceName.*` and
 *     `createPlatformAdapterHealthcheckSchema` once vendor
 *     healthcheck adapters expose a uniform posture surface.
 */
import { Context, Effect, Either, Layer, ParseResult, Schema } from "effect";
import {
  operationsHomeAuditAction,
  operationsHomeSnapshotSection,
  OperationsHomeSnapshotSchema,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  type OperationsHomeActiveAlert,
  type OperationsHomeKpi,
  type OperationsHomePartialFailure,
  type OperationsHomePendingApproval,
  type OperationsHomeRecentAuditEntry,
  type OperationsHomeSnapshot,
  type OperationsHomeSnapshotSection,
  type OperationsHomeVendorPosture,
  type RequestContext,
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

export class OperationsHomeSourceUnavailable {
  readonly _tag = "OperationsHomeSourceUnavailable" as const;
  constructor(
    readonly args: {
      readonly section: OperationsHomeSnapshotSection;
      readonly reason: string;
    },
  ) {}
}

export class OperationsHomeUnavailable {
  readonly _tag = "OperationsHomeUnavailable" as const;
  constructor(
    readonly args: {
      readonly failures: ReadonlyArray<OperationsHomePartialFailure>;
    },
  ) {}
}

export class OperationsHomeMissingActorIdentity {
  readonly _tag = "OperationsHomeMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: "getSnapshot" }) {}
}

export type OperationsHomeServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | OperationsHomeUnavailable
  | OperationsHomeMissingActorIdentity;

// ---------------------------------------------------------------------------
// Source ports
// ---------------------------------------------------------------------------

export type OperationsHomeSourceContext = {
  readonly windowMinutes: number;
  readonly requestContext: RequestContext;
};

export type OperationsHomeKpiSourceService = {
  readonly fetch: (
    context: OperationsHomeSourceContext,
  ) => Effect.Effect<
    readonly OperationsHomeKpi[],
    OperationsHomeSourceUnavailable
  >;
};

export class OperationsHomeKpiSource extends Context.Tag(
  "OperationsHomeKpiSource",
)<OperationsHomeKpiSource, OperationsHomeKpiSourceService>() {}

export type OperationsHomeActiveAlertsSourceService = {
  readonly fetch: (
    context: OperationsHomeSourceContext,
  ) => Effect.Effect<
    readonly OperationsHomeActiveAlert[],
    OperationsHomeSourceUnavailable
  >;
};

export class OperationsHomeActiveAlertsSource extends Context.Tag(
  "OperationsHomeActiveAlertsSource",
)<
  OperationsHomeActiveAlertsSource,
  OperationsHomeActiveAlertsSourceService
>() {}

export type OperationsHomeRecentAuditSourceContext =
  OperationsHomeSourceContext & {
    readonly limit: number;
  };

export type OperationsHomeRecentAuditSourceService = {
  readonly fetch: (
    context: OperationsHomeRecentAuditSourceContext,
  ) => Effect.Effect<
    readonly OperationsHomeRecentAuditEntry[],
    OperationsHomeSourceUnavailable
  >;
};

export class OperationsHomeRecentAuditSource extends Context.Tag(
  "OperationsHomeRecentAuditSource",
)<OperationsHomeRecentAuditSource, OperationsHomeRecentAuditSourceService>() {}

export type OperationsHomePendingApprovalsSourceService = {
  readonly fetch: (
    context: OperationsHomeSourceContext,
  ) => Effect.Effect<
    readonly OperationsHomePendingApproval[],
    OperationsHomeSourceUnavailable
  >;
};

export class OperationsHomePendingApprovalsSource extends Context.Tag(
  "OperationsHomePendingApprovalsSource",
)<
  OperationsHomePendingApprovalsSource,
  OperationsHomePendingApprovalsSourceService
>() {}

export type OperationsHomeVendorPostureSourceService = {
  readonly fetch: (
    context: OperationsHomeSourceContext,
  ) => Effect.Effect<
    readonly OperationsHomeVendorPosture[],
    OperationsHomeSourceUnavailable
  >;
};

export class OperationsHomeVendorPostureSource extends Context.Tag(
  "OperationsHomeVendorPostureSource",
)<
  OperationsHomeVendorPostureSource,
  OperationsHomeVendorPostureSourceService
>() {}

// ---------------------------------------------------------------------------
// Service input
// ---------------------------------------------------------------------------

export const GetOperationsHomeSnapshotInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  windowMinutes: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
  recentAuditLimit: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
});

export type GetOperationsHomeSnapshotInput = Schema.Schema.Type<
  typeof GetOperationsHomeSnapshotInputSchema
>;

const DEFAULT_WINDOW_MINUTES = 1440;
const DEFAULT_RECENT_AUDIT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type OperationsHomeServiceImpl = {
  readonly getSnapshot: (
    input: GetOperationsHomeSnapshotInput,
  ) => Effect.Effect<OperationsHomeSnapshot, OperationsHomeServiceError>;
};

export class OperationsHomeService extends Context.Tag("OperationsHomeService")<
  OperationsHomeService,
  OperationsHomeServiceImpl
>() {}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const decodeInput = Schema.decodeUnknown(GetOperationsHomeSnapshotInputSchema);
const decodeSnapshot = Schema.decodeUnknown(OperationsHomeSnapshotSchema);

type SectionResult<T> = {
  readonly section: OperationsHomeSnapshotSection;
  readonly result: Either.Either<readonly T[], OperationsHomeSourceUnavailable>;
};

const sectionToEither = <T>(
  section: OperationsHomeSnapshotSection,
  effect: Effect.Effect<readonly T[], OperationsHomeSourceUnavailable>,
): Effect.Effect<SectionResult<T>> =>
  Effect.either(effect).pipe(Effect.map((result) => ({ section, result })));

const collectPartialFailures = (
  results: ReadonlyArray<SectionResult<unknown>>,
): ReadonlyArray<OperationsHomePartialFailure> => {
  const failures: OperationsHomePartialFailure[] = [];
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

const unwrapOrEmpty = <T>(
  result: Either.Either<readonly T[], OperationsHomeSourceUnavailable>,
): readonly T[] =>
  Either.match(result, {
    onLeft: () => [] as readonly T[],
    onRight: (value) => value,
  });

export const makeOperationsHomeService = (
  audit: AuditLogModuleService,
  sources: {
    readonly kpis: OperationsHomeKpiSourceService;
    readonly activeAlerts: OperationsHomeActiveAlertsSourceService;
    readonly recentAudit: OperationsHomeRecentAuditSourceService;
    readonly pendingApprovals: OperationsHomePendingApprovalsSourceService;
    readonly vendorPosture: OperationsHomeVendorPostureSourceService;
  },
): OperationsHomeServiceImpl => {
  const getSnapshot: OperationsHomeServiceImpl["getSnapshot"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeInput(input);
      if (decoded.requestContext.actorId === undefined) {
        return yield* Effect.fail(
          new OperationsHomeMissingActorIdentity({ operation: "getSnapshot" }),
        );
      }
      const windowMinutes = decoded.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
      const recentAuditLimit =
        decoded.recentAuditLimit ?? DEFAULT_RECENT_AUDIT_LIMIT;
      const sourceContext: OperationsHomeSourceContext = {
        windowMinutes,
        requestContext: decoded.requestContext,
      };

      const results = yield* Effect.all(
        {
          kpis: sectionToEither(
            operationsHomeSnapshotSection.kpis,
            sources.kpis.fetch(sourceContext),
          ),
          activeAlerts: sectionToEither(
            operationsHomeSnapshotSection.activeAlerts,
            sources.activeAlerts.fetch(sourceContext),
          ),
          recentAudit: sectionToEither(
            operationsHomeSnapshotSection.recentAudit,
            sources.recentAudit.fetch({
              ...sourceContext,
              limit: recentAuditLimit,
            }),
          ),
          pendingApprovals: sectionToEither(
            operationsHomeSnapshotSection.pendingApprovals,
            sources.pendingApprovals.fetch(sourceContext),
          ),
          vendorPosture: sectionToEither(
            operationsHomeSnapshotSection.vendorPosture,
            sources.vendorPosture.fetch(sourceContext),
          ),
        },
        { concurrency: "unbounded" },
      );

      const allResults = [
        results.kpis,
        results.activeAlerts,
        results.recentAudit,
        results.pendingApprovals,
        results.vendorPosture,
      ] satisfies ReadonlyArray<SectionResult<unknown>>;
      const partialFailures = collectPartialFailures(allResults);
      const allFailed = partialFailures.length === allResults.length;
      if (allFailed) {
        return yield* Effect.fail(
          new OperationsHomeUnavailable({ failures: partialFailures }),
        );
      }

      const snapshot = yield* decodeSnapshot({
        generatedAt: new Date().toISOString(),
        correlationId: decoded.requestContext.correlationId,
        windowMinutes,
        kpis: unwrapOrEmpty(results.kpis.result),
        activeAlerts: unwrapOrEmpty(results.activeAlerts.result),
        recentAudit: unwrapOrEmpty(results.recentAudit.result),
        pendingApprovals: unwrapOrEmpty(results.pendingApprovals.result),
        vendorPosture: unwrapOrEmpty(results.vendorPosture.result),
        partialFailures,
      });

      yield* audit.append({
        requestContext: decoded.requestContext,
        moduleId: platformModuleId.operationsHome,
        action: operationsHomeAuditAction.read,
        target: decoded.requestContext.actorId,
        reason: reasonCatalogId.operationsHomeRead,
      });

      return snapshot;
    });

  return { getSnapshot };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeOperationsHomeServiceLayer = () =>
  Layer.effect(
    OperationsHomeService,
    Effect.gen(function* () {
      const audit = yield* AuditLogModule;
      const kpis = yield* OperationsHomeKpiSource;
      const activeAlerts = yield* OperationsHomeActiveAlertsSource;
      const recentAudit = yield* OperationsHomeRecentAuditSource;
      const pendingApprovals = yield* OperationsHomePendingApprovalsSource;
      const vendorPosture = yield* OperationsHomeVendorPostureSource;
      return makeOperationsHomeService(audit, {
        kpis,
        activeAlerts,
        recentAudit,
        pendingApprovals,
        vendorPosture,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Stub source layers (Phase 1 item 3 — see TODOs at file top)
// ---------------------------------------------------------------------------

const makeStubSource = <T>(
  section: OperationsHomeSnapshotSection,
  reason: string,
): {
  readonly fetch: (
    context: OperationsHomeSourceContext,
  ) => Effect.Effect<readonly T[], OperationsHomeSourceUnavailable>;
} => ({
  fetch: (_context) =>
    Effect.fail(new OperationsHomeSourceUnavailable({ section, reason })),
});

export const stubOperationsHomeKpiSourceLayer = Layer.succeed(
  OperationsHomeKpiSource,
  // TODO(phase1-item-3): replace stub with composed source from
  // tenant-management, identity-session, Polar, OpenMeter, and
  // audit-log services.
  makeStubSource<OperationsHomeKpi>(
    operationsHomeSnapshotSection.kpis,
    "KPI source not yet wired (stubbed Phase 1 item 3).",
  ),
);

export const stubOperationsHomeActiveAlertsSourceLayer = Layer.succeed(
  OperationsHomeActiveAlertsSource,
  // TODO(phase1-item-3): replace stub with GlitchTip-backed
  // adapter via platformAdapterServiceName.glitchtip.
  makeStubSource<OperationsHomeActiveAlert>(
    operationsHomeSnapshotSection.activeAlerts,
    "Active alerts source not yet wired (stubbed Phase 1 item 3).",
  ),
);

export const stubOperationsHomeRecentAuditSourceLayer = Layer.succeed(
  OperationsHomeRecentAuditSource,
  // TODO(phase1-item-3): replace stub with AuditLogModule.listRecent
  // once that surface is added; the module currently exposes only
  // queryByModule/Target/Actor/Tenant.
  {
    fetch: (_context) =>
      Effect.fail(
        new OperationsHomeSourceUnavailable({
          section: operationsHomeSnapshotSection.recentAudit,
          reason: "Recent audit source not yet wired (stubbed Phase 1 item 3).",
        }),
      ),
  },
);

export const stubOperationsHomePendingApprovalsSourceLayer = Layer.succeed(
  OperationsHomePendingApprovalsSource,
  // TODO(phase1-item-3): replace stub with approval-workflow
  // service once that module ships.
  makeStubSource<OperationsHomePendingApproval>(
    operationsHomeSnapshotSection.pendingApprovals,
    "Pending approvals source not yet wired (stubbed Phase 1 item 3).",
  ),
);

export const stubOperationsHomeVendorPostureSourceLayer = Layer.succeed(
  OperationsHomeVendorPostureSource,
  // TODO(phase1-item-3): replace stub with per-vendor healthcheck
  // adapters reusing platformAdapterServiceName.* and
  // createPlatformAdapterHealthcheckSchema.
  makeStubSource<OperationsHomeVendorPosture>(
    operationsHomeSnapshotSection.vendorPosture,
    "Vendor posture source not yet wired (stubbed Phase 1 item 3).",
  ),
);

export const stubOperationsHomeSourcesLayer = Layer.mergeAll(
  stubOperationsHomeKpiSourceLayer,
  stubOperationsHomeActiveAlertsSourceLayer,
  stubOperationsHomeRecentAuditSourceLayer,
  stubOperationsHomePendingApprovalsSourceLayer,
  stubOperationsHomeVendorPostureSourceLayer,
);

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const OperationsHomeProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
});

const decodeOperationsHomeProcessEnvironment = Schema.decodeUnknown(
  OperationsHomeProcessEnvironmentSchema,
);

export type OperationsHomeRuntimeOptions = {
  readonly postgresUrl: string;
};

const resolveOperationsHomeRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeOperationsHomeProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): OperationsHomeRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
      }),
    ),
  );

const makeOperationsHomeRuntime = (options: OperationsHomeRuntimeOptions) =>
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
      stubOperationsHomeSourcesLayer,
    );
    const serviceLayer = makeOperationsHomeServiceLayer().pipe(
      Layer.provide(baseLayer),
    );
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type OperationsHomeRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runOperationsHomeFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: OperationsHomeServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | OperationsHomeRuntimeError> =>
  resolveOperationsHomeRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeOperationsHomeRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(OperationsHomeService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
