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
 *   - KPI source → **live** via admin-billing, support-operations,
 *     and admin-governance read surfaces. The current cut projects
 *     repair gaps, support backlog, impersonation volume, break-
 *     glass reviews, and pending governance proposals into the KPI
 *     ribbon while longer-horizon tenant/operator totals remain a
 *     follow-up once dedicated count projections ship.
 *   - Active alerts source → **live, healthcheck-backed** via
 *     the default GlitchTip issues client over
 *     `platformAdapterServiceName.glitchtip`. Until the upstream
 *     issue-list API ships, the source returns honest empty arrays
 *     after a successful credential probe rather than fabricated
 *     incident rows.
 *   - Recent audit source → **live** via
 *     `AuditLogModule.queryByTenant(...)`, filtered to the current
 *     snapshot window and bounded by `recentAuditLimit`.
 *   - Pending approvals source → **live** for governance-backed
 *     runtime-config and tenant-branding proposals. A broader shared
 *     approval-workflow surface is still a follow-up for non-
 *     governance approval queues.
 *   - Vendor posture source → **live** via the shared
 *     vendor-healthcheck port over `platformAdapterServiceName.*`.
 *     Failed healthchecks degrade individual vendors to `down`
 *     posture; only an all-vendor outage degrades the whole section.
 */
import { Context, Effect, Either, Layer, ParseResult, Schema } from "effect";
import {
  dataClassification,
  kpiTone,
  kpiTrendDirection,
  operationsHomeAlertSeverity,
  operationsHomeAuditAction,
  operationsHomeDrillResourceKind,
  operationsHomeSnapshotSection,
  operationsHomeVendorPostureLevel,
  OperationsHomeSnapshotSchema,
  platformAdapterServiceName,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsCaseStatus,
  supportOperationsImpersonationSessionStatus,
  type AuditEvent,
  type GlitchTipIssue,
  type GlitchTipIssueLevel,
  type OperationsHomeActiveAlert,
  type OperationsHomeKpi,
  type OperationsHomePartialFailure,
  type OperationsHomePendingApproval,
  type OperationsHomeRecentAuditEntry,
  type OperationsHomeSnapshot,
  type OperationsHomeSnapshotSection,
  type OperationsHomeVendorPosture,
  type RequestContext,
  type VendorHealthAggregateEntry,
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
  runtimeConfigSyncArtifactStatus,
} from "@comvestec/modules";
import { and, desc, eq } from "drizzle-orm";
import {
  makeConvexAdapter,
  makeGlitchtipAdapter,
  makeKeycloakAdapter,
  makeMeilisearchAdapter,
  makeNovuAdapter,
  makeObservabilityAdapter,
  makeOpenmeterAdapter,
  makeOpenPanelAdapter,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makePolarAdapter,
  makePostalAdapter,
  makeUnleashAdapter,
  makeValkeyAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import {
  makeDefaultGlitchTipIssuesApiClient,
  type GlitchTipIssuesApiClientService,
} from "./glitchtip-issues-read-service";
import {
  type AdminGovernanceRuntimeConfigProposalView,
  runAdminGovernanceFromEnvironment,
} from "../governance/admin-governance";
import { runSupportOperationsFromEnvironment } from "../governance/support-operations";
import { runAdminBillingFromEnvironment } from "./admin-billing";
import {
  makeDefaultVendorHealthcheckPort,
  resolveVendorHealthAggregatorRuntimeOptionsFromEnvironment,
  type VendorHealthcheckPortService,
} from "./vendor-health-aggregator-service";
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
const ACTIVE_ALERTS_LIMIT = 10;
const PENDING_APPROVALS_LIMIT = 10;

const OperationsHomeActiveAlertsEnvironmentSchema = Schema.Struct({
  ERROR_TRACKING_DSN: Schema.NonEmptyString,
});

const decodeOperationsHomeActiveAlertsEnvironment = Schema.decodeUnknown(
  OperationsHomeActiveAlertsEnvironmentSchema,
);

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

const describeSourceFailure = (error: unknown, fallback: string): string => {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "args" in error &&
    typeof (error as { args?: { reason?: unknown } }).args?.reason === "string"
  ) {
    return (error as { args: { reason: string } }).args.reason;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof (error as { _tag?: unknown })._tag === "string"
  ) {
    return (error as { _tag: string })._tag;
  }
  if (error instanceof Error) {
    return error.message.length === 0 ? error.name : error.message;
  }
  return fallback;
};

