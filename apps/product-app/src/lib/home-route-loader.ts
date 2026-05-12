import { redirect } from "@tanstack/react-router";
import type { ProductHomeRouteData } from "./home-route-data";

export const loadProductHomeLoaderData = async (
  loadRouteData: () => Promise<ProductHomeRouteData> = () =>
    import("./home-route-server").then(({ getProductHomeData }) =>
      getProductHomeData(),
    ),
) => {
  const routeData = await loadRouteData();

  if (routeData.kind === "stale-session") {
    throw redirect({ to: "/auth/stale-session" });
  }

  return routeData;
};
