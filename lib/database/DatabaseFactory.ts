import type { DatabaseAdapter } from "./DatabaseAdapter";
import { DatabaseError } from "./errors";

export type DatabaseAdapterFactory = () => DatabaseAdapter;

export class DatabaseFactory {
  private readonly factories = new Map<string, DatabaseAdapterFactory>();

  register(name: string, factory: DatabaseAdapterFactory): void {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      throw new DatabaseError("INVALID_ARGUMENT", "Database adapter name cannot be empty.");
    }
    this.factories.set(normalized, factory);
  }

  create(name: string): DatabaseAdapter {
    const normalized = name.trim().toLowerCase();
    const factory = this.factories.get(normalized);
    if (!factory) {
      throw new DatabaseError(
        "NOT_CONFIGURED",
        `Database adapter '${name}' is not registered. Registered adapters: ${this.list().join(", ") || "none"}.`,
      );
    }
    return factory();
  }

  has(name: string): boolean {
    return this.factories.has(name.trim().toLowerCase());
  }

  list(): readonly string[] {
    return [...this.factories.keys()].sort();
  }
}