const isTimestampWithinWindow = (
  timestamp: string,
  nowMs: number,
  windowMinutes: number,
) => {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed >= nowMs - windowMinutes * 60_000;
};

const mapAuditEventToOperationsHomeRecentAuditEntry = (
  event: AuditEvent,
): OperationsHomeRecentAuditEntry => ({
  id: event.eventId,
  actor: event.actorId,
  action: event.action,
  target: event.target,
  occurredAt: event.timestamp,
  classification: dataClassification.internal,
});

const operationsHomeAlertLevels = [
  "fatal",
  "error",
  "warning",
] as const satisfies readonly GlitchTipIssueLevel[];

const dedupeGlitchTipIssues = (
  issues: ReadonlyArray<GlitchTipIssue>,
): ReadonlyArray<GlitchTipIssue> => {
  const deduped = new Map<string, GlitchTipIssue>();
  for (const issue of issues) {
    if (!deduped.has(issue.issueId)) {
      deduped.set(issue.issueId, issue);
    }
  }
  return [...deduped.values()];
};

const mapGlitchTipLevelToAlertSeverity = (
  level: GlitchTipIssue["level"],
): OperationsHomeActiveAlert["severity"] => {
  switch (level) {
    case "fatal":
    case "error":
      return operationsHomeAlertSeverity.critical;
    case "warning":
      return operationsHomeAlertSeverity.warning;
    default:
      return operationsHomeAlertSeverity.info;
  }
};

const mapGlitchTipIssueToOperationsHomeAlert = (
  issue: GlitchTipIssue,
): OperationsHomeActiveAlert => ({
  id: issue.issueId,
  severity: mapGlitchTipLevelToAlertSeverity(issue.level),
  title: issue.title,
  summary: issue.culprit,
  openedAt: issue.firstSeenAt,
  sourceVendor: platformAdapterServiceName.glitchtip,
  ...(issue.permalink === undefined ? {} : { deepLink: issue.permalink }),
});

const mapVendorStatusToPosture = (
  status: VendorHealthAggregateEntry["status"],
): OperationsHomeVendorPosture["posture"] => {
  switch (status) {
    case "healthy":
      return operationsHomeVendorPostureLevel.nominal;
    case "degraded":
      return operationsHomeVendorPostureLevel.degraded;
    case "unavailable":
      return operationsHomeVendorPostureLevel.down;
    default:
      return operationsHomeVendorPostureLevel.unknown;
  }
};

const mapVendorHealthEntryToOperationsHomeVendorPosture = (
  entry: VendorHealthAggregateEntry,
): OperationsHomeVendorPosture => ({
  vendor: entry.serviceName,
  posture: mapVendorStatusToPosture(entry.status),
  ...(entry.version === undefined ? {} : { version: entry.version }),
  ...(entry.lastIncidentAt === undefined
    ? {}
    : { lastIncidentAt: entry.lastIncidentAt }),
  ...(entry.latencyMs > 0 ? { latencyP95Ms: entry.latencyMs } : {}),
});

