export type NotificationLevel = "info" | "warning" | "critical" | "recovery";

export async function sendProductionNotification(input: {
  level: NotificationLevel;
  title: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<{ sent: boolean; reason?: string }> {
  const url = process.env.ERROR_NOTIFICATION_WEBHOOK_URL?.trim();
  if (!url) return { sent: false, reason: "ERROR_NOTIFICATION_WEBHOOK_URL not configured" };
  const payload = {
    app: "twstock",
    version: "7.7.0",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    occurredAt: new Date().toISOString(),
    ...input,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Notification webhook failed: ${response.status}`);
  return { sent: true };
}
