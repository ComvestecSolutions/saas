/**
 * Polar revenue projection snapshot Postgres repository per
 * admin-app implementation plan §9 item 7 (read-only,
 * admin-only).
 *
 * Boundary-decodes rows into the typed `PolarRevenueProjection`
 * contract. Owns no business logic — the snapshot is COMPUTED by
 * the platform service from the Polar adapter and PERSISTED here.
 * The only mutation surface exposed downstream of the service is
 * `backfillRequested`, which results in `upsertSnapshot` being
 * called with a freshly computed envelope. Composite unique
 * `(tenant_scope, tenant_scope_id, billing_period_start)` enforces
 * one snapshot per tenant per billing period; conflicts replace
 * the prior snapshot's derived values atomically.
 *
 * Retention pruning is exposed via `pruneOlderThan` and is bounded
 * by the manifest's `historyRetentionDays` config key.
 */
import { and, eq, lt } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  PlatformScopeSchema,
  PolarRevenueProjectionSchema,
  type PolarRevenueProjection,
  type PolarRevenueProjectionTargetTenant,
} from "@comvestec/contracts";
import type { PostgresDatabase, PostgresDeleteCapability } from "../database";
import { polarRevenueProjectionSnapshotsTable } from "./polar-revenue-projection";

type PolarRevenueProjectionDatabase = PostgresDatabase &
  PostgresDeleteCapability;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class PolarRevenueProjectionPersistenceError {
  readonly _tag = "PolarRevenueProjectionPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation: "upsertSnapshot" | "pruneOlderThan";
      readonly cause: unknown;
    },
  ) {}
}

export class PolarRevenueProjectionQueryError {
  readonly _tag = "PolarRevenueProjectionQueryError" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "getLatestForTenant"
        | "getForTenantAndPeriod"
        | "listForTenant";
      readonly cause: unknown;
    },
  ) {}
}

export class PolarRevenueProjectionNotFoundError {
  readonly _tag = "PolarRevenueProjectionNotFoundError" as const;
  constructor(
    readonly args: {
      readonly tenant: PolarRevenueProjectionTargetTenant;
      readonly billingPeriodStart?: string;
    },
  ) {}
}

export type PolarRevenueProjectionRepositoryError =
  | ParseResult.ParseError
  | PolarRevenueProjectionPersistenceError
  | PolarRevenueProjectionQueryError
  | PolarRevenueProjectionNotFoundError;

// ---------------------------------------------------------------------------
// Repository inputs
// ---------------------------------------------------------------------------

const MoneySchema = Schema.Struct({
  currency: Schema.NonEmptyString.pipe(Schema.pattern(/^[A-Z]{3}$/)),
  amountMinorUnits: Schema.Number.pipe(Schema.int()),
});

export const UpsertPolarRevenueProjectionSnapshotRepositoryInputSchema =
  Schema.Struct({
    tenant: Schema.Struct({
      scope: PlatformScopeSchema,
      scopeId: Schema.NonEmptyString,
    }),
    billingPeriodStart: Schema.NonEmptyString,
    billingPeriodEnd: Schema.NonEmptyString,
    subscriptionMrr: MoneySchema,
    churnRate: Schema.Number.pipe(
      Schema.greaterThanOrEqualTo(0),
      Schema.lessThanOrEqualTo(1),
    ),
    expansion: MoneySchema,
    contraction: MoneySchema,
    projectedNextPeriodRevenue: MoneySchema,
    activeSubscriptionCount: Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(0),
    ),
    sourcePolarAccountId: Schema.NonEmptyString,
    computedAt: Schema.NonEmptyString,
    correlationId: Schema.NonEmptyString,
  });

export type UpsertPolarRevenueProjectionSnapshotRepositoryInput =
  Schema.Schema.Type<
    typeof UpsertPolarRevenueProjectionSnapshotRepositoryInputSchema
  >;

export type ListPolarRevenueProjectionRepositoryInput = {
  readonly tenant: PolarRevenueProjectionTargetTenant;
  readonly limit?: number | undefined;
};

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

type PolarRevenueProjectionRow =
  typeof polarRevenueProjectionSnapshotsTable.$inferSelect;

const decodePolarRevenueProjection = Schema.decodeUnknown(
  PolarRevenueProjectionSchema,
);

