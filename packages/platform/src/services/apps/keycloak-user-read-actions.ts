import { Effect } from "effect";
import type {
  KeycloakUserGetByIdInput,
  KeycloakUserListByEmailInput,
  KeycloakUserListByUsernameInput,
  KeycloakUserSummary,
  KeycloakUserSummaryList,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the Keycloak user read platform service
 * (admin-app implementation plan §9 item 10 — batch A vendor #1).
 *
 * Mirrors the `polar-revenue-projection-actions.ts` /
 * `open-meter-usage-query-actions.ts` pattern: helpers stay free of
 * any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime through
 * the single `loadRuntimeModuleOrDie` seam so the import graph remains
 * safe to evaluate at app root scope.
 */
const loadKeycloakUserReadRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/keycloak-user-read-service"));

export const getKeycloakUserByIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: KeycloakUserGetByIdInput;
  },
) =>
  loadKeycloakUserReadRuntime().pipe(
    Effect.flatMap(({ runKeycloakUserReadFromEnvironment }) =>
      runKeycloakUserReadFromEnvironment(environment, (service) =>
        service.getById(input),
      ),
    ),
  );

export const listKeycloakUsersByEmailFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: KeycloakUserListByEmailInput;
  },
) =>
  loadKeycloakUserReadRuntime().pipe(
    Effect.flatMap(({ runKeycloakUserReadFromEnvironment }) =>
      runKeycloakUserReadFromEnvironment(environment, (service) =>
        service.listByEmail(input),
      ),
    ),
  );

export const listKeycloakUsersByUsernameFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: KeycloakUserListByUsernameInput;
  },
) =>
  loadKeycloakUserReadRuntime().pipe(
    Effect.flatMap(({ runKeycloakUserReadFromEnvironment }) =>
      runKeycloakUserReadFromEnvironment(environment, (service) =>
        service.listByUsername(input),
      ),
    ),
  );

export type {
  KeycloakUserGetByIdInput,
  KeycloakUserListByEmailInput,
  KeycloakUserListByUsernameInput,
  KeycloakUserSummary,
  KeycloakUserSummaryList,
};
