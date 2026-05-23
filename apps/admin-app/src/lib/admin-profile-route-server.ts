import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminProfileInput,
  AdminProfileRouteData,
} from "./admin-profile-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/profile` admin-org operator profile surface
 * (admin-app implementation plan §11 — Phase 7 commit 7b-1).
 * Decodes the loader input at the framework boundary and runs
 * the route-data Effect on the server. No Request/Response
 * shaping lives here.
 */
export type AdminProfileRawInput = Record<string, unknown> | undefined;

const decodeRawInput = (_raw: AdminProfileRawInput): AdminProfileInput =>
  ({}) as AdminProfileInput;

const loadAdminProfileData = async (
  request: Request,
  environment: unknown,
  raw: AdminProfileRawInput,
): Promise<AdminProfileRouteData> => {
  const { loadAdminProfileRouteDataFromRequest } =
    await import("./admin-profile-route-data");
  const decoded = decodeRawInput(raw);
  void decoded;
  return Effect.runPromise(
    loadAdminProfileRouteDataFromRequest(request, environment),
  );
};

export const getAdminProfileData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminProfileRawInput) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminProfileRawInput;
    }) => loadAdminProfileData(context.request, process.env, data),
  );
