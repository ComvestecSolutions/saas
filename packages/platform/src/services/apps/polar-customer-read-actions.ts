import { Effect } from "effect";
import type {
  PolarCustomerGetByIdInput,
  PolarCustomerListByEmailInput,
  PolarCustomerListByExternalIdInput,
  PolarCustomerSummary,
  PolarCustomerSummaryList,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the Polar customer read platform service
 * (admin-app implementation plan §9 item 10 — batch A vendor #2).
 *
 * Mirrors the `keycloak-user-read-actions.ts` /
 * `polar-revenue-projection-actions.ts` pattern: helpers stay free
 * of any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through the single `loadRuntimeModuleOrDie` seam so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadPolarCustomerReadRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/polar-customer-read-service"),
  );

export const getPolarCustomerByIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: PolarCustomerGetByIdInput;
  },
) =>
  loadPolarCustomerReadRuntime().pipe(
    Effect.flatMap(({ runPolarCustomerReadFromEnvironment }) =>
      runPolarCustomerReadFromEnvironment(environment, (service) =>
        service.getById(input),
      ),
    ),
  );

export const listPolarCustomersByEmailFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: PolarCustomerListByEmailInput;
  },
) =>
  loadPolarCustomerReadRuntime().pipe(
    Effect.flatMap(({ runPolarCustomerReadFromEnvironment }) =>
      runPolarCustomerReadFromEnvironment(environment, (service) =>
        service.listByEmail(input),
      ),
    ),
  );

export const listPolarCustomersByExternalIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: PolarCustomerListByExternalIdInput;
  },
) =>
  loadPolarCustomerReadRuntime().pipe(
    Effect.flatMap(({ runPolarCustomerReadFromEnvironment }) =>
      runPolarCustomerReadFromEnvironment(environment, (service) =>
        service.listByExternalId(input),
      ),
    ),
  );

export type {
  PolarCustomerGetByIdInput,
  PolarCustomerListByEmailInput,
  PolarCustomerListByExternalIdInput,
  PolarCustomerSummary,
  PolarCustomerSummaryList,
};
