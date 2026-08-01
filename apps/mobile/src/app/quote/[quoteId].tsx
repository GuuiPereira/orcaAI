import type { AiConfidence, AiInterpretationResult } from '@orcaai/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { interpretQuote, updateQuoteSourceText } from '@/lib/quotes';
import { supabase } from '@/lib/supabase';
import { ensureTestSession } from '@/lib/test-session';
import { useTheme } from '@/hooks/use-theme';

// Cor de destaque para campos incertos/ausentes (RF-024, RF-025). Não faz
// parte da paleta base do app - é um acento semântico, funciona em claro e
// escuro por ser usada só como borda/ícone, nunca como fundo cheio.
const UNCERTAIN_ACCENT = '#eab308';

type EditableItem = {
  key: string;
  type: 'service' | 'material' | 'other';
  description: string;
  category: string;
  quantity: string;
  unit: string;
  unitPriceReais: string;
  confidence: AiConfidence | null;
};

type EditableCustomer = {
  name: string;
  phone: string;
  address: string;
};

type EditableCommercialTerms = {
  paymentTerms: string;
  estimatedDurationDays: string;
  validityDays: string;
};

function centsToReaisString(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

function reaisStringToCents(value: string): number | null {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function itemFromResult(item: AiInterpretationResult['items'][number], key: string): EditableItem {
  return {
    key,
    type: item.type,
    description: item.description,
    category: item.category ?? '',
    quantity: item.quantity !== null ? String(item.quantity) : '',
    unit: item.unit ?? '',
    unitPriceReais: centsToReaisString(item.unit_price_cents),
    confidence: item.confidence,
  };
}

export default function QuoteEditorScreen() {
  const theme = useTheme();
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();
  const keyCounter = useRef(0);
  const nextKey = () => `item-${keyCounter.current++}`;

  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [showOriginalText, setShowOriginalText] = useState(false);

  const [customer, setCustomer] = useState<EditableCustomer>({ name: '', phone: '', address: '' });
  const [items, setItems] = useState<EditableItem[]>([]);
  const [commercialTerms, setCommercialTerms] = useState<EditableCommercialTerms>({
    paymentTerms: '',
    estimatedDurationDays: '',
    validityDays: '',
  });
  const [questions, setQuestions] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  function applyResult(result: AiInterpretationResult) {
    setCustomer({
      name: result.customer.name ?? '',
      phone: result.customer.phone ?? '',
      address: result.customer.address ?? '',
    });
    setItems(result.items.map((item) => itemFromResult(item, nextKey())));
    setCommercialTerms({
      paymentTerms: result.commercial_terms.payment_terms ?? '',
      estimatedDurationDays:
        result.commercial_terms.estimated_duration_days !== null
          ? String(result.commercial_terms.estimated_duration_days)
          : '',
      validityDays:
        result.commercial_terms.validity_days !== null
          ? String(result.commercial_terms.validity_days)
          : '',
    });
    setQuestions(result.questions);
    setWarnings(result.warnings);
    setAnswers({});
  }

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

        const { data: interpretation, error: interpretationError } = await supabase
          .from('ai_interpretations')
          .select('status, result')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (interpretationError) throw interpretationError;
        if (cancelled) return;

        if (interpretation?.status === 'concluido' && interpretation.result) {
          applyResult(interpretation.result as AiInterpretationResult);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  const total = useMemo(() => {
    return items.reduce((sum, item) => {
      const quantity = Number(item.quantity.replace(',', '.')) || 1;
      const unitCents = reaisStringToCents(item.unitPriceReais) ?? 0;
      return sum + quantity * unitCents;
    }, 0);
  }, [items]);

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        key: nextKey(),
        type: 'service',
        description: '',
        category: '',
        quantity: '',
        unit: '',
        unitPriceReais: '',
        confidence: null,
      },
    ]);
  }

  async function handleReprocess() {
    if (!quoteId) return;
    const answeredQuestions = questions
      .map((question, index) => ({ question, answer: answers[index]?.trim() }))
      .filter((entry): entry is { question: string; answer: string } => Boolean(entry.answer));

    if (answeredQuestions.length === 0) {
      Alert.alert('Responda pelo menos uma pergunta', 'Escreva a resposta antes de reprocessar.');
      return;
    }

    setReprocessing(true);
    try {
      const extra = answeredQuestions.map((a) => `- ${a.question} ${a.answer}`).join('\n');
      const updatedSourceText = `${sourceText}\n\nInformações adicionais:\n${extra}`;
      await updateQuoteSourceText(quoteId, updatedSourceText);
      setSourceText(updatedSourceText);

      const response = await interpretQuote(quoteId, { forceReprocess: true });
      applyResult(response.result);
    } catch (error) {
      Alert.alert(
        'Não foi possível reprocessar',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setReprocessing(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
        <ThemedText themeColor="textSecondary">Carregando orçamento…</ThemedText>
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
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Voltar</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            Revisar orçamento
          </ThemedText>
        <ThemedText themeColor="textSecondary">
          Confira o que a IA entendeu, corrija o que precisar e responda o que estiver faltando.
        </ThemedText>

        <Pressable onPress={() => setShowOriginalText((v) => !v)}>
          <ThemedText type="link">
            {showOriginalText ? 'Ocultar texto original' : 'Ver texto original'}
          </ThemedText>
        </Pressable>
        {showOriginalText && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">{sourceText}</ThemedText>
          </ThemedView>
        )}

        {warnings.length > 0 && (
          <ThemedView type="backgroundElement" style={[styles.card, styles.warningCard]}>
            <ThemedText type="smallBold">Avisos</ThemedText>
            {warnings.map((warning, index) => (
              <ThemedText key={index} type="small">
                • {warning}
              </ThemedText>
            ))}
          </ThemedView>
        )}

        {questions.length > 0 && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Perguntas da IA</ThemedText>
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
            <Pressable
              accessibilityRole="button"
              disabled={reprocessing}
              onPress={handleReprocess}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: theme.text },
                pressed && styles.pressed,
              ]}>
              {reprocessing ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <ThemedText type="smallBold">Responder e reprocessar</ThemedText>
              )}
            </Pressable>
          </ThemedView>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Cliente</ThemedText>
          <LabeledInput
            label="Nome"
            value={customer.name}
            onChangeText={(name) => setCustomer((c) => ({ ...c, name }))}
            uncertain={!customer.name}
          />
          <LabeledInput
            label="Telefone"
            value={customer.phone}
            onChangeText={(phone) => setCustomer((c) => ({ ...c, phone }))}
            uncertain={!customer.phone}
          />
          <LabeledInput
            label="Endereço"
            value={customer.address}
            onChangeText={(address) => setCustomer((c) => ({ ...c, address }))}
            uncertain={!customer.address}
          />
        </ThemedView>

        <ThemedView style={styles.itemsHeader}>
          <ThemedText type="smallBold">Itens</ThemedText>
          <Pressable onPress={addItem}>
            <ThemedText type="link">+ adicionar item</ThemedText>
          </Pressable>
        </ThemedView>

        {items.map((item) => (
          <ItemCard key={item.key} item={item} onChange={updateItem} onRemove={removeItem} />
        ))}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Condições comerciais</ThemedText>
          <LabeledInput
            label="Forma de pagamento"
            value={commercialTerms.paymentTerms}
            onChangeText={(paymentTerms) => setCommercialTerms((c) => ({ ...c, paymentTerms }))}
            uncertain={!commercialTerms.paymentTerms}
          />
          <LabeledInput
            label="Prazo estimado (dias)"
            value={commercialTerms.estimatedDurationDays}
            onChangeText={(estimatedDurationDays) =>
              setCommercialTerms((c) => ({ ...c, estimatedDurationDays }))
            }
            keyboardType="numeric"
            uncertain={!commercialTerms.estimatedDurationDays}
          />
          <LabeledInput
            label="Validade (dias)"
            value={commercialTerms.validityDays}
            onChangeText={(validityDays) => setCommercialTerms((c) => ({ ...c, validityDays }))}
            keyboardType="numeric"
            uncertain={!commercialTerms.validityDays}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">
            Total estimado: R$ {(total / 100).toFixed(2).replace('.', ',')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Cálculo final com desconto e validação vem na próxima etapa.
          </ThemedText>
        </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  uncertain,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  uncertain?: boolean;
  keyboardType?: 'default' | 'numeric';
}) {
  const theme = useTheme();
  return (
    <View style={styles.fieldRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {uncertain ? ' •' : ''}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background },
          uncertain && styles.uncertainInput,
        ]}
      />
    </View>
  );
}

