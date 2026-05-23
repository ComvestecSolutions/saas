import { Effect } from "effect";
import type {
  RequestContext,
  VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the vendor-health aggregator platform
 * service (admin-app implementation plan §9 item 9 follow-up).
 *
 * Mirrors `polar-revenue-projection-actions.ts` and
 * `open-meter-usage-query-actions.ts` exactly: helpers stay free
 * of any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through a single shared `loadRuntimeModuleOrDie` seam so the
 * import graph remains safe to evaluate at app root scope.
 */
const loadVendorHealthAggregatorRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/vendor-health-aggregator-service"),
  );

export const getVendorHealthAggregateFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
  },
) =>
  loadVendorHealthAggregatorRuntime().pipe(
    Effect.flatMap(({ runVendorHealthAggregatorFromEnvironment }) =>
      runVendorHealthAggregatorFromEnvironment(environment, (service) =>
        service.getAggregate(input),
      ),
    ),
  );

export type { VendorHealthAggregateProjection };
