import { decode } from 'base64-arraybuffer';
import * as Print from 'expo-print';

import { attachQuotePdf } from './quotes';
import { supabase } from './supabase';

const PDF_BUCKET = 'quote-pdfs';

export type IssuedQuoteTarget = { organizationId: string; quoteId: string; version: number };

// Task 6: depois de emitir (issue-quote), renderiza o PDF "completo" da
// versão recém-criada e sobe pro Storage - troca o "gera na hora, sempre"
// da Fase 1 por "gera uma vez na emissão, reusa depois" (mesmo caminho que
// `attach-quote-pdf` recalcula e confere do lado do servidor, então não dá
// pra divergir por engano).
export async function saveIssuedQuotePdf(html: string, target: IssuedQuoteTarget): Promise<void> {
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) {
    throw new Error('Falha ao gerar o PDF do orçamento emitido.');
  }

  const path = `${target.organizationId}/${target.quoteId}/${target.version}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, decode(base64), { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  await attachQuotePdf(target.quoteId, target.version);
}
