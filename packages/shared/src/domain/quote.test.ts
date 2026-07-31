import { describe, expect, it } from "vitest";
import { quoteStatusSchema } from "./quote";

describe("quoteStatusSchema", () => {
  it("accepts every status from docs/PRD.md §8", () => {
    const statuses = [
      "rascunho",
      "pronto_para_revisao",
      "emitido",
      "enviado",
      "aprovado",
      "recusado",
      "expirado",
      "substituido_por_nova_versao",
    ];

    for (const status of statuses) {
      expect(quoteStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => quoteStatusSchema.parse("cancelado")).toThrow();
  });
});
