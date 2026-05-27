import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../file-route";
import { redirectAdminLegacyRoute } from "../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/support-operations")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.supportOperations, location),
  component: LegacySupportOperationsRoute,
});

function LegacySupportOperationsRoute() {
  return <Outlet />;
}
