export type DatabaseErrorCode =
  | "NOT_CONFIGURED"
  | "CONNECTION_FAILED"
  | "QUERY_FAILED"
  | "TRANSACTION_FAILED"
  | "MIGRATION_FAILED"
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "CONFLICT";

export class DatabaseError extends Error {
  public readonly code: DatabaseErrorCode;
  public readonly cause?: unknown;
  public readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseErrorCode,
    message: string,
    options: {
      cause?: unknown;
      details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    this.cause = options.cause;
    this.details = options.details;
  }
}
