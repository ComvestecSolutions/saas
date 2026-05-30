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
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

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
const AdminUniversalSearchRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    query: Schema.optional(Schema.Unknown),
    prefix: Schema.optional(Schema.Unknown),
    perFacetLimit: Schema.optional(Schema.Unknown),
  }),
);

type AdminUniversalSearchRawInput = Schema.Schema.Type<
  typeof AdminUniversalSearchRawInputSchema
>;

const decodeAdminUniversalSearchRawInput = decodeSyncBoundary(
  AdminUniversalSearchRawInputSchema,
);
const decodeQuery = decodeSchemaOrUndefined(Schema.String);
const decodePrefix = decodeSchemaOrUndefined(UniversalSearchPrefixSchema);
const decodePerFacetLimitNumber = decodeSchemaOrUndefined(
  Schema.Number.pipe(Schema.finite()),
);

const normalizePerFacetLimit = (raw: unknown): number | undefined => {
  const value = decodePerFacetLimitNumber(raw);

  if (value === undefined) {
    return undefined;
  }

  const clamped = Math.trunc(value);
  if (clamped < 1) return undefined;
  if (clamped > 50) return 50;
  return clamped;
};

const normalizeAdminUniversalSearchInput = (
  raw: AdminUniversalSearchRawInput,
): AdminUniversalSearchInput => {
  const safe = raw ?? {};
  const prefix = decodePrefix(safe.prefix);
  const perFacetLimit = normalizePerFacetLimit(safe.perFacetLimit);
  return {
    query: decodeQuery(safe.query) ?? "",
    ...(prefix === undefined ? {} : { prefixFilter: prefix }),
    ...(perFacetLimit === undefined ? {} : { perFacetLimit }),
  };
};

const loadAdminUniversalSearchData = async (
  request: Request,
  environment: unknown,
  input: AdminUniversalSearchInput,
): Promise<AdminUniversalSearchRouteData> => {
  const { loadAdminUniversalSearchRouteDataFromRequest } =
    await import("./universal-search-route-data");

  return Effect.runPromise(
    loadAdminUniversalSearchRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminUniversalSearchData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminUniversalSearchInput(
      decodeAdminUniversalSearchRawInput(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminUniversalSearchInput;
    }) => loadAdminUniversalSearchData(context.request, process.env, data),
  );
