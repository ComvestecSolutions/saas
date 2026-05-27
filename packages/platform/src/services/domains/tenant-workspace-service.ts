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
 *   - Tenant-overview source → **live** via tenant-branding runtime
 *     config overrides (displayName), tenant-branding custom-domain
 *     verifications (brandingState), billing subscriptions
 *     (planTier + billingStatus), and retention legal holds
 *     (legalHoldActive). Current MAU and support-tier indicators stay
 *     out of scope until dedicated reporting and support-governance
 *     owners exist.
 *   - Members source → **live** via the admin-tenant-management
 *     membership read surface. The first cut projects subject ids
 *     and canonical roles; last-seen enrichment remains a follow-up
 *     once an identity-session projection ships.
 *   - Recent activity source → **live** via
 *     `AuditLogModule.queryByTenant(...)`, filtered to the current
 *     snapshot window and bounded by `recentActivityLimit`.
 *   - Open incidents source → **live, healthcheck-backed** via the
 *     default GlitchTip issues client over
 *     `platformAdapterServiceName.glitchtip`. Until upstream
 *     tenant-scoped issue queries ship, the source returns honest
 *     empty arrays after a successful credential probe.
 *   - Usage spotlights source → **live, probe-backed** via the
 *     default OpenMeter and Polar clients. The current upstream
 *     clients resolve zero-valued usage/revenue envelopes after a
 *     successful credential probe so the tenant workspace renders
 *     honest empty metrics rather than section-level stubs.
 *   - Pending tenant-approvals source → **live** for tenant-scoped
 *     governance proposals (runtime-config + tenant-branding). A
 *     broader approval-workflow surface remains a follow-up for non-
 *     governance tenant approvals.
 */
