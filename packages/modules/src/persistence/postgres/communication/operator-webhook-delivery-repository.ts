/**
 * Operator-facing webhook delivery envelope Postgres repository
 * per admin-app implementation plan §9 item 6.
 *
 * Boundary-decodes rows into the typed `OperatorWebhookDelivery`
 * contract. Owns no business logic — signature scheme, replay-guard
 * window, attempt-budget, backoff, response-body cap, and actor
 * authorization live in the platform service
 * (`OperatorWebhookDeliveryService`). The repository only enforces
 * atomic terminal-state transitions:
 *
 *   - `markDelivered` / `markFailed` reject with
 *     {@link OperatorWebhookDeliveryAlreadyTerminalError} when the
 *     row is already in a terminal status, computed inside the
 *     conditional UPDATE so concurrent dispatcher attempts cannot
 *     both succeed.
 *   - `markExhausted` is idempotent on the `exhausted` terminal
 *     status — re-marking an already-exhausted row succeeds and
 *     returns the existing row so the bounded retry sweep can be
 *     replayed safely.
 *   - `markReplaced` flips a pending row to `replayed` when an
 *     operator creates a replacement; the replacement row owns the
 *     new delivery and is created via a separate `enqueue` call.
 *   - `markCanceled` flips a pending row to `canceled`.
 */
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  OperatorWebhookDeliverySchema,
  operatorWebhookDeliveryStatus,
  PlatformScopeSchema,
  type OperatorWebhookDelivery,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../database";
import { operatorWebhookDeliveriesTable } from "./operator-webhook-delivery";

type OperatorWebhookDeliveryDatabase = PostgresDatabase;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class OperatorWebhookDeliveryPersistenceError {
  readonly _tag = "OperatorWebhookDeliveryPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "enqueue"
        | "recordAttempt"
        | "markDelivered"
        | "markFailed"
        | "markExhausted"
        | "markReplaced"
        | "markCanceled";
      readonly cause: unknown;
    },
  ) {}
}

export class OperatorWebhookDeliveryQueryError {
  readonly _tag = "OperatorWebhookDeliveryQueryError" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "getById"
        | "listByFilter"
        | "findRecentByPayloadHash";
      readonly cause: unknown;
    },
  ) {}
}

export class OperatorWebhookDeliveryNotFoundError {
  readonly _tag = "OperatorWebhookDeliveryNotFoundError" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export class OperatorWebhookDeliveryAlreadyTerminalError {
  readonly _tag = "OperatorWebhookDeliveryAlreadyTerminalError" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly currentStatus: string;
    },
  ) {}
}

export type OperatorWebhookDeliveryRepositoryError =
  | ParseResult.ParseError
  | OperatorWebhookDeliveryPersistenceError
  | OperatorWebhookDeliveryQueryError
  | OperatorWebhookDeliveryNotFoundError
  | OperatorWebhookDeliveryAlreadyTerminalError;

// ---------------------------------------------------------------------------
// Repository inputs (persistence layer — typed, narrow)
// ---------------------------------------------------------------------------

export const EnqueueOperatorWebhookDeliveryRepositoryInputSchema =
  Schema.Struct({
    subscriptionId: Schema.NonEmptyString,
    targetTenant: Schema.Struct({
      scope: PlatformScopeSchema,
      scopeId: Schema.NonEmptyString,
    }),
    eventType: Schema.NonEmptyString,
    requestUrl: Schema.NonEmptyString,
    requestBody: Schema.NonEmptyString,
    payloadHash: Schema.NonEmptyString,
    signature: Schema.NonEmptyString,
    signatureTimestamp: Schema.NonEmptyString,
    enqueuedAt: Schema.NonEmptyString,
    nextAttemptAt: Schema.optional(Schema.NonEmptyString),
    replayOfDeliveryId: Schema.optional(Schema.NonEmptyString),
    correlationId: Schema.NonEmptyString,
  });

