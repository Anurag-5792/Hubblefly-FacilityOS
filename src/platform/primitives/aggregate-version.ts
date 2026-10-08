import type { Brand } from "./brand";

export type AggregateVersion = Brand<number, "AggregateVersion">;

export function parseAggregateVersion(value: number): AggregateVersion {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Aggregate version must be a non-negative safe integer.");
  }
  return value as AggregateVersion;
}

export function initialAggregateVersion(): AggregateVersion {
  return parseAggregateVersion(0);
}

export function nextAggregateVersion(current: AggregateVersion): AggregateVersion {
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Aggregate version cannot be incremented beyond MAX_SAFE_INTEGER.");
  }
  return parseAggregateVersion(current + 1);
}

export function aggregateVersionsEqual(left: AggregateVersion, right: AggregateVersion): boolean {
  return left === right;
}
