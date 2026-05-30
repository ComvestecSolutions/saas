import { useState } from "react";
import { Schema } from "effect";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  EmptyState,
  HighRiskActionGuard,
  StateScreen,
  type HighRiskReason,
} from "@comvestec/ui";
import {
  customDomainLifecycleState,
  platformScope,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import { verifyAdminCustomDomain } from "../../../lib/domain-detail-mutations-server";
import type {
  AdminDomainDetailInput,
  AdminDomainDetailRouteData,
} from "../../../lib/domain-detail-route-data";

/**
 * `/desk/domain/$hostname` — spec-canonical Custom-domain
 * lifecycle surface shipped by Phase 4 Domain operator screens
 * commit 2 (admin-app implementation plan §8.10 + §11).
 * Consumes the `domain-detail-{loader,route-data,route-server}`
 * trio gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId`. Renders the
 * lifecycle chip, DNS-record table (with per-record
 * copy-to-clipboard), and a verify CTA gated through
 * `HighRiskActionGuard` per spec §8.10.
 *
 * The DNS-record set now projects live `dnsProof.records` data
 * when the current verification record includes publishable DNS
 * proof. When the backend record exists but no proof rows have
 * been materialized yet, the route renders an honest empty
 * state instead of deterministic placeholder records. The verify
 * CTA executes through the `verifyAdminCustomDomain`
 * mutations-server entrypoint, which activates the current
 * verification through the trusted session and carries the
 * guard reason inside `approvalNotes`.
 */
const knownPlatformScopes = Object.values(platformScope);

const RawSearchSchema = Schema.Struct({
  tenantScope: Schema.optional(Schema.String),
  tenantScopeId: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;

const decodeLoaderInput = (
  hostname: string,
  raw: RawSearch,
): AdminDomainDetailInput | null => {
  if (
    raw.tenantScope === undefined ||
    raw.tenantScopeId === undefined ||
    raw.tenantScope.length === 0 ||
    raw.tenantScopeId.length === 0
  ) {
    return null;
  }
  if (!(knownPlatformScopes as readonly string[]).includes(raw.tenantScope)) {
    return null;
  }
  return {
    hostname,
    tenant: {
      scope:
        raw.tenantScope as (typeof platformScope)[keyof typeof platformScope],
      scopeId: raw.tenantScopeId,
    },
  };
};

const verifyReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "tenant-branding.custom-domain.activate",
    label: "Activate custom domain after DNS verification",
  },
];

export const Route = createAdminAppFileRoute("/desk/domain/$hostname")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const input = decodeLoaderInput(params.hostname, deps.search);
    if (input === null) {
      return {
        kind: "error" as const,
        title: "Domain tenant required",
        description:
          "Provide tenantScope and tenantScopeId search params to load domain detail.",
      } satisfies AdminDomainDetailRouteData;
    }
    const { loadAdminDomainDetailLoaderData } =
      await import("../../../lib/domain-detail-loader");
    return loadAdminDomainDetailLoaderData(input);
  },
  component: DomainDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading domain detail…" />
  ),
});

