import { ApplicationError } from "./errors";
import type { JsonObject, JsonValue } from "./json";

export type PublicErrorPayload = JsonObject;

export function serializePublicError(error: unknown): PublicErrorPayload {
  if (error instanceof ApplicationError) {
    const payload: Record<string, JsonValue> = {
      code: error.code,
      message: error.publicMessage,
    };
    if (error.publicDetails) {
      payload.details = error.publicDetails;
    }
    return Object.freeze(payload);
  }
  return Object.freeze({ code: "INTERNAL_ERROR", message: "An internal error occurred." });
}

export function serializeForTransport(value: unknown): JsonValue {
  return serializeValue(value, new WeakSet<object>());
}

function serializeValue(value: unknown, seen: WeakSet<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers cannot be serialized.");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("Invalid Date cannot be serialized.");
    return value.toISOString();
  }
  if (value instanceof Error) return serializePublicError(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Circular values cannot be serialized.");
    seen.add(value);
    const result = value.map((item) => serializeValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) throw new TypeError("Circular values cannot be serialized.");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Only plain objects may be serialized.");
    }
    seen.add(value);
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) output[key] = serializeValue(item, seen);
    }
    seen.delete(value);
    return output;
  }
  throw new TypeError(`Unsupported transport value type: ${typeof value}.`);
}
