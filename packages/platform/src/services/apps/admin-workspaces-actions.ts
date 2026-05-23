import { Effect } from "effect";
import type { AdminWorkspace } from "@comvestec/contracts";
import type {
  CreateWorkspaceInput,
  DeleteWorkspaceInput,
  GetWorkspaceInput,
  ListWorkspacesInput,
  ReorderWorkspacesInput,
  UpdateWorkspaceInput,
} from "../access/admin-workspaces-service";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the admin-workspaces platform service.
 *
 * Mirrors the `admin-saved-views-actions.ts` pattern: helpers stay
 * free of any `Request`/`Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through `loadRuntimeModuleOrDie` so the import graph remains safe
 * to evaluate at app root scope.
 */
const loadAdminWorkspacesRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../access/admin-workspaces-service"));

export const listWorkspacesFromEnvironment = (
  environment: unknown,
  input: ListWorkspacesInput,
) =>
  loadAdminWorkspacesRuntime().pipe(
    Effect.flatMap(({ runAdminWorkspacesFromEnvironment }) =>
      runAdminWorkspacesFromEnvironment(environment, (service) =>
        service.list(input),
      ),
    ),
  );

/**
 * Canonical alias of `listWorkspacesFromEnvironment` for admin-app
 * consumers. Keeps both names live without duplicating
 * implementation, matching the `listAdminOrganizationMembersFromEnvironment`
 * alias style.
 */
export const listAdminWorkspacesFromEnvironment = listWorkspacesFromEnvironment;

export const getWorkspaceFromEnvironment = (
  environment: unknown,
  input: GetWorkspaceInput,
) =>
  loadAdminWorkspacesRuntime().pipe(
    Effect.flatMap(({ runAdminWorkspacesFromEnvironment }) =>
      runAdminWorkspacesFromEnvironment(environment, (service) =>
        service.get(input),
      ),
    ),
  );

export const createWorkspaceFromEnvironment = (
  environment: unknown,
  input: CreateWorkspaceInput,
) =>
  loadAdminWorkspacesRuntime().pipe(
    Effect.flatMap(({ runAdminWorkspacesFromEnvironment }) =>
      runAdminWorkspacesFromEnvironment(environment, (service) =>
        service.create(input),
      ),
    ),
  );

export const updateWorkspaceFromEnvironment = (
  environment: unknown,
  input: UpdateWorkspaceInput,
) =>
  loadAdminWorkspacesRuntime().pipe(
    Effect.flatMap(({ runAdminWorkspacesFromEnvironment }) =>
      runAdminWorkspacesFromEnvironment(environment, (service) =>
        service.update(input),
      ),
    ),
  );

export const deleteWorkspaceFromEnvironment = (
  environment: unknown,
  input: DeleteWorkspaceInput,
) =>
  loadAdminWorkspacesRuntime().pipe(
    Effect.flatMap(({ runAdminWorkspacesFromEnvironment }) =>
      runAdminWorkspacesFromEnvironment(environment, (service) =>
        service.delete(input),
      ),
    ),
  );

export const reorderWorkspacesFromEnvironment = (
  environment: unknown,
  input: ReorderWorkspacesInput,
) =>
  loadAdminWorkspacesRuntime().pipe(
    Effect.flatMap(({ runAdminWorkspacesFromEnvironment }) =>
      runAdminWorkspacesFromEnvironment(environment, (service) =>
        service.reorder(input),
      ),
    ),
  );

export type { AdminWorkspace };
