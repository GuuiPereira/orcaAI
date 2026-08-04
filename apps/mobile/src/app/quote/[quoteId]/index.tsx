import type { AiConfidence, AiInterpretationResult, Discount, PdfItem, QuoteItemType } from '@orcaai/shared';
import {
  buildQuoteHtml,
  calculateQuoteTotals,
  centsToReaisInput,
  formatCentsAsBRL,
  parseReaisInputToCents,
} from '@orcaai/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput } from '@/components/labeled-input';
import { PdfPreview } from '@/components/pdf-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { shareQuotePdf } from '@/lib/pdf-share';
import { getCurrentOrganization, type CurrentOrganization } from '@/lib/organizations';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

// Cor de destaque para campos incertos/ausentes (RF-024, RF-025) e para
// erros de validação (RF-049). Não faz parte da paleta base do app - são
// acentos semânticos, usados só em borda/texto, nunca como fundo cheio.
const UNCERTAIN_ACCENT = '#eab308';

const ITEM_TYPE_LABELS: Record<QuoteItemType, string> = {
  service: 'serviço',
  material: 'material',
  other: 'outro',
};

const SUBTOTAL_TYPE_LABELS: Record<QuoteItemType, string> = {
  service: 'Serviços',
  material: 'Materiais',
  other: 'Outros',
};

type DiscountKind = 'none' | 'fixed' | 'percentage';

const DISCOUNT_KIND_OPTIONS: { value: DiscountKind; label: string }[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'fixed', label: 'Valor fixo' },
  { value: 'percentage', label: 'Percentual' },
];

// Modo de geração do PDF (decisão de 2026-08-01,
// .tasks/fase-1-prova-do-nucleo.md item 6).
type PdfGenerationMode = 'completo' | 'separado' | 'service' | 'material';

const PDF_MODE_OPTIONS: { value: PdfGenerationMode; label: string }[] = [
  { value: 'completo', label: 'Completo' },
  { value: 'separado', label: 'Separado' },
  { value: 'service', label: 'Só serviço' },
  { value: 'material', label: 'Só material' },
];

