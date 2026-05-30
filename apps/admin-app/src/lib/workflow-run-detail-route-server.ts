import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminWorkflowRunDetailInput,
  AdminWorkflowRunDetailRouteData,
} from "./workflow-run-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical `/desk/run/$id`
 * Workflow Run Detail v2 surface (admin-app implementation plan
 * §8.14 + §11 — Phase 6 commit 6b). Decodes the loader input at
 * the framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here.
 */
export type AdminWorkflowRunDetailRawInput = {
  readonly runId?: unknown;
};

const requireRunId = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Workflow run detail loader requires 'runId'.");
  }
  return value;
};

const decodeRawInput = (
  raw: AdminWorkflowRunDetailRawInput | undefined,
): AdminWorkflowRunDetailInput => ({
  runId: requireRunId(raw?.runId),
});

const loadAdminWorkflowRunDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminWorkflowRunDetailRawInput | undefined,
): Promise<AdminWorkflowRunDetailRouteData> => {
  const { loadAdminWorkflowRunDetailRouteDataFromRequest } =
    await import("./workflow-run-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminWorkflowRunDetailRouteDataFromRequest(
      request,
      environment,
      decoded,
    ),
  );
};

export const getAdminWorkflowRunDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminWorkflowRunDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWorkflowRunDetailRawInput | undefined;
    }) => loadAdminWorkflowRunDetailData(context.request, process.env, data),
  );
