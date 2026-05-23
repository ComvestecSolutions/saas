import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminNotifyDetailInput,
  AdminNotifyDetailRouteData,
} from "./notify-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical
 * `/r/notify/$id` Notification Center v2 detail surface
 * (admin-app implementation plan §8.16 + §11 — Phase 6 commit
 * 6c). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No
 * Request/Response shaping lives here.
 */
export type AdminNotifyDetailRawInput = {
  readonly notificationId?: unknown;
};

const requireNotificationId = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Notification detail loader requires 'notificationId'.");
  }
  return value;
};

const decodeRawInput = (
  raw: AdminNotifyDetailRawInput | undefined,
): AdminNotifyDetailInput => ({
  notificationId: requireNotificationId(raw?.notificationId),
});

const loadAdminNotifyDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminNotifyDetailRawInput | undefined,
): Promise<AdminNotifyDetailRouteData> => {
  const { loadAdminNotifyDetailRouteDataFromRequest } =
    await import("./notify-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminNotifyDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminNotifyDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminNotifyDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminNotifyDetailRawInput | undefined;
    }) => loadAdminNotifyDetailData(context.request, process.env, data),
  );
