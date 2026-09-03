declare module "@vercel/queue" {
  export function send<T>(
    topic: string,
    message: T,
    options?: { delaySeconds?: number; retentionSeconds?: number; idempotencyKey?: string },
  ): Promise<{ messageId: string }>;

  export function handleCallback<T>(
    callback: (message: T, metadata: { messageId: string; deliveryCount: number }) => Promise<void> | void,
    options?: unknown,
  ): (request: Request) => Promise<Response>;
}
