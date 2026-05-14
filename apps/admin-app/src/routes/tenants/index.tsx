import type { FormEvent } from "react";
import { Button, EmptyState, LoadingState } from "@comvestec/ui";
import { createAdminAppFileRoute } from "../../file-route";

type TenantWorkspaceSearch = {
  readonly tenantId?: string;
};

const parseTenantWorkspaceSearch = (
  search: Record<string, unknown>,
): TenantWorkspaceSearch => {
  const tenantId =
    typeof search.tenantId === "string" ? search.tenantId.trim() : undefined;

  return tenantId === undefined || tenantId.length === 0 ? {} : { tenantId };
};

export const Route = createAdminAppFileRoute("/tenants/")({
  validateSearch: parseTenantWorkspaceSearch,
  component: TenantWorkspaceIndex,
});

function TenantWorkspaceIndex() {
  const search = Route.useSearch();

  const openWorkspace = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const tenantIdValue = formData.get("tenantId");
    const tenantId =
      typeof tenantIdValue === "string" ? tenantIdValue.trim() : "";

    if (tenantId.length === 0 || typeof window === "undefined") {
      return;
    }

    window.location.assign(`/tenants/${encodeURIComponent(tenantId)}`);
  };

  if (search.tenantId !== undefined) {
    const tenantWorkspacePath = `/tenants/${encodeURIComponent(search.tenantId)}`;

    return (
      <>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.location.replace(${JSON.stringify(tenantWorkspacePath)});`,
          }}
        />
        <LoadingState title="Opening tenant workspace…" />
      </>
    );
  }

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Tenant Workspace</h1>
        <p className="ops-screen-subtitle">
          Open a tenant-scoped workspace by entering the authoritative scope ID.
        </p>
      </div>

      <div className="ops-card">
        <p className="ops-card-title">Open tenant workspace</p>
        <form
          onSubmit={openWorkspace}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "end",
            marginTop: "12px",
          }}
        >
          <label
            style={{
              display: "grid",
              gap: "6px",
              minWidth: "min(100%, 320px)",
              flex: "1 1 320px",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ops-text-muted)",
              }}
            >
              Tenant scope ID
            </span>
            <input
              name="tenantId"
              required
              placeholder="organization, enterprise, or individual scope id"
              autoComplete="off"
              style={{
                width: "100%",
                minHeight: "36px",
                padding: "8px 12px",
                borderRadius: "var(--ops-radius)",
                border: "1px solid var(--ops-border-strong)",
                background: "var(--ops-surface-3)",
                color: "var(--ops-text)",
                font: "inherit",
              }}
            />
          </label>
          <Button type="submit" variant="primary">
            Open workspace
          </Button>
        </form>
      </div>

      <EmptyState
        title="Tenant lookup stays backend-owned"
        description="The admin app does not invent its own tenant catalog. Use a known scope ID from the platform control plane to enter the tenant workspace."
      />
    </div>
  );
}
