import { useRouterState } from "@tanstack/react-router";
import { createAdminAppFileRoute } from "../../file-route";
import { parseAdminAuthSearch } from "../../auth/paths";
import { AdminSignInScreen } from "../../auth/sign-in-screen";

export const Route = createAdminAppFileRoute("/auth/sign-in")({
  component: AdminSignInRoute,
});

function AdminSignInRoute() {
  const { pathname, searchStr } = useRouterState({
    select: (state) => state.location,
  });
  const { returnTo, reason } = parseAdminAuthSearch(searchStr);

  return pathname === "/auth/sign-in" ? (
    <AdminSignInScreen
      {...(returnTo === undefined ? {} : { returnTo })}
      {...(reason === undefined ? {} : { reason })}
    />
  ) : (
    <AdminSignInScreen {...(reason === undefined ? {} : { reason })} />
  );
}
