import { decode, encode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { setOrganizationLogoPath } from './organizations';
import { supabase } from './supabase';

const LOGO_BUCKET = 'logos';

function extensionFromMimeType(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

// RF-005: escolhe uma imagem da galeria e sobe pro bucket `logos` (privado -
// task 6, policies em supabase/migrations/20260920163601_storage_policies.sql).
// Sempre no mesmo caminho por organização (upsert), então trocar o logo
// nunca deixa arquivo órfão pra trás. Devolve null se o usuário cancelou a
// seleção.
export async function pickAndUploadOrganizationLogo(organizationId: string): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permissão de acesso às fotos negada.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    // No nativo precisamos do base64 pra converter em bytes (decode abaixo)
    // - no navegador o próprio asset já traz um `File`/`Blob` de verdade.
    base64: Platform.OS !== 'web',
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const contentType = asset.mimeType ?? 'image/jpeg';
  const path = `${organizationId}/logo.${extensionFromMimeType(asset.mimeType)}`;
  const body = Platform.OS === 'web' ? asset.file : decode(asset.base64 ?? '');
  if (!body) {
    throw new Error('Não foi possível ler a imagem selecionada.');
  }

  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  await setOrganizationLogoPath(organizationId, path);
  return path;
}

// URL assinada (bucket privado) pra exibir o logo - expira em 1h, gerada de
// novo a cada carregamento da tela em vez de guardada (mais simples do que
// lidar com expiração em cache).
export async function getOrganizationLogoUrl(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  const { data, error } = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(logoPath, 3600);
  if (error) return null;
  return data.signedUrl;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

// Logo embutido no PDF como data URI: o bucket é privado e o expo-print
// gera o arquivo localmente, então não dá pra depender de uma URL remota
// carregando a tempo (nem da expiração dela). Devolve null se não tiver
// logo ou se qualquer passo falhar - o PDF só sai sem a imagem, nunca quebra.
export async function getOrganizationLogoDataUri(logoPath: string | null): Promise<string | null> {
  const url = await getOrganizationLogoUrl(logoPath);
  if (!url || !logoPath) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const mimeType = MIME_BY_EXTENSION[logoPath.split('.').pop()?.toLowerCase() ?? ''];
    if (!mimeType) return null;
    return `data:${mimeType};base64,${encode(await response.arrayBuffer())}`;
  } catch {
    return null;
  }
}