function ItemCard({
  item,
  onChange,
  onRemove,
}: {
  item: EditableItem;
  onChange: (key: string, patch: Partial<EditableItem>) => void;
  onRemove: (key: string) => void;
}) {
  const theme = useTheme();
  const uncertain = item.confidence !== null && item.confidence !== 'high';

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, uncertain && styles.uncertainCard]}>
      <View style={styles.itemHeaderRow}>
        <View style={styles.typeToggle}>
          {(['service', 'material', 'other'] as const).map((type) => (
            <Pressable
              key={type}
              onPress={() => onChange(item.key, { type })}
              style={[
                styles.typeOption,
                {
                  backgroundColor: item.type === type ? theme.text : 'transparent',
                  borderColor: theme.textSecondary,
                },
              ]}>
              <ThemedText
                type="small"
                style={{ color: item.type === type ? theme.background : theme.textSecondary }}>
                {type === 'service' ? 'serviço' : type === 'material' ? 'material' : 'outro'}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => onRemove(item.key)}>
          <ThemedText type="small" themeColor="textSecondary">
            remover
          </ThemedText>
        </Pressable>
      </View>

      <LabeledInput
        label="Descrição"
        value={item.description}
        onChangeText={(description) => onChange(item.key, { description })}
        uncertain={!item.description}
      />
      <LabeledInput
        label="Categoria"
        value={item.category}
        onChangeText={(category) => onChange(item.key, { category })}
      />
      <View style={styles.itemNumbersRow}>
        <View style={styles.itemNumberField}>
          <LabeledInput
            label="Quantidade"
            value={item.quantity}
            onChangeText={(quantity) => onChange(item.key, { quantity })}
            keyboardType="numeric"
            uncertain={!item.quantity}
          />
        </View>
        <View style={styles.itemNumberField}>
          <LabeledInput
            label="Unidade"
            value={item.unit}
            onChangeText={(unit) => onChange(item.key, { unit })}
            uncertain={!item.unit}
          />
        </View>
        <View style={styles.itemNumberField}>
          <LabeledInput
            label="Valor unitário (R$)"
            value={item.unitPriceReais}
            onChangeText={(unitPriceReais) => onChange(item.key, { unitPriceReais })}
            keyboardType="numeric"
            uncertain={!item.unitPriceReais}
          />
        </View>
      </View>
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
    gap: Spacing.two,
  },
  warningCard: {
    borderWidth: 1,
    borderColor: UNCERTAIN_ACCENT,
  },
  uncertainCard: {
    borderWidth: 1,
    borderColor: UNCERTAIN_ACCENT,
  },
  questionRow: {
    gap: Spacing.one,
  },
  fieldRow: {
    gap: Spacing.half,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
  },
  uncertainInput: {
    borderWidth: 1,
    borderColor: UNCERTAIN_ACCENT,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeToggle: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  typeOption: {
    borderWidth: 1,
    borderRadius: Spacing.five,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  itemNumbersRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  itemNumberField: {
    flex: 1,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.8,
  },
});
