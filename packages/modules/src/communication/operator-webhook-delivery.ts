/**
 * Operator-facing webhook delivery envelope module surface
 * (admin-app implementation plan §9 item 6).
 *
 * Re-exports the canonical contract types and exposes the four pure
 * helpers used by both the platform service and the persistence
 * layer. Owner-locked invariants (signature scheme, replay-guard
 * window, attempt-budget, backoff, response-body cap) live in the
 * platform service ABOVE persistence — this module owns only the
 * pure, side-effect-free helpers that both layers need to agree on.
 *
 * Naming note: distinct from the existing access-provisioning
 * `webhooks-api-access` surface. The two concerns intentionally do
 * not cross-bleed: delivery records reference subscriptions by
 * `subscriptionId` but live in their own table, manifest, service,
 * and HTTP surface.
 */
import { createHash, createHmac } from "node:crypto";
import {
  operatorWebhookDeliveryStatus,
  type OperatorWebhookDelivery,
} from "@comvestec/contracts";

export {
  operatorWebhookDeliveryStatus,
  operatorWebhookDeliveryStatuses,
  OperatorWebhookDeliveryCancelInputSchema,
  OperatorWebhookDeliveryEnqueueInputSchema,
  OperatorWebhookDeliveryListFilterSchema,
  OperatorWebhookDeliveryListSchema,
  OperatorWebhookDeliveryMethodSchema,
  OperatorWebhookDeliveryReplayInputSchema,
  OperatorWebhookDeliveryRetryInputSchema,
  OperatorWebhookDeliverySchema,
  OperatorWebhookDeliverySignatureHeaderSchema,
  OperatorWebhookDeliveryStatusSchema,
  OperatorWebhookDeliveryTargetTenantSchema,
  OPERATOR_WEBHOOK_DELIVERY_REPLAY_HEADER_NAME,
  OPERATOR_WEBHOOK_DELIVERY_SIGNATURE_HEADER_NAME,
} from "@comvestec/contracts";

export type {
  OperatorWebhookDelivery,
  OperatorWebhookDeliveryCancelInput,
  OperatorWebhookDeliveryEnqueueInput,
  OperatorWebhookDeliveryList,
  OperatorWebhookDeliveryListFilter,
  OperatorWebhookDeliveryMethod,
  OperatorWebhookDeliveryReplayInput,
  OperatorWebhookDeliveryRetryInput,
  OperatorWebhookDeliverySignatureHeader,
  OperatorWebhookDeliveryStatus,
  OperatorWebhookDeliveryTargetTenant,
} from "@comvestec/contracts";

/**
 * Canonical sha256 hex of the verbatim request body. Used as the
 * replay-guard idempotency key per `(subscriptionId, payloadHash)`
 * within the configured `replayGuardWindowMinutes` window.
 */
export const canonicalPayloadHash = (body: string): string =>
  createHash("sha256").update(body, "utf8").digest("hex");

/**
 * Plaintext signed by the subscription secret to derive the
 * `v1=<hex>` portion of the `X-Comvestec-Signature` header. The
 * format is `${unixTimestampSeconds}.${rawBody}` — preserved
 * verbatim so the operator signature inspector can recompute and
 * replay without holding the secret in memory.
 */
export const computeSignaturePlaintext = (
  timestampUnixSeconds: number,
  body: string,
): string => `${timestampUnixSeconds}.${body}`;

/**
 * Derives the canonical `v1=<hex>` HMAC-SHA256 value. Kept here so
 * the platform service and the operator signature inspector share
 * exactly one definition.
 */
export const computeSignatureHex = (
  secret: string,
  timestampUnixSeconds: number,
  body: string,
): string =>
  createHmac("sha256", secret)
    .update(computeSignaturePlaintext(timestampUnixSeconds, body), "utf8")
    .digest("hex");

/**
 * Exponential backoff seconds for the n-th attempt (1-based). The
 * service multiplies the configured `backoffBaseSeconds` by
 * `2^(attemptCount - 1)`. Attempt counts <= 1 collapse to the base
 * to keep the helper total.
 */
export const computeBackoffSeconds = (
  attemptCount: number,
  baseSeconds: number,
): number => {
  if (!Number.isFinite(baseSeconds) || baseSeconds <= 0) {
    return 0;
  }
  if (!Number.isFinite(attemptCount) || attemptCount <= 1) {
    return baseSeconds;
  }
  return baseSeconds * Math.pow(2, attemptCount - 1);
};

/**
 * Returns true when an existing delivery row qualifies as a replay-
 * guard hit for a freshly proposed (subscriptionId, payloadHash)
 * enqueue at `now` within the configured `windowMinutes`. The
 * caller is responsible for limiting the candidate set to the
 * matching subscription + payload-hash pair via `payloadHashMatches`
 * so this helper stays pure.
 *
 * Replaced / canceled rows have been superseded by an operator
 * mutation and never short-circuit a fresh enqueue.
 */
export const isReplayGuardHit = (
  existing: Pick<OperatorWebhookDelivery, "enqueuedAt" | "status">,
  payloadHashMatches: boolean,
  now: number,
  windowMinutes: number,
): boolean => {
  if (!payloadHashMatches) {
    return false;
  }
  if (
    existing.status === operatorWebhookDeliveryStatus.replayed ||
    existing.status === operatorWebhookDeliveryStatus.canceled
  ) {
    return false;
  }
  const enqueuedAtMs = new Date(existing.enqueuedAt).getTime();
  if (!Number.isFinite(enqueuedAtMs)) {
    return false;
  }
  const windowMs = Math.max(0, windowMinutes) * 60 * 1000;
  const ageMs = now - enqueuedAtMs;
  return ageMs >= 0 && ageMs <= windowMs;
};
