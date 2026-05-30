import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  authorizationNamespaces,
  authorizationRelations,
  type AuthorizationNamespace,
  type AuthorizationRelation,
} from "@comvestec/contracts";
import type {
  AdminGovernanceAccessV2Input,
  AdminGovernanceAccessV2RouteData,
} from "./governance-access-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the `/desk/access` Access
 * Control v2 surface (admin-app implementation plan §8.7 +
 * §11 — Phase 3 Governance & access commit 1). Mirrors the v2
 * trio shape: decodes the URL filter payload at the framework
 * edge, runs the route-data Effect on the server, and
 * surfaces the discriminated-union state. Transport shaping
 * (Request/Response, HTTP encoding) is intentionally NOT done
 * here — those live in platform HTTP adapters.
 */
export type AdminGovernanceAccessV2RawInput = {
  readonly namespace?: unknown;
  readonly object?: unknown;
  readonly relation?: unknown;
  readonly subject?: unknown;
  readonly detailSubject?: unknown;
  readonly page?: unknown;
};

const isAuthorizationNamespace = (
  value: unknown,
): value is AuthorizationNamespace =>
  typeof value === "string" &&
  (authorizationNamespaces as readonly string[]).includes(value);

const isAuthorizationRelation = (
  value: unknown,
): value is AuthorizationRelation =>
  typeof value === "string" &&
  (authorizationRelations as readonly string[]).includes(value);

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodePage = (value: unknown): number | undefined => {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  const truncated = Math.trunc(value);
  return truncated >= 1 ? truncated : undefined;
};

const decodeRawInput = (
  raw: AdminGovernanceAccessV2RawInput | undefined,
): AdminGovernanceAccessV2Input => {
  const safe = raw ?? {};
  const namespace = isAuthorizationNamespace(safe.namespace)
    ? safe.namespace
    : undefined;
  const relation = isAuthorizationRelation(safe.relation)
    ? safe.relation
    : undefined;
  const object = decodeOptionalString(safe.object);
  const subject = decodeOptionalString(safe.subject);
  const detailSubject = decodeOptionalString(safe.detailSubject);
  const page = decodePage(safe.page);
  return {
    ...(namespace === undefined ? {} : { namespace }),
    ...(object === undefined ? {} : { object }),
    ...(relation === undefined ? {} : { relation }),
    ...(subject === undefined ? {} : { subject }),
    ...(detailSubject === undefined ? {} : { detailSubject }),
    ...(page === undefined ? {} : { page }),
  };
};

const loadAdminGovernanceAccessV2Data = async (
  request: Request,
  environment: unknown,
  raw: AdminGovernanceAccessV2RawInput | undefined,
): Promise<AdminGovernanceAccessV2RouteData> => {
  const { loadAdminGovernanceAccessV2RouteDataFromRequest } =
    await import("./governance-access-route-data");

  const decoded = decodeRawInput(raw);

  return Effect.runPromise(
    loadAdminGovernanceAccessV2RouteDataFromRequest(
      request,
      environment,
      decoded,
    ),
  );
};

export const getAdminGovernanceAccessV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminGovernanceAccessV2RawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminGovernanceAccessV2RawInput | undefined;
    }) => loadAdminGovernanceAccessV2Data(context.request, process.env, data),
  );
