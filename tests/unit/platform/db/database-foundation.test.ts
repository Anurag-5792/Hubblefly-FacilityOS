import { describe, expect, it } from "vitest";

import {
  DatabaseForeignKeyViolationError,
  DatabaseSerializationError,
  DatabaseUnavailableError,
  DatabaseUniqueViolationError,
  translateDatabaseError,
} from "../../../../src/platform/db/errors";
import {
  OptimisticConcurrencyError,
  OptimisticConcurrencyInvariantError,
  assertSingleVersionedUpdate,
} from "../../../../src/platform/db/optimistic-concurrency";

describe("database error translation", () => {
  it("translates PostgreSQL constraint and concurrency codes", () => {
    expect(translateDatabaseError(Object.assign(new Error("duplicate"), { code: "23505" }))).toBeInstanceOf(
      DatabaseUniqueViolationError,
    );
    expect(translateDatabaseError(Object.assign(new Error("fk"), { code: "23503" }))).toBeInstanceOf(
      DatabaseForeignKeyViolationError,
    );
    expect(translateDatabaseError(Object.assign(new Error("serialization"), { code: "40001" }))).toBeInstanceOf(
      DatabaseSerializationError,
    );
    expect(translateDatabaseError(Object.assign(new Error("offline"), { code: "ECONNREFUSED" }))).toBeInstanceOf(
      DatabaseUnavailableError,
    );
  });

  it("preserves application errors that are not PostgreSQL failures", () => {
    const applicationError = new Error("application validation failed");
    expect(translateDatabaseError(applicationError)).toBe(applicationError);
  });
});

describe("optimistic concurrency helper", () => {
  const context = { aggregate: "Fixture", aggregateId: "fixture-1", expectedVersion: 3 };

  it("accepts exactly one updated row", () => {
    expect(() => assertSingleVersionedUpdate(1, context)).not.toThrow();
  });

  it("rejects a stale version deterministically", () => {
    expect(() => assertSingleVersionedUpdate(0, context)).toThrow(OptimisticConcurrencyError);
  });

  it("rejects an invalid multi-row versioned update", () => {
    expect(() => assertSingleVersionedUpdate(2, context)).toThrow(
      OptimisticConcurrencyInvariantError,
    );
  });
});
