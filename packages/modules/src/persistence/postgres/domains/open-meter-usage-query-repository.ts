/**
 * OpenMeter usage query snapshot Postgres repository per admin-app
 * implementation plan §9 item 8 (admin-only).
 *
 * Boundary-decodes rows into the typed `OpenMeterUsageQuery`
 * contract. Owns no business logic — the snapshot is COMPUTED by
 * the platform service from the OpenMeter adapter and PERSISTED
 * here. The only mutation surface exposed downstream of the
 * service is `backfillRequested`, which results in `upsertSnapshot`
 * being called with a freshly computed envelope. Composite unique
 * `(tenant_scope, tenant_scope_id, meter_slug, window_start)`
 * enforces one snapshot per tenant per meter per window; conflicts
 * replace the prior snapshot's aggregated buckets atomically.
 */
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  OpenMeterUsageQueryGranularitySchema,
  OpenMeterUsageQuerySchema,
  PlatformScopeSchema,
  type OpenMeterUsageQuery,
  type OpenMeterUsageQueryTargetTenant,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../database";
import { openMeterUsageQuerySnapshotsTable } from "./open-meter-usage-query";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class OpenMeterUsageQueryPersistenceError {
  readonly _tag = "OpenMeterUsageQueryPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation: "upsertSnapshot";
      readonly cause: unknown;
    },
  ) {}
}

export class OpenMeterUsageQueryQueryError {
  readonly _tag = "OpenMeterUsageQueryQueryError" as const;
  constructor(
    readonly args: {
      readonly operation: "getLatestForTenantMeter" | "getForTenantMeterWindow";
      readonly cause: unknown;
    },
  ) {}
}

export type OpenMeterUsageQueryRepositoryError =
  | ParseResult.ParseError
  | OpenMeterUsageQueryPersistenceError
  | OpenMeterUsageQueryQueryError;

// ---------------------------------------------------------------------------
// Repository inputs
// ---------------------------------------------------------------------------

const BucketSchema = Schema.Struct({
  windowStart: Schema.NonEmptyString,
  value: Schema.Number.pipe(Schema.finite()),
});

export const UpsertOpenMeterUsageQuerySnapshotRepositoryInputSchema =
  Schema.Struct({
    tenant: Schema.Struct({
      scope: PlatformScopeSchema,
      scopeId: Schema.NonEmptyString,
    }),
    subject: Schema.NonEmptyString,
    meterSlug: Schema.NonEmptyString,
    window: Schema.Struct({
      from: Schema.NonEmptyString,
      to: Schema.NonEmptyString,
    }),
    granularity: OpenMeterUsageQueryGranularitySchema,
    aggregated: Schema.Array(BucketSchema),
    computedAt: Schema.NonEmptyString,
    correlationId: Schema.NonEmptyString,
  });

export type UpsertOpenMeterUsageQuerySnapshotRepositoryInput =
  Schema.Schema.Type<
    typeof UpsertOpenMeterUsageQuerySnapshotRepositoryInputSchema
  >;

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

type OpenMeterUsageQueryRow =
  typeof openMeterUsageQuerySnapshotsTable.$inferSelect;

const decodeOpenMeterUsageQuery = Schema.decodeUnknown(
  OpenMeterUsageQuerySchema,
);

const decodeRow = (row: OpenMeterUsageQueryRow) =>
  decodeOpenMeterUsageQuery({
    id: row.id,
    tenant: {
      scope: row.tenantScope,
      scopeId: row.tenantScopeId,
    },
    subject: row.subject,
    meterSlug: row.meterSlug,
    window: {
      from: row.windowStart.toISOString(),
      to: row.windowEnd.toISOString(),
    },
    granularity: row.granularity,
    aggregated: row.aggregatedBuckets,
    computedAt: row.computedAt.toISOString(),
    correlationId: row.correlationId,
  });

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type OpenMeterUsageQueryRepositoryService = {
  readonly upsertSnapshot: (
    input: UpsertOpenMeterUsageQuerySnapshotRepositoryInput,
  ) => Effect.Effect<OpenMeterUsageQuery, OpenMeterUsageQueryRepositoryError>;
  readonly getLatestForTenantMeter: (input: {
    readonly tenant: OpenMeterUsageQueryTargetTenant;
    readonly meterSlug: string;
  }) => Effect.Effect<
    Option.Option<OpenMeterUsageQuery>,
    OpenMeterUsageQueryRepositoryError
  >;
  readonly getForTenantMeterWindow: (input: {
    readonly tenant: OpenMeterUsageQueryTargetTenant;
    readonly meterSlug: string;
    readonly windowStart: string;
  }) => Effect.Effect<
    Option.Option<OpenMeterUsageQuery>,
    OpenMeterUsageQueryRepositoryError
  >;
};

