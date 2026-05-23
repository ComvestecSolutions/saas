import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  platformModuleId,
  platformModuleIds,
  type PlatformModuleId,
} from "@comvestec/contracts";
import type {
  AdminGovernanceFlagV2Input,
  AdminGovernanceFlagV2RouteData,
} from "./governance-flag-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the `/r/flag` Feature Flags
 * v2 surface (admin-app implementation plan §8.6 + §11 — Phase
 * 3 Governance & access commit 1). Mirrors the v2 trio shape:
 * decodes the URL filter payload at the framework edge, runs
 * the route-data Effect on the server, and surfaces the
 * discriminated-union state. Transport shaping
 * (Request/Response, HTTP encoding) is intentionally NOT done
 * here — those live in platform HTTP adapters.
 */
export type AdminGovernanceFlagV2RawInput = {
  readonly moduleId?: unknown;
  readonly flagKey?: unknown;
};

const isKnownPlatformModuleId = (value: unknown): value is PlatformModuleId =>
  typeof value === "string" &&
  (platformModuleIds as readonly string[]).includes(value);

const decodeRawInput = (
  raw: AdminGovernanceFlagV2RawInput | undefined,
): AdminGovernanceFlagV2Input => {
  const safe = raw ?? {};
  const moduleId = isKnownPlatformModuleId(safe.moduleId)
    ? safe.moduleId
    : platformModuleId.featureFlags;
  const flagKey =
    typeof safe.flagKey === "string" && safe.flagKey.length > 0
      ? safe.flagKey
      : undefined;
  return {
    moduleId,
    ...(flagKey === undefined ? {} : { flagKey }),
  };
};

const loadAdminGovernanceFlagV2Data = async (
  request: Request,
  environment: unknown,
  raw: AdminGovernanceFlagV2RawInput | undefined,
): Promise<AdminGovernanceFlagV2RouteData> => {
  const { loadAdminGovernanceFlagV2RouteDataFromRequest } =
    await import("./governance-flag-route-data");

  const decoded = decodeRawInput(raw);

  return Effect.runPromise(
    loadAdminGovernanceFlagV2RouteDataFromRequest(
      request,
      environment,
      decoded,
    ),
  );
};

export const getAdminGovernanceFlagV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminGovernanceFlagV2RawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminGovernanceFlagV2RawInput | undefined;
    }) => loadAdminGovernanceFlagV2Data(context.request, process.env, data),
  );
