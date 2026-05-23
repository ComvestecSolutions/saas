/**
 * Operator-facing webhook delivery envelope Postgres persistence
 * tests (admin-app implementation plan §9 item 6). Uses a
 * Map-backed in-memory mock of the Drizzle-shaped `PostgresDatabase`
 * surface to assert:
 *
 *   - enqueue round-trip + boundary-decoded `OperatorWebhookDelivery`
 *   - recordAttempt then markDelivered flips status → delivered
 *   - findRecentByPayloadHash returns the most recent row scoped to
 *     subscriptionId + payloadHash (replay-guard lookup)
 *   - markExhausted is idempotent on the exhausted terminal status
 *   - cross-subscription isolation via findRecentByPayloadHash
 *   - listByFilter applies subscriptionId + status filters and
 *     bounds via `limit`
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { platformScope } from "@comvestec/contracts";
import {
  operatorWebhookDeliveriesTable,
  operatorWebhookDeliveryStatus,
  makeOperatorWebhookDeliveryRepository,
  type EnqueueOperatorWebhookDeliveryRepositoryInput,
  type PostgresDatabase,
} from "@comvestec/modules";

type Row = typeof operatorWebhookDeliveriesTable.$inferSelect;

const createDatabase = () => {
  const rows = new Map<string, Row>();

  let lastUpdatePredicate: ((row: Row) => boolean) | undefined;

  const select = () => ({
    from: <T>(_table: T) => ({
      where: async (_condition: unknown) => [...rows.values()],
    }),
  });

  const insert = (_table: unknown) => ({
    values: (values: unknown) => ({
      execute: async () => {
        const list = Array.isArray(values) ? values : [values];
        for (const value of list) {
          const v = value as Record<string, unknown>;
          const id = v.id as string;
          rows.set(id, {
            id,
            subscriptionId: v.subscriptionId as string,
            targetTenantScope: v.targetTenantScope as string,
            targetTenantScopeId: v.targetTenantScopeId as string,
            eventType: v.eventType as string,
            requestUrl: v.requestUrl as string,
            requestMethod: v.requestMethod as string,
            requestBody: v.requestBody as string,
            payloadHash: v.payloadHash as string,
            signature: v.signature as string,
            signatureTimestamp: v.signatureTimestamp as Date,
            status: v.status as string,
            attemptCount: v.attemptCount as number,
            enqueuedAt: v.enqueuedAt as Date,
            nextAttemptAt: (v.nextAttemptAt as Date | null | undefined) ?? null,
            lastAttemptAt: (v.lastAttemptAt as Date | null | undefined) ?? null,
            lastResponseStatus:
              (v.lastResponseStatus as number | null | undefined) ?? null,
            lastResponseBodySnippet:
              (v.lastResponseBodySnippet as string | null | undefined) ?? null,
            lastErrorMessage:
              (v.lastErrorMessage as string | null | undefined) ?? null,
            replayOfDeliveryId:
              (v.replayOfDeliveryId as string | null | undefined) ?? null,
            correlationId: v.correlationId as string,
          });
        }
      },
      onConflictDoUpdate: () => ({ execute: async () => undefined }),
    }),
  });

  const update = (_table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: (_condition: unknown) => ({
        returning: async () => {
          const matched: Row[] = [];
          for (const [id, row] of rows.entries()) {
            if (
              lastUpdatePredicate !== undefined &&
              !lastUpdatePredicate(row)
            ) {
              continue;
            }
            const next = { ...row, ...values } as Row;
            rows.set(id, next);
            matched.push(next);
          }
          lastUpdatePredicate = undefined;
          return matched;
        },
      }),
    }),
  });

  const database = {
    insert,
    update,
    select,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback({ insert, update }),
  } as unknown as PostgresDatabase;

  return {
    rows,
    database,
    setUpdatePredicate: (predicate: (row: Row) => boolean) => {
      lastUpdatePredicate = predicate;
    },
  };
};

const baseEnqueue = (
  overrides?: Partial<EnqueueOperatorWebhookDeliveryRepositoryInput>,
): EnqueueOperatorWebhookDeliveryRepositoryInput => ({
  subscriptionId: overrides?.subscriptionId ?? "wsub_1",
  targetTenant: overrides?.targetTenant ?? {
    scope: platformScope.organization,
    scopeId: "tenant-acme",
  },
  eventType: overrides?.eventType ?? "billing.subscription.created",
  requestUrl: overrides?.requestUrl ?? "https://example.test/hooks/billing",
  requestBody: overrides?.requestBody ?? '{"hello":"world"}',
  payloadHash: overrides?.payloadHash ?? "a".repeat(64),
  signature: overrides?.signature ?? "b".repeat(64),
  signatureTimestamp:
    overrides?.signatureTimestamp ?? "2026-01-01T00:00:00.000Z",
  enqueuedAt: overrides?.enqueuedAt ?? "2026-01-01T00:00:00.000Z",
  ...(overrides?.nextAttemptAt === undefined
    ? {}
    : { nextAttemptAt: overrides.nextAttemptAt }),
  ...(overrides?.replayOfDeliveryId === undefined
    ? {}
    : { replayOfDeliveryId: overrides.replayOfDeliveryId }),
  correlationId: overrides?.correlationId ?? "corr-1",
});

describe("modules operator-webhook-delivery persistence", () => {
  it("round-trips an enqueued row through enqueue → getById", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOperatorWebhookDeliveryRepository(harness.database),
    );

    const created = await Effect.runPromise(repo.enqueue(baseEnqueue()));
    expect(created.status).toBe(operatorWebhookDeliveryStatus.pending);
    expect(created.subscriptionId).toBe("wsub_1");
    expect(created.attemptCount).toBe(0);
    expect(created.eventType).toBe("billing.subscription.created");

    const got = await Effect.runPromise(repo.getById(created.id));
    expect(Option.isSome(got)).toBe(true);
    if (Option.isSome(got)) {
      expect(got.value.id).toBe(created.id);
      expect(got.value.payloadHash).toBe(baseEnqueue().payloadHash);
    }
  });

  it("recordAttempt then markDelivered flips status to delivered with attemptCount + lastResponseStatus", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOperatorWebhookDeliveryRepository(harness.database),
    );
    const created = await Effect.runPromise(repo.enqueue(baseEnqueue()));

    harness.setUpdatePredicate((row) => row.id === created.id);
    const attempted = await Effect.runPromise(
      repo.recordAttempt({
        id: created.id,
        attemptCount: 1,
        lastAttemptAt: "2026-01-01T00:00:30.000Z",
        nextAttemptAt: "2026-01-01T00:01:00.000Z",
        lastResponseStatus: 502,
        lastErrorMessage: "upstream timeout",
      }),
    );
    expect(attempted.attemptCount).toBe(1);
    expect(attempted.status).toBe(operatorWebhookDeliveryStatus.pending);
    expect(attempted.lastResponseStatus).toBe(502);

    harness.setUpdatePredicate((row) => row.id === created.id);
    const delivered = await Effect.runPromise(
      repo.markDelivered({
        id: created.id,
        attemptCount: 2,
        lastAttemptAt: "2026-01-01T00:01:30.000Z",
        lastResponseStatus: 200,
        lastResponseBodySnippet: "ok",
      }),
    );
    expect(delivered.status).toBe(operatorWebhookDeliveryStatus.delivered);
    expect(delivered.attemptCount).toBe(2);
    expect(delivered.lastResponseStatus).toBe(200);
    expect(delivered.lastResponseBodySnippet).toBe("ok");
  });

  it("findRecentByPayloadHash returns the most recent matching delivery scoped to (subscriptionId, payloadHash)", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOperatorWebhookDeliveryRepository(harness.database),
    );

    const first = await Effect.runPromise(
      repo.enqueue(
        baseEnqueue({
          payloadHash: "c".repeat(64),
          enqueuedAt: "2026-01-01T00:00:00.000Z",
          correlationId: "corr-a",
        }),
      ),
    );
    const second = await Effect.runPromise(
      repo.enqueue(
        baseEnqueue({
          payloadHash: "c".repeat(64),
          enqueuedAt: "2026-01-01T00:05:00.000Z",
          correlationId: "corr-b",
        }),
      ),
    );
    expect(first.id).not.toBe(second.id);

    const found = await Effect.runPromise(
      repo.findRecentByPayloadHash({
        subscriptionId: "wsub_1",
        payloadHash: "c".repeat(64),
      }),
    );
    expect(Option.isSome(found)).toBe(true);
    if (Option.isSome(found)) {
      expect(found.value.id).toBe(second.id);
    }
  });

  it("markExhausted is idempotent on the exhausted terminal status", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOperatorWebhookDeliveryRepository(harness.database),
    );
    const created = await Effect.runPromise(repo.enqueue(baseEnqueue()));

    harness.setUpdatePredicate((row) => row.id === created.id);
    const exhausted = await Effect.runPromise(
      repo.markExhausted({
        id: created.id,
        attemptCount: 6,
        lastAttemptAt: "2026-01-01T01:00:00.000Z",
        lastErrorMessage: "attempt budget exceeded",
      }),
    );
    expect(exhausted.status).toBe(operatorWebhookDeliveryStatus.exhausted);

    const again = await Effect.runPromise(
      repo.markExhausted({
        id: created.id,
        attemptCount: 6,
        lastAttemptAt: "2026-01-01T02:00:00.000Z",
        lastErrorMessage: "still exhausted",
      }),
    );
    expect(again.status).toBe(operatorWebhookDeliveryStatus.exhausted);
    expect(again.lastAttemptAt).toBe(exhausted.lastAttemptAt);
  });

  it("findRecentByPayloadHash is scoped by subscriptionId (cross-subscription isolation)", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOperatorWebhookDeliveryRepository(harness.database),
    );
    await Effect.runPromise(
      repo.enqueue(
        baseEnqueue({
          subscriptionId: "wsub_1",
          payloadHash: "d".repeat(64),
          correlationId: "corr-iso-1",
        }),
      ),
    );

    const otherSubscription = await Effect.runPromise(
      repo.findRecentByPayloadHash({
        subscriptionId: "wsub_other",
        payloadHash: "d".repeat(64),
      }),
    );
    expect(Option.isNone(otherSubscription)).toBe(true);
  });

  it("listByFilter applies subscriptionId + status filters and limits the result", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOperatorWebhookDeliveryRepository(harness.database),
    );
    const a = await Effect.runPromise(
      repo.enqueue(
        baseEnqueue({
          subscriptionId: "wsub_1",
          payloadHash: "e".repeat(64),
          enqueuedAt: "2026-01-01T00:00:00.000Z",
          correlationId: "corr-l-1",
        }),
      ),
    );
    const b = await Effect.runPromise(
      repo.enqueue(
        baseEnqueue({
          subscriptionId: "wsub_1",
          payloadHash: "f".repeat(64),
          enqueuedAt: "2026-01-01T00:10:00.000Z",
          correlationId: "corr-l-2",
        }),
      ),
    );
    await Effect.runPromise(
      repo.enqueue(
        baseEnqueue({
          subscriptionId: "wsub_2",
          payloadHash: "0".repeat(64),
          enqueuedAt: "2026-01-01T00:20:00.000Z",
          correlationId: "corr-l-3",
        }),
      ),
    );

    const subscribed = await Effect.runPromise(
      repo.listByFilter({ subscriptionId: "wsub_1" }),
    );
    expect(subscribed).toHaveLength(2);
    // Sorted by enqueuedAt DESC
    expect(subscribed[0]?.id).toBe(b.id);
    expect(subscribed[1]?.id).toBe(a.id);

    const limited = await Effect.runPromise(
      repo.listByFilter({ subscriptionId: "wsub_1", limit: 1 }),
    );
    expect(limited).toHaveLength(1);
    expect(limited[0]?.id).toBe(b.id);

    const byStatus = await Effect.runPromise(
      repo.listByFilter({
        subscriptionId: "wsub_1",
        status: operatorWebhookDeliveryStatus.pending,
      }),
    );
    expect(byStatus).toHaveLength(2);
  });
});
