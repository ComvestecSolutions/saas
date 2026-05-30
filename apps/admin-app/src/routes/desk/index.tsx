import { LoadingState } from "@comvestec/ui";
import { MissionControlRouteView } from "../../components/desk/mission-control-screen";
import { createAdminAppFileRoute } from "../../file-route";

/**
 * `/desk` mission-control landing surface under the shared Operator
 * Desk parent layout.
 */
export const Route = createAdminAppFileRoute("/desk/")({
  loader: () =>
    import("../../lib/desk-center-loader").then(
      ({ loadAdminDeskCenterLoaderData }) => loadAdminDeskCenterLoaderData(),
    ),
  component: DeskMissionControlIndexRoute,
  pendingComponent: () => <LoadingState title="Loading signal deck…" />,
});

function DeskMissionControlIndexRoute() {
  return <MissionControlRouteView data={Route.useLoaderData()} />;
}
