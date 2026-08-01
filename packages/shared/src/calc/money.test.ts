import { describe, expect, it } from "vitest";
import { centsToReaisInput, formatCentsAsBRL, parseReaisInputToCents } from "./money";

describe("formatCentsAsBRL", () => {
  it("formats cents as pt-BR currency with thousands separator", () => {
    const result = formatCentsAsBRL(113050);
    expect(result.startsWith("R$")).toBe(true);
    expect(result).toContain("1.130,50");
  });

  it("formats zero correctly", () => {
    expect(formatCentsAsBRL(0)).toContain("0,00");
  });
});

describe("parseReaisInputToCents", () => {
  it("parses a value with thousands separator and comma decimal", () => {
    expect(parseReaisInputToCents("1.130,50")).toBe(113050);
  });

  it("parses a value with just a comma decimal", () => {
    expect(parseReaisInputToCents("200,00")).toBe(20000);
  });

  it("parses an integer with no decimal part", () => {
    expect(parseReaisInputToCents("200")).toBe(20000);
  });

  it("returns null for an empty string", () => {
    expect(parseReaisInputToCents("")).toBeNull();
    expect(parseReaisInputToCents("   ")).toBeNull();
  });

  it("returns null for non-numeric garbage", () => {
    expect(parseReaisInputToCents("abc")).toBeNull();
  });

  it("rounds sub-cent values", () => {
    expect(parseReaisInputToCents("10,005")).toBe(1001);
  });
});

describe("centsToReaisInput", () => {
  it("round-trips with parseReaisInputToCents", () => {
    expect(centsToReaisInput(parseReaisInputToCents("1.130,50"))).toBe("1130,50");
  });

  it("returns an empty string for null", () => {
    expect(centsToReaisInput(null)).toBe("");
  });
});
