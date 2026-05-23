/**
 * Operator-facing webhook delivery envelope platform service
 * (admin-app implementation plan §9 item 6).
 *
 * Composes the {@link OperatorWebhookDeliveryRepository} (typed
 * Postgres persistence) with the {@link AuditLogModule} and an
 * injected outbound dispatcher port to expose enqueue / get / list
 * / replay / retry / cancel / recomputeSignature on the operator
 * webhook delivery envelope.
 *
 * Naming note: distinct from the access-provisioning surface owned
 * by `webhooks-api-access`. Delivery records reference subscriptions
 * by `subscriptionId` but live in their own table, manifest, HTTP
 * surface, and audit channel so the two concerns do not cross-bleed.
 *
 * Owner-locked cross-cutting invariants enforced here (NOT in the
 * repository):
 *
 *   - **Signature scheme**: HMAC-SHA256 of `${unixTs}.${body}` with
 *     the subscription secret. Persisted as the `v1=<hex>` portion
 *     plus the `signatureTimestamp`; the operator signature
 *     inspector recomputes via the same helper and validates against
 *     `signatureFreshnessSeconds`. The canonical header value is
 *     decoded through `OperatorWebhookDeliverySignatureHeaderSchema`
 *     so callers cannot hand-spell the wire format incorrectly.
 *   - **Replay-guard**: an enqueue with the same
 *     `(subscriptionId, payloadHash)` inside
 *     `replayGuardWindowMinutes` short-circuits to the existing row
 *     with `OperatorWebhookDeliveryReplayGuardHit`, emits a
 *     `replayGuardShortCircuit` audit event, and returns the
 *     pre-existing id (idempotency key).
 *   - **Attempt budget**: each `recordAttempt` is bounded by
 *     `maxAttempts`. The (attemptCount + 1) > maxAttempts case
 *     transitions to `exhausted` and emits an `exhausted` audit
 *     event.
 *   - **Backoff**: exponential —
 *     `backoffBaseSeconds * 2^(attemptCount - 1)` — sourced from
 *     `computeBackoffSeconds`.
 *   - **Body snippet bound**: `lastResponseBodySnippet` is truncated
 *     to `responseBodySnippetMaxBytes` (UTF-8 bytes) before
 *     persistence.
 *   - **Actor authz**: `platformOperator` may replay/retry; cancel
 *     accepts `platformOperator` OR the subscription owner (resolved
 *     through the injected `isSubscriptionOwner` port). Anyone else
 *     is rejected with {@link OperatorWebhookDeliveryUnauthorized}.
 *   - **Reason catalog**: `reasonCatalogId` on every replay/retry/
 *     cancel MUST decode against `ReasonCatalogIdSchema` (typed —
 *     NOT a string compare). Failures surface as
 *     {@link OperatorWebhookDeliveryReasonNotInCatalog}.
 *   - **Audit emission**: every mutation appends one
 *     {@link AuditLogModule} event keyed by
 *     `platformModuleId.operatorWebhookDelivery` and the canonical
 *     `operatorWebhookDeliveryAuditAction.*` literal.
 *   - **Bounded in-memory cache**: keeps a recent-delivery cache
 *     keyed by `${subscriptionId}|${payloadHash}` bounded by
 *     `cacheMaxSize` with insertion-order eviction so the replay-
 *     guard fast path stays bounded under burst.
 *
 * Runtime config: `runOperatorWebhookDeliveryFromEnvironment`
 * decodes `POSTGRES_URL`,
 * `OPERATOR_WEBHOOK_DELIVERY_MAX_ATTEMPTS`,
 * `OPERATOR_WEBHOOK_DELIVERY_BACKOFF_BASE_SECONDS`,
 * `OPERATOR_WEBHOOK_DELIVERY_REPLAY_GUARD_WINDOW_MINUTES`,
 * `OPERATOR_WEBHOOK_DELIVERY_SIGNATURE_FRESHNESS_SECONDS`,
 * `OPERATOR_WEBHOOK_DELIVERY_RESPONSE_BODY_SNIPPET_MAX_BYTES`,
 * `OPERATOR_WEBHOOK_DELIVERY_CACHE_MAX_SIZE`, and
 * `OPERATOR_WEBHOOK_DELIVERY_SUBSCRIPTION_SECRET_PROVIDER` at the
 * boundary with no local fallbacks. Operators MUST set every key.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  getReasonCatalogEntry,
  operatorWebhookDeliveryAuditAction,
  OperatorWebhookDeliveryCancelInputSchema,
  OperatorWebhookDeliveryEnqueueInputSchema,
  OperatorWebhookDeliveryListFilterSchema,
  OperatorWebhookDeliveryReplayInputSchema,
  OperatorWebhookDeliveryRetryInputSchema,
  OperatorWebhookDeliverySignatureHeaderSchema,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  type OperatorWebhookDelivery,
  type OperatorWebhookDeliverySignatureHeader,
  type RequestContext,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  canonicalPayloadHash,
  computeBackoffSeconds,
  computeSignatureHex,
  isReplayGuardHit,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makeOperatorWebhookDeliveryRepositoryLayer,
  OperatorWebhookDeliveryRepository,
  operatorWebhookDeliveryStatus,
  type OperatorWebhookDeliveryRepositoryError,
  type OperatorWebhookDeliveryRepositoryService,
} from "@comvestec/modules";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation =
  | "enqueue"
  | "get"
  | "list"
  | "replay"
  | "retry"
  | "cancel"
  | "recomputeSignature";

export class OperatorWebhookDeliveryNotFound {
  readonly _tag = "OperatorWebhookDeliveryNotFound" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export class OperatorWebhookDeliveryReplayGuardHit {
  readonly _tag = "OperatorWebhookDeliveryReplayGuardHit" as const;
  constructor(
    readonly args: {
      readonly subscriptionId: string;
      readonly payloadHash: string;
      readonly existingDeliveryId: string;
    },
  ) {}
}

export class OperatorWebhookDeliveryAttemptBudgetExceeded {
  readonly _tag = "OperatorWebhookDeliveryAttemptBudgetExceeded" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly attemptCount: number;
      readonly maxAttempts: number;
    },
  ) {}
}

export class OperatorWebhookDeliveryReasonNotInCatalog {
  readonly _tag = "OperatorWebhookDeliveryReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: "replay" | "retry" | "cancel";
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class OperatorWebhookDeliveryReasonActionMismatch {
  readonly _tag = "OperatorWebhookDeliveryReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: "replay" | "retry" | "cancel";
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class OperatorWebhookDeliveryReasonAttachmentRequired {
  readonly _tag = "OperatorWebhookDeliveryReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: "replay" | "retry" | "cancel";
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class OperatorWebhookDeliveryUnauthorized {
  readonly _tag = "OperatorWebhookDeliveryUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class OperatorWebhookDeliveryMissingActorIdentity {
  readonly _tag = "OperatorWebhookDeliveryMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class OperatorWebhookDeliverySignatureRecomputeStale {
  readonly _tag = "OperatorWebhookDeliverySignatureRecomputeStale" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly signatureTimestamp: string;
      readonly freshnessSeconds: number;
    },
  ) {}
}

export class OperatorWebhookDeliverySubscriptionSecretError {
  readonly _tag = "OperatorWebhookDeliverySubscriptionSecretError" as const;
  constructor(
    readonly args: {
      readonly subscriptionId: string;
      readonly cause: unknown;
    },
  ) {}
}

export type OperatorWebhookDeliveryServiceError =
  | ParseResult.ParseError
  | OperatorWebhookDeliveryRepositoryError
  | AuditLogModuleError
  | OperatorWebhookDeliveryNotFound
  | OperatorWebhookDeliveryReplayGuardHit
  | OperatorWebhookDeliveryAttemptBudgetExceeded
  | OperatorWebhookDeliveryReasonNotInCatalog
  | OperatorWebhookDeliveryReasonActionMismatch
  | OperatorWebhookDeliveryReasonAttachmentRequired
  | OperatorWebhookDeliveryUnauthorized
  | OperatorWebhookDeliveryMissingActorIdentity
  | OperatorWebhookDeliverySignatureRecomputeStale
  | OperatorWebhookDeliverySubscriptionSecretError;

// ---------------------------------------------------------------------------
// Input schemas (envelope around contracts)
// ---------------------------------------------------------------------------

export const EnqueueOperatorWebhookDeliveryInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  delivery: OperatorWebhookDeliveryEnqueueInputSchema,
});

export type EnqueueOperatorWebhookDeliveryInput = Schema.Schema.Type<
  typeof EnqueueOperatorWebhookDeliveryInputSchema
>;

export const ReplayOperatorWebhookDeliveryInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  replay: OperatorWebhookDeliveryReplayInputSchema,
});

export type ReplayOperatorWebhookDeliveryInput = Schema.Schema.Type<
  typeof ReplayOperatorWebhookDeliveryInputSchema
>;

export const RetryOperatorWebhookDeliveryInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  retry: OperatorWebhookDeliveryRetryInputSchema,
});

export type RetryOperatorWebhookDeliveryInput = Schema.Schema.Type<
  typeof RetryOperatorWebhookDeliveryInputSchema
>;

export const CancelOperatorWebhookDeliveryInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  cancel: OperatorWebhookDeliveryCancelInputSchema,
});

export type CancelOperatorWebhookDeliveryInput = Schema.Schema.Type<
  typeof CancelOperatorWebhookDeliveryInputSchema
>;

export const GetOperatorWebhookDeliveryInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  id: Schema.NonEmptyString,
});

export type GetOperatorWebhookDeliveryInput = Schema.Schema.Type<
  typeof GetOperatorWebhookDeliveryInputSchema
>;

export const ListOperatorWebhookDeliveriesInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  filter: OperatorWebhookDeliveryListFilterSchema,
});

export type ListOperatorWebhookDeliveriesInput = Schema.Schema.Type<
  typeof ListOperatorWebhookDeliveriesInputSchema
>;

export const RecomputeOperatorWebhookDeliverySignatureInputSchema =
  Schema.Struct({
    requestContext: RequestContextSchema,
    id: Schema.NonEmptyString,
  });

export type RecomputeOperatorWebhookDeliverySignatureInput = Schema.Schema.Type<
  typeof RecomputeOperatorWebhookDeliverySignatureInputSchema
>;

// ---------------------------------------------------------------------------
// Ports (injected — env runtime wires them; tests stub them)
// ---------------------------------------------------------------------------

export type OperatorWebhookSubscriptionSecretProvider = (
  subscriptionId: string,
) => Effect.Effect<string, OperatorWebhookDeliverySubscriptionSecretError>;

export type OperatorWebhookSubscriptionOwnerCheck = (input: {
  readonly subscriptionId: string;
  readonly actorId: string;
}) => Effect.Effect<boolean, OperatorWebhookDeliverySubscriptionSecretError>;

// ---------------------------------------------------------------------------
// Runtime bounds
// ---------------------------------------------------------------------------

export type OperatorWebhookDeliveryRuntimeBounds = {
  readonly maxAttempts: number;
  readonly backoffBaseSeconds: number;
  readonly replayGuardWindowMinutes: number;
  readonly signatureFreshnessSeconds: number;
  readonly responseBodySnippetMaxBytes: number;
  readonly cacheMaxSize: number;
};

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type OperatorWebhookDeliveryServiceImpl = {
  readonly enqueueDelivery: (
    input: EnqueueOperatorWebhookDeliveryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryServiceError
  >;
  readonly getDelivery: (
    input: GetOperatorWebhookDeliveryInput,
  ) => Effect.Effect<
    Option.Option<OperatorWebhookDelivery>,
    OperatorWebhookDeliveryServiceError
  >;
  readonly listDeliveries: (
    input: ListOperatorWebhookDeliveriesInput,
  ) => Effect.Effect<
    ReadonlyArray<OperatorWebhookDelivery>,
    OperatorWebhookDeliveryServiceError
  >;
  readonly replayDelivery: (
    input: ReplayOperatorWebhookDeliveryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryServiceError
  >;
  readonly retryDelivery: (
    input: RetryOperatorWebhookDeliveryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryServiceError
  >;
  readonly cancelDelivery: (
    input: CancelOperatorWebhookDeliveryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryServiceError
  >;
  readonly recomputeSignatureHeader: (
    input: RecomputeOperatorWebhookDeliverySignatureInput,
  ) => Effect.Effect<
    OperatorWebhookDeliverySignatureHeader,
    OperatorWebhookDeliveryServiceError
  >;
};

export class OperatorWebhookDeliveryService extends Context.Tag(
  "OperatorWebhookDeliveryService",
)<OperatorWebhookDeliveryService, OperatorWebhookDeliveryServiceImpl>() {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const decodeEnqueueInput = Schema.decodeUnknown(
  EnqueueOperatorWebhookDeliveryInputSchema,
);
const decodeReplayInput = Schema.decodeUnknown(
  ReplayOperatorWebhookDeliveryInputSchema,
);
const decodeRetryInput = Schema.decodeUnknown(
  RetryOperatorWebhookDeliveryInputSchema,
);
const decodeCancelInput = Schema.decodeUnknown(
  CancelOperatorWebhookDeliveryInputSchema,
);
const decodeGetInput = Schema.decodeUnknown(
  GetOperatorWebhookDeliveryInputSchema,
);
const decodeListInput = Schema.decodeUnknown(
  ListOperatorWebhookDeliveriesInputSchema,
);
const decodeRecomputeSignatureInput = Schema.decodeUnknown(
  RecomputeOperatorWebhookDeliverySignatureInputSchema,
);
const decodeReasonCatalogId = Schema.decodeUnknown(ReasonCatalogIdSchema);
const decodeSignatureHeader = Schema.decodeUnknown(
  OperatorWebhookDeliverySignatureHeaderSchema,
);

const requireActorId = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  requestContext.actorId === undefined
    ? Effect.fail(
        new OperatorWebhookDeliveryMissingActorIdentity({ operation }),
      )
    : Effect.succeed(requestContext.actorId);

const requirePlatformOperator = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    const actorId = yield* requireActorId(requestContext, operation);
    if (requestContext.actorType !== actorType.platformOperator) {
      return yield* Effect.fail(
        new OperatorWebhookDeliveryUnauthorized({
          operation,
          requestingActorId: actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return actorId;
  });

const operationAuditAction: {
  readonly [K in "replay" | "retry" | "cancel"]: AuditAction;
} = {
  replay: operatorWebhookDeliveryAuditAction.replayed,
  retry: operatorWebhookDeliveryAuditAction.retried,
  cancel: operatorWebhookDeliveryAuditAction.canceled,
};

const validateReason = (
  operation: "replay" | "retry" | "cancel",
  value: string,
): Effect.Effect<
  ReasonCatalogId,
  | OperatorWebhookDeliveryReasonNotInCatalog
  | OperatorWebhookDeliveryReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new OperatorWebhookDeliveryReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      const action = operationAuditAction[operation];
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new OperatorWebhookDeliveryReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

/**
 * Registry-driven attachment enforcement. Replays gate against
 * `reasonCatalogId.operatorWebhookDeliveryReplay`
 * (`requiresAttachment: true`); retry/cancel reasons are
 * attachment-free in the catalog so this helper short-circuits.
 * Whitespace-only attachment text is rejected even though the
 * contract schema enforces `Schema.NonEmptyString`.
 */
