export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export function deepFreezeJson<T extends JsonValue>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeJson(item);
    return Object.freeze(value) as Readonly<T>;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) deepFreezeJson(item);
    return Object.freeze(value) as Readonly<T>;
  }
  return value as Readonly<T>;
}
