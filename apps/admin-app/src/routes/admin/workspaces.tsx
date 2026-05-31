import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  EmptyState,
  HighRiskActionGuard,
  StateScreen,
  type HighRiskReason,
} from "@comvestec/ui";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  OpsPanel,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import { formatAdminDate } from "../../lib/timestamp-format";
import {
  createAdminWorkspace,
  deleteAdminWorkspace,
} from "../../lib/admin-workspaces-mutations-server";
import type { AdminWorkspacesRouteData } from "../../lib/admin-workspaces-route-data";

/**
 * `/admin/workspaces` — spec-canonical admin-organization
 * workspace tabs surface shipped by Phase 7 admin-org screens
 * commit 7b-1 (admin-app implementation plan §11). Consumes the
 * `admin-workspaces-{loader,route-data,route-server}` trio gated
 * end-to-end through `resolveTrustedRequestContextFromSessionId`
 * and `listAdminWorkspacesFromEnvironment` (Phase 7a-1 canonical
 * alias). The owner subject id is sourced from the trusted
 * request context's `actorId` — workspaces are per-operator.
 *
 * The create + delete CTAs now execute through trusted-session
 * mutations-server entrypoints. The route adds a compact
 * workspace-template composer so operators can create a useful
 * starting layout instead of firing an opaque action with no
 * payload context.
 */
const createReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "admin-workspaces.create.daily-driver",
    label: "Daily driver — create operator workspace",
  },
  {
    id: "admin-workspaces.create.incident-response",
    label: "Incident response — create operator workspace",
  },
  {
    id: "admin-workspaces.create.audit-rotation",
    label: "Audit rotation — create operator workspace",
  },
];

const deleteReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "admin-workspaces.delete.workspace-stale",
    label: "Workspace stale — delete operator workspace",
  },
  {
    id: "admin-workspaces.delete.layout-corruption",
    label: "Layout corruption — delete operator workspace",
  },
  {
    id: "admin-workspaces.delete.offboarding",
    label: "Operator offboarding — delete operator workspace",
  },
];

type AdminWorkspaceSortKey = "workspace" | "position" | "layout" | "updated";
type ReadyData = Extract<AdminWorkspacesRouteData, { readonly kind: "ready" }>;

const resolveWorkspacePaneCount = (serializedLayout: string): number => {
  try {
    const parsed: unknown = JSON.parse(serializedLayout);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "panes" in parsed &&
      Array.isArray(parsed.panes)
    ) {
      return parsed.panes.length;
    }
  } catch {
    return 0;
  }

  return 0;
};

const resolveWorkspaceResources = (
  serializedLayout: string,
): readonly string[] => {
  try {
    const parsed: unknown = JSON.parse(serializedLayout);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "panes" in parsed &&
      Array.isArray(parsed.panes)
    ) {
      const resources = parsed.panes.flatMap((pane) => {
        if (
          typeof pane === "object" &&
          pane !== null &&
          "resource" in pane &&
          typeof pane.resource === "string"
        ) {
          return [pane.resource];
        }

        return [];
      });

      return [...new Set(resources)];
    }
  } catch {
    return [];
  }

  return [];
};

const workspaceTemplates = [
  {
    id: "daily-driver",
    label: "Daily driver",
    serializedLayout:
      '{"panes":[{"id":"mission-control","resource":"operations-home"}]}',
  },
  {
    id: "incident-response",
    label: "Incident response",
    serializedLayout:
      '{"panes":[{"id":"support","resource":"support"},{"id":"audit","resource":"audit"}]}',
  },
  {
    id: "vendor-watch",
    label: "Vendor watch",
    serializedLayout:
      '{"panes":[{"id":"vendors","resource":"vendors"},{"id":"runs","resource":"runs"},{"id":"notify","resource":"notify"}]}',
  },
] as const;

