import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../file-route";
import { redirectAdminLegacyRoute } from "../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/compliance-retention")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.complianceRetention, location),
  component: LegacyComplianceRetentionRoute,
});

function LegacyComplianceRetentionRoute() {
  return <Outlet />;
}
