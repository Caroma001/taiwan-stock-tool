import type {
  DatabaseHealth,
  DatabaseResult,
  DatabaseRow,
  DatabaseStatement,
  TransactionOptions,
} from "./types";

export interface DatabaseTransaction {
  execute<Row extends DatabaseRow = DatabaseRow>(
    statement: DatabaseStatement,
  ): Promise<DatabaseResult<Row>>;

  executeMany(statements: readonly DatabaseStatement[]): Promise<void>;
}

export interface DatabaseAdapter extends DatabaseTransaction {
  readonly name: string;

  healthCheck(): Promise<DatabaseHealth>;

  transaction<T>(
    work: (transaction: DatabaseTransaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;

  close(): Promise<void>;
}
