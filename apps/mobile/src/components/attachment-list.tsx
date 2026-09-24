import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Card, IconButton, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import type { Attachment } from '@/lib/input-extraction';

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function AudioRow({
  attachment,
  disabled,
  onRemove,
}: {
  attachment: Extract<Attachment, { kind: 'audio' }>;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const paperTheme = usePaperTheme();
  const player = useAudioPlayer({ uri: attachment.uri });
  const status = useAudioPlayerStatus(player);

  function togglePlay() {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
        void player.seekTo(0);
      }
      player.play();
    }
  }

  return (
    <Card mode="outlined">
      <Card.Content style={styles.row}>
        <IconButton
          icon={status.playing ? 'pause' : 'play'}
          mode="contained-tonal"
          accessibilityLabel={status.playing ? 'Pausar áudio' : 'Ouvir áudio'}
          onPress={togglePlay}
        />
        <View style={styles.rowText}>
          <Text variant="bodyLarge">Áudio gravado</Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
            {formatClock(attachment.durationMs / 1000)}
          </Text>
        </View>
        <IconButton icon="delete-outline" accessibilityLabel="Excluir áudio" disabled={disabled} onPress={onRemove} />
      </Card.Content>
    </Card>
  );
}

function ImageRow({
  attachment,
  index,
  disabled,
  onPreview,
  onRemove,
}: {
  attachment: Extract<Attachment, { kind: 'image' }>;
  index: number;
  disabled?: boolean;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const paperTheme = usePaperTheme();
  return (
    <Card mode="outlined">
      <Card.Content style={styles.row}>
        <Pressable onPress={onPreview} accessibilityLabel={`Ver imagem ${index + 1}`}>
          <Image source={{ uri: attachment.uri }} style={styles.thumbnail} contentFit="cover" />
        </Pressable>
        <View style={styles.rowText}>
          <Text variant="bodyLarge">Imagem {index + 1}</Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
            Toque na miniatura para ver
          </Text>
        </View>
        <IconButton icon="delete-outline" accessibilityLabel={`Excluir imagem ${index + 1}`} disabled={disabled} onPress={onRemove} />
      </Card.Content>
    </Card>
  );
}

// Lista dos anexos que ainda estão só no aparelho (nada foi enviado): dá pra
// ouvir o áudio, ver a imagem em tela cheia e excluir antes do "Continuar".
export function AttachmentList({
  attachments,
  disabled,
  onRemove,
}: {
  attachments: Attachment[];
  disabled?: boolean;
  onRemove: (id: string) => void;
}) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  return (
    <>
      {attachments.map((attachment, position) => {
        if (attachment.kind === 'audio') {
          return (
            <AudioRow
              key={attachment.id}
              attachment={attachment}
              disabled={disabled}
              onRemove={() => onRemove(attachment.id)}
            />
          );
        }
        const imageIndex = attachments.slice(0, position).filter((item) => item.kind === 'image').length;
        return (
          <ImageRow
            key={attachment.id}
            attachment={attachment}
            index={imageIndex}
            disabled={disabled}
            onPreview={() => setPreviewUri(attachment.uri)}
            onRemove={() => onRemove(attachment.id)}
          />
        );
      })}

      <Modal visible={previewUri !== null} animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <SafeAreaView style={styles.previewContainer}>
          <Appbar.Header>
            <Appbar.BackAction onPress={() => setPreviewUri(null)} />
            <Appbar.Content title="Imagem anexada" />
          </Appbar.Header>
          {previewUri && <Image source={{ uri: previewUri }} style={styles.previewImage} contentFit="contain" />}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    flex: 1,
    margin: Spacing.three,
  },
});
