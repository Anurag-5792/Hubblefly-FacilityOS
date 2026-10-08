import "server-only";

import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";

import {
  buildAuthenticatedHuman,
  parseSupabaseAuthUserId,
  userProfileRepository,
  AuthenticationRequiredError,
  FacilityUserInactiveError,
  FacilityUserNotProvisionedError,
  type AuthenticatedUser,
  type UserProfile,
} from "../../src/domains/iam";
import { getApplicationDatabaseRuntime } from "../../src/platform/db/server";
import { operationContextFromHeaders } from "./request-context";
import { createRouteSupabaseClient, type SupabaseCookieMutation } from "../supabase/route";
import { createServerSupabaseClient } from "../supabase/server";

export async function resolveActiveFacilityProfile(
  authUserIdValue: string,
): Promise<Readonly<UserProfile>> {
  const authUserId = parseSupabaseAuthUserId(authUserIdValue);
  const runtime = getApplicationDatabaseRuntime();

  return await runtime.unitOfWork.withTransaction(async (uow) => {
    const profile = await uow.repository(userProfileRepository).findByAuthUserId(authUserId);
    if (!profile) throw new FacilityUserNotProvisionedError();
    if (profile.status !== "ACTIVE") throw new FacilityUserInactiveError();
    return profile;
  });
}

export async function resolveVerifiedSupabaseUser(
  user: User,
  operation: ReturnType<typeof operationContextFromHeaders>,
): Promise<Readonly<AuthenticatedUser>> {
  const authUserId = parseSupabaseAuthUserId(user.id);
  const profile = await resolveActiveFacilityProfile(authUserId);

  return buildAuthenticatedHuman({
    authUserId,
    authEmail: user.email,
    profile,
    operation,
  });
}

export async function authenticatedUserFromRequest(
  request: NextRequest,
  mutations: SupabaseCookieMutation[] = [],
): Promise<Readonly<AuthenticatedUser>> {
  const supabase = createRouteSupabaseClient(request, mutations);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) throw new AuthenticationRequiredError();

  return await resolveVerifiedSupabaseUser(
    data.user,
    operationContextFromHeaders(request.headers),
  );
}

export async function requireAuthenticatedUser(): Promise<Readonly<AuthenticatedUser>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) throw new AuthenticationRequiredError();

  return await resolveVerifiedSupabaseUser(
    data.user,
    operationContextFromHeaders(await headers()),
  );
}
