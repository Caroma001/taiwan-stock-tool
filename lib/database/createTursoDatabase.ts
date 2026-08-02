import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { DatabaseFactory } from "./DatabaseFactory";

export function createTursoDatabase(): TursoDatabaseAdapter {
  return new TursoDatabaseAdapter(getTursoClient());
}

export function registerTursoDatabase(factory: DatabaseFactory): void {
  factory.register("turso", createTursoDatabase);
}
