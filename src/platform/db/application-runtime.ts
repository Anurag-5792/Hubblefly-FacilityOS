import "server-only";

import type { DB } from "./kysely.types";
import { parseDatabaseRuntimeConfig } from "./config";
import { createPostgresPool } from "./pool";
import { createDatabaseRuntime, type DatabaseRuntime } from "./runtime";

type FacilityDatabaseRuntime = DatabaseRuntime<DB>;

const globalDatabase = globalThis as typeof globalThis & {
  __facilityosDatabaseRuntime?: FacilityDatabaseRuntime;
};

export function getApplicationDatabaseRuntime(): FacilityDatabaseRuntime {
  if (typeof window !== "undefined") {
    throw new Error("FacilityOS PostgreSQL access is server-only.");
  }

  if (!globalDatabase.__facilityosDatabaseRuntime) {
    const config = parseDatabaseRuntimeConfig(process.env);
    const pool = createPostgresPool(config);
    globalDatabase.__facilityosDatabaseRuntime = createDatabaseRuntime<DB>(pool);
  }

  return globalDatabase.__facilityosDatabaseRuntime;
}

export async function closeApplicationDatabaseRuntime(): Promise<void> {
  const runtime = globalDatabase.__facilityosDatabaseRuntime;
  if (!runtime) return;

  await runtime.destroy();
  delete globalDatabase.__facilityosDatabaseRuntime;
}
