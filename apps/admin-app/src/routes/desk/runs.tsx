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
  platformModuleIds,
  workflowRunStatus,
  workflowRunStatuses,
  type PlatformModuleId,
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

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type RunsFilter = "all" | "active" | "failed" | "stale" | "succeeded";

const knownModuleIds = new Set<string>(platformModuleIds);
const knownStatuses = new Set<string>(workflowRunStatuses);

const decodeLoaderInput = (raw: RawSearch): AdminWorkflowRunsListInput => {
  const filters: WorkflowRunsListFilters = {};
  if (raw.moduleId !== undefined && knownModuleIds.has(raw.moduleId)) {
    Object.assign(filters, { moduleId: raw.moduleId as PlatformModuleId });
  }
  if (raw.status !== undefined && knownStatuses.has(raw.status)) {
    Object.assign(filters, { status: raw.status as WorkflowRunStatus });
  }
  if (raw.since !== undefined && raw.since.length > 0) {
    Object.assign(filters, { since: raw.since });
  }
  if (raw.until !== undefined && raw.until.length > 0) {
    Object.assign(filters, { until: raw.until });
  }
  const parsedPageSize =
    raw.pageSize !== undefined ? Number.parseInt(raw.pageSize, 10) : NaN;
  const pageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, 500)
      : 50;
  const pageToken =
    raw.pageToken !== undefined && raw.pageToken.length > 0
      ? raw.pageToken
      : undefined;
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
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
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
  const tableState = useTableState<
    "run" | "module" | "workflow" | "status" | "queued" | "duration"
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
  const succeededCount = counts[workflowRunStatus.succeeded] ?? 0;
  const filteredRuns = result.runs.filter((run) =>
    resolveRunsFilter(run.status, filter),
  );
  const tableView = applyTableState(filteredRuns, tableState, {
    searchOn: (run) =>
      `${run.runId} ${run.moduleId} ${run.workflowKey} ${run.status}`,
    sortOn: {
      run: (run) => run.runId,
      module: (run) => run.moduleId,
      workflow: (run) => run.workflowKey,
      status: (run) => run.status,
      queued: (run) => run.queuedAt,
      duration: (run) => run.durationMs ?? -1,
    },
  });
  const focusedRun =
    result.runs.find((run) => run.status === workflowRunStatus.failed) ??
    result.runs.find((run) => run.status === workflowRunStatus.stale) ??
    result.runs[0];
  const slowestRun = result.runs.reduce<
    (typeof result.runs)[number] | undefined
  >(
    (current, run) =>
      current === undefined ||
      (run.durationMs ?? -1) > (current.durationMs ?? -1)
        ? run
        : current,
    undefined,
  );

  return (
    <section
      data-testid="workflow-runs-list-ready"
      data-pattern="workflow-runs-list-v3"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Workflow Runs"
        breadcrumbs={[{ label: "Resources" }, { label: "Workflow runs" }]}
        subtitle={
          <>
            {result.runs.length} runs · module{" "}
            <span className="mono">{filters.moduleId ?? "all"}</span> · status{" "}
            <span className="mono">{filters.status ?? "all"}</span>
          </>
        }
      />

      <div
        data-testid="workflow-runs-list-posture"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Succeeded"
          value={(counts[workflowRunStatus.succeeded] ?? 0).toString()}
          tone="good"
        />
        <KpiCard
          label="Running"
          value={(counts[workflowRunStatus.running] ?? 0).toString()}
          tone="accent"
        />
        <KpiCard
          label="Queued"
          value={(counts[workflowRunStatus.queued] ?? 0).toString()}
          tone="neutral"
        />
        <KpiCard
          label="Failed"
          value={(counts[workflowRunStatus.failed] ?? 0).toString()}
          tone={
            (counts[workflowRunStatus.failed] ?? 0) > 0 ? "alert" : "neutral"
          }
        />
        <KpiCard
          label="Stale"
          value={(counts[workflowRunStatus.stale] ?? 0).toString()}
          tone={(counts[workflowRunStatus.stale] ?? 0) > 0 ? "warn" : "neutral"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <section
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Attention queue</p>
          <div style={{ display: "grid", gap: 6 }}>
            <AttentionRow
              label="Succeeded runs"
              value={`${succeededCount}`}
              tone={succeededCount > 0 ? "neutral" : "warn"}
            />
            <AttentionRow
              label="Failed runs"
              value={`${counts[workflowRunStatus.failed] ?? 0}`}
              tone={
                (counts[workflowRunStatus.failed] ?? 0) > 0
                  ? "alert"
                  : "neutral"
              }
            />
            <AttentionRow
              label="Stale runs"
              value={`${counts[workflowRunStatus.stale] ?? 0}`}
              tone={
                (counts[workflowRunStatus.stale] ?? 0) > 0 ? "warn" : "neutral"
              }
            />
            <AttentionRow
              label="Partial failure buckets"
              value={`${partialFailures.length}`}
              tone={partialFailures.length > 0 ? "warn" : "neutral"}
            />
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Focused run</p>
          {focusedRun === undefined ? (
            <p className="ops-text-muted" style={{ margin: 0 }}>
              No workflow runs are currently available.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="mono">{focusedRun.runId}</span>
                <StatusChip
                  status={focusedRun.status}
                  variant={resolveStatusVariant(focusedRun.status)}
                />
              </div>
              <p style={{ margin: 0 }}>{focusedRun.workflowKey}</p>
              <div style={{ display: "grid", gap: 4 }}>
                <span className="ops-text-muted">
                  Module: <span className="mono">{focusedRun.moduleId}</span>
                </span>
                <span className="ops-text-muted">
                  Queued:{" "}
                  <span className="mono">
                    {formatDate(focusedRun.queuedAt)}
                  </span>
                </span>
                <span className="ops-text-muted">
                  Attempt: <span className="mono">{focusedRun.attempt}</span>
                </span>
              </div>
              <div>
                <Link
                  className="ops-btn ops-btn--xs"
                  to="/desk/run/$id"
                  params={{ id: focusedRun.runId }}
                >
                  Detail
                </Link>
              </div>
            </>
          )}
        </section>

        <section
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Slowest observed</p>
          {slowestRun === undefined ? (
            <p className="ops-text-muted" style={{ margin: 0 }}>
              No duration data reported yet.
            </p>
          ) : (
            <>
              <span className="mono">{slowestRun.runId}</span>
              <span>{slowestRun.workflowKey}</span>
              <span className="ops-text-muted">
                Duration:{" "}
                <span className="mono">{slowestRun.durationMs ?? "—"} ms</span>
              </span>
            </>
          )}
        </section>
      </div>

      {succeededCount === 0 ? (
        <section
          data-testid="workflow-runs-list-readiness"
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid rgba(255, 203, 107, 0.35)",
            borderRadius: 8,
            background: "rgba(98, 70, 18, 0.2)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>No successful runs yet</p>
          <p style={{ margin: 0 }}>
            Local end-to-end workflow validation requires the subscriber-journey
            readiness path to complete with valid Polar credentials. Run{" "}
            <span className="mono">
              bun run backend:subscriber-journey:ready:local
            </span>{" "}
            and then reopen this workspace.
          </p>
          <div>
            <Link className="ops-btn ops-btn--xs" to="/desk/vendors">
              Review vendor posture
            </Link>
          </div>
        </section>
      ) : null}

      <Tabs<RunsFilter>
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "All", count: result.runs.length },
          {
            value: "active",
            label: "Active",
            count:
              (counts[workflowRunStatus.running] ?? 0) +
              (counts[workflowRunStatus.queued] ?? 0),
          },
          {
            value: "failed",
            label: "Failed",
            count: counts[workflowRunStatus.failed] ?? 0,
          },
          {
            value: "stale",
            label: "Stale",
            count: counts[workflowRunStatus.stale] ?? 0,
          },
          {
            value: "succeeded",
            label: "Succeeded",
            count: counts[workflowRunStatus.succeeded] ?? 0,
          },
        ]}
      />

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          border: "1px solid var(--bg-2)",
          borderRadius: 8,
        }}
      >
        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search runs, workflow keys, or modules…"
        />
        {tableView.visible.length === 0 ? (
          <EmptyState
            title="No workflow runs match"
            description="Adjust the current search or status pivot to restore workflow runs."
          />
        ) : (
          <table
            data-testid="workflow-runs-list-entries-table"
            data-pattern="dense-data-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
            }}
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
                <th style={{ textAlign: "left", padding: 4 }}>Attempt</th>
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
                  Duration (ms)
                </SortableTableHeader>
                <th style={{ textAlign: "left", padding: 4 }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {tableView.visible.map((run) => (
                <tr
                  key={run.runId}
                  data-testid="workflow-runs-list-entry-row"
                  data-run-id={run.runId}
                  data-status={run.status}
                  data-module-id={run.moduleId}
                >
                  <td style={{ padding: 4 }} className="mono">
                    {run.runId}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {run.moduleId}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {run.workflowKey}
                  </td>
                  <td style={{ padding: 4 }}>
                    <StatusChip
                      status={run.status}
                      variant={resolveStatusVariant(run.status)}
                    />
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {run.attempt}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {formatDate(run.queuedAt)}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {run.durationMs ?? "—"}
                  </td>
                  <td style={{ padding: 4 }}>
                    <Link
                      to="/desk/run/$id"
                      params={{ id: run.runId }}
                      data-testid="workflow-runs-list-entry-link"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={tableView.total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </section>

      {partialFailures.length > 0 ? (
        <section
          data-testid="workflow-runs-list-partial-failures"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 6,
            border: "1px solid var(--bg-2)",
            borderRadius: 4,
          }}
        >
          <h2 style={{ fontSize: "0.9375rem", padding: 4, margin: 0 }}>
            Partial failures
          </h2>
          <ul style={{ margin: 0, padding: 4 }}>
            {partialFailures.map((failure) => (
              <li
                key={failure.bucket}
                data-testid="workflow-runs-list-partial-failure-row"
                data-bucket={failure.bucket}
              >
                <span className="mono">{failure.bucket}</span>: {failure.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function AttentionRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: "neutral" | "warn" | "alert";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: 6,
        borderRadius: 8,
        border:
          tone === "alert"
            ? "1px solid rgba(255, 122, 122, 0.35)"
            : tone === "warn"
              ? "1px solid rgba(255, 203, 107, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.08)",
        background:
          tone === "alert"
            ? "rgba(96, 24, 24, 0.24)"
            : tone === "warn"
              ? "rgba(98, 70, 18, 0.2)"
              : "rgba(255, 255, 255, 0.02)",
      }}
    >
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
