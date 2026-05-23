import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  adminOperatorTestTokenListStatusFilter,
  adminOperatorTestTokenListStatusFilters,
  type AdminOperatorTestTokenListStatusFilter,
} from "@comvestec/contracts";
import type {
  AdminTokensInput,
  AdminTokensRouteData,
} from "./admin-tokens-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/tokens` admin-operator-test-tokens roster surface
 * (admin-app implementation plan §11 — Phase 7 commit
 * 7b-2-tokens). Decodes the loader input at the framework
 * boundary and runs the route-data Effect on the server.
 * No Request/Response shaping lives here.
 */
export type AdminTokensRawInput =
  | {
      readonly filter?: { readonly status?: unknown };
      readonly pageSize?: unknown;
      readonly pageToken?: unknown;
    }
  | undefined;

void adminOperatorTestTokenListStatusFilter;

const STATUS_LITERAL_SET = new Set<AdminOperatorTestTokenListStatusFilter>(
  adminOperatorTestTokenListStatusFilters,
);

const decodeStatus = (
  raw: unknown,
): AdminOperatorTestTokenListStatusFilter | undefined => {
  if (typeof raw !== "string") return undefined;
  return STATUS_LITERAL_SET.has(raw as AdminOperatorTestTokenListStatusFilter)
    ? (raw as AdminOperatorTestTokenListStatusFilter)
    : undefined;
};

const decodePageSize = (raw: unknown): number | undefined => {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return undefined;
  if (raw < 1 || raw > 200) return undefined;
  return raw;
};

const decodePageToken = (raw: unknown): string | undefined =>
  typeof raw === "string" && raw.length > 0 ? raw : undefined;

const decodeRawInput = (raw: AdminTokensRawInput): AdminTokensInput => {
  if (raw === undefined) return {};
  const status = decodeStatus(raw.filter?.status);
  const pageSize = decodePageSize(raw.pageSize);
  const pageToken = decodePageToken(raw.pageToken);
  return {
    ...(status === undefined ? {} : { filter: { status } }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const loadAdminTokensData = async (
  request: Request,
  environment: unknown,
  raw: AdminTokensRawInput,
): Promise<AdminTokensRouteData> => {
  const { loadAdminTokensRouteDataFromRequest } =
    await import("./admin-tokens-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminTokensRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminTokensData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminTokensRawInput) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminTokensRawInput;
    }) => loadAdminTokensData(context.request, process.env, data),
  );
