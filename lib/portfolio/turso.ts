import { getTursoClient } from "@/lib/turso/client";

export type HoldingType = "real" | "test";
export const USER_NAME = "Bruce";
export const db = () => getTursoClient();
export const nowIso = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
export const rowObject = (row: unknown) => row as Record<string, unknown>;
