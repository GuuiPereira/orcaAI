import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

// docs/ARCHITECTURE.md §10: "texto em edição é salvo localmente" enquanto
// não há histórico/múltiplos rascunhos (isso é Fase 2). Por ora existe um
// único rascunho ativo de "novo orçamento".
const DRAFT_STORAGE_KEY = 'orcaai:new-quote-draft:source-text';
const SAVE_DEBOUNCE_MS = 400;

export type QuoteDraftStatus = 'loading' | 'idle' | 'saving' | 'saved';

export function useQuoteDraft() {
  const [sourceText, setSourceTextState] = useState('');
  const [status, setStatus] = useState<QuoteDraftStatus>('loading');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(DRAFT_STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      setSourceTextState(stored ?? '');
      setStatus('idle');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setSourceText = useCallback((text: string) => {
    setSourceTextState(text);
    setStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_STORAGE_KEY, text).then(() => setStatus('saved'));
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const clearDraft = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSourceTextState('');
    setStatus('saving');
    AsyncStorage.removeItem(DRAFT_STORAGE_KEY).then(() => setStatus('saved'));
  }, []);

  return { sourceText, setSourceText, clearDraft, status };
}
