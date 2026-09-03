import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.15
 * Extend the singleton Development Daily Update pointer so the canonical job,
 * pipeline pointer and most recently published Queue job can be compared without
 * guessing by updated_at.
 */
export const jobSourceOfTruthMigration: DatabaseMigration = {
  version: 29,
  name: "job_source_of_truth_m81013",
  async up(transaction) {
    // Migration 28 already creates the singleton table. These columns are added
    // once by MigrationRunner, so plain ALTER TABLE is sufficient here.
    await transaction.execute({ sql: "ALTER TABLE active_development_job ADD COLUMN source TEXT" });
    await transaction.execute({ sql: "ALTER TABLE active_development_job ADD COLUMN queue_job_id TEXT" });
    await transaction.execute({ sql: "ALTER TABLE active_development_job ADD COLUMN queue_message_id TEXT" });
    await transaction.execute({ sql: "ALTER TABLE active_development_job ADD COLUMN repaired_at TEXT" });
  },
};
