import { Effect } from "effect";
import type {
  NovuDeliveryGetByIdInput,
  NovuDeliveryListByChannelInput,
  NovuDeliveryListByRecipientInput,
  NovuDeliverySummary,
  NovuDeliverySummaryList,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the Novu deliveries read platform
 * service (admin-app implementation plan §9 item 10 — batch B
 * vendor #1).
 *
 * Mirrors the `keycloak-user-read-actions.ts` /
 * `polar-customer-read-actions.ts` / `open-meter-meter-read-actions.ts`
 * pattern: helpers stay free of any `Request` / `Response`
 * shaping, never own a duplicate `Effect.tryPromise`, and load
 * the env-bound service runtime through the single
 * `loadRuntimeModuleOrDie` seam so the import graph remains safe
 * to evaluate at app root scope.
 */
const loadNovuDeliveriesReadRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/novu-deliveries-read-service"),
  );

export const getNovuDeliveryByIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: NovuDeliveryGetByIdInput;
  },
) =>
  loadNovuDeliveriesReadRuntime().pipe(
    Effect.flatMap(({ runNovuDeliveriesReadFromEnvironment }) =>
      runNovuDeliveriesReadFromEnvironment(environment, (service) =>
        service.getById(input),
      ),
    ),
  );

export const listNovuDeliveriesByRecipientFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: NovuDeliveryListByRecipientInput;
  },
) =>
  loadNovuDeliveriesReadRuntime().pipe(
    Effect.flatMap(({ runNovuDeliveriesReadFromEnvironment }) =>
      runNovuDeliveriesReadFromEnvironment(environment, (service) =>
        service.listByRecipient(input),
      ),
    ),
  );

export const listNovuDeliveriesByChannelFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: NovuDeliveryListByChannelInput;
  },
) =>
  loadNovuDeliveriesReadRuntime().pipe(
    Effect.flatMap(({ runNovuDeliveriesReadFromEnvironment }) =>
      runNovuDeliveriesReadFromEnvironment(environment, (service) =>
        service.listByChannel(input),
      ),
    ),
  );

export type {
  NovuDeliveryGetByIdInput,
  NovuDeliveryListByChannelInput,
  NovuDeliveryListByRecipientInput,
  NovuDeliverySummary,
  NovuDeliverySummaryList,
};