export class OpenMeterUsageQueryRepository extends Context.Tag(
  "OpenMeterUsageQueryRepository",
)<OpenMeterUsageQueryRepository, OpenMeterUsageQueryRepositoryService>() {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: OpenMeterUsageQueryQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, OpenMeterUsageQueryQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new OpenMeterUsageQueryQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: OpenMeterUsageQueryPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, OpenMeterUsageQueryPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new OpenMeterUsageQueryPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate open-meter-usage-query identifiers",
  );
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeOpenMeterUsageQueryRepository = (database: PostgresDatabase) =>
  Effect.succeed<OpenMeterUsageQueryRepositoryService>({
    upsertSnapshot: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          UpsertOpenMeterUsageQuerySnapshotRepositoryInputSchema,
        )(input);
        const id = generateUuid();
        const windowStart = new Date(decoded.window.from);
        const windowEnd = new Date(decoded.window.to);
        yield* tryPersist("upsertSnapshot", () =>
          database
            .insert(openMeterUsageQuerySnapshotsTable)
            .values({
              id,
              tenantScope: decoded.tenant.scope,
              tenantScopeId: decoded.tenant.scopeId,
              subject: decoded.subject,
              meterSlug: decoded.meterSlug,
              windowStart,
              windowEnd,
              granularity: decoded.granularity,
              aggregatedBuckets: decoded.aggregated.map((bucket) => ({
                windowStart: bucket.windowStart,
                value: bucket.value,
              })),
              bucketCount: decoded.aggregated.length,
              computedAt: new Date(decoded.computedAt),
              correlationId: decoded.correlationId,
            })
            .onConflictDoUpdate({
              target: [
                openMeterUsageQuerySnapshotsTable.tenantScope,
                openMeterUsageQuerySnapshotsTable.tenantScopeId,
                openMeterUsageQuerySnapshotsTable.meterSlug,
                openMeterUsageQuerySnapshotsTable.windowStart,
              ],
              set: {
                subject: decoded.subject,
                windowEnd,
                granularity: decoded.granularity,
                aggregatedBuckets: decoded.aggregated.map((bucket) => ({
                  windowStart: bucket.windowStart,
                  value: bucket.value,
                })),
                bucketCount: decoded.aggregated.length,
                computedAt: new Date(decoded.computedAt),
                correlationId: decoded.correlationId,
              },
            })
            .execute(),
        );

        const rows = yield* tryQuery("getForTenantMeterWindow", () =>
          database
            .select()
            .from(openMeterUsageQuerySnapshotsTable)
            .where(
              and(
                eq(
                  openMeterUsageQuerySnapshotsTable.tenantScope,
                  decoded.tenant.scope,
                ),
                eq(
                  openMeterUsageQuerySnapshotsTable.tenantScopeId,
                  decoded.tenant.scopeId,
                ),
                eq(
                  openMeterUsageQuerySnapshotsTable.meterSlug,
                  decoded.meterSlug,
                ),
                eq(openMeterUsageQuerySnapshotsTable.windowStart, windowStart),
              ),
            ),
        );
        const windowStartMs = windowStart.getTime();
        const row = rows.find(
          (entry) =>
            entry.tenantScope === decoded.tenant.scope &&
            entry.tenantScopeId === decoded.tenant.scopeId &&
            entry.meterSlug === decoded.meterSlug &&
            entry.windowStart.getTime() === windowStartMs,
        );
        if (row === undefined) {
          return yield* Effect.fail(
            new OpenMeterUsageQueryPersistenceError({
              operation: "upsertSnapshot",
              cause: new Error(
                "open-meter-usage-query upsert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeRow(row);
      }),

    getLatestForTenantMeter: (input) =>
      tryQuery("getLatestForTenantMeter", () =>
        database
          .select()
          .from(openMeterUsageQuerySnapshotsTable)
          .where(
            and(
              eq(
                openMeterUsageQuerySnapshotsTable.tenantScope,
                input.tenant.scope,
              ),
              eq(
                openMeterUsageQuerySnapshotsTable.tenantScopeId,
                input.tenant.scopeId,
              ),
              eq(openMeterUsageQuerySnapshotsTable.meterSlug, input.meterSlug),
            ),
          ),
      ).pipe(
        Effect.flatMap((rows) => {
          const matching = rows
            .filter(
              (row) =>
                row.tenantScope === input.tenant.scope &&
                row.tenantScopeId === input.tenant.scopeId &&
                row.meterSlug === input.meterSlug,
            )
            .sort(
              (left, right) =>
                right.windowStart.getTime() - left.windowStart.getTime(),
            );
          const first = matching[0];
          return first === undefined
            ? Effect.succeed(Option.none<OpenMeterUsageQuery>())
            : decodeRow(first).pipe(Effect.map(Option.some));
        }),
      ),

    getForTenantMeterWindow: (input) =>
      tryQuery("getForTenantMeterWindow", () =>
        database
          .select()
          .from(openMeterUsageQuerySnapshotsTable)
          .where(
            and(
              eq(
                openMeterUsageQuerySnapshotsTable.tenantScope,
                input.tenant.scope,
              ),
              eq(
                openMeterUsageQuerySnapshotsTable.tenantScopeId,
                input.tenant.scopeId,
              ),
              eq(openMeterUsageQuerySnapshotsTable.meterSlug, input.meterSlug),
              eq(
                openMeterUsageQuerySnapshotsTable.windowStart,
                new Date(input.windowStart),
              ),
            ),
          ),
      ).pipe(
        Effect.flatMap((rows) => {
          const windowStartMs = new Date(input.windowStart).getTime();
          const match = rows.find(
            (row) =>
              row.tenantScope === input.tenant.scope &&
              row.tenantScopeId === input.tenant.scopeId &&
              row.meterSlug === input.meterSlug &&
              row.windowStart.getTime() === windowStartMs,
          );
          return match === undefined
            ? Effect.succeed(Option.none<OpenMeterUsageQuery>())
            : decodeRow(match).pipe(Effect.map(Option.some));
        }),
      ),
  });

export const makeOpenMeterUsageQueryRepositoryLayer = (
  database: PostgresDatabase,
) =>
  Layer.effect(
    OpenMeterUsageQueryRepository,
    makeOpenMeterUsageQueryRepository(database),
  );