const requireAttachmentIfNeeded = (
  operation: "replay" | "retry" | "cancel",
  reasonId: ReasonCatalogId,
  attachmentText: string,
): Effect.Effect<void, OperatorWebhookDeliveryReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText.trim().length === 0) {
    return Effect.fail(
      new OperatorWebhookDeliveryReasonAttachmentRequired({
        operation,
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

const appendAuditEvent = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: RequestContext;
    readonly action: (typeof operatorWebhookDeliveryAuditAction)[keyof typeof operatorWebhookDeliveryAuditAction];
    readonly target: string;
    readonly reason: (typeof reasonCatalogId)[keyof typeof reasonCatalogId];
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.operatorWebhookDelivery,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

const truncateToByteCap = (value: string, maxBytes: number): string => {
  if (maxBytes <= 0) return "";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");
  const encoded = encoder.encode(value);
  if (encoded.length <= maxBytes) return value;
  // Safe-decode the byte prefix; replacement chars cover split codepoints.
  const sliced = encoded.slice(0, maxBytes);
  return decoder.decode(sliced);
};

const buildSignatureHeader = (
  timestampUnixSeconds: number,
  signatureHex: string,
): string => `t=${timestampUnixSeconds},v1=${signatureHex}`;

const isoSecondsToUnix = (iso: string): number =>
  Math.floor(new Date(iso).getTime() / 1000);

// Insertion-ordered LRU-by-insertion cache for the replay-guard fast
// path. Map preserves insertion order; eviction removes the oldest
// entry when the cache exceeds `maxSize`.
type DeliveryCache = {
  readonly get: (key: string) => OperatorWebhookDelivery | undefined;
  readonly set: (key: string, delivery: OperatorWebhookDelivery) => void;
  readonly delete: (key: string) => void;
  readonly size: () => number;
};

const createDeliveryCache = (maxSize: number): DeliveryCache => {
  const store = new Map<string, OperatorWebhookDelivery>();
  return {
    get: (key) => store.get(key),
    set: (key, delivery) => {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }
      store.set(key, delivery);
    },
    delete: (key) => {
      store.delete(key);
    },
    size: () => store.size,
  };
};

const cacheKey = (subscriptionId: string, payloadHash: string) =>
  `${subscriptionId}|${payloadHash}`;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export type OperatorWebhookDeliveryServiceDependencies = {
  readonly repository: OperatorWebhookDeliveryRepositoryService;
  readonly auditLog: AuditLogModuleService;
  readonly secretProvider: OperatorWebhookSubscriptionSecretProvider;
  readonly isSubscriptionOwner: OperatorWebhookSubscriptionOwnerCheck;
  readonly bounds: OperatorWebhookDeliveryRuntimeBounds;
  readonly now?: () => Date;
};

export const makeOperatorWebhookDeliveryService = (
  deps: OperatorWebhookDeliveryServiceDependencies,
): OperatorWebhookDeliveryServiceImpl => {
  const { repository, auditLog, secretProvider, isSubscriptionOwner, bounds } =
    deps;
  const nowFn = deps.now ?? (() => new Date());
  const cache = createDeliveryCache(Math.max(1, bounds.cacheMaxSize));

  const enqueueDelivery: OperatorWebhookDeliveryServiceImpl["enqueueDelivery"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeEnqueueInput(input);
        yield* requireActorId(decoded.requestContext, "enqueue");

        const payloadHash = canonicalPayloadHash(decoded.delivery.requestBody);
        const now = nowFn();

        // Replay-guard fast path: bounded in-memory cache.
        const cached = cache.get(
          cacheKey(decoded.delivery.subscriptionId, payloadHash),
        );
        if (
          cached !== undefined &&
          isReplayGuardHit(
            cached,
            true,
            now.getTime(),
            bounds.replayGuardWindowMinutes,
          )
        ) {
          yield* appendAuditEvent(auditLog, {
            requestContext: decoded.requestContext,
            action: operatorWebhookDeliveryAuditAction.replayGuardShortCircuit,
            target: cached.id,
            reason: reasonCatalogId.operatorWebhookDeliveryReplay,
          });
          return yield* Effect.fail(
            new OperatorWebhookDeliveryReplayGuardHit({
              subscriptionId: decoded.delivery.subscriptionId,
              payloadHash,
              existingDeliveryId: cached.id,
            }),
          );
        }

        // Replay-guard durable check via the repository.
        const recent = yield* repository.findRecentByPayloadHash({
          subscriptionId: decoded.delivery.subscriptionId,
          payloadHash,
        });
        if (Option.isSome(recent)) {
          const existing = recent.value;
          if (
            isReplayGuardHit(
              existing,
              true,
              now.getTime(),
              bounds.replayGuardWindowMinutes,
            )
          ) {
            cache.set(
              cacheKey(decoded.delivery.subscriptionId, payloadHash),
              existing,
            );
            yield* appendAuditEvent(auditLog, {
              requestContext: decoded.requestContext,
              action:
                operatorWebhookDeliveryAuditAction.replayGuardShortCircuit,
              target: existing.id,
              reason: reasonCatalogId.operatorWebhookDeliveryReplay,
            });
            return yield* Effect.fail(
              new OperatorWebhookDeliveryReplayGuardHit({
                subscriptionId: decoded.delivery.subscriptionId,
                payloadHash,
                existingDeliveryId: existing.id,
              }),
            );
          }
        }

        const secret = yield* secretProvider(decoded.delivery.subscriptionId);
        const signatureTimestamp = now.toISOString();
        const signatureUnix = isoSecondsToUnix(signatureTimestamp);
        const signatureHex = computeSignatureHex(
          secret,
          signatureUnix,
          decoded.delivery.requestBody,
        );
        // Decode-validate the canonical header value so callers
        // cannot bypass the wire format invariant.
        yield* decodeSignatureHeader(
          buildSignatureHeader(signatureUnix, signatureHex),
        );

        const created = yield* repository.enqueue({
          subscriptionId: decoded.delivery.subscriptionId,
          targetTenant: decoded.delivery.targetTenant,
          eventType: decoded.delivery.eventType,
          requestUrl: decoded.delivery.requestUrl,
          requestBody: decoded.delivery.requestBody,
          payloadHash,
          signature: signatureHex,
          signatureTimestamp,
          enqueuedAt: signatureTimestamp,
          correlationId: decoded.requestContext.correlationId,
        });

        cache.set(
          cacheKey(decoded.delivery.subscriptionId, payloadHash),
          created,
        );

        yield* appendAuditEvent(auditLog, {
          requestContext: decoded.requestContext,
          action: operatorWebhookDeliveryAuditAction.enqueued,
          target: created.id,
          reason: reasonCatalogId.operatorWebhookDeliveryReplay,
        });

        return created;
      });

  const getDelivery: OperatorWebhookDeliveryServiceImpl["getDelivery"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetInput(input);
      yield* requireActorId(decoded.requestContext, "get");
      return yield* repository.getById(decoded.id);
    });

  const listDeliveries: OperatorWebhookDeliveryServiceImpl["listDeliveries"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListInput(input);
      yield* requirePlatformOperator(decoded.requestContext, "list");
      return yield* repository.listByFilter(decoded.filter);
    });

  const replayDelivery: OperatorWebhookDeliveryServiceImpl["replayDelivery"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeReplayInput(input);
      yield* requirePlatformOperator(decoded.requestContext, "replay");
      const replayReason = yield* validateReason(
        "replay",
        decoded.replay.replayReasonCatalogId,
      );
      yield* requireAttachmentIfNeeded(
        "replay",
        replayReason,
        decoded.replay.reasonAttachmentText,
      );

      const existingOption = yield* repository.getById(decoded.replay.id);
      if (Option.isNone(existingOption)) {
        return yield* Effect.fail(
          new OperatorWebhookDeliveryNotFound({ id: decoded.replay.id }),
        );
      }
      const existing = existingOption.value;

      // Compute fresh signature for the replacement row.
      const secret = yield* secretProvider(existing.subscriptionId);
      const now = nowFn();
      const signatureTimestamp = now.toISOString();
      const signatureUnix = isoSecondsToUnix(signatureTimestamp);
      const signatureHex = computeSignatureHex(
        secret,
        signatureUnix,
        existing.requestBody,
      );
      const payloadHash = canonicalPayloadHash(existing.requestBody);

      const replacement = yield* repository.enqueue({
        subscriptionId: existing.subscriptionId,
        targetTenant: existing.targetTenant,
        eventType: existing.eventType,
        requestUrl: existing.requestUrl,
        requestBody: existing.requestBody,
        payloadHash,
        signature: signatureHex,
        signatureTimestamp,
        enqueuedAt: signatureTimestamp,
        replayOfDeliveryId: existing.id,
        correlationId: decoded.requestContext.correlationId,
      });

      // Best-effort mark the parent replaced; ignore terminal-state
      // collisions so an operator replay over an already-delivered
      // row still creates the replacement without surfacing as a
      // failure (audit captures both rows).
      yield* repository.markReplaced({ id: existing.id }).pipe(
        Effect.catchTag(
          "OperatorWebhookDeliveryAlreadyTerminalError",
          () => Effect.void,
        ),
        Effect.catchTag(
          "OperatorWebhookDeliveryNotFoundError",
          () => Effect.void,
        ),
      );

      // Evict any cached entry for the (subscriptionId, payloadHash)
      // pair so the replacement is the canonical recent row.
      cache.delete(cacheKey(existing.subscriptionId, payloadHash));
      cache.set(
        cacheKey(replacement.subscriptionId, replacement.payloadHash),
        replacement,
      );

      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: operatorWebhookDeliveryAuditAction.replayed,
        target: replacement.id,
        reason: reasonCatalogId.operatorWebhookDeliveryReplay,
      });

      return replacement;
    });

  const retryDelivery: OperatorWebhookDeliveryServiceImpl["retryDelivery"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeRetryInput(input);
      yield* requirePlatformOperator(decoded.requestContext, "retry");
      yield* validateReason("retry", decoded.retry.retryReasonCatalogId);

      const existingOption = yield* repository.getById(decoded.retry.id);
      if (Option.isNone(existingOption)) {
        return yield* Effect.fail(
          new OperatorWebhookDeliveryNotFound({ id: decoded.retry.id }),
        );
      }
      const existing = existingOption.value;

      const nextAttemptCount = existing.attemptCount + 1;
      const now = nowFn();
      const nowIso = now.toISOString();

      // Attempt-budget enforcement: > maxAttempts collapses to
      // `exhausted` via the idempotent repository transition.
      if (nextAttemptCount > bounds.maxAttempts) {
        const exhausted = yield* repository.markExhausted({
          id: existing.id,
          attemptCount: existing.attemptCount,
          lastAttemptAt: nowIso,
          lastErrorMessage: `attempt budget exceeded (maxAttempts=${bounds.maxAttempts})`,
        });
        yield* appendAuditEvent(auditLog, {
          requestContext: decoded.requestContext,
          action: operatorWebhookDeliveryAuditAction.exhausted,
          target: existing.id,
          reason: reasonCatalogId.operatorWebhookDeliveryRetry,
        });
        return yield* Effect.fail(
          new OperatorWebhookDeliveryAttemptBudgetExceeded({
            id: exhausted.id,
            attemptCount: exhausted.attemptCount,
            maxAttempts: bounds.maxAttempts,
          }),
        );
      }

      const backoffSeconds = computeBackoffSeconds(
        nextAttemptCount,
        bounds.backoffBaseSeconds,
      );
      const nextAttemptAt = new Date(
        now.getTime() + backoffSeconds * 1000,
      ).toISOString();

      const recorded = yield* repository.recordAttempt({
        id: existing.id,
        attemptCount: nextAttemptCount,
        lastAttemptAt: nowIso,
        nextAttemptAt,
        lastErrorMessage: "operator-requested retry scheduled",
      });

      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: operatorWebhookDeliveryAuditAction.retried,
        target: recorded.id,
        reason: reasonCatalogId.operatorWebhookDeliveryRetry,
      });

      return recorded;
    });

  const cancelDelivery: OperatorWebhookDeliveryServiceImpl["cancelDelivery"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeCancelInput(input);
      const actorId = yield* requireActorId(decoded.requestContext, "cancel");
      yield* validateReason("cancel", decoded.cancel.cancelReasonCatalogId);

      const existingOption = yield* repository.getById(decoded.cancel.id);
      if (Option.isNone(existingOption)) {
        return yield* Effect.fail(
          new OperatorWebhookDeliveryNotFound({ id: decoded.cancel.id }),
        );
      }
      const existing = existingOption.value;

      const isPlatformOperator =
        decoded.requestContext.actorType === actorType.platformOperator;
      const isOwner = isPlatformOperator
        ? true
        : yield* isSubscriptionOwner({
            subscriptionId: existing.subscriptionId,
            actorId,
          });
      if (!isPlatformOperator && !isOwner) {
        return yield* Effect.fail(
          new OperatorWebhookDeliveryUnauthorized({
            operation: "cancel",
            requestingActorId: actorId,
            requestingActorType: decoded.requestContext.actorType,
          }),
        );
      }

      const canceled = yield* repository.markCanceled({ id: existing.id });

      // Evict the cached entry so a fresh enqueue is not
      // short-circuited by the canceled row.
      cache.delete(cacheKey(canceled.subscriptionId, canceled.payloadHash));

      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: operatorWebhookDeliveryAuditAction.canceled,
        target: canceled.id,
        reason: reasonCatalogId.operatorWebhookDeliveryCancel,
      });

      return canceled;
    });

  const recomputeSignatureHeader: OperatorWebhookDeliveryServiceImpl["recomputeSignatureHeader"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeRecomputeSignatureInput(input);
        yield* requirePlatformOperator(
          decoded.requestContext,
          "recomputeSignature",
        );

        const existingOption = yield* repository.getById(decoded.id);
        if (Option.isNone(existingOption)) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFound({ id: decoded.id }),
          );
        }
        const existing = existingOption.value;

        const now = nowFn();
        const signatureUnix = isoSecondsToUnix(existing.signatureTimestamp);
        const ageSeconds = Math.max(
          0,
          Math.floor(now.getTime() / 1000) - signatureUnix,
        );
        if (ageSeconds > bounds.signatureFreshnessSeconds) {
          return yield* Effect.fail(
            new OperatorWebhookDeliverySignatureRecomputeStale({
              id: existing.id,
              signatureTimestamp: existing.signatureTimestamp,
              freshnessSeconds: bounds.signatureFreshnessSeconds,
            }),
          );
        }

        const secret = yield* secretProvider(existing.subscriptionId);
        const signatureHex = computeSignatureHex(
          secret,
          signatureUnix,
          existing.requestBody,
        );
        return yield* decodeSignatureHeader(
          buildSignatureHeader(signatureUnix, signatureHex),
        );
      });

  return {
    enqueueDelivery,
    getDelivery,
    listDeliveries,
    replayDelivery,
    retryDelivery,
    cancelDelivery,
    recomputeSignatureHeader,
  };
};

