import { describe, expect, it } from "vitest";
import {
  DeterministicInternalIdFactory,
  FixedClock,
  TestClock,
  createOperationContext,
  createScopedIdempotencyKey,
  generateInternalId,
  initialAggregateVersion,
  nextAggregateVersion,
  parseActorContext,
  parseAggregateVersion,
  parseCausationId,
  parseCommandId,
  parseCorrelationId,
  parseIdempotencyKey,
  parseInternalId,
  parseRequestId,
  parseUtcTimestamp,
  sameIdempotencyIdentity,
} from "../../../../src/platform/primitives";

const uuidA = "018f47b0-9b6d-7a30-8f6a-b0cc55d33a11";
const uuidB = "123e4567-e89b-42d3-a456-426614174000";

describe("internal IDs", () => {
  it("generates and validates UUID-backed IDs without business meaning", () => {
    const id = generateInternalId();
    expect(parseInternalId(id)).toBe(id);
    expect(id).not.toMatch(/HF-|HTL|DDL/);
  });
  it("rejects malformed IDs", () => {
    expect(() => parseInternalId("HF-MFG-26-0001")).toThrow("valid UUID");
  });
  it("provides a deterministic ID factory for tests", () => {
    const factory = new DeterministicInternalIdFactory([parseInternalId(uuidA), parseInternalId(uuidB)]);
    expect(factory.next()).toBe(uuidA);
    expect(factory.next()).toBe(uuidB);
    expect(() => factory.next()).toThrow("exhausted");
  });
});

describe("clock", () => {
  it("normalizes persisted timestamps to canonical UTC", () => {
    const clock = new FixedClock("2026-10-06T12:45:00+05:30");
    expect(clock.nowUtc()).toBe("2026-10-06T07:15:00.000Z");
    expect(parseUtcTimestamp("2026-10-06T07:15:00.000Z")).toBe("2026-10-06T07:15:00.000Z");
  });
  it("supports deterministic test time without exposing mutable Date state", () => {
    const clock = new TestClock("2026-10-06T00:00:00.000Z");
    const first = clock.now();
    first.setUTCFullYear(2030);
    expect(clock.nowUtc()).toBe("2026-10-06T00:00:00.000Z");
    clock.advance(1000);
    expect(clock.nowUtc()).toBe("2026-10-06T00:00:01.000Z");
  });
  it("rejects non-UTC persistence strings", () => {
    expect(() => parseUtcTimestamp("2026-10-06T12:45:00+05:30")).toThrow("UTC");
  });
});

describe("actor and operation context", () => {
  it.each(["HUMAN", "SERVICE", "SYSTEM", "MIGRATION"] as const)("creates a distinct %s actor", (actorType) => {
    const actor = parseActorContext({
      actorType,
      actorId: `actor-${actorType.toLowerCase()}`,
      requestId: "request-123",
      scopeReferences: ["scope-a"],
    });
    expect(actor.actorType).toBe(actorType);
    expect(actor.requestId).toBe("request-123");
  });
  it("rejects invalid actor types", () => {
    expect(() => parseActorContext({ actorType: "ADMIN", actorId: "actor-1" })).toThrow();
  });
  it("keeps trace identifiers typed and validated", () => {
    const context = createOperationContext({
      requestId: parseRequestId("request-123"),
      commandId: parseCommandId(uuidB),
      correlationId: parseCorrelationId(uuidA),
      causationId: parseCausationId(uuidB),
    });
    expect(context.correlationId).toBe(uuidA);
    expect(Object.isFrozen(context)).toBe(true);
    expect(() => parseRequestId("../unsafe request")).toThrow();
  });
});

describe("idempotency", () => {
  it("compares both operation scope and stable retry key", () => {
    const first = createScopedIdempotencyKey("inventory.reserve", "retry-key-0001");
    const retry = createScopedIdempotencyKey("inventory.reserve", "retry-key-0001");
    const unrelated = createScopedIdempotencyKey("dispatch.authorise", "retry-key-0001");
    expect(sameIdempotencyIdentity(first, retry)).toBe(true);
    expect(sameIdempotencyIdentity(first, unrelated)).toBe(false);
  });
  it("rejects malformed idempotency keys", () => {
    expect(() => parseIdempotencyKey("short")).toThrow();
  });
});

describe("aggregate version", () => {
  it("uses non-negative safe integers and explicit increments", () => {
    const initial = initialAggregateVersion();
    expect(initial).toBe(0);
    expect(nextAggregateVersion(initial)).toBe(1);
    expect(parseAggregateVersion(8)).toBe(8);
  });
  it("rejects invalid versions", () => {
    expect(() => parseAggregateVersion(-1)).toThrow();
    expect(() => parseAggregateVersion(1.5)).toThrow();
  });
});
