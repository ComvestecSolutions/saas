import { LoadingState } from "@comvestec/ui";
import { MissionControlRouteView } from "../components/desk/mission-control-screen";
import { createAdminAppFileRoute } from "../file-route";

/**
 * Root operations entry — now a Signal Deck mission-control surface
 * instead of the legacy posture board. `/desk` mirrors the same
 * aggregate so both entry paths render the real command center.
 */
export const Route = createAdminAppFileRoute("/")({
  loader: () =>
    import("../lib/desk-center-loader").then(
      ({ loadAdminDeskCenterLoaderData }) => loadAdminDeskCenterLoaderData(),
    ),
  component: OperationsHomeRoute,
  pendingComponent: () => <LoadingState title="Loading operations summary…" />,
});

function OperationsHomeRoute() {
  return <MissionControlRouteView data={Route.useLoaderData()} />;
}