export type EnqueueOperatorWebhookDeliveryRepositoryInput = Schema.Schema.Type<
  typeof EnqueueOperatorWebhookDeliveryRepositoryInputSchema
>;

export type OperatorWebhookDeliveryListFilterRepositoryInput = {
  readonly subscriptionId?: string | undefined;
  readonly status?: OperatorWebhookDelivery["status"] | undefined;
  readonly targetTenant?: OperatorWebhookDelivery["targetTenant"] | undefined;
  readonly limit?: number | undefined;
};

export type RecordAttemptRepositoryInput = {
  readonly id: string;
  readonly attemptCount: number;
  readonly lastAttemptAt: string;
  readonly nextAttemptAt?: string;
  readonly lastResponseStatus?: number;
  readonly lastResponseBodySnippet?: string;
  readonly lastErrorMessage?: string;
};

export type MarkDeliveredRepositoryInput = {
  readonly id: string;
  readonly attemptCount: number;
  readonly lastAttemptAt: string;
  readonly lastResponseStatus: number;
  readonly lastResponseBodySnippet?: string;
};

export type MarkFailedRepositoryInput = {
  readonly id: string;
  readonly attemptCount: number;
  readonly lastAttemptAt: string;
  readonly nextAttemptAt: string;
  readonly lastResponseStatus?: number;
  readonly lastResponseBodySnippet?: string;
  readonly lastErrorMessage: string;
};

export type MarkExhaustedRepositoryInput = {
  readonly id: string;
  readonly attemptCount: number;
  readonly lastAttemptAt: string;
  readonly lastErrorMessage: string;
};

export type MarkReplacedRepositoryInput = {
  readonly id: string;
};

export type MarkCanceledRepositoryInput = {
  readonly id: string;
};

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

type OperatorWebhookDeliveryRow =
  typeof operatorWebhookDeliveriesTable.$inferSelect;

const decodeOperatorWebhookDelivery = Schema.decodeUnknown(
  OperatorWebhookDeliverySchema,
);

