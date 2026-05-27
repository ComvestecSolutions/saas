/**
 * Workflow runs admin envelope platform service (admin-app
 * implementation plan §9 item 15). Operator Desk surface for
 * inspecting + replaying/canceling workflow-jobs runs.
 *
 * Composes:
 *
 *   - the {@link AuditLogModule} (one audit per accepted call)
 *   - an injected {@link AdminOrganizationRoleLookupPort} (Context.Tag
 *     — tests inject directly; the env-bound default Layer wraps
 *     `AdminOrganizationRepository.getMembershipByKeycloakSubjectId`)
 *   - an injected {@link WorkflowRunsPort} (Context.Tag — tests
 *     inject directly; the env-bound default Layer binds a live
 *     PostgreSQL-backed workflow-jobs port for list/detail and
 *     durable replay/cancel transitions). The platform service
 *     owns ALL authz + reason + attachment + audit + cache
 *     invariants ABOVE the port so swapping the underlying
 *     engine never erodes the contract.
 *
 * Owner-locked invariants enforced HERE (not in the HTTP
 * transport, not in the port):
 *
 *   - **Read authz** (`listRuns` / `getRunDetail`): requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`
 *     OR any admin-org membership (any role). Anonymous actors
 *     surface as {@link WorkflowRunsAdminUnauthorized}; missing
 *     actor identity surfaces as
 *     {@link WorkflowRunsAdminMissingActorIdentity}.
 *   - **Write authz** (`replayRun` / `cancelRun`): requires
 *     `actorType.platformOperator` OR `adminMemberRole.adminOwner`
 *     OR `adminMemberRole.adminAdmin`. Support operators are
 *     read-only; admin viewers/operators/etc. are denied.
 *   - **Reason catalog + attachment**: every write decodes its
 *     supplied `reason` against `ReasonCatalogIdSchema`,
 *     enforces `validateReasonForAction(reasonId, action)`, and
 *     rejects empty/whitespace `reasonAttachmentText` whenever
 *     the catalog entry declares `requiresAttachment: true` (both
 *     workflow-runs-admin.replay / .cancel declare it).
 *   - **Bounded pagination**: every list call clamps the decoded
 *     `pageSize` at `listPageSizeMax`; `pageSize` exceeding the
 *     cap surfaces as {@link WorkflowRunsAdminPageSizeTooLarge}.
 *   - **Field-security on read**: `lastError` is regulated-sensitive
 *     per the manifest; values that are not visible to the
 *     requesting actor class (anything below platform-operator /
 *     support-operator) are redacted via the injected
 *     {@link WorkflowRunsAdminFieldSecurityPort}. Detail responses
 *     redact `payloadProjection` the same way.
 *   - **Bounded list cache**: keyed by
 *     `actorScope|filters|pageSize|pageToken` and bounded by
 *     `cacheMaxSize` with `cacheTtlSeconds` freshness; insertion-
 *     order eviction. Writes invalidate by clearing the entire
 *     cache (run-level cardinality is small enough that the
 *     coarse eviction is the safest default).
 *   - **Partial failures**: per-bucket port failures degrade into
 *     `partialFailures` (mirrors universal-search). The aggregate
 *     only fails if the port surfaces a fatal error before any
 *     bucket completes.
 *
 * Runtime config: `runWorkflowRunsAdminFromEnvironment` decodes
 * `POSTGRES_URL` + `WORKFLOW_RUNS_ADMIN_CACHE_MAX_SIZE` +
 * `WORKFLOW_RUNS_ADMIN_CACHE_TTL_SECONDS` +
 * `WORKFLOW_RUNS_ADMIN_LIST_PAGE_SIZE_MAX` at the boundary with
 * NO local fallbacks.
 */
import { and, desc, eq, gt, gte, lt, lte, or } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import { workflowJobsRunningClaimTimeoutSeconds } from "@comvestec/config";
import {
  actorType,
  getReasonCatalogEntry,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  workflowJobStatus,
  workflowRunStatus,
  workflowRunsAdminAuditAction,
  WorkflowRunCancelInputSchema,
  WorkflowRunDetailInputSchema,
  WorkflowRunReplayInputSchema,
  WorkflowRunsListInputSchema,
  type AuditAction,
  type ReasonCatalogId,
  type RequestContext,
  type WorkflowRunCancelInput,
  type WorkflowRunCancelResult,
  type WorkflowRunDetail,
  type WorkflowRunDetailInput,
  type WorkflowRunReplayInput,
  type WorkflowRunReplayResult,
  type WorkflowRunStatus,
  type WorkflowRunSummary,
  type WorkflowRunsListInput,
  type WorkflowRunsListResult,
  type WorkflowRunsPartialFailure,
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
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  AdminOrganizationRepository,
  type AdminOrganizationRepositoryError,
  type AdminOrganizationRepositoryService,
  buildWorkflowJobsPostgresQueryable,
  makeAdminOrganizationRepositoryLayer,
  makeWorkflowJobsPostgresRepositoryForRecordSchema,
  type WorkflowJobRecord,
  WorkflowJobRecordSchema,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
  workflowJobsTable,
} from "@comvestec/modules";
import {
  makePostgresAdapter,
  type PostgresRuntimeDatabase,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "listRuns" | "getRunDetail" | "replayRun" | "cancelRun";

export class WorkflowRunsAdminUnauthorized {
  readonly _tag = "WorkflowRunsAdminUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId: string | undefined;
      readonly requestingActorType: string;
    },
  ) {}
}

