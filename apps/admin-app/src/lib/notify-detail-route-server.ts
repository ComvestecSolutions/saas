import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminNotifyDetailInput,
  AdminNotifyDetailRouteData,
} from "./notify-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical
 * `/desk/notify/$id` Notification Center v2 detail surface
 * (admin-app implementation plan §8.16 + §11 — Phase 6 commit
 * 6c). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No
 * Request/Response shaping lives here.
 */
const AdminNotifyDetailInputSchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
});

const loadAdminNotifyDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminNotifyDetailInput,
): Promise<AdminNotifyDetailRouteData> => {
  const { loadAdminNotifyDetailRouteDataFromRequest } =
    await import("./notify-detail-route-data");
  return Effect.runPromise(
    loadAdminNotifyDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminNotifyDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminNotifyDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminNotifyDetailInput;
    }) => loadAdminNotifyDetailData(context.request, process.env, data),
  );