import { Context, Effect, Either, Layer, ParseResult, Schema } from "effect";
import { configDefaultValue, tenantBrandingConfigKey } from "@comvestec/config";
import {
  actorType,
  authorizationRelation,
  billingSubscriptionStatus,
  customDomainLifecycleState,
  dataClassification,
  kpiTone,
  kpiTrendDirection,
  operationsHomeDrillResourceKind,
  platformModuleId,
  platformAdapterServiceName,
  platformScope,
  reasonCatalogId,
  retentionLegalHoldStatus,
  RequestContextSchema,
  TenantContextSchema,
  TenantWorkspaceOverviewSchema,
  TenantWorkspaceSnapshotSchema,
  tenantWorkspaceIncidentSeverity,
  tenantWorkspaceAuditAction,
  tenantWorkspaceBrandingState,
  tenantWorkspaceMemberRole,
  tenantWorkspaceSnapshotSection,
  type AuditEvent,
  type GlitchTipIssue,
  type GlitchTipIssueLevel,
  type RequestContext,
  type TenantContext,
  type TenantMembershipView,
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
  billingSubscriptionsTable,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  retentionLegalHoldsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactStatus,
  tenantBrandingDomainVerificationTable,
} from "@comvestec/modules";
import { and, desc, eq } from "drizzle-orm";
import {
  makeGlitchtipAdapter,
  makeOpenmeterAdapter,
  makePostgresAdapter,
  makePolarAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import {
  makeDefaultGlitchTipIssuesApiClient,
  type GlitchTipIssuesApiClientService,
} from "./glitchtip-issues-read-service";
import { runAdminTenantManagementFromEnvironment } from "./admin-tenant-management";
import {
  makeDefaultOpenMeterApiClient,
  type OpenMeterApiClientService,
} from "./open-meter-usage-query-service";
import {
  makeDefaultPolarApiClient,
  type PolarApiClientService,
} from "./polar-revenue-projection-service";
import {
  type AdminGovernanceRuntimeConfigProposalView,
  runAdminGovernanceFromEnvironment,
} from "../governance/admin-governance";
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
const OPEN_INCIDENTS_LIMIT = 10;
const PENDING_TENANT_APPROVALS_LIMIT = 10;
const TENANT_USAGE_METER_SLUG = "tenant.workspace.events";

const TenantWorkspaceOpenIncidentsEnvironmentSchema = Schema.Struct({
  ERROR_TRACKING_DSN: Schema.NonEmptyString,
});

const decodeTenantWorkspaceOpenIncidentsEnvironment = Schema.decodeUnknown(
  TenantWorkspaceOpenIncidentsEnvironmentSchema,
);

const TenantWorkspaceUsageSpotlightsEnvironmentSchema = Schema.Struct({
  OPENMETER_API_BASE_URL: Schema.NonEmptyString,
  OPENMETER_API_KEY: Schema.NonEmptyString,
  POLAR_API_BASE_URL: Schema.NonEmptyString,
  POLAR_API_KEY: Schema.NonEmptyString,
});

const decodeTenantWorkspaceUsageSpotlightsEnvironment = Schema.decodeUnknown(
  TenantWorkspaceUsageSpotlightsEnvironmentSchema,
);

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
const decodeOverview = Schema.decodeUnknown(TenantWorkspaceOverviewSchema);
const decodeSnapshot = Schema.decodeUnknown(TenantWorkspaceSnapshotSchema);

type TenantWorkspaceScopeCandidate = {
  readonly scope: TenantContext["scope"];
  readonly scopeId: string;
};

type TenantWorkspaceOverviewCompanyNameCandidate =
  TenantWorkspaceScopeCandidate & {
    readonly value: unknown;
  };

type TenantWorkspaceOverviewDomainVerificationCandidate =
  TenantWorkspaceScopeCandidate & {
    readonly lifecycleState: string;
  };

type TenantWorkspaceOverviewBillingCandidate = TenantWorkspaceScopeCandidate & {
  readonly planId: string;
  readonly status: string;
};

type TenantWorkspaceOverviewSourceDependencies = {
  readonly listCompanyNameCandidates: (
    tenant: TenantContext,
  ) => Effect.Effect<
    readonly TenantWorkspaceOverviewCompanyNameCandidate[],
    unknown
  >;
  readonly listDomainVerificationCandidates: (
    tenant: TenantContext,
  ) => Effect.Effect<
    readonly TenantWorkspaceOverviewDomainVerificationCandidate[],
    unknown
  >;
  readonly listBillingSubscriptionCandidates: (
    tenant: TenantContext,
  ) => Effect.Effect<
    readonly TenantWorkspaceOverviewBillingCandidate[],
    unknown
  >;
  readonly hasActiveLegalHold: (
    tenant: TenantContext,
  ) => Effect.Effect<boolean, unknown>;
};

const liveBillingSubscriptionStatuses = new Set<string>([
  billingSubscriptionStatus.pending,
  billingSubscriptionStatus.active,
  billingSubscriptionStatus.pastDue,
]);

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

const resolveTenantWorkspaceLookupCandidates = (
  tenant: TenantContext,
): ReadonlyArray<TenantWorkspaceScopeCandidate> => {
  const candidates: TenantWorkspaceScopeCandidate[] = [];

  const addCandidate = (
    scope: TenantWorkspaceScopeCandidate["scope"],
    scopeId: string,
  ) => {
    if (
      candidates.some(
        (candidate) =>
          candidate.scope === scope && candidate.scopeId === scopeId,
      )
    ) {
      return;
    }

    candidates.push({ scope, scopeId });
  };

  switch (tenant.scope) {
    case platformScope.individual:
      addCandidate(
        platformScope.individual,
        tenant.individualId ?? tenant.scopeId,
      );

      if (tenant.organizationId !== undefined) {
        addCandidate(platformScope.organization, tenant.organizationId);
      }

      if (tenant.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, tenant.enterpriseId);
      }

      break;
    case platformScope.organization:
      addCandidate(
        platformScope.organization,
        tenant.organizationId ?? tenant.scopeId,
      );

      if (tenant.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, tenant.enterpriseId);
      }

      break;
    case platformScope.enterprise:
      addCandidate(
        platformScope.enterprise,
        tenant.enterpriseId ?? tenant.scopeId,
      );
      break;
    case platformScope.platform:
      break;
  }

  addCandidate(platformScope.platform, platformScope.platform);

  return candidates;
};

