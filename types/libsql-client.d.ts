declare module "@libsql/client" {
  export type InValue = string | number | bigint | boolean | null | Uint8Array;
  export interface InStatement { sql: string; args?: readonly InValue[] | Record<string, InValue>; }
  export interface ResultSet { rows: Array<Record<string, unknown>>; rowsAffected: number; lastInsertRowid?: bigint; }
  export interface Transaction {
    execute(statement: string | InStatement): Promise<ResultSet>;
    batch(statements: readonly InStatement[]): Promise<ResultSet[]>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    close(): void;
  }
  export interface Client {
    execute(statement: string | InStatement): Promise<ResultSet>;
    batch(statements: readonly InStatement[], mode?: "write" | "read" | "deferred"): Promise<ResultSet[]>;
    transaction(mode?: "write" | "read" | "deferred"): Promise<Transaction>;
    close(): void;
  }
  export function createClient(config: { url: string; authToken?: string }): Client;
}
