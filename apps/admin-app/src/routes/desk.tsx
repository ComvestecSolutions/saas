import { Outlet } from "@tanstack/react-router";
import { createAdminAppFileRoute } from "../file-route";

/**
 * `/desk` — canonical Operator Desk layout route. Nested `index.tsx`
 * owns the mission-control home surface while child routes render the
 * rest of the desk workbench under the same parent shell.
 */
export const Route = createAdminAppFileRoute("/desk")({
  component: DeskLayoutRoute,
});

function DeskLayoutRoute() {
  return <Outlet />;
}
