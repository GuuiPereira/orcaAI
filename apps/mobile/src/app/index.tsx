import { useMemo } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, WebTopBarInset } from '@/constants/theme';
import { useQuoteDraft } from '@/hooks/use-quote-draft';
import { useTheme } from '@/hooks/use-theme';

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
  const theme = useTheme();
  const { sourceText, setSourceText, status } = useQuoteDraft();

  const canContinue = useMemo(() => sourceText.trim().length > 0, [sourceText]);
  const statusLabel = draftStatusLabel(status);

  function handleContinue() {
    // A função de interpretação por IA (interpret-quote) ainda não está conectada.
    Alert.alert('Em breve', 'A interpretação por IA será conectada na próxima etapa.');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Novo orçamento
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Descreva o serviço como você já costuma escrever ou ditar. Depois você revisa e
            confirma cada detalhe antes de gerar o orçamento.
          </ThemedText>
        </ThemedView>

        <TextInput
          value={sourceText}
          onChangeText={setSourceText}
          placeholder="Ex.: Pintura da casa da dona Maria, duas demãos nas paredes da sala e dos 3 quartos. Material por conta dela. Mão de obra 2800, metade na entrada..."
          placeholderTextColor={theme.textSecondary}
          multiline
          textAlignVertical="top"
          style={[
            styles.textInput,
            { color: theme.text, backgroundColor: theme.backgroundElement },
          ]}
        />

        <ThemedView style={styles.footer}>
          {statusLabel && (
            <ThemedText type="small" themeColor="textSecondary">
              {statusLabel}
            </ThemedText>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={!canContinue}
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.continueButton,
              { backgroundColor: canContinue ? theme.text : theme.backgroundSelected },
              pressed && canContinue && styles.pressed,
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: canContinue ? theme.background : theme.textSecondary }}>
              Continuar
            </ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
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
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  textInput: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 160,
  },
  footer: {
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  continueButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