// Exported for tests that want to exercise body truncation directly.
export const truncateOperatorWebhookResponseBody = truncateToByteCap;
export const buildOperatorWebhookSignatureHeader = buildSignatureHeader;

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type OperatorWebhookDeliveryServiceLayerDependencies = {
  readonly secretProvider: OperatorWebhookSubscriptionSecretProvider;
  readonly isSubscriptionOwner: OperatorWebhookSubscriptionOwnerCheck;
  readonly bounds: OperatorWebhookDeliveryRuntimeBounds;
};

export const makeOperatorWebhookDeliveryServiceLayer = (
  deps: OperatorWebhookDeliveryServiceLayerDependencies,
) =>
  Layer.effect(
    OperatorWebhookDeliveryService,
    Effect.gen(function* () {
      const repository = yield* OperatorWebhookDeliveryRepository;
      const auditLog = yield* AuditLogModule;
      return makeOperatorWebhookDeliveryService({
        repository,
        auditLog,
        secretProvider: deps.secretProvider,
        isSubscriptionOwner: deps.isSubscriptionOwner,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const OperatorWebhookDeliveryProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  OPERATOR_WEBHOOK_DELIVERY_MAX_ATTEMPTS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  OPERATOR_WEBHOOK_DELIVERY_BACKOFF_BASE_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  OPERATOR_WEBHOOK_DELIVERY_REPLAY_GUARD_WINDOW_MINUTES:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  OPERATOR_WEBHOOK_DELIVERY_SIGNATURE_FRESHNESS_SECONDS:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  OPERATOR_WEBHOOK_DELIVERY_RESPONSE_BODY_SNIPPET_MAX_BYTES:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  OPERATOR_WEBHOOK_DELIVERY_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  OPERATOR_WEBHOOK_DELIVERY_SUBSCRIPTION_SECRET_PROVIDER: Schema.NonEmptyString,
});

const decodeOperatorWebhookDeliveryProcessEnvironment = Schema.decodeUnknown(
  OperatorWebhookDeliveryProcessEnvironmentSchema,
);

export type OperatorWebhookDeliveryRuntimeOptions = {
  readonly postgresUrl: string;
  readonly bounds: OperatorWebhookDeliveryRuntimeBounds;
  readonly subscriptionSecretProviderId: string;
};

const resolveOperatorWebhookDeliveryRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeOperatorWebhookDeliveryProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): OperatorWebhookDeliveryRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        bounds: {
          maxAttempts: resolved.OPERATOR_WEBHOOK_DELIVERY_MAX_ATTEMPTS,
          backoffBaseSeconds:
            resolved.OPERATOR_WEBHOOK_DELIVERY_BACKOFF_BASE_SECONDS,
          replayGuardWindowMinutes:
            resolved.OPERATOR_WEBHOOK_DELIVERY_REPLAY_GUARD_WINDOW_MINUTES,
          signatureFreshnessSeconds:
            resolved.OPERATOR_WEBHOOK_DELIVERY_SIGNATURE_FRESHNESS_SECONDS,
          responseBodySnippetMaxBytes:
            resolved.OPERATOR_WEBHOOK_DELIVERY_RESPONSE_BODY_SNIPPET_MAX_BYTES,
          cacheMaxSize: resolved.OPERATOR_WEBHOOK_DELIVERY_CACHE_MAX_SIZE,
        },
        subscriptionSecretProviderId:
          resolved.OPERATOR_WEBHOOK_DELIVERY_SUBSCRIPTION_SECRET_PROVIDER,
      }),
    ),
  );

