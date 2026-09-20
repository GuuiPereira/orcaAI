import type { AiInterpretationResult, CommercialTerms, Discount, PdfItem, QuoteStatus } from '@orcaai/shared';

import { getCurrentOrganizationId } from './organizations';
import { supabase } from './supabase';

export async function createQuoteWithText(
  sourceText: string,
  customerId: string | null = null,
): Promise<{ id: string }> {
  const organizationId = await getCurrentOrganizationId();
  if (!organizationId) throw new Error('Nenhuma organização encontrada.');

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      organization_id: organizationId,
      source_text: sourceText,
      status: 'rascunho',
      customer_id: customerId,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw error ?? new Error('Falha ao criar o orçamento.');
  }
  return data as { id: string };
}

export async function updateQuoteSourceText(quoteId: string, sourceText: string): Promise<void> {
  const { error } = await supabase.from('quotes').update({ source_text: sourceText }).eq('id', quoteId);
  if (error) throw error;
}

// RF-013: vincula (ou desvincula, com null) o cliente ao orçamento -
// gravado direto, sem esperar a emissão (task 4 cuida do resto do
// versionamento).
export async function updateQuoteCustomer(quoteId: string, customerId: string | null): Promise<void> {
  const { error } = await supabase.from('quotes').update({ customer_id: customerId }).eq('id', quoteId);
  if (error) throw error;
}

export type InterpretQuoteResult = {
  interpretation_id: string;
  status: 'concluido';
  result: AiInterpretationResult;
};

export async function interpretQuote(
  quoteId: string,
  options?: { forceReprocess?: boolean; model?: string },
): Promise<InterpretQuoteResult> {
  const { data, error } = await supabase.functions.invoke('interpret-quote', {
    body: {
      quote_id: quoteId,
      force_reprocess: options?.forceReprocess ?? false,
      ...(options?.model ? { model: options.model } : {}),
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, 'Falha ao chamar interpret-quote.'));
  }
  return data as InterpretQuoteResult;
}

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        if (body && typeof body.message === 'string') return body.message;
      } catch {
        // resposta não era JSON - cai para a mensagem genérica abaixo.
      }
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export type IssuedQuoteVersion = {
  id: string;
  version: number;
  snapshot_hash: string;
  issued_at: string;
  pdf_path: string | null;
};

export type IssueQuoteResult = {
  quote: {
    id: string;
    number: string;
    status: QuoteStatus;
    issued_at: string;
    valid_until: string | null;
    subtotal_cents: number;
    total_cents: number;
    current_version: number;
  };
  version: IssuedQuoteVersion;
  idempotent: boolean;
};

// Task 4 (numeração, emissão e versões imutáveis): itens/desconto/condições
// só são gravados de verdade aqui - até a emissão ficam efêmeros no editor
// (ver .tasks/fase-2-mvp-fechado.md). O backend recalcula os totais (regra
// de negócio 6), nunca confia no que o app mandou.
export async function issueQuote(
  quoteId: string,
  payload: { items: PdfItem[]; discount: Discount | null; commercialTerms: CommercialTerms },
): Promise<IssueQuoteResult> {
  const { data, error } = await supabase.functions.invoke('issue-quote', {
    body: {
      quote_id: quoteId,
      items: payload.items,
      discount: payload.discount,
      commercial_terms: payload.commercialTerms,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, 'Falha ao emitir o orçamento.'));
  }
  return data as IssueQuoteResult;
}
