import type { PgTable } from "drizzle-orm/pg-core";
import type { IndexColumn } from "drizzle-orm/pg-core/indexes";
import type { PgInsertValue } from "drizzle-orm/pg-core/query-builders/insert";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core/query-builders/update";

export type PostgresConflictTarget = IndexColumn | IndexColumn[];

type PostgresInsertRow<TTable extends PgTable> = PgInsertValue<TTable>;

export type PostgresInsertCommand = {
  readonly execute: () => Promise<unknown>;
};

export type PostgresInsertValuesBuilder<TTable extends PgTable = PgTable> = {
  readonly onConflictDoUpdate: (options: {
    readonly target: PostgresConflictTarget;
    readonly set: PgUpdateSetSource<TTable>;
  }) => PostgresInsertCommand;
};

export type PostgresInsertBuilder<TTable extends PgTable = PgTable> = {
  readonly values: (
    values: PostgresInsertRow<TTable> | PostgresInsertRow<TTable>[],
  ) => PostgresInsertValuesBuilder<TTable>;
};

export type PostgresTransaction = {
  readonly insert: <TTable extends PgTable>(
    table: TTable,
  ) => PostgresInsertBuilder<TTable>;
};

export type PostgresDatabase = PostgresTransaction & {
  readonly transaction: <T>(
    callback: (tx: PostgresTransaction) => Promise<T>,
  ) => Promise<T>;
};
