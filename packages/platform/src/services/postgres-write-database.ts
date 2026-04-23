import type { PgTable } from "drizzle-orm/pg-core";
import {
  type PostgresDatabase,
  type PostgresInsertBuilder,
  type PostgresTransaction,
} from "@comvestec/modules";
import type { PostgresRuntimeDatabase } from "../adapters";

export const buildWriteDatabase = (
  database: PostgresRuntimeDatabase,
): PostgresDatabase => {
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

  return {
    insert: (table) => buildInsert(database, table),
    transaction: (callback) =>
      database.transaction(async (transaction) =>
        callback({
          insert: (table) => buildInsert(transaction, table),
        } satisfies PostgresTransaction),
      ),
  };
};
