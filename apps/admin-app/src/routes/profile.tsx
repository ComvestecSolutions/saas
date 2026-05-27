import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../file-route";
import { redirectAdminLegacyRoute } from "../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/profile")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.profile, location),
  component: LegacyProfileRoute,
});

function LegacyProfileRoute() {
  return <Outlet />;
}
