import { Effect } from "effect";
import {
  buildAdminAuthReturnTo,
  buildAdminSignInPath,
  buildAdminStaleSessionPath,
  isAdminAuthRoutePath,
} from "../auth/paths";
import type { AdminShellRouteData } from "./admin-shell-route-data";
import { getAdminShellData } from "./admin-shell-route-server";
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

type LoadAdminShellClientRouteData = (
  signal?: AbortSignal,
) => Promise<AdminShellRouteData>;

export const loadAdminShellRouteDataForCurrentRuntime = async (
  options: {
    readonly isBrowserRuntime?: boolean;
    readonly getCurrentServerRequest?: GetCurrentServerRequest;
    readonly loadServerRouteDataFromRequest?: LoadAdminShellRouteDataFromCurrentRequest;
    readonly loadClientRouteData?: LoadAdminShellClientRouteData;
    readonly signal?: AbortSignal;
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
    loadClientRouteData = (signal) =>
      getAdminShellData({
        data: undefined,
        ...(signal !== undefined && { signal }),
      }) as Promise<AdminShellRouteData>,
    signal,
  } = options;

  if (isBrowserRuntime) {
    return loadClientRouteData(signal);
  }

  const currentServerRequest = getCurrentServerRequest();

  if (currentServerRequest === undefined) {
    return loadClientRouteData();
  }

  const serverRouteData =
    await loadServerRouteDataFromRequest(currentServerRequest);

  return serverRouteData.kind === "shell"
    ? loadClientRouteData()
    : serverRouteData;
};

export const loadAdminShellLoaderData = async (
  location: Readonly<AdminShellLoaderLocation>,
  loadRouteData?: () => Promise<AdminShellRouteData>,
  signal?: AbortSignal,
) => {
  if (isAdminAuthRoutePath(location.pathname)) {
    return anonymousAdminShellRouteData;
  }

  const routeData = await (
    loadRouteData ??
    (() =>
      loadAdminShellRouteDataForCurrentRuntime(
        signal !== undefined ? { signal } : {},
      ))
  )();

  return routeData;
};
