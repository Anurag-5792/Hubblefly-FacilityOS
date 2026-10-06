import {
  parseActorContext,
  type ActorContext,
  type OperationContext,
} from "../../platform/primitives";
import {
  FacilityUserInactiveError,
  FacilityUserNotProvisionedError,
} from "./errors";
import type { SupabaseAuthUserId, UserProfile } from "./model";

export interface AuthenticatedUser {
  readonly facilityUserId: UserProfile["id"];
  readonly authUserId: SupabaseAuthUserId;
  readonly displayName: string;
  readonly email?: string;
  readonly status: "ACTIVE";
  readonly actor: Readonly<ActorContext>;
  readonly operation: Readonly<OperationContext>;
}

export function buildAuthenticatedHuman(input: {
  authUserId: SupabaseAuthUserId;
  authEmail?: string;
  profile?: UserProfile;
  operation: Readonly<OperationContext>;
}): Readonly<AuthenticatedUser> {
  if (!input.profile) throw new FacilityUserNotProvisionedError();
  if (input.profile.authUserId !== input.authUserId) throw new FacilityUserNotProvisionedError();
  if (input.profile.status !== "ACTIVE") throw new FacilityUserInactiveError();

  const actor = parseActorContext({
    actorType: "HUMAN",
    actorId: input.profile.id,
    requestId: input.operation.requestId,
  });

  return Object.freeze({
    facilityUserId: input.profile.id,
    authUserId: input.authUserId,
    displayName: input.profile.displayName,
    email: input.authEmail,
    status: "ACTIVE" as const,
    actor,
    operation: input.operation,
  });
}
