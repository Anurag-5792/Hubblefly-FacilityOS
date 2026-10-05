import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseDatabaseRuntimeConfig } from "../../../src/platform/db/config";
import {
  DatabaseUniqueViolationError,
} from "../../../src/platform/db/errors";
import { OptimisticConcurrencyError } from "../../../src/platform/db/optimistic-concurrency";
import { createPostgresPool } from "../../../src/platform/db/pool";
import { createDatabaseRuntime, type DatabaseRuntime } from "../../../src/platform/db/runtime";
import { NestedTransactionError } from "../../../src/platform/db/unit-of-work";
import {
  RecordRepository,
  SideEffectRepository,
  type W003TestDatabase,
} from "./fixtures/repositories";

const fixtureSql = readFileSync(
  fileURLToPath(new URL("./fixtures/w0-03.sql", import.meta.url)),
  "utf8",
);

let runtime: DatabaseRuntime<W003TestDatabase>;
let pool: Pool;

function recordRepository(transaction: Parameters<typeof RecordRepository>[0]): RecordRepository {
  return new RecordRepository(transaction);
}

function sideEffectRepository(
  transaction: Parameters<typeof SideEffectRepository>[0],
): SideEffectRepository {
  return new SideEffectRepository(transaction);
}

beforeAll(async () => {
  const config = parseDatabaseRuntimeConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    FACILITYOS_DB_POOL_MAX: "1",
    FACILITYOS_DB_IDLE_TIMEOUT_MS: "5000",
    FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
    FACILITYOS_DB_APPLICATION_NAME: "facilityos-w0-03-tests",
  });

  pool = createPostgresPool(config);
  await pool.query(fixtureSql);
  runtime = createDatabaseRuntime<W003TestDatabase>(pool);
});

beforeEach(async () => {
  await runtime.database.deleteFrom("w0_03_side_effects").execute();
  await runtime.database.deleteFrom("w0_03_records").execute();
});

afterAll(async () => {
  await runtime.destroy();
});

describe("W0-03 PostgreSQL access foundation", () => {
  it("connects and executes a typed query", async () => {
    await runtime.healthCheck();

    await runtime.unitOfWork.withTransaction(async (uow) => {
      await uow.repository(recordRepository).insert({
        id: "typed-query",
        name: "typed-query",
        value: "ready",
        version: 1,
      });
    });

    const row = await runtime.database
      .selectFrom("w0_03_records")
      .select(["id", "value", "version"])
      .where("id", "=", "typed-query")
      .executeTakeFirstOrThrow();

    expect(row).toEqual({ id: "typed-query", value: "ready", version: 1 });
  });

  it("commits multiple repositories exactly once in the same transaction", async () => {
    await runtime.unitOfWork.withTransaction(async (uow) => {
      await uow.repository(recordRepository).insert({
        id: "commit",
        name: "commit",
        value: "A",
        version: 1,
      });
      await uow.repository(sideEffectRepository).insert({
        id: "commit-effect",
        record_id: "commit",
        note: "B",
      });
    });

    const [record, effect] = await Promise.all([
      runtime.database
        .selectFrom("w0_03_records")
        .selectAll()
        .where("id", "=", "commit")
        .executeTakeFirst(),
      runtime.database
        .selectFrom("w0_03_side_effects")
        .selectAll()
        .where("id", "=", "commit-effect")
        .executeTakeFirst(),
    ]);

    expect(record?.value).toBe("A");
    expect(effect?.note).toBe("B");
    expect(runtime.poolSnapshot()).toMatchObject({ total: 1, idle: 1, waiting: 0, closed: false });
  });

  it("rolls back every repository when the application operation throws", async () => {
    const applicationError = new Error("application failure");

    await expect(
      runtime.unitOfWork.withTransaction(async (uow) => {
        await uow.repository(recordRepository).insert({
          id: "rollback",
          name: "rollback",
          value: "A",
          version: 1,
        });
        await uow.repository(sideEffectRepository).insert({
          id: "rollback-effect",
          record_id: "rollback",
          note: "B",
        });
        throw applicationError;
      }),
    ).rejects.toBe(applicationError);

    const count = await runtime.database
      .selectFrom("w0_03_records")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("id", "=", "rollback")
      .executeTakeFirstOrThrow();

    expect(Number(count.count)).toBe(0);
    expect(runtime.poolSnapshot()).toMatchObject({ total: 1, idle: 1, waiting: 0, closed: false });
  });

  it("rolls back earlier writes and translates a PostgreSQL unique violation", async () => {
    await runtime.unitOfWork.withTransaction(async (uow) => {
      await uow.repository(recordRepository).insert({
        id: "existing",
        name: "duplicate-name",
        value: "existing",
        version: 1,
      });
    });

    await expect(
      runtime.unitOfWork.withTransaction(async (uow) => {
        await uow.repository(recordRepository).insert({
          id: "should-rollback",
          name: "first-write",
          value: "A",
          version: 1,
        });
        await uow.repository(recordRepository).insert({
          id: "duplicate",
          name: "duplicate-name",
          value: "B",
          version: 1,
        });
      }),
    ).rejects.toBeInstanceOf(DatabaseUniqueViolationError);

    const rolledBack = await runtime.database
      .selectFrom("w0_03_records")
      .select("id")
      .where("id", "=", "should-rollback")
      .executeTakeFirst();

    expect(rolledBack).toBeUndefined();
  });

  it("rejects a stale optimistic version", async () => {
    await runtime.unitOfWork.withTransaction(async (uow) => {
      await uow.repository(recordRepository).insert({
        id: "versioned",
        name: "versioned",
        value: "v1",
        version: 1,
      });
    });

    await runtime.unitOfWork.withTransaction(async (uow) => {
      await uow.repository(recordRepository).updateValue("versioned", 1, "v2");
    });

    await expect(
      runtime.unitOfWork.withTransaction(async (uow) => {
        await uow.repository(recordRepository).updateValue("versioned", 1, "stale");
      }),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);

    const current = await runtime.database
      .selectFrom("w0_03_records")
      .select(["value", "version"])
      .where("id", "=", "versioned")
      .executeTakeFirstOrThrow();

    expect(current).toEqual({ value: "v2", version: 2 });
  });

  it("rejects accidental nested Unit-of-Work transactions", async () => {
    await expect(
      runtime.unitOfWork.withTransaction(async () => {
        await runtime.unitOfWork.withTransaction(async () => undefined);
      }),
    ).rejects.toBeInstanceOf(NestedTransactionError);
  });

  it("returns the pooled connection after both commit and rollback", async () => {
    await runtime.unitOfWork.withTransaction(async () => undefined);
    expect(runtime.poolSnapshot()).toMatchObject({ total: 1, idle: 1, waiting: 0, closed: false });

    await expect(
      runtime.unitOfWork.withTransaction(async () => {
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(runtime.poolSnapshot()).toMatchObject({ total: 1, idle: 1, waiting: 0, closed: false });
  });

  it("closes an isolated runtime cleanly", async () => {
    const config = parseDatabaseRuntimeConfig({
      DATABASE_URL: process.env.DATABASE_URL,
      FACILITYOS_DB_POOL_MAX: "1",
      FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
    });
    const isolatedPool = createPostgresPool(config);
    const isolated = createDatabaseRuntime<Record<string, never>>(isolatedPool);

    await isolated.healthCheck();
    await isolated.destroy();

    expect(isolated.poolSnapshot().closed).toBe(true);
    await expect(isolated.healthCheck()).rejects.toMatchObject({ kind: "database_unavailable" });
  });
});