type EditableItem = {
  key: string;
  type: QuoteItemType;
  description: string;
  category: string;
  // Quantidade e unidade são só contexto - opcionais, nunca obrigatórias.
  quantity: string;
  unit: string;
  // Valor TOTAL do item (não é preço por unidade).
  totalPriceReais: string;
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

function itemFromResult(item: AiInterpretationResult['items'][number], key: string): EditableItem {
  return {
    key,
    type: item.type,
    description: item.description,
    category: item.category ?? '',
    quantity: item.quantity !== null ? String(item.quantity) : '',
    unit: item.unit ?? '',
    totalPriceReais: centsToReaisInput(item.total_price_cents),
    confidence: item.confidence,
  };
}

// RF-049: nunca deixa um valor digitado negativo estragar o cálculo -
// contribui 0 pro total, mas o campo continua marcado com erro (ver
// hasNegativeValue no ItemCard).
function safeItemCents(raw: string): number | null {
  const cents = parseReaisInputToCents(raw);
  if (cents === null) return null;
  return cents < 0 ? 0 : cents;
}

export default function QuoteEditorScreen() {
  const theme = useTheme();
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();
  const keyCounter = useRef(0);
  const nextKey = () => `item-${keyCounter.current++}`;

  const [loading, setLoading] = useState(true);
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
  const [warnings, setWarnings] = useState<string[]>([]);
  const [discountKind, setDiscountKind] = useState<DiscountKind>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [organization, setOrganization] = useState<CurrentOrganization | null>(null);
  const [pdfMode, setPdfMode] = useState<PdfGenerationMode>('completo');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

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
    setWarnings(result.warnings);
  }

  useEffect(() => {
    if (!quoteId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        getCurrentOrganization()
          .then((org) => {
            if (!cancelled) setOrganization(org);
          })
          .catch(() => {
            // Falha ao buscar dados do prestador não deve travar o editor -
            // só desabilita a geração do PDF até resolver.
          });

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

  // RF-049: percentual fora de 0-100 (ou texto inválido) não vira desconto -
  // fica sem aplicar até o usuário corrigir, em vez de quebrar o cálculo.
  const discount: Discount | null = useMemo(() => {
    if (discountKind === 'fixed') {
      const cents = parseReaisInputToCents(discountValue);
      return cents !== null && cents >= 0 ? { type: 'fixed', value_cents: cents } : null;
    }
    if (discountKind === 'percentage') {
      const percent = Number(discountValue.trim().replace(',', '.'));
      return Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? { type: 'percentage', value_percent: percent }
        : null;
    }
    return null;
  }, [discountKind, discountValue]);

  const discountHasInvalidInput = discountKind !== 'none' && discountValue.trim() !== '' && discount === null;

  // Cada item já guarda o valor TOTAL dele - a soma não multiplica por
  // quantidade (ver docs/ARCHITECTURE.md §4).
  const totals = useMemo(() => {
    const calculableItems = items.map((item) => ({
      type: item.type,
      total_price_cents: safeItemCents(item.totalPriceReais),
    }));
    return calculateQuoteTotals(calculableItems, discount);
  }, [items, discount]);

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
        totalPriceReais: '',
        confidence: null,
      },
    ]);
  }

  function toPdfItems(): PdfItem[] {
    return items.map((item) => ({
      type: item.type,
      description: item.description,
      category: item.category || null,
      quantity: item.quantity || null,
      unit: item.unit || null,
      total_price_cents: safeItemCents(item.totalPriceReais),
    }));
  }

  function buildHtmlFor(mode: 'completo' | 'service' | 'material'): string | null {
    if (!organization) return null;
    return buildQuoteHtml({
      mode,
      organization,
      customer: {
        name: customer.name || null,
        phone: customer.phone || null,
        address: customer.address || null,
      },
      items: toPdfItems(),
      discount,
      commercialTerms: {
        paymentTerms: commercialTerms.paymentTerms || null,
        estimatedDurationDays: commercialTerms.estimatedDurationDays
          ? Number(commercialTerms.estimatedDurationDays)
          : null,
        validityDays: commercialTerms.validityDays ? Number(commercialTerms.validityDays) : null,
      },
      issuedAt: new Date(),
    });
  }

  async function handleGeneratePress() {
    if (!organization) {
      Alert.alert('Aguarde', 'Ainda carregando os dados do prestador.');
      return;
    }
    setGeneratingPdf(true);
    try {
      if (pdfMode === 'separado') {
        const serviceHtml = buildHtmlFor('service');
        const materialHtml = buildHtmlFor('material');
        if (serviceHtml) await shareQuotePdf(serviceHtml);
        if (materialHtml) await shareQuotePdf(materialHtml);
        return;
      }
      const html = buildHtmlFor(pdfMode);
      if (html) setPreviewHtml(html);
    } catch (error) {
      Alert.alert(
        'Não foi possível gerar o PDF',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleShareFromPreview() {
    if (!previewHtml) return;
    setGeneratingPdf(true);
    try {
      await shareQuotePdf(previewHtml);
    } catch (error) {
      Alert.alert(
        'Não foi possível compartilhar',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setGeneratingPdf(false);
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
            Confira o que a IA entendeu e corrija o que precisar.
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
            />
            <LabeledInput
              label="Endereço"
              value={customer.address}
              onChangeText={(address) => setCustomer((c) => ({ ...c, address }))}
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
            />
            <LabeledInput
              label="Prazo estimado (dias)"
              value={commercialTerms.estimatedDurationDays}
              onChangeText={(estimatedDurationDays) =>
                setCommercialTerms((c) => ({ ...c, estimatedDurationDays }))
              }
              keyboardType="numeric"
            />
            <LabeledInput
              label="Validade (dias)"
              value={commercialTerms.validityDays}
              onChangeText={(validityDays) => setCommercialTerms((c) => ({ ...c, validityDays }))}
              keyboardType="numeric"
            />
          </ThemedView>

          <DiscountCard
            kind={discountKind}
            value={discountValue}
            onKindChange={(kind) => {
              setDiscountKind(kind);
              if (kind === 'none') setDiscountValue('');
            }}
            onValueChange={setDiscountValue}
            hasInvalidInput={discountHasInvalidInput}
          />

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Resumo</ThemedText>
            {(Object.entries(totals.subtotalByType) as [QuoteItemType, number][])
              .filter(([, cents], _index, all) => cents > 0 && all.filter(([, c]) => c > 0).length > 1)
              .map(([type, cents]) => (
                <SummaryRow key={type} label={SUBTOTAL_TYPE_LABELS[type]} value={formatCentsAsBRL(cents)} />
              ))}
            <SummaryRow label="Subtotal" value={formatCentsAsBRL(totals.subtotalCents)} />
            {totals.discountCents > 0 && (
              <SummaryRow label="Desconto" value={`- ${formatCentsAsBRL(totals.discountCents)}`} />
            )}
            <ThemedText type="smallBold">Total: {formatCentsAsBRL(totals.totalCents)}</ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Gerar orçamento</ThemedText>
            <View style={styles.typeToggle}>
              {PDF_MODE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setPdfMode(option.value)}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor: pdfMode === option.value ? theme.text : 'transparent',
                      borderColor: theme.textSecondary,
                    },
                  ]}>
                  <ThemedText
                    type="small"
                    style={{ color: pdfMode === option.value ? theme.background : theme.textSecondary }}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={generatingPdf || !organization}
              onPress={handleGeneratePress}
              style={({ pressed }) => [
                styles.generateButton,
                { backgroundColor: theme.text },
                pressed && styles.pressed,
              ]}>
              {generatingPdf ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {pdfMode === 'separado' ? 'Gerar e compartilhar (2 PDFs)' : 'Ver prévia do PDF'}
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={previewHtml !== null}
        animationType="slide"
        onRequestClose={() => setPreviewHtml(null)}>
        <SafeAreaView style={styles.previewContainer}>
          {previewHtml && <PdfPreview html={previewHtml} />}
          <View style={styles.previewActions}>
            <Pressable
              onPress={() => setPreviewHtml(null)}
              style={[styles.previewSecondaryButton, { borderColor: theme.text }]}>
              <ThemedText type="smallBold">Fechar</ThemedText>
            </Pressable>
            <Pressable
              disabled={generatingPdf}
              onPress={handleShareFromPreview}
              style={[styles.previewPrimaryButton, { backgroundColor: theme.text }]}>
              {generatingPdf ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Compartilhar PDF
                </ThemedText>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </ThemedView>
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
  const parsedValueCents = parseReaisInputToCents(item.totalPriceReais);
  const hasNegativeValue = parsedValueCents !== null && parsedValueCents < 0;

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
                {ITEM_TYPE_LABELS[type]}
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
          />
        </View>
        <View style={styles.itemNumberField}>
          <LabeledInput
            label="Unidade"
            value={item.unit}
            onChangeText={(unit) => onChange(item.key, { unit })}
          />
        </View>
        <View style={styles.itemNumberField}>
          <LabeledInput
            label="Valor (R$)"
            value={item.totalPriceReais}
            onChangeText={(totalPriceReais) => onChange(item.key, { totalPriceReais })}
            keyboardType="numeric"
            uncertain={!item.totalPriceReais}
            error={hasNegativeValue ? 'Valor não pode ser negativo.' : undefined}
          />
        </View>
      </View>
    </ThemedView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

function DiscountCard({
  kind,
  value,
  onKindChange,
  onValueChange,
  hasInvalidInput,
}: {
  kind: DiscountKind;
  value: string;
  onKindChange: (kind: DiscountKind) => void;
  onValueChange: (value: string) => void;
  hasInvalidInput: boolean;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Desconto</ThemedText>
      <View style={styles.typeToggle}>
        {DISCOUNT_KIND_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onKindChange(option.value)}
            style={[
              styles.typeOption,
              {
                backgroundColor: kind === option.value ? theme.text : 'transparent',
                borderColor: theme.textSecondary,
              },
            ]}>
            <ThemedText
              type="small"
              style={{ color: kind === option.value ? theme.background : theme.textSecondary }}>
              {option.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      {kind !== 'none' && (
        <LabeledInput
          label={kind === 'fixed' ? 'Valor do desconto (R$)' : 'Desconto (%)'}
          value={value}
          onChangeText={onValueChange}
          keyboardType="numeric"
          error={
            hasInvalidInput
              ? kind === 'percentage'
                ? 'Percentual precisa estar entre 0 e 100.'
                : 'Valor inválido.'
              : undefined
          }
        />
      )}
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  generateButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
  previewContainer: {
    flex: 1,
  },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  previewSecondaryButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  previewPrimaryButton: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
