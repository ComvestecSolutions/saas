import { useRouterState } from "@tanstack/react-router";
import { createAdminAppFileRoute } from "../file-route";
import { parseAdminAuthSearch } from "../auth/paths";
import { AdminSignInScreen } from "../auth/sign-in-screen";

export const Route = createAdminAppFileRoute("/sign-in")({
  component: AdminSignInRoute,
});

function AdminSignInRoute() {
  const { searchStr } = useRouterState({
    select: (state) => state.location,
  });
  const { returnTo, reason } = parseAdminAuthSearch(searchStr);

  return (
    <AdminSignInScreen
      {...(returnTo === undefined ? {} : { returnTo })}
      {...(reason === undefined ? {} : { reason })}
    />
  );
}