export class WorkflowRunsAdminMissingActorIdentity {
  readonly _tag = "WorkflowRunsAdminMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class WorkflowRunsAdminReasonNotInCatalog {
  readonly _tag = "WorkflowRunsAdminReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class WorkflowRunsAdminReasonActionMismatch {
  readonly _tag = "WorkflowRunsAdminReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class WorkflowRunsAdminReasonAttachmentRequired {
  readonly _tag = "WorkflowRunsAdminReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class WorkflowRunsAdminRunNotFound {
  readonly _tag = "WorkflowRunsAdminRunNotFound" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly runId: string;
    },
  ) {}
}

export class WorkflowRunsAdminReplayUnavailable {
  readonly _tag = "WorkflowRunsAdminReplayUnavailable" as const;
  constructor(
    readonly args: {
      readonly runId: string;
      readonly status: WorkflowRunStatus;
    },
  ) {}
}

export class WorkflowRunsAdminCancelUnavailable {
  readonly _tag = "WorkflowRunsAdminCancelUnavailable" as const;
  constructor(
    readonly args: {
      readonly runId: string;
      readonly status: WorkflowRunStatus;
    },
  ) {}
}

export class WorkflowRunsAdminPageSizeTooLarge {
  readonly _tag = "WorkflowRunsAdminPageSizeTooLarge" as const;
  constructor(
    readonly args: {
      readonly requested: number;
      readonly maximum: number;
    },
  ) {}
}

export class WorkflowRunsAdminPortError {
  readonly _tag = "WorkflowRunsAdminPortError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly cause: unknown;
    },
  ) {}
}

export type WorkflowRunsAdminServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AdminOrganizationRepositoryError
  | WorkflowRunsAdminUnauthorized
  | WorkflowRunsAdminMissingActorIdentity
  | WorkflowRunsAdminReasonNotInCatalog
  | WorkflowRunsAdminReasonActionMismatch
  | WorkflowRunsAdminReasonAttachmentRequired
  | WorkflowRunsAdminRunNotFound
  | WorkflowRunsAdminReplayUnavailable
  | WorkflowRunsAdminCancelUnavailable
  | WorkflowRunsAdminPageSizeTooLarge
  | WorkflowRunsAdminPortError;

// ---------------------------------------------------------------------------
// WorkflowRunsPort
// ---------------------------------------------------------------------------

export type WorkflowRunsPortListResult = {
  readonly runs: ReadonlyArray<WorkflowRunSummary>;
  readonly nextPageToken?: string;
  readonly partialFailures?: ReadonlyArray<WorkflowRunsPartialFailure>;
};

export type WorkflowRunsPortService = {
  readonly listRuns: (input: {
    readonly filters: WorkflowRunsListInput["filters"];
    readonly pageSize: number;
    readonly pageToken?: string;
  }) => Effect.Effect<WorkflowRunsPortListResult, WorkflowRunsAdminPortError>;
  readonly getRunDetail: (input: {
    readonly runId: string;
  }) => Effect.Effect<
    Option.Option<WorkflowRunDetail>,
    WorkflowRunsAdminPortError
  >;
  readonly replayRun: (input: {
    readonly runId: string;
  }) => Effect.Effect<
    { readonly accepted: true; readonly replayRunId?: string },
    | WorkflowRunsAdminPortError
    | WorkflowRunsAdminRunNotFound
    | WorkflowRunsAdminReplayUnavailable
  >;
  readonly cancelRun: (input: {
    readonly runId: string;
  }) => Effect.Effect<
    { readonly accepted: true },
    | WorkflowRunsAdminPortError
    | WorkflowRunsAdminRunNotFound
    | WorkflowRunsAdminCancelUnavailable
  >;
};

export class WorkflowRunsPort extends Context.Tag("WorkflowRunsPort")<
  WorkflowRunsPort,
  WorkflowRunsPortService
>() {}

type WorkflowJobRow = typeof workflowJobsTable.$inferSelect;

const decodeWorkflowJobRow = (input: unknown) =>
  Schema.decodeUnknown(WorkflowJobRecordSchema)(input);

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildWorkflowRunsStaleThreshold = (now: Date) =>
  new Date(now.getTime() - workflowJobsRunningClaimTimeoutSeconds * 1_000);

const resolveWorkflowRunStatusFromJob = (
  job: Pick<WorkflowJobRecord, "status" | "updatedAt">,
  now: Date,
): WorkflowRunStatus => {
  switch (job.status) {
    case workflowJobStatus.scheduled:
      return workflowRunStatus.queued;
    case workflowJobStatus.running:
      return new Date(job.updatedAt).getTime() <=
        buildWorkflowRunsStaleThreshold(now).getTime()
        ? workflowRunStatus.stale
        : workflowRunStatus.running;
    case workflowJobStatus.completed:
      return workflowRunStatus.succeeded;
    case workflowJobStatus.blocked:
      return workflowRunStatus.stale;
    case workflowJobStatus.failed:
      return workflowRunStatus.failed;
    case workflowJobStatus.canceled:
      return workflowRunStatus.canceled;
  }
};

