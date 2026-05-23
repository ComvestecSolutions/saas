/**
 * Admin-workspaces Postgres persistence tests (admin-app
 * implementation plan §9 item 2). Uses a Map-backed in-memory mock
 * of the Drizzle-shaped `PostgresDatabase & PostgresDeleteCapability`
 * surface and asserts:
 *
 *   - CRUD round-trip via the repository
 *   - per-user isolation: queries scoped by ownerSubjectId never
 *     leak rows owned by another subject id
 *   - unique-per-owner `(ownerSubjectId, name)` constraint surfaces
 *     `AdminWorkspacesUniqueViolationError`
 *   - reorder atomicity: a supplied id-set that does not equal the
 *     current owner set is rejected with
 *     `AdminWorkspacesReorderMismatchError` BEFORE any position
 *     rewrite happens; a valid full sequence rewrites every
 *     position in one transaction
 *   - tenant-isolation: the table never declares a tenant_scope column
 *
 * The mock is intentionally simple: it tracks the last selected
 * single-row id so the delete builder can target the right entry
 * without parsing drizzle conditions. The repository always calls
 * `selectByIdAndOwner` immediately before issuing the delete, so
 * the assumption holds.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  adminWorkspacesTable,
  AdminWorkspacesNotFoundError,
  AdminWorkspacesReorderMismatchError,
  AdminWorkspacesUniqueViolationError,
  makeAdminWorkspacesRepository,
  type PostgresDatabase,
  type PostgresDeleteCapability,
} from "@comvestec/modules";

type Row = typeof adminWorkspacesTable.$inferSelect;

const createWorkspacesDatabase = () => {
  const rows = new Map<string, Row>();
  let lastSelected: string | undefined;

  const insert = (_table: unknown) => ({
    values: (values: unknown) => ({
      execute: async () => {
        const list = Array.isArray(values) ? values : [values];
        for (const value of list) {
          const v = value as Record<string, unknown>;
          const id = v.id as string;
          const now = new Date();
          rows.set(id, {
            id,
            ownerSubjectId: v.ownerSubjectId as string,
            name: v.name as string,
            serializedLayout: v.serializedLayout as string,
            position: v.position as number,
            createdAt: (v.createdAt as Date | undefined) ?? now,
            updatedAt: (v.updatedAt as Date | undefined) ?? now,
          });
        }
      },
      onConflictDoUpdate: () => ({ execute: async () => undefined }),
    }),
  });

  // Track the row-id captured by the most recent `where` predicate so
  // the update and delete builders can mutate exactly that row, since
  // the in-memory mock cannot decode drizzle's compiled condition
  // tree.
  let lastWhereId: string | undefined;

  const extractStringParams = (condition: unknown): string[] => {
    const out: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (node: unknown): void => {
      if (typeof node === "string") {
        out.push(node);
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      if (node !== null && typeof node === "object") {
        if (seen.has(node as object)) return;
        seen.add(node as object);
        const obj = node as Record<string, unknown>;
        if ("queryChunks" in obj) {
          walk(obj.queryChunks);
        }
        // Drizzle Param wraps the JS value as `{ brand, value, encoder }`.
        if ("value" in obj && "brand" in obj) {
          walk(obj.value);
        }
      }
    };
    walk(condition);
    return out;
  };

  const update = (_table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          // Repository update/reorder predicates take the form
          // `and(eq(id, X), eq(ownerSubjectId, Y))`. The first
          // string param surfaced by walking drizzle's queryChunks
          // tree is the id we should mutate.
          const params = extractStringParams(condition);
          const targetId = params[0] ?? lastWhereId;
          lastWhereId = undefined;
          if (targetId !== undefined) {
            const existing = rows.get(targetId);
            if (existing !== undefined) {
              const merged = { ...existing, ...values } as Row;
              rows.set(targetId, merged);
              return [merged];
            }
            return [];
          }
          return [];
        },
      }),
    }),
  });

  const remove = (_table: unknown) => ({
    where: (_condition: unknown) => ({
      execute: async () => {
        if (lastSelected !== undefined) {
          rows.delete(lastSelected);
          lastSelected = undefined;
        }
      },
    }),
  });

  const trackingSelect = () => ({
    from: <T>(_table: T) => ({
      where: async (_condition: unknown) => {
        const all = [...rows.values()] as Row[];
        if (all.length === 1) {
          lastSelected = all[0]!.id;
          lastWhereId = all[0]!.id;
        }
        return all;
      },
    }),
  });

  const database = {
    insert,
    update,
    select: trackingSelect,
    delete: remove,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback({
        insert,
        update: (_table: unknown) => ({
          set: (values: Record<string, unknown>) => ({
            where: (condition: unknown) => ({
              returning: async () => {
                const params = extractStringParams(condition);
                const targetId = params[0];
                if (targetId !== undefined) {
                  const existing = rows.get(targetId);
                  if (existing !== undefined) {
                    const merged = { ...existing, ...values } as Row;
                    rows.set(targetId, merged);
                    return [merged];
                  }
                }
                return [];
              },
            }),
          }),
        }),
      }),
  } as unknown as PostgresDatabase & PostgresDeleteCapability;

  return { rows, database };
};

describe("modules admin-workspaces persistence", () => {
  it("tenant-isolation: the admin-workspaces table does not declare a tenant_scope column", () => {
    expect(Object.keys(adminWorkspacesTable).includes("tenantScope")).toBe(
      false,
    );
    expect(Object.keys(adminWorkspacesTable).includes("tenantScopeId")).toBe(
      false,
    );
  });

  it("round-trips a workspace through create → get → list → update → delete and auto-assigns positions", async () => {
    const harness = createWorkspacesDatabase();
    const repo = await Effect.runPromise(
      makeAdminWorkspacesRepository(harness.database),
    );

    const first = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "Workspace A",
        serializedLayout: '{"tabs":["t1"]}',
      }),
    );
    expect(first.position).toBe(1);

    const second = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "Workspace B",
        serializedLayout: '{"tabs":["t2"]}',
      }),
    );
    expect(second.position).toBe(2);

    const got = await Effect.runPromise(repo.get(first.id, "subject-alpha"));
    expect(Option.isSome(got)).toBe(true);

    const list = await Effect.runPromise(repo.list("subject-alpha"));
    expect(list.map((w) => w.position)).toEqual([1, 2]);

    const updated = await Effect.runPromise(
      repo.update({
        id: first.id,
        ownerSubjectId: "subject-alpha",
        patch: { name: "Workspace A (renamed)" },
      }),
    );
    expect(updated.name).toBe("Workspace A (renamed)");

    await Effect.runPromise(
      repo.delete({ id: first.id, ownerSubjectId: "subject-alpha" }),
    );
    const after = await Effect.runPromise(repo.get(first.id, "subject-alpha"));
    expect(Option.isNone(after)).toBe(true);
  });

  it("per-user isolation: get/list for a different ownerSubjectId returns Option.none / empty", async () => {
    const harness = createWorkspacesDatabase();
    const repo = await Effect.runPromise(
      makeAdminWorkspacesRepository(harness.database),
    );

    const owned = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "Alpha workspace",
        serializedLayout: "{}",
      }),
    );

    const crossUserGet = await Effect.runPromise(
      repo.get(owned.id, "subject-beta"),
    );
    expect(Option.isNone(crossUserGet)).toBe(true);

    const crossUserList = await Effect.runPromise(repo.list("subject-beta"));
    expect(crossUserList).toHaveLength(0);
  });

  it("rejects a duplicate (ownerSubjectId, name) with AdminWorkspacesUniqueViolationError", async () => {
    const harness = createWorkspacesDatabase();
    const repo = await Effect.runPromise(
      makeAdminWorkspacesRepository(harness.database),
    );

    await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "Duplicate",
        serializedLayout: "{}",
      }),
    );

    const exit = await Effect.runPromiseExit(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "Duplicate",
        serializedLayout: "{}",
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const unique = collect(exit.cause, AdminWorkspacesUniqueViolationError);
      expect(unique).toBeDefined();
      expect(unique?.args.name).toBe("Duplicate");
    }
  });

  it("update of a missing workspace surfaces AdminWorkspacesNotFoundError", async () => {
    const harness = createWorkspacesDatabase();
    const repo = await Effect.runPromise(
      makeAdminWorkspacesRepository(harness.database),
    );

    const exit = await Effect.runPromiseExit(
      repo.update({
        id: "missing",
        ownerSubjectId: "subject-alpha",
        patch: { name: "should fail" },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const notFound = collect(exit.cause, AdminWorkspacesNotFoundError);
      expect(notFound).toBeDefined();
      expect(notFound?.args.id).toBe("missing");
    }
  });

  it("reorder rejects a mismatched id-set with AdminWorkspacesReorderMismatchError before mutating positions", async () => {
    const harness = createWorkspacesDatabase();
    const repo = await Effect.runPromise(
      makeAdminWorkspacesRepository(harness.database),
    );

    const w1 = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "W1",
        serializedLayout: "{}",
      }),
    );
    const w2 = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "W2",
        serializedLayout: "{}",
      }),
    );
    const positionsBefore = [
      harness.rows.get(w1.id)!.position,
      harness.rows.get(w2.id)!.position,
    ];

    const exit = await Effect.runPromiseExit(
      repo.reorder({
        ownerSubjectId: "subject-alpha",
        idsInOrder: [w1.id, "id-that-does-not-exist"],
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const mismatch = collect(exit.cause, AdminWorkspacesReorderMismatchError);
      expect(mismatch).toBeDefined();
      expect(mismatch?._tag).toBe("AdminWorkspacesReorderMismatchError");
    }

    // Positions must be untouched — the rejection happens before any
    // transaction write.
    expect([
      harness.rows.get(w1.id)!.position,
      harness.rows.get(w2.id)!.position,
    ]).toEqual(positionsBefore);
  });

  it("reorder rewrites the full position sequence atomically when the id-set matches", async () => {
    const harness = createWorkspacesDatabase();
    const repo = await Effect.runPromise(
      makeAdminWorkspacesRepository(harness.database),
    );

    const w1 = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "W1",
        serializedLayout: "{}",
      }),
    );
    const w2 = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "W2",
        serializedLayout: "{}",
      }),
    );
    const w3 = await Effect.runPromise(
      repo.create({
        ownerSubjectId: "subject-alpha",
        name: "W3",
        serializedLayout: "{}",
      }),
    );

    const reordered = await Effect.runPromise(
      repo.reorder({
        ownerSubjectId: "subject-alpha",
        idsInOrder: [w3.id, w1.id, w2.id],
      }),
    );

    expect(reordered.map((w) => w.id)).toEqual([w3.id, w1.id, w2.id]);
    expect(reordered.map((w) => w.position)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Cause-walking helper
// ---------------------------------------------------------------------------

function collect<T>(
  cause: unknown,
  ctor: new (...args: never[]) => T,
): T | undefined {
  if (cause === null || typeof cause !== "object") {
    return undefined;
  }
  if (cause instanceof ctor) {
    return cause;
  }
  if ("error" in cause) {
    const error = (cause as { error: unknown }).error;
    if (error instanceof ctor) {
      return error;
    }
  }
  for (const key of ["left", "right", "cause"] as const) {
    if (key in cause) {
      const next = collect((cause as Record<string, unknown>)[key], ctor);
      if (next !== undefined) {
        return next;
      }
    }
  }
  if (
    "errors" in cause &&
    Array.isArray((cause as { errors: unknown }).errors)
  ) {
    for (const entry of (cause as { errors: unknown[] }).errors) {
      const next = collect(entry, ctor);
      if (next !== undefined) {
        return next;
      }
    }
  }
  return undefined;
}
