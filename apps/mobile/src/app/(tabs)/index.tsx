import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';
import { findValueMentions } from '@orcaai/shared';

import { CustomerPickerModal } from '@/components/customer-picker-modal';
import { AttachmentBar } from '@/components/attachment-bar';
import { AttachmentList } from '@/components/attachment-list';
import { Image } from 'expo-image';
import { BottomTabInset, MaxContentWidth, Spacing, WebTopBarInset } from '@/constants/theme';
import { useQuoteDraft } from '@/hooks/use-quote-draft';
import type { Customer } from '@/lib/customers';
import { ExtractionUserError, readAttachments, type Attachment, type ExtractionKind } from '@/lib/input-extraction';
import { createQuoteWithText, interpretQuote } from '@/lib/quotes';
import { reportError } from '@/lib/monitoring';

function reviewTitle(kinds: ExtractionKind[]) {
  if (kinds.includes('audio') && kinds.includes('image')) return 'Texto ouvido do áudio e lido das imagens';
  return kinds.includes('audio') ? 'Texto ouvido do áudio' : 'Texto lido da imagem';
}

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
  // Fase 4A: áudio/imagem viram ANEXOS (só no aparelho, nada enviado); a
  // leitura acontece no "Continuar" e o texto que sair precisa ser conferido
  // (RF-027) - enquanto houver uma leitura não confirmada, "Continuar" fica
  // travado.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [review, setReview] = useState<{
    kinds: ExtractionKind[];
    thumbnails: string[];
    truncated: boolean;
  } | null>(null);

  const canContinue = useMemo(
    () => (sourceText.trim().length > 0 || attachments.length > 0) && review === null,
    [sourceText, attachments, review],
  );
  const valueMentions = useMemo(() => (review ? findValueMentions(sourceText) : []), [review, sourceText]);
  const busy = isSubmitting || isReading;
  const statusLabel = isReading
    ? 'Lendo os anexos…'
    : isSubmitting
      ? 'Interpretando…'
      : draftStatusLabel(status);

  async function handleReadAttachments() {
    setIsReading(true);
    try {
      const { pieces, failures } = await readAttachments(attachments);

      if (pieces.length > 0) {
        const extracted = pieces.map((piece) => piece.text).join('\n\n');
        setSourceText(sourceText.trim().length > 0 ? `${sourceText.trimEnd()}\n\n${extracted}` : extracted);
        const readIds = new Set(pieces.flatMap((piece) => piece.ids));
        setAttachments((current) => current.filter((attachment) => !readIds.has(attachment.id)));
        setReview({
          kinds: pieces.map((piece) => piece.kind),
          thumbnails: pieces.flatMap((piece) => piece.thumbnails),
          truncated: pieces.some((piece) => piece.truncated),
        });
      }

      for (const failure of failures) {
        if (failure.error instanceof ExtractionUserError) {
          Alert.alert('Não deu para ler', failure.error.message);
        } else {
          reportError(failure.error, failure.kind === 'audio' ? 'audio-extract' : 'image-extract');
          Alert.alert(
            'Não foi possível ler agora',
            'Verifique sua conexão e tente de novo - ou exclua o anexo e digite o texto do orçamento.',
          );
        }
      }
    } finally {
      setIsReading(false);
    }
  }

  async function handleContinue() {
    if (attachments.length > 0) {
      await handleReadAttachments();
      return;
    }
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

          <AttachmentBar
            attachments={attachments}
            disabled={busy}
            onAdd={(added) => setAttachments((current) => [...current, ...added])}
          />
          <AttachmentList
            attachments={attachments}
            disabled={busy}
            onRemove={(id) => setAttachments((current) => current.filter((attachment) => attachment.id !== id))}
          />

          {review && (
            <Card mode="outlined">
              <Card.Content style={styles.reviewContent}>
                <Text variant="titleSmall">{reviewTitle(review.kinds)} - confira antes de continuar</Text>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                  {review.kinds.includes('audio') ? 'Palavras podem ser ouvidas errado. ' : ''}
                  {review.kinds.includes('image') ? 'Letras e números podem ser lidos errado. ' : ''}
                  Confira principalmente valores, quantidades e prazos, e corrija no campo abaixo.
                  {review.truncated ? ' O texto era grande e foi cortado.' : ''}
                </Text>
                {review.thumbnails.length > 0 && (
                  <View style={styles.chips}>
                    {review.thumbnails.map((uri) => (
                      <Image key={uri} source={{ uri }} style={styles.thumbnail} contentFit="cover" />
                    ))}
                  </View>
                )}
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

            <Button mode="contained" onPress={handleContinue} loading={busy} disabled={!canContinue || busy}>
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
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
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
