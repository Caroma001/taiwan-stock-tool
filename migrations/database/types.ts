import type { DatabaseTransaction } from "@/lib/database";

export interface DatabaseMigration {
  readonly version: number;
  readonly name: string;
  up(transaction: DatabaseTransaction): Promise<void>;
}

export interface MigrationStatus {
  readonly currentVersion: number;
  readonly applied: readonly number[];
  readonly pending: readonly number[];
}
