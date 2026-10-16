import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useRef, useState } from 'react';

// `quote/[quoteId]` (a tela de revisão) só grava os itens no banco quando o
// orçamento é EMITIDO (quote_items só vira fonte de verdade depois da 1ª
// emissão). Antes disso, editar um item, sair da tela (ou o app recarregar)
// e voltar fazia o editor recarregar a interpretação original da IA do zero,
// perdendo toda edição em andamento. Mesma ideia do rascunho de texto do
// "Novo orçamento" (use-quote-draft.ts), agora por orçamento: o que ainda
// não foi emitido fica salvo neste aparelho e prevalece sobre o que vier do
// banco até ser emitido (ver load() e handleIssuePress em
// app/quote/[quoteId]/index.tsx).
const DRAFT_KEY_PREFIX = 'orcaai:quote-editor-draft:';
const SAVE_DEBOUNCE_MS = 500;

export type QuoteEditorDraftStatus = 'idle' | 'saving' | 'saved';

export function useQuoteEditorDraft<T>(quoteId: string | undefined) {
  const [status, setStatus] = useState<QuoteEditorDraftStatus>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = quoteId ? DRAFT_KEY_PREFIX + quoteId : null;

  const loadDraft = useCallback(async (): Promise<T | null> => {
    if (!key) return null;
    try {
      const stored = await AsyncStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : null;
    } catch {
      // Rascunho corrompido não deve travar o carregamento do editor - cai
      // pro que veio do banco, como se não houvesse rascunho nenhum.
      return null;
    }
  }, [key]);

  const saveDraft = useCallback(
    (value: T) => {
      if (!key) return;
      setStatus('saving');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        AsyncStorage.setItem(key, JSON.stringify(value))
          .then(() => setStatus('saved'))
          .catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    },
    [key],
  );

  // Chamado quando o que estava só no rascunho virou de fato o orçamento
  // emitido (quote_items) - o rascunho local deixou de ser necessário.
  const clearDraft = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setStatus('idle');
    if (key) AsyncStorage.removeItem(key).catch(() => {});
  }, [key]);

  return { status, loadDraft, saveDraft, clearDraft };
}
