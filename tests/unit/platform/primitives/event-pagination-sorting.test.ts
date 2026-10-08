import { describe, expect, it } from "vitest";
import {
  DeterministicInternalIdFactory,
  FixedClock,
  createEntityReference,
  createEventEnvelope,
  createEventMetadata,
  parseActorContext,
  parseAggregateVersion,
  parseCorrelationId,
  parseCursorPagination,
  parseEventVersion,
  parseInternalId,
  parseOffsetPagination,
  parseRequestId,
  parseSortRequest,
  withDeterministicTieBreaker,
} from "../../../../src/platform/primitives";

const eventId = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a11");
const entityId = parseInternalId("123e4567-e89b-42d3-a456-426614174000");

describe("event metadata/envelope", () => {
  it("builds immutable, versioned event metadata with trace context", () => {
    const actor = parseActorContext({ actorType: "SERVICE", actorId: "service-worker", requestId: "request-001" });
    const metadata = createEventMetadata({
      eventType: "Example.Changed",
      entity: createEntityReference("ExampleAggregate", entityId),
      aggregateVersion: parseAggregateVersion(3),
      actor,
      correlationId: parseCorrelationId(entityId),
      requestId: parseRequestId("request-001"),
      eventVersion: 2,
      metadata: { source: "unit-test" },
      clock: new FixedClock("2026-10-06T00:00:00.000Z"),
      idFactory: new DeterministicInternalIdFactory([eventId]),
    });
    const envelope = createEventEnvelope(metadata, { value: "changed", count: 2 });
    expect(metadata.eventId).toBe(eventId);
    expect(metadata.eventVersion).toBe(2);
    expect(metadata.occurredAt).toBe("2026-10-06T00:00:00.000Z");
    expect(metadata.requestId).toBe("request-001");
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.payload)).toBe(true);
  });
  it("requires explicit positive event/schema versions", () => {
    expect(parseEventVersion(1)).toBe(1);
    expect(() => parseEventVersion(0)).toThrow();
  });
});

describe("pagination", () => {
  it("keeps offset and cursor requests distinct", () => {
    expect(parseOffsetPagination({ offset: 20, limit: 25 })).toEqual({ kind: "offset", offset: 20, limit: 25 });
    expect(parseCursorPagination({ cursor: "abc_DEF-123", limit: 10 })).toEqual({
      kind: "cursor",
      cursor: "abc_DEF-123",
      limit: 10,
    });
  });
  it("rejects unsafe pagination values", () => {
    expect(() => parseOffsetPagination({ offset: -1 })).toThrow();
    expect(() => parseCursorPagination({ cursor: "unsafe cursor!" })).toThrow();
    expect(() => parseCursorPagination({ limit: 999 })).toThrow();
  });
});

describe("sorting", () => {
  const fields = ["createdAt", "id", "priority"] as const;
  it("returns only typed allowlisted fields", () => {
    const sort = parseSortRequest({ field: "priority", direction: "desc" }, fields);
    expect(sort).toEqual({ field: "priority", direction: "desc" });
    expect(withDeterministicTieBreaker(sort, "id")).toEqual([
      { field: "priority", direction: "desc" },
      { field: "id", direction: "asc" },
    ]);
  });
  it("rejects untrusted strings before repositories map sort fields to SQL", () => {
    expect(() => parseSortRequest({ field: "createdAt; DROP TABLE audit_event" }, fields)).toThrow("allowlisted");
  });
});
