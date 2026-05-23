import { LoadingState } from "@comvestec/ui";
import { createAdminAppFileRoute } from "../../file-route";
import { TenantsDirectoryScreen } from "../../components/tenants-directory-screen";

/**
 * `/r/tenants` — canonical tenant directory workspace.
 */
export const Route = createAdminAppFileRoute("/r/tenants")({
  loader: () =>
    import("../../lib/tenants-directory-loader").then(
      ({ loadAdminTenantsDirectoryLoaderData }) =>
        loadAdminTenantsDirectoryLoaderData(),
    ),
  component: TenantsResourceRoute,
  pendingComponent: () => <LoadingState title="Loading tenants…" />,
});

function TenantsResourceRoute() {
  return <TenantsDirectoryScreen data={Route.useLoaderData()} />;
}
