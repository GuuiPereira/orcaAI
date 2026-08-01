import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { interpretQuote, updateQuoteSourceText } from '@/lib/quotes';
import { supabase } from '@/lib/supabase';
import { ensureTestSession } from '@/lib/test-session';
import { useTheme } from '@/hooks/use-theme';

// Tela dedicada às perguntas da IA (RF-026/028). Só permite reprocessar
// UMA vez por orçamento - depois disso (ou se não houver perguntas), segue
// direto para o editor. O guard usa o histórico real de ai_interpretations,
// não só o estado de navegação, para não dar pra "burlar" voltando pra essa
// tela ou recarregando a página.
export default function QuoteQuestionsScreen() {
  const theme = useTheme();
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();

  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!quoteId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        await ensureTestSession();

        const { data: quote, error: quoteError } = await supabase
          .from('quotes')
          .select('source_text')
          .eq('id', quoteId)
          .single();
        if (quoteError || !quote) throw quoteError ?? new Error('Orçamento não encontrado.');
        if (cancelled) return;
        setSourceText(quote.source_text ?? '');

        const { data: interpretations, error: interpretationsError } = await supabase
          .from('ai_interpretations')
          .select('status, result')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false });
        if (interpretationsError) throw interpretationsError;
        if (cancelled) return;

        if ((interpretations?.length ?? 0) > 1) {
          router.replace(`/quote/${quoteId}`);
          return;
        }

        const latest = interpretations?.[0];
        const latestQuestions: string[] =
          latest?.status === 'concluido' && latest.result
            ? ((latest.result as { questions?: string[] }).questions ?? [])
            : [];

        if (latestQuestions.length === 0) {
          router.replace(`/quote/${quoteId}`);
          return;
        }

        setQuestions(latestQuestions);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  async function handleReprocess() {
    if (!quoteId) return;
    const answeredQuestions = questions
      .map((question, index) => ({ question, answer: answers[index]?.trim() }))
      .filter((entry): entry is { question: string; answer: string } => Boolean(entry.answer));

    if (answeredQuestions.length === 0) {
      Alert.alert(
        'Responda pelo menos uma pergunta',
        'Escreva uma resposta antes de reprocessar, ou toque em "Continuar sem responder".',
      );
      return;
    }

    setReprocessing(true);
    try {
      const extra = answeredQuestions.map((a) => `- ${a.question} ${a.answer}`).join('\n');
      const updatedSourceText = `${sourceText}\n\nInformações adicionais:\n${extra}`;
      await updateQuoteSourceText(quoteId, updatedSourceText);
      await interpretQuote(quoteId, { forceReprocess: true });
      router.replace(`/quote/${quoteId}`);
    } catch (error) {
      Alert.alert(
        'Não foi possível reprocessar',
        error instanceof Error ? error.message : String(error),
      );
      setReprocessing(false);
    }
  }

  function handleSkip() {
    if (!quoteId) return;
    router.replace(`/quote/${quoteId}`);
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
        <ThemedText themeColor="textSecondary">Carregando…</ThemedText>
      </ThemedView>
    );
  }

  if (errorMessage) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="smallBold">Não foi possível carregar</ThemedText>
        <ThemedText themeColor="textSecondary">{errorMessage}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            Antes de continuar
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            {questions.length === 1
              ? 'A IA teve uma dúvida sobre o texto.'
              : 'A IA teve algumas dúvidas sobre o texto.'}{' '}
            Responda o que souber ou continue sem responder.
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            {questions.map((question, index) => (
              <View key={index} style={styles.questionRow}>
                <ThemedText type="small">{question}</ThemedText>
                <TextInput
                  value={answers[index] ?? ''}
                  onChangeText={(text) => setAnswers((current) => ({ ...current, [index]: text }))}
                  placeholder="Sua resposta"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                />
              </View>
            ))}
          </ThemedView>

          <Pressable
            accessibilityRole="button"
            disabled={reprocessing}
            onPress={handleReprocess}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.text },
              pressed && styles.pressed,
            ]}>
            {reprocessing ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Reprocessar com as respostas
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={reprocessing}
            onPress={handleSkip}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.text },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Continuar sem responder</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  scroll: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  questionRow: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
  },
  primaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  secondaryButton: {
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
