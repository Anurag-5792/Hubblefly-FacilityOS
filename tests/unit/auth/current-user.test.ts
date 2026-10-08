import { describe, expect, it } from "vitest";
import {
  buildAuthenticatedHuman,
  FacilityUserInactiveError,
  FacilityUserNotProvisionedError,
  parseSupabaseAuthUserId,
  type UserProfile,
} from "../../../src/domains/iam";
import {
  createOperationContext,
  parseAggregateVersion,
  parseCommandId,
  parseCorrelationId,
  parseInternalId,
  parseRequestId,
  parseUtcTimestamp,
} from "../../../src/platform/primitives";
import { operationContextFromHeaders } from "../../../lib/auth/request-context";

const authId = parseSupabaseAuthUserId("123e4567-e89b-42d3-a456-426614174000");
const profile: UserProfile = {
  id: parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a11"),
  authUserId: authId,
  displayName: "Test User",
  status: "ACTIVE",
  version: parseAggregateVersion(0),
  createdAt: parseUtcTimestamp("2026-10-06T00:00:00.000Z"),
  updatedAt: parseUtcTimestamp("2026-10-06T00:00:00.000Z"),
};
const operation = createOperationContext({
  requestId: parseRequestId("req-test"),
  commandId: parseCommandId("123e4567-e89b-42d3-a456-426614174001"),
  correlationId: parseCorrelationId("123e4567-e89b-42d3-a456-426614174002"),
});

describe("W0-06 trusted human identity", () => {
  it("builds HUMAN actor from FacilityOS profile identity, not client actor input", () => {
    const current = buildAuthenticatedHuman({ authUserId: authId, authEmail: "test@example.com", profile, operation });
    expect(current.actor.actorType).toBe("HUMAN");
    expect(current.actor.actorId).toBe(profile.id);
    expect(current.authUserId).toBe(authId);
  });

  it("rejects a valid auth identity with no provisioned profile", () => {
    expect(() => buildAuthenticatedHuman({ authUserId: authId, profile: undefined, operation }))
      .toThrow(FacilityUserNotProvisionedError);
  });

  it("rejects inactive profiles even when auth identity is valid", () => {
    expect(() => buildAuthenticatedHuman({
      authUserId: authId,
      profile: { ...profile, status: "INACTIVE" },
      operation,
    })).toThrow(FacilityUserInactiveError);
  });

  it("rejects mismatched auth-user/profile linkage", () => {
    const other = parseSupabaseAuthUserId("123e4567-e89b-42d3-a456-426614174099");
    expect(() => buildAuthenticatedHuman({ authUserId: other, profile, operation }))
      .toThrow(FacilityUserNotProvisionedError);
  });

  it("sanitizes malformed trace headers by generating trusted server values", () => {
    const headers = new Headers({
      "x-request-id": "../bad request",
      "x-correlation-id": "not-a-uuid",
      "x-causation-id": "not-a-uuid",
    });
    const result = operationContextFromHeaders(headers);
    expect(result.requestId).toMatch(/^req-/);
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.causationId).toBeUndefined();
  });
});
