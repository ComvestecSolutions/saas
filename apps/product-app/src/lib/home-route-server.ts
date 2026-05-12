import { Effect } from "effect";
import { loadProductHomeRouteDataFromRequest } from "./home-route-data";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

type ProductRequestContext = {
  readonly request: Request;
};

type LoadProductHomeRouteData = typeof loadProductHomeRouteDataFromRequest;

const createProductRequestMiddleware = (
  serverRuntime: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  serverRuntime
    .createMiddleware()
    .server(async ({ next, request }) => next({ context: { request } }));

export const productRequestMiddleware = createProductRequestMiddleware();

export const createGetProductHomeData = (
  loadProductHomeRouteData: LoadProductHomeRouteData = loadProductHomeRouteDataFromRequest,
  environment: unknown = process.env,
  serverRuntime: TanstackStartServerRuntime = tanstackStartServerRuntime,
) => {
  const getProductHomeDataServerFn = serverRuntime.createServerFn({
    method: "GET",
  });

  return getProductHomeDataServerFn
    .middleware([createProductRequestMiddleware(serverRuntime)])
    .handler(({ context }: { readonly context: ProductRequestContext }) =>
      Effect.runPromise(loadProductHomeRouteData(context.request, environment)),
    );
};

export const getProductHomeData = createGetProductHomeData();