function DomainDetailRoute() {
  const data: AdminDomainDetailRouteData = Route.useLoaderData();
  const router = useRouter();
  const verifyCustomDomain = useServerFn(verifyAdminCustomDomain);
  const [guardArmed, setGuardArmed] = useState(false);
  const [copiedRecord, setCopiedRecord] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view domain detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access domain detail."
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
  if (data.kind === "not-found") {
    return (
      <StateScreen
        variant="404"
        title={data.title}
        description={data.description}
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

  const { hostname, tenant, lifecycleState, dnsRecords, changedAt } = data;
  const canVerify =
    lifecycleState === customDomainLifecycleState.unverified ||
    lifecycleState === customDomainLifecycleState.verifying ||
    lifecycleState === customDomainLifecycleState.error;
  const verificationScope =
    tenant.scope === platformScope.enterprise
      ? platformScope.enterprise
      : tenant.scope === platformScope.organization
        ? platformScope.organization
        : null;

  const handleVerifyConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (verificationScope === null) {
      setGuardArmed(false);
      setActionSuccess(null);
      setActionError(
        "Custom-domain activation is only supported for enterprise or organization tenants.",
      );
      return;
    }

    try {
      const result = await verifyCustomDomain({
        data: {
          hostname,
          scope: verificationScope,
          scopeId: tenant.scopeId,
          reasonId: input.reasonId,
          approvalNotes: input.note.trim(),
        },
      });
      setGuardArmed(false);
      setActionError(null);
      setActionSuccess(`Domain activated for ${result.hostname}.`);
      await router.invalidate();
    } catch (error) {
      setGuardArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to activate the custom domain. Retry shortly.",
      );
    }
  };

  const handleCopy = async (key: string, value: string) => {
    setCopiedRecord(key);

    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        // Best-effort clipboard write; the UI confirmation is already shown.
      }
    }
  };

  return (
    <section
      data-testid="domain-detail-ready"
      data-pattern="domain-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={hostname}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Branding", href: "/desk/branding" },
          { label: hostname },
        ]}
        subtitle={
          <>
            Tenant{" "}
            <span className="mono">
              {tenant.scope}/{tenant.scopeId}
            </span>{" "}
            · Lifecycle{" "}
            <span
              className="mono"
              data-testid="domain-detail-lifecycle-chip"
              data-lifecycle-state={lifecycleState}
            >
              {lifecycleState}
            </span>
          </>
        }
      />
      {actionSuccess !== null ? (
        <div
          data-testid="domain-detail-action-success"
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
          data-testid="domain-detail-action-error"
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
      <div
        data-testid="domain-detail-changed-at"
        style={{ fontSize: "0.8125rem", padding: 4 }}
      >
        Last changed: <span className="mono">{changedAt ?? "—"}</span>
      </div>
      {dnsRecords.length === 0 ? (
        <div data-testid="domain-detail-dns-empty">
          <EmptyState
            title="DNS proof not yet published"
            description="The current custom-domain verification exists, but the backend record does not yet expose publishable DNS proof rows."
          />
        </div>
      ) : (
        <table
          data-testid="domain-detail-dns-table"
          data-pattern="dense-data-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.8125rem",
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 4 }}>Type</th>
              <th style={{ textAlign: "left", padding: 4 }}>Host</th>
              <th style={{ textAlign: "left", padding: 4 }}>Value</th>
              <th style={{ textAlign: "left", padding: 4 }}>Copy</th>
            </tr>
          </thead>
          <tbody>
            {dnsRecords.map((record) => {
              const key = `${record.recordType}:${record.host}`;
              const copied = copiedRecord === key;
              return (
                <tr
                  key={key}
                  data-testid="domain-detail-dns-row"
                  data-record-key={key}
                >
                  <td style={{ padding: 4 }} className="mono">
                    {record.recordType}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {record.host}
                  </td>
                  <td style={{ padding: 4 }} className="mono">
                    {record.value}
                  </td>
                  <td style={{ padding: 4 }}>
                    <button
                      type="button"
                      data-testid="domain-detail-dns-copy"
                      data-copied={copied ? "true" : "false"}
                      onClick={() => {
                        void handleCopy(key, record.value);
                      }}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {canVerify ? (
        <div>
          <button
            type="button"
            data-testid="domain-detail-verify-cta"
            onClick={() => setGuardArmed(true)}
          >
            Verify domain
          </button>
        </div>
      ) : null}
      {guardArmed ? (
        <HighRiskActionGuard
          action={{
            id: "tenant-branding-custom-domain-activate",
            label: "Activate custom domain",
          }}
          selection={[hostname]}
          reasons={verifyReasonCatalog}
          requireNote
          confirmLabel="Activate"
          onConfirm={handleVerifyConfirm}
          onCancel={() => setGuardArmed(false)}
        />
      ) : null}
    </section>
  );
}
