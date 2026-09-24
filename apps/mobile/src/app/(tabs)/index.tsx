import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';
import { findValueMentions } from '@orcaai/shared';

import { CustomerPickerModal } from '@/components/customer-picker-modal';
import {
  ExtractionThumbnails,
  InputExtractionBar,
  type ExtractedInput,
} from '@/components/input-extraction-bar';
import { BottomTabInset, MaxContentWidth, Spacing, WebTopBarInset } from '@/constants/theme';
import { useQuoteDraft } from '@/hooks/use-quote-draft';
import type { Customer } from '@/lib/customers';
import { createQuoteWithText, interpretQuote } from '@/lib/quotes';
import { reportError } from '@/lib/monitoring';

function draftStatusLabel(status: ReturnType<typeof useQuoteDraft>['status']) {
  switch (status) {
    case 'loading':
      return 'Carregando rascunho…';
    case 'saving':
      return 'Salvando…';
    case 'saved':
      return 'Rascunho salvo neste aparelho';
    case 'idle':
      return null;
  }
}

export default function NewQuoteScreen() {
  const paperTheme = usePaperTheme();
  const { sourceText, setSourceText, clearDraft, status } = useQuoteDraft();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  // Fase 4A: texto que veio de áudio/imagem precisa ser conferido (RF-027) -
  // enquanto houver uma leitura não confirmada, "Continuar" fica travado.
  const [review, setReview] = useState<ExtractedInput | null>(null);

  const canContinue = useMemo(
    () => sourceText.trim().length > 0 && review === null,
    [sourceText, review],
  );
  const valueMentions = useMemo(() => (review ? findValueMentions(sourceText) : []), [review, sourceText]);
  const statusLabel = isSubmitting ? 'Interpretando…' : draftStatusLabel(status);

  function handleExtracted(input: ExtractedInput) {
    // Junta ao que já foi digitado/lido (parágrafo novo), em vez de apagar.
    setSourceText(sourceText.trim().length > 0 ? `${sourceText.trimEnd()}\n\n${input.result.text}` : input.result.text);
    setReview(input);
  }

  async function handleContinue() {
    setIsSubmitting(true);
    try {
      const quote = await createQuoteWithText(sourceText.trim(), selectedCustomer?.id ?? null);
      const { result } = await interpretQuote(quote.id);
      clearDraft();
      setSelectedCustomer(null);
      setReview(null);
      router.push(
        result.questions.length > 0 ? `/quote/${quote.id}/questions` : `/quote/${quote.id}`,
      );
    } catch (error) {
      reportError(error, 'interpret-quote');
      Alert.alert(
        'Não foi possível interpretar o texto',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="headlineMedium">Novo orçamento</Text>
            <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
              Descreva o serviço como você já costuma escrever ou ditar. Depois você revisa e
              confirma cada detalhe antes de gerar o orçamento.
            </Text>
          </View>

          <Card mode="outlined" onPress={() => setPickerVisible(true)}>
            <Card.Content>
              <Text variant="labelMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                Cliente
              </Text>
              <Text variant="bodyLarge">
                {selectedCustomer ? selectedCustomer.name : 'Selecionar cliente (opcional)'}
              </Text>
            </Card.Content>
          </Card>

          <InputExtractionBar disabled={isSubmitting} onExtracted={handleExtracted} />

          {review && (
            <Card mode="outlined">
              <Card.Content style={styles.reviewContent}>
                <Text variant="titleSmall">
                  {review.kind === 'audio' ? 'Texto ouvido do áudio' : 'Texto lido da imagem'} - confira
                  antes de continuar
                </Text>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                  {review.kind === 'audio'
                    ? 'Palavras podem ser ouvidas errado. '
                    : 'Letras e números podem ser lidos errado. '}
                  Confira principalmente valores, quantidades e prazos, e corrija no campo abaixo.
                  {review.result.truncated ? ' O texto era grande e foi cortado.' : ''}
                </Text>
                {review.thumbnails.length > 0 && <ExtractionThumbnails uris={review.thumbnails} />}
                {valueMentions.length > 0 && (
                  <View style={styles.chips}>
                    {valueMentions.map((value) => (
                      <Chip key={value} compact>
                        {value}
                      </Chip>
                    ))}
                  </View>
                )}
                <Button mode="contained-tonal" onPress={() => setReview(null)}>
                  Conferi o texto
                </Button>
              </Card.Content>
            </Card>
          )}

          <TextInput
            mode="outlined"
            value={sourceText}
            onChangeText={setSourceText}
            placeholder="Ex.: Pintura da casa da dona Maria, duas demãos nas paredes da sala e dos 3 quartos. Material por conta dela. Mão de obra 2800, metade na entrada..."
            multiline
            style={styles.textInput}
          />

          <View style={styles.footer}>
            {statusLabel && (
              <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                {statusLabel}
              </Text>
            )}

            <Button mode="contained" onPress={handleContinue} loading={isSubmitting} disabled={!canContinue || isSubmitting}>
              Continuar
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>

      <CustomerPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(customer) => {
          setSelectedCustomer(customer);
          setPickerVisible(false);
        }}
        onClear={
          selectedCustomer
            ? () => {
                setSelectedCustomer(null);
                setPickerVisible(false);
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({
      web: WebTopBarInset + Spacing.three,
      default: Spacing.four,
    }),
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
  },
  textInput: {
    minHeight: 200,
  },
  reviewContent: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  footer: {
    gap: Spacing.two,
  },
});
