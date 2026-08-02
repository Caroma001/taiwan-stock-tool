import type { Client, ResultSet, Transaction } from "@libsql/client";
import type { DatabaseAdapter, DatabaseTransaction } from "@/lib/database/DatabaseAdapter";
import { DatabaseError } from "@/lib/database/errors";
import type { DatabaseHealth, DatabaseResult, DatabaseRow, DatabaseStatement, TransactionOptions } from "@/lib/database/types";

function mapResult<Row extends DatabaseRow>(result: ResultSet): DatabaseResult<Row> {
  return {
    rows: result.rows as unknown as readonly Row[],
    rowsAffected: result.rowsAffected,
    lastInsertRowId: result.lastInsertRowid?.toString(),
  };
}

class TursoTransactionAdapter implements DatabaseTransaction {
  constructor(private readonly transaction: Transaction) {}

  async execute<Row extends DatabaseRow = DatabaseRow>(statement: DatabaseStatement): Promise<DatabaseResult<Row>> {
    return mapResult<Row>(await this.transaction.execute({ sql: statement.sql, args: statement.args }));
  }

  async executeMany(statements: readonly DatabaseStatement[]): Promise<void> {
    if (!statements.length) return;
    await this.transaction.batch(statements.map((statement) => ({ sql: statement.sql, args: statement.args })));
  }
}

export class TursoDatabaseAdapter implements DatabaseAdapter {
  readonly name = "turso";
  private closed = false;

  constructor(private readonly client: Client) {}

  async healthCheck(): Promise<DatabaseHealth> {
    const started = Date.now();
    try {
      this.assertOpen();
      const result = await this.client.execute("SELECT sqlite_version() AS sqlite_version");
      return {
        ok: true,
        adapter: this.name,
        latencyMs: Date.now() - started,
        message: "Turso connection is healthy.",
        details: { sqliteVersion: String(result.rows[0]?.sqlite_version ?? "unknown") },
      };
    } catch (error) {
      return {
        ok: false,
        adapter: this.name,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : "Unknown Turso connection error.",
      };
    }
  }

  async execute<Row extends DatabaseRow = DatabaseRow>(statement: DatabaseStatement): Promise<DatabaseResult<Row>> {
    this.assertOpen();
    try {
      return mapResult<Row>(await this.client.execute({ sql: statement.sql, args: statement.args }));
    } catch (error) {
      throw new DatabaseError("QUERY_FAILED", "Turso query failed.", { cause: error, details: { statement: statement.sql } });
    }
  }

  async executeMany(statements: readonly DatabaseStatement[]): Promise<void> {
    this.assertOpen();
    if (!statements.length) return;
    try {
      await this.client.batch(statements.map((statement) => ({ sql: statement.sql, args: statement.args })), "write");
    } catch (error) {
      throw new DatabaseError("QUERY_FAILED", "Turso batch failed.", { cause: error });
    }
  }

  async transaction<T>(work: (transaction: DatabaseTransaction) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    this.assertOpen();
    const transaction = await this.client.transaction(options.mode === "read" ? "read" : "write");
    try {
      const value = await work(new TursoTransactionAdapter(transaction));
      await transaction.commit();
      return value;
    } catch (error) {
      await transaction.rollback();
      throw new DatabaseError("TRANSACTION_FAILED", "Turso transaction rolled back.", { cause: error });
    } finally {
      transaction.close();
    }
  }

  async close(): Promise<void> {
    if (!this.closed) this.client.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new DatabaseError("CONNECTION_FAILED", "Turso adapter is closed.");
  }
}
