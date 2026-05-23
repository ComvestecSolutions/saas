import { Effect } from "effect";
import {
  buildAdminAuthReturnTo,
  buildAdminSignInPath,
  buildAdminStaleSessionPath,
  isAdminAuthRoutePath,
} from "../auth/paths";
import type { AdminShellRouteData } from "./admin-shell-route-data";
import { resolveCurrentSsrRequestContextRequest } from "./ssr-request-context";

type AdminShellLoaderLocation = {
  readonly pathname: string;
  readonly searchStr: string;
};

export const buildAdminShellRedirectPath = (
  location: Readonly<AdminShellLoaderLocation>,
  routeData: Extract<
    AdminShellRouteData,
    { readonly kind: "shell" | "stale-session" }
  >,
) => {
  const returnTo = buildAdminAuthReturnTo(location);

  return routeData.kind === "stale-session"
    ? buildAdminStaleSessionPath({ returnTo })
    : buildAdminSignInPath({ returnTo });
};

const anonymousAdminShellRouteData = {
  kind: "shell",
} as const satisfies AdminShellRouteData;

type LoadAdminShellRouteDataFromCurrentRequest = (
  request: Request,
) => Promise<AdminShellRouteData>;

type GetCurrentServerRequest = () => Request | undefined;

type LoadAdminShellClientRouteData = () => Promise<AdminShellRouteData>;

export const loadAdminShellRouteDataForCurrentRuntime = async (
  options: {
    readonly isBrowserRuntime?: boolean;
    readonly getCurrentServerRequest?: GetCurrentServerRequest;
    readonly loadServerRouteDataFromRequest?: LoadAdminShellRouteDataFromCurrentRequest;
    readonly loadClientRouteData?: LoadAdminShellClientRouteData;
  } = {},
) => {
  const {
    isBrowserRuntime = typeof window !== "undefined",
    getCurrentServerRequest = () => resolveCurrentSsrRequestContextRequest(),
    loadServerRouteDataFromRequest = async (request) => {
      const { loadAdminShellRouteDataFromRequest } =
        await import("./admin-shell-route-data");

      return Effect.runPromise(
        loadAdminShellRouteDataFromRequest(request, process.env),
      );
    },
    loadClientRouteData = () =>
      import("./admin-shell-route-server").then(
        ({ getAdminShellData }) =>
          getAdminShellData({
            data: undefined,
          }) as Promise<AdminShellRouteData>,
      ),
  } = options;

  if (isBrowserRuntime) {
    return loadClientRouteData();
  }

  const currentServerRequest = getCurrentServerRequest();

  return currentServerRequest === undefined
    ? loadClientRouteData()
    : loadServerRouteDataFromRequest(currentServerRequest);
};

export const loadAdminShellLoaderData = async (
  location: Readonly<AdminShellLoaderLocation>,
  loadRouteData: () => Promise<AdminShellRouteData> = () =>
    loadAdminShellRouteDataForCurrentRuntime(),
) => {
  if (isAdminAuthRoutePath(location.pathname)) {
    return anonymousAdminShellRouteData;
  }

  const routeData = await loadRouteData();

  return routeData;
};
