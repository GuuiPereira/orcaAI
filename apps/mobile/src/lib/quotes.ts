import type {
  AiInterpretationResult,
  CommercialTerms,
  Discount,
  MANUALLY_SETTABLE_QUOTE_STATUSES,
  QuoteItemType,
  QuoteStatus,
} from '@orcaai/shared';

import { getCurrentOrganizationId } from './organizations';
import { supabase } from './supabase';

// RF-074: registro mínimo de auditoria - "criado" e os estados comerciais
// manuais (RF-073) podem ser gravados direto pelo membro (migração
// 20260920174502_quote_events_user_insert.sql); "emitido"/"reemitido"
// continuam exclusivos do `issue-quote` (service role), por isso não
// aparecem aqui.
async function logQuoteEvent(quoteId: string, eventType: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('quote_events')
    .insert({ quote_id: quoteId, event_type: eventType, actor_user_id: user?.id ?? null });
  if (error) throw error;
}

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

  // Falha ao registrar o evento não deve impedir o usuário de continuar -
  // é só auditoria (RF-074), o orçamento em si já foi criado com sucesso.
  logQuoteEvent(data.id as string, 'criado').catch(() => {});

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

// Formato que a function espera de fato (quantity numérica) - diferente de
// `PdfItem` (packages/shared), cujo `quantity` é string só pra exibição no
// PDF (ex.: pode ter vírgula decimal). Confundir os dois já quebrou a
// emissão de qualquer item com quantidade preenchida (400 "expected
// number, received string").
export type IssueQuoteItem = {
  type: QuoteItemType;
  description: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  total_price_cents: number | null;
};

// Task 4 (numeração, emissão e versões imutáveis): itens/desconto/condições
// só são gravados de verdade aqui - até a emissão ficam efêmeros no editor
// (ver .tasks/fase-2-mvp-fechado.md). O backend recalcula os totais (regra
// de negócio 6), nunca confia no que o app mandou.
export async function issueQuote(
  quoteId: string,
  payload: { items: IssueQuoteItem[]; discount: Discount | null; commercialTerms: CommercialTerms },
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

export type AttachQuotePdfResult = { pdf_path: string; already_attached: boolean };

// Task 6: grava `quote_versions.pdf_path` depois que o PDF já foi enviado
// pro bucket `quote-pdfs` (ver lib/quote-pdf-storage.ts) - essa tabela é
// somente-leitura pra `authenticated`, então essa gravação só acontece via
// function (mesmo padrão do `issue-quote`).
export async function attachQuotePdf(quoteId: string, version: number): Promise<AttachQuotePdfResult> {
  const { data, error } = await supabase.functions.invoke('attach-quote-pdf', {
    body: { quote_id: quoteId, version },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, 'Falha ao salvar o PDF emitido.'));
  }
  return data as AttachQuotePdfResult;
}

// Task 5 (histórico e busca) --------------------------------------------

export type QuoteListItem = {
  id: string;
  number: string | null;
  status: QuoteStatus;
  totalCents: number;
  createdAt: string;
  issuedAt: string | null;
  customerName: string | null;
};

export type QuoteListFilters = {
  search?: string;
  statuses?: QuoteStatus[];
  // RF-072: período relativo à criação, em dias (ex.: 7, 30) - null/undefined
  // = sem filtro de período.
  sinceDays?: number | null;
};

// RF-070/071/072: lista os orçamentos da organização, mais recentes
// primeiro, com busca (número, texto original ou nome do cliente
// vinculado) e filtros de estado/período combináveis.
export async function listQuotes(filters: QuoteListFilters = {}): Promise<QuoteListItem[]> {
  const organizationId = await getCurrentOrganizationId();
  if (!organizationId) return [];

  let query = supabase
    .from('quotes')
    .select('id, number, status, total_cents, created_at, issued_at, customer:customers(name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }
  if (filters.sinceDays) {
    const since = new Date();
    since.setDate(since.getDate() - filters.sinceDays);
    query = query.gte('created_at', since.toISOString());
  }

  // Caracteres com significado especial no filtro `.or()` do PostgREST
  // (vírgula separa condições, parênteses agrupam) são removidos - um
  // termo de busca com vírgula não deveria quebrar a query com um 400.
  const search = filters.search?.trim().replace(/[,()]/g, ' ').trim();
  if (search) {
    const { data: matchingCustomers } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', `%${search}%`);
    const customerIds = (matchingCustomers ?? []).map((c) => c.id);

    const orParts = [`number.ilike.%${search}%`, `source_text.ilike.%${search}%`];
    if (customerIds.length > 0) {
      orParts.push(`customer_id.in.(${customerIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status as QuoteStatus,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    issuedAt: row.issued_at,
    // supabase-js (sem tipos gerados do banco) infere embed como array por
    // padrão, mas `quotes.customer_id -> customers.id` é muitos-pra-um -
    // em tempo de execução vem sempre um objeto único (ou null).
    customerName: (row.customer as unknown as { name: string } | null)?.name ?? null,
  }));
}

export type ManuallySettableQuoteStatus = (typeof MANUALLY_SETTABLE_QUOTE_STATUSES)[number];

// RF-073: estados comerciais que o próprio usuário marca depois da emissão
// (enviado/aprovado/recusado/expirado) - grava o status e o evento junto
// (RF-074). Não é uma máquina de estados rígida: qualquer um desses pode
// virar qualquer outro, porque o "envio"/"aprovação" de verdade acontece
// fora do app (WhatsApp, conversa com o cliente), o usuário só reflete
// aqui o que já aconteceu.
export async function markQuoteStatus(quoteId: string, status: ManuallySettableQuoteStatus): Promise<void> {
  const { error } = await supabase.from('quotes').update({ status }).eq('id', quoteId);
  if (error) throw error;

  await logQuoteEvent(quoteId, status);
}

export type QuoteEvent = {
  id: string;
  eventType: string;
  createdAt: string;
};

// RF-074: linha do tempo mínima do orçamento (criação, emissão/reemissão,
// mudanças de estado comercial).
export async function listQuoteEvents(quoteId: string): Promise<QuoteEvent[]> {
  const { data, error } = await supabase
    .from('quote_events')
    .select('id, event_type, created_at')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({ id: row.id, eventType: row.event_type, createdAt: row.created_at }));
}
