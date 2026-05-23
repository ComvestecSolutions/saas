import { Effect } from "effect";
import type {
  RequestContext,
  UniversalSearchQueryInput,
  UniversalSearchReindexInput,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the universal omnibar search platform
 * service (admin-app implementation plan §9 item 11).
 *
 * Mirrors the postal-mail-log-read-actions.ts /
 * openpanel-events-read-actions.ts / polar-customer-read-actions.ts
 * pattern EXACTLY: helpers stay free of any `Request` / `Response`
 * shaping, never own a duplicate `Effect.tryPromise`, and load the
 * env-bound service runtime through the single
 * `loadRuntimeModuleOrDie` seam so the import graph remains safe
 * to evaluate at app root scope.
 */
const loadUniversalSearchRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/universal-search-service"));

export const runUniversalSearchFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: UniversalSearchQueryInput;
  },
) =>
  loadUniversalSearchRuntime().pipe(
    Effect.flatMap(({ runUniversalSearchPlatformFromEnvironment: run }) =>
      run(environment, (service) => service.search(input)),
    ),
  );

export const requestUniversalSearchReindexFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: UniversalSearchReindexInput;
  },
) =>
  loadUniversalSearchRuntime().pipe(
    Effect.flatMap(({ runUniversalSearchPlatformFromEnvironment: run }) =>
      run(environment, (service) => service.requestReindex(input)),
    ),
  );

export type { UniversalSearchQueryInput, UniversalSearchReindexInput };
