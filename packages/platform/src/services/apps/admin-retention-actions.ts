import { Effect } from "effect";
import type {
  ListRetentionLegalHoldsBySessionRequest,
  ListRetentionPoliciesBySessionRequest,
  PlaceRetentionLegalHoldBySessionRequest,
  ReleaseRetentionLegalHoldBySessionRequest,
  UpsertRetentionPolicyBySessionRequest,
} from "../governance/retention-legal-hold";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadRetentionLegalHoldRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../governance/retention-legal-hold"));

export const upsertRetentionPolicyFromEnvironment = (
  environment: unknown,
  input: UpsertRetentionPolicyBySessionRequest,
) =>
  loadRetentionLegalHoldRuntime().pipe(
    Effect.flatMap(({ runRetentionLegalHoldFromEnvironment }) =>
      runRetentionLegalHoldFromEnvironment(environment, (service) =>
        service.upsertRetentionPolicy(input),
      ),
    ),
  );

export const listRetentionPoliciesFromEnvironment = (
  environment: unknown,
  input: ListRetentionPoliciesBySessionRequest,
) =>
  loadRetentionLegalHoldRuntime().pipe(
    Effect.flatMap(({ runRetentionLegalHoldFromEnvironment }) =>
      runRetentionLegalHoldFromEnvironment(environment, (service) =>
        service.listRetentionPolicies(input),
      ),
    ),
  );

export const placeRetentionLegalHoldFromEnvironment = (
  environment: unknown,
  input: PlaceRetentionLegalHoldBySessionRequest,
) =>
  loadRetentionLegalHoldRuntime().pipe(
    Effect.flatMap(({ runRetentionLegalHoldFromEnvironment }) =>
      runRetentionLegalHoldFromEnvironment(environment, (service) =>
        service.placeRetentionLegalHold(input),
      ),
    ),
  );

export const releaseRetentionLegalHoldFromEnvironment = (
  environment: unknown,
  input: ReleaseRetentionLegalHoldBySessionRequest,
) =>
  loadRetentionLegalHoldRuntime().pipe(
    Effect.flatMap(({ runRetentionLegalHoldFromEnvironment }) =>
      runRetentionLegalHoldFromEnvironment(environment, (service) =>
        service.releaseRetentionLegalHold(input),
      ),
    ),
  );

export const listRetentionLegalHoldsFromEnvironment = (
  environment: unknown,
  input: ListRetentionLegalHoldsBySessionRequest,
) =>
  loadRetentionLegalHoldRuntime().pipe(
    Effect.flatMap(({ runRetentionLegalHoldFromEnvironment }) =>
      runRetentionLegalHoldFromEnvironment(environment, (service) =>
        service.listRetentionLegalHolds(input),
      ),
    ),
  );

type UpsertRetentionPolicy = (
  input: UpsertRetentionPolicyBySessionRequest,
) => ReturnType<typeof upsertRetentionPolicyFromEnvironment>;

type ListRetentionPolicies = (
  input: ListRetentionPoliciesBySessionRequest,
) => ReturnType<typeof listRetentionPoliciesFromEnvironment>;

type PlaceRetentionLegalHold = (
  input: PlaceRetentionLegalHoldBySessionRequest,
) => ReturnType<typeof placeRetentionLegalHoldFromEnvironment>;

type ReleaseRetentionLegalHold = (
  input: ReleaseRetentionLegalHoldBySessionRequest,
) => ReturnType<typeof releaseRetentionLegalHoldFromEnvironment>;

type ListRetentionLegalHolds = (
  input: ListRetentionLegalHoldsBySessionRequest,
) => ReturnType<typeof listRetentionLegalHoldsFromEnvironment>;

export const upsertRetentionPolicyFromSessionId = (
  environment: unknown,
  input: UpsertRetentionPolicyBySessionRequest,
  upsertRetentionPolicy: UpsertRetentionPolicy = (requestInput) =>
    upsertRetentionPolicyFromEnvironment(environment, requestInput),
) => upsertRetentionPolicy(input);

export const listRetentionPoliciesFromSessionId = (
  environment: unknown,
  input: ListRetentionPoliciesBySessionRequest,
  listRetentionPolicies: ListRetentionPolicies = (requestInput) =>
    listRetentionPoliciesFromEnvironment(environment, requestInput),
) => listRetentionPolicies(input);

export const placeRetentionLegalHoldFromSessionId = (
  environment: unknown,
  input: PlaceRetentionLegalHoldBySessionRequest,
  placeRetentionLegalHold: PlaceRetentionLegalHold = (requestInput) =>
    placeRetentionLegalHoldFromEnvironment(environment, requestInput),
) => placeRetentionLegalHold(input);

export const releaseRetentionLegalHoldFromSessionId = (
  environment: unknown,
  input: ReleaseRetentionLegalHoldBySessionRequest,
  releaseRetentionLegalHold: ReleaseRetentionLegalHold = (requestInput) =>
    releaseRetentionLegalHoldFromEnvironment(environment, requestInput),
) => releaseRetentionLegalHold(input);

export const listRetentionLegalHoldsFromSessionId = (
  environment: unknown,
  input: ListRetentionLegalHoldsBySessionRequest,
  listRetentionLegalHolds: ListRetentionLegalHolds = (requestInput) =>
    listRetentionLegalHoldsFromEnvironment(environment, requestInput),
) => listRetentionLegalHolds(input);
