import { Effect, Schema } from "effect";
import {
  actorType,
  AdminOperatorDirectorySnapshotSchema,
  AdminOperatorProfileSchema,
  type AdminOperatorDirectorySnapshot,
  type AdminOperatorProfile,
  type AdminOperatorProvisionResult,
} from "@comvestec/contracts";
import type {
  AdminOperatorProvisionBySessionRequest,
  AdminOperatorSessionLookup,
} from "../access/admin-operator-management";
import { loadRuntimeModuleOrDie } from "./runtime-loader";
import { getAdminOperatorCapabilitySnapshotFromSessionId } from "./admin-control-plane";

const loadAdminOperatorManagementRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../access/admin-operator-management"));

const decodeAdminOperatorProfile = Schema.decodeUnknown(
  AdminOperatorProfileSchema,
);

const decodeAdminOperatorDirectorySnapshot = Schema.decodeUnknown(
  AdminOperatorDirectorySnapshotSchema,
);

export const getAdminOperatorProfileFromEnvironment = (
  environment: unknown,
  input: AdminOperatorSessionLookup,
) =>
  Effect.all({
    identity: loadAdminOperatorManagementRuntime().pipe(
      Effect.flatMap(({ runAdminOperatorManagementFromEnvironment }) =>
        runAdminOperatorManagementFromEnvironment(environment, (service) =>
          service.getCurrentOperatorIdentity(input),
        ),
      ),
    ),
    capabilities: getAdminOperatorCapabilitySnapshotFromSessionId(
      environment,
      input,
    ),
  }).pipe(
    Effect.flatMap(({ identity, capabilities }) =>
      decodeAdminOperatorProfile({
        identity,
        sessionId: input.sessionId,
        capabilities: capabilities.capabilities,
      }),
    ),
  );

export const getAdminOperatorDirectorySnapshotFromEnvironment = (
  environment: unknown,
  input: AdminOperatorSessionLookup,
) =>
  getAdminOperatorProfileFromEnvironment(environment, input).pipe(
    Effect.flatMap((currentOperator) =>
      (currentOperator.identity.actorType === actorType.platformOperator
        ? loadAdminOperatorManagementRuntime().pipe(
            Effect.flatMap(({ runAdminOperatorManagementFromEnvironment }) =>
              runAdminOperatorManagementFromEnvironment(
                environment,
                (service) => service.listOperators(input),
              ),
            ),
          )
        : Effect.succeed([])
      ).pipe(
        Effect.flatMap((operators) =>
          decodeAdminOperatorDirectorySnapshot({
            currentOperator,
            operators,
          }),
        ),
      ),
    ),
  );

export const provisionAdminOperatorFromEnvironment = (
  environment: unknown,
  input: AdminOperatorProvisionBySessionRequest,
) =>
  loadAdminOperatorManagementRuntime().pipe(
    Effect.flatMap(({ runAdminOperatorManagementFromEnvironment }) =>
      runAdminOperatorManagementFromEnvironment(environment, (service) =>
        service.provisionOperator(input),
      ),
    ),
  );

type GetAdminOperatorProfile = (
  input: AdminOperatorSessionLookup,
) => ReturnType<typeof getAdminOperatorProfileFromEnvironment>;

type GetAdminOperatorDirectorySnapshot = (
  input: AdminOperatorSessionLookup,
) => ReturnType<typeof getAdminOperatorDirectorySnapshotFromEnvironment>;

type ProvisionAdminOperator = (
  input: AdminOperatorProvisionBySessionRequest,
) => ReturnType<typeof provisionAdminOperatorFromEnvironment>;

export const getAdminOperatorProfileFromSessionId = (
  environment: unknown,
  input: AdminOperatorSessionLookup,
  getAdminOperatorProfile: GetAdminOperatorProfile = (requestInput) =>
    getAdminOperatorProfileFromEnvironment(environment, requestInput),
) => getAdminOperatorProfile(input);

export const getAdminOperatorDirectorySnapshotFromSessionId = (
  environment: unknown,
  input: AdminOperatorSessionLookup,
  getAdminOperatorDirectorySnapshot: GetAdminOperatorDirectorySnapshot = (
    requestInput,
  ) =>
    getAdminOperatorDirectorySnapshotFromEnvironment(environment, requestInput),
) => getAdminOperatorDirectorySnapshot(input);

export const provisionAdminOperatorFromSessionId = (
  environment: unknown,
  input: AdminOperatorProvisionBySessionRequest,
  provisionAdminOperator: ProvisionAdminOperator = (requestInput) =>
    provisionAdminOperatorFromEnvironment(environment, requestInput),
) => provisionAdminOperator(input);

export type {
  AdminOperatorDirectorySnapshot,
  AdminOperatorProfile,
  AdminOperatorProvisionResult,
};
