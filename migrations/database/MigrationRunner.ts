import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { DatabaseError } from "@/lib/database";
import type { DatabaseMigration, MigrationStatus } from "./types";

interface MigrationRow extends DatabaseRow {
  version: number;
}

export class MigrationRunner {
  constructor(
    private readonly database: DatabaseAdapter,
    private readonly migrations: readonly DatabaseMigration[],
  ) {
    const versions = migrations.map((migration) => migration.version);
    if (new Set(versions).size !== versions.length) {
      throw new DatabaseError("INVALID_ARGUMENT", "Migration versions must be unique.");
    }
  }

  async status(): Promise<MigrationStatus> {
    await this.ensureMetadataTable();
    const result = await this.database.execute<MigrationRow>({
      sql: "SELECT version FROM schema_migrations ORDER BY version",
    });
    const applied = result.rows.map((row) => Number(row.version));
    const pending = this.sortedMigrations()
      .map((migration) => migration.version)
      .filter((version) => !applied.includes(version));
    return {
      currentVersion: applied.at(-1) ?? 0,
      applied,
      pending,
    };
  }

  async migrate(): Promise<MigrationStatus> {
    await this.ensureMetadataTable();
    const initial = await this.status();
    const appliedSet = new Set(initial.applied);

    for (const migration of this.sortedMigrations()) {
      if (appliedSet.has(migration.version)) continue;
      try {
        await this.database.transaction(async (transaction) => {
          await migration.up(transaction);
          await transaction.execute({
            sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            args: [migration.version, migration.name, new Date().toISOString()],
          });
        }, { mode: "write" });
      } catch (error) {
        throw new DatabaseError(
          "MIGRATION_FAILED",
          `Migration ${migration.version} (${migration.name}) failed.`,
          { cause: error },
        );
      }
    }
    return this.status();
  }

  private async ensureMetadataTable(): Promise<void> {
    await this.database.execute({
      sql: `CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              applied_at TEXT NOT NULL
            )`,
    });
  }

  private sortedMigrations(): readonly DatabaseMigration[] {
    return [...this.migrations].sort((a, b) => a.version - b.version);
  }
}
