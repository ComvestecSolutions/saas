import { Outlet } from "@tanstack/react-router";
import { adminRoutePath } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import { redirectAdminLegacyRoute } from "../../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute(
  "/integrations/webhooks-api-access",
)({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyRoute(adminRoutePath.webhooksApiAccess, location),
  component: LegacyWebhooksApiAccessRoute,
});

function LegacyWebhooksApiAccessRoute() {
  return <Outlet />;
}
