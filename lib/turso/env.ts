import { DatabaseError } from "@/lib/database";

export interface TursoEnvironment {
  readonly url: string;
  readonly authToken: string;
}

export function getTursoEnvironment(): TursoEnvironment {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const url = env.TURSO_DATABASE_URL?.trim();
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  const missing = [!url ? "TURSO_DATABASE_URL" : null, !authToken ? "TURSO_AUTH_TOKEN" : null].filter(Boolean);
  if (missing.length) {
    throw new DatabaseError(
      "NOT_CONFIGURED",
      `Missing Turso environment variable(s): ${missing.join(", ")}. Copy .env.local.example to .env.local and fill them in.`,
    );
  }
  if (!url!.startsWith("libsql://") && !url!.startsWith("https://") && !url!.startsWith("file:")) {
    throw new DatabaseError("INVALID_ARGUMENT", "TURSO_DATABASE_URL must begin with libsql://, https://, or file:.");
  }
  return { url: url!, authToken: authToken! };
}
