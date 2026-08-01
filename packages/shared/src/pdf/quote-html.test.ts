import { describe, expect, it } from "vitest";
import { buildQuoteHtml, filterItemsForMode, type PdfItem } from "./quote-html";

const items: PdfItem[] = [
  {
    type: "service",
    description: "Pintura sala",
    category: "Área interna",
    quantity: null,
    unit: null,
    total_price_cents: 20000,
  },
  {
    type: "material",
    description: "Tinta acrílica",
    category: null,
    quantity: "10",
    unit: "litros",
    total_price_cents: 35000,
  },
  {
    type: "other",
    description: "Taxa de deslocamento",
    category: null,
    quantity: null,
    unit: null,
    total_price_cents: 5000,
  },
];

const baseInput = {
  organization: {
    tradeName: "Pintura do Zé",
    legalName: "Zé Pinturas ME",
    taxId: "00.000.000/0001-00",
    contactPhone: "(11) 99999-0000",
    contactEmail: "ze@example.com",
    address: "Rua das Flores, 123",
  },
  customer: { name: "Maria", phone: "(11) 98888-0000", address: "Rua A, 10" },
  items,
  discount: null,
  commercialTerms: { paymentTerms: "Metade na entrada", estimatedDurationDays: 5, validityDays: 10 },
  issuedAt: new Date("2026-08-01T12:00:00Z"),
};

describe("filterItemsForMode", () => {
  it("keeps every item, including 'other', in completo mode", () => {
    expect(filterItemsForMode(items, "completo")).toHaveLength(3);
  });

  it("keeps only service items in service mode", () => {
    const filtered = filterItemsForMode(items, "service");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("service");
  });

  it("keeps only material items in material mode", () => {
    const filtered = filterItemsForMode(items, "material");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("material");
  });

  it("excludes 'other' items from both service and material modes", () => {
    expect(filterItemsForMode(items, "service").some((i) => i.type === "other")).toBe(false);
    expect(filterItemsForMode(items, "material").some((i) => i.type === "other")).toBe(false);
  });
});

describe("buildQuoteHtml", () => {
  it("includes the organization, customer and item data", () => {
    const html = buildQuoteHtml({ ...baseInput, mode: "completo" });
    expect(html).toContain("Pintura do Zé");
    expect(html).toContain("Maria");
    expect(html).toContain("Pintura sala");
    expect(html).toContain("Tinta acrílica");
  });

  it("labels the document as an orçamento, not a fiscal document", () => {
    const html = buildQuoteHtml({ ...baseInput, mode: "completo" });
    expect(html).toContain("ORÇAMENTO");
    expect(html).toMatch(/não é um documento fiscal/i);
  });

  it("computes the total from only the filtered items in service mode", () => {
    const html = buildQuoteHtml({ ...baseInput, mode: "service" });
    // Só o item de serviço (R$ 200,00) deve entrar - não o material nem o "other".
    expect(html).toContain("200,00");
    expect(html).not.toContain("Tinta acrílica");
    expect(html).not.toContain("Taxa de deslocamento");
  });

  it("shows a notice explaining a service/material-only document", () => {
    const html = buildQuoteHtml({ ...baseInput, mode: "material" });
    expect(html).toMatch(/refere-se apenas aos materiais|apenas aos materiais/i);
  });

  it("does not show a mode notice for completo", () => {
    const html = buildQuoteHtml({ ...baseInput, mode: "completo" });
    expect(html).not.toMatch(/refere-se apenas/i);
  });

  it("applies a discount to the filtered subtotal, not the whole quote", () => {
    const html = buildQuoteHtml({
      ...baseInput,
      mode: "service",
      discount: { type: "percentage", value_percent: 10 },
    });
    // Subtotal do modo "service" é R$200,00; 10% de desconto = R$20,00.
    expect(html).toContain("20,00");
  });

  it("escapes HTML in free-text fields to avoid breaking the document", () => {
    const html = buildQuoteHtml({
      ...baseInput,
      mode: "completo",
      customer: { name: "<script>alert(1)</script>", phone: null, address: null },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits commercial terms section when there are none", () => {
    const html = buildQuoteHtml({
      ...baseInput,
      mode: "completo",
      commercialTerms: { paymentTerms: null, estimatedDurationDays: null, validityDays: null },
    });
    expect(html).not.toContain("Condições comerciais");
  });
});
