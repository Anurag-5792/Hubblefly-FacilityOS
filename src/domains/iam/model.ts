import type { AggregateVersion, InternalId, UtcTimestamp } from "../../platform/primitives";
import { isUuid } from "../../platform/primitives";

export const userProfileStatuses = ["ACTIVE", "INACTIVE"] as const;
export type UserProfileStatus = (typeof userProfileStatuses)[number];

export type SupabaseAuthUserId = string & { readonly __brand: "SupabaseAuthUserId" };

export function parseSupabaseAuthUserId(value: string): SupabaseAuthUserId {
  if (!isUuid(value)) throw new TypeError("Supabase auth user ID must be a valid UUID.");
  return value.toLowerCase() as SupabaseAuthUserId;
}

export interface UserProfile {
  readonly id: InternalId;
  readonly authUserId: SupabaseAuthUserId;
  readonly displayName: string;
  readonly emailSnapshot?: string;
  readonly status: UserProfileStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}