const decodeRow = (row: PolarRevenueProjectionRow) =>
  decodePolarRevenueProjection({
    id: row.id,
    tenant: {
      scope: row.tenantScope,
      scopeId: row.tenantScopeId,
    },
    billingPeriodStart: row.billingPeriodStart.toISOString(),
    billingPeriodEnd: row.billingPeriodEnd.toISOString(),
    subscriptionMrr: {
      currency: row.subscriptionMrrCurrency,
      amountMinorUnits: row.subscriptionMrrAmount,
    },
    churnRate: Number(row.churnRate),
    expansion: {
      currency: row.expansionCurrency,
      amountMinorUnits: row.expansionAmount,
    },
    contraction: {
      currency: row.contractionCurrency,
      amountMinorUnits: row.contractionAmount,
    },
    projectedNextPeriodRevenue: {
      currency: row.projectedNextPeriodCurrency,
      amountMinorUnits: row.projectedNextPeriodAmount,
    },
    activeSubscriptionCount: row.activeSubscriptionCount,
    sourcePolarAccountId: row.sourcePolarAccountId,
    computedAt: row.computedAt.toISOString(),
    correlationId: row.correlationId,
  });

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type PolarRevenueProjectionRepositoryService = {
  readonly upsertSnapshot: (
    input: UpsertPolarRevenueProjectionSnapshotRepositoryInput,
  ) => Effect.Effect<
    PolarRevenueProjection,
    PolarRevenueProjectionRepositoryError
  >;
  readonly getLatestForTenant: (
    tenant: PolarRevenueProjectionTargetTenant,
  ) => Effect.Effect<
    Option.Option<PolarRevenueProjection>,
    PolarRevenueProjectionRepositoryError
  >;
  readonly getForTenantAndPeriod: (input: {
    readonly tenant: PolarRevenueProjectionTargetTenant;
    readonly billingPeriodStart: string;
  }) => Effect.Effect<
    Option.Option<PolarRevenueProjection>,
    PolarRevenueProjectionRepositoryError
  >;
  readonly listForTenant: (
    input: ListPolarRevenueProjectionRepositoryInput,
  ) => Effect.Effect<
    ReadonlyArray<PolarRevenueProjection>,
    PolarRevenueProjectionRepositoryError
  >;
  readonly pruneOlderThan: (
    cutoffComputedAt: string,
  ) => Effect.Effect<
    { readonly prunedCount: number },
    PolarRevenueProjectionRepositoryError
  >;
};

export class PolarRevenueProjectionRepository extends Context.Tag(
  "PolarRevenueProjectionRepository",
)<
  PolarRevenueProjectionRepository,
  PolarRevenueProjectionRepositoryService