const resolveMaterializedTenantDisplayName = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed === configDefaultValue.inherit) {
    return undefined;
  }

  return trimmed;
};

const resolveTenantWorkspaceOverviewBrandingState = (input: {
  readonly displayName?: string;
  readonly domainVerifications: readonly TenantWorkspaceOverviewDomainVerificationCandidate[];
}): TenantWorkspaceOverview["brandingState"] => {
  const activeDomain = input.domainVerifications.find(
    (candidate) =>
      candidate.lifecycleState === customDomainLifecycleState.active,
  );

  if (activeDomain !== undefined) {
    return tenantWorkspaceBrandingState.customDomainActive;
  }

  const pendingDomain = input.domainVerifications.find(
    (candidate) =>
      candidate.lifecycleState !== customDomainLifecycleState.retired,
  );

  if (pendingDomain !== undefined) {
    return tenantWorkspaceBrandingState.pendingReview;
  }

  return input.displayName === undefined
    ? tenantWorkspaceBrandingState.unpublished
    : tenantWorkspaceBrandingState.published;
};

const resolveTenantWorkspaceOverviewSubscription = (
  candidates: ReadonlyArray<TenantWorkspaceOverviewBillingCandidate>,
) =>
  candidates.find((candidate) =>
    liveBillingSubscriptionStatuses.has(candidate.status),
  ) ?? candidates[0];

export const makeTenantWorkspaceOverviewSourceService = (
  deps: TenantWorkspaceOverviewSourceDependencies,
): TenantWorkspaceOverviewSourceService => ({
  fetch: (context) =>
    Effect.all(
      {
        companyNames: deps.listCompanyNameCandidates(context.tenant),
        domainVerifications: deps.listDomainVerificationCandidates(
          context.tenant,
        ),
        billingSubscriptions: deps.listBillingSubscriptionCandidates(
          context.tenant,
        ),
        legalHoldActive: deps.hasActiveLegalHold(context.tenant),
      },
      { concurrency: "unbounded" },
    ).pipe(
      Effect.flatMap(
        ({
          companyNames,
          domainVerifications,
          billingSubscriptions,
          legalHoldActive,
        }) => {
          const companyName = companyNames
            .map((candidate) =>
              resolveMaterializedTenantDisplayName(candidate.value),
            )
            .find((candidate): candidate is string => candidate !== undefined);
          const displayName = companyName ?? context.tenant.scopeId;
          const subscription =
            resolveTenantWorkspaceOverviewSubscription(billingSubscriptions);
          return decodeOverview({
            displayName,
            brandingState: resolveTenantWorkspaceOverviewBrandingState({
              ...(companyName === undefined
                ? {}
                : { displayName: companyName }),
              domainVerifications,
            }),
            planTier: subscription?.planId ?? "unassigned",
            ...(subscription === undefined
              ? {}
              : { billingStatus: subscription.status }),
            legalHoldActive,
          });
        },
      ),
      Effect.mapError(
        (error) =>
          new TenantWorkspaceSourceUnavailable({
            section: tenantWorkspaceSnapshotSection.tenantOverview,
            reason: describeSourceFailure(
              error,
              "Tenant overview source unavailable.",
            ),
          }),
      ),
    ),
});

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

const mapAuditEventToTenantWorkspaceRecentActivityEntry = (
  event: AuditEvent,
): TenantWorkspaceRecentActivityEntry => ({
  id: event.eventId,
  actor: event.actorId,
  action: event.action,
  target: event.target,
  occurredAt: event.timestamp,
  classification: dataClassification.internal,
});

