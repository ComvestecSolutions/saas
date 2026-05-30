import { useMemo, useState, useTransition } from "react";
import { Schema } from "effect";
import {
  adminOperatorCapability,
  workflowJobStatus,
  type BillingRepairGap,
} from "@comvestec/contracts";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createAdminAppFileRoute } from "../file-route";
import {
  cancelAdminTenantRepairGap,
  replayAdminTenantRepairGap,
} from "../lib/tenant-repair-route-server";
import {
  EmptyState,
  HighRiskActionGuard,
  PermissionDeniedState,
  LoadingState,
  StatusChip,
  resolveStatusVariant,
  Button,
  type HighRiskReason,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../components/admin-session-required-state";
import {
  buildAdminTenantTarget,
  buildAdminTenantWorkspacePath,
} from "../lib/admin-tenant-target";
import {
  ScreenHeader,
  KpiCard,
  FilterBar,
  SegmentedTabs,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  AlertIcon,
  ExternalIcon,
  RefreshIcon,
  resolveTableAriaSort,
} from "../components/ui";
import { formatAdminTimestamp } from "../lib/timestamp-format";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../lib/effect-boundary";

type RepairSearch = { readonly inspectionReason?: string };

const RepairSearchSchema = Schema.Struct({
  inspectionReason: Schema.optional(Schema.Unknown),
});
const decodeRepairSearchBoundary = decodeSyncBoundary(RepairSearchSchema);
const decodeRepairSearchString = decodeSchemaOrUndefined(Schema.String);

const decodeTrimmedInspectionReason = (value: unknown): string | undefined => {
  const inspectionReason = decodeRepairSearchString(value)?.trim();
  return inspectionReason === undefined || inspectionReason.length === 0
    ? undefined
    : inspectionReason;
};

const parseRepairSearch = (search: unknown): RepairSearch => {
  const rawSearch = decodeRepairSearchBoundary(search);
  const inspectionReason = decodeTrimmedInspectionReason(
    rawSearch.inspectionReason,
  );
  return inspectionReason === undefined || inspectionReason.length === 0
    ? {}
    : { inspectionReason };
};

const countByStatus = (
  jobs: readonly BillingRepairGap[],
  status: (typeof workflowJobStatus)[keyof typeof workflowJobStatus],
) => jobs.filter((j) => j.status === status).length;

const formatActionError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    if ("reason" in error && typeof error.reason === "string")
      return error.reason;
    if ("message" in error && typeof error.message === "string")
      return error.message;
  }
  return "The repair action failed before the shared backend workflow completed.";
};

export const Route = createAdminAppFileRoute("/repair-operations")({
  validateSearch: parseRepairSearch,
  loaderDeps: ({ search: { inspectionReason } }) => ({ inspectionReason }),
  loader: ({ deps }) =>
    import("../lib/tenant-repair-route-loader").then(
      ({ loadAdminTenantRepairLoaderData }) =>
        loadAdminTenantRepairLoaderData(
          deps.inspectionReason === undefined
            ? {}
            : { inspectionReason: deps.inspectionReason },
        ),
    ),
  component: RepairOperations,
  pendingComponent: () => <LoadingState title="Loading repair operations…" />,
});

type StatusFilter =
  | "all"
  | "blocked"
  | "scheduled"
  | "running"
  | "completed"
  | "canceled";

type ArmedRepairAction = {
  readonly action: "replay" | "cancel";
  readonly job: BillingRepairGap;
} | null;

const replayReasonCatalog = [
  {
    id: "repair-gap.replay.transient-failure",
    label: "Transient backend failure",
    description:
      "Retry after the workflow backend or vendor dependency recovers.",
  },
  {
    id: "repair-gap.replay.configuration-fix",
    label: "Configuration fix deployed",
    description:
      "Replay after correcting tenant, billing, or module configuration.",
  },
  {
    id: "repair-gap.replay.support-escalation",
    label: "Support escalation approved",
    description:
      "Customer-impacting repair work is being replayed under operator review.",
  },
] as const satisfies readonly HighRiskReason[];

const cancelReasonCatalog = [
  {
    id: "repair-gap.cancel-manual-resolution",
    label: "Manual resolution applied",
    description:
      "The tenant issue was resolved without replaying the workflow.",
  },
  {
    id: "repair-gap.cancel-duplicate",
    label: "Duplicate or obsolete gap",
    description:
      "The queued repair no longer reflects the current tenant state.",
  },
  {
    id: "repair-gap.cancel-policy-block",
    label: "Policy or risk hold",
    description:
      "Execution is intentionally blocked pending a separate operator decision.",
  },
] as const satisfies readonly HighRiskReason[];

