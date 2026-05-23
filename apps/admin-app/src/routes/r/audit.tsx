import {
  platformModuleId,
  type AuditEvent,
  type PlatformModuleId,
} from "@comvestec/contracts";
import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import { EmptyState, Pane, RevealField, StateScreen } from "@comvestec/ui";

import {
  FilterBar,
  KpiCard,
  ScreenHeader,
  ShieldIcon,
  Tabs,
} from "../../components/ui";
import { createAdminAppFileRoute } from "../../file-route";
import {
  buildAdminTenantTarget,
  buildAdminTenantWorkspacePath,
} from "../../lib/admin-tenant-target";
import { loadAdminAuditLogV2LoaderData } from "../../lib/audit-log-v2-loader";
import type { AdminAuditLogV2RawSearch } from "../../lib/audit-log-v2-search";

const windowOptions = ["1h", "6h", "24h", "7d", "custom"] as const;
const windowSet = new Set<string>(windowOptions);

const auditLogSearchSchema = Schema.Struct({
  module: Schema.optional(Schema.NonEmptyString),
  actor: Schema.optional(Schema.NonEmptyString),
  action: Schema.optional(Schema.NonEmptyString),
  target: Schema.optional(Schema.NonEmptyString),
  tenantScope: Schema.optional(Schema.NonEmptyString),
  tenantScopeId: Schema.optional(Schema.NonEmptyString),
  classification: Schema.optional(Schema.NonEmptyString),
  ip: Schema.optional(Schema.NonEmptyString),
  correlation: Schema.optional(Schema.NonEmptyString),
  window: Schema.optional(Schema.NonEmptyString),
  customFrom: Schema.optional(Schema.NonEmptyString),
  customTo: Schema.optional(Schema.NonEmptyString),
  tail: Schema.optional(Schema.NonEmptyString),
});

type AuditLogSearch = Schema.Schema.Type<typeof auditLogSearchSchema>;
type AuditPivot = "all" | "correlated" | "reasoned" | "standalone";
type CorrelationCluster = {
  readonly correlationId: string;
  readonly count: number;
  readonly latestTimestamp: string;
  readonly tenants: string[];
};

export const Route = createAdminAppFileRoute("/r/audit")({
  component: AuditLogV2Route,
  validateSearch: (rawSearch): AuditLogSearch =>
    Schema.decodeUnknownSync(auditLogSearchSchema)(rawSearch),
  loaderDeps: ({ search }) => ({
    search: compactAuditLogSearch(search),
  }),
  loader: async ({ deps }) => loadAdminAuditLogV2LoaderData(deps.search),
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading audit explorer…" />
  ),
});

function AuditLogV2Route() {
  const router = useRouter();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const [localSearch, setLocalSearch] = useState("");
  const [pivot, setPivot] = useState<AuditPivot>("all");
  const [expandedEventId, setExpandedEventId] = useState<string>();
  const [revealedEventIds, setRevealedEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [isTransitionPending, startTransition] = useTransition();

  const setSearchField = useCallback(
    (key: keyof AuditLogSearch, value: string | undefined) => {
      startTransition(() => {
        void router.navigate({
          to: "/r/audit",
          search: (previous) => ({
            ...previous,
            [key]: value && value.length > 0 ? value : undefined,
          }),
        });
      });
    },
    [router],
  );

  const toggleLiveTail = useCallback(() => {
    startTransition(() => {
      void router.navigate({
        to: "/r/audit",
        search: (previous) => ({
          ...previous,
          tail: previous.tail === "1" ? undefined : "1",
        }),
      });
    });
  }, [router]);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to inspect audit activity."
      />
    );
  }

  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to continue investigating audit activity."
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

  return (
    <AuditLogReadyView
      data={data}
      search={search}
      localSearch={localSearch}
      onLocalSearchChange={setLocalSearch}
      pivot={pivot}
      onPivotChange={setPivot}
      expandedEventId={expandedEventId}
      onExpandedEventChange={setExpandedEventId}
      revealedEventIds={revealedEventIds}
      onRevealedEventIdsChange={setRevealedEventIds}
      isTransitionPending={isTransitionPending}
      onSetSearchField={setSearchField}
      onToggleLiveTail={toggleLiveTail}
    />
  );
}

