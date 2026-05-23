/**
 * Operator-facing webhook delivery envelope contracts per admin-app
 * implementation plan §9 item 6 and `specs/02-apps/admin-app/spec.md`
 * (Operator-facing webhook delivery envelope — list, detail, replay,
 * retry, signature inspector).
 *
 * Naming note: this slice is the OUTBOUND DELIVERY envelope. It is
 * distinct from the access-provisioning surface under the existing
 * `webhooks-api-access` module (which owns the
 * {@link WebhookSubscriptionRecord} contract co-located in this file
 * for reasons of historical proximity). Delivery records reference
 * subscriptions by `subscriptionId` but live in their own table,
 * manifest, service, and HTTP surface so the two concerns do not
 * cross-bleed.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service, NOT in the persistence layer):
 *
 *   - **Signature scheme**: every dispatched request carries an
 *     `X-Comvestec-Signature` header of the form `t=<unix>,v1=<hex>`
 *     where `v1` is `HMAC-SHA256(secret, "${unixTimestamp}.${body}")`
 *     using the subscription's shared secret. The plaintext request
 *     body, signature, and timestamp are persisted verbatim so the
 *     operator signature inspector can recompute and replay.
 *   - **Replay-guard**: `payloadHash` (sha256 hex of the canonical
 *     request body) is unique within the configured
 *     `replayGuardWindowMinutes` window per `subscriptionId`. Duplicate
 *     enqueues inside the window short-circuit to the existing
 *     delivery row (idempotency key).
 *   - **Retry/backoff**: `attemptCount` is bounded by configured
 *     `maxAttempts`. Backoff between attempts is exponential:
 *     `backoffBaseSeconds * 2^(attemptCount - 1)`. Beyond
 *     `maxAttempts` the row transitions to `exhausted` and an audit
 *     event is emitted.
 *   - **Operator replay**: a replay creates a NEW delivery row whose
 *     `replayOfDeliveryId` points back to the parent. The parent row
 *     stays immutable so the historical attempt log is preserved.
 *   - **Body snippet bound**: `lastResponseBodySnippet` is capped at
 *     `responseBodySnippetMaxBytes` bytes; longer responses are
 *     truncated. The snippet is classified `tenant-confidential`.
 *
 * Status lifecycle:
 *
 *   pending   → delivered  (2xx response within attempt budget)
 *   pending   → failed     (transient non-2xx; will be retried)
 *   pending   → exhausted  (attempts > maxAttempts)
 *   pending   → replayed   (operator replayed; replacement row owns
 *                           the new delivery)
 *   pending   → canceled   (operator-canceled; no further attempts)
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const OperatorWebhookDeliveryStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  delivered: Schema.Literal("delivered"),
  failed: Schema.Literal("failed"),
  exhausted: Schema.Literal("exhausted"),
  replayed: Schema.Literal("replayed"),
  canceled: Schema.Literal("canceled"),
});

export const operatorWebhookDeliveryStatus = Schema.validateSync(
  OperatorWebhookDeliveryStatusConstantSchema,
)({
  pending: "pending",
  delivered: "delivered",
  failed: "failed",
  exhausted: "exhausted",
  replayed: "replayed",
  canceled: "canceled",
} satisfies Schema.Schema.Type<
  typeof OperatorWebhookDeliveryStatusConstantSchema
>);

export const operatorWebhookDeliveryStatuses = [
  operatorWebhookDeliveryStatus.pending,
  operatorWebhookDeliveryStatus.delivered,
  operatorWebhookDeliveryStatus.failed,
  operatorWebhookDeliveryStatus.exhausted,
  operatorWebhookDeliveryStatus.replayed,
  operatorWebhookDeliveryStatus.canceled,
] as const;

export const OperatorWebhookDeliveryStatusSchema = Schema.Literal(
  ...operatorWebhookDeliveryStatuses,
);

export type OperatorWebhookDeliveryStatus = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryStatusSchema
>;

// ---------------------------------------------------------------------------
// Target tenant (matches the rest of the platform tenant addressing)
// ---------------------------------------------------------------------------

export const OperatorWebhookDeliveryTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type OperatorWebhookDeliveryTargetTenant = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Method (only POST is dispatched; literal kept to keep audit/inspector
// fields fully typed — no raw strings escape this contract)
// ---------------------------------------------------------------------------

export const OperatorWebhookDeliveryMethodSchema = Schema.Literal("POST");

export type OperatorWebhookDeliveryMethod = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryMethodSchema
>;

// ---------------------------------------------------------------------------
// Canonical persisted delivery record
// ---------------------------------------------------------------------------

/**
 * Persisted outbound delivery row.
 *
 * `payloadHash` is the sha256 hex of `requestBody` and is enforced as
 * the idempotency / replay-guard key within
 * `replayGuardWindowMinutes` per subscription.
 *
 * `signature` is the `v1=<hex>` portion (HMAC-SHA256) of the eventual
 * `X-Comvestec-Signature: t=<unix>,v1=<hex>` header value. It is
 * persisted so the operator signature inspector can recompute it
 * without holding the subscription secret in memory.
 *
 * `eventType` is kept as a `NonEmptyString` at the contract layer
 * because the canonical event-type union lives with the source
 * domain (e.g. billing / tenant-management) and we deliberately do
 * not couple the delivery envelope to any specific upstream catalog.
 */