const tenantWorkspaceIncidentLevels = [
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

const mapGlitchTipLevelToIncidentSeverity = (
  level: GlitchTipIssue["level"],
): TenantWorkspaceOpenIncident["severity"] => {
  switch (level) {
    case "fatal":
    case "error":
      return tenantWorkspaceIncidentSeverity.critical;
    case "warning":
      return tenantWorkspaceIncidentSeverity.warning;
    default:
      return tenantWorkspaceIncidentSeverity.info;
  }
};

const mapGlitchTipIssueToOpenIncident = (
  issue: GlitchTipIssue,
): TenantWorkspaceOpenIncident => ({
  id: issue.issueId,
  vendor: platformAdapterServiceName.glitchtip,
  severity: mapGlitchTipLevelToIncidentSeverity(issue.level),
  title: issue.title,
  summary: issue.culprit,
  openedAt: issue.firstSeenAt,
  ...(issue.permalink === undefined ? {} : { deepLink: issue.permalink }),
});

const buildUsageQueryWindow = (windowMinutes: number, now: Date) => ({
  from: new Date(now.getTime() - windowMinutes * 60_000).toISOString(),
  to: now.toISOString(),
});

const resolveUsageQueryGranularity = (windowMinutes: number) =>
  windowMinutes <= 24 * 60 ? "HOUR" : "DAY";

const mapMembershipRelationsToTenantWorkspaceRole = (
  relations: TenantMembershipView["relations"],
): TenantWorkspaceMember["role"] => {
  if (relations.includes(authorizationRelation.owner)) {
    return tenantWorkspaceMemberRole.owner;
  }
  if (
    relations.includes(authorizationRelation.admin) ||
    relations.includes(authorizationRelation.editor)
  ) {
    return tenantWorkspaceMemberRole.admin;
  }
  if (relations.includes(authorizationRelation.member)) {
    return tenantWorkspaceMemberRole.member;
  }
  return tenantWorkspaceMemberRole.viewer;
};

export const makeTenantWorkspaceMembersSourceService = (deps: {
  readonly listTenantMemberships: (
    requestContext: RequestContext,
    tenant: TenantContext,
  ) => Effect.Effect<readonly TenantMembershipView[], unknown>;
}): TenantWorkspaceMembersSourceService => ({
  fetch: (context) =>
    deps.listTenantMemberships(context.requestContext, context.tenant).pipe(
      Effect.map((memberships) =>
        memberships
          .map((membership) => ({
            subjectId: membership.subject,
            displayName: membership.subject,
            role: mapMembershipRelationsToTenantWorkspaceRole(
              membership.relations,
            ),
          }))
          .sort((left, right) => left.subjectId.localeCompare(right.subjectId))
          .slice(0, context.limit),
      ),
      Effect.mapError(
        (error) =>
          new TenantWorkspaceSourceUnavailable({
            section: tenantWorkspaceSnapshotSection.members,
            reason: describeSourceFailure(error, "Members source unavailable."),
          }),
      ),
    ),
});

const resolveRequestedAt = (
  proposal: AdminGovernanceRuntimeConfigProposalView,
) => proposal.changedAt ?? proposal.generatedAt;

const mapGovernanceProposalToTenantPendingApproval = (
  proposal: AdminGovernanceRuntimeConfigProposalView,
): TenantWorkspacePendingApproval | null => {
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

export const makeTenantWorkspacePendingApprovalsSourceService = (deps: {
  readonly listRuntimeConfigProposals: (
    requestContext: RequestContext,
    moduleId: AdminGovernanceRuntimeConfigProposalView["moduleId"],
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigProposalView[],
    unknown
  >;
}): TenantWorkspacePendingApprovalsSourceService => ({
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
              proposal.status === runtimeConfigSyncArtifactStatus.pending &&
              proposal.scope === context.tenant.scope &&
              proposal.scopeId === context.tenant.scopeId,
          )
          .map(mapGovernanceProposalToTenantPendingApproval)
          .filter(
            (proposal): proposal is TenantWorkspacePendingApproval =>
              proposal !== null,
          )
          .sort(
            (left, right) =>
              Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
          )
          .slice(0, PENDING_TENANT_APPROVALS_LIMIT),
      ),
      Effect.mapError(
        (error) =>
          new TenantWorkspaceSourceUnavailable({
            section: tenantWorkspaceSnapshotSection.pendingTenantApprovals,
            reason: describeSourceFailure(
              error,
              "Pending tenant approvals source unavailable.",
            ),
          }),
      ),
    ),
});

