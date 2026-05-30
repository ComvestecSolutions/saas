import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { AdminOperatorTestTokenListStatusFilterSchema } from "@comvestec/contracts";
import type {
  AdminTokensInput,
  AdminTokensRouteData,
} from "./admin-tokens-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/tokens` admin-operator-test-tokens roster surface
 * (admin-app implementation plan §11 — Phase 7 commit
 * 7b-2-tokens). Decodes the loader input at the framework
 * boundary and runs the route-data Effect on the server.
 * No Request/Response shaping lives here.
 */
const AdminTokensFilterRawSchema = Schema.Struct({
  status: Schema.optional(Schema.Unknown),
});

const AdminTokensRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    filter: Schema.optional(Schema.Unknown),
    pageSize: Schema.optional(Schema.Unknown),
    pageToken: Schema.optional(Schema.Unknown),
  }),
);

type AdminTokensRawInput = Schema.Schema.Type<typeof AdminTokensRawInputSchema>;

const decodeAdminTokensRawInput = decodeSyncBoundary(AdminTokensRawInputSchema);
const decodeAdminTokensFilter = decodeSchemaOrUndefined(
  AdminTokensFilterRawSchema,
);
const decodeStatus = decodeSchemaOrUndefined(
  AdminOperatorTestTokenListStatusFilterSchema,
);
const decodePageSize = decodeSchemaOrUndefined(
  Schema.Int.pipe(
    Schema.greaterThanOrEqualTo(1),
    Schema.lessThanOrEqualTo(200),
  ),
);
const decodePageToken = decodeSchemaOrUndefined(Schema.NonEmptyString);

const normalizeAdminTokensInput = (
  raw: AdminTokensRawInput,
): AdminTokensInput => {
  if (raw === undefined) return {};

  const filter = decodeAdminTokensFilter(raw.filter);
  const status = decodeStatus(filter?.status);
  const pageSize = decodePageSize(raw.pageSize);
  const pageToken = decodePageToken(raw.pageToken);

  return {
    ...(status === undefined ? {} : { filter: { status } }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const loadAdminTokensData = async (
  request: Request,
  environment: unknown,
  input: AdminTokensInput,
): Promise<AdminTokensRouteData> => {
  const { loadAdminTokensRouteDataFromRequest } =
    await import("./admin-tokens-route-data");

  return Effect.runPromise(
    loadAdminTokensRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminTokensData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminTokensInput(decodeAdminTokensRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminTokensInput;
    }) => loadAdminTokensData(context.request, process.env, data),
  );