type AuditLogReadyViewProps = {
  readonly data: Extract<
    Awaited<ReturnType<typeof loadAdminAuditLogV2LoaderData>>,
    { kind: "ready" }
  >;
  readonly search: AuditLogSearch;
  readonly localSearch: string;
  readonly onLocalSearchChange: (value: string) => void;
  readonly pivot: AuditPivot;
  readonly onPivotChange: (value: AuditPivot) => void;
  readonly expandedEventId: string | undefined;
  readonly onExpandedEventChange: (value: string | undefined) => void;
  readonly revealedEventIds: ReadonlySet<string>;
  readonly onRevealedEventIdsChange: (value: ReadonlySet<string>) => void;
  readonly isTransitionPending: boolean;
  readonly onSetSearchField: (
    key: keyof AuditLogSearch,
    value: string | undefined,
  ) => void;
  readonly onToggleLiveTail: () => void;
};

function AuditLogReadyView({
  data,
  search,
  localSearch,
  onLocalSearchChange,
  pivot,
  onPivotChange,
  expandedEventId,
  onExpandedEventChange,
  revealedEventIds,
  onRevealedEventIdsChange,
  isTransitionPending,
  onSetSearchField,
  onToggleLiveTail,
}: AuditLogReadyViewProps) {
  const distinctActions = useMemo(
    () => [...new Set(data.events.map((event) => event.action))].sort(),
    [data.events],
  );

  const distinctModules = useMemo(
    () => [...new Set(data.events.map((event) => event.moduleId))].sort(),
    [data.events],
  );

  const normalizedLocalSearch = localSearch.trim().toLowerCase();

  const pivotCounts = useMemo(
    () => ({
      all: data.events.length,
      correlated: data.events.filter((event) => event.correlationId).length,
      reasoned: data.events.filter((event) => event.reason).length,
      standalone: data.events.filter(
        (event) =>
          event.correlationId === undefined && event.reason === undefined,
      ).length,
    }),
    [data.events],
  );

  const filteredEvents = useMemo(
    () =>
      data.events.filter((event) => {
        if (pivot === "correlated" && event.correlationId === undefined) {
          return false;
        }

        if (pivot === "reasoned" && event.reason === undefined) {
          return false;
        }

        if (
          pivot === "standalone" &&
          (event.correlationId !== undefined || event.reason !== undefined)
        ) {
          return false;
        }

        if (normalizedLocalSearch.length === 0) {
          return true;
        }

        const haystack = [
          event.eventId,
          event.timestamp,
          event.actorId,
          event.moduleId,
          event.action,
          event.target,
          event.reason,
          event.correlationId,
          event.tenantScope,
          event.tenantScopeId,
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedLocalSearch);
      }),
    [data.events, normalizedLocalSearch, pivot],
  );

  const distinctActorCount = useMemo(
    () => new Set(data.events.map((event) => event.actorId)).size,
    [data.events],
  );

  const distinctTenantCount = useMemo(
    () =>
      new Set(
        data.events.map(
          (event) => `${event.tenantScope}:${event.tenantScopeId}`,
        ),
      ).size,
    [data.events],
  );

  const correlationClusters = useMemo(
    () => buildCorrelationClusters(data.events),
    [data.events],
  );

  const focusedEvent = filteredEvents[0] ?? data.events[0];
  const focusedTenantTarget =
    focusedEvent === undefined
      ? undefined
      : buildAdminTenantTarget({
          scope: focusedEvent.tenantScope,
          scopeId: focusedEvent.tenantScopeId,
        });
  const focusedTenantPath =
    focusedTenantTarget === undefined
      ? undefined
      : buildAdminTenantWorkspacePath(focusedTenantTarget);
  const focusedModuleHandoff = focusedEvent
    ? resolveModuleHandoff(focusedEvent.moduleId)
    : undefined;

  const filterChips = buildFilterChips(data, search);

  const showingFocusedSubset =
    filteredEvents.length !== data.events.length ||
    data.totalBeforeLocalFilter !== data.events.length;

  return (
    <div
      data-testid="audit-log-v2-ready"
      style={{
        display: "grid",
        gap: "10px",
        gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)",
        alignItems: "start",
      }}
    >
      <div data-testid="audit-log-v2-filter-rail">
        <Pane title="Investigation rail">
          <div
            style={{
              display: "grid",
              gap: "8px",
              paddingBottom: "8px",
              color: "var(--app-text-muted)",
              fontSize: "0.85rem",
            }}
          >
            <span>
              Shape the shared backend query, then use local review pivots
              without losing context.
            </span>
          </div>
          <div style={{ display: "grid", gap: "8px" }}>
            <FilterRailSelect
              label="Module"
              value={search.module ?? data.filters.module}
              onChange={(value) =>
                onSetSearchField("module", value === "all" ? undefined : value)
              }
              options={[
                { value: "all", label: "All modules" },
                ...distinctModules.map((moduleId) => ({
                  value: moduleId,
                  label: moduleId,
                })),
              ]}
            />
            <FilterRailField
              label="Actor"
              value={search.actor ?? ""}
              onChange={(value) =>
                onSetSearchField("actor", value.length > 0 ? value : undefined)
              }
              placeholder="usr_platform_operator_1"
              data-testid="audit-log-v2-filter-actor"
            />
            <FilterRailSelect
              label="Action"
              value={search.action ?? "all"}
              onChange={(value) =>
                onSetSearchField("action", value === "all" ? undefined : value)
              }
              options={[
                { value: "all", label: "All actions" },
                ...distinctActions.map((action) => ({
                  value: action,
                  label: action,
                })),
              ]}
            />
            <FilterRailField
              label="Target"
              value={search.target ?? ""}
              onChange={(value) =>
                onSetSearchField("target", value.length > 0 ? value : undefined)
              }
              placeholder="tenant|config|case"
            />
            <FilterRailField
              label="Tenant scope"
              value={search.tenantScope ?? ""}
              onChange={(value) =>
                onSetSearchField(
                  "tenantScope",
                  value.length > 0 ? value : undefined,
                )
              }
              placeholder="organization"
            />
            <FilterRailField
              label="Tenant scope id"
              value={search.tenantScopeId ?? ""}
              onChange={(value) =>
                onSetSearchField(
                  "tenantScopeId",
                  value.length > 0 ? value : undefined,
                )
              }
              placeholder="org_acme"
            />
            <FilterRailField
              label="Correlation"
              value={search.correlation ?? ""}
              onChange={(value) =>
                onSetSearchField(
                  "correlation",
                  value.length > 0 ? value : undefined,
                )
              }
              placeholder="corr_05"
            />
            <FilterRailSelect
              label="Window"
              value={resolveWindowPreset(search.window)}
              onChange={(value) => onSetSearchField("window", value)}
              options={windowOptions.map((value) => ({
                value,
                label: value.toUpperCase(),
              }))}
            />
            <FilterRailField
              label="Start"
              value={search.customFrom ?? ""}
              onChange={(value) =>
                onSetSearchField(
                  "customFrom",
                  value.length > 0 ? value : undefined,
                )
              }
              placeholder="2025-05-01T00:00:00.000Z"
            />
            <FilterRailField
              label="End"
              value={search.customTo ?? ""}
              onChange={(value) =>
                onSetSearchField(
                  "customTo",
                  value.length > 0 ? value : undefined,
                )
              }
              placeholder="2025-05-01T23:59:59.000Z"
            />
            <FilterRailField
              label="Classification"
              value={search.classification ?? ""}
              onChange={(value) =>
                onSetSearchField(
                  "classification",
                  value.length > 0 ? value : undefined,
                )
              }
              placeholder="regulated-sensitive"
            />
            <FilterRailField
              label="IP"
              value={search.ip ?? ""}
              onChange={(value) =>
                onSetSearchField("ip", value.length > 0 ? value : undefined)
              }
              placeholder="203.0.113.4"
            />
            <div
              style={{
                display: "grid",
                gap: "4px",
                padding: "8px",
                borderRadius: "10px",
                border: "1px solid var(--app-border-subtle)",
                background: "var(--app-surface-subtle)",
              }}
            >
              <strong
                style={{
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Schema note
              </strong>
              <span
                style={{ color: "var(--app-text-muted)", fontSize: "0.85rem" }}
              >
                Classification and IP stay as routed investigation intent until
                the shared audit event envelope grows those fields.
              </span>
            </div>
          </div>
        </Pane>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        <ScreenHeader
          title="Audit explorer"
          subtitle={
            data.events.length === 0
              ? "No events matched the shared backend query."
              : `Investigate ${filteredEvents.length} of ${data.events.length} loaded events with posture, correlation, and tenant-aware handoff.`
          }
          icon={<ShieldIcon />}
        />

        <div
          data-testid="audit-log-v2-posture"
          style={{
            display: "grid",
            gap: "8px",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, min(100%, 1fr)))",
          }}
        >
          <KpiCard
            label="Loaded events"
            value={String(data.events.length)}
            tone="neutral"
            hint={
              showingFocusedSubset
                ? `${filteredEvents.length} still visible after local review`
                : `${data.totalBeforeLocalFilter} before local filters`
            }
          />
          <KpiCard
            label="Actors"
            value={String(distinctActorCount)}
            tone="accent"
            hint="Distinct operators in the loaded slice"
          />
          <KpiCard
            label="Tenants"
            value={String(distinctTenantCount)}
            tone="good"
            hint="Unique tenant contexts touched"
          />
          <KpiCard
            label="Correlated"
            value={String(pivotCounts.correlated)}
            tone="warn"
            hint="Events already grouped by correlation id"
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: "10px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <Pane title="Query posture">
            <div style={{ display: "grid", gap: "8px" }}>
              <span className="ops-text-muted">
                Backend mode: {data.appliedQueryMode}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {filterChips.map((chip) => (
                  <AuditChip key={chip.label} tone={chip.tone}>
                    {chip.label}
                  </AuditChip>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "4px",
                  color: "var(--app-text-muted)",
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  Local review:{" "}
                  <strong style={{ color: "var(--app-text)" }}>
                    {pivotLabels[pivot]}
                  </strong>
                  {normalizedLocalSearch.length > 0
                    ? ` + "${localSearch}"`
                    : ""}
                </span>
                <span>
                  Live tail is{" "}
                  <strong style={{ color: "var(--app-text)" }}>
                    {data.filters.liveTail ? "armed" : "paused"}
                  </strong>
                  .
                </span>
              </div>
            </div>
          </Pane>

          <Pane title="Focused investigation">
            {focusedEvent ? (
              <div style={{ display: "grid", gap: "8px" }}>
                <span className="ops-text-muted">
                  Leading event {focusedEvent.eventId}
                </span>
                <div
                  style={{
                    display: "grid",
                    gap: "4px",
                    fontSize: "0.9rem",
                  }}
                >
                  <strong>{focusedEvent.action}</strong>
                  <span className="ops-text-muted">{focusedEvent.target}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                  }}
                >
                  <AuditChip tone="neutral">
                    actor {focusedEvent.actorId}
                  </AuditChip>
                  <AuditChip tone="info">
                    {focusedEvent.tenantScope}:{focusedEvent.tenantScopeId}
                  </AuditChip>
                  <AuditChip tone="neutral">{focusedEvent.moduleId}</AuditChip>
                  {focusedEvent.correlationId ? (
                    <AuditChip tone="warn">
                      corr {focusedEvent.correlationId}
                    </AuditChip>
                  ) : null}
                  {focusedEvent.reason ? (
                    <AuditChip tone="success">reason captured</AuditChip>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {focusedTenantPath ? (
                    <a
                      href={focusedTenantPath}
                      className="ops-button"
                      style={{ minHeight: "unset" }}
                    >
                      Open tenant workspace
                    </a>
                  ) : null}
                  {focusedModuleHandoff ? (
                    <a
                      href={focusedModuleHandoff.to}
                      className="ops-button"
                      style={{ minHeight: "unset" }}
                    >
                      {focusedModuleHandoff.label}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No loaded events"
                description="Adjust the investigation rail to load an audit slice."
              />
            )}
          </Pane>

          <div data-testid="audit-log-v2-correlation-clusters">
            <Pane title="Correlation lanes">
              <div style={{ display: "grid", gap: "8px" }}>
                <span className="ops-text-muted">
                  Top grouped investigations in the current slice.
                </span>
                {correlationClusters.length === 0 ? (
                  <EmptyState
                    title="No correlated groups"
                    description="This slice is dominated by standalone events."
                  />
                ) : (
                  <div style={{ display: "grid", gap: "6px" }}>
                    {correlationClusters.slice(0, 4).map((cluster) => (
                      <div
                        key={cluster.correlationId}
                        style={{
                          display: "grid",
                          gap: "4px",
                          padding: "8px",
                          borderRadius: "10px",
                          border: "1px solid var(--app-border-subtle)",
                          background: "var(--app-surface-subtle)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "8px",
                            alignItems: "baseline",
                          }}
                        >
                          <strong className="ops-font-mono">
                            {cluster.correlationId}
                          </strong>
                          <span className="ops-text-muted">
                            {cluster.count} events
                          </span>
                        </div>
                        <span className="ops-text-muted">
                          {cluster.tenants.length} tenant touchpoints · last
                          seen {formatTimestamp(cluster.latestTimestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Pane>
          </div>
        </div>

        <Tabs<AuditPivot>
          value={pivot}
          onChange={onPivotChange}
          items={[
            {
              value: "all",
              label: "All",
              count: pivotCounts.all,
            },
            {
              value: "correlated",
              label: "Correlated",
              count: pivotCounts.correlated,
            },
            {
              value: "reasoned",
              label: "Reasoned",
              count: pivotCounts.reasoned,
            },
            {
              value: "standalone",
              label: "Standalone",
              count: pivotCounts.standalone,
            },
          ]}
        />

        <FilterBar
          searchValue={localSearch}
          onSearchChange={onLocalSearchChange}
          searchPlaceholder="Search visible events, actors, targets, or reasons"
          trailing={
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                alignItems: "center",
              }}
            >
              <span className="ops-text-muted">
                {filteredEvents.length} visible
              </span>
              <button
                type="button"
                className="ops-button"
                data-testid="audit-log-v2-live-tail-toggle"
                data-live-tail={data.filters.liveTail ? "on" : "off"}
                onClick={onToggleLiveTail}
                disabled={isTransitionPending}
                style={{ minHeight: "unset" }}
              >
                {data.filters.liveTail ? "Pause live tail" : "Arm live tail"}
              </button>
            </div>
          }
        />

        {filteredEvents.length === 0 ? (
          <EmptyState
            title={
              data.events.length === 0
                ? "No audit events matched"
                : "No visible events"
            }
            description={
              data.events.length === 0
                ? "Adjust the investigation rail to load a different audit slice."
                : "The current local search and review pivot hide every loaded event."
            }
          />
        ) : (
          <ol
            data-testid="audit-log-v2-rows"
            style={{
              display: "grid",
              gap: "8px",
              padding: 0,
              margin: 0,
              listStyle: "none",
            }}
          >
            {filteredEvents.map((event) => {
              const isExpanded = expandedEventId === event.eventId;
              const isRevealed = revealedEventIds.has(event.eventId);

              return (
                <li
                  key={event.eventId}
                  data-testid="audit-log-v2-row"
                  style={{
                    borderRadius: "12px",
                    border: "1px solid var(--app-border-subtle)",
                    background: "var(--app-surface-elevated)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onExpandedEventChange(
                        isExpanded ? undefined : event.eventId,
                      )
                    }
                    style={{
                      width: "100%",
                      display: "grid",
                      gap: "8px",
                      gridTemplateColumns:
                        "minmax(110px, 140px) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.9fr) auto",
                      padding: "10px",
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        display: "grid",
                        gap: "2px",
                        alignContent: "start",
                      }}
                    >
                      <strong className="ops-font-mono">
                        {formatTimestamp(event.timestamp)}
                      </strong>
                      <span className="ops-text-muted">{event.eventId}</span>
                    </span>

                    <span
                      style={{
                        display: "grid",
                        gap: "4px",
                        alignContent: "start",
                      }}
                    >
                      <strong>{event.action}</strong>
                      <span className="ops-font-mono">{event.target}</span>
                    </span>

                    <span
                      style={{
                        display: "grid",
                        gap: "4px",
                        alignContent: "start",
                      }}
                    >
                      <span className="ops-font-mono">{event.actorId}</span>
                      <span className="ops-text-muted">{event.moduleId}</span>
                    </span>

                    <span
                      style={{
                        display: "grid",
                        gap: "6px",
                        alignContent: "start",
                      }}
                    >
                      <span className="ops-text-muted">
                        {event.tenantScope}:{event.tenantScopeId}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px",
                        }}
                      >
                        {event.correlationId ? (
                          <AuditChip tone="warn">
                            corr {event.correlationId}
                          </AuditChip>
                        ) : null}
                        {event.reason ? (
                          <AuditChip tone="success">reason</AuditChip>
                        ) : (
                          <AuditChip tone="neutral">no reason</AuditChip>
                        )}
                      </span>
                    </span>

                    <span
                      aria-hidden
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: "var(--app-text-muted)",
                      }}
                    >
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div
                      data-testid="audit-log-v2-row-detail"
                      style={{
                        display: "grid",
                        gap: "8px",
                        padding: "0 10px 10px",
                        borderTop: "1px solid var(--app-border-subtle)",
                        background: "var(--app-surface-subtle)",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                        }}
                      >
                        <RevealField
                          label="Actor"
                          value={event.actorId}
                          revealed={isRevealed}
                          onReveal={() =>
                            onRevealedEventIdsChange(
                              nextRevealedEventIds(
                                revealedEventIds,
                                event.eventId,
                              ),
                            )
                          }
                          onHide={() =>
                            onRevealedEventIdsChange(
                              nextRevealedEventIds(
                                revealedEventIds,
                                event.eventId,
                              ),
                            )
                          }
                        />
                        <RevealField
                          label="Target"
                          value={event.target}
                          revealed={isRevealed}
                          onReveal={() =>
                            onRevealedEventIdsChange(
                              nextRevealedEventIds(
                                revealedEventIds,
                                event.eventId,
                              ),
                            )
                          }
                          onHide={() =>
                            onRevealedEventIdsChange(
                              nextRevealedEventIds(
                                revealedEventIds,
                                event.eventId,
                              ),
                            )
                          }
                        />
                        <AuditDetailField
                          label="Tenant"
                          value={`${event.tenantScope}:${event.tenantScopeId}`}
                        />
                        <AuditDetailField
                          label="Correlation"
                          value={event.correlationId ?? "No correlation id"}
                        />
                        <AuditDetailField
                          label="Reason"
                          value={event.reason ?? "No explicit reason captured"}
                        />
                        <AuditDetailField
                          label="Module"
                          value={event.moduleId}
                        />
                      </div>
                      <div
                        data-testid="audit-log-v2-row-json"
                        style={{
                          margin: 0,
                          padding: "8px",
                          borderRadius: "10px",
                          border: "1px solid var(--app-border-subtle)",
                          background: "var(--app-canvas)",
                          fontSize: "0.82rem",
                          overflowX: "auto",
                        }}
                      >
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: "var(--ops-font-mono)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {JSON.stringify(event, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function AuditDetailField(props: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: "4px",
        padding: "8px",
        borderRadius: "10px",
        border: "1px solid var(--app-border-subtle)",
        background: "var(--app-surface-elevated)",
      }}
    >
      <span
        style={{
          fontSize: "0.72rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--app-text-muted)",
        }}
      >
        {props.label}
      </span>
      <span className="ops-font-mono">{props.value}</span>
    </div>
  );
}

function AuditChip(props: {
  readonly children: ReactNode;
  readonly tone: "neutral" | "info" | "success" | "warn";
}) {
  const toneStyles: Record<
    AuditChipProps["tone"],
    {
      readonly border: string;
      readonly background: string;
      readonly color: string;
    }
  > = {
    neutral: {
      border: "1px solid var(--app-border-subtle)",
      background: "var(--app-surface-elevated)",
      color: "var(--app-text)",
    },
    info: {
      border:
        "1px solid color-mix(in srgb, var(--app-accent) 45%, transparent)",
      background:
        "color-mix(in srgb, var(--app-accent) 12%, var(--app-surface-elevated))",
      color: "var(--app-text)",
    },
    success: {
      border:
        "1px solid color-mix(in srgb, var(--app-success) 50%, transparent)",
      background:
        "color-mix(in srgb, var(--app-success) 14%, var(--app-surface-elevated))",
      color: "var(--app-text)",
    },
    warn: {
      border:
        "1px solid color-mix(in srgb, var(--app-warning) 50%, transparent)",
      background:
        "color-mix(in srgb, var(--app-warning) 14%, var(--app-surface-elevated))",
      color: "var(--app-text)",
    },
  };
  const style = toneStyles[props.tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        minHeight: "24px",
        padding: "0 8px",
        borderRadius: "999px",
        fontSize: "0.78rem",
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {props.children}
    </span>
  );
}

type AuditChipProps = Parameters<typeof AuditChip>[0];

function buildCorrelationClusters(
  events: readonly AuditEvent[],
): CorrelationCluster[] {
  const clusters = new Map<string, CorrelationCluster>();

  for (const event of events) {
    if (event.correlationId === undefined) {
      continue;
    }

    const key = event.correlationId;
    const previous = clusters.get(key);

    if (previous) {
      clusters.set(key, {
        correlationId: key,
        count: previous.count + 1,
        latestTimestamp:
          previous.latestTimestamp > event.timestamp
            ? previous.latestTimestamp
            : event.timestamp,
        tenants: Array.from(
          new Set([
            ...previous.tenants,
            `${event.tenantScope}:${event.tenantScopeId}`,
          ]),
        ),
      });
      continue;
    }

    clusters.set(key, {
      correlationId: key,
      count: 1,
      latestTimestamp: event.timestamp,
      tenants: [`${event.tenantScope}:${event.tenantScopeId}`],
    });
  }

  return [...clusters.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return right.latestTimestamp.localeCompare(left.latestTimestamp);
  });
}

function buildFilterChips(
  data: AuditLogReadyViewProps["data"],
  search: AuditLogSearch,
): readonly {
  readonly label: string;
  readonly tone: AuditChipProps["tone"];
}[] {
  const chips: Array<{
    readonly label: string;
    readonly tone: AuditChipProps["tone"];
  }> = [
    { label: `module ${data.filters.module}`, tone: "neutral" },
    { label: `window ${data.filters.window}`, tone: "info" },
    {
      label: data.filters.liveTail ? "tail armed" : "tail paused",
      tone: "warn",
    },
  ];

  if (search.actor) {
    chips.push({ label: `actor ${search.actor}`, tone: "neutral" });
  }

  if (search.action) {
    chips.push({ label: `action ${search.action}`, tone: "success" });
  }

  if (search.target) {
    chips.push({ label: `target ${search.target}`, tone: "neutral" });
  }

  if (search.tenantScope && search.tenantScopeId) {
    chips.push({
      label: `${search.tenantScope}:${search.tenantScopeId}`,
      tone: "info",
    });
  }

  if (search.correlation) {
    chips.push({ label: `corr ${search.correlation}`, tone: "warn" });
  }

  if (search.classification) {
    chips.push({
      label: `classification ${search.classification}`,
      tone: "neutral",
    });
  }

  if (search.ip) {
    chips.push({ label: `ip ${search.ip}`, tone: "neutral" });
  }

  return chips;
}

const pivotLabels: Record<AuditPivot, string> = {
  all: "All loaded",
  correlated: "Correlated",
  reasoned: "Reasoned",
  standalone: "Standalone",
};

const formatTimestamp = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 19).replace("T", " ");

function resolveWindowPreset(value: string | undefined): string {
  if (value && windowSet.has(value)) {
    return value;
  }

  return "24h";
}

function resolveModuleHandoff(
  moduleId: PlatformModuleId,
): { readonly to: string; readonly label: string } | undefined {
  if (moduleId === platformModuleId.runtimeConfig) {
    return { to: "/r/config", label: "Open config workspace" };
  }

  if (moduleId === platformModuleId.featureFlags) {
    return { to: "/r/flag", label: "Open flag workspace" };
  }

  if (moduleId === platformModuleId.authorization) {
    return { to: "/r/access", label: "Open access workspace" };
  }

  if (moduleId === platformModuleId.supportOperations) {
    return { to: "/r/support", label: "Open support workspace" };
  }

  return undefined;
}

function nextRevealedEventIds(
  revealedEventIds: ReadonlySet<string>,
  eventId: string,
): ReadonlySet<string> {
  const next = new Set(revealedEventIds);

  if (next.has(eventId)) {
    next.delete(eventId);
  } else {
    next.add(eventId);
  }

  return next;
}

function compactAuditLogSearch(
  search: AuditLogSearch,
): AdminAuditLogV2RawSearch {
  return {
    ...(search.module === undefined ? {} : { module: search.module }),
    ...(search.actor === undefined ? {} : { actor: search.actor }),
    ...(search.action === undefined ? {} : { action: search.action }),
    ...(search.target === undefined ? {} : { target: search.target }),
    ...(search.tenantScope === undefined
      ? {}
      : { tenantScope: search.tenantScope }),
    ...(search.tenantScopeId === undefined
      ? {}
      : { tenantScopeId: search.tenantScopeId }),
    ...(search.classification === undefined
      ? {}
      : { classification: search.classification }),
    ...(search.ip === undefined ? {} : { ip: search.ip }),
    ...(search.correlation === undefined
      ? {}
      : { correlation: search.correlation }),
    ...(search.window === undefined ? {} : { window: search.window }),
    ...(search.customFrom === undefined
      ? {}
      : { customFrom: search.customFrom }),
    ...(search.customTo === undefined ? {} : { customTo: search.customTo }),
    ...(search.tail === undefined ? {} : { tail: search.tail }),
  };
}

function FilterRailField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly type?: string;
  readonly "data-testid"?: string;
}) {
  return (
    <label style={{ display: "grid", gap: "4px" }}>
      <span className="ops-label">{props.label}</span>
      <input
        className="ops-input"
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        placeholder={props.placeholder}
        data-testid={props["data-testid"]}
      />
    </label>
  );
}

function FilterRailSelect(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
}) {
  return (
    <label style={{ display: "grid", gap: "4px" }}>
      <span className="ops-label">{props.label}</span>
      <select
        className="ops-select"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
