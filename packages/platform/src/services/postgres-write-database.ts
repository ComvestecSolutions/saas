import type { PgTable } from "drizzle-orm/pg-core";
import {
  type PostgresDatabase,
  type PostgresDeleteBuilder,
  type PostgresDeleteCapability,
  type PostgresInsertBuilder,
  type PostgresSelectBuilder,
  type PostgresTransaction,
  type PostgresUpdateBuilder,
} from "@comvestec/modules";
import type { PostgresRuntimeDatabase } from "../adapters";

export const buildWriteDatabase = (
  database: PostgresRuntimeDatabase,
): PostgresDatabase & PostgresDeleteCapability => {
  const buildInsert = <TTable extends PgTable>(
    insertable: Pick<PostgresRuntimeDatabase, "insert">,
    table: TTable,
  ): PostgresInsertBuilder<TTable> => ({
    values: (
      values: Parameters<PostgresInsertBuilder<TTable>["values"]>[0],
    ) => {
      const insertBuilder = insertable.insert(table);
      const valuesBuilder = Array.isArray(values)
        ? insertBuilder.values(values)
        : insertBuilder.values(values);

      return {
        execute: () => valuesBuilder.execute(),
        onConflictDoUpdate: (
          options: Parameters<
            ReturnType<
              PostgresInsertBuilder<TTable>["values"]
            >["onConflictDoUpdate"]
          >[0],
        ) => valuesBuilder.onConflictDoUpdate(options),
      };
    },
  });

  const buildUpdate = <TTable extends PgTable>(
    updatable: Pick<PostgresRuntimeDatabase, "update">,
    table: TTable,
  ): PostgresUpdateBuilder<TTable> => ({
    set: (values) => {
      const updateBuilder = updatable.update(table).set(values);

      return {
        where: (condition) => ({
          returning: () =>
            updateBuilder
              .where(condition as Parameters<typeof updateBuilder.where>[0])
              .returning() as Promise<Array<TTable["$inferSelect"]>>,
        }),
      };
    },
  });

  const buildSelect = (
    readable: Pick<PostgresRuntimeDatabase, "select">,
  ): PostgresSelectBuilder => ({
    from: (table) => ({
      where: (condition) =>
        readable
          .select()
          .from(table as never)
          .where(condition as never) as Promise<
          Array<typeof table.$inferSelect>
        >,
    }),
  });

  const buildDelete = <TTable extends PgTable>(
    deletable: Pick<PostgresRuntimeDatabase, "delete">,
    table: TTable,
  ): PostgresDeleteBuilder => ({
    where: (condition) => {
      const deleteBuilder = deletable
        .delete(table)
        .where(
          condition as Parameters<
            ReturnType<PostgresRuntimeDatabase["delete"]>["where"]
          >[0],
        );
      return {
        execute: () => deleteBuilder.execute(),
      };
    },
  });

  return {
    insert: (table) => buildInsert(database, table),
    select: () => buildSelect(database),
    update: (table) => buildUpdate(database, table),
    delete: (table) => buildDelete(database, table),
    transaction: (callback) =>
      database.transaction(async (transaction) =>
        callback({
          insert: (table) => buildInsert(transaction, table),
          update: (table) => buildUpdate(transaction, table),
        } satisfies PostgresTransaction),
      ),
  };
};
