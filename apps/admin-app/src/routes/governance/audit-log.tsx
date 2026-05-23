import { useMemo } from "react";
import { createAdminAppFileRoute } from "../../file-route";
import { EmptyState, LoadingState, PermissionDeniedState } from "@comvestec/ui";
import { platformModuleId, type PlatformModuleId } from "@comvestec/contracts";
import { Schema } from "effect";
import { AdminSessionRequiredState } from "../../components/admin-session-required-state";
import {
  ScreenHeader,
  KpiCard,
  FilterBar,
  FilterSelect,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  ShieldIcon,
  resolveTableAriaSort,
} from "../../components/ui";

const platformModuleIds = Object.values(platformModuleId) as PlatformModuleId[];

const AuditLogSearchSchema = Schema.Struct({
  module: Schema.optional(Schema.NonEmptyString),
});

export const Route = createAdminAppFileRoute("/governance/audit-log")({
  validateSearch: (raw) => Schema.validateSync(AuditLogSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ module: search.module }),
  loader: ({ deps }) =>
    import("../../lib/governance-loaders").then(
      ({ loadAdminAuditLogLoaderData }) =>
        loadAdminAuditLogLoaderData(
          deps.module != null &&
            platformModuleIds.includes(deps.module as PlatformModuleId)
            ? (deps.module as PlatformModuleId)
            : undefined,
        ),
    ),
  component: AuditLog,
  pendingComponent: () => <LoadingState title="Loading audit log…" />,
});

function AuditLog() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tableState = useTableState<"timestamp" | "module" | "action" | "actor">(
    {
      initialPageSize: 25,
      initialSortKey: "timestamp",
      initialSortDir: "desc",
    },
  );

  const events = data.kind === "ready" ? data.events : [];
  const { visible, total } = applyTableState(events, tableState, {
    searchOn: (e) =>
      `${e.action} ${e.target ?? ""} ${e.actorId} ${e.reason ?? ""}`,
    sortOn: {
      timestamp: (e) => e.timestamp,
      module: (e) => e.moduleId,
      action: (e) => e.action,
      actor: (e) => e.actorId,
    },
  });

  const moduleCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.moduleId, (m.get(e.moduleId) ?? 0) + 1);
    return m;
  }, [events]);
  const distinctActors = useMemo(
    () => new Set(events.map((e) => e.actorId)).size,
    [events],
  );

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access the audit log."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to access the audit log."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const selectedModule = search.module ?? platformModuleId.auditLog;

  return (
    <div className="ops-screen">
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Audit Log"
        breadcrumbs={[{ label: "Governance" }, { label: "Audit Log" }]}
        subtitle={
          <>
            Immutable platform audit trail. Currently scoped to{" "}
            <span className="mono">{selectedModule}</span>.
          </>
        }
      />

      <div className="ops-bento">
        <KpiCard label="Events" value={events.length} />
        <KpiCard label="Modules" value={moduleCounts.size} tone="accent" />
        <KpiCard label="Distinct actors" value={distinctActors} tone="accent" />
        <KpiCard
          label="Most active module"
          value={
            <span className="mono" style={{ fontSize: "0.95rem" }}>
              {[...moduleCounts.entries()].sort(
                (a, b) => b[1] - a[1],
              )[0]?.[0] ?? "—"}
            </span>
          }
        />
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Events
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search action, target, actor, reason…"
          trailing={
            <FilterSelect
              label="Module"
              value={selectedModule}
              onChange={(v) =>
                navigate({ search: { module: v as PlatformModuleId } })
              }
              options={platformModuleIds.map((m) => ({ value: m, label: m }))}
            />
          }
        />

        {visible.length === 0 ? (
          <EmptyState
            title="No events"
            description={`No audit events found for module "${selectedModule}".`}
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  {(
                    [
                      ["timestamp", "Timestamp"],
                      ["module", "Module"],
                      ["action", "Action"],
                      ["actor", "Actor"],
                    ] as const
                  ).map(([k, label]) => (
                    <SortableTableHeader
                      key={k}
                      ariaSort={resolveTableAriaSort(tableState, k)}
                      onToggle={() => tableState.toggleSort(k)}
                    >
                      {label}
                    </SortableTableHeader>
                  ))}
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((event) => (
                  <tr key={event.eventId}>
                    <td className="mono">
                      {event.timestamp.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="mono">
                      <span className="ops-dot ops-dot--active" />
                      {event.moduleId}
                    </td>
                    <td className="mono">{event.action}</td>
                    <td className="mono ops-redacted">{event.actorId}</td>
                    <td className="mono ops-redacted">{event.target}</td>
                    <td style={{ color: "var(--ops-text-secondary)" }}>
                      {event.reason ?? "—"}
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