type OperationsHomeKpiSourceResolvers = {
  readonly listBillingRepairGaps: (
    requestContext: RequestContext,
  ) => Effect.Effect<readonly unknown[], unknown>;
  readonly listSupportCases: (
    requestContext: RequestContext,
    status: (typeof supportOperationsCaseStatus)[keyof typeof supportOperationsCaseStatus],
  ) => Effect.Effect<readonly unknown[], unknown>;
  readonly listImpersonationSessions: (
    requestContext: RequestContext,
    status: (typeof supportOperationsImpersonationSessionStatus)[keyof typeof supportOperationsImpersonationSessionStatus],
  ) => Effect.Effect<readonly unknown[], unknown>;
  readonly listBreakGlassIncidents: (
    requestContext: RequestContext,
    status: (typeof supportOperationsBreakGlassIncidentStatus)[keyof typeof supportOperationsBreakGlassIncidentStatus],
  ) => Effect.Effect<readonly unknown[], unknown>;
  readonly listRuntimeConfigProposals: (
    requestContext: RequestContext,
    moduleId: AdminGovernanceRuntimeConfigProposalView["moduleId"],
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigProposalView[],
    unknown
  >;
};

const buildCountKpi = (input: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly windowMinutes: number;
  readonly drillResourceKind: OperationsHomeKpi["drillResourceKind"];
  readonly drillFilters: OperationsHomeKpi["drillFilters"];
}): OperationsHomeKpi => ({
  id: input.id,
  label: input.label,
  value: input.value,
  unit: input.unit,
  trend: {
    direction: kpiTrendDirection.flat,
    delta: 0,
    windowMinutes: input.windowMinutes,
  },
  tone: input.value === 0 ? kpiTone.nominal : kpiTone.pending,
  drillResourceKind: input.drillResourceKind,
  drillFilters: input.drillFilters,
});

const resolveRequestedAt = (
  proposal: AdminGovernanceRuntimeConfigProposalView,
) => proposal.changedAt ?? proposal.generatedAt;

const mapGovernanceProposalToPendingApproval = (
  proposal: AdminGovernanceRuntimeConfigProposalView,
): OperationsHomePendingApproval | null => {
  const requestedAt = resolveRequestedAt(proposal);
  if (requestedAt === undefined) {
    return null;
  }
  return {
    id: proposal.proposalId,
    kind:
      proposal.moduleId === platformModuleId.tenantBranding
        ? "Branding review"
        : "Runtime config review",
    target:
      proposal.scopeId === undefined
        ? `${proposal.moduleId}:${proposal.key}`
        : `${proposal.moduleId}:${proposal.key}:${proposal.scopeId}`,
    requestedBy: proposal.changedBy ?? "unknown-actor",
    requestedAt,
    reasonPreview:
      proposal.approvalReason ??
      `Review ${proposal.key} for ${proposal.moduleId}.`,
    ttlSeconds: 0,
  };
};

