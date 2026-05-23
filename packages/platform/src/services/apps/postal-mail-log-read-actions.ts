import { Effect } from "effect";
import type {
  PostalMailLogGetByIdInput,
  PostalMailLogEntry,
  PostalMailLogEntryList,
  PostalMailLogListByRecipientInput,
  PostalMailLogListByStatusInput,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the Postal mail log read platform
 * service (admin-app implementation plan §9 item 10 — batch B
 * vendor #2).
 *
 * Mirrors the keycloak-user-read-actions.ts /
 * polar-customer-read-actions.ts / open-meter-meter-read-actions.ts /
 * novu-deliveries-read-actions.ts pattern: helpers stay free of
 * any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through the single `loadRuntimeModuleOrDie` seam so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadPostalMailLogReadRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/postal-mail-log-read-service"),
  );

export const getPostalMailLogByIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: PostalMailLogGetByIdInput;
  },
) =>
  loadPostalMailLogReadRuntime().pipe(
    Effect.flatMap(({ runPostalMailLogReadFromEnvironment }) =>
      runPostalMailLogReadFromEnvironment(environment, (service) =>
        service.getById(input),
      ),
    ),
  );

export const listPostalMailLogByRecipientFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: PostalMailLogListByRecipientInput;
  },
) =>
  loadPostalMailLogReadRuntime().pipe(
    Effect.flatMap(({ runPostalMailLogReadFromEnvironment }) =>
      runPostalMailLogReadFromEnvironment(environment, (service) =>
        service.listByRecipient(input),
      ),
    ),
  );

export const listPostalMailLogByStatusFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: PostalMailLogListByStatusInput;
  },
) =>
  loadPostalMailLogReadRuntime().pipe(
    Effect.flatMap(({ runPostalMailLogReadFromEnvironment }) =>
      runPostalMailLogReadFromEnvironment(environment, (service) =>
        service.listByStatus(input),
      ),
    ),
  );

export type {
  PostalMailLogEntry,
  PostalMailLogEntryList,
  PostalMailLogGetByIdInput,
  PostalMailLogListByRecipientInput,
  PostalMailLogListByStatusInput,
};
