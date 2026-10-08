import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "../../src/platform/db/database.types";
import { getSupabasePublicConfig } from "./config";

export interface SupabaseCookieMutation {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
}

export function createRouteSupabaseClient(
  request: NextRequest,
  mutations: SupabaseCookieMutation[],
) {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        mutations.push(...cookiesToSet);
      },
    },
  });
}

export function applySupabaseCookieMutations(
  response: NextResponse,
  mutations: readonly SupabaseCookieMutation[],
): void {
  for (const { name, value, options } of mutations) {
    response.cookies.set(name, value, options);
  }
}
