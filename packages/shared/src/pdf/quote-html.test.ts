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

describe("buildQuoteHtml - per-type item tables", () => {
  it("renders services, materials and other items as separate tables, not one combined table", () => {
    const html = buildQuoteHtml({ ...baseInput, mode: "completo" });
    expect(html).toContain("<h2>Serviços</h2>");
    expect(html).toContain("<h2>Materiais</h2>");
    expect(html).toContain("<h2>Outros</h2>");
    // Cada seção tem sua própria tabela - o cabeçalho "Descrição" aparece
    // uma vez por tabela, não uma vez só pro documento inteiro.
    expect(html.match(/<th>Descrição<\/th>/g)).toHaveLength(3);
  });

  it("omits the Valor column entirely when no item of that type has a price (material por conta do cliente)", () => {
    const unpriced: PdfItem[] = [
      { type: "material", description: "Tinta", category: null, quantity: null, unit: null, total_price_cents: null },
    ];
    const html = buildQuoteHtml({ ...baseInput, items: unpriced, mode: "material" });
    expect(html).not.toContain('<th class="value">Valor</th>');
  });

  it("keeps the Valor column when at least one item of that type has a price", () => {
    const mixed: PdfItem[] = [
      { type: "material", description: "Tinta", category: null, quantity: null, unit: null, total_price_cents: null },
      { type: "material", description: "Cimento", category: null, quantity: null, unit: null, total_price_cents: 1000 },
    ];
    const html = buildQuoteHtml({ ...baseInput, items: mixed, mode: "material" });
    expect(html).toContain('<th class="value">Valor</th>');
  });
});

describe("buildQuoteHtml - summary with unpriced items", () => {
  it("shows a notice instead of totals when nothing in the document has a price", () => {
    const unpriced: PdfItem[] = [
      { type: "material", description: "Tinta", category: null, quantity: null, unit: null, total_price_cents: null },
    ];
    const html = buildQuoteHtml({ ...baseInput, items: unpriced, mode: "material" });
    expect(html).not.toContain("<h2>Resumo</h2>");
    expect(html).toContain("Nenhum item deste documento tem valor informado.");
  });

  it("still totals normally when only some items lack a price", () => {
    const mixed: PdfItem[] = [
      { type: "service", description: "Pintura", category: null, quantity: null, unit: null, total_price_cents: 20000 },
      { type: "material", description: "Tinta", category: null, quantity: null, unit: null, total_price_cents: null },
    ];
    const html = buildQuoteHtml({ ...baseInput, items: mixed, mode: "completo" });
    expect(html).toContain("<h2>Resumo</h2>");
    expect(html).toContain("200,00");
  });
});

describe("buildQuoteHtml - logo and extra notice", () => {
  const logo = "data:image/png;base64,iVBORw0KGgo=";

  it("renders the logo image in the header when a data URI is given", () => {
    const html = buildQuoteHtml({
      ...baseInput,
      items,
      mode: "completo",
      organization: { ...baseInput.organization, logoDataUri: logo },
    });
    expect(html).toContain(`<img class="logo" src="${logo}"`);
  });

  it("omits the image when there is no logo", () => {
    const html = buildQuoteHtml({ ...baseInput, items, mode: "completo" });
    expect(html).not.toContain("<img");
  });

  it("refuses anything that is not a base64 image data URI", () => {
    const html = buildQuoteHtml({
      ...baseInput,
      items,
      mode: "completo",
      organization: { ...baseInput.organization, logoDataUri: 'https://evil.example/x.png" onerror="alert(1)' },
    });
    expect(html).not.toContain("<img");
  });

  it("shows and escapes the extra notice", () => {
    const html = buildQuoteHtml({ ...baseInput, items, mode: "completo", notice: "EXEMPLO <b>" });
    expect(html).toContain("EXEMPLO &lt;b&gt;");
  });
});
