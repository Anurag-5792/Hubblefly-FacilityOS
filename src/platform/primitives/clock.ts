import type { Brand } from "./brand";

export type UtcTimestamp = Brand<string, "UtcTimestamp">;

export interface Clock {
  now(): Date;
  nowUtc(): UtcTimestamp;
}

export function toUtcTimestamp(value: Date): UtcTimestamp {
  if (Number.isNaN(value.getTime())) throw new TypeError("Timestamp must be a valid Date.");
  return value.toISOString() as UtcTimestamp;
}

export function parseUtcTimestamp(value: string): UtcTimestamp {
  if (!value.endsWith("Z")) {
    throw new TypeError("Persisted timestamp must be UTC and end with Z.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError("Persisted timestamp must be a canonical UTC ISO-8601 value.");
  }
  return value as UtcTimestamp;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowUtc(): UtcTimestamp {
    return toUtcTimestamp(this.now());
  }
}

export class FixedClock implements Clock {
  private readonly fixed: Date;

  constructor(value: Date | string) {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) throw new TypeError("FixedClock requires a valid timestamp.");
    this.fixed = new Date(date.getTime());
  }

  now(): Date {
    return new Date(this.fixed.getTime());
  }

  nowUtc(): UtcTimestamp {
    return toUtcTimestamp(this.fixed);
  }
}

export class TestClock implements Clock {
  private current: Date;

  constructor(value: Date | string) {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) throw new TypeError("TestClock requires a valid timestamp.");
    this.current = new Date(date.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  nowUtc(): UtcTimestamp {
    return toUtcTimestamp(this.current);
  }

  set(value: Date | string): void {
    const next = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(next.getTime())) throw new TypeError("TestClock requires a valid timestamp.");
    this.current = new Date(next.getTime());
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds)) {
      throw new TypeError("Clock advance must be a finite millisecond value.");
    }
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
