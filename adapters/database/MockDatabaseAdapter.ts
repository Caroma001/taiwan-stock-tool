import type {
  DatabaseAdapter,
  DatabaseTransaction,
} from "@/lib/database/DatabaseAdapter";
import { DatabaseError } from "@/lib/database/errors";
import type {
  DatabaseHealth,
  DatabaseResult,
  DatabaseRow,
  DatabaseStatement,
  TransactionOptions,
} from "@/lib/database/types";

export type MockStatementHandler = (
  statement: DatabaseStatement,
) => Promise<DatabaseResult> | DatabaseResult;

export class MockDatabaseAdapter implements DatabaseAdapter {
  public readonly name = "mock";
  private readonly handlers: MockStatementHandler[] = [];
  private readonly history: DatabaseStatement[] = [];
  private closed = false;

  enqueue(handler: MockStatementHandler): void {
    this.handlers.push(handler);
  }

  getHistory(): readonly DatabaseStatement[] {
    return this.history.map((statement) => ({ ...statement }));
  }

  async healthCheck(): Promise<DatabaseHealth> {
    return {
      ok: !this.closed,
      adapter: this.name,
      latencyMs: 0,
      message: this.closed ? "Mock adapter is closed." : "Mock adapter is ready.",
    };
  }

  async execute<Row extends DatabaseRow = DatabaseRow>(
    statement: DatabaseStatement,
  ): Promise<DatabaseResult<Row>> {
    this.assertOpen();
    this.history.push({ ...statement });
    const handler = this.handlers.shift();
    if (!handler) {
      return { rows: [], rowsAffected: 0 };
    }
    return (await handler(statement)) as DatabaseResult<Row>;
  }

  async executeMany(statements: readonly DatabaseStatement[]): Promise<void> {
    for (const statement of statements) {
      await this.execute(statement);
    }
  }

  async transaction<T>(
    work: (transaction: DatabaseTransaction) => Promise<T>,
    _options?: TransactionOptions,
  ): Promise<T> {
    this.assertOpen();
    const historyStart = this.history.length;
    try {
      return await work(this);
    } catch (error) {
      this.history.splice(historyStart);
      throw new DatabaseError("TRANSACTION_FAILED", "Mock transaction rolled back.", {
        cause: error,
      });
    }
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new DatabaseError("CONNECTION_FAILED", "Mock adapter is closed.");
    }
  }
}
