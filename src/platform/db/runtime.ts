import "server-only";

import { Kysely, PostgresDialect, sql } from "kysely";

import { DatabaseUnavailableError, translateDatabaseError } from "./errors";
import type { PostgresPool } from "./pool";
import { UnitOfWorkManager } from "./unit-of-work";

export interface DatabasePoolSnapshot {
  total: number;
  idle: number;
  waiting: number;
  closed: boolean;
}

export interface DatabaseRuntime<Database> {
  readonly database: Kysely<Database>;
  readonly unitOfWork: UnitOfWorkManager<Database>;
  healthCheck(): Promise<void>;
  poolSnapshot(): DatabasePoolSnapshot;
  destroy(): Promise<void>;
}

export function createDatabaseRuntime<Database>(pool: PostgresPool): DatabaseRuntime<Database> {
  const database = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
  const unitOfWork = new UnitOfWorkManager(database);
  let closed = false;

  return {
    database,
    unitOfWork,
    async healthCheck() {
      if (closed) {
        throw new DatabaseUnavailableError(new Error("Database runtime has been closed."));
      }

      try {
        const result = await sql<{ ok: number }>`select 1 as ok`.execute(database);
        if (Number(result.rows[0]?.ok) !== 1) {
          throw new Error("Database readiness query returned an unexpected result.");
        }
      } catch (error) {
        const translated = translateDatabaseError(error);
        if (translated instanceof DatabaseUnavailableError) {
          throw translated;
        }
        throw new DatabaseUnavailableError(translated);
      }
    },
    poolSnapshot() {
      return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        closed,
      };
    },
    async destroy() {
      if (closed) return;
      closed = true;
      await database.destroy();
    },
  };
}
