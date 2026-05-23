import { Schema } from "effect";
import { Link } from "@tanstack/react-router";
import { StateScreen } from "@comvestec/ui";
import {
  platformScope,
  type OpenMeterUsageQueryGranularity,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import type {
  AdminMeterDetailInput,
  AdminMeterDetailRouteData,
} from "../../../lib/meter-detail-route-data";

/**
 * `/r/meter/$meterId` — Meter detail surface shipped by Phase 4
 * Domain operator screens commit 1 (admin-app implementation
 * plan §8.10 + §11). Consumes the
 * `meter-detail-{loader,route-data,route-server}.ts` trio,
 * gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId`. Renders the
 * OpenMeter meter summary plus an inline aggregated usage chart
 * (simple SVG sparkline so the v2 surface stays dependency
 * free). The drill back to the tenant workspace uses the
 * tenant scope + scopeId carried in the URL.
 *
 * Per `plan.md §16`, anomalies and richer chart affordances
 * land when the typed anomaly-detection helper ships; the v2
 * surface today flags the latest bucket's freshness through the
 * Phase 1 `isFresh` flag.
 */
const knownPlatformScopes = Object.values(platformScope);
const knownGranularities = ["MINUTE", "HOUR", "DAY", "MONTH"] as const;

const RawSearchSchema = Schema.Struct({
  tenantScope: Schema.optional(Schema.String),
  tenantScopeId: Schema.optional(Schema.String),
  subject: Schema.optional(Schema.String),
  granularity: Schema.optional(Schema.String),
  windowFrom: Schema.optional(Schema.String),
  windowTo: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;

const decodeLoaderInput = (
  meterSlug: string,
  raw: RawSearch,
): AdminMeterDetailInput | null => {
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
  const subject =
    raw.subject !== undefined && raw.subject.length > 0
      ? raw.subject
      : undefined;
  const granularity =
    raw.granularity !== undefined &&
    (knownGranularities as readonly string[]).includes(raw.granularity)
      ? (raw.granularity as OpenMeterUsageQueryGranularity)
      : undefined;
  const windowFrom =
    raw.windowFrom !== undefined && raw.windowFrom.length > 0
      ? raw.windowFrom
      : undefined;
  const windowTo =
    raw.windowTo !== undefined && raw.windowTo.length > 0
      ? raw.windowTo
      : undefined;
  const window =
    windowFrom !== undefined && windowTo !== undefined
      ? { from: windowFrom, to: windowTo }
      : undefined;
  return {
    meterSlug,
    tenant: {
      scope:
        raw.tenantScope as (typeof platformScope)[keyof typeof platformScope],
      scopeId: raw.tenantScopeId,
    },
    ...(subject === undefined ? {} : { subject }),
    ...(granularity === undefined ? {} : { granularity }),
    ...(window === undefined ? {} : { window }),
  };
};

export const Route = createAdminAppFileRoute("/r/meter/$meterId")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const input = decodeLoaderInput(params.meterId, deps.search);
    if (input === null) {
      return {
        kind: "error" as const,
        title: "Meter tenant required",
        description:
          "Provide tenantScope and tenantScopeId search params to load meter detail.",
      } satisfies AdminMeterDetailRouteData;
    }
    const { loadAdminMeterDetailLoaderData } =
      await import("../../../lib/meter-detail-loader");
    return loadAdminMeterDetailLoaderData(input);
  },
  component: MeterDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading meter detail…" />
  ),
});

function MeterDetailRoute() {
  const data: AdminMeterDetailRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view meter detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access meter detail."
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

  const { meter, tenant, usage } = data;
  const meterSummary = meter.summary;
  const tenantWorkspacePath = `/r/tenant/${encodeURIComponent(tenant.scopeId)}?scope=${encodeURIComponent(tenant.scope)}`;
  const buckets = usage?.result.aggregated ?? [];
  const maxValue = buckets.reduce(
    (acc, bucket) => (bucket.value > acc ? bucket.value : acc),
    0,
  );
  const sparkPoints = (() => {
    if (buckets.length === 0) return "";
    const width = 280;
    const height = 60;
    const stepX = buckets.length === 1 ? width : width / (buckets.length - 1);
    return buckets
      .map((bucket, index) => {
        const x = index * stepX;
        const y =
          maxValue === 0 ? height : height - (bucket.value / maxValue) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  })();

  return (
    <section
      data-testid="meter-detail-ready"
      data-pattern="meter-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={meterSummary.displayName}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Billing", href: "/r/billing" },
          { label: meterSummary.meterSlug },
        ]}
        subtitle={
          <>
            <span className="mono">{meterSummary.meterSlug}</span> ·{" "}
            {meterSummary.aggregation} of{" "}
            <span className="mono">{meterSummary.eventType}</span> · Tenant{" "}
            <Link
              to={tenantWorkspacePath}
              data-testid="meter-detail-tenant-drill"
            >
              {tenant.scope}/{tenant.scopeId}
            </Link>
          </>
        }
      />
      {usage === null ? (
        <div data-testid="meter-detail-usage-empty" style={{ padding: 6 }}>
          Provide <span className="mono">subject</span>,{" "}
          <span className="mono">granularity</span>, and{" "}
          <span className="mono">windowFrom</span>/
          <span className="mono">windowTo</span> search params to load usage.
        </div>
      ) : (
        <div
          data-testid="meter-detail-usage-card"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 6,
            border: "1px solid var(--bg-2)",
            borderRadius: 4,
            fontSize: "0.8125rem",
          }}
        >
          <div>
            Window <span className="mono">{usage.result.window.from}</span> →{" "}
            <span className="mono">{usage.result.window.to}</span> · Subject{" "}
            <span className="mono">{usage.result.subject}</span> ·{" "}
            {usage.result.granularity} buckets ·{" "}
            {usage.isFresh ? "fresh" : "stale"}
          </div>
          <svg
            data-testid="meter-detail-usage-chart"
            viewBox="0 0 280 60"
            role="img"
            aria-label={`Aggregated usage for ${meterSummary.displayName}`}
            style={{ width: "100%", maxWidth: 280, height: 60 }}
          >
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              points={sparkPoints}
            />
          </svg>
          <div>
            {buckets.length} bucket{buckets.length === 1 ? "" : "s"} · peak{" "}
            {maxValue.toLocaleString()}
          </div>
        </div>
      )}
    </section>
  );
}
