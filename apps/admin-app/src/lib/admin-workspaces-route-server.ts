import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminWorkspacesInput,
  AdminWorkspacesRouteData,
} from "./admin-workspaces-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeEmptyInput } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/workspaces` admin-org workspace tabs surface
 * (admin-app implementation plan §11 — Phase 7 commit 7b-1).
 */
export type AdminWorkspacesRawInput = Record<string, unknown> | undefined;

const loadAdminWorkspacesData = async (
  request: Request,
  environment: unknown,
  _input: AdminWorkspacesInput,
): Promise<AdminWorkspacesRouteData> => {
  const { loadAdminWorkspacesRouteDataFromRequest } =
    await import("./admin-workspaces-route-data");
  return Effect.runPromise(
    loadAdminWorkspacesRouteDataFromRequest(request, environment),
  );
};

export const getAdminWorkspacesData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeEmptyInput)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWorkspacesInput;
    }) => loadAdminWorkspacesData(context.request, process.env, data),
  );
