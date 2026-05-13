import { useEffect, useState, useTransition } from "react";
import {
  adminOperatorCapability,
  actorType,
  workflowJobStatus,
  type BillingRepairGap,
} from "@comvestec/contracts";
import {
  useNavigate,
  useRouter,
  createFileRoute,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createAdminAppFileRoute } from "../file-route";
import { loadAdminTenantRepairLoaderData } from "../lib/tenant-repair-route-loader";
import {
  cancelAdminTenantRepairGap,
  replayAdminTenantRepairGap,
} from "../lib/tenant-repair-route-server";

type AdminTenantRepairRouteSearch = {
  readonly inspectionReason?: string;
};

const parseAdminTenantRepairRouteSearch = (
  search: Record<string, unknown>,
): AdminTenantRepairRouteSearch => {
  const inspectionReason =
    typeof search.inspectionReason === "string"
      ? search.inspectionReason.trim()
      : undefined;

  return inspectionReason === undefined || inspectionReason.length === 0
    ? {}
    : { inspectionReason };
};

export const Route = createAdminAppFileRoute("/")({
  validateSearch: parseAdminTenantRepairRouteSearch,
  loaderDeps: ({ search: { inspectionReason } }) => ({ inspectionReason }),
  loader: ({ deps }) =>
    loadAdminTenantRepairLoaderData({
      ...(deps.inspectionReason === undefined
        ? {}
        : { inspectionReason: deps.inspectionReason }),
    }),
  component: AdminShell,
});

type ActionStatus =
  | {
      readonly kind: "success";
      readonly message: string;
    }
  | {
      readonly kind: "error";
      readonly message: string;
    };

const formatTenantRepairActionError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    if ("reason" in error && typeof error.reason === "string") {
      return error.reason;
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return "The tenant repair action failed before the shared backend workflow completed.";
};

const countRepairGapsByStatus = (
  jobs: readonly BillingRepairGap[],
  status: (typeof workflowJobStatus)[keyof typeof workflowJobStatus],
) => jobs.filter((job) => job.status === status).length;

