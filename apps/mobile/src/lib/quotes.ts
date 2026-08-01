import type { AiInterpretationResult } from '@orcaai/shared';

import { getTestOrganizationId } from './test-session';
import { supabase } from './supabase';

export async function createQuoteWithText(sourceText: string): Promise<{ id: string }> {
  const organizationId = await getTestOrganizationId();

  const { data, error } = await supabase
    .from('quotes')
    .insert({ organization_id: organizationId, source_text: sourceText, status: 'rascunho' })
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
    throw new Error(await extractFunctionErrorMessage(error));
  }
  return data as InterpretQuoteResult;
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
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
  return error instanceof Error ? error.message : 'Falha ao chamar interpret-quote.';
}