const decodeRow = (row: OperatorWebhookDeliveryRow) =>
  decodeOperatorWebhookDelivery({
    id: row.id,
    subscriptionId: row.subscriptionId,
    targetTenant: {
      scope: row.targetTenantScope,
      scopeId: row.targetTenantScopeId,
    },
    eventType: row.eventType,
    requestUrl: row.requestUrl,
    requestMethod: row.requestMethod,
    requestBody: row.requestBody,
    payloadHash: row.payloadHash,
    signature: row.signature,
    signatureTimestamp: row.signatureTimestamp.toISOString(),
    status: row.status,
    attemptCount: row.attemptCount,
    enqueuedAt: row.enqueuedAt.toISOString(),
    ...(row.nextAttemptAt === null
      ? {}
      : { nextAttemptAt: row.nextAttemptAt.toISOString() }),
    ...(row.lastAttemptAt === null
      ? {}
      : { lastAttemptAt: row.lastAttemptAt.toISOString() }),
    ...(row.lastResponseStatus === null
      ? {}
      : { lastResponseStatus: row.lastResponseStatus }),
    ...(row.lastResponseBodySnippet === null
      ? {}
      : { lastResponseBodySnippet: row.lastResponseBodySnippet }),
    ...(row.lastErrorMessage === null
      ? {}
      : { lastErrorMessage: row.lastErrorMessage }),
    ...(row.replayOfDeliveryId === null
      ? {}
      : { replayOfDeliveryId: row.replayOfDeliveryId }),
    correlationId: row.correlationId,
  });

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type OperatorWebhookDeliveryRepositoryService = {
  readonly enqueue: (
    input: EnqueueOperatorWebhookDeliveryRepositoryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly getById: (
    id: string,
  ) => Effect.Effect<
    Option.Option<OperatorWebhookDelivery>,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly listByFilter: (
    input: OperatorWebhookDeliveryListFilterRepositoryInput,
  ) => Effect.Effect<
    ReadonlyArray<OperatorWebhookDelivery>,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly findRecentByPayloadHash: (input: {
    readonly subscriptionId: string;
    readonly payloadHash: string;
  }) => Effect.Effect<
    Option.Option<OperatorWebhookDelivery>,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly recordAttempt: (
    input: RecordAttemptRepositoryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly markDelivered: (
    input: MarkDeliveredRepositoryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly markFailed: (
    input: MarkFailedRepositoryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly markExhausted: (
    input: MarkExhaustedRepositoryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly markReplaced: (
    input: MarkReplacedRepositoryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryRepositoryError
  >;
  readonly markCanceled: (
    input: MarkCanceledRepositoryInput,
  ) => Effect.Effect<
    OperatorWebhookDelivery,
    OperatorWebhookDeliveryRepositoryError
  >;
};

export class OperatorWebhookDeliveryRepository extends Context.Tag(
  "OperatorWebhookDeliveryRepository",
)<
  OperatorWebhookDeliveryRepository,
  OperatorWebhookDeliveryRepositoryService
>() {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: OperatorWebhookDeliveryQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, OperatorWebhookDeliveryQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new OperatorWebhookDeliveryQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: OperatorWebhookDeliveryPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, OperatorWebhookDeliveryPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new OperatorWebhookDeliveryPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate operator-webhook-delivery identifiers",
  );
};

const selectById = (database: OperatorWebhookDeliveryDatabase, id: string) =>
  tryQuery("getById", () =>
    database
      .select()
      .from(operatorWebhookDeliveriesTable)
      .where(eq(operatorWebhookDeliveriesTable.id, id)),
  ).pipe(Effect.map((rows) => rows.find((row) => row.id === id)));

const terminalStatuses: ReadonlyArray<string> = [
  operatorWebhookDeliveryStatus.delivered,
  operatorWebhookDeliveryStatus.exhausted,
  operatorWebhookDeliveryStatus.replayed,
  operatorWebhookDeliveryStatus.canceled,
];

const isTerminal = (status: string) => terminalStatuses.includes(status);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeOperatorWebhookDeliveryRepository = (
  database: OperatorWebhookDeliveryDatabase,
) =>
  Effect.succeed<OperatorWebhookDeliveryRepositoryService>({
    enqueue: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          EnqueueOperatorWebhookDeliveryRepositoryInputSchema,
        )(input);
        const id = generateUuid();
        yield* tryPersist("enqueue", () =>
          database
            .insert(operatorWebhookDeliveriesTable)
            .values({
              id,
              subscriptionId: decoded.subscriptionId,
              targetTenantScope: decoded.targetTenant.scope,
              targetTenantScopeId: decoded.targetTenant.scopeId,
              eventType: decoded.eventType,
              requestUrl: decoded.requestUrl,
              requestMethod: "POST",
              requestBody: decoded.requestBody,
              payloadHash: decoded.payloadHash,
              signature: decoded.signature,
              signatureTimestamp: new Date(decoded.signatureTimestamp),
              status: operatorWebhookDeliveryStatus.pending,
              attemptCount: 0,
              enqueuedAt: new Date(decoded.enqueuedAt),
              nextAttemptAt:
                decoded.nextAttemptAt === undefined
                  ? null
                  : new Date(decoded.nextAttemptAt),
              lastAttemptAt: null,
              lastResponseStatus: null,
              lastResponseBodySnippet: null,
              lastErrorMessage: null,
              replayOfDeliveryId: decoded.replayOfDeliveryId ?? null,
              correlationId: decoded.correlationId,
            })
            .execute(),
        );
        const inserted = yield* selectById(database, id);
        if (inserted === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryPersistenceError({
              operation: "enqueue",
              cause: new Error(
                "operator-webhook-delivery insert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeRow(inserted);
      }),

    getById: (id) =>
      selectById(database, id).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<OperatorWebhookDelivery>())
            : decodeRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    listByFilter: (input) =>
      tryQuery("listByFilter", () =>
        database.select().from(operatorWebhookDeliveriesTable).where(undefined),
      ).pipe(
        Effect.flatMap((rows) => {
          const filtered = rows
            .filter((row) =>
              input.subscriptionId === undefined
                ? true
                : row.subscriptionId === input.subscriptionId,
            )
            .filter((row) =>
              input.status === undefined ? true : row.status === input.status,
            )
            .filter((row) =>
              input.targetTenant === undefined
                ? true
                : row.targetTenantScope === input.targetTenant.scope &&
                  row.targetTenantScopeId === input.targetTenant.scopeId,
            )
            .sort(
              (left, right) =>
                right.enqueuedAt.getTime() - left.enqueuedAt.getTime(),
            );
          const bounded =
            input.limit === undefined
              ? filtered
              : filtered.slice(0, input.limit);
          return Effect.forEach(bounded, decodeRow, { concurrency: 1 });
        }),
      ),

    findRecentByPayloadHash: (input) =>
      tryQuery("findRecentByPayloadHash", () =>
        database
          .select()
          .from(operatorWebhookDeliveriesTable)
          .where(
            and(
              eq(
                operatorWebhookDeliveriesTable.subscriptionId,
                input.subscriptionId,
              ),
              eq(operatorWebhookDeliveriesTable.payloadHash, input.payloadHash),
            ),
          ),
      ).pipe(
        Effect.flatMap((rows) => {
          const matching = rows
            .filter(
              (row) =>
                row.subscriptionId === input.subscriptionId &&
                row.payloadHash === input.payloadHash,
            )
            .sort(
              (left, right) =>
                right.enqueuedAt.getTime() - left.enqueuedAt.getTime(),
            );
          const first = matching[0];
          return first === undefined
            ? Effect.succeed(Option.none<OperatorWebhookDelivery>())
            : decodeRow(first).pipe(Effect.map(Option.some));
        }),
      ),

    recordAttempt: (input) =>
      Effect.gen(function* () {
        const existing = yield* selectById(database, input.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        if (isTerminal(existing.status)) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        const rows = yield* tryPersist("recordAttempt", () =>
          database
            .update(operatorWebhookDeliveriesTable)
            .set({
              attemptCount: input.attemptCount,
              lastAttemptAt: new Date(input.lastAttemptAt),
              nextAttemptAt:
                input.nextAttemptAt === undefined
                  ? null
                  : new Date(input.nextAttemptAt),
              lastResponseStatus:
                input.lastResponseStatus === undefined
                  ? null
                  : input.lastResponseStatus,
              lastResponseBodySnippet:
                input.lastResponseBodySnippet === undefined
                  ? null
                  : input.lastResponseBodySnippet,
              lastErrorMessage:
                input.lastErrorMessage === undefined
                  ? null
                  : input.lastErrorMessage,
            })
            .where(
              and(
                eq(operatorWebhookDeliveriesTable.id, input.id),
                eq(
                  operatorWebhookDeliveriesTable.status,
                  operatorWebhookDeliveryStatus.pending,
                ),
              ),
            )
            .returning(),
        );
        const row = rows.find((entry) => entry.id === input.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        return yield* decodeRow(row);
      }),

    markDelivered: (input) =>
      Effect.gen(function* () {
        const existing = yield* selectById(database, input.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        if (isTerminal(existing.status)) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        const rows = yield* tryPersist("markDelivered", () =>
          database
            .update(operatorWebhookDeliveriesTable)
            .set({
              status: operatorWebhookDeliveryStatus.delivered,
              attemptCount: input.attemptCount,
              lastAttemptAt: new Date(input.lastAttemptAt),
              nextAttemptAt: null,
              lastResponseStatus: input.lastResponseStatus,
              lastResponseBodySnippet:
                input.lastResponseBodySnippet === undefined
                  ? null
                  : input.lastResponseBodySnippet,
              lastErrorMessage: null,
            })
            .where(
              and(
                eq(operatorWebhookDeliveriesTable.id, input.id),
                eq(
                  operatorWebhookDeliveriesTable.status,
                  operatorWebhookDeliveryStatus.pending,
                ),
              ),
            )
            .returning(),
        );
        const row = rows.find((entry) => entry.id === input.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        return yield* decodeRow(row);
      }),

    markFailed: (input) =>
      Effect.gen(function* () {
        const existing = yield* selectById(database, input.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        if (isTerminal(existing.status)) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        const rows = yield* tryPersist("markFailed", () =>
          database
            .update(operatorWebhookDeliveriesTable)
            .set({
              status: operatorWebhookDeliveryStatus.failed,
              attemptCount: input.attemptCount,
              lastAttemptAt: new Date(input.lastAttemptAt),
              nextAttemptAt: new Date(input.nextAttemptAt),
              lastResponseStatus:
                input.lastResponseStatus === undefined
                  ? null
                  : input.lastResponseStatus,
              lastResponseBodySnippet:
                input.lastResponseBodySnippet === undefined
                  ? null
                  : input.lastResponseBodySnippet,
              lastErrorMessage: input.lastErrorMessage,
            })
            .where(eq(operatorWebhookDeliveriesTable.id, input.id))
            .returning(),
        );
        const row = rows.find((entry) => entry.id === input.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        return yield* decodeRow(row);
      }),

    markExhausted: (input) =>
      Effect.gen(function* () {
        const existing = yield* selectById(database, input.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        // Idempotent on the exhausted terminal status — re-marking
        // an already-exhausted row returns the existing row so a
        // retried sweep can complete safely.
        if (existing.status === operatorWebhookDeliveryStatus.exhausted) {
          return yield* decodeRow(existing);
        }
        if (
          isTerminal(existing.status) &&
          existing.status !== operatorWebhookDeliveryStatus.exhausted
        ) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        const rows = yield* tryPersist("markExhausted", () =>
          database
            .update(operatorWebhookDeliveriesTable)
            .set({
              status: operatorWebhookDeliveryStatus.exhausted,
              attemptCount: input.attemptCount,
              lastAttemptAt: new Date(input.lastAttemptAt),
              nextAttemptAt: null,
              lastErrorMessage: input.lastErrorMessage,
            })
            .where(eq(operatorWebhookDeliveriesTable.id, input.id))
            .returning(),
        );
        const row = rows.find((entry) => entry.id === input.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        return yield* decodeRow(row);
      }),

    markReplaced: (input) =>
      Effect.gen(function* () {
        const existing = yield* selectById(database, input.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        if (isTerminal(existing.status)) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        const rows = yield* tryPersist("markReplaced", () =>
          database
            .update(operatorWebhookDeliveriesTable)
            .set({
              status: operatorWebhookDeliveryStatus.replayed,
              nextAttemptAt: null,
            })
            .where(eq(operatorWebhookDeliveriesTable.id, input.id))
            .returning(),
        );
        const row = rows.find((entry) => entry.id === input.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        return yield* decodeRow(row);
      }),

    markCanceled: (input) =>
      Effect.gen(function* () {
        const existing = yield* selectById(database, input.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        if (isTerminal(existing.status)) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryAlreadyTerminalError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        const rows = yield* tryPersist("markCanceled", () =>
          database
            .update(operatorWebhookDeliveriesTable)
            .set({
              status: operatorWebhookDeliveryStatus.canceled,
              nextAttemptAt: null,
            })
            .where(eq(operatorWebhookDeliveriesTable.id, input.id))
            .returning(),
        );
        const row = rows.find((entry) => entry.id === input.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new OperatorWebhookDeliveryNotFoundError({ id: input.id }),
          );
        }
        return yield* decodeRow(row);
      }),
  });

export const makeOperatorWebhookDeliveryRepositoryLayer = (
  database: OperatorWebhookDeliveryDatabase,
) =>
  Layer.effect(
    OperatorWebhookDeliveryRepository,
    makeOperatorWebhookDeliveryRepository(database),
  );
