import type { PdfMode } from "./quote-html.ts";

// Nome do arquivo compartilhado (sem extensão): orcamento_DDMMAAAA[_Cliente][_servico|_material].
//
// Sem acento e sem caracteres fora de [A-Za-z0-9-] de propósito: nomes de
// arquivo com acento, espaço ou barra quebram em alguns apps de destino e em
// sistemas de arquivos, e o nome do cliente é texto livre digitado pelo
// prestador (pode ter "/", ".." etc.).
const MAX_CUSTOMER_PART_LENGTH = 40;

const MODE_SUFFIX: Record<PdfMode, string | null> = {
  completo: null,
  service: "servico",
  material: "material",
};

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

export function toFileNamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CUSTOMER_PART_LENGTH)
    .replace(/-+$/g, "");
}

export type QuotePdfFileNameInput = {
  date: Date;
  customerName?: string | null;
  mode?: PdfMode;
};

export function buildQuotePdfFileName(input: QuotePdfFileNameInput): string {
  const day = `${pad(input.date.getDate(), 2)}${pad(input.date.getMonth() + 1, 2)}${input.date.getFullYear()}`;
  const customer = input.customerName ? toFileNamePart(input.customerName) : "";
  const suffix = MODE_SUFFIX[input.mode ?? "completo"];
  return ["orcamento", day, customer, suffix].filter(Boolean).join("_");
}