export const makeOperationsHomeKpiSourceService = (
  deps: OperationsHomeKpiSourceResolvers,
): OperationsHomeKpiSourceService => ({
  fetch: (context) =>
    Effect.all(
      {
        repairGaps: Effect.either(
          deps.listBillingRepairGaps(context.requestContext),
        ),
        openSupportCases: Effect.either(
          deps.listSupportCases(
            context.requestContext,
            supportOperationsCaseStatus.open,
          ),
        ),
        escalatedSupportCases: Effect.either(
          deps.listSupportCases(
            context.requestContext,
            supportOperationsCaseStatus.escalated,
          ),
        ),
        activeImpersonationSessions: Effect.either(
          deps.listImpersonationSessions(
            context.requestContext,
            supportOperationsImpersonationSessionStatus.active,
          ),
        ),
        pendingBreakGlassIncidents: Effect.either(
          deps.listBreakGlassIncidents(
            context.requestContext,
            supportOperationsBreakGlassIncidentStatus.pendingReview,
          ),
        ),
        runtimeConfigProposals: Effect.either(
          deps.listRuntimeConfigProposals(
            context.requestContext,
            platformModuleId.runtimeConfig,
          ),
        ),
        brandingProposals: Effect.either(
          deps.listRuntimeConfigProposals(
            context.requestContext,
            platformModuleId.tenantBranding,
          ),
        ),
      },
      { concurrency: "unbounded" },
    ).pipe(
      Effect.flatMap((results) => {
        const kpis: OperationsHomeKpi[] = [];
        if (Either.isRight(results.repairGaps)) {
          kpis.push(
            buildCountKpi({
              id: "repair-gaps",
              label: "Repair gaps",
              value: results.repairGaps.right.length,
              unit: "gaps",
              windowMinutes: context.windowMinutes,
              drillResourceKind: operationsHomeDrillResourceKind.workflowRuns,
              drillFilters: {
                sourceModuleId: platformModuleId.billingAndMetering,
              },
            }),
          );
        }
        if (Either.isRight(results.openSupportCases)) {
          kpis.push(
            buildCountKpi({
              id: "open-support-cases",
              label: "Open support cases",
              value: results.openSupportCases.right.length,
              unit: "cases",
              windowMinutes: context.windowMinutes,
              drillResourceKind: operationsHomeDrillResourceKind.alerts,
              drillFilters: { status: supportOperationsCaseStatus.open },
            }),
          );
        }
        if (Either.isRight(results.escalatedSupportCases)) {
          kpis.push(
            buildCountKpi({
              id: "escalated-support-cases",
              label: "Escalated support",
              value: results.escalatedSupportCases.right.length,
              unit: "cases",
              windowMinutes: context.windowMinutes,
              drillResourceKind: operationsHomeDrillResourceKind.alerts,
              drillFilters: {
                status: supportOperationsCaseStatus.escalated,
              },
            }),
          );
        }
        if (Either.isRight(results.activeImpersonationSessions)) {
          kpis.push(
            buildCountKpi({
              id: "active-impersonations",
              label: "Active impersonations",
              value: results.activeImpersonationSessions.right.length,
              unit: "sessions",
              windowMinutes: context.windowMinutes,
              drillResourceKind: operationsHomeDrillResourceKind.users,
              drillFilters: {
                status: supportOperationsImpersonationSessionStatus.active,
              },
            }),
          );
        }
        if (Either.isRight(results.pendingBreakGlassIncidents)) {
          kpis.push(
            buildCountKpi({
              id: "pending-break-glass",
              label: "Break-glass reviews",
              value: results.pendingBreakGlassIncidents.right.length,
              unit: "incidents",
              windowMinutes: context.windowMinutes,
              drillResourceKind: operationsHomeDrillResourceKind.approvals,
              drillFilters: {
                status: supportOperationsBreakGlassIncidentStatus.pendingReview,
              },
            }),
          );
        }
        if (Either.isRight(results.runtimeConfigProposals)) {
          kpis.push(
            buildCountKpi({
              id: "runtime-config-proposals",
              label: "Runtime proposals",
              value: results.runtimeConfigProposals.right.filter(
                (proposal) =>
                  proposal.status === runtimeConfigSyncArtifactStatus.pending,
              ).length,
              unit: "proposals",
              windowMinutes: context.windowMinutes,
              drillResourceKind: operationsHomeDrillResourceKind.approvals,
              drillFilters: { moduleId: platformModuleId.runtimeConfig },
            }),
          );
        }
        if (Either.isRight(results.brandingProposals)) {
          kpis.push(
            buildCountKpi({
              id: "branding-proposals",
              label: "Branding proposals",
              value: results.brandingProposals.right.filter(
                (proposal) =>
                  proposal.status === runtimeConfigSyncArtifactStatus.pending,
              ).length,
              unit: "proposals",
              windowMinutes: context.windowMinutes,
              drillResourceKind: operationsHomeDrillResourceKind.approvals,
              drillFilters: { moduleId: platformModuleId.tenantBranding },
            }),
          );
        }
        return kpis.length === 0
          ? Effect.fail(
              new OperationsHomeSourceUnavailable({
                section: operationsHomeSnapshotSection.kpis,
                reason: "KPI source unavailable.",
              }),
            )
          : Effect.succeed(kpis);
      }),
      Effect.mapError((error) =>
        error instanceof OperationsHomeSourceUnavailable
          ? error
          : new OperationsHomeSourceUnavailable({
              section: operationsHomeSnapshotSection.kpis,
              reason: describeSourceFailure(error, "KPI source unavailable."),
            }),
      ),
    ),
});

