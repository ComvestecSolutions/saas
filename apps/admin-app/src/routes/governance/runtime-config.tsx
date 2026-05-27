import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { redirectAdminLegacyRoute } from "../../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/governance/runtime-config")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.runtimeConfig, location),
  component: LegacyRuntimeConfigRoute,
});

function LegacyRuntimeConfigRoute() {
  return <Outlet />;
}
