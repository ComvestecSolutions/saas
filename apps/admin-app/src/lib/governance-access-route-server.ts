import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  AuthorizationNamespaceSchema,
  AuthorizationRelationSchema,
} from "@comvestec/contracts";
import type {
  AdminGovernanceAccessV2Input,
  AdminGovernanceAccessV2RouteData,
} from "./governance-access-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

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
const AdminGovernanceAccessV2RawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    namespace: Schema.optional(Schema.Unknown),
    object: Schema.optional(Schema.Unknown),
    relation: Schema.optional(Schema.Unknown),
    subject: Schema.optional(Schema.Unknown),
    detailSubject: Schema.optional(Schema.Unknown),
    page: Schema.optional(Schema.Unknown),
  }),
);

type AdminGovernanceAccessV2RawInput = Schema.Schema.Type<
  typeof AdminGovernanceAccessV2RawInputSchema
>;

const decodeAdminGovernanceAccessV2RawInput = decodeSyncBoundary(
  AdminGovernanceAccessV2RawInputSchema,
);
const decodeNamespace = decodeSchemaOrUndefined(AuthorizationNamespaceSchema);
const decodeRelation = decodeSchemaOrUndefined(AuthorizationRelationSchema);
const decodeOptionalString = decodeSchemaOrUndefined(Schema.NonEmptyString);
const decodeFiniteNumber = decodeSchemaOrUndefined(
  Schema.Number.pipe(Schema.finite()),
);

const decodePage = (value: unknown): number | undefined => {
  const page = decodeFiniteNumber(value);

  if (page === undefined) {
    return undefined;
  }

  const truncated = Math.trunc(page);
  return truncated >= 1 ? truncated : undefined;
};

const normalizeAdminGovernanceAccessV2Input = (
  raw: AdminGovernanceAccessV2RawInput,
): AdminGovernanceAccessV2Input => {
  const safe = raw ?? {};
  const namespace = decodeNamespace(safe.namespace);
  const relation = decodeRelation(safe.relation);
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
  input: AdminGovernanceAccessV2Input,
): Promise<AdminGovernanceAccessV2RouteData> => {
  const { loadAdminGovernanceAccessV2RouteDataFromRequest } =
    await import("./governance-access-route-data");

  return Effect.runPromise(
    loadAdminGovernanceAccessV2RouteDataFromRequest(
      request,
      environment,
      input,
    ),
  );
};

export const getAdminGovernanceAccessV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminGovernanceAccessV2Input(
      decodeAdminGovernanceAccessV2RawInput(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminGovernanceAccessV2Input;
    }) => loadAdminGovernanceAccessV2Data(context.request, process.env, data),
  );