type PendingApprovalsProposalResolver = {
  readonly listRuntimeConfigProposals: (
    requestContext: RequestContext,
    moduleId: AdminGovernanceRuntimeConfigProposalView["moduleId"],
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigProposalView[],
    unknown
  >;
};

export const makeOperationsHomePendingApprovalsSourceService = (
  deps: PendingApprovalsProposalResolver,
): OperationsHomePendingApprovalsSourceService => ({
  fetch: (context) =>
    Effect.all(
      [
        deps.listRuntimeConfigProposals(
          context.requestContext,
          platformModuleId.runtimeConfig,
        ),
        deps.listRuntimeConfigProposals(
          context.requestContext,
          platformModuleId.tenantBranding,
        ),
      ],
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map((groups) =>
        groups
          .flat()
          .filter(
            (proposal) =>
              proposal.status === runtimeConfigSyncArtifactStatus.pending,
          )
          .map(mapGovernanceProposalToPendingApproval)
          .filter(
            (proposal): proposal is OperationsHomePendingApproval =>
              proposal !== null,
          )
          .sort(
            (left, right) =>
              Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
          )
          .slice(0, PENDING_APPROVALS_LIMIT),
      ),
      Effect.mapError(
        (error) =>
          new OperationsHomeSourceUnavailable({
            section: operationsHomeSnapshotSection.pendingApprovals,
            reason: describeSourceFailure(
              error,
              "Pending approvals source unavailable.",
            ),
          }),
      ),
    ),
});

const sessionIdRequiredError = (message: string) =>
  Effect.fail(new Error(message));

const listBillingRepairGapsFromEnvironment = (
  environment: unknown,
  requestContext: RequestContext,
) => {
  const sessionId = requestContext.sessionId;
  return sessionId === undefined
    ? sessionIdRequiredError("Billing repair-gap reads require a session id.")
    : runAdminBillingFromEnvironment(environment, (service) =>
        service
          .listBillingRepairGaps({
            sessionId,
            ...(requestContext.reason === undefined
              ? {}
              : { inspectionReason: requestContext.reason }),
          })
          .pipe(Effect.map((result) => result.jobs)),
      );
};

const listSupportCasesFromEnvironment = (
  environment: unknown,
  requestContext: RequestContext,
  status: (typeof supportOperationsCaseStatus)[keyof typeof supportOperationsCaseStatus],
) => {
  const sessionId = requestContext.sessionId;
  return sessionId === undefined
    ? sessionIdRequiredError("Support case reads require a session id.")
    : runSupportOperationsFromEnvironment(environment, (service) =>
        service.listCases({
          sessionId,
          status,
        }),
      );
};

const listImpersonationSessionsFromEnvironment = (
  environment: unknown,
  requestContext: RequestContext,
  status: (typeof supportOperationsImpersonationSessionStatus)[keyof typeof supportOperationsImpersonationSessionStatus],
) => {
  const sessionId = requestContext.sessionId;
  return sessionId === undefined
    ? sessionIdRequiredError(
        "Impersonation session reads require a session id.",
      )
    : runSupportOperationsFromEnvironment(environment, (service) =>
        service.listImpersonationSessions({
          sessionId,
          status,
        }),
      );
};

const listBreakGlassIncidentsFromEnvironment = (
  environment: unknown,
  requestContext: RequestContext,
  status: (typeof supportOperationsBreakGlassIncidentStatus)[keyof typeof supportOperationsBreakGlassIncidentStatus],
) => {
  const sessionId = requestContext.sessionId;
  return sessionId === undefined
    ? sessionIdRequiredError("Break-glass incident reads require a session id.")
    : runSupportOperationsFromEnvironment(environment, (service) =>
        service.listBreakGlassIncidents({
          sessionId,
          status,
        }),
      );
};

const listRuntimeConfigProposalsFromEnvironment = (
  environment: unknown,
  requestContext: RequestContext,
  moduleId: AdminGovernanceRuntimeConfigProposalView["moduleId"],
) =>
  runAdminGovernanceFromEnvironment(environment, (service) =>
    service.listRuntimeConfigProposals({
      requestContext,
      moduleId,
    }),
  );

const makeLiveOperationsHomeKpiSource = (
  environment: unknown,
): OperationsHomeKpiSourceService =>
  makeOperationsHomeKpiSourceService({
    listBillingRepairGaps: (requestContext) =>
      listBillingRepairGapsFromEnvironment(environment, requestContext),
    listSupportCases: (requestContext, status) =>
      listSupportCasesFromEnvironment(environment, requestContext, status),
    listImpersonationSessions: (requestContext, status) =>
      listImpersonationSessionsFromEnvironment(
        environment,
        requestContext,
        status,
      ),
    listBreakGlassIncidents: (requestContext, status) =>
      listBreakGlassIncidentsFromEnvironment(
        environment,
        requestContext,
        status,
      ),
    listRuntimeConfigProposals: (requestContext, moduleId) =>
      listRuntimeConfigProposalsFromEnvironment(
        environment,
        requestContext,
        moduleId,
      ),
  });

const makeLiveOperationsHomePendingApprovalsSource = (
  environment: unknown,
): OperationsHomePendingApprovalsSourceService =>
  makeOperationsHomePendingApprovalsSourceService({
    listRuntimeConfigProposals: (requestContext, moduleId) =>
      listRuntimeConfigProposalsFromEnvironment(
        environment,
        requestContext,
        moduleId,
      ),
  });

export const makeOperationsHomeRecentAuditSource = (
  audit: AuditLogModuleService,
  deps?: { readonly now?: () => Date },
): OperationsHomeRecentAuditSourceService => {
  const now = deps?.now ?? (() => new Date());
  return {
    fetch: (context) =>
      audit
        .queryByTenant({
          tenantScope: context.requestContext.tenant.scope,
          tenantScopeId: context.requestContext.tenant.scopeId,
        })
        .pipe(
          Effect.map((events) => {
            const nowMs = now().getTime();
            return events
              .filter((event) =>
                isTimestampWithinWindow(
                  event.timestamp,
                  nowMs,
                  context.windowMinutes,
                ),
              )
              .slice(0, context.limit)
              .map(mapAuditEventToOperationsHomeRecentAuditEntry);
          }),
          Effect.mapError(
            (error) =>
              new OperationsHomeSourceUnavailable({
                section: operationsHomeSnapshotSection.recentAudit,
                reason: describeSourceFailure(
                  error,
                  "Recent audit source unavailable.",
                ),
              }),
          ),
        ),
  };
};

export const makeOperationsHomeActiveAlertsSource = (
  resolveIssuesClient: () => Effect.Effect<
    Pick<GlitchTipIssuesApiClientService, "listByLevel">,
    unknown
  >,
): OperationsHomeActiveAlertsSourceService => ({
  fetch: (context) =>
    resolveIssuesClient().pipe(
      Effect.flatMap((issuesClient) =>
        Effect.all(
          operationsHomeAlertLevels.map((level) =>
            issuesClient.listByLevel({
              tenant: context.requestContext.tenant,
              level,
              limit: ACTIVE_ALERTS_LIMIT,
            }),
          ),
          { concurrency: "unbounded" },
        ),
      ),
      Effect.map((groups) =>
        dedupeGlitchTipIssues(groups.flat())
          .filter((issue) => issue.status === "unresolved")
          .sort(
            (left, right) =>
              Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt),
          )
          .slice(0, ACTIVE_ALERTS_LIMIT)
          .map(mapGlitchTipIssueToOperationsHomeAlert),
      ),
      Effect.mapError(
        (error) =>
          new OperationsHomeSourceUnavailable({
            section: operationsHomeSnapshotSection.activeAlerts,
            reason: describeSourceFailure(
              error,
              "Active alerts source unavailable.",
            ),
          }),
      ),
    ),
});

