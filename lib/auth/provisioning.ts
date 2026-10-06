import "server-only";

import { SystemClock, SystemInternalIdFactory, type ActorContext } from "../../src/platform/primitives";
import { UserProfileService } from "../../src/domains/iam";
import { getApplicationDatabaseRuntime } from "../../src/platform/db/server";
import { createSupabaseAdminClient } from "../supabase/admin";

export async function provisionFacilityUser(input: {
  authUserId: string;
  displayName: string;
}, actor: Readonly<ActorContext>) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(input.authUserId);
  if (error || !data.user) throw new Error("Supabase auth user does not exist.");

  const runtime = getApplicationDatabaseRuntime();
  const service = new UserProfileService(
    runtime.unitOfWork,
    new SystemClock(),
    new SystemInternalIdFactory(),
  );
  return await service.provision({
    authUserId: data.user.id,
    displayName: input.displayName,
    emailSnapshot: data.user.email,
  }, actor);
}
