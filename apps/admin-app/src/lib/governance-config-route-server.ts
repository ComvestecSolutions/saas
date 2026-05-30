import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformModuleIdSchema, platformModuleId } from "@comvestec/contracts";
import type {
  AdminGovernanceConfigV2Input,
  AdminGovernanceConfigV2RouteData,
} from "./governance-config-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the `/desk/config` Runtime
 * Config v2 surface (admin-app implementation plan §8.5 + §11
 * — Phase 3 Governance & access commit 1). Mirrors the v2
 * trio shape: decodes the URL filter payload at the framework
 * edge, runs the route-data Effect on the server, and
 * surfaces the discriminated-union state. Transport shaping
 * (Request/Response, HTTP encoding) is intentionally NOT done
 * here — those live in platform HTTP adapters.
 */
const AdminGovernanceConfigV2RawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    moduleId: Schema.optional(Schema.Unknown),
    key: Schema.optional(Schema.Unknown),
  }),
);

type AdminGovernanceConfigV2RawInput = Schema.Schema.Type<
  typeof AdminGovernanceConfigV2RawInputSchema
>;

const decodeAdminGovernanceConfigV2RawInput = decodeSyncBoundary(
  AdminGovernanceConfigV2RawInputSchema,
);
const decodeModuleId = decodeSchemaOrUndefined(PlatformModuleIdSchema);
const decodeKey = decodeSchemaOrUndefined(Schema.NonEmptyString);

const normalizeAdminGovernanceConfigV2Input = (
  raw: AdminGovernanceConfigV2RawInput,
): AdminGovernanceConfigV2Input => {
  const safe = raw ?? {};
  const moduleId =
    decodeModuleId(safe.moduleId) ?? platformModuleId.runtimeConfig;
  const key = decodeKey(safe.key);

  return {
    moduleId,
    ...(key === undefined ? {} : { key }),
  };
};

const loadAdminGovernanceConfigV2Data = async (
  request: Request,
  environment: unknown,
  input: AdminGovernanceConfigV2Input,
): Promise<AdminGovernanceConfigV2RouteData> => {
  const { loadAdminGovernanceConfigV2RouteDataFromRequest } =
    await import("./governance-config-route-data");

  return Effect.runPromise(
    loadAdminGovernanceConfigV2RouteDataFromRequest(
      request,
      environment,
      input,
    ),
  );
};

export const getAdminGovernanceConfigV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminGovernanceConfigV2Input(
      decodeAdminGovernanceConfigV2RawInput(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminGovernanceConfigV2Input;
    }) => loadAdminGovernanceConfigV2Data(context.request, process.env, data),
  );
