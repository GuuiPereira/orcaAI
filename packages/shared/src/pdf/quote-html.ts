import { formatCentsAsBRL } from "../calc/money.ts";
import { calculateQuoteTotals } from "../calc/quote-totals.ts";
import type { Discount } from "../domain/discount.ts";
import type { QuoteItemType } from "../domain/quote-item.ts";

// Modo de geração do documento (decisão de 2026-08-01,
// .tasks/fase-1-prova-do-nucleo.md item 6): o prestador escolhe entre
// completo, separado (2 PDFs: um "service" e um "material") ou só um dos
// dois. Itens `type: "other"` só aparecem no modo completo.
export type PdfMode = "completo" | "service" | "material";

export type PdfOrganization = {
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
};

export type PdfCustomer = {
  name: string | null;
  phone: string | null;
  address: string | null;
};

export type PdfItem = {
  type: QuoteItemType;
  description: string;
  category: string | null;
  quantity: string | null;
  unit: string | null;
  total_price_cents: number | null;
};

export type PdfCommercialTerms = {
  paymentTerms: string | null;
  estimatedDurationDays: number | null;
  validityDays: number | null;
};

export type BuildQuoteHtmlInput = {
  mode: PdfMode;
  organization: PdfOrganization;
  customer: PdfCustomer;
  // Conjunto completo do orçamento - o filtro por modo acontece aqui
  // dentro, então o total/subtotal exibidos são sempre os do documento
  // gerado, não do orçamento inteiro.
  items: readonly PdfItem[];
  discount: Discount | null;
  commercialTerms: PdfCommercialTerms;
  issuedAt: Date;
};

const MODE_NOTICE: Record<PdfMode, string | null> = {
  completo: null,
  service: "Este documento se refere apenas aos serviços do orçamento.",
  material: "Este documento se refere apenas aos materiais do orçamento.",
};

// "other" só entra no modo completo - não existe um "somente outros".
export function filterItemsForMode(items: readonly PdfItem[], mode: PdfMode): PdfItem[] {
  if (mode === "completo") return [...items];
  return items.filter((item) => item.type === mode);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDatePtBR(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function buildQuoteHtml(input: BuildQuoteHtmlInput): string {
  const items = filterItemsForMode(input.items, input.mode);
  const totals = calculateQuoteTotals(items, input.discount);
  const modeNotice = MODE_NOTICE[input.mode];

  const itemsRows = items
    .map((item) => {
      const qty = item.quantity ? escapeHtml(item.quantity) : "-";
      const unit = item.unit ? escapeHtml(item.unit) : "-";
      const value =
        item.total_price_cents !== null ? formatCentsAsBRL(item.total_price_cents) : "-";
      const categoryLine = item.category
        ? `<br /><small class="muted">${escapeHtml(item.category)}</small>`
        : "";
      return `<tr>
        <td>${escapeHtml(item.description)}${categoryLine}</td>
        <td>${qty}</td>
        <td>${unit}</td>
        <td class="value">${value}</td>
      </tr>`;
    })
    .join("");

  const discountRow =
    totals.discountCents > 0
      ? `<tr><td colspan="3">Desconto</td><td class="value">- ${formatCentsAsBRL(totals.discountCents)}</td></tr>`
      : "";

  const paymentLine = input.commercialTerms.paymentTerms
    ? `<p><strong>Forma de pagamento:</strong> ${escapeHtml(input.commercialTerms.paymentTerms)}</p>`
    : "";
  const durationLine = input.commercialTerms.estimatedDurationDays
    ? `<p><strong>Prazo estimado:</strong> ${input.commercialTerms.estimatedDurationDays} dia(s)</p>`
    : "";
  const validityLine = input.commercialTerms.validityDays
    ? `<p><strong>Validade da proposta:</strong> ${input.commercialTerms.validityDays} dia(s) a partir da emissão.</p>`
    : "";
  const commercialTermsSection =
    paymentLine || durationLine || validityLine
      ? `<h2>Condições comerciais</h2>${paymentLine}${durationLine}${validityLine}`
      : "";

  const customerContactLine = [input.customer.phone, input.customer.address]
    .filter((value): value is string => Boolean(value))
    .map(escapeHtml)
    .join(" · ");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 32px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 16px; }
  .header-right { text-align: right; }
  .muted { color: #555; }
  .notice { background: #f5f5f5; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  th { font-size: 11px; text-transform: uppercase; color: #555; }
  td.value, th.value { text-align: right; }
  .total-row td { font-weight: bold; font-size: 15px; border-top: 2px solid #111; border-bottom: none; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(input.organization.tradeName)}</h1>
      ${input.organization.legalName ? `<div class="muted">${escapeHtml(input.organization.legalName)}</div>` : ""}
      ${input.organization.taxId ? `<div class="muted">${escapeHtml(input.organization.taxId)}</div>` : ""}
      ${input.organization.contactPhone ? `<div class="muted">${escapeHtml(input.organization.contactPhone)}</div>` : ""}
      ${input.organization.contactEmail ? `<div class="muted">${escapeHtml(input.organization.contactEmail)}</div>` : ""}
      ${input.organization.address ? `<div class="muted">${escapeHtml(input.organization.address)}</div>` : ""}
    </div>
    <div class="header-right">
      <h1>ORÇAMENTO</h1>
      <div class="muted">${formatDatePtBR(input.issuedAt)}</div>
    </div>
  </div>

  <div class="notice">Este documento apresenta uma estimativa de valores e não é um documento fiscal.</div>
  ${modeNotice ? `<div class="notice">${modeNotice}</div>` : ""}

  <h2>Cliente</h2>
  <p>
    ${input.customer.name ? escapeHtml(input.customer.name) : "-"}
    ${customerContactLine ? `<br />${customerContactLine}` : ""}
  </p>

  <h2>Itens</h2>
  <table>
    <thead>
      <tr><th>Descrição</th><th>Qtd.</th><th>Unidade</th><th class="value">Valor</th></tr>
    </thead>
    <tbody>
      ${itemsRows || '<tr><td colspan="4">Nenhum item.</td></tr>'}
      <tr><td colspan="3">Subtotal</td><td class="value">${formatCentsAsBRL(totals.subtotalCents)}</td></tr>
      ${discountRow}
      <tr class="total-row"><td colspan="3">Total</td><td class="value">${formatCentsAsBRL(totals.totalCents)}</td></tr>
    </tbody>
  </table>

  ${commercialTermsSection}
</body>
</html>`;
}
