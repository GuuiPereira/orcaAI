import { describe, expect, it } from "vitest";
import { buildQuotePdfFileName, toFileNamePart } from "./file-name";

const date = new Date(2026, 8, 24); // 24/09/2026 (mês é 0-based)

describe("buildQuotePdfFileName", () => {
  it("uses orcamento_DDMMAAAA_cliente", () => {
    expect(buildQuotePdfFileName({ date, customerName: "Maria Silva" })).toBe("orcamento_24092026_Maria-Silva");
  });

  it("zero-pads day and month", () => {
    expect(buildQuotePdfFileName({ date: new Date(2026, 0, 5) })).toBe("orcamento_05012026");
  });

  it("omits the customer part when there is no customer", () => {
    expect(buildQuotePdfFileName({ date, customerName: null })).toBe("orcamento_24092026");
    expect(buildQuotePdfFileName({ date, customerName: "   " })).toBe("orcamento_24092026");
  });

  it("adds a suffix for the service-only and material-only documents", () => {
    expect(buildQuotePdfFileName({ date, customerName: "Maria", mode: "service" })).toBe("orcamento_24092026_Maria_servico");
    expect(buildQuotePdfFileName({ date, customerName: "Maria", mode: "material" })).toBe("orcamento_24092026_Maria_material");
    expect(buildQuotePdfFileName({ date, mode: "material" })).toBe("orcamento_24092026_material");
  });

  it("falls back to the plain name when the customer name has nothing usable", () => {
    expect(buildQuotePdfFileName({ date, customerName: "***" })).toBe("orcamento_24092026");
  });
});

describe("toFileNamePart", () => {
  it("removes accents and turns spaces into hyphens", () => {
    expect(toFileNamePart("José da Conceição")).toBe("Jose-da-Conceicao");
  });

  it("drops path separators and unsafe characters", () => {
    const out = toFileNamePart("../../etc/passwd: Maria <b>");
    expect(out).not.toMatch(/[/\\:<>.]/);
    expect(out).toBe("etcpasswd-Maria-b");
  });

  it("collapses repeated separators and trims them", () => {
    expect(toFileNamePart("  --Ana   -  Lima--  ")).toBe("Ana-Lima");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const out = toFileNamePart("Maria ".repeat(20));
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("-")).toBe(false);
  });
});
