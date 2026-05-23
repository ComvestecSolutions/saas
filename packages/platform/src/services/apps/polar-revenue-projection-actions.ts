import { Effect } from "effect";
import type {
  PolarRevenueProjection,
  PolarRevenueProjectionBackfillInput,
  PolarRevenueProjectionTargetTenant,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the Polar revenue projection platform
 * service.
 *
 * Mirrors the `operator-webhook-delivery-actions.ts` pattern: helpers
 * stay free of any `Request` / `Response` shaping, never own a
 * duplicate `Effect.tryPromise`, and load the env-bound service
 * runtime through `loadRuntimeModuleOrDie` so the import graph
 * remains safe to evaluate at app root scope (admin-app
 * implementation plan §9 item 7 follow-up).
 */
const loadPolarRevenueProjectionRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/polar-revenue-projection-service"),
  );

export const getPolarRevenueProjectionFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly tenant: PolarRevenueProjectionTargetTenant;
  },
) =>
  loadPolarRevenueProjectionRuntime().pipe(
    Effect.flatMap(({ runPolarRevenueProjectionFromEnvironment }) =>
      runPolarRevenueProjectionFromEnvironment(environment, (service) =>
        service.getLatestSnapshot(input),
      ),
    ),
  );

export const requestPolarRevenueBackfillFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly backfill: PolarRevenueProjectionBackfillInput;
  },
) =>
  loadPolarRevenueProjectionRuntime().pipe(
    Effect.flatMap(({ runPolarRevenueProjectionFromEnvironment }) =>
      runPolarRevenueProjectionFromEnvironment(environment, (service) =>
        service.requestBackfill(input),
      ),
    ),
  );

export type {
  PolarRevenueProjection,
  PolarRevenueProjectionBackfillInput,
  PolarRevenueProjectionTargetTenant,
};
