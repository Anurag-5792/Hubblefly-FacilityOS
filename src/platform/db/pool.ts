import "server-only";

import pg from "pg";

import type { DatabaseRuntimeConfig } from "./config";

const { Pool } = pg;

export type PostgresPool = InstanceType<typeof Pool>;

export function createPostgresPool(config: DatabaseRuntimeConfig): PostgresPool {
  return new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    application_name: config.applicationName,
    allowExitOnIdle: false,
  });
}
