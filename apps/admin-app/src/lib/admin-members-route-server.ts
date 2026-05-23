import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { adminMemberRole, type AdminMemberRole } from "@comvestec/contracts";
import type {
  AdminMembersInput,
  AdminMembersRouteData,
} from "./admin-members-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/members` admin-org roster surface (admin-app
 * implementation plan §11 — Phase 7 commit 7b-1).
 */
export type AdminMembersRawInput = {
  readonly filter?: {
    readonly role?: unknown;
    readonly includeArchived?: unknown;
  };
};

const ROLE_LITERAL_SET = new Set<AdminMemberRole>(
  Object.values(adminMemberRole),
);

const decodeRole = (raw: unknown): AdminMemberRole | undefined => {
  if (typeof raw !== "string") {
    return undefined;
  }
  return ROLE_LITERAL_SET.has(raw as AdminMemberRole)
    ? (raw as AdminMemberRole)
    : undefined;
};

const decodeIncludeArchived = (raw: unknown): boolean | undefined =>
  typeof raw === "boolean" ? raw : undefined;

const decodeRawInput = (
  raw: AdminMembersRawInput | undefined,
): AdminMembersInput => {
  const filter = raw?.filter;
  if (filter === undefined) {
    return {};
  }
  const role = decodeRole(filter.role);
  const includeArchived = decodeIncludeArchived(filter.includeArchived);
  if (role === undefined && includeArchived === undefined) {
    return {};
  }
  return {
    filter: {
      ...(role !== undefined ? { role } : {}),
      ...(includeArchived !== undefined ? { includeArchived } : {}),
    },
  };
};

const loadAdminMembersData = async (
  request: Request,
  environment: unknown,
  raw: AdminMembersRawInput | undefined,
): Promise<AdminMembersRouteData> => {
  const { loadAdminMembersRouteDataFromRequest } =
    await import("./admin-members-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminMembersRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminMembersData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminMembersRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminMembersRawInput | undefined;
    }) => loadAdminMembersData(context.request, process.env, data),
  );