export const makeOperationsHomeVendorPostureSource = (
  resolveHealthcheckPort: () => Effect.Effect<
    VendorHealthcheckPortService,
    unknown
  >,
  deps?: { readonly now?: () => Date },
): OperationsHomeVendorPostureSourceService => {
  const now = deps?.now ?? (() => new Date());
  return {
    fetch: (_context) =>
      resolveHealthcheckPort().pipe(
        Effect.flatMap((healthcheckPort) =>
          Effect.gen(function* () {
            const checkedAt = now().toISOString();
            const evaluations = yield* Effect.all(
              healthcheckPort.checkAll(now).map((entry) =>
                Effect.either(entry.result).pipe(
                  Effect.map((result) => ({
                    serviceName: entry.serviceName,
                    result,
                  })),
                ),
              ),
              { concurrency: "unbounded" },
            );
            if (
              evaluations.length === 0 ||
              evaluations.every((entry) => Either.isLeft(entry.result))
            ) {
              return yield* Effect.fail(
                new OperationsHomeSourceUnavailable({
                  section: operationsHomeSnapshotSection.vendorPosture,
                  reason: "Vendor posture source unavailable.",
                }),
              );
            }
            return evaluations
              .map(({ serviceName, result }) =>
                Either.isRight(result)
                  ? mapVendorHealthEntryToOperationsHomeVendorPosture(
                      result.right,
                    )
                  : mapVendorHealthEntryToOperationsHomeVendorPosture({
                      serviceName,
                      status: "unavailable",
                      latencyMs: 0,
                      lastCheckedAt: checkedAt,
                      message: describeSourceFailure(
                        result.left,
                        "Vendor healthcheck unavailable.",
                      ),
                    }),
              )
              .sort((left, right) => left.vendor.localeCompare(right.vendor));
          }),
        ),
        Effect.mapError((error) =>
          error instanceof OperationsHomeSourceUnavailable
            ? error
            : new OperationsHomeSourceUnavailable({
                section: operationsHomeSnapshotSection.vendorPosture,
                reason: describeSourceFailure(
                  error,
                  "Vendor posture source unavailable.",
                ),
              }),
        ),
      ),
  };
};

