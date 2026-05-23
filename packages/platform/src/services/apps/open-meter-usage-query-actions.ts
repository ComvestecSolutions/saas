import { Effect } from "effect";
import type {
  OpenMeterUsageBackfillInput,
  OpenMeterUsageQueryInput,
  OpenMeterUsageQueryResult,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the OpenMeter usage query platform
 * service.
 *
 * Mirrors the `polar-revenue-projection-actions.ts` pattern: helpers
 * stay free of any `Request` / `Response` shaping, never own a
 * duplicate `Effect.tryPromise`, and load the env-bound service
 * runtime through `loadRuntimeModuleOrDie` so the import graph remains
 * safe to evaluate at app root scope (admin-app implementation plan
 * §9 item 8 follow-up).
 */
const loadOpenMeterUsageQueryRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/open-meter-usage-query-service"),
  );

export const getOpenMeterUsageQueryFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: OpenMeterUsageQueryInput;
  },
) =>
  loadOpenMeterUsageQueryRuntime().pipe(
    Effect.flatMap(({ runOpenMeterUsageQueryFromEnvironment }) =>
      runOpenMeterUsageQueryFromEnvironment(environment, (service) =>
        service.getLatestUsageQuery(input),
      ),
    ),
  );

export const requestOpenMeterUsageBackfillFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly backfill: OpenMeterUsageBackfillInput;
  },
) =>
  loadOpenMeterUsageQueryRuntime().pipe(
    Effect.flatMap(({ runOpenMeterUsageQueryFromEnvironment }) =>
      runOpenMeterUsageQueryFromEnvironment(environment, (service) =>
        service.requestBackfill(input),
      ),
    ),
  );

export type {
  OpenMeterUsageBackfillInput,
  OpenMeterUsageQueryInput,
  OpenMeterUsageQueryResult,
};
