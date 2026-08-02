declare const process: { env: Record<string, string | undefined>; argv: string[]; exitCode?: number };
declare module "node:fs" { export function readFileSync(path: string, encoding: string): string; export function existsSync(path: string): boolean; }
declare module "node:crypto" { export function randomUUID(): string; }
declare module "@libsql/client" {
  export type InValue = string | number | bigint | boolean | null | Uint8Array;
  export interface ResultSet { rows: Array<Record<string, InValue>>; rowsAffected: number; lastInsertRowid?: bigint | number; }
  export interface Transaction { execute(arg: string | {sql:string,args?:unknown}): Promise<ResultSet>; batch(args: unknown[]): Promise<unknown>; commit(): Promise<void>; rollback(): Promise<void>; close(): void; }
  export interface Client { execute(arg: string | {sql:string,args?:unknown}): Promise<ResultSet>; batch(args: unknown[], mode?: string): Promise<unknown>; transaction(mode?: string): Promise<Transaction>; close(): void; }
  export function createClient(config: {url:string;authToken?:string}): Client;
}