const makeLiveOperationsHomeActiveAlertsSource = (
  environment: unknown,
): OperationsHomeActiveAlertsSourceService => {
  let cachedClient:
    | Pick<GlitchTipIssuesApiClientService, "listByLevel">
    | undefined;
  const resolveIssuesClient = () =>
    cachedClient === undefined
      ? decodeOperationsHomeActiveAlertsEnvironment(environment).pipe(
          Effect.flatMap((resolved) =>
            makeGlitchtipAdapter({
              dsn: resolved.ERROR_TRACKING_DSN,
            }),
          ),
          Effect.map((adapter) => {
            cachedClient = makeDefaultGlitchTipIssuesApiClient(adapter);
            return cachedClient;
          }),
        )
      : Effect.succeed(cachedClient);
  return makeOperationsHomeActiveAlertsSource(resolveIssuesClient);
};

const noOpClose = Effect.succeed(undefined);

const makeLiveOperationsHomeVendorPostureSource = (
  environment: unknown,
  postgresHealthcheck: Effect.Effect<unknown, unknown>,
) => {
  let cachedPort: VendorHealthcheckPortService | undefined;
  let closeEffect: Effect.Effect<void, never> = noOpClose;
  const resolveHealthcheckPort = () =>
    cachedPort === undefined
      ? resolveVendorHealthAggregatorRuntimeOptionsFromEnvironment(
          environment,
        ).pipe(
          Effect.flatMap((resolved) =>
            Effect.gen(function* () {
              const keycloak = yield* makeKeycloakAdapter(
                resolved.adapters.keycloak,
              );
              const convex = yield* makeConvexAdapter(resolved.adapters.convex);
              const oryKeto = yield* makeOryKetoAdapter(
                resolved.adapters.oryKeto,
              );
              const valkey = yield* makeValkeyAdapter(resolved.adapters.valkey);
              const unleash = yield* makeUnleashAdapter(
                resolved.adapters.unleash,
              );
              const polar = yield* makePolarAdapter(resolved.adapters.polar);
              const openmeter = yield* makeOpenmeterAdapter(
                resolved.adapters.openmeter,
              );
              const novu = yield* makeNovuAdapter(resolved.adapters.novu);
              const postal = yield* makePostalAdapter(resolved.adapters.postal);
              const glitchtip = yield* makeGlitchtipAdapter(
                resolved.adapters.glitchtip,
              );
              const openpanel = yield* makeOpenPanelAdapter(
                resolved.adapters.openpanel,
              );
              const observability = yield* makeObservabilityAdapter(
                resolved.adapters.observability,
              );
              const meilisearch = yield* makeMeilisearchAdapter(
                resolved.adapters.meilisearch,
              );
              cachedPort = makeDefaultVendorHealthcheckPort({
                adapters: [
                  {
                    serviceName: platformAdapterServiceName.postgres,
                    healthcheck: postgresHealthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.convex,
                    healthcheck: convex.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.keycloak,
                    healthcheck: keycloak.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.oryKeto,
                    healthcheck: oryKeto.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.valkey,
                    healthcheck: valkey.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.unleash,
                    healthcheck: unleash.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.polar,
                    healthcheck: polar.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.openmeter,
                    healthcheck: openmeter.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.novu,
                    healthcheck: novu.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.postal,
                    healthcheck: postal.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.glitchtip,
                    healthcheck: glitchtip.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.openpanel,
                    healthcheck: openpanel.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.observability,
                    healthcheck: observability.healthcheck,
                  },
                  {
                    serviceName: platformAdapterServiceName.meilisearch,
                    healthcheck: meilisearch.healthcheck,
                  },
                ],
              });
              closeEffect = Effect.all(
                [Effect.ignore(valkey.close), Effect.ignore(unleash.close)],
                { discard: true },
              );
              return cachedPort;
            }),
          ),
        )
      : Effect.succeed(cachedPort);
  return {
    service: makeOperationsHomeVendorPostureSource(resolveHealthcheckPort),
    close: Effect.suspend(() => closeEffect),
  };
};

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
// Historical stub source layers retained as explicit test/export seams.
// The env-bound runtime now installs the live sources above; these
// exports remain only so service-level tests can still assert the
// documented stub behavior when needed.
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
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live KPI source instead.
  makeStubSource<OperationsHomeKpi>(
    operationsHomeSnapshotSection.kpis,
    "KPI source not yet wired (stubbed Phase 1 item 3).",
  ),
);

