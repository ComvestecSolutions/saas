import { Schema } from "effect";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  EmptyState,
  StateScreen,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import {
  PlatformModuleIdSchema,
  WorkflowRunStatusSchema,
  workflowRunStatus,
  type WorkflowRunsListFilters,
  type WorkflowRunStatus,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  Tabs,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../lib/effect-boundary";
import { formatAdminNumber } from "../../lib/number-format";
import type {
  AdminWorkflowRunsListInput,
  AdminWorkflowRunsListRouteData,
} from "../../lib/workflow-runs-list-route-data";

/**
 * `/desk/runs` — canonical workflow runs surface.
 *
 * The route keeps the spec-canonical
 * `workflow-runs-list-{loader,route-data,route-server}` contract
 * and upgrades the list shell into a real operator workspace with
 * search, status pivots, sorting, pagination, focused-run context,
 * and partial-failure review.
 */

const RawSearchSchema = Schema.Struct({
  moduleId: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  since: Schema.optional(Schema.String),
  until: Schema.optional(Schema.String),
  pageSize: Schema.optional(Schema.String),
  pageToken: Schema.optional(Schema.String),
});
const RawSearchBoundarySchema = Schema.Struct({
  moduleId: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Unknown),
  since: Schema.optional(Schema.Unknown),
  until: Schema.optional(Schema.Unknown),
  pageSize: Schema.optional(Schema.Unknown),
  pageToken: Schema.optional(Schema.Unknown),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type RunsFilter = "all" | "active" | "failed" | "stale" | "succeeded";
const decodeRawSearchBoundary = decodeSyncBoundary(RawSearchBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const PositiveSearchNumberSchema = Schema.Union(
  Schema.Int.pipe(Schema.positive()),
  Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
);
const decodeModuleId = decodeSchemaOrUndefined(PlatformModuleIdSchema);
const decodeStatus = decodeSchemaOrUndefined(WorkflowRunStatusSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);
const decodePageSize = decodeSchemaOrUndefined(PositiveSearchNumberSchema);

const validateSearch = (raw: unknown): RawSearch => {
  const search = decodeRawSearchBoundary(raw);
  const moduleId = decodeSearchString(search.moduleId);
  const status = decodeSearchString(search.status);
  const since = decodeSearchString(search.since);
  const until = decodeSearchString(search.until);
  const pageSize = decodeSearchString(search.pageSize);
  const pageToken = decodeSearchString(search.pageToken);

  return {
    ...(moduleId === undefined ? {} : { moduleId }),
    ...(status === undefined ? {} : { status }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const decodeLoaderInput = (raw: RawSearch): AdminWorkflowRunsListInput => {
  const filters: WorkflowRunsListFilters = {};
  const moduleId = decodeModuleId(raw.moduleId);
  if (moduleId !== undefined) {
    Object.assign(filters, { moduleId });
  }
  const status = decodeStatus(raw.status);
  if (status !== undefined) {
    Object.assign(filters, { status });
  }
  const since = decodeNonEmptyString(raw.since);
  if (since !== undefined) {
    Object.assign(filters, { since });
  }
  const until = decodeNonEmptyString(raw.until);
  if (until !== undefined) {
    Object.assign(filters, { until });
  }
  const pageSize = Math.min(decodePageSize(raw.pageSize) ?? 50, 500);
  const pageToken = decodeNonEmptyString(raw.pageToken);
  return {
    filters,
    pageSize,
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const formatDate = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 16).replace("T", " ");

const resolveRunsFilter = (
  status: WorkflowRunStatus,
  filter: RunsFilter,
): boolean => {
  switch (filter) {
    case "active":
      return (
        status === workflowRunStatus.running ||
        status === workflowRunStatus.queued
      );
    case "failed":
      return status === workflowRunStatus.failed;
    case "stale":
      return status === workflowRunStatus.stale;
    case "succeeded":
      return status === workflowRunStatus.succeeded;
    default:
      return true;
  }
};

export const Route = createAdminAppFileRoute("/desk/runs")({
  validateSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/workflow-runs-list-loader").then(
      ({ loadAdminWorkflowRunsListLoaderData }) =>
        loadAdminWorkflowRunsListLoaderData(decodeLoaderInput(deps.search)),
    ),
  component: WorkflowRunsListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading workflow runs…" />
  ),
});

function WorkflowRunsListRoute() {
  const data: AdminWorkflowRunsListRouteData = Route.useLoaderData();
  const [filter, setFilter] = useState<RunsFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const tableState = useTableState<
    "run" | "module" | "workflow" | "status" | "attempt" | "queued" | "duration"
  >({
    initialPageSize: 25,
    initialSortKey: "queued",
    initialSortDir: "desc",
  });

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view workflow runs."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access workflow runs."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <StateScreen
        variant="denied"
        title="Access denied"
        description={data.reason}
      />
    );
  }
  if (data.kind === "error") {
    return (
      <StateScreen
        variant="5xx"
        title={data.title}
        description={data.description}
      />
    );
  }

  const { result, filters } = data;
  const counts = result.runs.reduce(
    (acc, run) => {
      acc[run.status] = (acc[run.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<WorkflowRunStatus, number>,
  );
  const partialFailures = result.partialFailures ?? [];
  const failedCount = counts[workflowRunStatus.failed] ?? 0;
  const queuedCount = counts[workflowRunStatus.queued] ?? 0;
  const runningCount = counts[workflowRunStatus.running] ?? 0;
  const staleCount = counts[workflowRunStatus.stale] ?? 0;
  const succeededCount = counts[workflowRunStatus.succeeded] ?? 0;
  const activeCount = queuedCount + runningCount;
  const hasServerFilters =
    filters.moduleId !== undefined ||
    filters.status !== undefined ||
    filters.since !== undefined ||
    filters.until !== undefined;
  const filteredRuns = result.runs.filter((run) =>
    resolveRunsFilter(run.status, filter),
  );
  const hasClientFilters =
    filter !== "all" || tableState.search.trim().length > 0;
  const tableView = applyTableState(filteredRuns, tableState, {
    searchOn: (run) =>
      `${run.runId} ${run.moduleId} ${run.workflowKey} ${run.status}`,
    sortOn: {
      run: (run) => run.runId,
      module: (run) => run.moduleId,
      workflow: (run) => run.workflowKey,
      status: (run) => run.status,
      attempt: (run) => run.attempt,
      queued: (run) => run.queuedAt,
      duration: (run) => run.durationMs ?? -1,
    },
  });
  const rosterRuns = tableView.visible;
  const focusedRun =
    rosterRuns.find((run) => run.runId === selectedRunId) ??
    rosterRuns.find((run) => run.status === workflowRunStatus.failed) ??
    rosterRuns.find((run) => run.status === workflowRunStatus.stale) ??
    rosterRuns[0];
  const focusedRunPinned =
    selectedRunId !== undefined && focusedRun?.runId === selectedRunId;
  const slowestRun = rosterRuns.reduce<
    (typeof result.runs)[number] | undefined
  >(
    (current, run) =>
      current === undefined ||
      (run.durationMs ?? -1) > (current.durationMs ?? -1)
        ? run
        : current,
    undefined,
  );
  const partialFailureBadgeClassName =
    partialFailures.length > 0
      ? "ops-signal-badge ops-signal-badge--warn"
      : "ops-signal-badge ops-signal-badge--good";
  const rosterCountLabel =
    tableView.total === result.runs.length
      ? `${formatAdminNumber(result.runs.length)} loaded`
      : `${formatAdminNumber(tableView.total)} matching / ${formatAdminNumber(result.runs.length)} loaded`;

  return (
    <section
      data-testid="workflow-runs-list-ready"
      data-pattern="workflow-runs-list-v4"
      className="ops-screen ops-screen--tight ops-stack-md"
    >
      <ScreenHeader
        title="Workflow Runs"
        breadcrumbs={[{ label: "Resources" }, { label: "Workflow runs" }]}
        subtitle={
          <>
            {formatAdminNumber(result.runs.length)} runs loaded · module{" "}
            <span className="mono">{filters.moduleId ?? "all"}</span> · status{" "}
            <span className="mono">{filters.status ?? "all"}</span>
          </>
        }
        actions={
          <>
            <Link className="ops-btn ops-btn--ghost" to="/desk/notify">
              Notification control
            </Link>
            <Link className="ops-btn ops-btn--ghost" to="/desk/vendors">
              Vendor health
            </Link>
          </>
        }
      />
      <div className="ops-stack-sm">
        <div className="ops-inline-cluster">
          <span className="ops-signal-badge ops-signal-badge--accent">
            {focusedRun === undefined
              ? "Roster overview"
              : focusedRunPinned
                ? "Pinned run"
                : "Focused run"}
          </span>
          <span className={partialFailureBadgeClassName}>
            {partialFailures.length === 0
              ? "No partial failures"
              : `${partialFailures.length} partial failure bucket${partialFailures.length === 1 ? "" : "s"}`}
          </span>
          {hasServerFilters ? (
            <span className="ops-signal-badge ops-signal-badge--accent">
              Server scope applied
            </span>
          ) : null}
          {hasClientFilters ? (
            <span className="ops-signal-badge ops-signal-badge--accent">
              Client filters active
            </span>
          ) : null}
          {succeededCount === 0 ? (
            <span className="ops-signal-badge ops-signal-badge--warn">
              Readiness incomplete
            </span>
          ) : null}
        </div>
        <div className="ops-pane-grid" data-testid="workflow-runs-list-posture">
          <KpiCard
            label="Runs loaded"
            value={formatAdminNumber(result.runs.length)}
          />
          <KpiCard
            label="Active"
            value={formatAdminNumber(activeCount)}
            tone={activeCount > 0 ? "accent" : "neutral"}
          />
          <KpiCard
            label="Failed"
            value={formatAdminNumber(failedCount)}
            tone={failedCount > 0 ? "alert" : "neutral"}
          />
          <KpiCard
            label="Succeeded"
            value={formatAdminNumber(succeededCount)}
            tone={succeededCount > 0 ? "good" : "warn"}
          />
          <KpiCard
            label="Stale"
            value={formatAdminNumber(staleCount)}
            tone={staleCount > 0 ? "warn" : "neutral"}
          />
          <KpiCard
            label="Slowest visible"
            value={formatRunDuration(slowestRun?.durationMs)}
            tone={
              slowestRun?.durationMs === undefined
                ? "neutral"
                : slowestRun.durationMs > 0
                  ? "warn"
                  : "good"
            }
          />
        </div>
      </div>

      <div
        className="ops-pane-grid"
        data-testid="workflow-runs-list-focus-grid"
      >
        <section className="ops-card" data-testid="workflow-runs-list-focus">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Focused run</p>
            <span className="ops-card-head__count">
              {focusedRun === undefined
                ? "No visible runs"
                : `Attempt ${focusedRun.attempt}`}
            </span>
          </div>
          {focusedRun === undefined ? (
            <div
              className="ops-stack-sm"
              data-testid="workflow-runs-list-focus-empty"
            >
              <p className="ops-note">
                Narrow the roster less aggressively or clear the current search
                to bring a run back into focus.
              </p>
              <div className="ops-inline-cluster">
                <Link
                  className="ops-btn ops-btn--ghost ops-btn--xs"
                  to="/desk/notify"
                >
                  Review notifications
                </Link>
                <Link
                  className="ops-btn ops-btn--ghost ops-btn--xs"
                  to="/desk/vendors"
                >
                  Check vendors
                </Link>
              </div>
            </div>
          ) : (
            <div
              className="ops-stack-sm"
              data-testid="workflow-runs-list-focus-summary"
            >
              <div className="ops-inline-cluster">
                <StatusChip
                  status={focusedRun.status}
                  variant={resolveStatusVariant(focusedRun.status)}
                />
                <span className="ops-signal-badge ops-signal-badge--accent">
                  {focusedRun.moduleId}
                </span>
                {focusedRunPinned ? (
                  <span className="ops-signal-badge ops-signal-badge--good">
                    Pinned
                  </span>
                ) : null}
              </div>
              <div className="ops-cell-stack">
                <span
                  className="ops-cell-stack__title mono ops-ellipsis"
                  data-testid="workflow-runs-list-focus-run-id"
                  title={focusedRun.runId}
                >
                  {focusedRun.runId}
                </span>
                <span
                  className="ops-text-muted ops-ellipsis"
                  data-testid="workflow-runs-list-focus-workflow-key"
                  title={focusedRun.workflowKey}
                >
                  {focusedRun.workflowKey}
                </span>
              </div>
              <p className="ops-note">
                {resolveFocusedRunNarrative(focusedRun, focusedRunPinned)}
              </p>
              <div className="ops-detail-grid">
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Queued</span>
                  <span className="mono">
                    {formatDate(focusedRun.queuedAt)}
                  </span>
                </div>
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Started</span>
                  <span className="mono">
                    {formatDate(focusedRun.startedAt)}
                  </span>
                </div>
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Finished</span>
                  <span className="mono">
                    {formatDate(focusedRun.finishedAt)}
                  </span>
                </div>
                <div className="ops-detail-card">
                  <span className="ops-detail-card__label">Duration</span>
                  <span className="mono">
                    {formatRunDuration(focusedRun.durationMs)}
                  </span>
                </div>
              </div>
              <div className="ops-inline-cluster">
                <Link
                  className="ops-btn ops-btn--primary ops-btn--xs"
                  to="/desk/run/$id"
                  params={{ id: focusedRun.runId }}
                >
                  Open detail
                </Link>
                {focusedRunPinned ? (
                  <button
                    type="button"
                    className="ops-btn ops-btn--ghost ops-btn--xs"
                    onClick={() => setSelectedRunId(undefined)}
                  >
                    Clear focus
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <section className="ops-card" data-testid="workflow-runs-list-review">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Workflow review</p>
            <span className="ops-card-head__count">{rosterCountLabel}</span>
          </div>
          <div className="ops-stack-sm">
            <div className="ops-detail-grid">
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">Failed runs</span>
                <span className="mono">{formatAdminNumber(failedCount)}</span>
              </div>
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">Stale runs</span>
                <span className="mono">{formatAdminNumber(staleCount)}</span>
              </div>
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">Succeeded runs</span>
                <span className="mono">
                  {formatAdminNumber(succeededCount)}
                </span>
              </div>
              <div className="ops-detail-card">
                <span className="ops-detail-card__label">Slowest visible</span>
                {slowestRun === undefined ? (
                  <span className="mono">—</span>
                ) : (
                  <div className="ops-stack-xs">
                    <span
                      className="mono ops-ellipsis"
                      data-testid="workflow-runs-list-slowest-run-id"
                      title={slowestRun.runId}
                    >
                      {slowestRun.runId}
                    </span>
                    <span className="ops-text-muted">
                      {formatRunDuration(slowestRun.durationMs)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {succeededCount === 0 ? (
              <div
                className="ops-card-shell ops-card-shell--dense"
                data-testid="workflow-runs-list-readiness"
              >
                <div className="ops-inline-cluster">
                  <span className="ops-signal-badge ops-signal-badge--warn">
                    No successful runs yet
                  </span>
                </div>
                <p className="ops-note">
                  Local end-to-end workflow validation requires the
                  subscriber-journey readiness path to complete with valid Polar
                  credentials. Run{" "}
                  <span className="mono">
                    bun run backend:subscriber-journey:ready:local
                  </span>{" "}
                  and then reopen this workspace.
                </p>
                <div className="ops-inline-cluster">
                  <Link
                    className="ops-btn ops-btn--ghost ops-btn--xs"
                    to="/desk/vendors"
                  >
                    Review vendor posture
                  </Link>
                </div>
              </div>
            ) : null}
            <div
              className="ops-stack-sm"
              data-testid="workflow-runs-list-partial-failures"
            >
              <div className="ops-inline-cluster">
                <span className={partialFailureBadgeClassName}>
                  {partialFailures.length === 0
                    ? "Workflow history healthy"
                    : "Partial failures require follow-up"}
                </span>
              </div>
              {partialFailures.length === 0 ? (
                <p
                  className="ops-note"
                  data-testid="workflow-runs-list-partial-failures-empty"
                >
                  Workflow history and backlog reads are currently healthy for
                  the loaded roster.
                </p>
              ) : (
                <div
                  className="ops-link-grid"
                  data-testid="workflow-runs-list-review-items"
                >
                  {partialFailures.map((failure) => (
                    <article
                      key={failure.bucket}
                      className="ops-card-shell ops-card-shell--dense"
                      data-testid="workflow-runs-list-partial-failure-row"
                      data-bucket={failure.bucket}
                    >
                      <div className="ops-inline-cluster">
                        <span className="ops-signal-badge ops-signal-badge--warn">
                          Partial failure
                        </span>
                        <span className="mono">{failure.bucket}</span>
                      </div>
                      <p className="ops-note">{failure.reason}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="ops-card" data-testid="workflow-runs-list-roster">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Run roster</p>
          <span className="ops-card-head__count">
            {formatAdminNumber(tableView.total)} visible
          </span>
        </div>
        <div className="ops-stack-sm ops-card-shell ops-card-shell--dense">
          <Tabs<RunsFilter>
            value={filter}
            onChange={setFilter}
            items={[
              { value: "all", label: "All", count: result.runs.length },
              {
                value: "active",
                label: "Active",
                count: activeCount,
              },
              {
                value: "failed",
                label: "Failed",
                count: failedCount,
              },
              {
                value: "stale",
                label: "Stale",
                count: staleCount,
              },
              {
                value: "succeeded",
                label: "Succeeded",
                count: succeededCount,
              },
            ]}
          />
          <FilterBar
            searchValue={tableState.search}
            onSearchChange={tableState.setSearch}
            searchPlaceholder="Search runs, workflow keys, or modules…"
          />
        </div>
        {rosterRuns.length === 0 ? (
          <div className="ops-card-shell">
            <EmptyState
              title="No workflow runs match"
              description="Adjust the current search or status pivot to restore workflow runs."
            />
          </div>
        ) : (
          <div className="ops-table-wrapper">
            <table
              className="ops-table"
              data-testid="workflow-runs-list-entries-table"
              aria-label="Workflow runs roster"
            >
              <thead>
                <tr>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "run")}
                    onToggle={() => tableState.toggleSort("run")}
                  >
                    Run
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "module")}
                    onToggle={() => tableState.toggleSort("module")}
                  >
                    Module
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "workflow")}
                    onToggle={() => tableState.toggleSort("workflow")}
                  >
                    Workflow
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "status")}
                    onToggle={() => tableState.toggleSort("status")}
                  >
                    Status
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "attempt")}
                    onToggle={() => tableState.toggleSort("attempt")}
                  >
                    Attempt
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "queued")}
                    onToggle={() => tableState.toggleSort("queued")}
                  >
                    Queued
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "duration")}
                    onToggle={() => tableState.toggleSort("duration")}
                  >
                    Duration
                  </SortableTableHeader>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rosterRuns.map((run) => {
                  const isSelected = focusedRun?.runId === run.runId;

                  return (
                    <tr
                      key={run.runId}
                      className={isSelected ? "is-selected" : undefined}
                      data-testid="workflow-runs-list-entry-row"
                      data-run-id={run.runId}
                      data-status={run.status}
                      data-module-id={run.moduleId}
                    >
                      <td>
                        <div className="ops-cell-stack">
                          <span className="ops-cell-stack__title mono">
                            {run.runId}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="ops-signal-badge ops-signal-badge--accent">
                          {run.moduleId}
                        </span>
                      </td>
                      <td className="mono">{run.workflowKey}</td>
                      <td>
                        <StatusChip
                          status={run.status}
                          variant={resolveStatusVariant(run.status)}
                        />
                      </td>
                      <td className="mono">{run.attempt}</td>
                      <td className="mono">{formatDate(run.queuedAt)}</td>
                      <td className="mono">
                        {formatRunDuration(run.durationMs)}
                      </td>
                      <td>
                        <div className="ops-inline-cluster">
                          <button
                            type="button"
                            className={
                              isSelected
                                ? "ops-btn ops-btn--primary ops-btn--xs"
                                : "ops-btn ops-btn--ghost ops-btn--xs"
                            }
                            data-testid="workflow-runs-list-entry-focus"
                            onClick={() => setSelectedRunId(run.runId)}
                          >
                            {isSelected ? "Focused" : "Focus"}
                          </button>
                          <Link
                            className="ops-btn ops-btn--ghost ops-btn--xs"
                            to="/desk/run/$id"
                            params={{ id: run.runId }}
                            data-testid="workflow-runs-list-entry-link"
                          >
                            Detail
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="ops-card-shell ops-card-shell--dense">
          <Pagination
            page={tableState.page}
            pageSize={tableState.pageSize}
            total={tableView.total}
            onPageChange={tableState.setPage}
            onPageSizeChange={tableState.setPageSize}
          />
        </div>
      </section>
    </section>
  );
}

function formatRunDuration(durationMs: number | undefined): string {
  return durationMs === undefined ? "—" : `${formatAdminNumber(durationMs)} ms`;
}

function resolveFocusedRunNarrative(
  run: Extract<
    AdminWorkflowRunsListRouteData,
    { readonly kind: "ready" }
  >["result"]["runs"][number],
  pinned: boolean,
): string {
  if (pinned) {
    return "Pinned from the visible roster so the detail signal stays stable while filters, search, and paging change around it.";
  }

  switch (run.status) {
    case workflowRunStatus.failed:
      return "Automatically escalated because the current visible roster includes a failed workflow run that needs operator review first.";
    case workflowRunStatus.stale:
      return "Automatically escalated because the current visible roster includes a stale workflow run that may need intervention.";
    default:
      return "Anchoring the visible roster with the first available run so detail, timing, and drill-through remain in view.";
  }
}
