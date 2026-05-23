import { Effect } from "effect";
import type { OperationsHomeSnapshot } from "@comvestec/contracts";
import type { GetOperationsHomeSnapshotInput } from "../domains/operations-home-service";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helper for the Operations Home aggregate v2
 * platform service (admin-app implementation plan §9 item 3).
 *
 * Mirrors the `admin-saved-views-actions.ts` pattern: stays free
 * of any `Request`/`Response` shaping, never owns a duplicate
 * `Effect.tryPromise`, and loads the env-bound service runtime
 * through `loadRuntimeModuleOrDie` so the import graph remains
 * safe to evaluate at app root scope.
 */
const loadOperationsHomeRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/operations-home-service"));

export type GetOperationsHomeSnapshotFromEnvironmentInput = Omit<
  GetOperationsHomeSnapshotInput,
  "requestContext"
> & {
  readonly requestContext: GetOperationsHomeSnapshotInput["requestContext"];
};

export const getOperationsHomeSnapshotFromEnvironment = (
  environment: unknown,
  input: GetOperationsHomeSnapshotInput,
) =>
  loadOperationsHomeRuntime().pipe(
    Effect.flatMap(({ runOperationsHomeFromEnvironment }) =>
      runOperationsHomeFromEnvironment(environment, (service) =>
        service.getSnapshot(input),
      ),
    ),
  );

export type { OperationsHomeSnapshot };
