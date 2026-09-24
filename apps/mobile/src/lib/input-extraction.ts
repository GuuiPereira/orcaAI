import { MAX_AUDIO_SECONDS, MAX_IMAGES } from '@orcaai/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { appendFilePart } from './form-file';
import { supabase } from './supabase';

// Fase 4A: áudio e imagem só produzem TEXTO (a function `extract-input`
// transcreve/lê e devolve; nada é guardado). O usuário revisa o texto antes
// de "Continuar" - ver components/input-extraction-bar.tsx.

// Foto de celular passa fácil de 5 MB e o custo de visão cresce com o
// tamanho: reduz pro lado maior de ~1600 px em JPEG antes de enviar (o teto do
// servidor é 4 MB por imagem).
const MAX_IMAGE_SIDE = 1600;
const IMAGE_JPEG_QUALITY = 0.8;

export type ExtractionKind = 'audio' | 'image';

export type ExtractionResult = { text: string; units: number; truncated: boolean };

// Erros esperados (o usuário resolve sozinho) - não vão pro Sentry.
export class ExtractionUserError extends Error {}

export type PickedImage = { uri: string; width: number; height: number };

async function errorFromResponse(error: unknown, kind: ExtractionKind): Promise<Error> {
  const context = error && typeof error === 'object' ? (error as { context?: Response }).context : undefined;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { code?: string };
      if (body.code === 'too_long') {
        return new ExtractionUserError(
          `O áudio passou de ${MAX_AUDIO_SECONDS / 60} minutos. Grave um mais curto ou digite o texto.`,
        );
      }
      if (body.code === 'daily_limit') {
        return new ExtractionUserError(
          'Você chegou ao limite de leituras de hoje. Digite o texto ou tente de novo amanhã.',
        );
      }
      if (body.code === 'no_text') {
        return new ExtractionUserError(
          kind === 'audio'
            ? 'Não consegui ouvir fala nesse áudio. Grave de novo, mais perto do microfone, ou digite o texto.'
            : 'Não encontrei texto legível na imagem. Tente uma foto mais nítida e bem enquadrada, ou digite o texto.',
        );
      }
    } catch {
      // resposta não era JSON - cai pro erro genérico abaixo.
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function callExtractInput(form: FormData, kind: ExtractionKind): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke('extract-input', { body: form });
  if (error) throw await errorFromResponse(error, kind);
  return data as ExtractionResult;
}

export async function extractTextFromAudio(recording: {
  uri: string;
  durationMs: number;
}): Promise<ExtractionResult> {
  // A extensão/MIME só precisam bater com o formato que o gravador gera: m4a
  // (AAC) no nativo, webm no navegador.
  const isWeb = Platform.OS === 'web';
  const form = new FormData();
  form.append('kind', 'audio');
  form.append('duration_ms', String(Math.round(recording.durationMs)));
  await appendFilePart(form, 'file', {
    uri: recording.uri,
    name: isWeb ? 'audio.webm' : 'audio.m4a',
    type: isWeb ? 'audio/webm' : 'audio/mp4',
  });
  return callExtractInput(form, 'audio');
}

export async function reduceImage(image: PickedImage): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);
  if (Math.max(image.width, image.height) > MAX_IMAGE_SIDE) {
    context.resize(image.width >= image.height ? { width: MAX_IMAGE_SIDE } : { height: MAX_IMAGE_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: IMAGE_JPEG_QUALITY });
  return saved.uri;
}

// `uris` já reduzidas (reduceImage), na ordem em que o texto deve aparecer.
export async function extractTextFromImages(uris: string[]): Promise<ExtractionResult> {
  const form = new FormData();
  form.append('kind', 'image');
  for (const [index, uri] of uris.slice(0, MAX_IMAGES).entries()) {
    await appendFilePart(form, 'file', { uri, name: `imagem-${index + 1}.jpg`, type: 'image/jpeg' });
  }
  return callExtractInput(form, 'image');
}
