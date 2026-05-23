import { Effect } from "effect";
import type {
  OpenMeterMeterGetBySlugInput,
  OpenMeterMeterListAllInput,
  OpenMeterMeterListByEventTypeInput,
  OpenMeterMeterSummary,
  OpenMeterMeterSummaryList,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the OpenMeter meter read platform service
 * (admin-app implementation plan §9 item 10 — batch A vendor #3).
 *
 * Mirrors the `keycloak-user-read-actions.ts` /
 * `polar-customer-read-actions.ts` pattern: helpers stay free of
 * any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through the single `loadRuntimeModuleOrDie` seam so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadOpenMeterMeterReadRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/open-meter-meter-read-service"),
  );

export const getOpenMeterMeterBySlugFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: OpenMeterMeterGetBySlugInput;
  },
) =>
  loadOpenMeterMeterReadRuntime().pipe(
    Effect.flatMap(({ runOpenMeterMeterReadFromEnvironment }) =>
      runOpenMeterMeterReadFromEnvironment(environment, (service) =>
        service.getBySlug(input),
      ),
    ),
  );

export const listOpenMeterMetersAllFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: OpenMeterMeterListAllInput;
  },
) =>
  loadOpenMeterMeterReadRuntime().pipe(
    Effect.flatMap(({ runOpenMeterMeterReadFromEnvironment }) =>
      runOpenMeterMeterReadFromEnvironment(environment, (service) =>
        service.listAll(input),
      ),
    ),
  );

export const listOpenMeterMetersByEventTypeFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: OpenMeterMeterListByEventTypeInput;
  },
) =>
  loadOpenMeterMeterReadRuntime().pipe(
    Effect.flatMap(({ runOpenMeterMeterReadFromEnvironment }) =>
      runOpenMeterMeterReadFromEnvironment(environment, (service) =>
        service.listByEventType(input),
      ),
    ),
  );

export type {
  OpenMeterMeterGetBySlugInput,
  OpenMeterMeterListAllInput,
  OpenMeterMeterListByEventTypeInput,
  OpenMeterMeterSummary,
  OpenMeterMeterSummaryList,
};
