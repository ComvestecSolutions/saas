import { Effect } from "effect";
import type {
  GetCustomDomainVerificationBySessionRequest,
  GetTenantBrandingSupportSafeViewBySessionRequest,
  PublishTenantBrandingAssetBySessionRequest,
  RequestCustomDomainVerificationBySessionRequest,
  TransitionCustomDomainVerificationBySessionRequest,
} from "../domains/tenant-branding";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadTenantBrandingRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/tenant-branding"));

export const requestCustomDomainVerificationFromEnvironment = (
  environment: unknown,
  input: RequestCustomDomainVerificationBySessionRequest,
) =>
  loadTenantBrandingRuntime().pipe(
    Effect.flatMap(({ runTenantBrandingFromEnvironment }) =>
      runTenantBrandingFromEnvironment(environment, (service) =>
        service.requestCustomDomainVerification(input),
      ),
    ),
  );

export const getTenantBrandingSupportSafeViewFromEnvironment = (
  environment: unknown,
  input: GetTenantBrandingSupportSafeViewBySessionRequest,
) =>
  loadTenantBrandingRuntime().pipe(
    Effect.flatMap(({ runTenantBrandingFromEnvironment }) =>
      runTenantBrandingFromEnvironment(environment, (service) =>
        service.getSupportSafeView(input),
      ),
    ),
  );

export const getCustomDomainVerificationFromEnvironment = (
  environment: unknown,
  input: GetCustomDomainVerificationBySessionRequest,
) =>
  loadTenantBrandingRuntime().pipe(
    Effect.flatMap(({ runTenantBrandingFromEnvironment }) =>
      runTenantBrandingFromEnvironment(environment, (service) =>
        service.getCustomDomainVerification(input),
      ),
    ),
  );

export const publishTenantBrandingAssetFromEnvironment = (
  environment: unknown,
  input: PublishTenantBrandingAssetBySessionRequest,
) =>
  loadTenantBrandingRuntime().pipe(
    Effect.flatMap(({ runTenantBrandingFromEnvironment }) =>
      runTenantBrandingFromEnvironment(environment, (service) =>
        service.publishAssetReference(input),
      ),
    ),
  );

export const transitionCustomDomainVerificationFromEnvironment = (
  environment: unknown,
  input: TransitionCustomDomainVerificationBySessionRequest,
) =>
  loadTenantBrandingRuntime().pipe(
    Effect.flatMap(({ runTenantBrandingFromEnvironment }) =>
      runTenantBrandingFromEnvironment(environment, (service) =>
        service.transitionCurrentCustomDomainVerification(input),
      ),
    ),
  );

type RequestCustomDomainVerification = (
  input: RequestCustomDomainVerificationBySessionRequest,
) => ReturnType<typeof requestCustomDomainVerificationFromEnvironment>;

type GetTenantBrandingSupportSafeView = (
  input: GetTenantBrandingSupportSafeViewBySessionRequest,
) => ReturnType<typeof getTenantBrandingSupportSafeViewFromEnvironment>;

type GetCustomDomainVerification = (
  input: GetCustomDomainVerificationBySessionRequest,
) => ReturnType<typeof getCustomDomainVerificationFromEnvironment>;

type PublishTenantBrandingAsset = (
  input: PublishTenantBrandingAssetBySessionRequest,
) => ReturnType<typeof publishTenantBrandingAssetFromEnvironment>;

type TransitionCustomDomainVerification = (
  input: TransitionCustomDomainVerificationBySessionRequest,
) => ReturnType<typeof transitionCustomDomainVerificationFromEnvironment>;

export const requestCustomDomainVerificationFromSessionId = (
  environment: unknown,
  input: RequestCustomDomainVerificationBySessionRequest,
  requestCustomDomainVerification: RequestCustomDomainVerification = (
    requestInput,
  ) =>
    requestCustomDomainVerificationFromEnvironment(environment, requestInput),
) => requestCustomDomainVerification(input);

export const getTenantBrandingSupportSafeViewFromSessionId = (
  environment: unknown,
  input: GetTenantBrandingSupportSafeViewBySessionRequest,
  getTenantBrandingSupportSafeView: GetTenantBrandingSupportSafeView = (
    requestInput,
  ) =>
    getTenantBrandingSupportSafeViewFromEnvironment(environment, requestInput),
) => getTenantBrandingSupportSafeView(input);

export const getCustomDomainVerificationFromSessionId = (
  environment: unknown,
  input: GetCustomDomainVerificationBySessionRequest,
  getCustomDomainVerification: GetCustomDomainVerification = (requestInput) =>
    getCustomDomainVerificationFromEnvironment(environment, requestInput),
) => getCustomDomainVerification(input);

export const publishTenantBrandingAssetFromSessionId = (
  environment: unknown,
  input: PublishTenantBrandingAssetBySessionRequest,
  publishTenantBrandingAsset: PublishTenantBrandingAsset = (requestInput) =>
    publishTenantBrandingAssetFromEnvironment(environment, requestInput),
) => publishTenantBrandingAsset(input);

export const transitionCustomDomainVerificationFromSessionId = (
  environment: unknown,
  input: TransitionCustomDomainVerificationBySessionRequest,
  transitionCustomDomainVerification: TransitionCustomDomainVerification = (
    requestInput,
  ) =>
    transitionCustomDomainVerificationFromEnvironment(
      environment,
      requestInput,
    ),
) => transitionCustomDomainVerification(input);
