import { describe, expect, it } from "vitest";

import {
  assertSafeAuditMetadata,
  createResourceReference,
  parseGovernanceCode,
  parseResourceType,
} from "../../../src/domains/governance";
import { parseInternalId } from "../../../src/platform/primitives";

const resourceId = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33901");

describe("W0-09 governance primitives", () => {
  it("accepts bounded resource and governance codes", () => {
    expect(parseResourceType("manufacturing.job")).toBe("manufacturing.job");
    expect(parseGovernanceCode("governance.approval.decide")).toBe(
      "governance.approval.decide",
    );
    expect(createResourceReference("quality.ncr", resourceId)).toEqual({
      type: "quality.ncr",
      id: resourceId,
    });
  });

  it("rejects unsafe or human-readable resource identities", () => {
    expect(() => parseResourceType("HF-MFG-26-0001")).toThrow();
    expect(() => parseResourceType("Manufacturing Job")).toThrow();
    expect(() => parseGovernanceCode("contains spaces")).toThrow();
  });

  it("accepts bounded non-secret audit metadata", () => {
    expect(() =>
      assertSafeAuditMetadata({
        approvalRequestId: resourceId,
        result: "APPROVED",
        values: [1, 2, 3],
        nested: { source: "governance" },
      }),
    ).not.toThrow();
  });

  it.each([
    [{ password: "do-not-record" }],
    [{ auth_token: "do-not-record" }],
    [{ nested: { apiKey: "do-not-record" } }],
    [{ value: "Bearer abcdefghijklmnopqrstuvwxyz0123456789" }],
    [{ value: "eyJabcdefghijklmnopqrstuvwxyz0123456789.ABCDEF" }],
    [{ value: ["postgresql:", "//user:password@db.internal/prod"].join("") }],
  ])("rejects credential-like audit metadata %#", (metadata) => {
    expect(() => assertSafeAuditMetadata(metadata)).toThrow();
  });

  it("rejects audit metadata larger than the canonical 32 KiB bound", () => {
    expect(() =>
      assertSafeAuditMetadata({ value: "x".repeat(33_000) }),
    ).toThrow();
  });
});