// The local-dev runtime treats the env-supplied provider identifier
// as the shared HMAC secret for every subscription. The operator
// MUST set the env key — no synthesis — and the production runtime
// will swap this for a Vault-backed provider keyed by subscription
// once the secret store wiring lands (admin-app implementation plan
// §9 item 6 follow-up).
const buildStaticSubscriptionSecretProvider =
  (staticSecret: string): OperatorWebhookSubscriptionSecretProvider =>
  (_subscriptionId) =>
    Effect.succeed(staticSecret);

// Conservative default: only platform-operator actors may cancel
// until the per-tenant subscription-owner registry lands. The HTTP
// transport still surfaces `OperatorWebhookDeliveryUnauthorized`
// for non-operators, and the service falls back to the platform-
// operator branch automatically.
const denySubscriptionOwnerCheck: OperatorWebhookSubscriptionOwnerCheck = () =>
  Effect.succeed(false);

const makeOperatorWebhookDeliveryRuntime = (
  options: OperatorWebhookDeliveryRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const baseLayer = Layer.mergeAll(
      makeOperatorWebhookDeliveryRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
    );
    const serviceLayer = makeOperatorWebhookDeliveryServiceLayer({
      bounds: options.bounds,
      secretProvider: buildStaticSubscriptionSecretProvider(
        options.subscriptionSecretProviderId,
      ),
      isSubscriptionOwner: denySubscriptionOwnerCheck,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type OperatorWebhookDeliveryRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runOperatorWebhookDeliveryFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: OperatorWebhookDeliveryServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | OperatorWebhookDeliveryRuntimeError> =>
  resolveOperatorWebhookDeliveryRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeOperatorWebhookDeliveryRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(OperatorWebhookDeliveryService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
