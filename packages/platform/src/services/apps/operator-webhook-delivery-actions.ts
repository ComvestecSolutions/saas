import { Effect } from "effect";
import type {
  OperatorWebhookDelivery,
  OperatorWebhookDeliverySignatureHeader,
} from "@comvestec/contracts";
import type {
  CancelOperatorWebhookDeliveryInput,
  EnqueueOperatorWebhookDeliveryInput,
  GetOperatorWebhookDeliveryInput,
  ListOperatorWebhookDeliveriesInput,
  RecomputeOperatorWebhookDeliverySignatureInput,
  ReplayOperatorWebhookDeliveryInput,
  RetryOperatorWebhookDeliveryInput,
} from "../communication/operator-webhook-delivery-service";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the operator-facing webhook delivery
 * envelope platform service.
 *
 * Mirrors the `manual-break-glass-actions.ts` pattern: helpers stay
 * free of any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime through
 * `loadRuntimeModuleOrDie` so the import graph remains safe to
 * evaluate at app root scope (admin-app implementation plan §9 item
 * 6 follow-up).
 */
const loadOperatorWebhookDeliveryRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../communication/operator-webhook-delivery-service"),
  );

export const enqueueOperatorWebhookDeliveryFromEnvironment = (
  environment: unknown,
  input: EnqueueOperatorWebhookDeliveryInput,
) =>
  loadOperatorWebhookDeliveryRuntime().pipe(
    Effect.flatMap(({ runOperatorWebhookDeliveryFromEnvironment }) =>
      runOperatorWebhookDeliveryFromEnvironment(environment, (service) =>
        service.enqueueDelivery(input),
      ),
    ),
  );

export const getOperatorWebhookDeliveryFromEnvironment = (
  environment: unknown,
  input: GetOperatorWebhookDeliveryInput,
) =>
  loadOperatorWebhookDeliveryRuntime().pipe(
    Effect.flatMap(({ runOperatorWebhookDeliveryFromEnvironment }) =>
      runOperatorWebhookDeliveryFromEnvironment(environment, (service) =>
        service.getDelivery(input),
      ),
    ),
  );

export const listOperatorWebhookDeliveriesFromEnvironment = (
  environment: unknown,
  input: ListOperatorWebhookDeliveriesInput,
) =>
  loadOperatorWebhookDeliveryRuntime().pipe(
    Effect.flatMap(({ runOperatorWebhookDeliveryFromEnvironment }) =>
      runOperatorWebhookDeliveryFromEnvironment(environment, (service) =>
        service.listDeliveries(input),
      ),
    ),
  );

export const replayOperatorWebhookDeliveryFromEnvironment = (
  environment: unknown,
  input: ReplayOperatorWebhookDeliveryInput,
) =>
  loadOperatorWebhookDeliveryRuntime().pipe(
    Effect.flatMap(({ runOperatorWebhookDeliveryFromEnvironment }) =>
      runOperatorWebhookDeliveryFromEnvironment(environment, (service) =>
        service.replayDelivery(input),
      ),
    ),
  );

export const retryOperatorWebhookDeliveryFromEnvironment = (
  environment: unknown,
  input: RetryOperatorWebhookDeliveryInput,
) =>
  loadOperatorWebhookDeliveryRuntime().pipe(
    Effect.flatMap(({ runOperatorWebhookDeliveryFromEnvironment }) =>
      runOperatorWebhookDeliveryFromEnvironment(environment, (service) =>
        service.retryDelivery(input),
      ),
    ),
  );

export const cancelOperatorWebhookDeliveryFromEnvironment = (
  environment: unknown,
  input: CancelOperatorWebhookDeliveryInput,
) =>
  loadOperatorWebhookDeliveryRuntime().pipe(
    Effect.flatMap(({ runOperatorWebhookDeliveryFromEnvironment }) =>
      runOperatorWebhookDeliveryFromEnvironment(environment, (service) =>
        service.cancelDelivery(input),
      ),
    ),
  );

export const recomputeOperatorWebhookDeliverySignatureFromEnvironment = (
  environment: unknown,
  input: RecomputeOperatorWebhookDeliverySignatureInput,
) =>
  loadOperatorWebhookDeliveryRuntime().pipe(
    Effect.flatMap(({ runOperatorWebhookDeliveryFromEnvironment }) =>
      runOperatorWebhookDeliveryFromEnvironment(environment, (service) =>
        service.recomputeSignatureHeader(input),
      ),
    ),
  );

export type { OperatorWebhookDelivery, OperatorWebhookDeliverySignatureHeader };
