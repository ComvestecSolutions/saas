import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminMemberDetailInput,
  AdminMemberDetailRouteData,
} from "./admin-member-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

export type AdminMemberDetailRawInput = {
  readonly memberId?: unknown;
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Admin member detail loader requires '${label}'.`);
  }

  return value;
};

const decodeRawInput = (
  raw: AdminMemberDetailRawInput | undefined,
): AdminMemberDetailInput => ({
  memberId: requireString(raw?.memberId, "memberId"),
});

const loadAdminMemberDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminMemberDetailRawInput | undefined,
): Promise<AdminMemberDetailRouteData> => {
  const { loadAdminMemberDetailRouteDataFromRequest } =
    await import("./admin-member-detail-route-data");
  const decoded = decodeRawInput(raw);

  return Effect.runPromise(
    loadAdminMemberDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminMemberDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminMemberDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminMemberDetailRawInput | undefined;
    }) => loadAdminMemberDetailData(context.request, process.env, data),
  );
