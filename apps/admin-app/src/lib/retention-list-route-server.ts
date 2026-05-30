import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminRetentionListInput,
  AdminRetentionListRouteData,
} from "./retention-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical
 * `/desk/retention` Retention & Legal-hold v2 surface (admin-app
 * implementation plan §8.11 + §11 — Phase 5 commit 2). Decodes
 * the loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * lives here — that belongs in platform HTTP adapters.
 */
const AdminRetentionListRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    scope: Schema.optional(Schema.Unknown),
    scopeId: Schema.optional(Schema.Unknown),
    selectedHoldId: Schema.optional(Schema.Unknown),
  }),
);

type AdminRetentionListRawInput = Schema.Schema.Type<
  typeof AdminRetentionListRawInputSchema
>;

const decodeAdminRetentionListRawInput = decodeSyncBoundary(
  AdminRetentionListRawInputSchema,
);
const decodePlatformScope = decodeSchemaOrUndefined(PlatformScopeSchema);
const decodeOptionalString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const normalizeAdminRetentionListInput = (
  raw: AdminRetentionListRawInput,
): AdminRetentionListInput => {
  const safe = raw ?? {};
  const scope = decodePlatformScope(safe.scope);
  const scopeId = decodeOptionalString(safe.scopeId);
  const selectedHoldId = decodeOptionalString(safe.selectedHoldId);
  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedHoldId === undefined ? {} : { selectedHoldId }),
  };
};

const loadAdminRetentionListData = async (
  request: Request,
  environment: unknown,
  input: AdminRetentionListInput,
): Promise<AdminRetentionListRouteData> => {
  const { loadAdminRetentionListRouteDataFromRequest } =
    await import("./retention-list-route-data");

  return Effect.runPromise(
    loadAdminRetentionListRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminRetentionListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminRetentionListInput(decodeAdminRetentionListRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminRetentionListInput;
    }) => loadAdminRetentionListData(context.request, process.env, data),
  );