function AdminShell() {
  const routeData = Route.useLoaderData();
  const routeSearch = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate({ from: Route.fullPath });
  const replayTenantRepairGap = useServerFn(replayAdminTenantRepairGap);
  const cancelTenantRepairGap = useServerFn(cancelAdminTenantRepairGap);
  const [inspectionReasonInput, setInspectionReasonInput] = useState(
    routeSearch.inspectionReason ?? "",
  );
  const [workflowToken, setWorkflowToken] = useState("");
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setInspectionReasonInput(routeSearch.inspectionReason ?? "");
  }, [routeSearch.inspectionReason]);

  const applyInspectionReason = () => {
    const trimmedInspectionReason = inspectionReasonInput.trim();

    startTransition(() => {
      void navigate({
        search: () =>
          trimmedInspectionReason.length === 0
            ? {}
            : { inspectionReason: trimmedInspectionReason },
      });
    });
  };

  const runTenantRepairAction = (input: {
    readonly action: "replay" | "cancel";
    readonly jobId: string;
  }) => {
    const trimmedWorkflowToken = workflowToken.trim();

    if (trimmedWorkflowToken.length === 0) {
      setActionStatus({
        kind: "error",
        message:
          "A Keycloak bearer token from the same platform-operator session is required before replay or cancel can run.",
      });
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          if (input.action === "replay") {
            const result = await replayTenantRepairGap({
              data: {
                jobId: input.jobId,
                workflowToken: trimmedWorkflowToken,
                ...(routeSearch.inspectionReason === undefined
                  ? {}
                  : { inspectionReason: routeSearch.inspectionReason }),
              },
            });

            setActionStatus({
              kind: "success",
              message: `Replayed repair gap for ${result.job.tenantScopeId}.`,
            });
          } else {
            const result = await cancelTenantRepairGap({
              data: {
                jobId: input.jobId,
                workflowToken: trimmedWorkflowToken,
                ...(routeSearch.inspectionReason === undefined
                  ? {}
                  : { inspectionReason: routeSearch.inspectionReason }),
              },
            });

            setActionStatus({
              kind: "success",
              message: `Canceled repair gap for ${result.job.tenantScopeId}.`,
            });
          }

          await router.invalidate({ sync: true });
        } catch (error) {
          setActionStatus({
            kind: "error",
            message: formatTenantRepairActionError(error),
          });
        }
      })();
    });
  };

  if (routeData.kind === "shell") {
    return (
      <main className="app-shell">
        <section className="hero-panel">
          <p className="eyebrow">Platform governance</p>
          <h1>Tenant repair console</h1>
          <p className="lede">
            Tenant repair controls now live behind the same request-backed
            session boundary as the shared admin-billing service. Sign in with a
            platform-operator session before the admin app will load unresolved
            tenant repair gaps.
          </p>
        </section>

        <section className="card list-card">
          <h2>Current posture</h2>
          <p>An authenticated operator session is required.</p>
          <p className="meta">
            The admin app no longer falls back to preview snapshots or demo
            governance state when the repair workflow session boundary is
            missing.
          </p>
        </section>
      </main>
    );
  }

  if (routeData.kind === "stale-session") {
    return (
      <main className="app-shell">
        <section className="hero-panel">
          <p className="eyebrow">Platform governance</p>
          <h1>Session refresh required</h1>
          <p className="lede">
            The admin session cookie reached the app, but the shared identity
            session lookup could no longer resolve request context for it.
            Reauthenticate before replaying or canceling tenant repair gaps.
          </p>
        </section>
      </main>
    );
  }

  if (routeData.kind === "denied") {
    return (
      <main className="app-shell">
        <section className="hero-panel">
          <p className="eyebrow">Platform governance</p>
          <h1>Repair access denied</h1>
          <p className="lede">{routeData.reason}</p>
        </section>
      </main>
    );
  }

  const jobs = routeData.jobs;
  const summary = routeData.summary;
  const blockedCount = countRepairGapsByStatus(jobs, workflowJobStatus.blocked);
  const scheduledCount = countRepairGapsByStatus(
    jobs,
    workflowJobStatus.scheduled,
  );
  const staleRunningCount = countRepairGapsByStatus(
    jobs,
    workflowJobStatus.running,
  );
  const repairOperationsCapability = summary.capabilities.capabilities.find(
    (capability) =>
      capability.capability === adminOperatorCapability.repairOperations,
  );
  const enabledCapabilities = summary.capabilities.capabilities.filter(
    (capability) => capability.allowed,
  );

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Platform governance</p>
        <h1>Operations Home</h1>
        <p className="lede">
          The backend now aggregates current operator capabilities, governance
          posture, support queues, recent activity, and tenant repair workflow
          state through shared app-safe helpers instead of app-local stitching.
        </p>
      </section>

      <section className="grid">
        <article className="card featured-card">
          <h2>Open repair gaps</h2>
          <p>{summary.posture.openRepairGaps}</p>
          <p className="meta">
            Tenant provisioning and onboarding repair state stays durable in the
            shared workflow-jobs boundary.
          </p>
        </article>

        <article className="card">
          <h2>Open support cases</h2>
          <p>{summary.posture.openSupportCases}</p>
        </article>

        <article className="card">
          <h2>Pending break-glass reviews</h2>
          <p>{summary.posture.pendingBreakGlassIncidents}</p>
        </article>

        <article className="card">
          <h2>Pending runtime proposals</h2>
          <p>{summary.posture.pendingRuntimeConfigProposals}</p>
        </article>

        <article className="card">
          <h2>Scheduled retries</h2>
          <p>{scheduledCount}</p>
        </article>

        <article className="card">
          <h2>Blocked repairs</h2>
          <p>{blockedCount}</p>
        </article>

        <article className="card">
          <h2>Stale running</h2>
          <p>{staleRunningCount}</p>
        </article>
      </section>

      <section className="card list-card">
        <h2>Current operator surface</h2>
        <p className="meta">
          Enabled backend-backed capabilities for this trusted session:
        </p>
        <ul className="repair-list">
          {enabledCapabilities.map((capability) => (
            <li key={capability.capability} className="repair-item">
              <strong className="repair-title">{capability.label}</strong>
              <span className="inline-meta">{capability.routePath}</span>
            </li>
          ))}
        </ul>
      </section>

      {summary.alerts.length === 0 ? null : (
        <section className="card list-card">
          <h2>Operator alerts</h2>
          <ul className="repair-list">
            {summary.alerts.map((alert) => (
              <li key={alert.id} className="repair-item">
                <div className="repair-header">
                  <strong className="repair-title">{alert.title}</strong>
                  <span className="status-chip">{alert.severity}</span>
                </div>
                <span className="inline-meta">
                  {alert.detail} · {alert.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card control-card">
        <h2>Repair workflow execution</h2>
        {repairOperationsCapability?.allowed !== true ? (
          <p className="meta">
            {repairOperationsCapability?.reason ??
              "Repair workflow controls are not available for this operator session."}
          </p>
        ) : null}
        <div className="action-bar">
          <label className="token-field">
            <span className="field-label">Inspection reason</span>
            <input
              className="field-input"
              type="text"
              value={inspectionReasonInput}
              onChange={(event) => setInspectionReasonInput(event.target.value)}
              placeholder="State why you need failure details for these tenant repair gaps"
              autoComplete="off"
            />
          </label>
          <button
            className="action-button secondary"
            type="button"
            disabled={isPending || repairOperationsCapability?.allowed !== true}
            onClick={applyInspectionReason}
          >
            {routeSearch.inspectionReason === undefined
              ? "Reveal failure details"
              : "Update inspection reason"}
          </button>
        </div>

        <p className="meta">
          {routeSearch.inspectionReason === undefined
            ? "Failure details remain redacted until a platform operator records an inspection reason on this route. The shared backend uses that reason in the sensitive-read audit event for any visible lastError fields."
            : `Failure details are currently visible for inspection reason: ${routeSearch.inspectionReason}`}
        </p>

        <div className="action-bar">
          <label className="token-field">
            <span className="field-label">Workflow bearer token</span>
            <input
              className="field-input"
              type="password"
              value={workflowToken}
              onChange={(event) => setWorkflowToken(event.target.value)}
              placeholder="Paste the Keycloak bearer token for this platform-operator session"
              autoComplete="off"
            />
          </label>
        </div>
        <p className="meta">
          Replay and cancel reuse the same platform-operator identity across the
          admin session, audit trail, and Convex workflow execution. Use a token
          minted for the same {actorType.platformOperator} session that opened
          this route.
        </p>

        {actionStatus === null ? null : (
          <p
            className={
              actionStatus.kind === "success"
                ? "feedback-message feedback-success"
                : "feedback-message feedback-error"
            }
          >
            {actionStatus.message}
          </p>
        )}
      </section>

      <section className="card list-card">
        <h2>Recent backend activity</h2>
        {summary.recentActivity.items.length === 0 ? (
          <p className="meta">
            No recent projected audit activity is available.
          </p>
        ) : (
          <ul className="repair-list">
            {summary.recentActivity.items.map((event) => (
              <li key={event.eventId} className="repair-item">
                <strong className="repair-title">{event.moduleId}</strong>
                <span className="inline-meta">
                  {event.action} · {event.target}
                </span>
                <span className="inline-meta">{event.timestamp}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card list-card">
        <h2>Unresolved tenant repair gaps</h2>
        {repairOperationsCapability?.allowed !== true ? (
          <p className="meta">
            This operator can inspect shared operations posture, but repair-gap
            replay and cancellation remain hidden until a platform-operator
            session opens this screen.
          </p>
        ) : jobs.length === 0 ? (
          <p className="meta">
            No unresolved tenant provisioning or onboarding repair gaps are
            waiting for operator action.
          </p>
        ) : (
          <ul className="repair-list">
            {jobs.map((job) => (
              <li key={job.jobId} className="repair-item">
                <div className="repair-header">
                  <div>
                    <strong className="repair-title">
                      {job.tenantScopeId}
                    </strong>
                    <span className="inline-meta">
                      {job.tenantScope} repair gap
                      {job.gapReason === undefined ? "" : " · ${job.gapReason}"}
                    </span>
                  </div>
                  <span className={`status-chip status-${job.status}`}>
                    {job.status}
                  </span>
                </div>

                <span className="inline-meta">Job: {job.jobId}</span>
                <span className="inline-meta">
                  Attempts: {job.attempts} · Scheduled: {job.scheduledAt}
                </span>
                {job.lastError === undefined ? null : (
                  <span className="inline-meta">
                    Last error: {job.lastError}
                  </span>
                )}

                <div className="repair-actions">
                  <button
                    className="action-button"
                    type="button"
                    disabled={
                      isPending || repairOperationsCapability?.allowed !== true
                    }
                    onClick={() =>
                      runTenantRepairAction({
                        action: "replay",
                        jobId: job.jobId,
                      })
                    }
                  >
                    Replay
                  </button>
                  <button
                    className="action-button secondary"
                    type="button"
                    disabled={
                      isPending || repairOperationsCapability?.allowed !== true
                    }
                    onClick={() =>
                      runTenantRepairAction({
                        action: "cancel",
                        jobId: job.jobId,
                      })
                    }
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
