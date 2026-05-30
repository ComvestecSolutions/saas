import { LoadingState } from "@comvestec/ui";
import { TenantsDirectoryScreen } from "../../components/tenants-directory-screen";
import { createAdminAppFileRoute } from "../../file-route";

/**
 * Legacy tenant discovery entrypoint kept as a path-compatible alias
 * for existing deep links. The app-wide capability model now points
 * at `/desk/tenants`; this route remains only as a compatibility shim.
 */
export const Route = createAdminAppFileRoute("/tenants/")({
  loader: () =>
    import("../../lib/tenants-directory-loader").then(
      ({ loadAdminTenantsDirectoryLoaderData }) =>
        loadAdminTenantsDirectoryLoaderData(),
    ),
  component: TenantWorkspaceDiscoveryRoute,
  pendingComponent: () => <LoadingState title="Loading tenants…" />,
});

function TenantWorkspaceDiscoveryRoute() {
  return <TenantsDirectoryScreen data={Route.useLoaderData()} />;
}
