import { Effect } from "effect";
import type {
  KeycloakRoleDetail,
  KeycloakRoleGetByIdInput,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadKeycloakRoleReadRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/keycloak-role-read-service"));

export const getKeycloakRoleByIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: KeycloakRoleGetByIdInput;
  },
) =>
  loadKeycloakRoleReadRuntime().pipe(
    Effect.flatMap(({ runKeycloakRoleReadFromEnvironment }) =>
      runKeycloakRoleReadFromEnvironment(environment, (service) =>
        service.getById(input),
      ),
    ),
  );

export type { KeycloakRoleDetail, KeycloakRoleGetByIdInput };
