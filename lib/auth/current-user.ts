import "server-only";

import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";

import {
  buildAuthenticatedHuman,
  parseSupabaseAuthUserId,
  userProfileRepository,
  AuthenticationRequiredError,
  type AuthenticatedUser,
} from "../../src/domains/iam";
import { getApplicationDatabaseRuntime } from "../../src/platform/db/server";
import { operationContextFromHeaders } from "./request-context";
import { createRouteSupabaseClient, type SupabaseCookieMutation } from "../supabase/route";
import { createServerSupabaseClient } from "../supabase/server";

export async function resolveVerifiedSupabaseUser(
  user: User,
  operation: ReturnType<typeof operationContextFromHeaders>,
): Promise<Readonly<AuthenticatedUser>> {
  const authUserId = parseSupabaseAuthUserId(user.id);
  const runtime = getApplicationDatabaseRuntime();
  return await runtime.unitOfWork.withTransaction(async (uow) => {
    const profile = await uow.repository(userProfileRepository).findByAuthUserId(authUserId);
    return buildAuthenticatedHuman({
      authUserId,
      authEmail: user.email,
      profile,
      operation,
    });
  });
}

export async function authenticatedUserFromRequest(
  request: NextRequest,
  mutations: SupabaseCookieMutation[] = [],
): Promise<Readonly<AuthenticatedUser>> {
  const supabase = createRouteSupabaseClient(request, mutations);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AuthenticationRequiredError();
  return await resolveVerifiedSupabaseUser(data.user, operationContextFromHeaders(request.headers));
}

export async function requireAuthenticatedUser(): Promise<Readonly<AuthenticatedUser>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AuthenticationRequiredError();
  return await resolveVerifiedSupabaseUser(data.user, operationContextFromHeaders(await headers()));
}
