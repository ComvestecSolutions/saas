import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../file-route";
import { redirectAdminLegacyRoute } from "../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/billing")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.billing, location),
  component: LegacyBillingRoute,
});

function LegacyBillingRoute() {
  return <Outlet />;
}
