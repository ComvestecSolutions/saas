import { Effect } from "effect";
import type { RequestContext } from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the capability snapshot v2 platform
 * service (admin-app implementation plan §9 item 13).
 *
 * Mirrors `universal-search-actions.ts` EXACTLY: helpers stay free
 * of any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through the single `loadRuntimeModuleOrDie` seam so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadCapabilitySnapshotV2Runtime = () =>
  loadRuntimeModuleOrDie(
    () => import("../access/capability-snapshot-v2-service"),
  );

export const getCapabilitySnapshotV2FromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
  },
) =>
  loadCapabilitySnapshotV2Runtime().pipe(
    Effect.flatMap(({ runCapabilitySnapshotV2PlatformFromEnvironment: run }) =>
      run(environment, (service) => service.deriveSnapshot(input)),
    ),
  );

export const invalidateCapabilitySnapshotV2CacheFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly actorId: string;
  },
) =>
  loadCapabilitySnapshotV2Runtime().pipe(
    Effect.flatMap(({ runCapabilitySnapshotV2PlatformFromEnvironment: run }) =>
      run(environment, (service) => service.invalidateCache(input)),
    ),
  );
