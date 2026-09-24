import { MAX_AUDIO_SECONDS, MAX_IMAGES } from '@orcaai/shared';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { canAddAttachment, newAttachmentId, type Attachment } from '@/lib/input-extraction';
import { reportError } from '@/lib/monitoring';

// Fala: mono e taxa baixa bastam (e o arquivo fica pequeno - 2 min de AAC mono
// 16 kHz é bem menos que o teto de 8 MB do servidor). No navegador o
// MediaRecorder ignora isso e grava webm.
const SPEECH_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  sampleRate: 16000,
  bitRate: 32000,
};

type Props = {
  attachments: Attachment[];
  disabled?: boolean;
  onAdd: (attachments: Attachment[]) => void;
};

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Fase 4A: gravar ou escolher imagem só ANEXA (lista abaixo, com ouvir/ver/
// excluir). Nada é enviado aqui - a leitura acontece no "Continuar".
export function AttachmentBar({ attachments, disabled, onAdd }: Props) {
  const paperTheme = usePaperTheme();
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const recorderState = useAudioRecorderState(recorder);
  const [recording, setRecording] = useState(false);
  const startedAt = useRef(0);
  const finishing = useRef(false);

  const seconds = recorderState.durationMillis / 1000;
  const canAddAudio = canAddAttachment(attachments, 'audio');
  const canAddImage = canAddAttachment(attachments, 'image');

  // Corta sozinho no limite (o servidor recusa acima de 2 min).
  useEffect(() => {
    if (recording && seconds >= MAX_AUDIO_SECONDS) {
      void finishRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, seconds]);

  async function startRecording() {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Microfone bloqueado',
          'Permita o uso do microfone nas configurações do aparelho para gravar, ou digite o texto.',
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      finishing.current = false;
      setRecording(true);
    } catch (error) {
      reportError(error, 'audio-record');
      setRecording(false);
      Alert.alert('Não foi possível gravar', 'Tente de novo - ou digite o texto do orçamento.');
    }
  }

  async function stopRecorder(): Promise<{ uri: string; durationMs: number } | null> {
    if (finishing.current) return null;
    finishing.current = true;
    const durationMs = Date.now() - startedAt.current;
    try {
      await recorder.stop();
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
    return recorder.uri ? { uri: recorder.uri, durationMs } : null;
  }

  async function cancelRecording() {
    try {
      await stopRecorder();
    } catch (error) {
      reportError(error, 'audio-record');
    }
    setRecording(false);
  }

  async function finishRecording() {
    try {
      const result = await stopRecorder();
      if (result) {
        onAdd([{ id: newAttachmentId(), kind: 'audio', uri: result.uri, durationMs: result.durationMs }]);
      }
    } catch (error) {
      reportError(error, 'audio-record');
      Alert.alert('Não foi possível gravar', 'Tente de novo - ou digite o texto do orçamento.');
    } finally {
      setRecording(false);
    }
  }

  function addImages(assets: ImagePicker.ImagePickerAsset[]) {
    const room = MAX_IMAGES - attachments.filter((attachment) => attachment.kind === 'image').length;
    onAdd(
      assets.slice(0, Math.max(room, 0)).map((asset) => ({
        id: newAttachmentId(),
        kind: 'image' as const,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      })),
    );
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Câmera bloqueada',
        'Permita o uso da câmera nas configurações do aparelho, ou escolha uma imagem da galeria.',
      );
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!picked.canceled) addImages(picked.assets);
  }

  async function pickFromGallery() {
    const room = MAX_IMAGES - attachments.filter((attachment) => attachment.kind === 'image').length;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(room, 1),
      quality: 1,
    });
    if (!picked.canceled) addImages(picked.assets);
  }

  if (recording) {
    return (
      <View style={styles.row}>
        <View style={[styles.recordingBadge, { backgroundColor: paperTheme.colors.errorContainer }]}>
          <View style={[styles.dot, { backgroundColor: paperTheme.colors.error }]} />
          <Text variant="labelLarge" style={{ color: paperTheme.colors.onErrorContainer }}>
            Gravando {formatClock(seconds)} / {formatClock(MAX_AUDIO_SECONDS)}
          </Text>
        </View>
        <Button mode="contained" icon="stop" onPress={() => void finishRecording()}>
          Parar
        </Button>
        <Button mode="text" onPress={() => void cancelRecording()}>
          Cancelar
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Button
        mode="outlined"
        icon="microphone"
        onPress={() => void startRecording()}
        disabled={disabled || !canAddAudio}>
        Falar
      </Button>
      {Platform.OS !== 'web' && (
        <Button
          mode="outlined"
          icon="camera"
          onPress={() => void takePhoto()}
          disabled={disabled || !canAddImage}>
          Foto
        </Button>
      )}
      <Button
        mode="outlined"
        icon="image"
        onPress={() => void pickFromGallery()}
        disabled={disabled || !canAddImage}>
        Imagem
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
