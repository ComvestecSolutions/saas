import { Effect } from "effect";
import type {
  RequestContext,
  WorkflowRunsListFilters,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the workflow-runs admin envelope
 * platform service (admin-app implementation plan §9 item 15).
 *
 * Mirrors `run-as-banner-state-actions.ts`,
 * `capability-snapshot-v2-actions.ts`, and
 * `openpanel-events-read-actions.ts` EXACTLY: helpers stay free
 * of any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through the single `loadRuntimeModuleOrDie` seam so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadWorkflowRunsAdminRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/workflow-runs-admin-service"),
  );

export const listWorkflowRunsAdminFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly filters: WorkflowRunsListFilters;
    readonly pageSize: number;
    readonly pageToken?: string;
  },
) =>
  loadWorkflowRunsAdminRuntime().pipe(
    Effect.flatMap(({ runWorkflowRunsAdminFromEnvironment: run }) =>
      run(environment, (service) => service.listRuns(input)),
    ),
  );

export const getWorkflowRunsAdminDetailFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly runId: string;
  },
) =>
  loadWorkflowRunsAdminRuntime().pipe(
    Effect.flatMap(({ runWorkflowRunsAdminFromEnvironment: run }) =>
      run(environment, (service) => service.getRunDetail(input)),
    ),
  );

export const replayWorkflowRunFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly runId: string;
    readonly reason: string;
    readonly reasonAttachmentText?: string;
  },
) =>
  loadWorkflowRunsAdminRuntime().pipe(
    Effect.flatMap(({ runWorkflowRunsAdminFromEnvironment: run }) =>
      run(environment, (service) => service.replayRun(input)),
    ),
  );

export const cancelWorkflowRunFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly runId: string;
    readonly reason: string;
    readonly reasonAttachmentText?: string;
  },
) =>
  loadWorkflowRunsAdminRuntime().pipe(
    Effect.flatMap(({ runWorkflowRunsAdminFromEnvironment: run }) =>
      run(environment, (service) => service.cancelRun(input)),
    ),
  );
