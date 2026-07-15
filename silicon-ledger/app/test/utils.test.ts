import { describe, it, expect } from "vitest";
import { formatCents, cn } from "~/lib/utils";

describe("formatCents", () => {
  it("formats whole dollars", () => {
    expect(formatCents(10000)).toBe("$100.00");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats negative amounts", () => {
    expect(formatCents(-5000)).toBe("-$50.00");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("handles conditional classes", () => {
    expect(cn("base", "visible")).toBe("base visible");
  });
});
