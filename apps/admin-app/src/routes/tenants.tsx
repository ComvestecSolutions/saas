import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../file-route";
import { redirectAdminLegacyRoute } from "../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/tenants")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.tenantWorkspaceDiscovery, location),
  component: TenantWorkspaceLayout,
});

function TenantWorkspaceLayout() {
  return <Outlet />;
}
