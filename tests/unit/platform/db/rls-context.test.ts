import { describe, expect, it } from "vitest";

import { createDatabaseSecurityContext } from "../../../../src/platform/db/security-context";

describe("W0-08 database security context", () => {
  it("carries trusted identity/trace context but no requested business scope", () => {
    const context = createDatabaseSecurityContext({
      authUserId: "123E4567-E89B-42D3-A456-426614174801",
      requestId: "req-w0-08-unit",
      correlationId: "123e4567-e89b-42d3-a456-426614174802",
    });

    expect(context).toEqual({
      authUserId: "123e4567-e89b-42d3-a456-426614174801",
      requestId: "req-w0-08-unit",
      correlationId: "123e4567-e89b-42d3-a456-426614174802",
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect("organisationId" in context).toBe(false);
    expect("legalEntityId" in context).toBe(false);
    expect("siteId" in context).toBe(false);
  });

  it("rejects malformed identity and trace values", () => {
    expect(() => createDatabaseSecurityContext({
      authUserId: "not-a-uuid",
      requestId: "req-valid",
      correlationId: "123e4567-e89b-42d3-a456-426614174802",
    })).toThrow(TypeError);

    expect(() => createDatabaseSecurityContext({
      authUserId: "123e4567-e89b-42d3-a456-426614174801",
      requestId: "../unsafe",
      correlationId: "123e4567-e89b-42d3-a456-426614174802",
    })).toThrow(TypeError);

    expect(() => createDatabaseSecurityContext({
      authUserId: "123e4567-e89b-42d3-a456-426614174801",
      requestId: "req-valid",
      correlationId: "not-a-uuid",
    })).toThrow(TypeError);
  });
});
