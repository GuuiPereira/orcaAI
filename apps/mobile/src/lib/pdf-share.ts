import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function shareQuotePdf(html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Este dispositivo não tem um menu de compartilhamento nativo.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Orçamento' });
}
