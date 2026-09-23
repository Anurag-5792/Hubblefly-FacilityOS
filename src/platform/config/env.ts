import { z } from "zod";

/**
 * Wave 0 environment-contract foundation.
 *
 * W0-01 deliberately does not parse this schema at module import time so the
 * existing legacy prototype remains runnable while target Supabase/PostgreSQL
 * configuration is not yet provisioned.
 *
 * Later authorised work packages will wire these parsers into target server
 * and browser bootstrap paths. Production target paths must then fail closed
 * when required configuration is missing or invalid.
 */
export const targetPublicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1)
});

export const targetServerEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1)
});

export type TargetPublicEnvironment = z.infer<typeof targetPublicEnvironmentSchema>;
export type TargetServerEnvironment = z.infer<typeof targetServerEnvironmentSchema>;

export function parseTargetPublicEnvironment(
  environment: Record<string, string | undefined>
): TargetPublicEnvironment {
  return targetPublicEnvironmentSchema.parse(environment);
}

export function parseTargetServerEnvironment(
  environment: Record<string, string | undefined>
): TargetServerEnvironment {
  return targetServerEnvironmentSchema.parse(environment);
}
