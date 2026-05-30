import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminWorkflowRunDetailInput,
  AdminWorkflowRunDetailRouteData,
} from "./workflow-run-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical `/desk/run/$id`
 * Workflow Run Detail v2 surface (admin-app implementation plan
 * §8.14 + §11 — Phase 6 commit 6b). Decodes the loader input at
 * the framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here.
 */
const AdminWorkflowRunDetailInputSchema = Schema.Struct({
  runId: Schema.NonEmptyString,
});

const loadAdminWorkflowRunDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminWorkflowRunDetailInput,
): Promise<AdminWorkflowRunDetailRouteData> => {
  const { loadAdminWorkflowRunDetailRouteDataFromRequest } =
    await import("./workflow-run-detail-route-data");
  return Effect.runPromise(
    loadAdminWorkflowRunDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminWorkflowRunDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminWorkflowRunDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWorkflowRunDetailInput;
    }) => loadAdminWorkflowRunDetailData(context.request, process.env, data),
  );
