import { useState } from "react";
import { Schema } from "effect";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  HighRiskActionGuard,
  StateScreen,
  type HighRiskReason,
} from "@comvestec/ui";
import {
  platformScope,
  platformScopes,
  retentionLegalHoldStatus,
  type PlatformScope,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import { releaseAdminLegalHold } from "../../../lib/legal-hold-detail-mutations-server";
import type { AdminLegalHoldDetailRouteData } from "../../../lib/legal-hold-detail-route-data";

/**
 * `/desk/legal-hold/$holdId` — spec-canonical Legal Hold Detail
 * v2 surface shipped by Phase 5 Support / compliance /
 * integrations operator screens commit 2 (admin-app
 * implementation plan §8.11 + §11 + §8.13). Consumes the
 * `legal-hold-detail-{loader,route-data,route-server}` trio
 * gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId`.
 *
 * Renders the hold summary panel (status, data-type, target,
 * evidence, placed/released-at timestamps) plus a release-hold
 * CTA gated through `HighRiskActionGuard` per spec §8.13.
 *
 * The release-hold CTA now executes through the
 * `releaseAdminLegalHold` mutations-server entrypoint. The
 * current backend contract is still session-id based and does
 * not yet accept the guard reason or note payload directly.
 */
const releaseReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "retention-legal-hold.release.dispute-resolved",
    label: "Dispute resolved — release the legal hold",
  },
  {
    id: "retention-legal-hold.release.evidence-superseded",
    label: "Evidence superseded — release the legal hold",
  },
  {
    id: "retention-legal-hold.release.policy-correction",
    label: "Policy correction — release the legal hold",
  },
];

const RawSearchSchema = Schema.Struct({
  scope: Schema.optional(Schema.String),
  scopeId: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;

const knownPlatformScopes = platformScopes as readonly string[];

const decodeScope = (value: string | undefined): PlatformScope =>
  value !== undefined && knownPlatformScopes.includes(value)
    ? (value as PlatformScope)
    : platformScope.platform;

const decodeScopeId = (value: string | undefined): string =>
  value !== undefined && value.length > 0 ? value : platformScope.platform;

export const Route = createAdminAppFileRoute("/desk/legal-hold/$holdId")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const { loadAdminLegalHoldDetailLoaderData } =
      await import("../../../lib/legal-hold-detail-loader");
    return loadAdminLegalHoldDetailLoaderData({
      holdId: params.holdId,
      scope: decodeScope(deps.search.scope),
      scopeId: decodeScopeId(deps.search.scopeId),
    });
  },
  component: LegalHoldDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading legal hold detail…" />
  ),
});

function LegalHoldDetailRoute() {
  const data: AdminLegalHoldDetailRouteData = Route.useLoaderData();
  const router = useRouter();
  const releaseLegalHold = useServerFn(releaseAdminLegalHold);
  const [guardArmed, setGuardArmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view legal hold detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access legal hold detail."
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

  const { hold, scope, scopeId } = data;
  const isActive = hold.status === retentionLegalHoldStatus.active;

  const handleReleaseConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    void input.reasonId;
    void input.note;

    try {
      const result = await releaseLegalHold({
        data: {
          legalHoldId: hold.legalHoldId,
        },
      });
      setGuardArmed(false);
      setActionError(null);
      setActionSuccess(`Release accepted for ${result.legalHoldId}.`);
      await router.invalidate();
    } catch (error) {
      setGuardArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to release the legal hold. Retry shortly.",
      );
    }
  };

  return (
    <section
      data-testid="legal-hold-detail-ready"
      data-pattern="legal-hold-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={hold.legalHoldId}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Retention", href: "/desk/retention" },
          { label: hold.legalHoldId },
        ]}
        subtitle={
          <>
            Status{" "}
            <span
              className="mono"
              data-testid="legal-hold-detail-status-chip"
              data-status={hold.status}
            >
              {hold.status}
            </span>{" "}
            · Scope{" "}
            <span className="mono">
              {scope}/{scopeId}
            </span>
          </>
        }
      />

      {actionSuccess !== null ? (
        <div
          data-testid="legal-hold-detail-action-success"
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
          data-testid="legal-hold-detail-action-error"
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
        data-testid="legal-hold-detail-summary"
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
          <strong>Data type:</strong>{" "}
          <span data-testid="legal-hold-detail-data-type">{hold.dataType}</span>
        </div>
        <div>
          <strong>Target:</strong>{" "}
          <span className="mono" data-testid="legal-hold-detail-target">
            {hold.targetId}
          </span>
        </div>
        <div>
          <strong>Evidence:</strong>{" "}
          <span data-testid="legal-hold-detail-evidence">{hold.evidence}</span>
        </div>
        <div>
          <strong>Placed at:</strong>{" "}
          <span className="mono">{hold.placedAt}</span>
        </div>
        <div>
          <strong>Released at:</strong>{" "}
          <span className="mono">{hold.releasedAt ?? "—"}</span>
        </div>
        <div data-testid="legal-hold-detail-active-flag">
          <strong>Legal hold active:</strong>{" "}
          {hold.legalHoldActive ? "true" : "false"}
        </div>
      </section>

      <section
        data-testid="legal-hold-detail-scope"
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
          Scope &amp; custodians
        </h2>
        <ul
          data-testid="legal-hold-detail-scope-list"
          style={{ padding: 4, margin: 0, listStyle: "none" }}
        >
          <li style={{ padding: 4 }}>
            <strong>Scope:</strong> <span className="mono">{scope}</span>
          </li>
          <li style={{ padding: 4 }}>
            <strong>Scope id:</strong> <span className="mono">{scopeId}</span>
          </li>
          <li style={{ padding: 4 }}>
            <strong>Target id:</strong>{" "}
            <span className="mono">{hold.targetId}</span>
          </li>
        </ul>
      </section>

      {isActive ? (
        <div>
          <button
            type="button"
            data-testid="legal-hold-detail-release-cta"
            onClick={() => setGuardArmed(true)}
          >
            Release hold
          </button>
        </div>
      ) : null}
      {guardArmed ? (
        <HighRiskActionGuard
          action={{
            id: "retention-legal-hold-release",
            label: "Release retention legal hold",
          }}
          selection={[hold.legalHoldId]}
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
