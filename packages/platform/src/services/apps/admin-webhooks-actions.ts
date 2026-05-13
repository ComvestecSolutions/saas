import { Effect } from "effect";
import type {
  CreateWebhookApiKeyBySessionRequest,
  CreateWebhookSubscriptionBySessionRequest,
  ListWebhookApiKeysBySessionRequest,
  ListWebhookSubscriptionsBySessionRequest,
  RequestWebhookOutboundDeliveryBySessionRequest,
  RevokeWebhookApiKeyBySessionRequest,
  RotateWebhookApiKeyBySessionRequest,
} from "../communication/webhooks-api-access";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadWebhooksApiAccessRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../communication/webhooks-api-access"));

export const listWebhookSubscriptionsFromEnvironment = (
  environment: unknown,
  input: ListWebhookSubscriptionsBySessionRequest,
) =>
  loadWebhooksApiAccessRuntime().pipe(
    Effect.flatMap(({ runWebhooksApiAccessFromEnvironment }) =>
      runWebhooksApiAccessFromEnvironment(environment, (service) =>
        service.listWebhookSubscriptions(input),
      ),
    ),
  );

export const createWebhookSubscriptionFromEnvironment = (
  environment: unknown,
  input: CreateWebhookSubscriptionBySessionRequest,
) =>
  loadWebhooksApiAccessRuntime().pipe(
    Effect.flatMap(({ runWebhooksApiAccessFromEnvironment }) =>
      runWebhooksApiAccessFromEnvironment(environment, (service) =>
        service.createWebhookSubscription(input),
      ),
    ),
  );

export const requestWebhookOutboundDeliveryFromEnvironment = (
  environment: unknown,
  input: RequestWebhookOutboundDeliveryBySessionRequest,
) =>
  loadWebhooksApiAccessRuntime().pipe(
    Effect.flatMap(({ runWebhooksApiAccessFromEnvironment }) =>
      runWebhooksApiAccessFromEnvironment(environment, (service) =>
        service.requestWebhookOutboundDelivery(input),
      ),
    ),
  );

export const listWebhookApiKeysFromEnvironment = (
  environment: unknown,
  input: ListWebhookApiKeysBySessionRequest,
) =>
  loadWebhooksApiAccessRuntime().pipe(
    Effect.flatMap(({ runWebhooksApiAccessFromEnvironment }) =>
      runWebhooksApiAccessFromEnvironment(environment, (service) =>
        service.listWebhookApiKeys(input),
      ),
    ),
  );

export const createWebhookApiKeyFromEnvironment = (
  environment: unknown,
  input: CreateWebhookApiKeyBySessionRequest,
) =>
  loadWebhooksApiAccessRuntime().pipe(
    Effect.flatMap(({ runWebhooksApiAccessFromEnvironment }) =>
      runWebhooksApiAccessFromEnvironment(environment, (service) =>
        service.createWebhookApiKey(input),
      ),
    ),
  );

export const rotateWebhookApiKeyFromEnvironment = (
  environment: unknown,
  input: RotateWebhookApiKeyBySessionRequest,
) =>
  loadWebhooksApiAccessRuntime().pipe(
    Effect.flatMap(({ runWebhooksApiAccessFromEnvironment }) =>
      runWebhooksApiAccessFromEnvironment(environment, (service) =>
        service.rotateWebhookApiKey(input),
      ),
    ),
  );

export const revokeWebhookApiKeyFromEnvironment = (
  environment: unknown,
  input: RevokeWebhookApiKeyBySessionRequest,
) =>
  loadWebhooksApiAccessRuntime().pipe(
    Effect.flatMap(({ runWebhooksApiAccessFromEnvironment }) =>
      runWebhooksApiAccessFromEnvironment(environment, (service) =>
        service.revokeWebhookApiKey(input),
      ),
    ),
  );

type ListWebhookSubscriptions = (
  input: ListWebhookSubscriptionsBySessionRequest,
) => ReturnType<typeof listWebhookSubscriptionsFromEnvironment>;

type CreateWebhookSubscription = (
  input: CreateWebhookSubscriptionBySessionRequest,
) => ReturnType<typeof createWebhookSubscriptionFromEnvironment>;

type RequestWebhookOutboundDelivery = (
  input: RequestWebhookOutboundDeliveryBySessionRequest,
) => ReturnType<typeof requestWebhookOutboundDeliveryFromEnvironment>;

type ListWebhookApiKeys = (
  input: ListWebhookApiKeysBySessionRequest,
) => ReturnType<typeof listWebhookApiKeysFromEnvironment>;

type CreateWebhookApiKey = (
  input: CreateWebhookApiKeyBySessionRequest,
) => ReturnType<typeof createWebhookApiKeyFromEnvironment>;

type RotateWebhookApiKey = (
  input: RotateWebhookApiKeyBySessionRequest,
) => ReturnType<typeof rotateWebhookApiKeyFromEnvironment>;

type RevokeWebhookApiKey = (
  input: RevokeWebhookApiKeyBySessionRequest,
) => ReturnType<typeof revokeWebhookApiKeyFromEnvironment>;

export const listWebhookSubscriptionsFromSessionId = (
  environment: unknown,
  input: ListWebhookSubscriptionsBySessionRequest,
  listWebhookSubscriptions: ListWebhookSubscriptions = (requestInput) =>
    listWebhookSubscriptionsFromEnvironment(environment, requestInput),
) => listWebhookSubscriptions(input);

export const createWebhookSubscriptionFromSessionId = (
  environment: unknown,
  input: CreateWebhookSubscriptionBySessionRequest,
  createWebhookSubscription: CreateWebhookSubscription = (requestInput) =>
    createWebhookSubscriptionFromEnvironment(environment, requestInput),
) => createWebhookSubscription(input);

export const requestWebhookOutboundDeliveryFromSessionId = (
  environment: unknown,
  input: RequestWebhookOutboundDeliveryBySessionRequest,
  requestWebhookOutboundDelivery: RequestWebhookOutboundDelivery = (
    requestInput,
  ) => requestWebhookOutboundDeliveryFromEnvironment(environment, requestInput),
) => requestWebhookOutboundDelivery(input);

export const listWebhookApiKeysFromSessionId = (
  environment: unknown,
  input: ListWebhookApiKeysBySessionRequest,
  listWebhookApiKeys: ListWebhookApiKeys = (requestInput) =>
    listWebhookApiKeysFromEnvironment(environment, requestInput),
) => listWebhookApiKeys(input);

export const createWebhookApiKeyFromSessionId = (
  environment: unknown,
  input: CreateWebhookApiKeyBySessionRequest,
  createWebhookApiKey: CreateWebhookApiKey = (requestInput) =>
    createWebhookApiKeyFromEnvironment(environment, requestInput),
) => createWebhookApiKey(input);

export const rotateWebhookApiKeyFromSessionId = (
  environment: unknown,
  input: RotateWebhookApiKeyBySessionRequest,
  rotateWebhookApiKey: RotateWebhookApiKey = (requestInput) =>
    rotateWebhookApiKeyFromEnvironment(environment, requestInput),
) => rotateWebhookApiKey(input);

export const revokeWebhookApiKeyFromSessionId = (
  environment: unknown,
  input: RevokeWebhookApiKeyBySessionRequest,
  revokeWebhookApiKey: RevokeWebhookApiKey = (requestInput) =>
    revokeWebhookApiKeyFromEnvironment(environment, requestInput),
) => revokeWebhookApiKey(input);
