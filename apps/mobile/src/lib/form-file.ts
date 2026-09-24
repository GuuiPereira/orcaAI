import { File } from 'expo-file-system';

export type FilePart = { uri: string; name: string; type: string };

// No Expo SDK 57 o `fetch` global é o `expo/fetch`, que NÃO aceita o formato
// `{uri, name, type}` do React Native ("Unsupported FormDataPart
// implementation") - o envio falha no aparelho mesmo funcionando no navegador.
// O formato aceito é um objeto com `bytes()`: lê o arquivo aqui e entrega.
export async function appendFilePart(form: FormData, fieldName: string, part: FilePart): Promise<void> {
  const bytes = await new File(part.uri).bytes();
  form.append(fieldName, { name: part.name, type: part.type, bytes: async () => bytes } as unknown as Blob);
}
