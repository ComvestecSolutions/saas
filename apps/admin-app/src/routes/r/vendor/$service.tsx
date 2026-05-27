import {
  StateScreen,
  StatusChip,
  type StatusChipTone,
} from "@comvestec/ui";
import {
  platformAdapterServiceName,
  type PlatformAdapterServiceName,
  type VendorHealthAggregateEntryStatus,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { KpiCard, ScreenHeader } from "../../../components/ui";
import type { AdminVendorDetailRouteData } from "../../../lib/vendor-detail-route-data";

/**
 * `/r/vendor/$service` — spec-canonical Vendor Detail v2
 * surface shipped by Phase 6 vendor + workflow operator screens
 * commit 6a (admin-app implementation plan §8.15 + §11).
 * Consumes the `vendor-detail-{loader,route-data,route-server}`
 * trio gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId` and the same
 * `vendor-health-aggregator` platform service consumed by
 * `/r/vendors`. The URL `$service` parameter is decoded
 * exclusively through the canonical
 * {@link platformAdapterServiceName} vocabulary so no raw
 * literal leaks past the framework boundary.
 *
 * Layout follows the spec §11 "spine first, body second"
 * convention shipped on `/r/incident/$incidentId`,
 * `/r/legal-hold/$holdId`, and `/r/delivery/$deliveryId`:
 *   - Summary panel (status chip, version, latency, last
 *     checked, last incident).
 *   - Health timeline pane built from the aggregate's current
 *     snapshot, correlation frame, last incident, and partial-
 *     failure state.
 *   - Operator handoff pane with typed service-specific follow-up
 *     links into the existing admin routes (Phase 1 backend item
 *     10 surfaces such as Keycloak users/roles, billing, notify,
 *     access control, workflow runs, and search).
 *
 * The page stays loader-clean against the single shared
 * aggregator helper to keep the spine honest: vendor-specific
 * operator follow-up is mapped client-side from the canonical
 * {@link platformAdapterServiceName} vocabulary instead of
 * issuing extra per-vendor loader calls here.
 */

const knownServiceNames = new Set<string>(
  Object.values(platformAdapterServiceName),
);

const decodeServiceParam = (
  raw: string,
): PlatformAdapterServiceName | undefined =>
  knownServiceNames.has(raw)
    ? (raw as PlatformAdapterServiceName)
    : undefined;

/**
 * Documented deep-link targets per adapter. We DO NOT shape a
 * `Request` or `Response` here; this is a static operator-
 * runbook table sourced off the canonical service-name
 * vocabulary so the link surface stays in lockstep with
 * `platformAdapterServiceName.*` without inventing new
 * literals.
 */
const runbookLinkLabelByService: Partial<
  Record<PlatformAdapterServiceName, string>
> = {
  [platformAdapterServiceName.keycloak]: "Keycloak admin console (operator).",
  [platformAdapterServiceName.polar]: "Polar customer console (operator).",
  [platformAdapterServiceName.openmeter]: "OpenMeter meter console (operator).",
  [platformAdapterServiceName.novu]: "Novu deliveries console (operator).",
  [platformAdapterServiceName.postal]: "Postal mail log (operator).",
  [platformAdapterServiceName.glitchtip]:
    "GlitchTip issues console (operator).",
  [platformAdapterServiceName.openpanel]:
    "OpenPanel events console (operator).",
};

type VendorFollowUpLink = {
  readonly label: string;
  readonly href: string;
  readonly description: string;
};

const operatorFollowUpLinksByService: Partial<
  Record<PlatformAdapterServiceName, readonly VendorFollowUpLink[]>
> = {
  [platformAdapterServiceName.convex]: [
    {
      label: "Workflow runs",
      href: "/r/runs",
      description: "Inspect workflow execution posture and background jobs.",
    },
  ],
  [platformAdapterServiceName.glitchtip]: [
    {
      label: "Search incidents",
      href: "/r/search?q=glitchtip",
      description:
        "Correlate error spikes with the broader operator incident context.",
    },
  ],
  [platformAdapterServiceName.keycloak]: [
    {
      label: "Search Keycloak resources",
      href: "/r/search?q=keycloak",
      description:
        "Locate Keycloak users and roles before drilling into /r/kc-user and /r/kc-role with concrete ids.",
    },
    {
      label: "Access control",
      href: "/r/access",
      description:
        "Compare Keycloak role posture with the platform authorization view.",
    },
  ],
  [platformAdapterServiceName.meilisearch]: [
    {
      label: "Search workspace",
      href: "/r/search",
      description:
        "Validate operator-facing search behavior and correlation context.",
    },
  ],
  [platformAdapterServiceName.novu]: [
    {
      label: "Notification center",
      href: "/r/notify",
      description:
        "Inspect outbound notification deliveries and resend guardrails.",
    },
  ],
  [platformAdapterServiceName.openmeter]: [
    {
      label: "Billing posture",
      href: "/r/billing",
      description:
        "Review usage anomalies and metering impact in the billing workspace.",
    },
  ],
  [platformAdapterServiceName.openpanel]: [
    {
      label: "Search analytics context",
      href: "/r/search?q=openpanel",
      description:
        "Correlate analytics degradation with broader operator search context.",
    },
  ],
  [platformAdapterServiceName.observability]: [
    {
      label: "Support operations",
      href: "/r/support",
      description:
        "Review incidents, break-glass posture, and operator escalation state.",
    },
  ],
  [platformAdapterServiceName.oryKeto]: [
    {
      label: "Access control",
      href: "/r/access",
      description:
        "Inspect authorization tuples and field-security posture.",
    },
  ],
  [platformAdapterServiceName.polar]: [
    {
      label: "Billing posture",
      href: "/r/billing",
      description:
        "Inspect subscriptions, invoices, and reconciliation posture.",
    },
  ],
  [platformAdapterServiceName.postal]: [
    {
      label: "Notification center",
      href: "/r/notify",
      description:
        "Inspect mail-related delivery state and downstream resend controls.",
    },
  ],
  [platformAdapterServiceName.postgres]: [
    {
      label: "Audit log",
      href: "/r/audit",
      description:
        "Review persistence-impacting changes and related operator activity.",
    },
  ],
  [platformAdapterServiceName.unleash]: [
    {
      label: "Feature flags",
      href: "/r/flag",
      description:
        "Inspect rollout posture and runtime flag governance state.",
    },
  ],
  [platformAdapterServiceName.valkey]: [
    {
      label: "Support operations",
      href: "/r/support",
      description:
        "Correlate cache degradation with active incidents and break-glass state.",
    },
  ],
};

const toneByStatus: Record<VendorHealthAggregateEntryStatus, StatusChipTone> = {
  healthy: "nominal",
  degraded: "pending",
  unavailable: "error",
  unknown: "drift",
};

const kpiToneByStatus: Record<
  VendorHealthAggregateEntryStatus,
  "good" | "warn" | "alert" | "neutral"
> = {
  healthy: "good",
  degraded: "warn",
  unavailable: "alert",
  unknown: "neutral",
};

const detailCardStyle = {
  display: "grid",
  gap: 4,
  padding: 8,
  borderRadius: 12,
  border: "1px solid var(--ops-border, rgba(255,255,255,0.12))",
  background:
    "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.03)) 88%, transparent)",
} as const;

const secondaryTextStyle = {
  color: "var(--ops-text-secondary, rgba(255,255,255,0.7))",
} as const;

const formatVendorTimestamp = (value: string | undefined): string =>
  value === undefined ? "n/a" : value.slice(0, 16).replace("T", " ");

export const Route = createAdminAppFileRoute("/r/vendor/$service")({
  loader: async ({ params }) => {
    const decoded = decodeServiceParam(params.service);
    if (decoded === undefined) {
      return {
        kind: "error",
        title: "Unknown vendor",
        description: `'${params.service}' is not a known platformAdapterServiceName.`,
      } as const;
    }
    const { loadAdminVendorDetailLoaderData } = await import(
      "../../../lib/vendor-detail-loader"
    );
    return loadAdminVendorDetailLoaderData({ serviceName: decoded });
  },
  component: VendorDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading vendor detail…" />
  ),
});

