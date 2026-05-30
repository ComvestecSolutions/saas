import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminBillingListInput,
  AdminBillingListRouteData,
  AdminBillingListTenantTarget,
} from "./billing-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the `/desk/billing` Billing
 * Operations v2 surface (admin-app implementation plan §8.10 +
 * §11 — Phase 4 Domain operator screens commit 1). Decodes the
 * loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * here — that belongs in platform HTTP adapters.
 */
const AdminBillingListTenantTargetSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

const AdminBillingListRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    tenantTargets: Schema.optional(Schema.Unknown),
    selectedTenantId: Schema.optional(Schema.Unknown),
  }),
);

type AdminBillingListRawInput = Schema.Schema.Type<
  typeof AdminBillingListRawInputSchema
>;

const decodeAdminBillingListRawInput = decodeSyncBoundary(
  AdminBillingListRawInputSchema,
);
const decodeTenantTarget = decodeSchemaOrUndefined(
  AdminBillingListTenantTargetSchema,
);
const decodeTenantTargetEntries = decodeSchemaOrUndefined(
  Schema.Array(Schema.Unknown),
);
const decodeOptionalString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const decodeTenantTargets = (
  value: unknown,
): readonly AdminBillingListTenantTarget[] => {
  const entries = decodeTenantTargetEntries(value) ?? [];
  const decoded: AdminBillingListTenantTarget[] = [];

  for (const entry of entries) {
    const target = decodeTenantTarget(entry);

    if (target !== undefined) {
      decoded.push(target);
    }
  }

  return decoded;
};

const normalizeAdminBillingListInput = (
  raw: AdminBillingListRawInput,
): AdminBillingListInput => {
  const safe = raw ?? {};
  const tenantTargets = decodeTenantTargets(safe.tenantTargets);
  const selectedTenantId = decodeOptionalString(safe.selectedTenantId);

  return {
    tenantTargets,
    ...(selectedTenantId === undefined ? {} : { selectedTenantId }),
  };
};

const loadAdminBillingListData = async (
  request: Request,
  environment: unknown,
  input: AdminBillingListInput,
): Promise<AdminBillingListRouteData> => {
  const { loadAdminBillingListRouteDataFromRequest } =
    await import("./billing-list-route-data");

  return Effect.runPromise(
    loadAdminBillingListRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminBillingListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminBillingListInput(decodeAdminBillingListRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminBillingListInput;
    }) => loadAdminBillingListData(context.request, process.env, data),
  );
