export type DatabaseValue = string | number | bigint | boolean | null | Uint8Array;

export type DatabaseParameters = readonly DatabaseValue[] | Record<string, DatabaseValue>;

export interface DatabaseRow {
  readonly [column: string]: DatabaseValue;
}

export interface DatabaseStatement {
  readonly sql: string;
  readonly args?: DatabaseParameters;
}

export interface DatabaseResult<Row extends DatabaseRow = DatabaseRow> {
  readonly rows: readonly Row[];
  readonly rowsAffected: number;
  readonly lastInsertRowId?: string | number;
}

export interface DatabaseHealth {
  readonly ok: boolean;
  readonly adapter: string;
  readonly latencyMs: number;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface TransactionOptions {
  readonly mode?: "read" | "write";
  readonly timeoutMs?: number;
}