function RepairOperations() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate({ from: Route.fullPath });
  const replayGap = useServerFn(replayAdminTenantRepairGap);
  const cancelGap = useServerFn(cancelAdminTenantRepairGap);
  const [reasonInput, setReasonInput] = useState(search.inspectionReason ?? "");
  const [actionStatus, setActionStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [armedAction, setArmedAction] = useState<ArmedRepairAction>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const tableState = useTableState<
    "tenant" | "scope" | "status" | "attempts" | "scheduled"
  >({
    initialPageSize: 25,
    initialSortKey: "scheduled",
    initialSortDir: "desc",
  });

  const jobs = data.kind === "ready" ? data.jobs : [];

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? jobs
        : jobs.filter((j) => j.status === statusFilter),
    [jobs, statusFilter],
  );

  const { visible, total } = applyTableState(filtered, tableState, {
    searchOn: (row) => `${row.tenantScopeId} ${row.tenantScope} ${row.jobId}`,
    sortOn: {
      tenant: (r) => r.tenantScopeId,
      scope: (r) => r.tenantScope,
      status: (r) => r.status,
      attempts: (r) => r.attempts,
      scheduled: (r) => r.scheduledAt,
    },
  });

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator session to access repair operations."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate before accessing repair operations."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { summary } = data;
  const repairCapability = summary.capabilities.capabilities.find(
    (c) => c.capability === adminOperatorCapability.repairOperations,
  );
  const canRepair = repairCapability?.allowed === true;
  const blocked = countByStatus(jobs, workflowJobStatus.blocked);
  const scheduled = countByStatus(jobs, workflowJobStatus.scheduled);
  const running = countByStatus(jobs, workflowJobStatus.running);

  const applyReason = () => {
    const trimmed = reasonInput.trim();
    setActionStatus(null);
    startTransition(() => {
      void navigate({
        search: () =>
          trimmed.length === 0 ? {} : { inspectionReason: trimmed },
      });
    });
  };

  const handleActionConfirm = (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (armedAction === null) {
      return;
    }

    // The repair workflow backend currently records only the inspection
    // reason used to reveal sensitive details, so the high-risk reason
    // and note act as the operator approval boundary for this UI flow.
    void input.reasonId;
    void input.note;

    const selectedAction = armedAction;
    setArmedAction(null);
    setIsMutating(true);
    void (async () => {
      try {
        const sharedInput = {
          jobId: selectedAction.job.jobId,
          ...(search.inspectionReason === undefined
            ? {}
            : { inspectionReason: search.inspectionReason }),
        };
        if (selectedAction.action === "replay") {
          const result = await replayGap({ data: sharedInput });
          setActionStatus({
            kind: "success",
            message: `Replayed repair gap for ${result.job.tenantScopeId}.`,
          });
        } else {
          const result = await cancelGap({ data: sharedInput });
          setActionStatus({
            kind: "success",
            message: `Cancelled repair gap for ${result.job.tenantScopeId}.`,
          });
        }
        await router.invalidate({ sync: true });
      } catch (error) {
        setActionStatus({ kind: "error", message: formatActionError(error) });
      } finally {
        setIsMutating(false);
      }
    })();
  };

  return (
    <div className="ops-screen" data-testid="repair-operations-ready">
      <ScreenHeader
        icon={<AlertIcon />}
        title="Repair Operations"
        breadcrumbs={[{ label: "Operations" }, { label: "Repair Operations" }]}
        subtitle="Tenant provisioning and onboarding repair workflow state. Replay or cancel blocked repair gaps after operator review."
        actions={
          <button
            type="button"
            className="ops-btn"
            onClick={() => router.invalidate({ sync: true })}
            disabled={isPending || isMutating}
          >
            <RefreshIcon size={12} /> Refresh
          </button>
        }
      />

      <div className="ops-bento">
        <KpiCard label="Total gaps" value={jobs.length} tone="neutral" />
        <KpiCard
          label="Blocked"
          value={blocked}
          tone={blocked > 0 ? "alert" : "good"}
          icon={blocked > 0 ? <AlertIcon /> : undefined}
        />
        <KpiCard
          label="Running"
          value={running}
          tone={running > 0 ? "accent" : "neutral"}
        />
        <KpiCard
          label="Scheduled"
          value={scheduled}
          tone={scheduled > 0 ? "warn" : "neutral"}
        />
      </div>

      {canRepair && (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Workflow execution controls</p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
              alignItems: "end",
              marginBottom: 8,
            }}
          >
            <div className="ops-field">
              <label className="ops-field-label" htmlFor="inspection-reason">
                Inspection reason
              </label>
              <input
                id="inspection-reason"
                className="ops-field-input"
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="State why you need failure details for these repair gaps"
                autoComplete="off"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending || isMutating}
              onClick={applyReason}
            >
              {search.inspectionReason === undefined
                ? "Reveal details"
                : "Update reason"}
            </Button>
          </div>

          {search.inspectionReason !== undefined && (
            <div className="ops-feedback success" style={{ marginBottom: 8 }}>
              ✓ Failure details visible · Reason: {search.inspectionReason}
            </div>
          )}

          <div className="ops-feedback" style={{ marginTop: 0 }}>
            Repair actions automatically inherit the signed-in operator identity
            for workflow execution and audit.
          </div>

          {actionStatus !== null && (
            <div
              className={`ops-feedback ${actionStatus.kind}`}
              style={{ marginTop: 8 }}
            >
              {actionStatus.message}
            </div>
          )}
        </div>
      )}

      {!canRepair && (
        <div className="ops-feedback">
          {repairCapability?.reason ??
            "Repair workflow controls require a platform-operator session."}
        </div>
      )}

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Repair gaps
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search by tenant id, scope, or job id…"
          trailing={
            <SegmentedTabs<StatusFilter>
              ariaLabel="Status filter"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: "blocked", label: "Blocked" },
                { value: "scheduled", label: "Scheduled" },
                { value: "running", label: "Running" },
                { value: "completed", label: "Done" },
                { value: "canceled", label: "Canceled" },
              ]}
            />
          }
        />

        {visible.length === 0 ? (
          <EmptyState
            title="No repair gaps match"
            description="Try clearing filters or adjusting the search query."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table" data-testid="repair-operations-table">
              <thead>
                <tr>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "tenant")}
                    onToggle={() => tableState.toggleSort("tenant")}
                  >
                    Tenant
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "scope")}
                    onToggle={() => tableState.toggleSort("scope")}
                  >
                    Scope
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "status")}
                    onToggle={() => tableState.toggleSort("status")}
                  >
                    Status
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "attempts")}
                    onToggle={() => tableState.toggleSort("attempts")}
                    align="right"
                  >
                    Attempts
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "scheduled")}
                    onToggle={() => tableState.toggleSort("scheduled")}
                  >
                    Scheduled
                  </SortableTableHeader>
                  {search.inspectionReason !== undefined && <th>Last error</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => {
                  const canReplayJob =
                    canRepair && job.actionAvailability?.replay === true;
                  const canCancelJob =
                    canRepair && job.actionAvailability?.cancel === true;
                  const tenantTarget = buildAdminTenantTarget({
                    scope: job.tenantScope,
                    scopeId: job.tenantScopeId,
                  });

                  return (
                    <tr
                      key={job.jobId}
                      data-testid="repair-operations-row"
                      data-job-id={job.jobId}
                    >
                      <td className="text-strong mono">{job.tenantScopeId}</td>
                      <td>{job.tenantScope}</td>
                      <td>
                        <StatusChip
                          status={job.status}
                          variant={resolveStatusVariant(job.status)}
                        />
                      </td>
                      <td className="num">{job.attempts}</td>
                      <td className="mono">
                        {formatAdminTimestamp(job.scheduledAt)}
                      </td>
                      {search.inspectionReason !== undefined && (
                        <td>
                          {job.lastError !== undefined ? (
                            <span
                              style={{
                                fontSize: "0.78rem",
                                color: "var(--ops-status-error)",
                                fontFamily: "var(--ops-font-mono)",
                              }}
                            >
                              {job.lastError}
                            </span>
                          ) : (
                            <span className="ops-redacted">redacted</span>
                          )}
                        </td>
                      )}
                      <td>
                        <div className="ops-inline-actions">
                          {!canReplayJob && !canCancelJob && canRepair ? (
                            <span className="ops-secondary-text">
                              Action unavailable
                            </span>
                          ) : null}
                          {canReplayJob ? (
                            <button
                              type="button"
                              className="ops-btn ops-btn--primary ops-btn--xs"
                              data-testid="repair-operations-replay-cta"
                              data-job-id={job.jobId}
                              disabled={isPending || isMutating}
                              onClick={() => {
                                setActionStatus(null);
                                setArmedAction({
                                  action: "replay",
                                  job,
                                });
                              }}
                            >
                              Replay
                            </button>
                          ) : null}
                          {canCancelJob ? (
                            <button
                              type="button"
                              className="ops-btn ops-btn--danger ops-btn--xs"
                              data-testid="repair-operations-cancel-cta"
                              data-job-id={job.jobId}
                              disabled={isPending || isMutating}
                              onClick={() => {
                                setActionStatus(null);
                                setArmedAction({
                                  action: "cancel",
                                  job,
                                });
                              }}
                            >
                              Cancel
                            </button>
                          ) : null}
                          {tenantTarget === undefined ? (
                            <span className="ops-text-muted">—</span>
                          ) : (
                            <Link
                              className="ops-btn ops-btn--xs"
                              to={buildAdminTenantWorkspacePath(tenantTarget)}
                            >
                              <ExternalIcon size={11} /> Open
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </div>

      {armedAction !== null ? (
        <HighRiskActionGuard
          action={{
            id: `repair-gap-${armedAction.action}`,
            label:
              armedAction.action === "replay"
                ? "Replay repair gap"
                : "Cancel repair gap",
          }}
          selection={[armedAction.job]}
          reasons={
            armedAction.action === "replay"
              ? replayReasonCatalog
              : cancelReasonCatalog
          }
          confirmLabel={armedAction.action === "replay" ? "Replay" : "Cancel"}
          renderSelectionSummary={(selection) => {
            const [job] = selection;

            return job === undefined ? null : (
              <div className="ops-secondary-text">
                {job.tenantScopeId} · {job.jobId}
              </div>
            );
          }}
          onConfirm={handleActionConfirm}
          onCancel={() => setArmedAction(null)}
        />
      ) : null}
    </div>
  );
}
