import { Outlet } from "@tanstack/react-router";
import { createAdminAppFileRoute } from "../file-route";

export const Route = createAdminAppFileRoute("/tenants")({
  component: TenantWorkspaceLayout,
});

function TenantWorkspaceLayout() {
  return <Outlet />;
}