export const makeTenantWorkspaceRecentActivitySource = (
  audit: AuditLogModuleService,
  deps?: { readonly now?: () => Date },
): TenantWorkspaceRecentActivitySourceService => {
  const now = deps?.now ?? (() => new Date());
  return {
    fetch: (context) =>
      audit
        .queryByTenant({
          tenantScope: context.tenant.scope,
          tenantScopeId: context.tenant.scopeId,
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
              .map(mapAuditEventToTenantWorkspaceRecentActivityEntry);
          }),
          Effect.mapError(
            (error) =>
              new TenantWorkspaceSourceUnavailable({
                section: tenantWorkspaceSnapshotSection.recentActivity,
                reason: describeSourceFailure(
                  error,
                  "Recent activity source unavailable.",
                ),
              }),
          ),
        ),
  };
};

export const makeTenantWorkspaceOpenIncidentsSource = (
  resolveIssuesClient: () => Effect.Effect<
    Pick<GlitchTipIssuesApiClientService, "listByLevel">,
    unknown
  >,
): TenantWorkspaceOpenIncidentsSourceService => ({
  fetch: (context) =>
    resolveIssuesClient().pipe(
      Effect.flatMap((issuesClient) =>
        Effect.all(
          tenantWorkspaceIncidentLevels.map((level) =>
            issuesClient.listByLevel({
              tenant: context.tenant,
              level,
              limit: OPEN_INCIDENTS_LIMIT,
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
          .slice(0, OPEN_INCIDENTS_LIMIT)
          .map(mapGlitchTipIssueToOpenIncident),
      ),
      Effect.mapError(
        (error) =>
          new TenantWorkspaceSourceUnavailable({
            section: tenantWorkspaceSnapshotSection.openIncidents,
            reason: describeSourceFailure(
              error,
              "Open incidents source unavailable.",
            ),
          }),
      ),
    ),
});

type TenantWorkspaceUsageClients = {
  readonly openMeterApiClient: Pick<
    OpenMeterApiClientService,
    "fetchUsageBuckets"
  >;
  readonly polarApiClient: Pick<
    PolarApiClientService,
    "fetchRevenueSnapshotSource"
  >;
};

export const makeTenantWorkspaceUsageSpotlightsSource = (
  resolveClients: () => Effect.Effect<TenantWorkspaceUsageClients, unknown>,
  deps?: { readonly now?: () => Date },
): TenantWorkspaceUsageSpotlightsSourceService => {
  const now = deps?.now ?? (() => new Date());
  return {
    fetch: (context) =>
      resolveClients().pipe(
        Effect.flatMap((clients) =>
          Effect.all(
            {
              usage: Effect.either(
                clients.openMeterApiClient.fetchUsageBuckets({
                  tenant: context.tenant,
                  subject: context.tenant.scopeId,
                  meterSlug: TENANT_USAGE_METER_SLUG,
                  window: buildUsageQueryWindow(context.windowMinutes, now()),
                  granularity: resolveUsageQueryGranularity(
                    context.windowMinutes,
                  ),
                }),
              ),
              revenue: Effect.either(
                clients.polarApiClient.fetchRevenueSnapshotSource({
                  tenant: context.tenant,
                }),
              ),
            },
            { concurrency: "unbounded" },
          ),
        ),
        Effect.flatMap(({ usage, revenue }) => {
          const spotlights: TenantWorkspaceUsageSpotlight[] = [];
          const failures: string[] = [];
          if (Either.isRight(usage)) {
            const totalUsage = usage.right.reduce(
              (sum, bucket) => sum + bucket.value,
              0,
            );
            spotlights.push({
              id: "usage-total",
              label: "Metered usage",
              value: totalUsage,
              unit: "events",
              trend: {
                direction: kpiTrendDirection.flat,
                delta: 0,
                windowMinutes: context.windowMinutes,
              },
              tone: kpiTone.nominal,
              drillResourceKind: operationsHomeDrillResourceKind.openmeterUsage,
              drillFilters: {
                tenantId: context.tenant.scopeId,
                meterSlug: TENANT_USAGE_METER_SLUG,
              },
            });
          } else {
            failures.push(
              describeSourceFailure(
                usage.left,
                "OpenMeter usage query unavailable.",
              ),
            );
          }
          if (Either.isRight(revenue)) {
            spotlights.push(
              {
                id: "active-subscriptions",
                label: "Active subscriptions",
                value: revenue.right.activeSubscriptionCount,
                unit: "subs",
                trend: {
                  direction: kpiTrendDirection.flat,
                  delta: 0,
                  windowMinutes: context.windowMinutes,
                },
                tone: kpiTone.nominal,
                drillResourceKind:
                  operationsHomeDrillResourceKind.billingInvoices,
                drillFilters: {
                  tenantId: context.tenant.scopeId,
                  polarAccountId: revenue.right.sourcePolarAccountId,
                },
              },
              {
                id: "projected-revenue",
                label: "Projected revenue",
                value:
                  revenue.right.projectedNextPeriodRevenue.amountMinorUnits /
                  100,
                unit: revenue.right.projectedNextPeriodRevenue.currency,
                trend: {
                  direction: kpiTrendDirection.flat,
                  delta: 0,
                  windowMinutes: context.windowMinutes,
                },
                tone: kpiTone.nominal,
                drillResourceKind:
                  operationsHomeDrillResourceKind.billingInvoices,
                drillFilters: {
                  tenantId: context.tenant.scopeId,
                  currency: revenue.right.projectedNextPeriodRevenue.currency,
                },
              },
            );
          } else {
            failures.push(
              describeSourceFailure(
                revenue.left,
                "Polar revenue projection unavailable.",
              ),
            );
          }
          return spotlights.length === 0
            ? Effect.fail(
                new TenantWorkspaceSourceUnavailable({
                  section: tenantWorkspaceSnapshotSection.usageSpotlights,
                  reason: failures.join(" | "),
                }),
              )
            : Effect.succeed(spotlights);
        }),
        Effect.mapError((error) =>
          error instanceof TenantWorkspaceSourceUnavailable
            ? error
            : new TenantWorkspaceSourceUnavailable({
                section: tenantWorkspaceSnapshotSection.usageSpotlights,
                reason: describeSourceFailure(
                  error,
                  "Usage spotlights source unavailable.",
                ),
              }),
        ),
      ),
  };
};

const sessionIdRequiredError = (message: string) =>
  Effect.fail(new Error(message));

const listTenantMembershipsFromEnvironment = (
  environment: unknown,
  requestContext: RequestContext,
  tenant: TenantContext,
) => {
  const sessionId = requestContext.sessionId;
  return sessionId === undefined
    ? sessionIdRequiredError("Tenant membership reads require a session id.")
    : runAdminTenantManagementFromEnvironment(environment, (service) =>
        service
          .listTenantMemberships({
            sessionId,
            tenant,
            ...(requestContext.reason === undefined
              ? {}
              : { inspectionReason: requestContext.reason }),
          })
          .pipe(Effect.map((result) => result.memberships)),
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

const makeLiveTenantWorkspaceMembersSource = (
  environment: unknown,
): TenantWorkspaceMembersSourceService =>
  makeTenantWorkspaceMembersSourceService({
    listTenantMemberships: (requestContext, tenant) =>
      listTenantMembershipsFromEnvironment(environment, requestContext, tenant),
  });

const makeLiveTenantWorkspacePendingApprovalsSource = (
  environment: unknown,
): TenantWorkspacePendingApprovalsSourceService =>
  makeTenantWorkspacePendingApprovalsSourceService({
    listRuntimeConfigProposals: (requestContext, moduleId) =>
      listRuntimeConfigProposalsFromEnvironment(
        environment,
        requestContext,
        moduleId,
      ),
  });

const makeLiveTenantWorkspaceOpenIncidentsSource = (
  environment: unknown,
): TenantWorkspaceOpenIncidentsSourceService => {
  let cachedClient:
    | Pick<GlitchTipIssuesApiClientService, "listByLevel">
    | undefined;
  const resolveIssuesClient = () =>
    cachedClient === undefined
      ? decodeTenantWorkspaceOpenIncidentsEnvironment(environment).pipe(
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
  return makeTenantWorkspaceOpenIncidentsSource(resolveIssuesClient);
};

const makeLiveTenantWorkspaceUsageSpotlightsSource = (
  environment: unknown,
): TenantWorkspaceUsageSpotlightsSourceService => {
  let cachedClients: TenantWorkspaceUsageClients | undefined;
  const resolveClients = () =>
    cachedClients === undefined
      ? decodeTenantWorkspaceUsageSpotlightsEnvironment(environment).pipe(
          Effect.flatMap((resolved) =>
            Effect.all({
              openmeter: makeOpenmeterAdapter({
                url: resolved.OPENMETER_API_BASE_URL,
                apiKey: resolved.OPENMETER_API_KEY,
              }),
              polar: makePolarAdapter({
                apiUrl: resolved.POLAR_API_BASE_URL,
                apiKey: resolved.POLAR_API_KEY,
              }),
            }),
          ),
          Effect.map(({ openmeter, polar }) => {
            cachedClients = {
              openMeterApiClient: makeDefaultOpenMeterApiClient(openmeter),
              polarApiClient: makeDefaultPolarApiClient(polar),
            };
            return cachedClients;
          }),
        )
      : Effect.succeed(cachedClients);
  return makeTenantWorkspaceUsageSpotlightsSource(resolveClients);
};

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
// Historical stub source layers retained as explicit test/export seams.
// The env-bound runtime now installs the live sources above; these
// exports remain only so service-level tests can still assert the
// documented stub behavior when needed.
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
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live overview source instead.
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
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live members source instead.
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
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live recent-activity source instead.
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
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live open-incidents source instead.
  makeStubArraySource<TenantWorkspaceOpenIncident>(
    tenantWorkspaceSnapshotSection.openIncidents,
    "Open incidents source not yet wired (stubbed Phase 1 item 4).",
  ),
);

export const stubTenantWorkspaceUsageSpotlightsSourceLayer = Layer.succeed(
  TenantWorkspaceUsageSpotlightsSource,
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live usage-spotlights source instead.
  makeStubArraySource<TenantWorkspaceUsageSpotlight>(
    tenantWorkspaceSnapshotSection.usageSpotlights,
    "Usage spotlights source not yet wired (stubbed Phase 1 item 4).",
  ),
);

export const stubTenantWorkspacePendingApprovalsSourceLayer = Layer.succeed(
  TenantWorkspacePendingApprovalsSource,
  // Historical test/export seam retained so the service-level unit
  // suite can still assert the documented stub surface. The env-bound
  // runtime now installs the live governance-backed approvals source
  // instead.
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

const makeTenantWorkspaceRuntime = (
  environment: unknown,
  options: TenantWorkspaceRuntimeOptions,
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
    const liveOverview = makeTenantWorkspaceOverviewSourceService({
      listCompanyNameCandidates: (tenant) =>
        Effect.tryPromise({
          try: async () => {
            const candidates = resolveTenantWorkspaceLookupCandidates(tenant);
            const rows = await Promise.all(
              candidates.map(async (candidate) => {
                const [row] = await postgres.database
                  .select({
                    value: runtimeConfigOverridesTable.value,
                  })
                  .from(runtimeConfigOverridesTable)
                  .where(
                    and(
                      eq(
                        runtimeConfigOverridesTable.moduleId,
                        platformModuleId.tenantBranding,
                      ),
                      eq(
                        runtimeConfigOverridesTable.key,
                        tenantBrandingConfigKey.companyName,
                      ),
                      eq(runtimeConfigOverridesTable.scope, candidate.scope),
                      eq(
                        runtimeConfigOverridesTable.scopeId,
                        candidate.scopeId,
                      ),
                    ),
                  )
                  .orderBy(desc(runtimeConfigOverridesTable.changedAt))
                  .limit(1);

                return row === undefined
                  ? undefined
                  : {
                      ...candidate,
                      value: row.value,
                    };
              }),
            );

            return rows.filter(
              (row): row is TenantWorkspaceOverviewCompanyNameCandidate =>
                row !== undefined,
            );
          },
          catch: (cause) => cause,
        }),
      listDomainVerificationCandidates: (tenant) =>
        Effect.tryPromise({
          try: async () => {
            const candidates = resolveTenantWorkspaceLookupCandidates(tenant);
            const rows = await Promise.all(
              candidates.map(async (candidate) => {
                const [row] = await postgres.database
                  .select({
                    lifecycleState:
                      tenantBrandingDomainVerificationTable.lifecycleState,
                  })
                  .from(tenantBrandingDomainVerificationTable)
                  .where(
                    and(
                      eq(
                        tenantBrandingDomainVerificationTable.scope,
                        candidate.scope,
                      ),
                      eq(
                        tenantBrandingDomainVerificationTable.scopeId,
                        candidate.scopeId,
                      ),
                    ),
                  )
                  .orderBy(
                    desc(tenantBrandingDomainVerificationTable.changedAt),
                  )
                  .limit(1);

                return row === undefined
                  ? undefined
                  : {
                      ...candidate,
                      lifecycleState: row.lifecycleState,
                    };
              }),
            );

            return rows.filter(
              (
                row,
              ): row is TenantWorkspaceOverviewDomainVerificationCandidate =>
                row !== undefined,
            );
          },
          catch: (cause) => cause,
        }),
      listBillingSubscriptionCandidates: (tenant) =>
        Effect.tryPromise({
          try: async () => {
            const candidates = resolveTenantWorkspaceLookupCandidates(tenant);
            const rows = await Promise.all(
              candidates.map(async (candidate) => {
                const [row] = await postgres.database
                  .select({
                    planId: billingSubscriptionsTable.planId,
                    status: billingSubscriptionsTable.status,
                  })
                  .from(billingSubscriptionsTable)
                  .where(
                    and(
                      eq(billingSubscriptionsTable.scope, candidate.scope),
                      eq(billingSubscriptionsTable.scopeId, candidate.scopeId),
                    ),
                  )
                  .orderBy(desc(billingSubscriptionsTable.updatedAt))
                  .limit(1);

                return row === undefined
                  ? undefined
                  : {
                      ...candidate,
                      planId: row.planId,
                      status: row.status,
                    };
              }),
            );

            return rows.filter(
              (row): row is TenantWorkspaceOverviewBillingCandidate =>
                row !== undefined,
            );
          },
          catch: (cause) => cause,
        }),
      hasActiveLegalHold: (tenant) =>
        Effect.tryPromise({
          try: async () => {
            const [row] = await postgres.database
              .select({
                legalHoldId: retentionLegalHoldsTable.legalHoldId,
              })
              .from(retentionLegalHoldsTable)
              .where(
                and(
                  eq(retentionLegalHoldsTable.scope, tenant.scope),
                  eq(retentionLegalHoldsTable.scopeId, tenant.scopeId),
                  eq(
                    retentionLegalHoldsTable.status,
                    retentionLegalHoldStatus.active,
                  ),
                ),
              )
              .limit(1);

            return row !== undefined;
          },
          catch: (cause) => cause,
        }),
    });
    const liveOpenIncidents =
      makeLiveTenantWorkspaceOpenIncidentsSource(environment);
    const liveUsageSpotlights =
      makeLiveTenantWorkspaceUsageSpotlightsSource(environment);
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, audit),
      Layer.succeed(TenantWorkspaceOverviewSource, liveOverview),
      Layer.succeed(
        TenantWorkspaceMembersSource,
        makeLiveTenantWorkspaceMembersSource(environment),
      ),
      Layer.succeed(
        TenantWorkspaceRecentActivitySource,
        makeTenantWorkspaceRecentActivitySource(audit),
      ),
      Layer.succeed(TenantWorkspaceOpenIncidentsSource, liveOpenIncidents),
      Layer.succeed(TenantWorkspaceUsageSpotlightsSource, liveUsageSpotlights),
      Layer.succeed(
        TenantWorkspacePendingApprovalsSource,
        makeLiveTenantWorkspacePendingApprovalsSource(environment),
      ),
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
      makeTenantWorkspaceRuntime(environment, options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(TenantWorkspaceService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
