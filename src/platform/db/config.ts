import { z } from "zod";

const postgresConnectionString = z.string().min(1).superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      context.addIssue({
        code: "custom",
        message: "DATABASE_URL must use the postgres:// or postgresql:// protocol.",
      });
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL must be a valid PostgreSQL connection URL.",
    });
  }
});

export const databaseRuntimeConfigSchema = z.object({
  DATABASE_URL: postgresConnectionString,
  FACILITYOS_DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  FACILITYOS_DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(10000),
  FACILITYOS_DB_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30000)
    .default(5000),
  FACILITYOS_DB_APPLICATION_NAME: z.string().trim().min(1).max(63).default("facilityos"),
});

export interface DatabaseRuntimeConfig {
  connectionString: string;
  maxConnections: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  applicationName: string;
}

export function parseDatabaseRuntimeConfig(
  environment: Record<string, string | undefined>,
): DatabaseRuntimeConfig {
  const parsed = databaseRuntimeConfigSchema.parse(environment);

  return {
    connectionString: parsed.DATABASE_URL,
    maxConnections: parsed.FACILITYOS_DB_POOL_MAX,
    idleTimeoutMs: parsed.FACILITYOS_DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMs: parsed.FACILITYOS_DB_CONNECTION_TIMEOUT_MS,
    applicationName: parsed.FACILITYOS_DB_APPLICATION_NAME,
  };
}
