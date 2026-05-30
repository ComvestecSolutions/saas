import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  IsoTimestampSchema,
  PlatformModuleIdSchema,
  WorkflowRunStatusSchema,
  type PlatformModuleId,
  type WorkflowRunsListFilters,
  type WorkflowRunStatus,
} from "@comvestec/contracts";
import type {
  AdminWorkflowRunsListInput,
  AdminWorkflowRunsListRouteData,
} from "./workflow-runs-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical `/desk/runs`
 * Workflow Runs v2 list surface (admin-app implementation plan
 * §8.14 + §11 — Phase 6 commit 6b). Decodes the loader input at
 * the framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here.
 *
 * URL filters are narrowed through the canonical
 * `platformModuleId.*` + `workflowRunStatus.*` vocabularies so
 * no raw literal leaks past the loader boundary; bad values
 * are dropped to undefined rather than thrown so the page
 * renders an unfiltered list.
 */
const AdminWorkflowRunsListRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    moduleId: Schema.optional(Schema.Unknown),
    status: Schema.optional(Schema.Unknown),
    since: Schema.optional(Schema.Unknown),
    until: Schema.optional(Schema.Unknown),
    pageSize: Schema.optional(Schema.Unknown),
    pageToken: Schema.optional(Schema.Unknown),
  }),
);

type AdminWorkflowRunsListRawInput = Schema.Schema.Type<
  typeof AdminWorkflowRunsListRawInputSchema
>;

const decodeAdminWorkflowRunsListRawInput = decodeSyncBoundary(
  AdminWorkflowRunsListRawInputSchema,
);
const decodeModuleId = decodeSchemaOrUndefined(PlatformModuleIdSchema);
const decodeStatus = decodeSchemaOrUndefined(WorkflowRunStatusSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);
const decodeIsoTimestamp = decodeSchemaOrUndefined(IsoTimestampSchema);
const decodePositiveInt = decodeSchemaOrUndefined(
  Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

const decodePageSize = (value: unknown): number => {
  const numericPageSize = decodePositiveInt(value);

  if (numericPageSize !== undefined) {
    return Math.min(numericPageSize, MAX_PAGE_SIZE);
  }

  const stringPageSize = decodeNonEmptyString(value);

  if (stringPageSize !== undefined) {
    const parsed = Number.parseInt(stringPageSize, 10);

    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_PAGE_SIZE);
    }
  }

  return DEFAULT_PAGE_SIZE;
};

const normalizeAdminWorkflowRunsListInput = (
  raw: AdminWorkflowRunsListRawInput,
): AdminWorkflowRunsListInput => {
  const safe = raw ?? {};
  const filters: WorkflowRunsListFilters = {};
  const moduleId = decodeModuleId(safe.moduleId);
  if (moduleId !== undefined) {
    Object.assign(filters, { moduleId });
  }
  const status = decodeStatus(safe.status);
  if (status !== undefined) {
    Object.assign(filters, { status });
  }
  const since = decodeIsoTimestamp(safe.since);
  if (since !== undefined) {
    Object.assign(filters, { since });
  }
  const until = decodeIsoTimestamp(safe.until);
  if (until !== undefined) {
    Object.assign(filters, { until });
  }
  const pageToken = decodeNonEmptyString(safe.pageToken);
  return {
    filters,
    pageSize: decodePageSize(safe.pageSize),
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const loadAdminWorkflowRunsListData = async (
  request: Request,
  environment: unknown,
  input: AdminWorkflowRunsListInput,
): Promise<AdminWorkflowRunsListRouteData> => {
  const { loadAdminWorkflowRunsListRouteDataFromRequest } =
    await import("./workflow-runs-list-route-data");

  return Effect.runPromise(
    loadAdminWorkflowRunsListRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminWorkflowRunsListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminWorkflowRunsListInput(
      decodeAdminWorkflowRunsListRawInput(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWorkflowRunsListInput;
    }) => loadAdminWorkflowRunsListData(context.request, process.env, data),
  );
