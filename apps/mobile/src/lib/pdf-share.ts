import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// `fileName` é o nome sem extensão (ver buildQuotePdfFileName em
// @orcaai/shared). O expo-print gera o arquivo com um nome aleatório na pasta
// de cache e o expo-sharing usa esse nome como está - por isso o PDF é
// renomeado antes de compartilhar, senão chegaria pro cliente como algo tipo
// "1a2b3c4d-....pdf".
export async function shareQuotePdf(html: string, fileName: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Este dispositivo não tem um menu de compartilhamento nativo.');
  }

  const printed = new File(uri);
  await printed.move(new File(Paths.cache, `${fileName}.pdf`), { overwrite: true });

  await Sharing.shareAsync(printed.uri, { mimeType: 'application/pdf', dialogTitle: 'Orçamento' });
}
