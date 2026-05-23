/**
 * Manual break-glass Postgres persistence tests (admin-app
 * implementation plan §9 item 5). Uses a Map-backed in-memory mock
 * of the Drizzle-shaped `PostgresDatabase` surface to assert:
 *
 *   - issueGrant round-trip + boundary-decoded `ManualBreakGlassGrant`
 *   - releaseGrant flips status → `released` and stamps releasedAt
 *   - second releaseGrant on an already-released grant is rejected
 *     with `ManualBreakGlassGrantAlreadyReleasedError._tag`
 *   - listActiveForSubject and countActiveForSubject exclude
 *     released and expired rows and are scoped by grantedTo
 *   - autoExpireStaleGrants flips active rows past expiresAt to
 *     `expired` and returns their ids
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  manualBreakGlassGrantStatus,
  platformScope,
} from "@comvestec/contracts";
import {
  manualBreakGlassGrantsTable,
  ManualBreakGlassGrantAlreadyReleasedError,
  makeManualBreakGlassRepository,
  type PostgresDatabase,
} from "@comvestec/modules";

type Row = typeof manualBreakGlassGrantsTable.$inferSelect;

const createDatabase = () => {
  const rows = new Map<string, Row>();
  const pendingSelect: { ids: string[] } = { ids: [] };

  const select = () => ({
    from: <T>(_table: T) => ({
      where: async (_condition: unknown) => {
        const all = [...rows.values()];
        pendingSelect.ids = all.map((row) => row.id);
        return all;
      },
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
            grantedTo: v.grantedTo as string,
            grantedBy: v.grantedBy as string,
            targetTenantScope: v.targetTenantScope as string,
            targetTenantScopeId: v.targetTenantScopeId as string,
            reasonCatalogId: v.reasonCatalogId as string,
            reasonNarrative: v.reasonNarrative as string,
            issuedAt: v.issuedAt as Date,
            expiresAt: v.expiresAt as Date,
            status: v.status as string,
            releasedAt: (v.releasedAt as Date | null | undefined) ?? null,
            releasedBy: (v.releasedBy as string | null | undefined) ?? null,
            releaseReasonCatalogId:
              (v.releaseReasonCatalogId as string | null | undefined) ?? null,
            correlationId: v.correlationId as string,
          });
        }
      },
      onConflictDoUpdate: () => ({ execute: async () => undefined }),
    }),
  });

  // The test harness mirrors the admin-saved-views persistence
  // harness: the in-memory mock cannot decode the drizzle
  // condition, so the update builder applies the patch to ALL
  // currently-matching rows that the repository pre-selected. For
  // releaseGrant this is exactly one row (we pre-select by id);
  // for autoExpireStaleGrants the repository relies on the where
  // clause we can re-implement explicitly via `predicate`.
  let lastReleasePredicate: ((row: Row) => boolean) | undefined;

  const update = (_table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: (_condition: unknown) => ({
        returning: async () => {
          const matched: Row[] = [];
          for (const [id, row] of rows.entries()) {
            // For releaseGrant the repository pre-selected exactly
            // one row by id; we restrict the set to that row.
            // For autoExpireStaleGrants there is no pre-select, so
            // the harness installs a predicate matching the
            // `status === active AND expiresAt <= now` window
            // explicitly via `setAutoExpirePredicate`.
            if (
              lastReleasePredicate !== undefined &&
              !lastReleasePredicate(row)
            ) {
              continue;
            }
            const next = { ...row, ...values } as Row;
            rows.set(id, next);
            matched.push(next);
          }
          // One-shot predicate; reset.
          lastReleasePredicate = undefined;
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
    setReleasePredicate: (predicate: (row: Row) => boolean) => {
      lastReleasePredicate = predicate;
    },
  };
};

const baseInput = (overrides?: {
  readonly grantedTo?: string;
  readonly expiresAt?: string;
  readonly issuedAt?: string;
}) => ({
  grantedTo: overrides?.grantedTo ?? "subject-support-1",
  grantedBy: "subject-platform-op",
  targetTenant: {
    scope: platformScope.organization,
    scopeId: "tenant-acme",
  },
  reasonCatalogId: "manual-break-glass.issue",
  reasonNarrative: "Investigating webhook delivery failures",
  issuedAt: overrides?.issuedAt ?? "2026-01-01T00:00:00.000Z",
  expiresAt: overrides?.expiresAt ?? "2026-01-01T00:30:00.000Z",
  correlationId: "corr-issue-1",
});

const collectFailure = <T>(
  cause: unknown,
  ctor: new (...args: never[]) => T,
): T | undefined => {
  if (cause === null || typeof cause !== "object") return undefined;
  if (cause instanceof ctor) return cause;
  if ("error" in cause) {
    const e = (cause as { error: unknown }).error;
    if (e instanceof ctor) return e;
  }
  for (const key of ["left", "right", "cause"] as const) {
    if (key in cause) {
      const next = collectFailure(
        (cause as Record<string, unknown>)[key],
        ctor,
      );
      if (next !== undefined) return next;
    }
  }
  return undefined;
};

describe("modules manual-break-glass persistence", () => {
  it("round-trips a grant through issueGrant → getGrant → listActiveForSubject", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeManualBreakGlassRepository(harness.database),
    );

    const created = await Effect.runPromise(repo.issueGrant(baseInput()));
    expect(created.status).toBe(manualBreakGlassGrantStatus.active);
    expect(created.grantedTo).toBe("subject-support-1");
    expect(created.targetTenant.scopeId).toBe("tenant-acme");

    const got = await Effect.runPromise(repo.getGrant(created.id));
    expect(Option.isSome(got)).toBe(true);

    const active = await Effect.runPromise(
      repo.listActiveForSubject("subject-support-1"),
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(created.id);
  });

  it("releaseGrant flips status to released and stamps releasedAt + releasedBy", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeManualBreakGlassRepository(harness.database),
    );
    const created = await Effect.runPromise(repo.issueGrant(baseInput()));

    harness.setReleasePredicate((row) => row.id === created.id);
    const released = await Effect.runPromise(
      repo.releaseGrant({
        id: created.id,
        releasedBy: "subject-platform-op",
        releaseReasonCatalogId: "manual-break-glass.release",
        releasedAt: "2026-01-01T00:10:00.000Z",
      }),
    );
    expect(released.status).toBe(manualBreakGlassGrantStatus.released);
    expect(released.releasedAt).toBe("2026-01-01T00:10:00.000Z");
    expect(released.releasedBy).toBe("subject-platform-op");
    expect(released.releaseReasonCatalogId).toBe("manual-break-glass.release");
  });

  it("rejects a second releaseGrant with ManualBreakGlassGrantAlreadyReleasedError", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeManualBreakGlassRepository(harness.database),
    );
    const created = await Effect.runPromise(repo.issueGrant(baseInput()));

    harness.setReleasePredicate((row) => row.id === created.id);
    await Effect.runPromise(
      repo.releaseGrant({
        id: created.id,
        releasedBy: "subject-platform-op",
        releaseReasonCatalogId: "manual-break-glass.release",
        releasedAt: "2026-01-01T00:10:00.000Z",
      }),
    );

    const exit = await Effect.runPromiseExit(
      repo.releaseGrant({
        id: created.id,
        releasedBy: "subject-platform-op",
        releaseReasonCatalogId: "manual-break-glass.release",
        releasedAt: "2026-01-01T00:20:00.000Z",
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = collectFailure(
        exit.cause,
        ManualBreakGlassGrantAlreadyReleasedError,
      );
      expect(failure?._tag).toBe("ManualBreakGlassGrantAlreadyReleasedError");
      expect(failure?.args.id).toBe(created.id);
    }
  });

  it("listActiveForSubject and countActiveForSubject exclude released rows", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeManualBreakGlassRepository(harness.database),
    );
    const a = await Effect.runPromise(
      repo.issueGrant(baseInput({ grantedTo: "subject-support-1" })),
    );
    await Effect.runPromise(
      repo.issueGrant({
        ...baseInput({ grantedTo: "subject-support-1" }),
        correlationId: "corr-2",
      }),
    );

    harness.setReleasePredicate((row) => row.id === a.id);
    await Effect.runPromise(
      repo.releaseGrant({
        id: a.id,
        releasedBy: "subject-platform-op",
        releaseReasonCatalogId: "manual-break-glass.release",
        releasedAt: "2026-01-01T00:10:00.000Z",
      }),
    );

    const active = await Effect.runPromise(
      repo.listActiveForSubject("subject-support-1"),
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.id).not.toBe(a.id);

    const count = await Effect.runPromise(
      repo.countActiveForSubject("subject-support-1"),
    );
    expect(count).toBe(1);
  });

  it("listActiveForSubject is scoped by grantedTo (cross-subject isolation)", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeManualBreakGlassRepository(harness.database),
    );
    await Effect.runPromise(
      repo.issueGrant(baseInput({ grantedTo: "subject-support-1" })),
    );

    const active = await Effect.runPromise(
      repo.listActiveForSubject("subject-support-2"),
    );
    expect(active).toHaveLength(0);
    const count = await Effect.runPromise(
      repo.countActiveForSubject("subject-support-2"),
    );
    expect(count).toBe(0);
  });

  it("autoExpireStaleGrants flips active rows past expiresAt to expired and returns ids", async () => {
    const harness = createDatabase();
    const repo = await Effect.runPromise(
      makeManualBreakGlassRepository(harness.database),
    );
    const stale = await Effect.runPromise(
      repo.issueGrant(baseInput({ expiresAt: "2026-01-01T00:01:00.000Z" })),
    );
    await Effect.runPromise(
      repo.issueGrant({
        ...baseInput({ expiresAt: "2026-01-01T05:00:00.000Z" }),
        correlationId: "corr-fresh",
      }),
    );

    const now = new Date("2026-01-01T00:30:00.000Z");
    harness.setReleasePredicate(
      (row) =>
        row.status === manualBreakGlassGrantStatus.active &&
        row.expiresAt.getTime() <= now.getTime(),
    );
    const expired = await Effect.runPromise(
      repo.autoExpireStaleGrants({ now }),
    );
    expect(expired).toEqual([stale.id]);

    const remainingActive = await Effect.runPromise(
      repo.listActiveForSubject("subject-support-1"),
    );
    expect(remainingActive).toHaveLength(1);
    expect(remainingActive[0]?.id).not.toBe(stale.id);
  });
});
