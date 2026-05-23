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

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/workspaces` admin-org workspace tabs surface
 * (admin-app implementation plan §11 — Phase 7 commit 7b-1).
 */
export type AdminWorkspacesRawInput = Record<string, unknown> | undefined;

const decodeRawInput = (_raw: AdminWorkspacesRawInput): AdminWorkspacesInput =>
  ({}) as AdminWorkspacesInput;

const loadAdminWorkspacesData = async (
  request: Request,
  environment: unknown,
  raw: AdminWorkspacesRawInput,
): Promise<AdminWorkspacesRouteData> => {
  const { loadAdminWorkspacesRouteDataFromRequest } =
    await import("./admin-workspaces-route-data");
  const decoded = decodeRawInput(raw);
  void decoded;
  return Effect.runPromise(
    loadAdminWorkspacesRouteDataFromRequest(request, environment),
  );
};

export const getAdminWorkspacesData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminWorkspacesRawInput) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWorkspacesRawInput;
    }) => loadAdminWorkspacesData(context.request, process.env, data),
  );
