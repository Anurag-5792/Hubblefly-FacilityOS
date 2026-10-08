import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../src/platform/db/database.types";
import { getSupabasePublicConfig } from "./config";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient<Database>(url, publishableKey);
}
