// Valores monetários são sempre centavos inteiros (RF-047, docs/PRD.md §5).
// Formatação em pt-BR só acontece na exibição - nunca guarde/calcule em cima
// de uma string formatada.

export function formatCentsAsBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// Converte o texto de um campo editável (ex.: "1.130,50", "1130,5", "200")
// para centavos inteiros. `null` quando o texto não representa um número -
// campo vazio inclusive, nunca vira 0 silenciosamente.
export function parseReaisInputToCents(value: string): number | null {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

// Converte centavos pro texto de um campo editável (sem símbolo de moeda,
// vírgula decimal) - ex.: 113050 -> "1130,50".
export function centsToReaisInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
