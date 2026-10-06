import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UserProfileService, userProfileRepository, parseSupabaseAuthUserId, FacilityUserInactiveError, FacilityUserNotProvisionedError } from "../../../src/domains/iam";
import { buildAuthenticatedHuman } from "../../../src/domains/iam/authenticated-user";
import { closeApplicationDatabaseRuntime, getApplicationDatabaseRuntime } from "../../../src/platform/db/server";
import { FixedClock, SystemInternalIdFactory, createOperationContext, parseActorContext, parseCommandId, parseCorrelationId, parseRequestId } from "../../../src/platform/primitives";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

const createdUserIds: string[] = [];
const operator = parseActorContext({ actorType: "SYSTEM", actorId: "w0-06-auth-test" });
const operation = createOperationContext({
  requestId: parseRequestId("req-auth-integration"),
  commandId: parseCommandId("123e4567-e89b-42d3-a456-426614174010"),
  correlationId: parseCorrelationId("123e4567-e89b-42d3-a456-426614174011"),
});

async function createAuthUser(label: string) {
  const email = `w006-${label}-${randomUUID()}@example.invalid`;
  const password = "W0-06-Test-Password-123!";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Auth user not created.");
  createdUserIds.push(created.data.user.id);
  return { user: created.data.user, email, password };
}

describe("W0-06 local Supabase Auth integration", () => {
  beforeAll(() => {
    expect(url).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
  });

  afterAll(async () => {
    const runtime = getApplicationDatabaseRuntime();
    for (const id of createdUserIds) {
      await runtime.database.deleteFrom("iam.user_profile").where("auth_user_id", "=", id).execute();
      await admin.auth.admin.deleteUser(id);
    }
    await closeApplicationDatabaseRuntime();
  });

  it("does not auto-provision FacilityOS profile from a valid Supabase account", async () => {
    const { user } = await createAuthUser("unprovisioned");
    const runtime = getApplicationDatabaseRuntime();
    const profile = await runtime.unitOfWork.withTransaction(async (uow) =>
      await uow.repository(userProfileRepository).findByAuthUserId(parseSupabaseAuthUserId(user.id)),
    );
    expect(profile).toBeUndefined();
    expect(() => buildAuthenticatedHuman({ authUserId: parseSupabaseAuthUserId(user.id), profile, operation }))
      .toThrow(FacilityUserNotProvisionedError);
  });

  it("provisions exactly one profile for one auth.users identity", async () => {
    const { user, email } = await createAuthUser("provision");
    const runtime = getApplicationDatabaseRuntime();
    const service = new UserProfileService(runtime.unitOfWork, new FixedClock("2026-10-06T00:00:00.000Z"), new SystemInternalIdFactory());
    const first = await service.provision({ authUserId: user.id, displayName: "Provisioned User", emailSnapshot: email }, operator);
    const second = await service.provision({ authUserId: user.id, displayName: "Ignored Duplicate", emailSnapshot: email }, operator);
    expect(second).toBe(first);

    const count = await runtime.database.selectFrom("iam.user_profile")
      .select(({ fn }) => fn.countAll<string>().as("count"))
      .where("auth_user_id", "=", user.id).executeTakeFirstOrThrow();
    expect(Number(count.count)).toBe(1);
  });

  it("signs in, resolves an active profile, refreshes session and signs out", async () => {
    const { user, email, password } = await createAuthUser("session");
    const runtime = getApplicationDatabaseRuntime();
    const service = new UserProfileService(runtime.unitOfWork, new FixedClock("2026-10-06T00:00:00.000Z"), new SystemInternalIdFactory());
    await service.provision({ authUserId: user.id, displayName: "Session User", emailSnapshot: email }, operator);

    const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.session?.refresh_token).toBeTruthy();

    const profile = await runtime.unitOfWork.withTransaction(async (uow) =>
      await uow.repository(userProfileRepository).findByAuthUserId(parseSupabaseAuthUserId(user.id)),
    );
    const current = buildAuthenticatedHuman({ authUserId: parseSupabaseAuthUserId(user.id), authEmail: email, profile, operation });
    expect(current.actor.actorType).toBe("HUMAN");

    const refreshed = await client.auth.refreshSession(signedIn.data.session ?? undefined);
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session).toBeTruthy();

    expect((await client.auth.signOut()).error).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });

  it("rejects an inactive FacilityOS profile despite valid Supabase authentication", async () => {
    const { user, email, password } = await createAuthUser("inactive");
    const runtime = getApplicationDatabaseRuntime();
    const service = new UserProfileService(runtime.unitOfWork, new FixedClock("2026-10-06T00:00:00.000Z"), new SystemInternalIdFactory());
    const profileId = await service.provision({ authUserId: user.id, displayName: "Inactive User", emailSnapshot: email }, operator);
    await service.setStatus({ profileId, expectedVersion: 0 as never, status: "INACTIVE" }, operator);

    const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const profile = await runtime.unitOfWork.withTransaction(async (uow) =>
      await uow.repository(userProfileRepository).findByAuthUserId(parseSupabaseAuthUserId(user.id)),
    );
    expect(() => buildAuthenticatedHuman({ authUserId: parseSupabaseAuthUserId(user.id), profile, operation }))
      .toThrow(FacilityUserInactiveError);
  });

  it("prevents committed FacilityOS profiles from being remapped to another auth user", async () => {
    const first = await createAuthUser("link-first");
    const second = await createAuthUser("link-second");
    const runtime = getApplicationDatabaseRuntime();
    const service = new UserProfileService(
      runtime.unitOfWork,
      new FixedClock("2026-10-06T00:00:00.000Z"),
      new SystemInternalIdFactory(),
    );
    const profileId = await service.provision({
      authUserId: first.user.id,
      displayName: "Immutable Link User",
      emailSnapshot: first.email,
    }, operator);

    await expect(
      runtime.database.updateTable("iam.user_profile")
        .set({ auth_user_id: second.user.id })
        .where("id", "=", profileId)
        .execute(),
    ).rejects.toThrow("immutable");

    const profile = await runtime.unitOfWork.withTransaction(async (uow) =>
      await uow.repository(userProfileRepository).findById(profileId),
    );
    expect(profile?.authUserId).toBe(first.user.id);
  });

  it("prevents auth-user deletion from erasing an operational profile", async () => {
    const { user, email } = await createAuthUser("delete");
    const runtime = getApplicationDatabaseRuntime();
    const service = new UserProfileService(runtime.unitOfWork, new FixedClock("2026-10-06T00:00:00.000Z"), new SystemInternalIdFactory());
    await service.provision({ authUserId: user.id, displayName: "History User", emailSnapshot: email }, operator);
    const deletion = await admin.auth.admin.deleteUser(user.id);
    expect(deletion.error).not.toBeNull();
  });

  it("keeps public self-signup disabled in the local FacilityOS auth policy", async () => {
    const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const result = await client.auth.signUp({
      email: `w006-signup-${randomUUID()}@example.invalid`,
      password: "W0-06-Test-Password-123!",
    });
    expect(result.error).not.toBeNull();
  });
});