function VendorDetailRoute() {
  const data: AdminVendorDetailRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view vendor detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access vendor detail."
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

  const { entry, partialFailure, correlationId, generatedAt } = data;
  const runbookLink = runbookLinkLabelByService[entry.serviceName];
  const followUpLinks = operatorFollowUpLinksByService[entry.serviceName] ?? [];
  const historyItems = [
    {
      key: "snapshot",
      label: "Current snapshot",
      detail:
        entry.message ?? "Latest vendor-health snapshot recorded for this adapter.",
      timestamp: entry.lastCheckedAt,
      dotClassName: "ops-dot--active",
    },
    ...(partialFailure === undefined
      ? []
      : [
          {
            key: "partial-failure",
            label: "Aggregate partial failure",
            detail: partialFailure.reason,
            timestamp: generatedAt,
            dotClassName: "ops-dot--pending",
          },
        ]),
    ...(entry.lastIncidentAt === undefined
      ? []
      : [
          {
            key: "last-incident",
            label: "Last incident",
            detail: "Most recent vendor-side degradation recorded for this adapter.",
            timestamp: entry.lastIncidentAt,
            dotClassName: "ops-dot--pending",
          },
        ]),
    {
      key: "aggregate-generated",
      label: "Aggregate generated",
      detail: `Correlation ${correlationId}`,
      timestamp: generatedAt,
      dotClassName: "ops-dot--active",
    },
  ] as const;

  return (
    <section
      data-testid="vendor-detail-ready"
      data-pattern="vendor-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={entry.serviceName}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Vendors", href: "/r/vendors" },
          { label: entry.serviceName },
        ]}
        subtitle={
          <>
            Status{" "}
            <span
              data-testid="vendor-detail-status-chip"
              data-status={entry.status}
            >
              <StatusChip tone={toneByStatus[entry.status]} size="sm">
                {entry.status}
              </StatusChip>
            </span>{" "}
            · correlation <span className="mono">{correlationId}</span>
          </>
        }
      />

      <div
        data-testid="vendor-detail-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Status"
          value={entry.status}
          tone={kpiToneByStatus[entry.status]}
        />
        <KpiCard
          label="Latency"
          value={`${entry.latencyMs} ms`}
          tone={entry.latencyMs >= 200 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Version"
          value={entry.version ?? "n/a"}
          tone={entry.version === undefined ? "warn" : "neutral"}
        />
        <KpiCard
          label="Last incident"
          value={formatVendorTimestamp(entry.lastIncidentAt)}
          tone={entry.lastIncidentAt === undefined ? "good" : "warn"}
        />
        <KpiCard
          label="Partial failure"
          value={partialFailure === undefined ? "No" : "Yes"}
          tone={partialFailure === undefined ? "neutral" : "alert"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 6,
        }}
      >
        <section data-testid="vendor-detail-summary" style={detailCardStyle}>
          <p className="ops-card-title">Current posture</p>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
          >
            <span className="text-strong">{entry.serviceName}</span>
            <StatusChip tone={toneByStatus[entry.status]} size="sm">
              {entry.status}
            </StatusChip>
          </div>
          <span className="mono" data-testid="vendor-detail-version">
            {entry.version ?? "version n/a"}
          </span>
          <span className="mono" data-testid="vendor-detail-latency">
            {entry.latencyMs} ms p95
          </span>
          <span style={secondaryTextStyle} data-testid="vendor-detail-message">
            {entry.message ?? "No adapter message reported."}
          </span>
        </section>

        <section style={detailCardStyle}>
          <p className="ops-card-title">Telemetry frame</p>
          <span className="mono">
            Last checked · {formatVendorTimestamp(entry.lastCheckedAt)}
          </span>
          <span className="mono">
            Last incident · {formatVendorTimestamp(entry.lastIncidentAt)}
          </span>
          <span className="mono">Generated · {formatVendorTimestamp(generatedAt)}</span>
        </section>

        <section style={detailCardStyle}>
          <p className="ops-card-title">Console handoff</p>
          <span className="text-strong">
            {runbookLink ??
              "Use the operator runbook surface for the matching adapter."}
          </span>
          <span style={secondaryTextStyle}>
            Typed vendor console URLs are still pending a dedicated runtime-config
            backed metadata source, so this surface currently carries the handoff
            label and the live correlation context.
          </span>
          <span className="mono">Correlation · {correlationId}</span>
        </section>
      </div>

      <section
        data-testid="vendor-detail-history"
        className="ops-card"
      >
        <div className="ops-card-head">
          <p className="ops-card-head__title">Health history</p>
        </div>
        <div className="ops-activity-list">
          {historyItems.map((item) => (
            <div key={item.key} className="ops-activity-item">
              <div>
                <span className="ops-activity-module">
                  <span className={`ops-dot ${item.dotClassName}`} />
                  {item.label}
                </span>
                <div className="ops-alert-detail">{item.detail}</div>
              </div>
              <span className="mono">{formatVendorTimestamp(item.timestamp)}</span>
            </div>
          ))}
        </div>
      </section>

      <section
        data-testid="vendor-detail-deep-link"
        className="ops-card"
      >
        <div className="ops-card-head">
          <p className="ops-card-head__title">Runbook</p>
        </div>
        <div style={{ display: "grid", gap: 4, padding: 10 }}>
          <span className="text-strong">
            {runbookLink ??
              "Consult the matching adapter runbook in specs/04-ops/runbooks."}
          </span>
          <span style={secondaryTextStyle}>
            Use the live posture above with the aggregate correlation id to bridge
            from the admin app into the vendor-specific operator recovery flow.
          </span>
          {followUpLinks.length > 0 ? (
            <div
              data-testid="vendor-detail-follow-ups"
              style={{ display: "grid", gap: 8, paddingTop: 4 }}
            >
              {followUpLinks.map((link) => (
                <div key={link.href} style={{ display: "grid", gap: 2 }}>
                  <a href={link.href}>{link.label}</a>
                  <span style={secondaryTextStyle}>{link.description}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {partialFailure !== undefined ? (
        <section
          data-testid="vendor-detail-partial-failure"
          className="ops-card"
        >
          <div className="ops-card-head">
            <p className="ops-card-head__title">Partial failure</p>
          </div>
          <div style={{ display: "grid", gap: 4, padding: 10 }}>
            <span
              data-testid="vendor-detail-partial-failure-reason"
              style={secondaryTextStyle}
            >
              {partialFailure.reason}
            </span>
          </div>
        </section>
      ) : null}
    </section>
  );
}
