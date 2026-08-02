import { createClient, type Client } from "@libsql/client";
import { getTursoEnvironment } from "./env";

let client: Client | null = null;

export function getTursoClient(): Client {
  if (!client) {
    const env = getTursoEnvironment();
    client = createClient({ url: env.url, authToken: env.authToken });
  }
  return client;
}

export function resetTursoClientForTests(): void {
  client?.close();
  client = null;
}
