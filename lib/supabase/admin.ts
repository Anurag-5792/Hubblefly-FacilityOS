import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import type { Database } from "../../src/platform/db/database.types";
import { getSupabasePublicConfig } from "./config";

function createProvisioningAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Supabase provisioning credential is not configured.");
  }

  const { url } = getSupabasePublicConfig();
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function getAuthUserForProvisioning(authUserId: string): Promise<User> {
  const admin = createProvisioningAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(authUserId);

  if (error || !data.user) {
    throw new Error("Supabase auth user could not be resolved for provisioning.");
  }

  return data.user;
}
