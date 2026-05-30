import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminBrandingListInput,
  AdminBrandingListRouteData,
  AdminBrandingListTenantTarget,
} from "./branding-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the `/desk/branding` Branding &
 * Domains v2 surface (admin-app implementation plan §8.10 + §11
 * — Phase 4 Domain operator screens commit 2). Decodes the
 * loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * lives here — that belongs in platform HTTP adapters.
 */
const AdminBrandingListTenantTargetSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

const AdminBrandingListRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    tenantTargets: Schema.optional(Schema.Unknown),
    selectedTenantId: Schema.optional(Schema.Unknown),
  }),
);

type AdminBrandingListRawInput = Schema.Schema.Type<
  typeof AdminBrandingListRawInputSchema
>;

const decodeAdminBrandingListRawInput = decodeSyncBoundary(
  AdminBrandingListRawInputSchema,
);
const decodeTenantTarget = decodeSchemaOrUndefined(
  AdminBrandingListTenantTargetSchema,
);
const decodeTenantTargetEntries = decodeSchemaOrUndefined(
  Schema.Array(Schema.Unknown),
);
const decodeOptionalString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const decodeTenantTargets = (
  value: unknown,
): readonly AdminBrandingListTenantTarget[] => {
  const entries = decodeTenantTargetEntries(value) ?? [];
  const decoded: AdminBrandingListTenantTarget[] = [];

  for (const entry of entries) {
    const target = decodeTenantTarget(entry);

    if (target !== undefined) {
      decoded.push(target);
    }
  }

  return decoded;
};

const normalizeAdminBrandingListInput = (
  raw: AdminBrandingListRawInput,
): AdminBrandingListInput => {
  const safe = raw ?? {};
  const tenantTargets = decodeTenantTargets(safe.tenantTargets);
  const selectedTenantId = decodeOptionalString(safe.selectedTenantId);

  return {
    tenantTargets,
    ...(selectedTenantId === undefined ? {} : { selectedTenantId }),
  };
};

const loadAdminBrandingListData = async (
  request: Request,
  environment: unknown,
  input: AdminBrandingListInput,
): Promise<AdminBrandingListRouteData> => {
  const { loadAdminBrandingListRouteDataFromRequest } =
    await import("./branding-list-route-data");

  return Effect.runPromise(
    loadAdminBrandingListRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminBrandingListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminBrandingListInput(decodeAdminBrandingListRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminBrandingListInput;
    }) => loadAdminBrandingListData(context.request, process.env, data),
  );
