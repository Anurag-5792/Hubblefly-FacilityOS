import "server-only";

import { SystemClock, SystemInternalIdFactory, type ActorContext } from "../../src/platform/primitives";
import { UserProfileService } from "../../src/domains/iam";
import { getApplicationDatabaseRuntime } from "../../src/platform/db/server";
import { getAuthUserForProvisioning } from "../supabase/admin";

export async function provisionFacilityUser(input: {
  authUserId: string;
  displayName: string;
}, actor: Readonly<ActorContext>) {
  const authUser = await getAuthUserForProvisioning(input.authUserId);

  const runtime = getApplicationDatabaseRuntime();
  const service = new UserProfileService(
    runtime.unitOfWork,
    new SystemClock(),
    new SystemInternalIdFactory(),
  );

  return await service.provision({
    authUserId: authUser.id,
    displayName: input.displayName,
    emailSnapshot: authUser.email,
  }, actor);
}
