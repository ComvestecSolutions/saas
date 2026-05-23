import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { UniversalSearchPrefixSchema } from "@comvestec/contracts";
import type {
  AdminUniversalSearchInput,
  AdminUniversalSearchRouteData,
} from "./universal-search-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the universal omnibar
 * (admin-app implementation plan §9 — Phase 2 Desk Core
 * commit 7, item 11). Mirrors the existing v2 trio shape:
 * runs the route-data Effect on the server, decodes the raw
 * omnibar payload at the framework boundary, and surfaces the
 * `shell | stale-session | denied | error | ready`
 * discriminated union.
 *
 * Transport shaping (Request / Response, header parsing, JSON
 * encoding) is intentionally NOT done here — that responsibility
 * stays with `packages/platform/src/services/communication/`
 * HTTP adapters. The route-server only owns server-fn boundary
 * decoding and the Effect.runPromise seam.
 */
export type AdminUniversalSearchRawInput = {
  readonly query?: unknown;
  readonly prefix?: unknown;
  readonly perFacetLimit?: unknown;
};

const decodePrefix = Schema.decodeUnknownOption(UniversalSearchPrefixSchema);

const normalizeQuery = (raw: unknown): string =>
  typeof raw === "string" ? raw : "";

const normalizePerFacetLimit = (raw: unknown): number | undefined => {
  if (typeof raw !== "number") return undefined;
  if (!Number.isFinite(raw)) return undefined;
  const clamped = Math.trunc(raw);
  if (clamped < 1) return undefined;
  if (clamped > 50) return 50;
  return clamped;
};

const decodeRawInput = (
  raw: AdminUniversalSearchRawInput | undefined,
): AdminUniversalSearchInput => {
  const safe = raw ?? {};
  const prefix = decodePrefix(safe.prefix);
  const perFacetLimit = normalizePerFacetLimit(safe.perFacetLimit);
  return {
    query: normalizeQuery(safe.query),
    ...(prefix._tag === "Some" ? { prefixFilter: prefix.value } : {}),
    ...(perFacetLimit === undefined ? {} : { perFacetLimit }),
  };
};

const loadAdminUniversalSearchData = async (
  request: Request,
  environment: unknown,
  raw: AdminUniversalSearchRawInput | undefined,
): Promise<AdminUniversalSearchRouteData> => {
  const { loadAdminUniversalSearchRouteDataFromRequest } =
    await import("./universal-search-route-data");

  const decoded = decodeRawInput(raw);

  return Effect.runPromise(
    loadAdminUniversalSearchRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminUniversalSearchData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminUniversalSearchRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminUniversalSearchRawInput | undefined;
    }) => loadAdminUniversalSearchData(context.request, process.env, data),
  );
