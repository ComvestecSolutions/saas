import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminMemberDetailInput,
  AdminMemberDetailRouteData,
} from "./admin-member-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

const AdminMemberDetailInputSchema = Schema.Struct({
  memberId: Schema.NonEmptyString,
});

const loadAdminMemberDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminMemberDetailInput,
): Promise<AdminMemberDetailRouteData> => {
  const { loadAdminMemberDetailRouteDataFromRequest } =
    await import("./admin-member-detail-route-data");

  return Effect.runPromise(
    loadAdminMemberDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminMemberDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminMemberDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminMemberDetailInput;
    }) => loadAdminMemberDetailData(context.request, process.env, data),
  );
