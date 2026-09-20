import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';

import { CustomerPickerModal } from '@/components/customer-picker-modal';
import { BottomTabInset, MaxContentWidth, Spacing, WebTopBarInset } from '@/constants/theme';
import { useQuoteDraft } from '@/hooks/use-quote-draft';
import type { Customer } from '@/lib/customers';
import { createQuoteWithText, interpretQuote } from '@/lib/quotes';

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

  const canContinue = useMemo(() => sourceText.trim().length > 0, [sourceText]);
  const statusLabel = isSubmitting ? 'Interpretando…' : draftStatusLabel(status);

  async function handleContinue() {
    setIsSubmitting(true);
    try {
      const quote = await createQuoteWithText(sourceText.trim(), selectedCustomer?.id ?? null);
      const { result } = await interpretQuote(quote.id);
      clearDraft();
      setSelectedCustomer(null);
      router.push(
        result.questions.length > 0 ? `/quote/${quote.id}/questions` : `/quote/${quote.id}`,
      );
    } catch (error) {
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
    flex: 1,
    minHeight: 160,
  },
  footer: {
    gap: Spacing.two,
  },
});
