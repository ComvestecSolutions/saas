import { createFileRoute } from "@tanstack/react-router";
import type { FileRouteTypes } from "./routeTree.gen";

export const createAdminAppFileRoute: typeof createFileRoute = createFileRoute;
export type AdminAppFileRoutePath = FileRouteTypes["to"];
