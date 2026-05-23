import { LoadingState } from "@comvestec/ui";
import { MissionControlRouteView } from "../components/desk/mission-control-screen";
import { createAdminAppFileRoute } from "../file-route";

/**
 * `/desk` — canonical Signal Deck mission-control route. Mirrors the
 * root operations-home aggregate so direct `/desk` entry lands on the
 * real command center rather than the old placeholder workbench.
 */
export const Route = createAdminAppFileRoute("/desk")({
  loader: () =>
    import("../lib/desk-center-loader").then(
      ({ loadAdminDeskCenterLoaderData }) => loadAdminDeskCenterLoaderData(),
    ),
  component: DeskMissionControlRoute,
  pendingComponent: () => <LoadingState title="Loading signal deck…" />,
});

function DeskMissionControlRoute() {
  return <MissionControlRouteView data={Route.useLoaderData()} />;
}
