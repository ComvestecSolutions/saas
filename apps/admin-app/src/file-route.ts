import { createFileRoute } from "@tanstack/react-router";
import type { FileRouteTypes } from "./routeTree.gen";

/**
 * TanStack Router can reuse successful same-path match data on a long-lived
 * router instance. Admin routes are request-scoped and auth-sensitive, so they
 * must always re-run their loaders instead of serving a reused match.
 */
export const createAdminAppFileRoute: typeof createFileRoute = ((
  path: string,
) => {
  const buildFileRoute = createFileRoute(path as never);

  return (options: Parameters<typeof buildFileRoute>[0]) =>
    buildFileRoute({
      ...options,
      shouldReload: true,
    });
}) as unknown as typeof createFileRoute;

export type AdminAppFileRoutePath = FileRouteTypes["to"];
