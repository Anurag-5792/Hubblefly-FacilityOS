import { InvariantViolation, ValidationError } from "./errors";
import type { JsonObject } from "./json";

export function invariant(condition: unknown, message: string, publicDetails?: JsonObject): asserts condition {
  if (!condition) throw new InvariantViolation(message, publicDetails);
}

export function precondition(condition: unknown, message: string, publicDetails?: JsonObject): asserts condition {
  if (!condition) throw new ValidationError(message, publicDetails);
}

export function requireValue<T>(value: T | null | undefined, message: string): T {
  precondition(value !== null && value !== undefined, message);
  return value;
}
