import { describe, expect, it } from "vitest";
import { ValidationError, parseInternalId, serializeForTransport } from "../../../../src/platform/primitives";

describe("safe serialization", () => {
  it("serializes platform-compatible transport values without a custom wire protocol", () => {
    const value = serializeForTransport({
      id: parseInternalId("123e4567-e89b-42d3-a456-426614174000"),
      createdAt: new Date("2026-10-06T07:15:00.000Z"),
      count: BigInt("9007199254740993"),
      nested: [true, null, "value"],
    });
    expect(value).toEqual({
      id: "123e4567-e89b-42d3-a456-426614174000",
      createdAt: "2026-10-06T07:15:00.000Z",
      count: "9007199254740993",
      nested: [true, null, "value"],
    });
  });
  it("serializes typed application errors but excludes stack/cause", () => {
    const error = new ValidationError("Value is invalid.", { field: "quantity" });
    expect(serializeForTransport(error)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Value is invalid.",
      details: { field: "quantity" },
    });
  });
  it("redacts unknown Error messages instead of leaking internals", () => {
    const value = serializeForTransport(new Error("SQLSTATE 23505 password=secret topology=db.prod.internal"));
    expect(JSON.stringify(value)).toBe('{"code":"INTERNAL_ERROR","message":"An internal error occurred."}');
  });
  it("rejects circular and unsupported transport values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serializeForTransport(circular)).toThrow("Circular");
    expect(() => serializeForTransport(Symbol("unsafe"))).toThrow("Unsupported");
  });
});
