import { describe, expect, it } from "vitest";

import { safeInternalRedirectPath } from "../../../lib/auth/redirect";

describe("auth redirect safety", () => {
  it("accepts application-relative paths", () => {
    expect(safeInternalRedirectPath("/inventory/dashboard?tab=open#top"))
      .toBe("/inventory/dashboard?tab=open#top");
  });

  it("rejects protocol-relative, absolute and backslash redirects", () => {
    expect(safeInternalRedirectPath("//evil.example/path")).toBeUndefined();
    expect(safeInternalRedirectPath("https://evil.example/path")).toBeUndefined();
    expect(safeInternalRedirectPath("/\\evil.example/path")).toBeUndefined();
  });
});
