/**
 * OpenMeter usage query persistence tests (admin-app implementation
 * plan §9 item 8 — admin-only). Uses a Map-backed in-memory mock of
 * the Drizzle-shaped `PostgresDatabase` surface to assert:
 *
 *   - upsertSnapshot round-trip + boundary-decoded
 *     `OpenMeterUsageQuery`
 *   - getLatestForTenantMeter returns the most recent snapshot
 *     ordered by `windowStart`
 *   - cross-tenant + cross-meter isolation: getLatestForTenantMeter
 *     scoped to one tenant + meter never returns another tenant's
 *     or another meter's snapshot
 *   - composite uniqueness: re-upserting the same
 *     `(tenantScope, tenantScopeId, meterSlug, windowStart)` quad
 *     replaces the prior aggregated buckets rather than appending
 *     a new row
 *   - aggregated bucket fidelity: round-tripped buckets carry the
 *     same windowStart + value pairs the service emitted
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { platformScope } from "@comvestec/contracts";
import {
  makeOpenMeterUsageQueryRepository,
  openMeterUsageQuerySnapshotsTable,
  type UpsertOpenMeterUsageQuerySnapshotRepositoryInput,
} from "@comvestec/modules";
import type { PostgresDatabase } from "@comvestec/modules";

type Row = typeof openMeterUsageQuerySnapshotsTable.$inferSelect;

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
          const meterSlug = v.meterSlug as string;
          const windowStart = v.windowStart as Date;
          const existingKey = [...rows.entries()].find(
            ([, row]) =>
              row.tenantScope === tenantScope &&
              row.tenantScopeId === tenantScopeId &&
              row.meterSlug === meterSlug &&
              row.windowStart.getTime() === windowStart.getTime(),
          )?.[0];
          const row: Row = {
            id: existingKey ?? id,
            tenantScope,
            tenantScopeId,
            subject: v.subject as string,
            meterSlug,
            windowStart,
            windowEnd: v.windowEnd as Date,
            granularity: v.granularity as string,
            aggregatedBuckets: v.aggregatedBuckets as Row["aggregatedBuckets"],
            bucketCount: v.bucketCount as number,
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

  const database = {
    insert,
    update,
    select,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback({ insert, update }),
  } as unknown as PostgresDatabase;

  return { rows, database };
};

const baseUpsert = (
  overrides?: Partial<UpsertOpenMeterUsageQuerySnapshotRepositoryInput>,
): UpsertOpenMeterUsageQuerySnapshotRepositoryInput => ({
  tenant: overrides?.tenant ?? {
    scope: platformScope.organization,
    scopeId: "tenant-acme",
  },
  subject: overrides?.subject ?? "subject-acme",
  meterSlug: overrides?.meterSlug ?? "api.requests",
  window: overrides?.window ?? {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-02T00:00:00.000Z",
  },
  granularity: overrides?.granularity ?? "HOUR",
  aggregated: overrides?.aggregated ?? [
    { windowStart: "2026-01-01T00:00:00.000Z", value: 12 },
    { windowStart: "2026-01-01T01:00:00.000Z", value: 7 },
  ],
  computedAt: overrides?.computedAt ?? "2026-01-02T00:01:00.000Z",
  correlationId: overrides?.correlationId ?? "corr-omq-1",
});

describe("modules open-meter-usage-query persistence", () => {
  it("round-trips an upserted snapshot through upsertSnapshot → getForTenantMeterWindow", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOpenMeterUsageQueryRepository(harness.database),
    );

    const created = await Effect.runPromise(repo.upsertSnapshot(baseUpsert()));
    expect(created.tenant.scopeId).toBe("tenant-acme");
    expect(created.meterSlug).toBe("api.requests");
    expect(created.granularity).toBe("HOUR");
    expect(created.aggregated).toEqual([
      { windowStart: "2026-01-01T00:00:00.000Z", value: 12 },
      { windowStart: "2026-01-01T01:00:00.000Z", value: 7 },
    ]);

    const got = await Effect.runPromise(
      repo.getForTenantMeterWindow({
        tenant: created.tenant,
        meterSlug: created.meterSlug,
        windowStart: created.window.from,
      }),
    );
    expect(Option.isSome(got)).toBe(true);
    if (Option.isSome(got)) {
      expect(got.value.id).toBe(created.id);
      expect(got.value.subject).toBe("subject-acme");
    }
  });

  it("getLatestForTenantMeter returns the snapshot with the most recent windowStart", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOpenMeterUsageQueryRepository(harness.database),
    );

    await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          window: {
            from: "2026-01-01T00:00:00.000Z",
            to: "2026-01-02T00:00:00.000Z",
          },
          computedAt: "2026-01-02T00:00:00.000Z",
          correlationId: "corr-omq-a",
        }),
      ),
    );
    const newer = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          window: {
            from: "2026-02-01T00:00:00.000Z",
            to: "2026-02-02T00:00:00.000Z",
          },
          computedAt: "2026-02-02T00:00:00.000Z",
          correlationId: "corr-omq-b",
        }),
      ),
    );

    const latest = await Effect.runPromise(
      repo.getLatestForTenantMeter({
        tenant: {
          scope: platformScope.organization,
          scopeId: "tenant-acme",
        },
        meterSlug: "api.requests",
      }),
    );
    expect(Option.isSome(latest)).toBe(true);
    if (Option.isSome(latest)) {
      expect(latest.value.id).toBe(newer.id);
      expect(latest.value.window.from).toBe("2026-02-01T00:00:00.000Z");
    }
  });

  it("cross-tenant isolation: getLatestForTenantMeter scoped to one tenant never returns another tenant's snapshot", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOpenMeterUsageQueryRepository(harness.database),
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
      repo.getLatestForTenantMeter({
        tenant: {
          scope: platformScope.organization,
          scopeId: "tenant-globex",
        },
        meterSlug: "api.requests",
      }),
    );
    expect(Option.isNone(other)).toBe(true);
  });

  it("cross-meter isolation: getLatestForTenantMeter scoped to one meter never returns another meter's snapshot", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOpenMeterUsageQueryRepository(harness.database),
    );

    await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          meterSlug: "api.requests",
          correlationId: "corr-meter-a",
        }),
      ),
    );

    const other = await Effect.runPromise(
      repo.getLatestForTenantMeter({
        tenant: {
          scope: platformScope.organization,
          scopeId: "tenant-acme",
        },
        meterSlug: "storage.bytes",
      }),
    );
    expect(Option.isNone(other)).toBe(true);
  });

  it("re-upserting the same (tenant, meterSlug, windowStart) replaces the prior aggregated buckets atomically", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeOpenMeterUsageQueryRepository(harness.database),
    );

    const first = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          aggregated: [{ windowStart: "2026-01-01T00:00:00.000Z", value: 1 }],
          correlationId: "corr-upsert-1",
        }),
      ),
    );

    const second = await Effect.runPromise(
      repo.upsertSnapshot(
        baseUpsert({
          aggregated: [
            { windowStart: "2026-01-01T00:00:00.000Z", value: 99 },
            { windowStart: "2026-01-01T01:00:00.000Z", value: 11 },
          ],
          correlationId: "corr-upsert-2",
        }),
      ),
    );

    expect(second.id).toBe(first.id);
    expect(second.aggregated).toEqual([
      { windowStart: "2026-01-01T00:00:00.000Z", value: 99 },
      { windowStart: "2026-01-01T01:00:00.000Z", value: 11 },
    ]);
    expect(second.correlationId).toBe("corr-upsert-2");
    expect(harness.rows.size).toBe(1);
  });
});