export const Route = createAdminAppFileRoute("/admin/workspaces")({
  loader: async () => {
    const { loadAdminWorkspacesLoaderData } =
      await import("../../lib/admin-workspaces-loader");
    return loadAdminWorkspacesLoaderData({});
  },
  component: AdminWorkspacesRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading admin workspaces…" />
  ),
});

function AdminWorkspacesRoute() {
  const data: AdminWorkspacesRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view admin organization workspaces."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access admin organization workspaces."
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

  return <AdminWorkspacesReadyRoute data={data} />;
}

function AdminWorkspacesReadyRoute({ data }: { readonly data: ReadyData }) {
  const router = useRouter();
  const createWorkspace = useServerFn(createAdminWorkspace);
  const deleteWorkspace = useServerFn(deleteAdminWorkspace);
  const [createArmed, setCreateArmed] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceTemplateId, setWorkspaceTemplateId] = useState<
    (typeof workspaceTemplates)[number]["id"]
  >(workspaceTemplates[0].id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const tableState = useTableState<AdminWorkspaceSortKey>({
    initialPageSize: 10,
    initialSortKey: "updated",
    initialSortDir: "desc",
  });
  const { workspaces, ownerSubjectId } = data;
  const multiPaneCount = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          resolveWorkspacePaneCount(workspace.serializedLayout) > 1,
      ).length,
    [workspaces],
  );
  const totalPaneCount = useMemo(
    () =>
      workspaces.reduce(
        (total, workspace) =>
          total + resolveWorkspacePaneCount(workspace.serializedLayout),
        0,
      ),
    [workspaces],
  );
  const { visible, total } = applyTableState(workspaces, tableState, {
    searchOn: (workspace) =>
      `${workspace.name} ${workspace.id} ${workspace.ownerSubjectId}`,
    sortOn: {
      workspace: (workspace) => workspace.name,
      position: (workspace) => workspace.position,
      layout: (workspace) =>
        resolveWorkspacePaneCount(workspace.serializedLayout),
      updated: (workspace) => workspace.updatedAt,
    },
  });
  const selectedTemplate =
    workspaceTemplates.find(
      (template) => template.id === workspaceTemplateId,
    ) ?? workspaceTemplates[0];
  const selectedTemplateResources = useMemo(
    () => resolveWorkspaceResources(selectedTemplate.serializedLayout),
    [selectedTemplate.serializedLayout],
  );

  const handleCreateConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    try {
      const result = await createWorkspace({
        data: {
          ownerSubjectId,
          name: workspaceName.trim(),
          serializedLayout: selectedTemplate.serializedLayout,
          reasonId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setCreateArmed(false);
      setWorkspaceName("");
      setWorkspaceTemplateId(workspaceTemplates[0].id);
      setActionError(null);
      setActionSuccess(`Workspace created: ${result.name}.`);
      await router.invalidate();
    } catch (error) {
      setCreateArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to create the operator workspace. Retry shortly.",
      );
    }
  };

  const handleDeleteConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (deleteArmed === null) return;

    try {
      const result = await deleteWorkspace({
        data: {
          ownerSubjectId,
          workspaceId: deleteArmed,
          reasonId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setDeleteArmed(null);
      setActionError(null);
      setActionSuccess(`Workspace deleted: ${result.workspaceId}.`);
      await router.invalidate();
    } catch (error) {
      setDeleteArmed(null);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to delete the operator workspace. Retry shortly.",
      );
    }
  };

  return (
    <section
      className="ops-screen ops-shell-grid"
      data-testid="admin-workspaces-ready"
      data-pattern="admin-workspaces-v2"
    >
      <aside className="ops-shell-grid__aside">
        <OpsPanel
          title="Selected template"
          description="Preview the layout that will be staged for the next operator workspace."
          data-testid="admin-workspaces-template-preview"
          tone={selectedTemplateResources.length > 1 ? "warn" : "neutral"}
        >
          <div className="ops-stack-md">
            <div className="ops-inline-cluster">
              <span className="ops-copy-row ops-copy-row--strong">
                {selectedTemplate.label}
              </span>
              <span className="ops-note mono">{selectedTemplate.id}</span>
            </div>
            <div className="ops-meta-grid">
              <div>
                <p className="ops-meta-label">Pane count</p>
                <p className="ops-meta-value">
                  {resolveWorkspacePaneCount(selectedTemplate.serializedLayout)}
                </p>
              </div>
              <div>
                <p className="ops-meta-label">Resource count</p>
                <p className="ops-meta-value">
                  {selectedTemplateResources.length}
                </p>
              </div>
              <div>
                <p className="ops-meta-label">Library size</p>
                <p className="ops-meta-value">{workspaces.length}</p>
              </div>
            </div>
            <div className="ops-chip-grid">
              {selectedTemplateResources.map((resource) => (
                <div key={resource} className="ops-chip-card">
                  <span className="ops-chip-label">Resource</span>
                  <span className="ops-chip-value mono">{resource}</span>
                </div>
              ))}
            </div>
          </div>
        </OpsPanel>

        <OpsPanel
          title="Operator workflow"
          description="Use templates to keep new workspaces purposeful instead of empty shells."
        >
          <ul className="ops-guidance-list">
            <li>
              Name the workspace after the operator job it should support.
            </li>
            <li>
              Start from a template that matches the current mission loop.
            </li>
            <li>
              Keep the library lean so operators do not accumulate redundant
              layouts they no longer use.
            </li>
          </ul>
        </OpsPanel>
      </aside>

      <div className="ops-shell-grid__main">
        <ScreenHeader
          title="Admin workspaces"
          breadcrumbs={[
            { label: "Admin" },
            { label: "Workspaces", href: "/admin/workspaces" },
          ]}
          subtitle={
            <>
              Operator-owned workspace layouts for{" "}
              <span className="mono" data-testid="admin-workspaces-owner-id">
                {ownerSubjectId}
              </span>
              .
            </>
          }
        />

        {actionSuccess !== null ? (
          <div
            data-testid="admin-workspaces-action-success"
            role="status"
            className="ops-feedback success"
          >
            {actionSuccess}
          </div>
        ) : null}
        {actionError !== null ? (
          <div
            data-testid="admin-workspaces-action-error"
            role="alert"
            className="ops-feedback error"
          >
            {actionError}
          </div>
        ) : null}

        <div className="ops-bento" data-testid="admin-workspaces-kpis">
          <KpiCard
            label="Total workspaces"
            value={workspaces.length}
            tone={workspaces.length > 0 ? "good" : "neutral"}
          />
          <KpiCard
            label="Multi-pane"
            value={multiPaneCount}
            tone={multiPaneCount > 0 ? "good" : "neutral"}
          />
          <KpiCard
            label="Tracked panes"
            value={totalPaneCount}
            tone={totalPaneCount > 0 ? "neutral" : "warn"}
          />
        </div>

        <OpsPanel
          title="Create workspace"
          description="Start from a typed layout template so new operator workspaces open with the right surfaces already staged."
          data-testid="admin-workspaces-create-composer"
        >
          <div className="ops-composer-grid">
            <label className="ops-field" htmlFor="admin-workspaces-create-name">
              <span>Workspace name</span>
              <input
                id="admin-workspaces-create-name"
                data-testid="admin-workspaces-create-name"
                value={workspaceName}
                onChange={(event) =>
                  setWorkspaceName(event.currentTarget.value)
                }
                placeholder="Vendor watchboard"
              />
            </label>
            <label
              className="ops-field"
              htmlFor="admin-workspaces-create-template"
            >
              <span>Template</span>
              <select
                id="admin-workspaces-create-template"
                data-testid="admin-workspaces-create-template"
                value={workspaceTemplateId}
                onChange={(event) =>
                  setWorkspaceTemplateId(
                    event.currentTarget
                      .value as (typeof workspaceTemplates)[number]["id"],
                  )
                }
              >
                {workspaceTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="admin-workspaces-create-cta"
              disabled={workspaceName.trim().length === 0}
              onClick={() => setCreateArmed(true)}
              className="ops-primary-button"
            >
              Create workspace
            </button>
          </div>
        </OpsPanel>

        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Workspace library
              <span className="ops-card-head__count">{total}</span>
            </p>
          </div>

          <FilterBar
            searchValue={tableState.search}
            onSearchChange={tableState.setSearch}
            searchPlaceholder="Search workspace names or ids…"
          />

          {visible.length === 0 ? (
            <div className="ops-pane-grid" data-testid="admin-workspaces-empty">
              <OpsPanel
                title="No operator workspaces match the current view"
                description="Clear the current search or create a new workspace from the selected template."
              >
                <EmptyState
                  title="No operator workspaces match the current view"
                  description="The library is clear for the current filter state."
                />
              </OpsPanel>
              <OpsPanel
                title="Template ready to stage"
                description="The currently selected template can seed the next operator workspace immediately."
              >
                <div className="ops-chip-grid">
                  {selectedTemplateResources.map((resource) => (
                    <div key={resource} className="ops-chip-card">
                      <span className="ops-chip-label">Next resource</span>
                      <span className="ops-chip-value mono">{resource}</span>
                    </div>
                  ))}
                </div>
              </OpsPanel>
            </div>
          ) : (
            <div className="ops-table-wrapper">
              <table data-testid="admin-workspaces-table" className="ops-table">
                <thead>
                  <tr>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(tableState, "workspace")}
                      onToggle={() => tableState.toggleSort("workspace")}
                    >
                      Workspace
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(tableState, "position")}
                      onToggle={() => tableState.toggleSort("position")}
                    >
                      Position
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(tableState, "layout")}
                      onToggle={() => tableState.toggleSort("layout")}
                    >
                      Layout
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(tableState, "updated")}
                      onToggle={() => tableState.toggleSort("updated")}
                    >
                      Updated
                    </SortableTableHeader>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((workspace) => (
                    <tr
                      key={workspace.id}
                      data-testid="admin-workspaces-row"
                      data-workspace-id={workspace.id}
                    >
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span className="text-strong">{workspace.name}</span>
                          <span className="mono ops-secondary-text">
                            {workspace.id}
                          </span>
                        </div>
                      </td>
                      <td className="mono">{workspace.position}</td>
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span className="text-strong">
                            {resolveWorkspacePaneCount(
                              workspace.serializedLayout,
                            )}{" "}
                            panes
                          </span>
                          <span className="ops-secondary-text">
                            {(() => {
                              const resources = resolveWorkspaceResources(
                                workspace.serializedLayout,
                              );
                              return resources.length === 0
                                ? "Owned by current operator"
                                : resources.join(" · ");
                            })()}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span className="mono">
                            {formatAdminDate(workspace.updatedAt)}
                          </span>
                          <span className="ops-secondary-text">
                            Last saved layout revision
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          data-testid="admin-workspaces-delete-cta"
                          data-workspace-id={workspace.id}
                          onClick={() => setDeleteArmed(workspace.id)}
                          className="ops-btn ops-btn--danger ops-btn--xs"
                        >
                          Delete
                        </button>
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

        {createArmed ? (
          <HighRiskActionGuard
            action={{
              id: "admin-workspaces-create",
              label: "Create operator workspace",
            }}
            selection={[ownerSubjectId]}
            reasons={createReasonCatalog}
            requireNote
            confirmLabel="Create"
            onConfirm={handleCreateConfirm}
            onCancel={() => setCreateArmed(false)}
          />
        ) : null}

        {deleteArmed !== null ? (
          <HighRiskActionGuard
            action={{
              id: "admin-workspaces-delete",
              label: "Delete operator workspace",
            }}
            selection={[deleteArmed]}
            reasons={deleteReasonCatalog}
            requireNote
            confirmLabel="Delete"
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteArmed(null)}
          />
        ) : null}
      </div>
    </section>
  );
}