export const stubOperationsHomeActiveAlertsSourceLayer = Layer.succeed(
  OperationsHomeActiveAlertsSource,
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live GlitchTip-backed alerts source
  // instead.
  makeStubSource<OperationsHomeActiveAlert>(
    operationsHomeSnapshotSection.activeAlerts,
    "Active alerts source not yet wired (stubbed Phase 1 item 3).",
  ),
);

export const stubOperationsHomeRecentAuditSourceLayer = Layer.succeed(
  OperationsHomeRecentAuditSource,
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live recent-audit source instead.
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
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live governance-backed approvals source
  // instead.
  makeStubSource<OperationsHomePendingApproval>(
    operationsHomeSnapshotSection.pendingApprovals,
    "Pending approvals source not yet wired (stubbed Phase 1 item 3).",
  ),
);

export const stubOperationsHomeVendorPostureSourceLayer = Layer.succeed(
  OperationsHomeVendorPostureSource,
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live vendor-posture source instead.
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

const makeOperationsHomeRuntime = (
  environment: unknown,
  options: OperationsHomeRuntimeOptions,
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
    const audit = yield* makeAuditLogModule(auditLogRepository);
    const liveActiveAlerts =
      makeLiveOperationsHomeActiveAlertsSource(environment);
    const liveVendorPosture = makeLiveOperationsHomeVendorPostureSource(
      environment,
      postgres.healthcheck,
    );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, audit),
      Layer.succeed(
        OperationsHomeKpiSource,
        makeLiveOperationsHomeKpiSource(environment),
      ),
      Layer.succeed(OperationsHomeActiveAlertsSource, liveActiveAlerts),
      Layer.succeed(
        OperationsHomeRecentAuditSource,
        makeOperationsHomeRecentAuditSource(audit),
      ),
      Layer.succeed(
        OperationsHomePendingApprovalsSource,
        makeLiveOperationsHomePendingApprovalsSource(environment),
      ),
      Layer.succeed(
        OperationsHomeVendorPostureSource,
        liveVendorPosture.service,
      ),
    );
    const serviceLayer = makeOperationsHomeServiceLayer().pipe(
      Layer.provide(baseLayer),
    );
    return {
      serviceLayer,
      close: Effect.all(
        [Effect.ignore(postgres.close), liveVendorPosture.close],
        { discard: true },
      ),
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
      makeOperationsHomeRuntime(environment, options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(OperationsHomeService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
