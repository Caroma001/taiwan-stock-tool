import { timingSafeEqual } from "node:crypto";

export function safeEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && safeEqual(request.headers.get("authorization"), `Bearer ${secret}`);
}

export function isAuthorizedAdmin(request: Request): boolean {
  const secret = process.env.CLOUD_ADMIN_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get("x-cloud-admin-secret"), secret) ||
    safeEqual(request.headers.get("authorization"), `Bearer ${secret}`);
}
