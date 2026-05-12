import { createFileRoute } from "@tanstack/react-router";
import type { FileRouteTypes } from "./routeTree.gen";

export const createProductAppFileRoute = <TPath extends FileRouteTypes["to"]>(
  path: TPath,
) => createFileRoute(path);
