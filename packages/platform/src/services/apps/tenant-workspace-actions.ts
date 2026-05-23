import { Effect } from "effect";
import type { TenantWorkspaceSnapshot } from "@comvestec/contracts";
import type { GetTenantWorkspaceSnapshotInput } from "../domains/tenant-workspace-service";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helper for the Tenant workspace aggregate v2
 * platform service (admin-app implementation plan §9 item 4).
 *
 * Mirrors the `operations-home-actions.ts` pattern: stays free
 * of any `Request`/`Response` shaping, never owns a duplicate
 * `Effect.tryPromise`, and loads the env-bound service runtime
 * through `loadRuntimeModuleOrDie` so the import graph remains
 * safe to evaluate at app root scope.
 */
const loadTenantWorkspaceRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/tenant-workspace-service"));

export type GetTenantWorkspaceSnapshotFromEnvironmentInput = Omit<
  GetTenantWorkspaceSnapshotInput,
  "requestContext"
> & {
  readonly requestContext: GetTenantWorkspaceSnapshotInput["requestContext"];
};

export const getTenantWorkspaceSnapshotFromEnvironment = (
  environment: unknown,
  input: GetTenantWorkspaceSnapshotInput,
) =>
  loadTenantWorkspaceRuntime().pipe(
    Effect.flatMap(({ runTenantWorkspaceFromEnvironment }) =>
      runTenantWorkspaceFromEnvironment(environment, (service) =>
        service.getSnapshot(input),
      ),
    ),
  );

export type { TenantWorkspaceSnapshot };
