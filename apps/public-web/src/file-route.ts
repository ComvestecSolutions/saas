import { createFileRoute } from "@tanstack/react-router";
import type { FileRouteTypes } from "./routeTree.gen";

export const createPublicWebFileRoute = <TPath extends FileRouteTypes["to"]>(
  path: TPath,
) => createFileRoute(path);
