import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  platformModuleId,
  platformModuleIds,
  type PlatformModuleId,
} from "@comvestec/contracts";
import type {
  AdminGovernanceConfigV2Input,
  AdminGovernanceConfigV2RouteData,
} from "./governance-config-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

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
export type AdminGovernanceConfigV2RawInput = {
  readonly moduleId?: unknown;
  readonly key?: unknown;
};

const isKnownPlatformModuleId = (value: unknown): value is PlatformModuleId =>
  typeof value === "string" &&
  (platformModuleIds as readonly string[]).includes(value);

const decodeRawInput = (
  raw: AdminGovernanceConfigV2RawInput | undefined,
): AdminGovernanceConfigV2Input => {
  const safe = raw ?? {};
  const moduleId = isKnownPlatformModuleId(safe.moduleId)
    ? safe.moduleId
    : platformModuleId.runtimeConfig;
  const key =
    typeof safe.key === "string" && safe.key.length > 0 ? safe.key : undefined;
  return {
    moduleId,
    ...(key === undefined ? {} : { key }),
  };
};

const loadAdminGovernanceConfigV2Data = async (
  request: Request,
  environment: unknown,
  raw: AdminGovernanceConfigV2RawInput | undefined,
): Promise<AdminGovernanceConfigV2RouteData> => {
  const { loadAdminGovernanceConfigV2RouteDataFromRequest } =
    await import("./governance-config-route-data");

  const decoded = decodeRawInput(raw);

  return Effect.runPromise(
    loadAdminGovernanceConfigV2RouteDataFromRequest(
      request,
      environment,
      decoded,
    ),
  );
};

export const getAdminGovernanceConfigV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminGovernanceConfigV2RawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminGovernanceConfigV2RawInput | undefined;
    }) => loadAdminGovernanceConfigV2Data(context.request, process.env, data),
  );
