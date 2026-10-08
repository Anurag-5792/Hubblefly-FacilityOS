import { describe, expect, it } from "vitest";

import {
  formatIdentifier,
  validateIdentifierTemplate,
} from "../../../src/domains/core/identifier-format";
import type { IdentifierSeries } from "../../../src/domains/core/model";
import {
  parseAggregateVersion,
  parseInternalId,
} from "../../../src/platform/primitives";

const baseSeries: IdentifierSeries = {
  id: parseInternalId("00000000-0000-4000-8000-000000000001"),
  organisationId: parseInternalId("00000000-0000-4000-8000-000000000002"),
  seriesKey: "sales_requirement",
  formatTemplate: "HF-SR-{period}-{sequence}",
  sequenceWidth: 4,
  scopeLegalEntity: false,
  scopeSite: false,
  requiresPeriod: true,
  status: "ACTIVE",
  version: parseAggregateVersion(0),
};

describe("W0-05 identifier formatting", () => {
  it("formats a deterministic human identifier without changing internal identity", () => {
    expect(
      formatIdentifier(baseSeries, 12, { key: "2026", token: "26" }),
    ).toBe("HF-SR-26-0012");
  });

  it("does not infer the meaning of the period token", () => {
    expect(
      formatIdentifier(baseSeries, 1, { key: "FY-END-26", token: "26" }),
    ).toBe("HF-SR-26-0001");
  });

  it("rejects missing, duplicate or unsupported tokens", () => {
    expect(() =>
      validateIdentifierTemplate({
        formatTemplate: "HF-SR-{period}",
        sequenceWidth: 4,
        requiresPeriod: true,
      }),
    ).toThrow();

    expect(() =>
      validateIdentifierTemplate({
        formatTemplate: "HF-{sequence}-{sequence}",
        sequenceWidth: 4,
        requiresPeriod: false,
      }),
    ).toThrow();

    expect(() =>
      validateIdentifierTemplate({
        formatTemplate: "HF-{company}-{sequence}",
        sequenceWidth: 4,
        requiresPeriod: false,
      }),
    ).toThrow();
  });

  it("rejects invalid period tokens and invalid sequence values", () => {
    expect(() =>
      formatIdentifier(baseSeries, 1, {
        key: "2026",
        token: "26/27",
      }),
    ).toThrow();

    expect(() =>
      formatIdentifier(baseSeries, 0, { key: "2026", token: "26" }),
    ).toThrow();
  });
});
