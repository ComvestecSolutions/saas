import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminWebhookListInput,
  AdminWebhookListRouteData,
} from "./webhook-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical `/desk/webhook`
 * Webhook Endpoints v2 surface (admin-app implementation plan
 * §8.12 + §11 — Phase 5 commit 3). Decodes the loader input at
 * the framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here — that belongs
 * in platform HTTP adapters.
 */
const AdminWebhookListRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    scope: Schema.optional(Schema.Unknown),
    scopeId: Schema.optional(Schema.Unknown),
    selectedDeliveryId: Schema.optional(Schema.Unknown),
  }),
);

type AdminWebhookListRawInput = Schema.Schema.Type<
  typeof AdminWebhookListRawInputSchema
>;

const decodeAdminWebhookListRawInput = decodeSyncBoundary(
  AdminWebhookListRawInputSchema,
);
const decodePlatformScope = decodeSchemaOrUndefined(PlatformScopeSchema);
const decodeOptionalString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const normalizeAdminWebhookListInput = (
  raw: AdminWebhookListRawInput,
): AdminWebhookListInput => {
  const safe = raw ?? {};
  const scope = decodePlatformScope(safe.scope);
  const scopeId = decodeOptionalString(safe.scopeId);
  const selectedDeliveryId = decodeOptionalString(safe.selectedDeliveryId);

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedDeliveryId === undefined ? {} : { selectedDeliveryId }),
  };
};

const loadAdminWebhookListData = async (
  request: Request,
  environment: unknown,
  input: AdminWebhookListInput,
): Promise<AdminWebhookListRouteData> => {
  const { loadAdminWebhookListRouteDataFromRequest } =
    await import("./webhook-list-route-data");

  return Effect.runPromise(
    loadAdminWebhookListRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminWebhookListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminWebhookListInput(decodeAdminWebhookListRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWebhookListInput;
    }) => loadAdminWebhookListData(context.request, process.env, data),
  );
