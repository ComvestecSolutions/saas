import { Effect } from "effect";
import type { RequestContext } from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the run-as / acting-as banner state
 * platform service (admin-app implementation plan §9 item 14).
 *
 * Mirrors `capability-snapshot-v2-actions.ts` and
 * `universal-search-actions.ts` EXACTLY: helpers stay free of any
 * `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through the single `loadRuntimeModuleOrDie` seam so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadRunAsBannerStateRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../access/run-as-banner-state-service"));

export const getRunAsBannerStateFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
  },
) =>
  loadRunAsBannerStateRuntime().pipe(
    Effect.flatMap(({ runRunAsBannerStateFromEnvironment: run }) =>
      run(environment, (service) => service.queryBanner(input)),
    ),
  );

export const releaseRunAsGrantFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly grantId: string;
    readonly reason: string;
    readonly reasonAttachmentText?: string;
  },
) =>
  loadRunAsBannerStateRuntime().pipe(
    Effect.flatMap(({ runRunAsBannerStateFromEnvironment: run }) =>
      run(environment, (service) => service.releaseGrant(input)),
    ),
  );
