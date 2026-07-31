import { describe, expect, it } from "vitest";
import { customerInputSchema } from "./customer";

describe("customerInputSchema", () => {
  it("accepts a quick-create with only a name (RF-012)", () => {
    expect(customerInputSchema.parse({ name: "Maria" })).toEqual({
      name: "Maria",
    });
  });

  it("rejects an empty name", () => {
    expect(() => customerInputSchema.parse({ name: "" })).toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() =>
      customerInputSchema.parse({ name: "Maria", email: "not-an-email" }),
    ).toThrow();
  });

  it("accepts an explicit null email", () => {
    expect(
      customerInputSchema.parse({ name: "Maria", email: null }).email,
    ).toBeNull();
  });
});
