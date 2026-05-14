import { useState, useTransition } from "react";
import {
  adminOperatorCapability,
  workflowJobStatus,
  type BillingRepairGap,
} from "@comvestec/contracts";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createAdminAppFileRoute } from "../file-route";
import { loadAdminTenantRepairLoaderData } from "../lib/tenant-repair-route-loader";
import {
  cancelAdminTenantRepairGap,
  replayAdminTenantRepairGap,
} from "../lib/tenant-repair-route-server";
import {
  EmptyState,
  PermissionDeniedState,
  LoadingState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import { Button } from "@comvestec/ui";

type RepairSearch = {
  readonly inspectionReason?: string;
};

const parseRepairSearch = (search: Record<string, unknown>): RepairSearch => {
  const inspectionReason =
    typeof search.inspectionReason === "string"
      ? search.inspectionReason.trim()
      : undefined;

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
    loadAdminTenantRepairLoaderData(
      deps.inspectionReason === undefined
        ? {}
        : { inspectionReason: deps.inspectionReason },
    ),
  component: RepairOperations,
  pendingComponent: () => <LoadingState title="Loading repair operations…" />,
});

function RepairOperations() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate({ from: Route.fullPath });
  const replayGap = useServerFn(replayAdminTenantRepairGap);
  const cancelGap = useServerFn(cancelAdminTenantRepairGap);
  const [reasonInput, setReasonInput] = useState(search.inspectionReason ?? "");
  const [workflowToken, setWorkflowToken] = useState("");
  const [actionStatus, setActionStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator session to access repair operations."
      />
    );
  }

  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate before accessing repair operations."
      />
    );
  }

  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { jobs, summary } = data;
  const repairCapability = summary.capabilities.capabilities.find(
    (c) => c.capability === adminOperatorCapability.repairOperations,
  );
  const canRepair = repairCapability?.allowed === true;
  const blocked = countByStatus(jobs, workflowJobStatus.blocked);
  const scheduled = countByStatus(jobs, workflowJobStatus.scheduled);

  const applyReason = () => {
    const trimmed = reasonInput.trim();
    startTransition(() => {
      void navigate({
        search: () =>
          trimmed.length === 0 ? {} : { inspectionReason: trimmed },
      });
    });
  };

  const runAction = (action: "replay" | "cancel", jobId: string) => {
    const token = workflowToken.trim();
    if (token.length === 0) {
      setActionStatus({
        kind: "error",
        message:
          "A Keycloak bearer token from the same platform-operator session is required.",
      });
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const sharedInput = {
            jobId,
            workflowToken: token,
            ...(search.inspectionReason === undefined
              ? {}
              : { inspectionReason: search.inspectionReason }),
          };

          if (action === "replay") {
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
        }
      })();
    });
  };

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Repair Operations</h1>
        <p className="ops-screen-subtitle">
          Tenant provisioning and onboarding repair workflow state. Replay or
          cancel blocked repair gaps after operator review.
        </p>
      </div>

      {/* Summary posture */}
      <div className="ops-posture-grid" style={{ marginBottom: "4px" }}>
        <div className="ops-posture-card">
          <p className="ops-posture-label">Total gaps</p>
          <p className="ops-posture-value">{jobs.length}</p>
        </div>
        <div className={`ops-posture-card${blocked > 0 ? " accent" : ""}`}>
          <p className="ops-posture-label">Blocked</p>
          <p className="ops-posture-value">{blocked}</p>
        </div>
        <div className="ops-posture-card">
          <p className="ops-posture-label">Scheduled</p>
          <p className="ops-posture-value">{scheduled}</p>
        </div>
      </div>

      {/* Workflow controls */}
      {canRepair && (
        <div className="ops-card">
          <p className="ops-card-title">Workflow execution controls</p>

          {/* Inspection reason */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "8px",
              alignItems: "end",
              marginBottom: "12px",
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
              disabled={isPending}
              onClick={applyReason}
            >
              {search.inspectionReason === undefined
                ? "Reveal details"
                : "Update reason"}
            </Button>
          </div>

          {search.inspectionReason !== undefined && (
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--ops-status-active)",
                marginBottom: "12px",
              }}
            >
              ✓ Failure details visible · Reason: {search.inspectionReason}
            </p>
          )}

          {/* Bearer token */}
          <div className="ops-field" style={{ maxWidth: "480px" }}>
            <label className="ops-field-label" htmlFor="workflow-token">
              Workflow bearer token
            </label>
            <input
              id="workflow-token"
              className="ops-field-input"
              type="password"
              value={workflowToken}
              onChange={(e) => setWorkflowToken(e.target.value)}
              placeholder="Keycloak bearer token for this platform-operator session"
              autoComplete="off"
            />
          </div>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--ops-text-muted)",
              marginTop: "6px",
            }}
          >
            Replay and cancel preserve the same operator identity across the
            admin session, audit trail, and Convex workflow execution.
          </p>

          {actionStatus !== null && (
            <div
              className={`ops-feedback ${actionStatus.kind}`}
              style={{ marginTop: "10px" }}
            >
              {actionStatus.message}
            </div>
          )}
        </div>
      )}

      {!canRepair && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--ops-radius)",
            border: "1px solid var(--ops-border)",
            background: "var(--ops-surface-2)",
            fontSize: "0.85rem",
            color: "var(--ops-text-muted)",
          }}
        >
          {repairCapability?.reason ??
            "Repair workflow controls require a platform-operator session."}
        </div>
      )}

      {/* Repair gap list */}
      <div className="ops-card">
        <p className="ops-card-title">Unresolved repair gaps</p>
        {jobs.length === 0 ? (
          <EmptyState
            title="No unresolved repair gaps"
            description="All tenant provisioning and onboarding workflows are current."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Scheduled</th>
                  {search.inspectionReason !== undefined && <th>Last error</th>}
                  {canRepair && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId}>
                    <td className="text-strong mono">{job.tenantScopeId}</td>
                    <td>{job.tenantScope}</td>
                    <td>
                      <StatusChip
                        status={job.status}
                        variant={resolveStatusVariant(job.status)}
                      />
                    </td>
                    <td>{job.attempts}</td>
                    <td className="mono">
                      {job.scheduledAt.slice(0, 16).replace("T", " ")}
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
                    {canRepair && (
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={isPending}
                            onClick={() => runAction("replay", job.jobId)}
                          >
                            Replay
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={isPending}
                            onClick={() => runAction("cancel", job.jobId)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
