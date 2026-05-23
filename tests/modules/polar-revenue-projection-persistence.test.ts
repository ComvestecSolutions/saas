/**
 * Polar revenue projection persistence tests (admin-app
 * implementation plan §9 item 7 — read-only, admin-only). Uses a
 * Map-backed in-memory mock of the Drizzle-shaped
 * `PostgresDatabase` surface to assert:
 *
 *   - upsertSnapshot round-trip + boundary-decoded
 *     `PolarRevenueProjection`
 *   - getLatestForTenant returns the most recent snapshot
 *     ordered by `billingPeriodStart` (latest-per-tenant read
 *     path)
 *   - listForTenant returns rows in DESC order and bounds via
 *     `limit`
 *   - cross-tenant isolation: getLatestForTenant scoped to one
 *     tenant never returns another tenant's snapshot
 *   - history retention bound: pruneOlderThan prunes rows whose
 *     `computedAt` is strictly before the cutoff and leaves
 *     newer rows intact
 *   - composite uniqueness: re-upserting the same
 *     `(tenantScope, tenantScopeId, billingPeriodStart)` replaces
 *     the prior derived values rather than appending a new row
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { platformScope } from "@comvestec/contracts";
import {
  makePolarRevenueProjectionRepository,
  polarRevenueProjectionSnapshotsTable,
  type UpsertPolarRevenueProjectionSnapshotRepositoryInput,
} from "@comvestec/modules";
import type {
  PostgresDatabase,
  PostgresDeleteCapability,
} from "@comvestec/modules";

type Row = typeof polarRevenueProjectionSnapshotsTable.$inferSelect;

const createDatabase = () => {
  const rows = new Map<string, Row>();

  const select = () => ({
    from: <T>(_table: T) => ({
      where: async (_condition: unknown) => [...rows.values()],
    }),
  });

  const insert = (_table: unknown) => {
    const buildValuesBuilder = (incoming: unknown) => {
      const list = Array.isArray(incoming) ? incoming : [incoming];
      const stage = () => {
        for (const value of list) {
          const v = value as Record<string, unknown>;
          const id = v.id as string;
          const tenantScope = v.tenantScope as string;
          const tenantScopeId = v.tenantScopeId as string;
          const billingPeriodStart = v.billingPeriodStart as Date;
          const existingKey = [...rows.entries()].find(
            ([, row]) =>
              row.tenantScope === tenantScope &&
              row.tenantScopeId === tenantScopeId &&
              row.billingPeriodStart.getTime() === billingPeriodStart.getTime(),
          )?.[0];
          const row: Row = {
            id: existingKey ?? id,
            tenantScope,
            tenantScopeId,
            billingPeriodStart,
            billingPeriodEnd: v.billingPeriodEnd as Date,
            subscriptionMrrCurrency: v.subscriptionMrrCurrency as string,
            subscriptionMrrAmount: v.subscriptionMrrAmount as number,
            churnRate: v.churnRate as string,
            expansionCurrency: v.expansionCurrency as string,
            expansionAmount: v.expansionAmount as number,
            contractionCurrency: v.contractionCurrency as string,
            contractionAmount: v.contractionAmount as number,
            projectedNextPeriodCurrency:
              v.projectedNextPeriodCurrency as string,
            projectedNextPeriodAmount: v.projectedNextPeriodAmount as number,
            activeSubscriptionCount: v.activeSubscriptionCount as number,
            sourcePolarAccountId: v.sourcePolarAccountId as string,
            computedAt: v.computedAt as Date,
            correlationId: v.correlationId as string,
          };
          rows.set(row.id, row);
        }
      };
      return {
        execute: async () => stage(),
        onConflictDoUpdate: () => ({
          execute: async () => stage(),
        }),
      };
    };
    return {
      values: (incoming: unknown) => buildValuesBuilder(incoming),
    };
  };

  const update = (_table: unknown) => ({
    set: (_values: Record<string, unknown>) => ({
      where: (_condition: unknown) => ({
        returning: async () => [] as Row[],
      }),
    }),
  });

  const del = (_table: unknown) => ({
    where: (_condition: unknown) => ({
      execute: async () => {
        // The repository computes prunable candidates from a prior
        // select() pass; here we mirror that by deleting rows whose
        // computedAt is older than the most recently seen cutoff,
        // which the test sets via `setPruneCutoff` below.
        if (lastPruneCutoff !== undefined) {
          for (const [id, row] of rows.entries()) {
            if (row.computedAt.getTime() < lastPruneCutoff.getTime()) {
              rows.delete(id);
            }
          }
          lastPruneCutoff = undefined;
        }
      },
    }),
  });

  let lastPruneCutoff: Date | undefined;

  const database = {
    insert,
    update,
    delete: del,
    select,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback({ insert, update, delete: del }),
  } as unknown as PostgresDatabase & PostgresDeleteCapability;

  return {
    rows,
    database,
    setPruneCutoff: (cutoff: Date) => {
      lastPruneCutoff = cutoff;
    },
  };
};

const baseUpsert = (
  overrides?: Partial<UpsertPolarRevenueProjectionSnapshotRepositoryInput>,
): UpsertPolarRevenueProjectionSnapshotRepositoryInput => ({
  tenant: overrides?.tenant ?? {
    scope: platformScope.organization,
    scopeId: "tenant-acme",
  },
  billingPeriodStart:
    overrides?.billingPeriodStart ?? "2026-01-01T00:00:00.000Z",
  billingPeriodEnd: overrides?.billingPeriodEnd ?? "2026-02-01T00:00:00.000Z",
  subscriptionMrr: overrides?.subscriptionMrr ?? {
    currency: "USD",
    amountMinorUnits: 1_000_000,
  },
  churnRate: overrides?.churnRate ?? 0.05,
  expansion: overrides?.expansion ?? {
    currency: "USD",
    amountMinorUnits: 50_000,
  },
  contraction: overrides?.contraction ?? {
    currency: "USD",
    amountMinorUnits: 10_000,
  },
  projectedNextPeriodRevenue: overrides?.projectedNextPeriodRevenue ?? {
    currency: "USD",
    amountMinorUnits: 1_040_000,
  },
  activeSubscriptionCount: overrides?.activeSubscriptionCount ?? 42,
  sourcePolarAccountId: overrides?.sourcePolarAccountId ?? "polar_account_acme",
  computedAt: overrides?.computedAt ?? "2026-02-01T00:00:00.000Z",
  correlationId: overrides?.correlationId ?? "corr-prj-1",
});

describe("modules polar-revenue-projection persistence", () => {
  it("round-trips an upserted snapshot through upsertSnapshot → getForTenantAndPeriod", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makePolarRevenueProjectionRepository(harness.database),
    );

    const created = await Effect.runPromise(repo.upsertSnapshot(baseUpsert()));
    expect(created.tenant.scopeId).toBe("tenant-acme");
    expect(created.subscriptionMrr.amountMinorUnits).toBe(1_000_000);
    expect(created.projectedNextPeriodRevenue.amountMinorUnits).toBe(1_040_000);
    expect(created.activeSubscriptionCount).toBe(42);
    expect(created.churnRate).toBe(0.05);

    const got = await Effect.runPromise(
      repo.getForTenantAndPeriod({
        tenant: created.tenant,
        billingPeriodStart: created.billingPeriodStart,
      }),
    );
    expect(Option.isSome(got)).toBe(true);
    if (Option.isSome(got)) {
      expect(got.value.id).toBe(created.id);
      expect(got.value.sourcePolarAccountId).toBe("polar_account_acme");
    }
  });

  it("getLatestForTenant returns the snapshot with the most recent billingPeriodStart", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makePolarRevenueProjectionRepository(harness.database),
    );

    await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-01-01T00:00:00.000Z",
          billingPeriodEnd: "2026-02-01T00:00:00.000Z",
          computedAt: "2026-02-01T00:00:00.000Z",
          correlationId: "corr-prj-a",
        }),
      ),
    );
    const newer = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-02-01T00:00:00.000Z",
          billingPeriodEnd: "2026-03-01T00:00:00.000Z",
          computedAt: "2026-03-01T00:00:00.000Z",
          correlationId: "corr-prj-b",
        }),
      ),
    );

    const latest = await Effect.runPromise(
      repo.getLatestForTenant({
        scope: platformScope.organization,
        scopeId: "tenant-acme",
      }),
    );
    expect(Option.isSome(latest)).toBe(true);
    if (Option.isSome(latest)) {
      expect(latest.value.id).toBe(newer.id);
      expect(latest.value.billingPeriodStart).toBe("2026-02-01T00:00:00.000Z");
    }
  });

  it("listForTenant returns rows in billingPeriodStart DESC and applies the limit", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makePolarRevenueProjectionRepository(harness.database),
    );

    const a = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-01-01T00:00:00.000Z",
          computedAt: "2026-02-01T00:00:00.000Z",
          correlationId: "corr-l-1",
        }),
      ),
    );
    const b = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-02-01T00:00:00.000Z",
          computedAt: "2026-03-01T00:00:00.000Z",
          correlationId: "corr-l-2",
        }),
      ),
    );
    const c = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-03-01T00:00:00.000Z",
          computedAt: "2026-04-01T00:00:00.000Z",
          correlationId: "corr-l-3",
        }),
      ),
    );

    const all = await Effect.runPromise(
      repo.listForTenant({
        tenant: {
          scope: platformScope.organization,
          scopeId: "tenant-acme",
        },
      }),
    );
    expect(all).toHaveLength(3);
    expect(all[0]?.id).toBe(c.id);
    expect(all[1]?.id).toBe(b.id);
    expect(all[2]?.id).toBe(a.id);

    const limited = await Effect.runPromise(
      repo.listForTenant({
        tenant: {
          scope: platformScope.organization,
          scopeId: "tenant-acme",
        },
        limit: 2,
      }),
    );
    expect(limited).toHaveLength(2);
    expect(limited[0]?.id).toBe(c.id);
    expect(limited[1]?.id).toBe(b.id);
  });

  it("cross-tenant isolation: getLatestForTenant scoped to one tenant never returns another tenant's snapshot", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makePolarRevenueProjectionRepository(harness.database),
    );

    await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          tenant: {
            scope: platformScope.organization,
            scopeId: "tenant-acme",
          },
          correlationId: "corr-iso-1",
        }),
      ),
    );

    const other = await Effect.runPromise(
      repo.getLatestForTenant({
        scope: platformScope.organization,
        scopeId: "tenant-globex",
      }),
    );
    expect(Option.isNone(other)).toBe(true);
  });

  it("re-upserting the same (tenant, billingPeriodStart) replaces the prior derived values atomically", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makePolarRevenueProjectionRepository(harness.database),
    );

    const first = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-01-01T00:00:00.000Z",
          churnRate: 0.05,
          activeSubscriptionCount: 40,
          correlationId: "corr-upsert-1",
        }),
      ),
    );

    const second = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-01-01T00:00:00.000Z",
          churnRate: 0.08,
          activeSubscriptionCount: 38,
          correlationId: "corr-upsert-2",
        }),
      ),
    );

    expect(second.id).toBe(first.id);
    expect(second.churnRate).toBe(0.08);
    expect(second.activeSubscriptionCount).toBe(38);
    expect(second.correlationId).toBe("corr-upsert-2");
    expect(harness.rows.size).toBe(1);
  });

  it("pruneOlderThan prunes rows whose computedAt is strictly before the cutoff", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makePolarRevenueProjectionRepository(harness.database),
    );

    await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2025-12-01T00:00:00.000Z",
          computedAt: "2025-12-15T00:00:00.000Z",
          correlationId: "corr-prune-old",
        }),
      ),
    );
    await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-01-01T00:00:00.000Z",
          computedAt: "2026-01-15T00:00:00.000Z",
          correlationId: "corr-prune-mid",
        }),
      ),
    );
    await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          billingPeriodStart: "2026-02-01T00:00:00.000Z",
          computedAt: "2026-02-15T00:00:00.000Z",
          correlationId: "corr-prune-new",
        }),
      ),
    );

    harness.setPruneCutoff(new Date("2026-02-01T00:00:00.000Z"));
    const result = await Effect.runPromise(
      repo.pruneOlderThan("2026-02-01T00:00:00.000Z"),
    );
    expect(result.prunedCount).toBe(2);
    expect(harness.rows.size).toBe(1);
    const survivor = [...harness.rows.values()][0];
    expect(survivor?.correlationId).toBe("corr-prune-new");
  });
});
