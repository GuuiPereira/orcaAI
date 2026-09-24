import { MAX_AUDIO_SECONDS, MAX_IMAGES } from '@orcaai/shared';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import {
  ExtractionUserError,
  extractTextFromAudio,
  extractTextFromImages,
  reduceImage,
  type ExtractionKind,
  type ExtractionResult,
} from '@/lib/input-extraction';
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

export type ExtractedInput = {
  kind: ExtractionKind;
  result: ExtractionResult;
  // Miniaturas (só imagem): ficam no aparelho pra comparar com o texto.
  thumbnails: string[];
};

type Props = {
  disabled?: boolean;
  onExtracted: (input: ExtractedInput) => void;
};

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Fase 4A: as duas formas novas de entrada (falar e fotografar/enviar imagem).
// Só produzem TEXTO, entregue ao pai via onExtracted - quem revisa é o usuário.
export function InputExtractionBar({ disabled, onExtracted }: Props) {
  const paperTheme = usePaperTheme();
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const recorderState = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'reading'>('idle');
  const [readingLabel, setReadingLabel] = useState('');
  const startedAt = useRef(0);
  const finishing = useRef(false);

  const seconds = recorderState.durationMillis / 1000;

  // Corta sozinho no limite (o servidor recusa acima de 2 min).
  useEffect(() => {
    if (phase === 'recording' && seconds >= MAX_AUDIO_SECONDS) {
      void finishRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds]);

  function showFailure(error: unknown, area: string) {
    if (error instanceof ExtractionUserError) {
      Alert.alert('Não deu para ler', error.message);
      return;
    }
    reportError(error, area);
    Alert.alert(
      'Não foi possível ler agora',
      'Verifique sua conexão e tente de novo - ou digite o texto do orçamento.',
    );
  }

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
      setPhase('recording');
    } catch (error) {
      reportError(error, 'audio-record');
      setPhase('idle');
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
    setPhase('idle');
  }

  async function finishRecording() {
    let recording: { uri: string; durationMs: number } | null;
    try {
      recording = await stopRecorder();
    } catch (error) {
      reportError(error, 'audio-record');
      setPhase('idle');
      Alert.alert('Não foi possível gravar', 'Tente de novo - ou digite o texto do orçamento.');
      return;
    }
    if (!recording) return;

    setReadingLabel('Transcrevendo o áudio…');
    setPhase('reading');
    try {
      const result = await extractTextFromAudio(recording);
      onExtracted({ kind: 'audio', result, thumbnails: [] });
    } catch (error) {
      showFailure(error, 'audio-extract');
    } finally {
      setPhase('idle');
    }
  }

  async function readImages(assets: ImagePicker.ImagePickerAsset[]) {
    if (assets.length === 0) return;
    setReadingLabel('Lendo a imagem…');
    setPhase('reading');
    try {
      const uris = [];
      for (const asset of assets.slice(0, MAX_IMAGES)) {
        uris.push(await reduceImage({ uri: asset.uri, width: asset.width, height: asset.height }));
      }
      const result = await extractTextFromImages(uris);
      onExtracted({ kind: 'image', result, thumbnails: uris });
    } catch (error) {
      showFailure(error, 'image-extract');
    } finally {
      setPhase('idle');
    }
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
    if (!picked.canceled) await readImages(picked.assets);
  }

  async function pickFromGallery() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES,
      quality: 1,
    });
    if (!picked.canceled) await readImages(picked.assets);
  }

  if (phase === 'recording') {
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

  if (phase === 'reading') {
    return (
      <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
        {readingLabel}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <Button mode="outlined" icon="microphone" onPress={() => void startRecording()} disabled={disabled}>
        Falar
      </Button>
      {Platform.OS !== 'web' && (
        <Button mode="outlined" icon="camera" onPress={() => void takePhoto()} disabled={disabled}>
          Foto
        </Button>
      )}
      <Button mode="outlined" icon="image" onPress={() => void pickFromGallery()} disabled={disabled}>
        Imagem
      </Button>
    </View>
  );
}

export function ExtractionThumbnails({ uris }: { uris: string[] }) {
  return (
    <View style={styles.row}>
      {uris.map((uri) => (
        <Image key={uri} source={{ uri }} style={styles.thumbnail} contentFit="cover" />
      ))}
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
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
});