export const OperatorWebhookDeliverySchema = Schema.Struct({
  id: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  targetTenant: OperatorWebhookDeliveryTargetTenantSchema,
  eventType: Schema.NonEmptyString,
  requestUrl: Schema.NonEmptyString,
  requestMethod: OperatorWebhookDeliveryMethodSchema,
  requestBody: Schema.NonEmptyString,
  payloadHash: Schema.NonEmptyString,
  signature: Schema.NonEmptyString,
  signatureTimestamp: IsoTimestampSchema,
  status: OperatorWebhookDeliveryStatusSchema,
  attemptCount: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
  ),
  enqueuedAt: IsoTimestampSchema,
  nextAttemptAt: Schema.optional(IsoTimestampSchema),
  lastAttemptAt: Schema.optional(IsoTimestampSchema),
  lastResponseStatus: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  ),
  lastResponseBodySnippet: Schema.optional(Schema.NonEmptyString),
  lastErrorMessage: Schema.optional(Schema.NonEmptyString),
  replayOfDeliveryId: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.NonEmptyString,
});

export type OperatorWebhookDelivery = Schema.Schema.Type<
  typeof OperatorWebhookDeliverySchema
>;

export const OperatorWebhookDeliveryListSchema = Schema.Array(
  OperatorWebhookDeliverySchema,
);

export type OperatorWebhookDeliveryList = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Enqueue input — what an upstream publisher hands the service.
 * `requestBody` MUST be the canonical JSON-encoded envelope payload
 * the publisher wants delivered; the service computes `payloadHash`,
 * `signature`, and `signatureTimestamp` from it so callers cannot
 * fabricate signatures and replay-guard remains authoritative.
 */
export const OperatorWebhookDeliveryEnqueueInputSchema = Schema.Struct({
  subscriptionId: Schema.NonEmptyString,
  targetTenant: OperatorWebhookDeliveryTargetTenantSchema,
  eventType: Schema.NonEmptyString,
  requestUrl: Schema.NonEmptyString,
  requestBody: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
});

export type OperatorWebhookDeliveryEnqueueInput = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryEnqueueInputSchema
>;

export const OperatorWebhookDeliveryReplayInputSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  replayReasonCatalogId: Schema.NonEmptyString,
  /**
   * High-risk attachment text required by the reason-catalog registry
   * entry for `reasonCatalogId.operatorWebhookDeliveryReplay`
   * (`requiresAttachment: true`). Operators MUST link a runbook URL,
   * ticket id, or incident reference so the audit row records the
   * originating compliance evidence. Whitespace-only values are
   * rejected at the service boundary with
   * `OperatorWebhookDeliveryReasonAttachmentRequired`.
   */
  reasonAttachmentText: Schema.NonEmptyString,
});

export type OperatorWebhookDeliveryReplayInput = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryReplayInputSchema
>;

export const OperatorWebhookDeliveryRetryInputSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  retryReasonCatalogId: Schema.NonEmptyString,
});

export type OperatorWebhookDeliveryRetryInput = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryRetryInputSchema
>;

export const OperatorWebhookDeliveryCancelInputSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  cancelReasonCatalogId: Schema.NonEmptyString,
});

export type OperatorWebhookDeliveryCancelInput = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryCancelInputSchema
>;

export const OperatorWebhookDeliveryListFilterSchema = Schema.Struct({
  subscriptionId: Schema.optional(Schema.NonEmptyString),
  status: Schema.optional(OperatorWebhookDeliveryStatusSchema),
  targetTenant: Schema.optional(OperatorWebhookDeliveryTargetTenantSchema),
  limit: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThan(0),
      Schema.lessThanOrEqualTo(500),
    ),
  ),
});

export type OperatorWebhookDeliveryListFilter = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryListFilterSchema
>;

// ---------------------------------------------------------------------------
// Signature header value (typed surface so consumers cannot hand-spell
// the canonical `t=<unix>,v1=<hex>` format incorrectly)
// ---------------------------------------------------------------------------

export const OperatorWebhookDeliverySignatureHeaderSchema =
  Schema.NonEmptyString.pipe(Schema.pattern(/^t=\d+,v1=[0-9a-f]{64}$/));

export type OperatorWebhookDeliverySignatureHeader = Schema.Schema.Type<
  typeof OperatorWebhookDeliverySignatureHeaderSchema
>;

export const OPERATOR_WEBHOOK_DELIVERY_SIGNATURE_HEADER_NAME =
  "X-Comvestec-Signature";

export const OPERATOR_WEBHOOK_DELIVERY_REPLAY_HEADER_NAME =
  "X-Comvestec-Delivery-Id";
