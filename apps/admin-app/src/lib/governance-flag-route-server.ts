import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformModuleIdSchema, platformModuleId } from "@comvestec/contracts";
import type {
  AdminGovernanceFlagV2Input,
  AdminGovernanceFlagV2RouteData,
} from "./governance-flag-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the `/desk/flag` Feature Flags
 * v2 surface (admin-app implementation plan §8.6 + §11 — Phase
 * 3 Governance & access commit 1). Mirrors the v2 trio shape:
 * decodes the URL filter payload at the framework edge, runs
 * the route-data Effect on the server, and surfaces the
 * discriminated-union state. Transport shaping
 * (Request/Response, HTTP encoding) is intentionally NOT done
 * here — those live in platform HTTP adapters.
 */
const AdminGovernanceFlagV2RawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    moduleId: Schema.optional(Schema.Unknown),
    flagKey: Schema.optional(Schema.Unknown),
  }),
);

type AdminGovernanceFlagV2RawInput = Schema.Schema.Type<
  typeof AdminGovernanceFlagV2RawInputSchema
>;

const decodeAdminGovernanceFlagV2RawInput = decodeSyncBoundary(
  AdminGovernanceFlagV2RawInputSchema,
);
const decodeModuleId = decodeSchemaOrUndefined(PlatformModuleIdSchema);
const decodeFlagKey = decodeSchemaOrUndefined(Schema.NonEmptyString);

const normalizeAdminGovernanceFlagV2Input = (
  raw: AdminGovernanceFlagV2RawInput,
): AdminGovernanceFlagV2Input => {
  const safe = raw ?? {};
  const moduleId =
    decodeModuleId(safe.moduleId) ?? platformModuleId.featureFlags;
  const flagKey = decodeFlagKey(safe.flagKey);

  return {
    moduleId,
    ...(flagKey === undefined ? {} : { flagKey }),
  };
};

const loadAdminGovernanceFlagV2Data = async (
  request: Request,
  environment: unknown,
  input: AdminGovernanceFlagV2Input,
): Promise<AdminGovernanceFlagV2RouteData> => {
  const { loadAdminGovernanceFlagV2RouteDataFromRequest } =
    await import("./governance-flag-route-data");

  return Effect.runPromise(
    loadAdminGovernanceFlagV2RouteDataFromRequest(request, environment, input),
  );
};

export const getAdminGovernanceFlagV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminGovernanceFlagV2Input(
      decodeAdminGovernanceFlagV2RawInput(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminGovernanceFlagV2Input;
    }) => loadAdminGovernanceFlagV2Data(context.request, process.env, data),
  );