const buildWorkflowRunTiming = (input: {
  readonly queuedAt: string;
  readonly completedAt: string | undefined;
  readonly attempt: number;
  readonly status: WorkflowRunStatus;
}) => {
  const startedAt =
    input.status === workflowRunStatus.queued || input.attempt <= 0
      ? undefined
      : input.queuedAt;
  const finishedAt =
    input.status === workflowRunStatus.succeeded ||
    input.status === workflowRunStatus.failed ||
    input.status === workflowRunStatus.canceled
      ? input.completedAt
      : undefined;
  const durationMs =
    startedAt === undefined || finishedAt === undefined
      ? undefined
      : Math.max(
          0,
          new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
        );

  return {
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
};

const resolveAuditCorrelationId = (
  payload: WorkflowJobRecord["payload"],
  fallback: string,
) => {
  if (typeof payload !== "object" || payload === null) {
    return fallback;
  }

  const directCorrelationId = (payload as { correlationId?: unknown })
    .correlationId;
  if (
    typeof directCorrelationId === "string" &&
    directCorrelationId.length > 0
  ) {
    return directCorrelationId;
  }

  const requestContextCorrelationId = (
    payload as {
      requestContext?: {
        correlationId?: unknown;
      };
    }
  ).requestContext?.correlationId;
  if (
    typeof requestContextCorrelationId === "string" &&
    requestContextCorrelationId.length > 0
  ) {
    return requestContextCorrelationId;
  }

  const dispatchCorrelationId = (
    payload as {
      dispatch?: {
        correlationId?: unknown;
        requestContext?: {
          correlationId?: unknown;
        };
      };
    }
  ).dispatch?.correlationId;
  if (
    typeof dispatchCorrelationId === "string" &&
    dispatchCorrelationId.length > 0
  ) {
    return dispatchCorrelationId;
  }

  const dispatchRequestContextCorrelationId = (
    payload as {
      dispatch?: {
        requestContext?: {
          correlationId?: unknown;
        };
      };
    }
  ).dispatch?.requestContext?.correlationId;
  if (
    typeof dispatchRequestContextCorrelationId === "string" &&
    dispatchRequestContextCorrelationId.length > 0
  ) {
    return dispatchRequestContextCorrelationId;
  }

  return fallback;
};

const mapWorkflowJobToSummary = (
  job: WorkflowJobRecord,
  now: Date,
): WorkflowRunSummary => {
  const status = resolveWorkflowRunStatusFromJob(job, now);
  const attempt = Math.max(1, job.attempts);
  return {
    runId: job.jobId,
    moduleId: job.sourceModuleId,
    workflowKey: job.kind,
    status,
    queuedAt: job.scheduledAt,
    attempt,
    ...(job.lastError === undefined ? {} : { lastError: job.lastError }),
    ...buildWorkflowRunTiming({
      queuedAt: job.scheduledAt,
      completedAt: job.completedAt,
      attempt,
      status,
    }),
  };
};

const mapWorkflowJobToDetail = (
  job: WorkflowJobRecord,
  now: Date,
): WorkflowRunDetail => {
  const summary = mapWorkflowJobToSummary(job, now);
  return {
    ...summary,
    steps: [
      {
        stepKey: job.kind,
        status: summary.status,
        ...(summary.startedAt === undefined
          ? {}
          : { startedAt: summary.startedAt }),
        ...(summary.finishedAt === undefined
          ? {}
          : { finishedAt: summary.finishedAt }),
        ...(job.lastError === undefined ? {} : { error: job.lastError }),
      },
    ],
    payloadProjection: JSON.stringify(job.payload, null, 2) ?? "null",
    auditCorrelationId: resolveAuditCorrelationId(job.payload, job.jobId),
  };
};

const isReplayableWorkflowRun = (status: WorkflowRunStatus) =>
  status === workflowRunStatus.failed ||
  status === workflowRunStatus.canceled ||
  status === workflowRunStatus.stale;

const isCancelableWorkflowRun = (status: WorkflowRunStatus) =>
  status === workflowRunStatus.queued || status === workflowRunStatus.running;

const buildWorkflowRunsPageToken = (input: {
  readonly queuedAt: string;
  readonly runId: string;
}) => `${input.queuedAt}::${input.runId}`;

const decodeWorkflowRunsPageToken = (
  pageToken: string | undefined,
): { readonly queuedAt: Date; readonly runId: string } | undefined => {
  if (pageToken === undefined) {
    return undefined;
  }

  const separatorIndex = pageToken.indexOf("::");
  if (separatorIndex <= 0 || separatorIndex >= pageToken.length - 2) {
    return undefined;
  }

  const queuedAt = new Date(pageToken.slice(0, separatorIndex));
  const runId = pageToken.slice(separatorIndex + 2);
  if (Number.isNaN(queuedAt.getTime()) || runId.length === 0) {
    return undefined;
  }

  return { queuedAt, runId };
};

const toPortError = (operation: Operation, cause: unknown) =>
  cause instanceof WorkflowRunsAdminPortError
    ? cause
    : new WorkflowRunsAdminPortError({ operation, cause });

export type WorkflowRunsPortDependencies = {
  readonly listWorkflowJobRows: (input: {
    readonly filters: WorkflowRunsListInput["filters"];
    readonly pageSize: number;
    readonly pageToken?: string;
    readonly now: Date;
  }) => Effect.Effect<readonly WorkflowJobRow[], WorkflowRunsAdminPortError>;
  readonly getWorkflowJob: (input: {
    readonly jobId: string;
  }) => Effect.Effect<
    WorkflowJobRecord | undefined,
    WorkflowRunsAdminPortError
  >;
  readonly persistWorkflowJob: (
    record: WorkflowJobRecord,
  ) => Effect.Effect<WorkflowJobRecord, WorkflowRunsAdminPortError>;
  readonly cancelWorkflowJobIfUpdatedAtMatches: (input: {
    readonly jobId: string;
    readonly expectedUpdatedAt: string;
    readonly canceledAt: string;
  }) => Effect.Effect<
    WorkflowJobRecord | undefined,
    WorkflowRunsAdminPortError
  >;
  readonly now?: () => Date;
};

export const makeDefaultWorkflowRunsPort = (
  deps: WorkflowRunsPortDependencies,
): WorkflowRunsPortService => {
  const nowFn = deps.now ?? (() => new Date());

  return {
    listRuns: (input) =>
      Effect.gen(function* () {
        const now = nowFn();
        const rows = yield* deps.listWorkflowJobRows({
          filters: input.filters,
          pageSize: input.pageSize,
          ...(input.pageToken === undefined
            ? {}
            : { pageToken: input.pageToken }),
          now,
        });
        const visibleRows = rows.slice(0, input.pageSize);
        const jobs = yield* Effect.forEach(visibleRows, (row) =>
          decodeWorkflowJobRow({
            jobId: row.jobId,
            runtime: row.runtime,
            sourceModuleId: row.sourceModuleId,
            kind: row.kind,
            trigger: row.trigger,
            status: row.status,
            tenantScope: row.tenantScope,
            tenantScopeId: row.tenantScopeId,
            attempts: row.attempts,
            scheduledAt: row.scheduledAt.toISOString(),
            ...(row.completedAt == null
              ? {}
              : { completedAt: toIsoString(row.completedAt) }),
            ...(row.lastError == null ? {} : { lastError: row.lastError }),
            ...(row.gapReason == null ? {} : { gapReason: row.gapReason }),
            payload: row.payload,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }),
        );
        const lastVisibleRow = visibleRows.at(-1);

        return {
          runs: jobs.map((job) => mapWorkflowJobToSummary(job, now)),
          ...(rows.length > input.pageSize && lastVisibleRow !== undefined
            ? {
                nextPageToken: buildWorkflowRunsPageToken({
                  queuedAt: lastVisibleRow.scheduledAt.toISOString(),
                  runId: lastVisibleRow.jobId,
                }),
              }
            : {}),
        };
      }).pipe(Effect.mapError((cause) => toPortError("listRuns", cause))),
    getRunDetail: (input) =>
      Effect.gen(function* () {
        const job = yield* deps.getWorkflowJob({ jobId: input.runId });
        return job === undefined
          ? Option.none<WorkflowRunDetail>()
          : Option.some(mapWorkflowJobToDetail(job, nowFn()));
      }),
    replayRun: (input) =>
      Effect.gen(function* () {
        const now = nowFn().toISOString();
        const job = yield* deps.getWorkflowJob({ jobId: input.runId });
        if (job === undefined) {
          return yield* Effect.fail(
            new WorkflowRunsAdminRunNotFound({
              operation: "replayRun",
              runId: input.runId,
            }),
          );
        }

        const status = resolveWorkflowRunStatusFromJob(job, new Date(now));
        if (!isReplayableWorkflowRun(status)) {
          return yield* Effect.fail(
            new WorkflowRunsAdminReplayUnavailable({
              runId: input.runId,
              status,
            }),
          );
        }

        yield* deps
          .persistWorkflowJob({
            ...job,
            status: workflowJobStatus.scheduled,
            scheduledAt: now,
            completedAt: undefined,
            lastError: undefined,
            gapReason: undefined,
            updatedAt: now,
          })
          .pipe(Effect.mapError((cause) => toPortError("replayRun", cause)));

        return { accepted: true as const };
      }),
    cancelRun: (input) =>
      Effect.gen(function* () {
        const now = nowFn().toISOString();
        const job = yield* deps.getWorkflowJob({ jobId: input.runId });
        if (job === undefined) {
          return yield* Effect.fail(
            new WorkflowRunsAdminRunNotFound({
              operation: "cancelRun",
              runId: input.runId,
            }),
          );
        }

        const status = resolveWorkflowRunStatusFromJob(job, new Date(now));
        if (status === workflowRunStatus.canceled) {
          return { accepted: true as const };
        }
        if (!isCancelableWorkflowRun(status)) {
          return yield* Effect.fail(
            new WorkflowRunsAdminCancelUnavailable({
              runId: input.runId,
              status,
            }),
          );
        }

        const canceledOrMissing = yield* deps
          .cancelWorkflowJobIfUpdatedAtMatches({
            jobId: job.jobId,
            expectedUpdatedAt: job.updatedAt,
            canceledAt: now,
          })
          .pipe(Effect.mapError((cause) => toPortError("cancelRun", cause)));

        if (canceledOrMissing !== undefined) {
          return { accepted: true as const };
        }

        const currentJob = yield* deps.getWorkflowJob({ jobId: input.runId });
        if (currentJob === undefined) {
          return yield* Effect.fail(
            new WorkflowRunsAdminRunNotFound({
              operation: "cancelRun",
              runId: input.runId,
            }),
          );
        }
        if (
          resolveWorkflowRunStatusFromJob(currentJob, new Date(now)) ===
          workflowRunStatus.canceled
        ) {
          return { accepted: true as const };
        }

        return yield* Effect.fail(
          new WorkflowRunsAdminCancelUnavailable({
            runId: input.runId,
            status: resolveWorkflowRunStatusFromJob(currentJob, new Date(now)),
          }),
        );
      }),
  };
};

const buildWorkflowRunsStatusPredicate = (
  status: WorkflowRunsListInput["filters"]["status"],
  now: Date,
) => {
  const staleThreshold = buildWorkflowRunsStaleThreshold(now);
  switch (status) {
    case undefined:
      return undefined;
    case workflowRunStatus.queued:
      return eq(workflowJobsTable.status, workflowJobStatus.scheduled);
    case workflowRunStatus.running:
      return and(
        eq(workflowJobsTable.status, workflowJobStatus.running),
        gt(workflowJobsTable.updatedAt, staleThreshold),
      );
    case workflowRunStatus.stale:
      return or(
        eq(workflowJobsTable.status, workflowJobStatus.blocked),
        and(
          eq(workflowJobsTable.status, workflowJobStatus.running),
          lte(workflowJobsTable.updatedAt, staleThreshold),
        ),
      );
    case workflowRunStatus.succeeded:
      return eq(workflowJobsTable.status, workflowJobStatus.completed);
    case workflowRunStatus.failed:
      return eq(workflowJobsTable.status, workflowJobStatus.failed);
    case workflowRunStatus.canceled:
      return eq(workflowJobsTable.status, workflowJobStatus.canceled);
  }
};

const makeLiveWorkflowRunsPort = (input: {
  readonly database: PostgresRuntimeDatabase;
  readonly workflowJobsRepository: WorkflowJobsPostgresRepositoryServiceForRecord<WorkflowJobRecord>;
}) =>
  makeDefaultWorkflowRunsPort({
    listWorkflowJobRows: ({ filters, pageSize, pageToken, now }) =>
      Effect.tryPromise({
        try: () => {
          const cursor = decodeWorkflowRunsPageToken(pageToken);
          const statusPredicate = buildWorkflowRunsStatusPredicate(
            filters.status,
            now,
          );
          return input.database
            .select()
            .from(workflowJobsTable)
            .where(
              and(
                ...(filters.moduleId === undefined
                  ? []
                  : [eq(workflowJobsTable.sourceModuleId, filters.moduleId)]),
                ...(statusPredicate === undefined ? [] : [statusPredicate]),
                ...(filters.since === undefined
                  ? []
                  : [
                      gte(
                        workflowJobsTable.scheduledAt,
                        new Date(filters.since),
                      ),
                    ]),
                ...(filters.until === undefined
                  ? []
                  : [
                      lte(
                        workflowJobsTable.scheduledAt,
                        new Date(filters.until),
                      ),
                    ]),
                ...(cursor === undefined
                  ? []
                  : [
                      or(
                        lt(workflowJobsTable.scheduledAt, cursor.queuedAt),
                        and(
                          eq(workflowJobsTable.scheduledAt, cursor.queuedAt),
                          lt(workflowJobsTable.jobId, cursor.runId),
                        ),
                      ),
                    ]),
              ),
            )
            .orderBy(
              desc(workflowJobsTable.scheduledAt),
              desc(workflowJobsTable.jobId),
            )
            .limit(pageSize + 1);
        },
        catch: (cause) => toPortError("listRuns", cause),
      }),
    getWorkflowJob: ({ jobId }) =>
      input.workflowJobsRepository
        .getWorkflowJob({ jobId })
        .pipe(Effect.mapError((cause) => toPortError("getRunDetail", cause))),
    persistWorkflowJob: (record) =>
      input.workflowJobsRepository
        .persistWorkflowJob(record)
        .pipe(Effect.mapError((cause) => toPortError("replayRun", cause))),
    cancelWorkflowJobIfUpdatedAtMatches: (request) =>
      input.workflowJobsRepository
        .cancelWorkflowJobIfUpdatedAtMatches(request)
        .pipe(Effect.mapError((cause) => toPortError("cancelRun", cause))),
  });

export const makeStubWorkflowRunsPort = (): WorkflowRunsPortService => ({
  listRuns: () =>
    Effect.succeed({ runs: [] as ReadonlyArray<WorkflowRunSummary> }),
  getRunDetail: () => Effect.succeed(Option.none<WorkflowRunDetail>()),
  replayRun: (input) =>
    Effect.fail(
      new WorkflowRunsAdminRunNotFound({
        operation: "replayRun",
        runId: input.runId,
      }),
    ),
  cancelRun: (input) =>
    Effect.fail(
      new WorkflowRunsAdminRunNotFound({
        operation: "cancelRun",
        runId: input.runId,
      }),
    ),
});

export const makeStubWorkflowRunsPortLayer = Layer.succeed(
  WorkflowRunsPort,
  makeStubWorkflowRunsPort(),
);

// ---------------------------------------------------------------------------
// AdminOrganizationRoleLookupPort (mirrors capability-snapshot-v2)
// ---------------------------------------------------------------------------

export type WorkflowRunsAdminRoleLookupResult = {
  readonly role: AdminMemberRole | undefined;
};

export type WorkflowRunsAdminRoleLookupPortService = {
  readonly lookupRole: (input: {
    readonly actorId: string;
  }) => Effect.Effect<
    WorkflowRunsAdminRoleLookupResult,
    AdminOrganizationRepositoryError
  >;
};

export class WorkflowRunsAdminRoleLookupPort extends Context.Tag(
  "WorkflowRunsAdminRoleLookupPort",
)<WorkflowRunsAdminRoleLookupPort, WorkflowRunsAdminRoleLookupPortService>() {}

export const makeDefaultWorkflowRunsAdminRoleLookupPort = (
  repository: AdminOrganizationRepositoryService,
): WorkflowRunsAdminRoleLookupPortService => ({
  lookupRole: (input) =>
    repository.getMembershipByKeycloakSubjectId(input.actorId).pipe(
      Effect.map((opt) => ({
        role: Option.isSome(opt) ? opt.value.role : undefined,
      })),
    ),
});

export const makeDefaultWorkflowRunsAdminRoleLookupPortLayer = Layer.effect(
  WorkflowRunsAdminRoleLookupPort,
  Effect.gen(function* () {
    const repository = yield* AdminOrganizationRepository;
    return makeDefaultWorkflowRunsAdminRoleLookupPort(repository);
  }),
);

// ---------------------------------------------------------------------------
// Field-security port (regulated-sensitive redaction)
// ---------------------------------------------------------------------------

export type WorkflowRunsAdminFieldSecurityPortService = {
  readonly redactRegulatedSensitive: (actorTypeValue: string) => boolean;
};

export class WorkflowRunsAdminFieldSecurityPort extends Context.Tag(
  "WorkflowRunsAdminFieldSecurityPort",
)<
  WorkflowRunsAdminFieldSecurityPort,
  WorkflowRunsAdminFieldSecurityPortService
>() {}

export const makeDefaultWorkflowRunsAdminFieldSecurityPort =
  (): WorkflowRunsAdminFieldSecurityPortService => ({
    /**
     * Returns `true` when the requesting actor class is NOT
     * permitted to see `regulated-sensitive` values per the
     * field-security invariant — i.e. anyone outside of
     * platform-operator / support-operator.
     */
    redactRegulatedSensitive: (actorTypeValue) =>
      actorTypeValue !== actorType.platformOperator &&
      actorTypeValue !== actorType.supportOperator,
  });

export const makeDefaultWorkflowRunsAdminFieldSecurityPortLayer = Layer.succeed(
  WorkflowRunsAdminFieldSecurityPort,
  makeDefaultWorkflowRunsAdminFieldSecurityPort(),
);

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

const decodeListInput = Schema.decodeUnknown(WorkflowRunsListInputSchema);
const decodeDetailInput = Schema.decodeUnknown(WorkflowRunDetailInputSchema);
const decodeReplayInput = Schema.decodeUnknown(WorkflowRunReplayInputSchema);
const decodeCancelInput = Schema.decodeUnknown(WorkflowRunCancelInputSchema);
const decodeReasonCatalogIdValue = Schema.decodeUnknown(ReasonCatalogIdSchema);

// ---------------------------------------------------------------------------
// Authz helpers
// ---------------------------------------------------------------------------

const requireReadActor = (
  requestContext: RequestContext,
  operation: Operation,
  roleLookupPort: WorkflowRunsAdminRoleLookupPortService,
) =>
  Effect.gen(function* () {
    if (
      requestContext.actorType === actorType.anonymous ||
      requestContext.actorId === undefined
    ) {
      return yield* Effect.fail(
        new WorkflowRunsAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    if (
      requestContext.actorType === actorType.platformOperator ||
      requestContext.actorType === actorType.supportOperator
    ) {
      return requestContext.actorId;
    }
    // Any admin-org membership row is sufficient for read access.
    const lookup = yield* roleLookupPort.lookupRole({
      actorId: requestContext.actorId,
    });
    if (lookup.role === undefined) {
      return yield* Effect.fail(
        new WorkflowRunsAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return requestContext.actorId;
  });

const isWriteAllowedAdminRole = (role: AdminMemberRole): boolean =>
  role === adminMemberRole.adminOwner || role === adminMemberRole.adminAdmin;

const requireWriteActor = (
  requestContext: RequestContext,
  operation: Operation,
  roleLookupPort: WorkflowRunsAdminRoleLookupPortService,
) =>
  Effect.gen(function* () {
    if (
      requestContext.actorType === actorType.anonymous ||
      requestContext.actorId === undefined
    ) {
      return yield* Effect.fail(
        new WorkflowRunsAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    if (requestContext.actorType === actorType.platformOperator) {
      return requestContext.actorId;
    }
    const lookup = yield* roleLookupPort.lookupRole({
      actorId: requestContext.actorId,
    });
    if (lookup.role === undefined || !isWriteAllowedAdminRole(lookup.role)) {
      return yield* Effect.fail(
        new WorkflowRunsAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return requestContext.actorId;
  });

// ---------------------------------------------------------------------------
// Reason helpers
// ---------------------------------------------------------------------------

const validateReason = (
  operation: Operation,
  value: string,
  action: AuditAction,
): Effect.Effect<
  ReasonCatalogId,
  WorkflowRunsAdminReasonNotInCatalog | WorkflowRunsAdminReasonActionMismatch
> =>
  decodeReasonCatalogIdValue(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new WorkflowRunsAdminReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new WorkflowRunsAdminReasonActionMismatch({
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
): Effect.Effect<void, WorkflowRunsAdminReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText === undefined || attachmentText.trim().length === 0) {
    return Effect.fail(
      new WorkflowRunsAdminReasonAttachmentRequired({
        operation,
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

// ---------------------------------------------------------------------------
// Bounded list cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type CacheEntry = {
  readonly value: WorkflowRunsListResult;
  readonly cachedAtMs: number;
};

type ListCache = {
  readonly get: (key: string) => CacheEntry | undefined;
  readonly set: (key: string, entry: CacheEntry) => void;
  readonly clear: () => void;
  readonly size: () => number;
};

const createListCache = (maxSize: number): ListCache => {
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
    clear: () => {
      store.clear();
    },
    size: () => store.size,
  };
};

const buildListCacheKey = (input: {
  readonly requestContext: RequestContext;
  readonly filters: WorkflowRunsListInput["filters"];
  readonly pageSize: number;
  readonly pageToken: string | undefined;
}): string =>
  [
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
    input.filters.moduleId ?? "-",
    input.filters.status ?? "-",
    input.filters.since ?? "-",
    input.filters.until ?? "-",
    input.pageSize,
    input.pageToken ?? "-",
  ].join("|");

const isFresh = (cachedAtMs: number, nowMs: number, ttlSeconds: number) =>
  nowMs - cachedAtMs < ttlSeconds * 1000;

// ---------------------------------------------------------------------------
// Field-security redactors
// ---------------------------------------------------------------------------

const REDACTED_TEXT = "[redacted]" as const;

const redactSummary = (
  summary: WorkflowRunSummary,
  shouldRedact: boolean,
): WorkflowRunSummary =>
  shouldRedact && summary.lastError !== undefined
    ? { ...summary, lastError: REDACTED_TEXT }
    : summary;

const redactDetail = (
  detail: WorkflowRunDetail,
  shouldRedact: boolean,
): WorkflowRunDetail =>
  shouldRedact
    ? {
        ...detail,
        ...(detail.lastError === undefined ? {} : { lastError: REDACTED_TEXT }),
        payloadProjection: REDACTED_TEXT,
      }
    : detail;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type WorkflowRunsAdminListView = {
  readonly result: WorkflowRunsListResult;
  readonly fromCache: boolean;
};

export type WorkflowRunsAdminDetailView = {
  readonly detail: Option.Option<WorkflowRunDetail>;
};

export type WorkflowRunsAdminServiceImpl = {
  readonly listRuns: (
    input: WorkflowRunsListInput,
  ) => Effect.Effect<WorkflowRunsAdminListView, WorkflowRunsAdminServiceError>;
  readonly getRunDetail: (
    input: WorkflowRunDetailInput,
  ) => Effect.Effect<
    WorkflowRunsAdminDetailView,
    WorkflowRunsAdminServiceError
  >;
  readonly replayRun: (
    input: WorkflowRunReplayInput,
  ) => Effect.Effect<WorkflowRunReplayResult, WorkflowRunsAdminServiceError>;
  readonly cancelRun: (
    input: WorkflowRunCancelInput,
  ) => Effect.Effect<WorkflowRunCancelResult, WorkflowRunsAdminServiceError>;
};

export class WorkflowRunsAdminService extends Context.Tag(
  "WorkflowRunsAdminService",
)<WorkflowRunsAdminService, WorkflowRunsAdminServiceImpl>() {}

export type WorkflowRunsAdminRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly cacheTtlSeconds: number;
  readonly listPageSizeMax: number;
};

export type WorkflowRunsAdminServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly workflowRunsPort: WorkflowRunsPortService;
  readonly roleLookupPort: WorkflowRunsAdminRoleLookupPortService;
  readonly fieldSecurityPort: WorkflowRunsAdminFieldSecurityPortService;
  readonly bounds: WorkflowRunsAdminRuntimeBounds;
  readonly now?: () => Date;
};

export const makeWorkflowRunsAdminService = (
  deps: WorkflowRunsAdminServiceDependencies,
): WorkflowRunsAdminServiceImpl => {
  const {
    auditLog,
    workflowRunsPort,
    roleLookupPort,
    fieldSecurityPort,
    bounds,
  } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const cache = createListCache(Math.max(1, bounds.cacheMaxSize));

  const listRuns: WorkflowRunsAdminServiceImpl["listRuns"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListInput(input);
      if (decoded.pageSize > bounds.listPageSizeMax) {
        return yield* Effect.fail(
          new WorkflowRunsAdminPageSizeTooLarge({
            requested: decoded.pageSize,
            maximum: bounds.listPageSizeMax,
          }),
        );
      }
      yield* requireReadActor(
        decoded.requestContext,
        "listRuns",
        roleLookupPort,
      );

      const cacheKey = buildListCacheKey({
        requestContext: decoded.requestContext,
        filters: decoded.filters,
        pageSize: decoded.pageSize,
        pageToken: decoded.pageToken,
      });
      const nowMs = nowFn().getTime();
      const shouldRedact = fieldSecurityPort.redactRegulatedSensitive(
        decoded.requestContext.actorType,
      );

      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        if (isFresh(cached.cachedAtMs, nowMs, bounds.cacheTtlSeconds)) {
          yield* auditLog.append({
            requestContext: decoded.requestContext,
            moduleId: platformModuleId.workflowRunsAdmin,
            action: workflowRunsAdminAuditAction.listed,
            target: `pageSize:${decoded.pageSize}`,
            reason: reasonCatalogId.workflowRunsAdminReplay,
          });
          return { result: cached.value, fromCache: true } as const;
        }
      }

      const portResult = yield* workflowRunsPort.listRuns({
        filters: decoded.filters,
        pageSize: decoded.pageSize,
        ...(decoded.pageToken === undefined
          ? {}
          : { pageToken: decoded.pageToken }),
      });

      const redactedRuns = portResult.runs.map((summary) =>
        redactSummary(summary, shouldRedact),
      );
      const result: WorkflowRunsListResult = {
        runs: redactedRuns,
        ...(portResult.nextPageToken === undefined
          ? {}
          : { nextPageToken: portResult.nextPageToken }),
        ...(portResult.partialFailures === undefined ||
        portResult.partialFailures.length === 0
          ? {}
          : { partialFailures: portResult.partialFailures }),
      };

      cache.set(cacheKey, { value: result, cachedAtMs: nowMs });
      yield* auditLog.append({
        requestContext: decoded.requestContext,
        moduleId: platformModuleId.workflowRunsAdmin,
        action: workflowRunsAdminAuditAction.listed,
        target: `pageSize:${decoded.pageSize}`,
        reason: reasonCatalogId.workflowRunsAdminReplay,
      });
      return { result, fromCache: false } as const;
    });

  const getRunDetail: WorkflowRunsAdminServiceImpl["getRunDetail"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeDetailInput(input);
      yield* requireReadActor(
        decoded.requestContext,
        "getRunDetail",
        roleLookupPort,
      );

      const shouldRedact = fieldSecurityPort.redactRegulatedSensitive(
        decoded.requestContext.actorType,
      );
      const detail = yield* workflowRunsPort.getRunDetail({
        runId: decoded.runId,
      });

      yield* auditLog.append({
        requestContext: decoded.requestContext,
        moduleId: platformModuleId.workflowRunsAdmin,
        action: workflowRunsAdminAuditAction.detailRead,
        target: decoded.runId,
        reason: reasonCatalogId.workflowRunsAdminReplay,
      });

      return {
        detail: Option.map(detail, (d) => redactDetail(d, shouldRedact)),
      } as const;
    });

  const replayRun: WorkflowRunsAdminServiceImpl["replayRun"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeReplayInput(input);
      yield* requireWriteActor(
        decoded.requestContext,
        "replayRun",
        roleLookupPort,
      );
      const validatedReason = yield* validateReason(
        "replayRun",
        decoded.reason,
        workflowRunsAdminAuditAction.replayed,
      );
      yield* requireAttachmentIfNeeded(
        "replayRun",
        validatedReason,
        decoded.reasonAttachmentText,
      );

      const portResult = yield* workflowRunsPort.replayRun({
        runId: decoded.runId,
      });

      cache.clear();
      yield* auditLog.append({
        requestContext: { ...decoded.requestContext, reason: validatedReason },
        moduleId: platformModuleId.workflowRunsAdmin,
        action: workflowRunsAdminAuditAction.replayed,
        target: decoded.runId,
        reason: validatedReason,
      });

      const replayed: WorkflowRunReplayResult = {
        accepted: true as const,
        runId: decoded.runId,
        ...(portResult.replayRunId === undefined
          ? {}
          : { replayRunId: portResult.replayRunId }),
      };
      return replayed;
    });

  const cancelRun: WorkflowRunsAdminServiceImpl["cancelRun"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeCancelInput(input);
      yield* requireWriteActor(
        decoded.requestContext,
        "cancelRun",
        roleLookupPort,
      );
      const validatedReason = yield* validateReason(
        "cancelRun",
        decoded.reason,
        workflowRunsAdminAuditAction.canceled,
      );
      yield* requireAttachmentIfNeeded(
        "cancelRun",
        validatedReason,
        decoded.reasonAttachmentText,
      );

      yield* workflowRunsPort.cancelRun({ runId: decoded.runId });

      cache.clear();
      yield* auditLog.append({
        requestContext: { ...decoded.requestContext, reason: validatedReason },
        moduleId: platformModuleId.workflowRunsAdmin,
        action: workflowRunsAdminAuditAction.canceled,
        target: decoded.runId,
        reason: validatedReason,
      });

      const canceled: WorkflowRunCancelResult = {
        accepted: true as const,
        runId: decoded.runId,
      };
      return canceled;
    });

  return { listRuns, getRunDetail, replayRun, cancelRun };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeWorkflowRunsAdminServiceLayer = (deps: {
  readonly bounds: WorkflowRunsAdminRuntimeBounds;
}) =>
  Layer.effect(
    WorkflowRunsAdminService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const workflowRunsPort = yield* WorkflowRunsPort;
      const roleLookupPort = yield* WorkflowRunsAdminRoleLookupPort;
      const fieldSecurityPort = yield* WorkflowRunsAdminFieldSecurityPort;
      return makeWorkflowRunsAdminService({
        auditLog,
        workflowRunsPort,
        roleLookupPort,
        fieldSecurityPort,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const WorkflowRunsAdminProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  WORKFLOW_RUNS_ADMIN_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  WORKFLOW_RUNS_ADMIN_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  WORKFLOW_RUNS_ADMIN_LIST_PAGE_SIZE_MAX: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeWorkflowRunsAdminProcessEnvironment = Schema.decodeUnknown(
  WorkflowRunsAdminProcessEnvironmentSchema,
);

export type WorkflowRunsAdminRuntimeOptions = {
  readonly postgresUrl: string;
  readonly bounds: WorkflowRunsAdminRuntimeBounds;
};

const resolveWorkflowRunsAdminRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeWorkflowRunsAdminProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): WorkflowRunsAdminRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        bounds: {
          cacheMaxSize: resolved.WORKFLOW_RUNS_ADMIN_CACHE_MAX_SIZE,
          cacheTtlSeconds: resolved.WORKFLOW_RUNS_ADMIN_CACHE_TTL_SECONDS,
          listPageSizeMax: resolved.WORKFLOW_RUNS_ADMIN_LIST_PAGE_SIZE_MAX,
        },
      }),
    ),
  );

const makeWorkflowRunsAdminRuntime = (
  options: WorkflowRunsAdminRuntimeOptions,
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
    const workflowJobsQueryable =
      buildWorkflowJobsPostgresQueryable(writeDatabase);
    const workflowJobsRepository =
      yield* makeWorkflowJobsPostgresRepositoryForRecordSchema(
        writeDatabase,
        workflowJobsQueryable,
        WorkflowJobRecordSchema,
      );
    const adminOrgRepositoryLayer =
      makeAdminOrganizationRepositoryLayer(writeDatabase);
    const baseLayer = Layer.mergeAll(
      adminOrgRepositoryLayer,
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      makeDefaultWorkflowRunsAdminRoleLookupPortLayer.pipe(
        Layer.provide(adminOrgRepositoryLayer),
      ),
      makeDefaultWorkflowRunsAdminFieldSecurityPortLayer,
      Layer.succeed(
        WorkflowRunsPort,
        makeLiveWorkflowRunsPort({
          database: postgres.database,
          workflowJobsRepository,
        }),
      ),
    );
    const serviceLayer = makeWorkflowRunsAdminServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type WorkflowRunsAdminRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runWorkflowRunsAdminFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: WorkflowRunsAdminServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | WorkflowRunsAdminRuntimeError> =>
  resolveWorkflowRunsAdminRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeWorkflowRunsAdminRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(WorkflowRunsAdminService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | WorkflowRunsAdminRuntimeError>;
