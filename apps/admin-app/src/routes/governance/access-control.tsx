import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { redirectAdminLegacyRoute } from "../../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/governance/access-control")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.accessControl, location),
  component: LegacyAccessControlRoute,
});

function LegacyAccessControlRoute() {
  return <Outlet />;
}
