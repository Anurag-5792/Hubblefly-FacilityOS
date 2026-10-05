export type DatabaseFailureKind =
  | "unique_violation"
  | "foreign_key_violation"
  | "serialization_failure"
  | "database_unavailable"
  | "transaction_failure"
  | "database_operation_failure";

export class DatabaseInfrastructureError extends Error {
  readonly kind: DatabaseFailureKind;
  readonly retryable: boolean;
  readonly postgresCode?: string;
  override readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      kind: DatabaseFailureKind;
      retryable: boolean;
      postgresCode?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = new.target.name;
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.postgresCode = options.postgresCode;
    this.cause = options.cause;
  }
}

export class DatabaseUniqueViolationError extends DatabaseInfrastructureError {
  constructor(code: string, cause: unknown) {
    super("A database uniqueness constraint was violated.", {
      kind: "unique_violation",
      retryable: false,
      postgresCode: code,
      cause,
    });
  }
}

export class DatabaseForeignKeyViolationError extends DatabaseInfrastructureError {
  constructor(code: string, cause: unknown) {
    super("A referenced database record does not exist or cannot be changed.", {
      kind: "foreign_key_violation",
      retryable: false,
      postgresCode: code,
      cause,
    });
  }
}

export class DatabaseSerializationError extends DatabaseInfrastructureError {
  constructor(code: string, cause: unknown) {
    super("The database operation conflicted with another transaction.", {
      kind: "serialization_failure",
      retryable: true,
      postgresCode: code,
      cause,
    });
  }
}

export class DatabaseUnavailableError extends DatabaseInfrastructureError {
  constructor(cause?: unknown, code?: string) {
    super("The database is unavailable.", {
      kind: "database_unavailable",
      retryable: true,
      postgresCode: code,
      cause,
    });
  }
}

export class DatabaseTransactionError extends DatabaseInfrastructureError {
  constructor(code: string | undefined, cause: unknown) {
    super("The database transaction failed.", {
      kind: "transaction_failure",
      retryable: false,
      postgresCode: code,
      cause,
    });
  }
}

export class DatabaseOperationError extends DatabaseInfrastructureError {
  constructor(code: string | undefined, cause: unknown) {
    super("The database operation failed.", {
      kind: "database_operation_failure",
      retryable: false,
      postgresCode: code,
      cause,
    });
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const unavailableCodes = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "57P01",
  "57P02",
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

export function translateDatabaseError(error: unknown): Error {
  if (error instanceof DatabaseInfrastructureError) {
    return error;
  }

  const code = errorCode(error);

  if (!code) {
    return error instanceof Error ? error : new DatabaseOperationError(undefined, error);
  }

  switch (code) {
    case "23505":
      return new DatabaseUniqueViolationError(code, error);
    case "23503":
      return new DatabaseForeignKeyViolationError(code, error);
    case "40001":
    case "40P01":
      return new DatabaseSerializationError(code, error);
    case "25P02":
      return new DatabaseTransactionError(code, error);
    default:
      if (unavailableCodes.has(code) || code.startsWith("08")) {
        return new DatabaseUnavailableError(error, code);
      }
      return new DatabaseOperationError(code, error);
  }
}
