import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  HighRiskActionGuard,
  StateScreen,
  type HighRiskReason,
} from "@comvestec/ui";
import { supportOperationsBreakGlassIncidentStatus } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import { releaseAdminBreakGlassGrant } from "../../../lib/incident-detail-mutations-server";
import type { AdminIncidentDetailRouteData } from "../../../lib/incident-detail-route-data";
import { computeMinutesUntilReference } from "../../../lib/reference-time";

/**
 * `/desk/incident/$incidentId` — spec-canonical Break-glass
 * Incident Detail v2 surface shipped by Phase 5 Support /
 * compliance / integrations operator screens commit 1 (admin-app
 * implementation plan §8.8 + §11 + §8.12). Consumes the
 * `incident-detail-{loader,route-data,route-server}` trio gated
 * end-to-end through `resolveTrustedRequestContextFromSessionId`.
 *
 * Renders the approval timeline, reviewer panel, expiry
 * countdown, and a release-grant CTA gated through
 * `HighRiskActionGuard` per spec §8.13.
 *
 * The release-grant CTA now executes through the
 * `releaseAdminBreakGlassGrant` mutations-server entrypoint,
 * which binds the trusted-session request context to
 * `releaseBreakGlassGrantFromEnvironment`. The current backend
 * contract accepts the catalog reason id but not the guard note.
 */
const releaseReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "manual-break-glass.release.incident-closed",
    label: "Incident closed — release the active grant",
  },
  {
    id: "manual-break-glass.release.expired-soon",
    label: "Grant approaching expiry — release early",
  },
  {
    id: "manual-break-glass.release.policy-violation",
    label: "Policy violation detected — release immediately",
  },
];

export const Route = createAdminAppFileRoute("/desk/incident/$incidentId")({
  loader: async ({ params }) => {
    const { loadAdminIncidentDetailLoaderData } =
      await import("../../../lib/incident-detail-loader");
    return loadAdminIncidentDetailLoaderData({
      incidentId: params.incidentId,
    });
  },
  component: IncidentDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading incident detail…" />
  ),
});

function IncidentDetailRoute() {
  const data: AdminIncidentDetailRouteData = Route.useLoaderData();
  const router = useRouter();
  const releaseBreakGlassGrant = useServerFn(releaseAdminBreakGlassGrant);
  const [guardArmed, setGuardArmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const expiryMinutes = useMemo(() => {
    if (data.kind !== "ready") return null;
    return computeMinutesUntilReference(
      data.incident.expiresAt,
      data.generatedAt,
    );
  }, [data]);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view incident detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access incident detail."
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

  const { incident } = data;
  const isPending =
    incident.status === supportOperationsBreakGlassIncidentStatus.pendingReview;
  const isReviewed =
    incident.status === supportOperationsBreakGlassIncidentStatus.reviewed;
  const expired = expiryMinutes !== null && expiryMinutes <= 0;

  const handleReleaseConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    void input.note;

    try {
      const result = await releaseBreakGlassGrant({
        data: {
          caseId: incident.caseId,
          releaseReasonCatalogId: input.reasonId,
        },
      });
      setGuardArmed(false);
      setActionError(null);
      setActionSuccess(`Release accepted for ${result.caseId}.`);
      await router.invalidate();
    } catch (error) {
      setGuardArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to release the break-glass grant. Retry shortly.",
      );
    }
  };

  return (
    <section
      data-testid="incident-detail-ready"
      data-pattern="incident-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={incident.caseId}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Support", href: "/desk/support" },
          { label: incident.caseId },
        ]}
        subtitle={
          <>
            Status{" "}
            <span
              className="mono"
              data-testid="incident-detail-status-chip"
              data-status={incident.status}
            >
              {incident.status}
            </span>{" "}
            · Approved by{" "}
            <span data-testid="incident-detail-reviewer">
              {incident.approvedBy}
            </span>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="incident-detail-action-success"
          role="status"
          style={{
            padding: 6,
            color: "var(--status-success-fg)",
            background: "var(--status-success-bg)",
            border: "1px solid var(--status-success-border)",
            borderRadius: 4,
          }}
        >
          {actionSuccess}
        </div>
      ) : null}
      {actionError !== null ? (
        <div
          data-testid="incident-detail-action-error"
          role="alert"
          style={{
            padding: 6,
            color: "var(--status-error-fg)",
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            borderRadius: 4,
          }}
        >
          {actionError}
        </div>
      ) : null}

      <section
        data-testid="incident-detail-summary"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 6,
          border: "1px solid var(--bg-2)",
          borderRadius: 4,
        }}
      >
        <div>
          <strong>Reason:</strong>{" "}
          <span data-testid="incident-detail-reason">{incident.reason}</span>
        </div>
        <div>
          <strong>Started at:</strong>{" "}
          <span className="mono">{incident.startedAt}</span>
        </div>
        <div>
          <strong>Expires at:</strong>{" "}
          <span className="mono">{incident.expiresAt}</span>
        </div>
        <div
          data-testid="incident-detail-countdown"
          data-expired={expired ? "true" : "false"}
        >
          <strong>Expiry countdown:</strong>{" "}
          {expiryMinutes === null
            ? "—"
            : expired
              ? "Expired"
              : `${expiryMinutes} minutes remaining`}
        </div>
      </section>

      <section
        data-testid="incident-detail-timeline"
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
          Approval timeline
        </h2>
        <ol
          data-testid="incident-detail-timeline-list"
          style={{ padding: 4, margin: 0, listStyle: "none" }}
        >
          <li
            data-testid="incident-detail-timeline-event"
            data-event="started"
            style={{ padding: 4 }}
          >
            <span className="mono">{incident.startedAt}</span> · Break-glass
            grant approved by {incident.approvedBy}
          </li>
          {isReviewed ? (
            <li
              data-testid="incident-detail-timeline-event"
              data-event="reviewed"
              style={{ padding: 4 }}
            >
              Incident reviewed — review trail recorded in audit log
            </li>
          ) : null}
        </ol>
      </section>

      {isPending ? (
        <div>
          <button
            type="button"
            data-testid="incident-detail-release-cta"
            onClick={() => setGuardArmed(true)}
          >
            Release grant
          </button>
        </div>
      ) : null}
      {guardArmed ? (
        <HighRiskActionGuard
          action={{
            id: "manual-break-glass-release",
            label: "Release break-glass grant",
          }}
          selection={[incident.caseId]}
          reasons={releaseReasonCatalog}
          requireNote
          confirmLabel="Release"
          onConfirm={handleReleaseConfirm}
          onCancel={() => setGuardArmed(false)}
        />
      ) : null}
    </section>
  );
}
