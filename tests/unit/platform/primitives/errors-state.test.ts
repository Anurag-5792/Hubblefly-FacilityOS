import { describe, expect, it } from "vitest";
import {
  ConflictError,
  InfrastructureUnavailableError,
  InvalidStateTransitionError,
  InvariantViolation,
  ValidationError,
  assertTransition,
  canTransition,
  createTransitionPolicy,
  invariant,
  precondition,
  requireValue,
  serializePublicError,
} from "../../../../src/platform/primitives";

describe("application/domain errors", () => {
  it("exposes stable error codes without HTTP coupling", () => {
    const error = new ConflictError("A conflicting operation already exists.");
    expect(error.code).toBe("CONFLICT");
    expect(error).not.toHaveProperty("statusCode");
  });
  it("does not leak internal infrastructure cause or stack in public serialization", () => {
    const cause = new Error("SELECT password FROM secrets; postgresql://admin:secret@db.internal/prod");
    const error = new InfrastructureUnavailableError("PostgreSQL", cause);
    const payload = serializePublicError(error);
    const wire = JSON.stringify(payload);
    expect(payload).toEqual({
      code: "INFRASTRUCTURE_UNAVAILABLE",
      message: "A required service is temporarily unavailable.",
    });
    expect(wire).not.toContain("SELECT");
    expect(wire).not.toContain("secret");
    expect(wire).not.toContain("db.internal");
    expect(wire).not.toContain("stack");
  });
  it("sanitizes unknown errors to an internal-error payload", () => {
    expect(serializePublicError(new Error("raw SQL details"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "An internal error occurred.",
    });
  });
});

describe("invariants and preconditions", () => {
  it("uses invariant helpers only for trusted domain rules", () => {
    expect(() => invariant(false, "Required invariant failed.")).toThrow(InvariantViolation);
    expect(() => precondition(false, "Invalid input.")).toThrow(ValidationError);
    expect(requireValue("present", "missing")).toBe("present");
  });
});

describe("state-transition foundation", () => {
  type State = "DRAFT" | "READY" | "DONE";
  const policy = createTransitionPolicy<State>([
    { from: "DRAFT", to: "READY" },
    { from: "READY", to: "DONE" },
  ]);
  it("accepts only explicitly declared transitions", () => {
    expect(canTransition(policy, "DRAFT", "READY")).toBe(true);
    expect(canTransition(policy, "DRAFT", "DONE")).toBe(false);
    expect(() => assertTransition(policy, "READY", "DONE")).not.toThrow();
  });
  it("rejects forbidden transitions with a typed error", () => {
    expect(() => assertTransition(policy, "DRAFT", "DONE")).toThrow(InvalidStateTransitionError);
  });
});