>() {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: PolarRevenueProjectionQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, PolarRevenueProjectionQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new PolarRevenueProjectionQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: PolarRevenueProjectionPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, PolarRevenueProjectionPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new PolarRevenueProjectionPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate polar-revenue-projection identifiers",
  );
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makePolarRevenueProjectionRepository = (
  database: PolarRevenueProjectionDatabase,
) =>
  Effect.succeed<PolarRevenueProjectionRepositoryService>({
    upsertSnapshot: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          UpsertPolarRevenueProjectionSnapshotRepositoryInputSchema,
        )(input);
        const id = generateUuid();
        yield* tryPersist("upsertSnapshot", () =>
          database
            .insert(polarRevenueProjectionSnapshotsTable)
            .values({
              id,
              tenantScope: decoded.tenant.scope,
              tenantScopeId: decoded.tenant.scopeId,
              billingPeriodStart: new Date(decoded.billingPeriodStart),
              billingPeriodEnd: new Date(decoded.billingPeriodEnd),
              subscriptionMrrCurrency: decoded.subscriptionMrr.currency,
              subscriptionMrrAmount: decoded.subscriptionMrr.amountMinorUnits,
              churnRate: String(decoded.churnRate),
              expansionCurrency: decoded.expansion.currency,
              expansionAmount: decoded.expansion.amountMinorUnits,
              contractionCurrency: decoded.contraction.currency,
              contractionAmount: decoded.contraction.amountMinorUnits,
              projectedNextPeriodCurrency:
                decoded.projectedNextPeriodRevenue.currency,
              projectedNextPeriodAmount:
                decoded.projectedNextPeriodRevenue.amountMinorUnits,
              activeSubscriptionCount: decoded.activeSubscriptionCount,
              sourcePolarAccountId: decoded.sourcePolarAccountId,
              computedAt: new Date(decoded.computedAt),
              correlationId: decoded.correlationId,
            })
            .onConflictDoUpdate({
              target: [
                polarRevenueProjectionSnapshotsTable.tenantScope,
                polarRevenueProjectionSnapshotsTable.tenantScopeId,
                polarRevenueProjectionSnapshotsTable.billingPeriodStart,
              ],
              set: {
                billingPeriodEnd: new Date(decoded.billingPeriodEnd),
                subscriptionMrrCurrency: decoded.subscriptionMrr.currency,
                subscriptionMrrAmount: decoded.subscriptionMrr.amountMinorUnits,
                churnRate: String(decoded.churnRate),
                expansionCurrency: decoded.expansion.currency,
                expansionAmount: decoded.expansion.amountMinorUnits,
                contractionCurrency: decoded.contraction.currency,
                contractionAmount: decoded.contraction.amountMinorUnits,
                projectedNextPeriodCurrency:
                  decoded.projectedNextPeriodRevenue.currency,
                projectedNextPeriodAmount:
                  decoded.projectedNextPeriodRevenue.amountMinorUnits,
                activeSubscriptionCount: decoded.activeSubscriptionCount,
                sourcePolarAccountId: decoded.sourcePolarAccountId,
                computedAt: new Date(decoded.computedAt),
                correlationId: decoded.correlationId,
              },
            })
            .execute(),
        );

        const rows = yield* tryQuery("getForTenantAndPeriod", () =>
          database
            .select()
            .from(polarRevenueProjectionSnapshotsTable)
            .where(
              and(
                eq(
                  polarRevenueProjectionSnapshotsTable.tenantScope,
                  decoded.tenant.scope,
                ),
                eq(
                  polarRevenueProjectionSnapshotsTable.tenantScopeId,
                  decoded.tenant.scopeId,
                ),
                eq(
                  polarRevenueProjectionSnapshotsTable.billingPeriodStart,
                  new Date(decoded.billingPeriodStart),
                ),
              ),
            ),
        );
        const periodStartMs = new Date(decoded.billingPeriodStart).getTime();
        const row = rows.find(
          (entry) =>
            entry.tenantScope === decoded.tenant.scope &&
            entry.tenantScopeId === decoded.tenant.scopeId &&
            entry.billingPeriodStart.getTime() === periodStartMs,
        );
        if (row === undefined) {
          return yield* Effect.fail(
            new PolarRevenueProjectionPersistenceError({
              operation: "upsertSnapshot",
              cause: new Error(
                "polar-revenue-projection upsert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeRow(row);
      }),

    getLatestForTenant: (tenant) =>
      tryQuery("getLatestForTenant", () =>
        database
          .select()
          .from(polarRevenueProjectionSnapshotsTable)
          .where(
            and(
              eq(
                polarRevenueProjectionSnapshotsTable.tenantScope,
                tenant.scope,
              ),
              eq(
                polarRevenueProjectionSnapshotsTable.tenantScopeId,
                tenant.scopeId,
              ),
            ),
          ),
      ).pipe(
        Effect.flatMap((rows) => {
          const matching = rows
            .filter(
              (row) =>
                row.tenantScope === tenant.scope &&
                row.tenantScopeId === tenant.scopeId,
            )
            .sort(
              (left, right) =>
                right.billingPeriodStart.getTime() -
                left.billingPeriodStart.getTime(),
            );
          const first = matching[0];
          return first === undefined
            ? Effect.succeed(Option.none<PolarRevenueProjection>())
            : decodeRow(first).pipe(Effect.map(Option.some));
        }),
      ),

    getForTenantAndPeriod: (input) =>
      tryQuery("getForTenantAndPeriod", () =>
        database
          .select()
          .from(polarRevenueProjectionSnapshotsTable)
          .where(
            and(
              eq(
                polarRevenueProjectionSnapshotsTable.tenantScope,
                input.tenant.scope,
              ),
              eq(
                polarRevenueProjectionSnapshotsTable.tenantScopeId,
                input.tenant.scopeId,
              ),
              eq(
                polarRevenueProjectionSnapshotsTable.billingPeriodStart,
                new Date(input.billingPeriodStart),
              ),
            ),
          ),
      ).pipe(
        Effect.flatMap((rows) => {
          const periodStartMs = new Date(input.billingPeriodStart).getTime();
          const match = rows.find(
            (row) =>
              row.tenantScope === input.tenant.scope &&
              row.tenantScopeId === input.tenant.scopeId &&
              row.billingPeriodStart.getTime() === periodStartMs,
          );
          return match === undefined
            ? Effect.succeed(Option.none<PolarRevenueProjection>())
            : decodeRow(match).pipe(Effect.map(Option.some));
        }),
      ),

    listForTenant: (input) =>
      tryQuery("listForTenant", () =>
        database
          .select()
          .from(polarRevenueProjectionSnapshotsTable)
          .where(undefined),
      ).pipe(
        Effect.flatMap((rows) => {
          const filtered = rows
            .filter(
              (row) =>
                row.tenantScope === input.tenant.scope &&
                row.tenantScopeId === input.tenant.scopeId,
            )
            .sort(
              (left, right) =>
                right.billingPeriodStart.getTime() -
                left.billingPeriodStart.getTime(),
            );
          const bounded =
            input.limit === undefined
              ? filtered
              : filtered.slice(0, input.limit);
          return Effect.forEach(bounded, decodeRow, { concurrency: 1 });
        }),
      ),

    pruneOlderThan: (cutoffComputedAt) =>
      Effect.gen(function* () {
        const cutoff = new Date(cutoffComputedAt);
        const candidates = yield* tryQuery("listForTenant", () =>
          database
            .select()
            .from(polarRevenueProjectionSnapshotsTable)
            .where(undefined),
        );
        const prunable = candidates.filter(
          (row) => row.computedAt.getTime() < cutoff.getTime(),
        );
        if (prunable.length === 0) {
          return { prunedCount: 0 };
        }
        yield* tryPersist("pruneOlderThan", () =>
          database
            .delete(polarRevenueProjectionSnapshotsTable)
            .where(lt(polarRevenueProjectionSnapshotsTable.computedAt, cutoff))
            .execute(),
        );
        return { prunedCount: prunable.length };
      }),
  });

export const makePolarRevenueProjectionRepositoryLayer = (
  database: PolarRevenueProjectionDatabase,
) =>
  Layer.effect(
    PolarRevenueProjectionRepository,
    makePolarRevenueProjectionRepository(database),
  );
