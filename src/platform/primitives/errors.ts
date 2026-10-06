import type { JsonObject } from "./json";

export type ApplicationErrorCode =
  | "VALIDATION_ERROR"
  | "INVARIANT_VIOLATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CONCURRENCY_CONFLICT"
  | "INVALID_STATE_TRANSITION"
  | "IDEMPOTENCY_CONFLICT"
  | "INFRASTRUCTURE_UNAVAILABLE"\n  | "AUTHENTICATION_REQUIRED"\n  | "FACILITY_USER_NOT_PROVISIONED"\n  | "FACILITY_USER_INACTIVE";

export abstract class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly publicMessage: string;
  readonly publicDetails?: JsonObject;
  override readonly cause?: unknown;

  protected constructor(options: {
    code: ApplicationErrorCode;
    message: string;
    publicMessage?: string;
    publicDetails?: JsonObject;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = new.target.name;
    this.code = options.code;
    this.publicMessage = options.publicMessage ?? options.message;
    this.publicDetails = options.publicDetails;
    this.cause = options.cause;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, publicDetails?: JsonObject) {
    super({ code: "VALIDATION_ERROR", message, publicDetails });
  }
}
export class InvariantViolation extends ApplicationError {
  constructor(message: string, publicDetails?: JsonObject) {
    super({ code: "INVARIANT_VIOLATION", message, publicDetails });
  }
}
export class NotFoundError extends ApplicationError {
  constructor(resource: string) {
    super({ code: "NOT_FOUND", message: `${resource} was not found.` });
  }
}
export class ConflictError extends ApplicationError {
  constructor(message: string, publicDetails?: JsonObject) {
    super({ code: "CONFLICT", message, publicDetails });
  }
}
export class ConcurrencyConflictError extends ApplicationError {
  constructor(message = "The record changed after it was read. Refresh and retry.") {
    super({ code: "CONCURRENCY_CONFLICT", message });
  }
}
export class InvalidStateTransitionError extends ApplicationError {
  constructor(currentState: string, requestedState: string) {
    super({
      code: "INVALID_STATE_TRANSITION",
      message: `State transition from ${currentState} to ${requestedState} is not allowed.`,
      publicDetails: { currentState, requestedState },
    });
  }
}
export class IdempotencyConflictError extends ApplicationError {
  constructor(message = "The idempotency key is already associated with a different operation.") {
    super({ code: "IDEMPOTENCY_CONFLICT", message });
  }
}
export class InfrastructureUnavailableError extends ApplicationError {
  constructor(serviceName: string, cause?: unknown) {
    super({
      code: "INFRASTRUCTURE_UNAVAILABLE",
      message: `${serviceName} is unavailable.`,
      publicMessage: "A required service is temporarily unavailable.",
      cause,
    });
  }
}
