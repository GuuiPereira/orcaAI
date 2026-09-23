import { formatCentsAsBRL } from "../calc/money.ts";
import { calculateQuoteTotals, sumItemTotals } from "../calc/quote-totals.ts";
import type { Discount } from "../domain/discount.ts";
import { QUOTE_ITEM_TYPE_LABELS, type QuoteItemType } from "../domain/quote-item.ts";

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
  // Logo já embutido como data URI (o bucket é privado e o PDF é gerado
  // localmente - uma URL remota não é confiável no expo-print). Sem logo,
  // o cabeçalho fica igual ao de antes.
  logoDataUri?: string | null;
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
  // Aviso extra exibido no topo (ex.: "EXEMPLO" na prévia do perfil).
  notice?: string | null;
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

// Ordem fixa de exibição das tabelas por tipo - "other" só existe no modo
// completo, mas se aparecer, vem por último.
const TYPE_ORDER: readonly QuoteItemType[] = ["service", "material", "other"];

function buildItemRowHtml(item: PdfItem, showValueColumn: boolean): string {
  const qty = item.quantity ? escapeHtml(item.quantity) : "-";
  const unit = item.unit ? escapeHtml(item.unit) : "-";
  const categoryLine = item.category
    ? `<br /><small class="muted">${escapeHtml(item.category)}</small>`
    : "";
  const valueCell = showValueColumn
    ? `<td class="value">${item.total_price_cents !== null ? formatCentsAsBRL(item.total_price_cents) : "-"}</td>`
    : "";
  return `<tr>
    <td>${escapeHtml(item.description)}${categoryLine}</td>
    <td>${qty}</td>
    <td>${unit}</td>
    ${valueCell}
  </tr>`;
}

// Uma tabela por tipo (serviço/material/outro) em vez de uma tabela única -
// serviços e materiais não devem ficar misturados na mesma tabela no modo
// "completo". A coluna "Valor" some inteira quando nenhum item do grupo tem
// preço: é o caso comum de material por conta do cliente (RF-027 - a IA
// nunca inventa preço, e aqui a ausência dele é uma opção de negócio
// válida, não um dado faltando).
function buildItemsTableHtml(typeItems: readonly PdfItem[], type: QuoteItemType): string {
  const hasAnyPrice = typeItems.some((item) => item.total_price_cents !== null);
  const rows = typeItems.map((item) => buildItemRowHtml(item, hasAnyPrice)).join("");
  const subtotalRow = hasAnyPrice
    ? `<tr><td colspan="3">Subtotal</td><td class="value">${formatCentsAsBRL(sumItemTotals(typeItems))}</td></tr>`
    : "";
  return `<h2>${escapeHtml(QUOTE_ITEM_TYPE_LABELS[type])}</h2>
  <table>
    <thead>
      <tr><th>Descrição</th><th>Qtd.</th><th>Unidade</th>${hasAnyPrice ? '<th class="value">Valor</th>' : ""}</tr>
    </thead>
    <tbody>
      ${rows}
      ${subtotalRow}
    </tbody>
  </table>`;
}

export function buildQuoteHtml(input: BuildQuoteHtmlInput): string {
  const items = filterItemsForMode(input.items, input.mode);
  const totals = calculateQuoteTotals(items, input.discount);
  const modeNotice = MODE_NOTICE[input.mode];
  const hasAnyPricedItem = items.some((item) => item.total_price_cents !== null);

  const itemsSectionsHtml =
    TYPE_ORDER.map((type) => {
      const typeItems = items.filter((item) => item.type === type);
      return typeItems.length > 0 ? buildItemsTableHtml(typeItems, type) : "";
    }).join("") || "<h2>Itens</h2><p>Nenhum item.</p>";

  // Sem nenhum preço no documento inteiro (ex.: PDF só de materiais, todos
  // por conta do cliente), um "Total: R$ 0,00" passaria a falsa impressão
  // de que o serviço é gratuito - melhor não mostrar nenhum total.
  const summarySectionHtml = hasAnyPricedItem
    ? `<h2>Resumo</h2>
  <table>
    <tbody>
      ${(Object.entries(totals.subtotalByType) as [QuoteItemType, number][])
        .filter(([, cents], _index, all) => cents > 0 && all.filter(([, c]) => c > 0).length > 1)
        .map(
          ([type, cents]) =>
            `<tr><td>${escapeHtml(QUOTE_ITEM_TYPE_LABELS[type])}</td><td class="value">${formatCentsAsBRL(cents)}</td></tr>`,
        )
        .join("")}
      <tr><td>Subtotal</td><td class="value">${formatCentsAsBRL(totals.subtotalCents)}</td></tr>
      ${
        totals.discountCents > 0
          ? `<tr><td>Desconto</td><td class="value">- ${formatCentsAsBRL(totals.discountCents)}</td></tr>`
          : ""
      }
      <tr class="total-row"><td>Total</td><td class="value">${formatCentsAsBRL(totals.totalCents)}</td></tr>
    </tbody>
  </table>`
    : `<div class="notice">Nenhum item deste documento tem valor informado.</div>`;

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

  // Só aceita data URI de imagem - nunca injeta uma string arbitrária no src.
  const logoHtml =
    input.organization.logoDataUri && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.organization.logoDataUri)
      ? `<img class="logo" src="${input.organization.logoDataUri}" alt="" />`
      : "";

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
  .header-left { display: flex; align-items: flex-start; gap: 12px; }
  .logo { max-height: 64px; max-width: 120px; object-fit: contain; }
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
    <div class="header-left">
      ${logoHtml}
      <div>
      <h1>${escapeHtml(input.organization.tradeName)}</h1>
      ${input.organization.legalName ? `<div class="muted">${escapeHtml(input.organization.legalName)}</div>` : ""}
      ${input.organization.taxId ? `<div class="muted">${escapeHtml(input.organization.taxId)}</div>` : ""}
      ${input.organization.contactPhone ? `<div class="muted">${escapeHtml(input.organization.contactPhone)}</div>` : ""}
      ${input.organization.contactEmail ? `<div class="muted">${escapeHtml(input.organization.contactEmail)}</div>` : ""}
      ${input.organization.address ? `<div class="muted">${escapeHtml(input.organization.address)}</div>` : ""}
      </div>
    </div>
    <div class="header-right">
      <h1>ORÇAMENTO</h1>
      <div class="muted">${formatDatePtBR(input.issuedAt)}</div>
    </div>
  </div>

  <div class="notice">Este documento apresenta uma estimativa de valores e não é um documento fiscal.</div>
  ${modeNotice ? `<div class="notice">${modeNotice}</div>` : ""}
  ${input.notice ? `<div class="notice">${escapeHtml(input.notice)}</div>` : ""}

  <h2>Cliente</h2>
  <p>
    ${input.customer.name ? escapeHtml(input.customer.name) : "-"}
    ${customerContactLine ? `<br />${customerContactLine}` : ""}
  </p>

  ${itemsSectionsHtml}

  ${summarySectionHtml}

  ${commercialTermsSection}
</body>
</html>`;
}
