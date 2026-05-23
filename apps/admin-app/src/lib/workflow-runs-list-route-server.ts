import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  platformModuleId,
  workflowRunStatus,
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

/**
 * Server-function entrypoint for the spec-canonical `/r/runs`
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
export type AdminWorkflowRunsListRawInput = {
  readonly moduleId?: unknown;
  readonly status?: unknown;
  readonly since?: unknown;
  readonly until?: unknown;
  readonly pageSize?: unknown;
  readonly pageToken?: unknown;
};

const knownModuleIds = new Set<string>(Object.values(platformModuleId));
const knownStatuses = new Set<string>(Object.values(workflowRunStatus));

const decodeModuleId = (value: unknown): PlatformModuleId | undefined =>
  typeof value === "string" && knownModuleIds.has(value)
    ? (value as PlatformModuleId)
    : undefined;

const decodeStatus = (value: unknown): WorkflowRunStatus | undefined =>
  typeof value === "string" && knownStatuses.has(value)
    ? (value as WorkflowRunStatus)
    : undefined;

const decodeNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

const decodePageSize = (value: unknown): number => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return Math.min(value, MAX_PAGE_SIZE);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_PAGE_SIZE);
    }
  }
  return DEFAULT_PAGE_SIZE;
};

const decodeRawInput = (
  raw: AdminWorkflowRunsListRawInput | undefined,
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
  const since = decodeNonEmptyString(safe.since);
  if (since !== undefined) {
    Object.assign(filters, { since });
  }
  const until = decodeNonEmptyString(safe.until);
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
  raw: AdminWorkflowRunsListRawInput | undefined,
): Promise<AdminWorkflowRunsListRouteData> => {
  const { loadAdminWorkflowRunsListRouteDataFromRequest } =
    await import("./workflow-runs-list-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminWorkflowRunsListRouteDataFromRequest(
      request,
      environment,
      decoded,
    ),
  );
};

export const getAdminWorkflowRunsListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminWorkflowRunsListRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWorkflowRunsListRawInput | undefined;
    }) => loadAdminWorkflowRunsListData(context.request, process.env, data),
  );
