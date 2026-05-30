import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { AdminMemberRoleSchema } from "@comvestec/contracts";
import type {
  AdminMembersInput,
  AdminMembersRouteData,
} from "./admin-members-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/members` admin-org roster surface (admin-app
 * implementation plan §11 — Phase 7 commit 7b-1).
 */
const AdminMembersFilterRawSchema = Schema.Struct({
  role: Schema.optional(Schema.Unknown),
  includeArchived: Schema.optional(Schema.Unknown),
});

const AdminMembersRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    filter: Schema.optional(Schema.Unknown),
  }),
);

type AdminMembersRawInput = Schema.Schema.Type<
  typeof AdminMembersRawInputSchema
>;

const decodeAdminMembersRawInput = decodeSyncBoundary(
  AdminMembersRawInputSchema,
);
const decodeAdminMembersFilter = decodeSchemaOrUndefined(
  AdminMembersFilterRawSchema,
);
const decodeRole = decodeSchemaOrUndefined(AdminMemberRoleSchema);
const decodeIncludeArchived = decodeSchemaOrUndefined(Schema.Boolean);

const normalizeAdminMembersInput = (
  raw: AdminMembersRawInput,
): AdminMembersInput => {
  const filter = decodeAdminMembersFilter(raw?.filter);

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
  input: AdminMembersInput,
): Promise<AdminMembersRouteData> => {
  const { loadAdminMembersRouteDataFromRequest } =
    await import("./admin-members-route-data");

  return Effect.runPromise(
    loadAdminMembersRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminMembersData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminMembersInput(decodeAdminMembersRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminMembersInput;
    }) => loadAdminMembersData(context.request, process.env, data),
  );
