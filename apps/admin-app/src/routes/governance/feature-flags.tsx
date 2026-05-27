import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { redirectAdminLegacyRoute } from "../../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/governance/feature-flags")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.featureFlags, location),
  component: LegacyFeatureFlagsRoute,
});

function LegacyFeatureFlagsRoute() {
  return <Outlet />;
}
